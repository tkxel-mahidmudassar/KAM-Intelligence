/**
 * Master Orchestrator — single entry point for all agent work.
 *
 * Responsibilities:
 * 1. Route trigger events → appropriate agent chain
 * 2. Manage agent dependencies (sequential vs. parallel)
 * 3. Aggregate a unified steps[] trace across all agents
 * 4. Handle failures with one retry per agent
 * 5. AI override: lightweight Gemini call for borderline conditional decisions
 *
 * Routing table:
 *   score_computed        → ScoreActions → RecOrchestrator → OutcomeAnalyzer*
 *   playbook_uploaded     → PlaybookExtractor → RecOrchestrator (all accounts)
 *   recommendation_outcome→ FeedbackCapture → [OutcomeAnalyzer ‖ RuleQualityScorer*]
 *   daily_batch           → RecOrchestrator (all accts) → [RuleQualityScorer ‖ FallbackCrystallizer]
 *   pulse_refresh         → RecOrchestrator → OutcomeAnalyzer
 *   manual_full_refresh   → RecOrchestrator → RuleQualityScorer → FallbackCrystallizer
 *
 * * = AI override applies (Gemini decides whether to skip based on data availability)
 */

import { prisma } from "@/lib/prisma";
import { logAudit } from "@/lib/audit";
import { runScoreActionsAgent } from "./scoreActions";
import type { KpiScores } from "@/lib/scoring/triggers";
import { runRecommendationOrchestrator } from "./recommendationOrchestrator";
import { runPlaybookExtractorAgent } from "./playbookExtractor";
import type { ParsedChunk } from "@/lib/playbooks/parser";
import { expireRecommendationsAllAccounts } from "@/lib/scoring/expireRecommendations";
import { runSourceCheckerAgent } from "./sourceChecker";

// ─── Types ────────────────────────────────────────────────────────────────────

export type OrchestratorTrigger =
  | "score_computed"
  | "playbook_uploaded"
  | "recommendation_outcome"
  | "daily_batch"
  | "pulse_refresh"
  | "manual_full_refresh";

export interface OrchestratorContext {
  // Common
  accountId?: string;
  role?: string;

  // score_computed
  kpiScores?: KpiScores;
  newSignalTitles?: string[];

  // playbook_uploaded
  playbookId?: string;
  playbookTitle?: string;
  parsedChunks?: ParsedChunk[];

  // recommendation_outcome
  recommendationId?: string;
  feedbackType?: string;       // ACTIONED | DISMISSED | ACTION_COMPLETED | ACTION_DISMISSED
  dismissReason?: string;      // IRRELEVANT | ALREADY_DONE | WRONG_TIMING | OTHER
}

export interface AgentStep {
  name: string;
  input: string;
  output: string;
  latencyMs: number;
}

export interface RoutingDecision {
  predicate: string;
  inputs: Record<string, number | string>;
  result: "run" | "skipped";
}

export interface AgentRunResult {
  agentName: string;
  status: "completed" | "skipped" | "failed" | "retried";
  steps: AgentStep[];
  latencyMs: number;
  error?: string;
  /** Structured record of the skip/run decision for this agent — queryable in the run log. */
  routingDecision?: RoutingDecision;
}

export interface OrchestratorRun {
  runId: string;
  trigger: OrchestratorTrigger;
  context: OrchestratorContext;
  agentsRun: AgentRunResult[];
  totalLatencyMs: number;
  status: "completed" | "partial" | "failed";
  failureReason?: string;
}

// ─── Internal helpers ─────────────────────────────────────────────────────────

function makeRunId(): string {
  return `orch_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
}

/**
 * Run a single agent with 1 retry on failure.
 * Never throws — returns a failed AgentRunResult on unrecoverable error.
 */
async function runAgentSafe(
  agentName: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  fn: () => Promise<any>,
): Promise<AgentRunResult> {
  const start = Date.now();

  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const result = await fn();
      return {
        agentName,
        status: attempt === 0 ? "completed" : "retried",
        steps: result.steps ?? [],
        latencyMs: Date.now() - start,
      };
    } catch (err) {
      if (attempt === 1) {
        console.error(`[orchestrator] agent "${agentName}" failed after retry:`, err);
        return {
          agentName,
          status: "failed",
          steps: [],
          latencyMs: Date.now() - start,
          error: err instanceof Error ? err.message : String(err),
        };
      }
      // else: retry
      console.warn(`[orchestrator] agent "${agentName}" failed, retrying...`);
    }
  }

  // TypeScript exhaustiveness — never reached
  return { agentName, status: "failed", steps: [], latencyMs: Date.now() - start };
}

// ─── Deterministic routing helper ────────────────────────────────────────────

/**
 * Evaluates a boolean predicate and returns a structured routing decision.
 * Replaces the former aiShouldRun() — no LLM involvement.
 * Every skip/run decision is logged and attached to the AgentRunResult.
 *
 * @param label      - Agent name for logging
 * @param predicate  - Human-readable description of the rule being evaluated
 * @param inputs     - The actual values being compared (stored in the run log)
 * @param check      - The boolean predicate function
 */
function shouldRun(
  label: string,
  predicate: string,
  inputs: Record<string, number | string>,
  check: () => boolean,
): { run: boolean; decision: RoutingDecision } {
  const run = check();
  const decision: RoutingDecision = {
    predicate,
    inputs,
    result: run ? "run" : "skipped",
  };
  console.log(
    `[orchestrator] ${label}: ${run ? "RUN" : "SKIP"} — predicate="${predicate}" inputs=${JSON.stringify(inputs)}`
  );
  return { run, decision };
}

// ─── Lazy imports for Phase 5 agents (avoids circular deps at module load) ───

async function getFeedbackCapture() {
  const mod = await import("./feedbackCapture");
  return mod.runFeedbackCaptureAgent;
}
async function getOutcomeAnalyzer() {
  const mod = await import("./outcomeAnalyzer");
  return mod.runOutcomeAnalyzerAgent;
}
async function getRuleQualityScorer() {
  const mod = await import("./ruleQualityScorer");
  return mod.runRuleQualityScorerAgent;
}
async function getFallbackCrystallizer() {
  const mod = await import("./fallbackCrystallizer");
  return mod.runFallbackCrystallizerAgent;
}

// ─── Routing chains ───────────────────────────────────────────────────────────

async function chainScoreComputed(
  ctx: OrchestratorContext,
  runs: AgentRunResult[],
): Promise<void> {
  if (!ctx.accountId) return;

  // 1. Score Actions Agent
  const scoreActionsResult = await runAgentSafe("score-actions", async () => {
    const newSignals = ctx.newSignalTitles ?? [];
    const kpiScores: KpiScores = ctx.kpiScores ?? { csat: 0, relationship: 0, risk: 0, contractHealth: 0, projectHealth: 0, resourceHealth: 0, financial: 0, whitespace: 0 };
    return runScoreActionsAgent(ctx.accountId!, kpiScores, newSignals);
  });
  runs.push(scoreActionsResult);

  // 2. Recommendation Orchestrator (sequential after score actions)
  const recResult = await runAgentSafe("recommendation-orchestrator", () =>
    runRecommendationOrchestrator({ accountId: ctx.accountId!, triggeredBy: "score_change" })
  );
  runs.push(recResult);

  // 3. Outcome Analyzer — deterministic predicate: scoreCount >= 2 AND actionedCount >= 1
  const [scoreCount, actionedCount] = await Promise.all([
    prisma.kamScore.count({ where: { accountId: ctx.accountId } }),
    prisma.recommendationFeedback.count({
      where: { accountId: ctx.accountId, feedbackType: "ACTIONED" },
    }),
  ]);

  const { run: shouldRunOutcome, decision: outcomeDecision } = shouldRun(
    "outcome-analyzer",
    "scoreCount >= 2 AND actionedCount >= 1",
    { scoreCount, actionedCount },
    () => scoreCount >= 2 && actionedCount >= 1,
  );

  if (shouldRunOutcome) {
    const analyzeOutcome = await getOutcomeAnalyzer();
    const outcomeResult = await runAgentSafe("outcome-analyzer", () =>
      analyzeOutcome({ accountId: ctx.accountId! })
    );
    runs.push({ ...outcomeResult, routingDecision: outcomeDecision });
  } else {
    runs.push({
      agentName: "outcome-analyzer",
      status: "skipped",
      steps: [],
      latencyMs: 0,
      routingDecision: outcomeDecision,
    });
  }
}

async function chainPlaybookUploaded(
  ctx: OrchestratorContext,
  runs: AgentRunResult[],
): Promise<boolean> {
  if (!ctx.playbookId || !ctx.playbookTitle || !ctx.parsedChunks) return false;

  // 1. Playbook Extractor — FATAL if fails
  const extractResult = await runAgentSafe("playbook-extractor", () =>
    runPlaybookExtractorAgent(ctx.playbookId!, ctx.playbookTitle!, ctx.parsedChunks!)
  );
  runs.push(extractResult);
  if (extractResult.status === "failed") return false; // fatal

  // 2. Source Checker — validates extracted rules against source text (sequential after extractor)
  const sourceCheckResult = await runAgentSafe("source-checker", () =>
    runSourceCheckerAgent(ctx.playbookId!)
  );
  runs.push(sourceCheckResult);

  // 3. Fallback Crystallizer — runs before RecOrchestrator to catch any AI patterns that
  //    now overlap with the new playbook domain, preventing future duplication
  const crystallize = await getFallbackCrystallizer();
  const crystallizerResult = await runAgentSafe("fallback-crystallizer", () => crystallize());
  runs.push(crystallizerResult);

  // 4. Run Recommendation Orchestrator for ALL accounts (non-blocking per-account)
  const accounts = await prisma.account.findMany({ select: { id: true } });
  const recResults = await Promise.all(
    accounts.map((a) =>
      runAgentSafe(`recommendation-orchestrator:${a.id}`, () =>
        runRecommendationOrchestrator({ accountId: a.id, triggeredBy: "playbook_upload" })
      )
    )
  );
  runs.push({
    agentName: "recommendation-orchestrator (all accounts)",
    status: recResults.every((r) => r.status !== "failed") ? "completed" : "partial" as never,
    steps: [{ name: "batch", input: `${accounts.length} accounts`, output: `${recResults.filter((r) => r.status !== "failed").length} succeeded`, latencyMs: 0 }],
    latencyMs: recResults.reduce((s, r) => s + r.latencyMs, 0),
  });
  return true;
}

async function chainRecommendationOutcome(
  ctx: OrchestratorContext,
  runs: AgentRunResult[],
): Promise<void> {
  if (!ctx.recommendationId || !ctx.feedbackType) return;

  // 1. Feedback Capture (sequential — its output feeds downstream)
  const captureAgent = await getFeedbackCapture();
  const captureResult = await runAgentSafe("feedback-capture", () =>
    captureAgent({
      recommendationId: ctx.recommendationId!,
      feedbackType: ctx.feedbackType as "ACTIONED" | "DISMISSED" | "ACTION_COMPLETED" | "ACTION_DISMISSED",
      dismissReason: ctx.dismissReason as "IRRELEVANT" | "ALREADY_DONE" | "WRONG_TIMING" | "OTHER" | undefined,
      accountId: ctx.accountId,
    })
  );
  runs.push(captureResult);

  // 2a. Outcome Analyzer + 2b. Rule Quality Scorer — run in PARALLEL
  const [analyzeOutcome, scoreQuality] = await Promise.all([getOutcomeAnalyzer(), getRuleQualityScorer()]);

  // Deterministic predicate for Rule Quality Scorer: feedbackCount >= 5
  let playbookRuleId: string | null = null;
  let feedbackCount = 0;
  if (ctx.recommendationId) {
    const rec = await prisma.recommendation.findUnique({
      where: { id: ctx.recommendationId },
      select: { playbookRuleId: true },
    });
    playbookRuleId = rec?.playbookRuleId ?? null;
    if (playbookRuleId) {
      feedbackCount = await prisma.recommendationFeedback.count({ where: { playbookRuleId } });
    }
  }

  const { run: shouldRunQuality, decision: qualityDecision } = playbookRuleId
    ? shouldRun(
        "rule-quality-scorer",
        "feedbackCount >= 5",
        { feedbackCount, threshold: 5 },
        () => feedbackCount >= 5,
      )
    : {
        run: false,
        decision: {
          predicate: "playbookRuleId exists",
          inputs: { playbookRuleId: "null" },
          result: "skipped" as const,
        },
      };

  const [outcomeResult, qualityResult] = await Promise.all([
    ctx.accountId
      ? runAgentSafe("outcome-analyzer", () => analyzeOutcome({ accountId: ctx.accountId! }))
      : Promise.resolve({ agentName: "outcome-analyzer", status: "skipped" as const, steps: [], latencyMs: 0 }),
    shouldRunQuality && playbookRuleId
      ? runAgentSafe("rule-quality-scorer", () => scoreQuality({ playbookRuleId: playbookRuleId! }))
          .then(r => ({ ...r, routingDecision: qualityDecision }))
      : Promise.resolve({
          agentName: "rule-quality-scorer",
          status: "skipped" as const,
          steps: [],
          latencyMs: 0,
          routingDecision: qualityDecision,
        }),
  ]);

  runs.push(outcomeResult, qualityResult);
}

async function chainDailyBatch(runs: AgentRunResult[]): Promise<void> {
  // 0. Expire stale recommendations across all accounts (runs first, before new recs are generated)
  const expireStart = Date.now();
  const expireResult = await expireRecommendationsAllAccounts().catch((err) => {
    console.error("[daily-batch] expiry sweeper failed:", err);
    return { accountsChecked: 0, recommendationsExpired: 0, details: [] };
  });
  runs.push({
    agentName: "recommendation-expiry-sweeper",
    status: "completed",
    steps: [{
      name: "sweep",
      input: `${expireResult.accountsChecked} accounts`,
      output: `${expireResult.recommendationsExpired} recommendations expired`,
      latencyMs: Date.now() - expireStart,
    }],
    latencyMs: Date.now() - expireStart,
  });

  // 1. Recommendation Orchestrator for all accounts
  const accounts = await prisma.account.findMany({ select: { id: true } });
  const recStart = Date.now();
  await Promise.all(
    accounts.map((a) =>
      runAgentSafe(`recommendation-orchestrator:${a.id}`, () =>
        runRecommendationOrchestrator({ accountId: a.id, triggeredBy: "pulse_refresh" })
      )
    )
  );
  runs.push({ agentName: "recommendation-orchestrator (all accounts)", status: "completed", steps: [], latencyMs: Date.now() - recStart });

  // 2a + 2b. Rule Quality Scorer + Fallback Crystallizer in PARALLEL
  const [scoreQuality, crystalize] = await Promise.all([getRuleQualityScorer(), getFallbackCrystallizer()]);
  const rules = await prisma.playbookRule.findMany({
    where: { playbook: { status: "ACTIVE" } },
    select: { id: true },
  });

  const [qualityResults, crystallizerResult] = await Promise.all([
    Promise.all(rules.map((r) =>
      runAgentSafe(`rule-quality-scorer:${r.id}`, () => scoreQuality({ playbookRuleId: r.id }))
    )),
    runAgentSafe("fallback-crystallizer", () => crystalize()),
  ]);

  const qualityOk = qualityResults.filter((r) => r.status !== "failed").length;
  runs.push({
    agentName: "rule-quality-scorer (all rules)",
    status: qualityOk === rules.length ? "completed" : "partial" as never,
    steps: [{ name: "batch", input: `${rules.length} rules`, output: `${qualityOk} succeeded`, latencyMs: 0 }],
    latencyMs: qualityResults.reduce((s, r) => s + r.latencyMs, 0),
  });
  runs.push(crystallizerResult);
}

async function chainPulseRefresh(ctx: OrchestratorContext, runs: AgentRunResult[]): Promise<void> {
  const accounts = ctx.accountId
    ? [{ id: ctx.accountId }]
    : await prisma.account.findMany({ select: { id: true } });

  const recResults = await Promise.all(
    accounts.map((a) =>
      runAgentSafe(`recommendation-orchestrator:${a.id}`, () =>
        runRecommendationOrchestrator({ accountId: a.id, triggeredBy: "pulse_refresh" })
      )
    )
  );
  runs.push({
    agentName: "recommendation-orchestrator",
    status: recResults.every((r) => r.status !== "failed") ? "completed" : "partial" as never,
    steps: [],
    latencyMs: recResults.reduce((s, r) => s + r.latencyMs, 0),
  });

  if (ctx.accountId) {
    const analyzeOutcome = await getOutcomeAnalyzer();
    const outcomeResult = await runAgentSafe("outcome-analyzer", () =>
      analyzeOutcome({ accountId: ctx.accountId! })
    );
    runs.push(outcomeResult);
  }
}

async function chainManualFullRefresh(runs: AgentRunResult[]): Promise<void> {
  const accounts = await prisma.account.findMany({ select: { id: true } });

  // 1. Recommendation Orchestrator for all accounts
  const recStart = Date.now();
  await Promise.all(
    accounts.map((a) =>
      runRecommendationOrchestrator({ accountId: a.id, triggeredBy: "pulse_refresh" }).catch(() => null)
    )
  );
  runs.push({ agentName: "recommendation-orchestrator (all accounts)", status: "completed", steps: [], latencyMs: Date.now() - recStart });

  // 2. Rule Quality Scorer for all active rules
  const [scoreQuality, crystalize] = await Promise.all([getRuleQualityScorer(), getFallbackCrystallizer()]);
  const rules = await prisma.playbookRule.findMany({
    where: { playbook: { status: "ACTIVE" } },
    select: { id: true },
  });
  for (const rule of rules) {
    const r = await runAgentSafe(`rule-quality-scorer:${rule.id}`, () => scoreQuality({ playbookRuleId: rule.id }));
    runs.push(r);
  }

  // 3. Fallback Crystallizer
  const crystallizerResult = await runAgentSafe("fallback-crystallizer", () => crystalize());
  runs.push(crystallizerResult);
}

// ─── Main export ──────────────────────────────────────────────────────────────

export async function runMasterOrchestrator(
  trigger: OrchestratorTrigger,
  context: OrchestratorContext = {},
): Promise<OrchestratorRun> {
  const runId = makeRunId();
  const startMs = Date.now();
  const agentsRun: AgentRunResult[] = [];

  console.log(`[master-orchestrator] trigger="${trigger}" runId="${runId}"`);

  let status: OrchestratorRun["status"] = "completed";
  let failureReason: string | undefined;

  try {
    switch (trigger) {
      case "score_computed":
        await chainScoreComputed(context, agentsRun);
        break;

      case "playbook_uploaded": {
        const ok = await chainPlaybookUploaded(context, agentsRun);
        if (!ok) {
          status = "failed";
          failureReason = "Playbook extraction failed — cannot proceed";
        }
        break;
      }

      case "recommendation_outcome":
        await chainRecommendationOutcome(context, agentsRun);
        break;

      case "daily_batch":
        await chainDailyBatch(agentsRun);
        break;

      case "pulse_refresh":
        await chainPulseRefresh(context, agentsRun);
        break;

      case "manual_full_refresh":
        await chainManualFullRefresh(agentsRun);
        break;
    }

    const anyFailed = agentsRun.some((r) => r.status === "failed");
    if (anyFailed && status !== "failed") status = "partial";
  } catch (err) {
    status = "failed";
    failureReason = err instanceof Error ? err.message : String(err);
    console.error("[master-orchestrator] unexpected error:", err);
  }

  const run: OrchestratorRun = {
    runId,
    trigger,
    context: { ...context, parsedChunks: undefined }, // don't log raw chunks
    agentsRun,
    totalLatencyMs: Date.now() - startMs,
    status,
    failureReason,
  };

  // Persist run summary to ActivityLog (non-blocking)
  void logAudit({
    role: context.role ?? "KAM",
    accountId: context.accountId,
    action: "orchestrator.run",
    entity: "OrchestratorRun",
    entityId: runId,
    metadata: {
      trigger,
      status,
      totalLatencyMs: run.totalLatencyMs,
      agentCount: agentsRun.length,
      failedAgents: agentsRun.filter((r) => r.status === "failed").map((r) => r.agentName),
      failureReason,
    },
  });

  return run;
}

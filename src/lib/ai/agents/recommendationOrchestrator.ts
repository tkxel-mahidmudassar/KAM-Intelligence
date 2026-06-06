/**
 * Recommendation Orchestrator Agent.
 *
 * For a given account:
 * 1. Loads the account's latest KPI scores and signals.
 * 2. Fetches all active global PlaybookRules.
 * 3. Matches rules to the account's current state.
 * 4. Creates Recommendation records (PLAYBOOK source) for matched rules.
 * 5. Falls back to the configured AI provider (AI_FALLBACK source) when no playbook rules match.
 * 6. Creates pre-approved Action items for every recommendation.
 *
 * Triggered on: playbook upload, score change, daily AI Pulse refresh.
 */

import { complete } from "@/lib/ai";
import { prisma } from "@/lib/prisma";
import { logAudit } from "@/lib/audit";

export interface OrchestratorInput {
  accountId: string;
  triggeredBy: "playbook_upload" | "score_change" | "pulse_refresh";
}

export interface OrchestratorResult {
  accountId: string;
  playbookRecommendations: number;
  aiFallbackRecommendations: number;
  actionsCreated: number;
  steps: AgentStep[];
  totalLatencyMs: number;
}

export interface AgentStep {
  name: string;
  input: string;
  output: string;
  latencyMs: number;
}

interface AiFallbackRecommendation {
  title: string;
  summary: string;
  recommendedAction: string;
  priority: 1 | 2 | 3;
  category: string;
}

function lowestScoreCategory(score: Awaited<ReturnType<typeof prisma.kamScore.findFirst>>): string {
  if (!score) return "RELATIONSHIP";
  const dimensions = [
    { category: "CSAT", value: score.csat },
    { category: "RELATIONSHIP", value: score.relationship },
    { category: "RISK", value: score.risk },
    { category: "CONTRACT", value: score.contractHealth },
    { category: "PROJECT", value: score.projectHealth },
    { category: "RESOURCE", value: score.resourceHealth },
    { category: "FINANCIAL", value: score.financial },
    { category: "WHITESPACE", value: score.whitespace },
  ].filter((item): item is { category: string; value: number } => typeof item.value === "number");
  return dimensions.sort((a, b) => a.value - b.value)[0]?.category ?? "RELATIONSHIP";
}

function deterministicFallbackRecommendations(
  account: { name: string; health: string; industry: string | null },
  latestScore: Awaited<ReturnType<typeof prisma.kamScore.findFirst>>,
  openSignals: { title: string; severity: string }[]
): AiFallbackRecommendation[] {
  const lowestCategory = lowestScoreCategory(latestScore);
  const overall = latestScore?.overall ?? 50;
  const signal = openSignals[0];

  if (signal) {
    return [
      {
        title: `Triage ${signal.severity.toLowerCase()} news for ${account.name}`,
        summary: `${account.name} has active ${signal.severity.toLowerCase()} news that should be validated against the current score and account plan.`,
        recommendedAction: `Confirm the owner, customer-facing next step, and dated resolution path for: ${signal.title}`,
        priority: signal.severity === "CRITICAL" ? 1 : 2,
        category: "RISK",
      },
      {
        title: `Update ${account.name} control plan`,
        summary: `Use the latest KAM score (${overall}/100) to refresh the next account control checkpoint.`,
        recommendedAction: `Review the weakest KPI area (${lowestCategory}), confirm whether it needs action, and document the next customer touchpoint.`,
        priority: 2,
        category: lowestCategory,
      },
    ];
  }

  if (account.health === "HEALTHY" && overall >= 70) {
    return [
      {
        title: `Protect the ${account.name} champion motion`,
        summary: `${account.name} is healthy, so the recommended task is to preserve momentum instead of waiting for risk to appear.`,
        recommendedAction: "Confirm executive sponsor cadence, document the current success story, and identify the next stakeholder who can expand the relationship.",
        priority: 3,
        category: "RELATIONSHIP",
      },
      {
        title: `Convert ${account.name} whitespace into a dated next step`,
        summary: `The account is stable enough to turn whitespace analysis into a concrete growth action.`,
        recommendedAction: "Pick one expansion candidate, attach an owner, and schedule the next commercial validation step within the next two weeks.",
        priority: 2,
        category: "WHITESPACE",
      },
    ];
  }

  return [
    {
      title: `Stabilize ${account.name}'s weakest KPI`,
      summary: `${account.name}'s lowest score dimension is ${lowestCategory}; this should drive the next account action.`,
      recommendedAction: `Create a corrective task for ${lowestCategory}, assign an owner, and set a client-facing checkpoint.`,
      priority: overall < 45 ? 1 : 2,
      category: lowestCategory,
    },
    {
      title: `Refresh ${account.name} account plan`,
      summary: "No active playbook rule matched, so use a basic KAM control-plan fallback.",
      recommendedAction: "Review score movement, open actions, stakeholder coverage, and renewal posture; then record the next dated action.",
      priority: 2,
      category: "RELATIONSHIP",
    },
  ];
}

export async function runRecommendationOrchestrator(
  input: OrchestratorInput
): Promise<OrchestratorResult> {
  const start = Date.now();
  const steps: AgentStep[] = [];
  let playbookCount = 0;
  let aiFallbackCount = 0;
  let actionsCreated = 0;

  // ── 1. Load account context ───────────────────────────────────────────────
  const ctxStart = Date.now();
  const [account, latestScore, openSignals, activePlaybookRules, exclusions] = await Promise.all([
    prisma.account.findUnique({
      where: { id: input.accountId },
      include: { contacts: true },
    }),
    prisma.kamScore.findFirst({
      where: { accountId: input.accountId },
      orderBy: { createdAt: "desc" },
    }),
    prisma.signal.findMany({
      where: { accountId: input.accountId, resolvedAt: null },
      orderBy: { detectedAt: "desc" },
      take: 10,
    }),
    prisma.playbookRule.findMany({
      where: { playbook: { status: "ACTIVE" } },
      include: { playbook: { select: { title: true, id: true } } },
      // qualityNote, dismissCount, actionCount are scalar fields — auto-included
    }),
    // Load per-account playbook exclusions
    prisma.accountPlaybookExclusion.findMany({
      where: { accountId: input.accountId },
      select: { playbookId: true },
    }),
  ]);

  // Filter out rules belonging to excluded playbooks OR explicitly suppressed for this account
  const excludedPlaybookIds = new Set(exclusions.map((e) => e.playbookId));

  // Load active per-account rule suppressions
  const ruleSuppressionsRaw = await prisma.accountRuleSuppression.findMany({
    where: { accountId: input.accountId, liftedAt: null },
    select: { playbookRuleId: true },
  });
  const suppressedRuleIds = new Set(ruleSuppressionsRaw.map((s) => s.playbookRuleId));

  // Also filter out globally LOW_QUALITY flagged rules (with enough data)
  const lowQualityRuleIds = new Set(
    activePlaybookRules
      .filter((r) => {
        const note = r.qualityNote as { flag?: string } | null;
        const totalFeedback = (r.dismissCount ?? 0) + (r.actionCount ?? 0);
        return note?.flag === "LOW_QUALITY" && totalFeedback >= 5;
      })
      .map((r) => r.id)
  );

  const eligibleRules = activePlaybookRules.filter(
    (r) =>
      !excludedPlaybookIds.has(r.playbookId) &&
      !suppressedRuleIds.has(r.id) &&
      !lowQualityRuleIds.has(r.id)
  );

  steps.push({
    name: "load-context",
    input: `accountId: ${input.accountId}`,
    output: `score: ${latestScore?.overall ?? "none"}, signals: ${openSignals.length}, rules: ${activePlaybookRules.length} (${excludedPlaybookIds.size} playbooks excluded -> ${eligibleRules.length} eligible)`,
    latencyMs: Date.now() - ctxStart,
  });

  if (!account) throw new Error(`Account ${input.accountId} not found`);

  const scoreContext = latestScore
    ? `Overall: ${latestScore.overall}, CSAT: ${latestScore.csat ?? "?"}, Risk: ${latestScore.risk ?? "?"}, Contract: ${latestScore.contractHealth ?? "?"}`
    : "No score available";

  const signalContext = openSignals
    .map((s) => `${s.type} (${s.severity})`)
    .join(", ") || "none";

  // ── 2. Match playbook rules to account state ──────────────────────────────
  const matchStart = Date.now();

  // Use the configured AI provider to match rules against account context — fast, low temp
  let matchedRuleIds: string[] = [];
  let matchError: string | null = null;

  if (eligibleRules.length > 0) {
    const rulesText = eligibleRules
      .map((r) => `[RULE ${r.id}] Category: ${r.category} | Condition: ${r.condition}`)
      .join("\n");

    const matchPrompt = `You are a KAM intelligence system. Given an account's current state, identify which playbook rules apply.

Account: ${account.name}
Health: ${account.health}
Scores: ${scoreContext}
Open signals: ${signalContext}

Playbook rules to evaluate:
${rulesText}

Return a JSON array of rule IDs (strings) that match the account's current state. Only include rules whose condition is clearly met based on the account data. Return an empty array if none apply.`;

    try {
      const matchResponse = await complete({
        messages: [{ role: "user", content: matchPrompt }],
        task: "playbook-rule-matching",
        maxTokens: 512,
        jsonMode: true, // temperature enforced to 0.0 at provider level
        accountId: input.accountId,
      });
      const parsed = JSON.parse(matchResponse.content);
      matchedRuleIds = Array.isArray(parsed) ? parsed : (parsed.ruleIds ?? []);
    } catch (err) {
      matchError = err instanceof Error ? err.message : "LLM rule matching failed";
      matchedRuleIds = [];
    }
  }

  steps.push({
    name: "match-rules",
    input: `${eligibleRules.length} eligible rules`,
    output: matchError ? `0 matched; LLM unavailable, using fallback path` : `${matchedRuleIds.length} matched`,
    latencyMs: Date.now() - matchStart,
  });

  // ── 3. Create playbook-sourced recommendations ────────────────────────────
  const matchedRules = eligibleRules.filter((r) => matchedRuleIds.includes(r.id));

  for (const rule of matchedRules) {
    // Deduplicate: skip if an active recommendation already exists for this rule + account
    const existing = await prisma.recommendation.findFirst({
      where: {
        accountId: input.accountId,
        playbookRuleId: rule.id,
        status: "ACTIVE",
      },
    });
    if (existing) continue;

    const dueDate = new Date();
    dueDate.setDate(dueDate.getDate() + (rule.priority === 1 ? 3 : rule.priority === 2 ? 7 : 14));

    // Set expiresAt = 30 days from now (also expires early on KPI recovery >= 70)
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 30);

    const rec = await prisma.recommendation.create({
      data: {
        accountId:        input.accountId,
        sourceType:       "PLAYBOOK",
        playbookRuleId:   rule.id,
        title:            `${rule.category}: ${rule.recommendation.slice(0, 80)}`,
        summary:          rule.recommendation,
        recommendedAction: rule.correctiveMeasure ?? rule.recommendation,
        priority:         rule.priority,
        dueDate,
        status:           "ACTIVE",
        confidence:       0.9,
        // Expiry + score-version linkage
        category:         rule.category,
        expiresAt,
        triggeringScoreId: latestScore?.id ?? null,
      },
    });
    playbookCount++;

    // Create a pre-approved action (no approval badge needed)
    const actionExists = await prisma.action.findFirst({
      where: {
        accountId: input.accountId,
        title: rec.title,
        status: { in: ["OPEN", "IN_PROGRESS"] },
      },
    });

    if (!actionExists) {
      await prisma.action.create({
        data: {
          accountId: input.accountId,
          title: rec.title,
          description: rec.recommendedAction ?? rec.summary,
          status: "OPEN",
          priority: rule.priority === 1 ? "HIGH" : rule.priority === 2 ? "MEDIUM" : "LOW",
          dueDate,
          source: "PLAYBOOK" as const,
        },
      });
      actionsCreated++;
    }
  }

  // ── 4. AI fallback when no playbook rules matched ─────────────────────────
  if (matchedRules.length === 0) {
    const fbStart = Date.now();
    let fallbackError: string | null = null;

    const fallbackPrompt = `You are a KAM (Key Account Management) assistant. Generate 2-3 actionable recommendations for this account.

Account: ${account.name}
Industry: ${account.industry ?? "unknown"}
Health: ${account.health}
Scores: ${scoreContext}
Open signals: ${signalContext}

Return a JSON array of recommendations. Each item:
{
  "title": "short title",
  "summary": "1-2 sentence description",
  "recommendedAction": "specific action to take",
  "priority": 1|2|3,
  "category": "CSAT|RELATIONSHIP|RISK|CONTRACT|PROJECT|RESOURCE|FINANCIAL|WHITESPACE|RENEWAL|DELIVERY|GROWTH"
}`;

    let fallbackRecs: AiFallbackRecommendation[] = [];
    try {
      const fbResponse = await complete({
        messages: [{ role: "user", content: fallbackPrompt }],
        task: "recommendation-ai-fallback",
        temperature: 0.4, // explicit exception: generative AI fallback recommendations
        maxTokens: 1024,
        jsonMode: true,
        accountId: input.accountId,
      });
      const parsed = JSON.parse(fbResponse.content);
      fallbackRecs = Array.isArray(parsed) ? parsed : (parsed.recommendations ?? []);
    } catch (err) {
      fallbackError = err instanceof Error ? err.message : "LLM fallback generation failed";
      fallbackRecs = [];
    }

    if (fallbackRecs.length === 0) {
      fallbackRecs = deterministicFallbackRecommendations(account, latestScore, openSignals);
    }

    for (const rec of fallbackRecs) {
      const dueDate = new Date();
      dueDate.setDate(dueDate.getDate() + (rec.priority === 1 ? 3 : rec.priority === 2 ? 7 : 14));

      // Set expiresAt = 30 days from now
      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + 30);

      const existing = await prisma.recommendation.findFirst({
        where: {
          accountId: input.accountId,
          title: rec.title,
          status: "ACTIVE",
        },
      });
      if (existing) continue;

      const created = await prisma.recommendation.create({
        data: {
          accountId:        input.accountId,
          sourceType:       "AI_FALLBACK",
          title:            rec.title,
          summary:          rec.summary,
          recommendedAction: rec.recommendedAction,
          priority:         [1, 2, 3].includes(rec.priority) ? rec.priority : 2,
          dueDate,
          status:           "ACTIVE",
          confidence:       0.7,
          // Expiry + score-version linkage
          category:         rec.category ?? null,
          expiresAt,
          triggeringScoreId: latestScore?.id ?? null,
        },
      });
      aiFallbackCount++;

      // AI fallback actions also go into action board (as OPEN, standard flow)
      const actionExists = await prisma.action.findFirst({
        where: {
          accountId: input.accountId,
          title: created.title,
          status: { in: ["OPEN", "IN_PROGRESS"] },
        },
      });

      if (!actionExists) {
        await prisma.action.create({
          data: {
            accountId: input.accountId,
            title: created.title,
            description: created.recommendedAction ?? created.summary,
            status: "OPEN",
            priority: rec.priority === 1 ? "HIGH" : rec.priority === 2 ? "MEDIUM" : "LOW",
            dueDate,
            source: "AI_PROPOSED" as const,
          },
        });
        actionsCreated++;
      }
    }

    steps.push({
      name: "ai-fallback",
      input: fallbackError ? `no playbook rules matched; LLM unavailable` : `no playbook rules matched`,
      output: `${fallbackRecs.length} fallback recommendation(s)${fallbackError ? " from deterministic fallback" : ""}`,
      latencyMs: Date.now() - fbStart,
    });
  }

  // ── 5. Audit log ──────────────────────────────────────────────────────────
  logAudit({
    role: "KAM",
    accountId: input.accountId,
    action: "recommendations_generated",
    entity: "Recommendation",
    metadata: {
      triggeredBy: input.triggeredBy,
      playbookCount,
      aiFallbackCount,
      actionsCreated,
    },
  });

  return {
    accountId: input.accountId,
    playbookRecommendations: playbookCount,
    aiFallbackRecommendations: aiFallbackCount,
    actionsCreated,
    steps,
    totalLatencyMs: Date.now() - start,
  };
}

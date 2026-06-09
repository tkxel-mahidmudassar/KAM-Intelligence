/**
 * Rule Quality Scorer Agent
 *
 * Computes a quality score for a single PlaybookRule from its feedback history.
 * Minimum threshold: 5 feedback signals before scoring runs.
 * Flags rules with successRate < 20% as LOW_QUALITY (advisory only — does NOT disable).
 * Updates PlaybookRule.qualityScore + qualityNote.
 */

import { prisma } from "@/lib/prisma";
import { complete } from "@/lib/ai";
import type { AgentStep } from "./masterOrchestrator";

export interface RuleQualityScorerInput {
  playbookRuleId: string;
}

export interface RuleQualityScorerResult {
  playbookRuleId: string;
  qualityScore: number | null;
  successRate: number | null;
  flag: "LOW_QUALITY" | null;
  skipped: boolean;
  skipReason?: string;
  steps: AgentStep[];
  totalLatencyMs: number;
}

const MIN_FEEDBACK_THRESHOLD = 5;
const FULL_CONFIDENCE_AT    = 30;   // signal count at which confidence dampening reaches 1.0
const LOW_QUALITY_THRESHOLD = 40;   // quality score below this = LOW band (mirrors AT_RISK threshold)
const MED_QUALITY_THRESHOLD = 70;   // quality score below this = MEDIUM band

// Dismiss reason partial-credit weights (0 = total failure, 1 = full success)
const DISMISS_WEIGHTS: Record<string, number> = {
  IRRELEVANT:  0.0,
  WRONG_TIMING: 0.5,
  ALREADY_DONE: 0.4,
  OTHER:        0.2,
};

/**
 * Exponential time-decay weight — half-weight at 30 days.
 * k = ln(2) / 30 ≈ 0.0231
 */
function decayWeight(createdAt: Date): number {
  const daysAgo = (Date.now() - createdAt.getTime()) / 86_400_000;
  return Math.exp(-0.0231 * daysAgo);
}

/**
 * Score contribution for a single feedback signal (0.0–1.0 before decay).
 */
function signalScore(feedbackType: string, dismissReason: string | null): number {
  if (feedbackType === "ACTIONED" || feedbackType === "ACTION_COMPLETED") return 1.0;
  // Dismissed — use reason-specific partial credit
  return DISMISS_WEIGHTS[dismissReason ?? "OTHER"] ?? 0.2;
}

/**
 * Multi-dimensional quality score (0–100):
 *   1. Time-decayed weighted average of signal scores
 *   2. Confidence dampening toward 50 when signal count < FULL_CONFIDENCE_AT
 */
function computeQualityScore(feedbacks: { feedbackType: string; dismissReason: string | null; createdAt: Date }[]): {
  qualityScore: number;
  rawRate: number;
  confidence: number;
} {
  let weightedSum  = 0;
  let weightTotal  = 0;

  for (const fb of feedbacks) {
    const w = decayWeight(fb.createdAt);
    weightedSum  += signalScore(fb.feedbackType, fb.dismissReason) * w;
    weightTotal  += w;
  }

  const rawRate   = weightTotal > 0 ? weightedSum / weightTotal : 0; // 0.0–1.0
  const confidence = Math.min(feedbacks.length / FULL_CONFIDENCE_AT, 1.0);
  // Dampen toward 50 (neutral) when confidence is low
  const dampened  = rawRate * confidence + 0.5 * (1 - confidence);
  const qualityScore = Math.round(dampened * 100);

  return { qualityScore, rawRate, confidence };
}

export async function runRuleQualityScorerAgent(
  input: RuleQualityScorerInput
): Promise<RuleQualityScorerResult> {
  const start = Date.now();
  const steps: AgentStep[] = [];

  // ── 1. Load rule + feedback ───────────────────────────────────────────────
  const ctxStart = Date.now();
  const [rule, feedbacks] = await Promise.all([
    prisma.playbookRule.findUnique({
      where: { id: input.playbookRuleId },
      include: { playbook: { select: { title: true } } },
    }),
    prisma.recommendationFeedback.findMany({
      where: { playbookRuleId: input.playbookRuleId },
      select: { feedbackType: true, dismissReason: true, annotationText: true, createdAt: true },
      orderBy: { createdAt: "desc" },
      take: 50,
    }),
  ]);

  steps.push({
    name: "load-context",
    input: `playbookRuleId: ${input.playbookRuleId}`,
    output: `feedbacks: ${feedbacks.length}, rule: ${rule?.category ?? "not found"}`,
    latencyMs: Date.now() - ctxStart,
  });

  if (!rule) throw new Error(`PlaybookRule ${input.playbookRuleId} not found`);

  // ── 2. Threshold check ────────────────────────────────────────────────────
  if (feedbacks.length < MIN_FEEDBACK_THRESHOLD) {
    steps.push({ name: "threshold-check", input: `${feedbacks.length} signals`, output: `< ${MIN_FEEDBACK_THRESHOLD} — skipping`, latencyMs: 0 });
    return {
      playbookRuleId: input.playbookRuleId,
      qualityScore: null, successRate: null, flag: null,
      skipped: true, skipReason: "insufficient data",
      steps, totalLatencyMs: Date.now() - start,
    };
  }

  // ── 3. Multi-dimensional quality score ───────────────────────────────────
  // Formula: time-decayed weighted average of signal scores (ACTIONED=1.0,
  //   WRONG_TIMING=0.5, ALREADY_DONE=0.4, OTHER=0.2, IRRELEVANT=0.0),
  //   then confidence-dampened toward 50 for low signal counts.
  const actioned  = feedbacks.filter((f) => f.feedbackType === "ACTIONED" || f.feedbackType === "ACTION_COMPLETED").length;
  const dismissed = feedbacks.filter((f) => f.feedbackType === "DISMISSED" || f.feedbackType === "ACTION_DISMISSED").length;

  const { qualityScore, rawRate, confidence } = computeQualityScore(
    feedbacks.map((f) => ({ feedbackType: f.feedbackType, dismissReason: f.dismissReason, createdAt: f.createdAt }))
  );

  const qualityBand: "HIGH" | "MEDIUM" | "LOW" =
    qualityScore >= MED_QUALITY_THRESHOLD ? "HIGH" :
    qualityScore >= LOW_QUALITY_THRESHOLD ? "MEDIUM" : "LOW";

  const dismissReasonSummary = feedbacks
    .filter((f) => f.dismissReason)
    .reduce<Record<string, number>>((acc, f) => {
      acc[f.dismissReason!] = (acc[f.dismissReason!] ?? 0) + 1;
      return acc;
    }, {});

  steps.push({
    name: "compute-score",
    input: `${feedbacks.length} signals (confidence: ${(confidence * 100).toFixed(0)}%)`,
    output: `qualityScore: ${qualityScore}/100 (${qualityBand}) | rawRate: ${(rawRate * 100).toFixed(1)}% | actioned: ${actioned}, dismissed: ${dismissed}`,
    latencyMs: 0,
  });

  // ── 4. LLM quality assessment (generated for ALL scored rules) ────────────
  const llmStart = Date.now();
  const sampleAnnotations = feedbacks
    .filter((f) => f.annotationText)
    .slice(0, 5)
    .map((f) => `- ${f.dismissReason ?? f.feedbackType}: "${f.annotationText}"`)
    .join("\n");

  const prompt = `You are assessing the quality of a playbook rule used in Kamazing.

Rule details:
- Category: ${rule.category}
- Condition: "${rule.condition}"
- Recommendation: "${rule.recommendation}"
- Playbook: "${rule.playbook.title}"

Performance data (time-decay weighted):
- Quality score: ${qualityScore}/100 (${qualityBand} — HIGH >= 70, MEDIUM 40-69, LOW < 40)
- Total feedback signals: ${feedbacks.length} (confidence: ${(confidence * 100).toFixed(0)}% of full confidence)
- Actioned: ${actioned}, Dismissed: ${dismissed}
- Dismiss reasons: ${JSON.stringify(dismissReasonSummary)}

Sample KAM annotations:
${sampleAnnotations || "(none)"}

Respond with JSON:
{
  "summary": "1-2 sentence plain-English assessment of why this rule scores the way it does",
  "suggestions": ["specific improvement suggestion 1", "specific improvement suggestion 2"],
  "flag": "LOW_QUALITY" or null
}

Set flag to "LOW_QUALITY" only if the rule condition is genuinely poorly specified or systematically irrelevant to the accounts it fires on. Score alone is insufficient — consider the dismiss reasons.`;

  let qualityNote: { summary: string; suggestions: string[]; flag: string | null; analyzedAt: string; qualityBand: string } = {
    summary: `Quality score ${qualityScore}/100 (${qualityBand}) based on ${feedbacks.length} weighted feedback signals.`,
    suggestions: [],
    flag: qualityBand === "LOW" ? "LOW_QUALITY" : null,
    qualityBand,
    analyzedAt: new Date().toISOString(),
  };

  try {
    const res = await complete({
      messages: [{ role: "user", content: prompt }],
      task: "rule-quality-scoring",
      maxTokens: 512,
      jsonMode: true, // temperature enforced to 0.0 at provider level
    });

    const parsed = JSON.parse(res.content);
    qualityNote = {
      summary:      parsed.summary ?? qualityNote.summary,
      suggestions:  Array.isArray(parsed.suggestions) ? parsed.suggestions : [],
      flag:         parsed.flag ?? (qualityBand === "LOW" ? "LOW_QUALITY" : null),
      qualityBand,
      analyzedAt:   new Date().toISOString(),
    };

    steps.push({
      name: "llm-assessment",
      input: `qualityScore: ${qualityScore}, band: ${qualityBand}`,
      output: qualityNote.summary.slice(0, 120),
      latencyMs: Date.now() - llmStart,
    });
  } catch (err) {
    console.warn("[rule-quality-scorer] LLM assessment failed, using computed fallback:", err);
    steps.push({ name: "llm-assessment", input: "", output: "LLM failed — using computed fallback", latencyMs: Date.now() - llmStart });
  }

  // ── 5. Persist quality score ──────────────────────────────────────────────
  await prisma.playbookRule.update({
    where: { id: input.playbookRuleId },
    data: {
      qualityScore,
      dismissCount: dismissed,
      actionCount:  actioned,
      qualityNote,
    },
  });

  steps.push({
    name: "persist",
    input: `qualityScore: ${qualityScore} (${qualityBand}), flag: ${qualityNote.flag ?? "none"}`,
    output: "PlaybookRule updated",
    latencyMs: 0,
  });

  return {
    playbookRuleId: input.playbookRuleId,
    qualityScore,
    successRate: rawRate,
    flag: (qualityNote.flag as "LOW_QUALITY" | null) ?? null,
    skipped: false,
    steps,
    totalLatencyMs: Date.now() - start,
  };
}

/**
 * Outcome Analyzer Agent
 *
 * Analyzes health movement relative to recommendation outcomes over 30 days.
 * Framing is ALWAYS correlation-based — never causal.
 * Runs max once per account per 24 hours.
 * Output: AIPulseInsight of type TREND.
 */

import { prisma } from "@/lib/prisma";
import { complete } from "@/lib/ai";
import type { AgentStep } from "./masterOrchestrator";

export interface OutcomeAnalyzerInput {
  accountId: string;
}

export interface OutcomeAnalyzerResult {
  accountId: string;
  insightId: string | null;   // null if skipped
  skipped: boolean;
  skipReason?: string;
  steps: AgentStep[];
  totalLatencyMs: number;
}

const ATTRIBUTION_DAYS = 30;
const DEDUP_HOURS = 24;

export async function runOutcomeAnalyzerAgent(
  input: OutcomeAnalyzerInput
): Promise<OutcomeAnalyzerResult> {
  const start = Date.now();
  const steps: AgentStep[] = [];

  // ── 1. Deduplication check ────────────────────────────────────────────────
  const cutoffDedup = new Date(Date.now() - DEDUP_HOURS * 60 * 60 * 1000);
  const recentInsight = await prisma.aIPulseInsight.findFirst({
    where: {
      accountId: input.accountId,
      task: "outcome-analysis",
      generatedAt: { gte: cutoffDedup },
    },
  });
  if (recentInsight) {
    steps.push({ name: "dedup-check", input: `accountId: ${input.accountId}`, output: "run within last 24h — skipping", latencyMs: 0 });
    return { accountId: input.accountId, insightId: null, skipped: true, skipReason: "ran within 24h", steps, totalLatencyMs: Date.now() - start };
  }

  // ── 2. Load data ───────────────────────────────────────────────────────────
  const ctxStart = Date.now();
  const cutoffWindow = new Date(Date.now() - ATTRIBUTION_DAYS * 24 * 60 * 60 * 1000);

  const [account, scores, feedbacks] = await Promise.all([
    prisma.account.findUnique({ where: { id: input.accountId }, select: { id: true, name: true, health: true } }),
    prisma.kamScore.findMany({
      where: { accountId: input.accountId },
      orderBy: { createdAt: "desc" },
      take: 5,
      select: { overall: true, health: true, computedAt: true },
    }),
    prisma.recommendationFeedback.findMany({
      where: {
        accountId: input.accountId,
        createdAt: { gte: cutoffWindow },
        feedbackType: { in: ["ACTIONED", "DISMISSED"] },
      },
      include: {
        recommendation: { select: { title: true, summary: true, sourceType: true } },
        playbookRule: { select: { category: true } },
      },
    }),
  ]);

  steps.push({
    name: "load-context",
    input: `accountId: ${input.accountId}, window: ${ATTRIBUTION_DAYS} days`,
    output: `scores: ${scores.length}, feedbacks: ${feedbacks.length}`,
    latencyMs: Date.now() - ctxStart,
  });

  // ── 3. Skip conditions ────────────────────────────────────────────────────
  if (!account) throw new Error(`Account ${input.accountId} not found`);
  if (scores.length < 2) {
    steps.push({ name: "skip-check", input: "", output: "< 2 scores — skipping", latencyMs: 0 });
    return { accountId: input.accountId, insightId: null, skipped: true, skipReason: "insufficient scores", steps, totalLatencyMs: Date.now() - start };
  }
  if (feedbacks.length === 0) {
    steps.push({ name: "skip-check", input: "", output: "no feedback in window — skipping", latencyMs: 0 });
    return { accountId: input.accountId, insightId: null, skipped: true, skipReason: "no feedback in window", steps, totalLatencyMs: Date.now() - start };
  }

  // ── 4. Build context for LLM ──────────────────────────────────────────────
  const newest = scores[0];
  const oldest = scores[scores.length - 1];
  const healthDelta = newest.overall - oldest.overall;
  const direction = healthDelta > 5 ? "improving" : healthDelta < -5 ? "declining" : "stable";

  const actionedItems = feedbacks.filter((f) => f.feedbackType === "ACTIONED");
  const dismissedItems = feedbacks.filter((f) => f.feedbackType === "DISMISSED");

  const feedbackSummary = [
    ...actionedItems.map((f) => `ACTIONED: "${f.recommendation.title}" (${f.playbookRule?.category ?? f.recommendation.sourceType})`),
    ...dismissedItems.map((f) => `DISMISSED: "${f.recommendation.title}"`),
  ].join("\n");

  const scoreHistory = scores.map((s) => `${s.computedAt.toISOString().split("T")[0]}: ${s.overall.toFixed(1)} (${s.health})`).join(", ");

  // ── 5. LLM call ───────────────────────────────────────────────────────────
  const llmStart = Date.now();
  const prompt = `You are analyzing account health outcomes for Kamazing.

IMPORTANT: Do NOT claim causation. Use phrases like "may have contributed", "appears correlated with", "coincided with", "was observed alongside".

Account: ${account.name}
Health trend (last ${ATTRIBUTION_DAYS} days): ${direction} (${oldest.overall.toFixed(1)} -> ${newest.overall.toFixed(1)}, delta: ${healthDelta > 0 ? "+" : ""}${healthDelta.toFixed(1)})
Score history: ${scoreHistory}

Interventions in the last ${ATTRIBUTION_DAYS} days:
${feedbackSummary}

Write a 2-3 sentence outcome summary for the KAM. Focus on what interventions were taken and how health moved during this period. Be specific, factual, and use correlation language only.`;

  const llmRes = await complete({
    messages: [{ role: "user", content: prompt }],
    task: "outcome-analysis",
    temperature: 0.5, // prose narrative — analyst-like, consistent tone
    maxTokens: 300,
    accountId: input.accountId,
  });

  steps.push({
    name: "llm-analysis",
    input: `${feedbacks.length} feedback signals, health delta ${healthDelta.toFixed(1)}`,
    output: llmRes.content.slice(0, 150),
    latencyMs: Date.now() - llmStart,
  });

  // ── 6. Persist as AIPulseInsight ──────────────────────────────────────────
  const insight = await prisma.aIPulseInsight.create({
    data: {
      accountId: input.accountId,
      title: `Outcome Analysis: ${direction === "improving" ? "+" : ""}${healthDelta.toFixed(1)} pts over ${ATTRIBUTION_DAYS} days`,
      summary: llmRes.content,
      type: "TREND",
      task: "outcome-analysis",
      model: llmRes.model,
      latencyMs: llmRes.latencyMs,
      isDismissed: false,
    },
  });

  return {
    accountId: input.accountId,
    insightId: insight.id,
    skipped: false,
    steps,
    totalLatencyMs: Date.now() - start,
  };
}

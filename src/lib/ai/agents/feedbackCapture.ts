/**
 * Feedback Capture + Annotation Agent
 *
 * Step 1 (no LLM): Write RecommendationFeedback record; update PlaybookRule counts.
 * Step 2 (LLM, temp 0.1, DISMISSED only): Annotate with quality interpretation.
 * Step 3 (no LLM): If dismiss count >= 2 for this (account, rule), expose suppression
 *   opportunity in the UI — the KAM must explicitly request suppression (no auto-suppress).
 *
 * Fails gracefully: Step 1 always commits. LLM failure skips Step 2 silently.
 */

import { prisma } from "@/lib/prisma";
import { complete } from "@/lib/ai";
import type { AgentStep } from "./masterOrchestrator";

export interface FeedbackCaptureInput {
  recommendationId: string;
  feedbackType: "ACTIONED" | "DISMISSED" | "ACTION_COMPLETED" | "ACTION_DISMISSED";
  dismissReason?: "IRRELEVANT" | "ALREADY_DONE" | "WRONG_TIMING" | "OTHER";
  accountId?: string;
}

export interface FeedbackCaptureResult {
  feedbackId: string;
  playbookRuleId: string | null;
  annotated: boolean;
  dismissCountForRule: number;  // total dismissals for this rule on this account in last 60 days
  suppressionEligible: boolean; // true when >= 2 — surface "Don't show again" in UI
  steps: AgentStep[];
  totalLatencyMs: number;
}

export async function runFeedbackCaptureAgent(
  input: FeedbackCaptureInput
): Promise<FeedbackCaptureResult> {
  const start = Date.now();
  const steps: AgentStep[] = [];

  // ── 1. Load recommendation + latest health score (no LLM) ─────────────────
  const ctxStart = Date.now();
  const rec = await prisma.recommendation.findUnique({
    where: { id: input.recommendationId },
    include: {
      playbookRule: true,
      account: { include: { kamScores: { orderBy: { createdAt: "desc" }, take: 1 } } },
    },
  });

  if (!rec) throw new Error(`Recommendation ${input.recommendationId} not found`);

  const accountId = input.accountId ?? rec.accountId;
  const healthScore = rec.account.kamScores[0]?.overall ?? null;
  const playbookRuleId = rec.playbookRuleId ?? null;

  // Idempotency check — skip if same feedback already recorded
  const existing = await prisma.recommendationFeedback.findFirst({
    where: { recommendationId: input.recommendationId, feedbackType: input.feedbackType },
  });
  if (existing) {
    steps.push({
      name: "idempotency-check",
      input: `recommendationId: ${input.recommendationId}, type: ${input.feedbackType}`,
      output: "already recorded — skipping",
      latencyMs: Date.now() - ctxStart,
    });
    return {
      feedbackId: existing.id,
      playbookRuleId,
      annotated: false,
      dismissCountForRule: 0,
      suppressionEligible: false,
      steps,
      totalLatencyMs: Date.now() - start,
    };
  }

  steps.push({
    name: "load-context",
    input: `recommendationId: ${input.recommendationId}`,
    output: `rule: ${playbookRuleId ?? "none"}, healthScore: ${healthScore ?? "none"}`,
    latencyMs: Date.now() - ctxStart,
  });

  // ── 2. Write RecommendationFeedback record ────────────────────────────────
  const writeStart = Date.now();
  const feedback = await prisma.recommendationFeedback.create({
    data: {
      recommendationId: input.recommendationId,
      playbookRuleId,
      accountId,
      feedbackType: input.feedbackType,
      dismissReason: input.feedbackType === "DISMISSED" ? (input.dismissReason ?? undefined) : undefined,
      healthBefore: healthScore,
    },
  });

  // Update rule counts atomically
  if (playbookRuleId) {
    if (input.feedbackType === "ACTIONED" || input.feedbackType === "ACTION_COMPLETED") {
      await prisma.playbookRule.update({
        where: { id: playbookRuleId },
        data: { actionCount: { increment: 1 } },
      });
    } else if (input.feedbackType === "DISMISSED" || input.feedbackType === "ACTION_DISMISSED") {
      await prisma.playbookRule.update({
        where: { id: playbookRuleId },
        data: { dismissCount: { increment: 1 } },
      });
    }
  }

  steps.push({
    name: "write-feedback",
    input: `type: ${input.feedbackType}${input.dismissReason ? `, reason: ${input.dismissReason}` : ""}`,
    output: `feedbackId: ${feedback.id}`,
    latencyMs: Date.now() - writeStart,
  });

  // ── 3. LLM annotation (DISMISSED + PLAYBOOK-sourced only) ────────────────
  let annotated = false;
  if (input.feedbackType === "DISMISSED" && playbookRuleId && rec.playbookRule) {
    const llmStart = Date.now();
    try {
      const prompt = `You are evaluating playbook rule quality. A KAM dismissed the following recommendation.

Rule condition: "${rec.playbookRule.condition}"
Rule category: ${rec.playbookRule.category}
Recommendation text: "${rec.summary}"
Dismiss reason: ${input.dismissReason ?? "not provided"}

In 1-2 sentences, explain what this dismissal suggests about the rule's quality or specificity. Be concise and factual.`;

      const res = await complete({
        messages: [{ role: "user", content: prompt }],
        task: "feedback-annotation",
        temperature: 0.5, // prose annotation — factual, analytical
        maxTokens: 200,
        accountId,
      });

      await prisma.recommendationFeedback.update({
        where: { id: feedback.id },
        data: { annotationText: res.content, annotationModel: res.model },
      });
      annotated = true;

      steps.push({
        name: "llm-annotation",
        input: `rule: ${playbookRuleId}, reason: ${input.dismissReason ?? "none"}`,
        output: res.content.slice(0, 120),
        latencyMs: Date.now() - llmStart,
      });
    } catch (err) {
      // Fail gracefully — annotation skipped, feedback record is still valid
      console.warn("[feedback-capture] LLM annotation failed:", err);
      steps.push({
        name: "llm-annotation",
        input: "annotation attempted",
        output: "failed gracefully — skipped",
        latencyMs: Date.now() - llmStart,
      });
    }
  }

  // ── 4. Check suppression eligibility (no LLM) ────────────────────────────
  let dismissCountForRule = 0;
  let suppressionEligible = false;

  if (playbookRuleId && input.feedbackType === "DISMISSED") {
    const cutoff = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000); // 60 days
    dismissCountForRule = await prisma.recommendationFeedback.count({
      where: {
        accountId,
        playbookRuleId,
        feedbackType: "DISMISSED",
        createdAt: { gte: cutoff },
      },
    });
    suppressionEligible = dismissCountForRule >= 2;

    steps.push({
      name: "suppression-check",
      input: `accountId: ${accountId}, ruleId: ${playbookRuleId}`,
      output: `dismissCount (60d): ${dismissCountForRule}, suppressionEligible: ${suppressionEligible}`,
      latencyMs: 0,
    });
  }

  return {
    feedbackId: feedback.id,
    playbookRuleId,
    annotated,
    dismissCountForRule,
    suppressionEligible,
    steps,
    totalLatencyMs: Date.now() - start,
  };
}

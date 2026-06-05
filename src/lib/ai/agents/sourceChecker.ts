/**
 * Source Checker Agent
 *
 * After the Playbook Extractor creates rules, this agent cross-checks every rule
 * against the original source text it was pulled from. It asks:
 *   - Is this rule's condition actually stated or implied in the source? (Groundedness)
 *   - Does the recommendation match what the source advised? (Accuracy)
 *   - Is the assigned category correct for this content? (Category correctness)
 *
 * Output per rule:
 *   { confidence: 0.0–1.0, grounded: boolean, mismatch?: string, suggestedCategory?: string }
 *
 * Pass threshold: confidence >= 0.7  → rule stays ACTIVE
 * Fail / no source: confidence < 0.7 → rule moves to PENDING_REVIEW
 *
 * Temperature: 0.0 (enforced by provider — this is deterministic JSON classification)
 * Runs on: ALL extracted rules (including field-validation PENDING_REVIEW ones)
 * Called by: masterOrchestrator after playbookExtractor completes
 */

import { complete } from "@/lib/ai";
import { prisma } from "@/lib/prisma";
import type { AgentStep } from "./masterOrchestrator";

const CONFIDENCE_THRESHOLD = 0.7;
const VALID_CATEGORIES = [
  "CSAT", "RELATIONSHIP", "RISK", "CONTRACT", "PROJECT",
  "RESOURCE", "FINANCIAL", "WHITESPACE", "RENEWAL", "DELIVERY", "GROWTH",
];

export interface SourceCheckResult {
  ruleId: string;
  confidence: number;
  grounded: boolean;
  mismatch?: string;
  suggestedCategory?: string;
  outcome: "passed" | "failed" | "no_source";
}

export interface SourceCheckerResult {
  playbookId: string;
  rulesChecked: number;
  rulesPassed: number;
  rulesFailed: number;
  rulesNoSource: number;
  results: SourceCheckResult[];
  steps: AgentStep[];
  totalLatencyMs: number;
}

export async function runSourceCheckerAgent(
  playbookId: string,
): Promise<SourceCheckerResult> {
  const start = Date.now();
  const steps: AgentStep[] = [];

  // ── 1. Load all rules for this playbook ───────────────────────────────────
  const ctxStart = Date.now();
  const rules = await prisma.playbookRule.findMany({
    where: { playbookId },
    select: {
      id: true,
      category: true,
      condition: true,
      recommendation: true,
      sourceExcerpt: true,
      status: true,
    },
  });

  steps.push({
    name: "load-rules",
    input: `playbookId: ${playbookId}`,
    output: `${rules.length} rules loaded`,
    latencyMs: Date.now() - ctxStart,
  });

  if (rules.length === 0) {
    return {
      playbookId,
      rulesChecked: 0, rulesPassed: 0, rulesFailed: 0, rulesNoSource: 0,
      results: [], steps,
      totalLatencyMs: Date.now() - start,
    };
  }

  const results: SourceCheckResult[] = [];
  let passed = 0, failed = 0, noSource = 0;

  // ── 2. Check each rule ────────────────────────────────────────────────────
  for (const rule of rules) {
    const ruleStart = Date.now();

    // No source excerpt → auto-fail to PENDING_REVIEW (unverifiable)
    if (!rule.sourceExcerpt || rule.sourceExcerpt.trim().length < 10) {
      results.push({
        ruleId: rule.id,
        confidence: 0,
        grounded: false,
        mismatch: "No source excerpt available — rule cannot be verified against source text",
        outcome: "no_source",
      });
      noSource++;

      // Move to PENDING_REVIEW if not already there
      if (rule.status !== "PENDING_REVIEW") {
        await prisma.playbookRule.update({
          where: { id: rule.id },
          data: {
            status: "PENDING_REVIEW",
            sourceConfidence: 0,
            sourceMismatch: "No source excerpt available — rule cannot be verified against source text",
            validationFailureReason: rule.status === "ACTIVE"
              ? "Source checker: no source excerpt to verify against"
              : undefined,
          },
        });
      } else {
        // Just update source confidence fields
        await prisma.playbookRule.update({
          where: { id: rule.id },
          data: { sourceConfidence: 0, sourceMismatch: "No source excerpt available" },
        });
      }
      continue;
    }

    // ── LLM source check ─────────────────────────────────────────────────────
    const prompt = `You are verifying whether an extracted playbook rule is accurately grounded in its source text.

SOURCE TEXT (from the original document):
"""
${rule.sourceExcerpt.slice(0, 600)}
"""

EXTRACTED RULE:
- Category: ${rule.category}
- Condition: "${rule.condition}"
- Recommendation: "${rule.recommendation}"

Verify three things:
1. GROUNDEDNESS: Is the condition actually stated or implied in the source text?
2. ACCURACY: Does the recommendation match what the source actually advises?
3. CATEGORY: Is "${rule.category}" the correct KPI category for this content?
   Valid categories: CSAT, RELATIONSHIP, RISK, CONTRACT, PROJECT, RESOURCE, FINANCIAL, WHITESPACE, RENEWAL, DELIVERY, GROWTH

Respond with JSON only:
{
  "confidence": <0.0-1.0, overall confidence the rule is correctly extracted>,
  "grounded": <true if condition is supported by source, false if not>,
  "mismatch": "<brief description of what's wrong, or null if nothing is wrong>",
  "suggestedCategory": "<correct category if current one is wrong, or null if correct>"
}`;

    try {
      const res = await complete({
        messages: [{ role: "user", content: prompt }],
        task: "source-check",
        maxTokens: 256,
        jsonMode: true, // temperature enforced to 0.0 at provider level
      });

      const parsed = JSON.parse(res.content);
      const confidence: number = typeof parsed.confidence === "number"
        ? Math.max(0, Math.min(1, parsed.confidence))
        : 0.5;
      const grounded: boolean = parsed.grounded !== false;
      const mismatch: string | undefined = parsed.mismatch ?? undefined;
      const rawSuggested: string | undefined = typeof parsed.suggestedCategory === "string"
        ? parsed.suggestedCategory.toUpperCase()
        : undefined;
      const suggestedCategory = rawSuggested && VALID_CATEGORIES.includes(rawSuggested) && rawSuggested !== rule.category
        ? rawSuggested
        : undefined;

      const outcome: SourceCheckResult["outcome"] = confidence >= CONFIDENCE_THRESHOLD ? "passed" : "failed";

      results.push({ ruleId: rule.id, confidence, grounded, mismatch, suggestedCategory, outcome });

      // Persist source check fields
      const updateData: {
        sourceConfidence: number;
        sourceMismatch?: string;
        suggestedCategory?: string;
        status?: string;
        validationFailureReason?: string;
      } = {
        sourceConfidence: confidence,
        sourceMismatch:   mismatch ?? null as unknown as string,
        suggestedCategory: suggestedCategory ?? null as unknown as string,
      };

      // If confidence < threshold, move to PENDING_REVIEW (unless already there)
      if (outcome === "failed" && rule.status !== "PENDING_REVIEW") {
        updateData.status = "PENDING_REVIEW";
        updateData.validationFailureReason =
          `Source checker: confidence ${(confidence * 100).toFixed(0)}% < 70% threshold${mismatch ? ` — ${mismatch}` : ""}`;
      }
      // If confidence >= threshold and rule was only in PENDING_REVIEW because of source check
      // (not field validation), promote it to ACTIVE
      if (outcome === "passed" && rule.status === "PENDING_REVIEW") {
        // Only promote if the pending reason was from source check, not field validation
        const currentRule = await prisma.playbookRule.findUnique({
          where: { id: rule.id },
          select: { validationFailureReason: true },
        });
        const wasSourceCheckOnly = currentRule?.validationFailureReason?.startsWith("Source checker:");
        if (wasSourceCheckOnly) {
          updateData.status = "ACTIVE";
          updateData.validationFailureReason = null as unknown as string;
        }
      }

      await prisma.playbookRule.update({ where: { id: rule.id }, data: updateData });

      if (outcome === "passed") passed++; else failed++;

    } catch (err) {
      console.warn(`[source-checker] LLM check failed for rule ${rule.id}:`, err);
      // On LLM failure: don't change the rule's status — leave it as-is
      results.push({
        ruleId: rule.id,
        confidence: 0.5,
        grounded: true,
        mismatch: "Source check failed (LLM error) — rule left in current status",
        outcome: "failed",
      });
      failed++;
    }

    steps.push({
      name: `check:${rule.id.slice(0, 8)}`,
      input: `category: ${rule.category}, source: ${rule.sourceExcerpt?.slice(0, 40)}...`,
      output: `confidence: ${results.at(-1)?.confidence.toFixed(2)}, outcome: ${results.at(-1)?.outcome}`,
      latencyMs: Date.now() - ruleStart,
    });
  }

  steps.push({
    name: "summary",
    input: `${rules.length} rules`,
    output: `${passed} passed, ${failed} failed, ${noSource} no-source`,
    latencyMs: 0,
  });

  return {
    playbookId,
    rulesChecked: rules.length,
    rulesPassed: passed,
    rulesFailed: failed,
    rulesNoSource: noSource,
    results,
    steps,
    totalLatencyMs: Date.now() - start,
  };
}

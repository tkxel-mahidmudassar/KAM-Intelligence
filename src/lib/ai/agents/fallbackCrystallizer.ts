/**
 * Fallback Crystallizer Agent
 *
 * Scans AI_FALLBACK recommendations that have been ACTIONED across 3+ distinct accounts.
 * Groups them by CATEGORY + FIRST 4 MEANINGFUL TITLE WORDS (sub-cluster key).
 * This prevents semantically different patterns within the same category from being merged.
 *
 * For clusters with sourceCount >= 3:
 *   - Calls Gemini (temperature 0.3) to generalize a rule condition + title
 *   - LLM returns a confidence score (0.0-1.0); candidates < 0.5 are flagged as "weak pattern"
 *   - Creates RuleCandidate records for Manager review
 *
 * Runs on: daily_batch, manual_full_refresh, playbook_uploaded
 */

import { prisma } from "@/lib/prisma";
import { complete } from "@/lib/ai";
import type { AgentStep } from "./masterOrchestrator";

const SOURCE_COUNT_THRESHOLD = 3;
const WEAK_PATTERN_THRESHOLD = 0.5; // confidence below this → flagged as "weak pattern" in UI

// Stop words stripped when building the sub-cluster key from a title
const STOP_WORDS = new Set([
  "the", "a", "an", "is", "are", "of", "for", "to", "in", "with",
  "and", "or", "on", "at", "by", "as", "be", "was", "has", "have",
]);

export interface FallbackCrystallizerResult {
  candidatesCreated: number;
  candidatesSkipped: number;
  steps: AgentStep[];
  totalLatencyMs: number;
}

interface RecCluster {
  category: string;
  clusterKey: string; // "CATEGORY::first-four-meaningful-words"
  accounts: string[];
  samples: { title: string; summary: string; recommendedAction: string }[];
}

/**
 * Extracts up to 4 meaningful words from a title (after the "CATEGORY: " prefix).
 * Used to build a finer-grained cluster key within a category.
 */
function extractSubClusterWords(title: string): string {
  // Strip category prefix (e.g., "RISK: ")
  const withoutPrefix = title.replace(/^[A-Z_]+:\s*/, "").toLowerCase();
  const words = withoutPrefix
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 2 && !STOP_WORDS.has(w));
  return words.slice(0, 4).join("-");
}

export async function runFallbackCrystallizerAgent(): Promise<FallbackCrystallizerResult> {
  const start = Date.now();
  const steps: AgentStep[] = [];
  let candidatesCreated = 0;
  let candidatesSkipped = 0;

  // ── 1. Load all AI_FALLBACK ACTIONED feedback ─────────────────────────────
  const ctxStart = Date.now();
  const actionedFeedbacks = await prisma.recommendationFeedback.findMany({
    where: {
      feedbackType: { in: ["ACTIONED", "ACTION_COMPLETED"] },
      playbookRuleId: null, // AI_FALLBACK only
    },
    include: {
      recommendation: {
        select: { title: true, summary: true, recommendedAction: true, accountId: true },
      },
    },
    orderBy: { createdAt: "desc" },
    take: 200,
  });

  steps.push({
    name: "load-actioned-fallbacks",
    input: "AI_FALLBACK feedbacks with ACTIONED outcome",
    output: `${actionedFeedbacks.length} records found`,
    latencyMs: Date.now() - ctxStart,
  });

  if (actionedFeedbacks.length === 0) {
    steps.push({ name: "skip", input: "", output: "no AI_FALLBACK actioned feedback — nothing to crystallize", latencyMs: 0 });
    return { candidatesCreated: 0, candidatesSkipped: 0, steps, totalLatencyMs: Date.now() - start };
  }

  // ── 2. Sub-cluster by CATEGORY + FIRST 4 MEANINGFUL TITLE WORDS ─────────────
  // This prevents "RISK: high ticket volume" and "RISK: executive disengagement"
  // from being merged into a single generic RISK cluster.
  const clusters: Record<string, RecCluster> = {};

  for (const fb of actionedFeedbacks) {
    const rec = fb.recommendation;
    if (!rec) continue;

    // Extract category from title prefix (format: "CATEGORY: short text")
    const categoryMatch = rec.title.match(/^([A-Z_]+):/);
    const category = categoryMatch ? categoryMatch[1] : "GENERAL";
    const accountId = rec.accountId;

    // Build sub-cluster key: "CATEGORY::meaningful-word1-word2-word3-word4"
    const subWords = extractSubClusterWords(rec.title);
    const clusterKey = subWords ? `${category}::${subWords}` : category;

    if (!clusters[clusterKey]) {
      clusters[clusterKey] = { category, clusterKey, accounts: [], samples: [] };
    }

    if (!clusters[clusterKey].accounts.includes(accountId)) {
      clusters[clusterKey].accounts.push(accountId);
    }
    if (clusters[clusterKey].samples.length < 5) {
      clusters[clusterKey].samples.push({
        title: rec.title,
        summary: rec.summary ?? "",
        recommendedAction: rec.recommendedAction ?? "",
      });
    }
  }

  const eligibleClusters = Object.values(clusters).filter(
    (c) => c.accounts.length >= SOURCE_COUNT_THRESHOLD
  );

  steps.push({
    name: "cluster-analysis",
    input: `${Object.keys(clusters).length} sub-clusters found (category + title words)`,
    output: `${eligibleClusters.length} clusters meet threshold (>= ${SOURCE_COUNT_THRESHOLD} accounts)`,
    latencyMs: 0,
  });

  // ── 3. Generate rule candidates for each eligible cluster ─────────────────
  for (const cluster of eligibleClusters) {
    // Deduplication: check by clusterKey (not just category) to avoid merging sub-clusters
    const existingCandidate = await prisma.ruleCandidate.findFirst({
      where: {
        OR: [
          { clusterKey: cluster.clusterKey, status: "PENDING" },
          // Fallback for old records without clusterKey
          ...(cluster.clusterKey === cluster.category
            ? [{ category: cluster.category, clusterKey: null, status: "PENDING" }]
            : []),
        ],
      },
    });
    if (existingCandidate) {
      // Update source count and clusterKey on the existing candidate
      await prisma.ruleCandidate.update({
        where: { id: existingCandidate.id },
        data: {
          sourceCount: cluster.accounts.length,
          accountIds: cluster.accounts,
          clusterKey: cluster.clusterKey,
        },
      });
      candidatesSkipped++;
      steps.push({
        name: `skip:${cluster.clusterKey}`,
        input: `existing candidate found`,
        output: `updated sourceCount to ${cluster.accounts.length}`,
        latencyMs: 0,
      });
      continue;
    }

    const llmStart = Date.now();
    const sampleText = cluster.samples.map((s, i) =>
      `Sample ${i + 1}:\n  Title: ${s.title}\n  Summary: ${s.summary}\n  Action: ${s.recommendedAction}`
    ).join("\n\n");

    const prompt = `You are generating a generalized playbook rule from observed AI recommendation patterns.

These AI-generated recommendations (category: ${cluster.category}) were actioned by KAMs across ${cluster.accounts.length} different accounts. They represent a specific pattern: "${cluster.clusterKey}".

${sampleText}

Generate a generalized playbook rule that captures this specific pattern. Return JSON:
{
  "title": "concise rule title (max 80 chars)",
  "condition": "when this condition is true for an account... (1-2 sentences, specific and measurable)",
  "recommendation": "the recommended action (2-3 sentences)",
  "confidence": <0.0-1.0 — how well these samples represent a coherent, generalizable pattern>
}

Set confidence low (< 0.5) if the samples seem too varied to represent a single clear pattern.`;

    try {
      const res = await complete({
        messages: [{ role: "user", content: prompt }],
        task: "fallback-crystallization",
        temperature: 0.3, // explicit exception: generative rule candidate crystallization
        maxTokens: 512,
        jsonMode: true,
      });

      const parsed = JSON.parse(res.content);
      if (!parsed.title || !parsed.condition || !parsed.recommendation) {
        throw new Error("incomplete LLM response");
      }

      const confidence: number = typeof parsed.confidence === "number"
        ? Math.max(0, Math.min(1, parsed.confidence))
        : 0.7;
      const isWeakPattern = confidence < WEAK_PATTERN_THRESHOLD;

      await prisma.ruleCandidate.create({
        data: {
          title:          parsed.title,
          category:       cluster.category,
          clusterKey:     cluster.clusterKey,
          condition:      parsed.condition,
          recommendation: parsed.recommendation,
          sourceCount:    cluster.accounts.length,
          accountIds:     cluster.accounts,
          confidence,
          status: "PENDING",
        },
      });
      candidatesCreated++;

      steps.push({
        name: `crystallize:${cluster.clusterKey}`,
        input: `${cluster.accounts.length} accounts, ${cluster.samples.length} samples`,
        output: `created candidate: "${parsed.title.slice(0, 60)}" (confidence: ${(confidence * 100).toFixed(0)}%${isWeakPattern ? " — WEAK PATTERN" : ""})`,
        latencyMs: Date.now() - llmStart,
      });
    } catch (err) {
      console.warn(`[fallback-crystallizer] cluster ${cluster.clusterKey} failed:`, err);
      steps.push({
        name: `crystallize:${cluster.clusterKey}`,
        input: `${cluster.accounts.length} accounts`,
        output: `failed: ${err instanceof Error ? err.message : "unknown error"}`,
        latencyMs: Date.now() - llmStart,
      });
    }
  }

  steps.push({
    name: "summary",
    input: `${eligibleClusters.length} eligible sub-clusters`,
    output: `${candidatesCreated} candidates created, ${candidatesSkipped} updated`,
    latencyMs: 0,
  });

  return { candidatesCreated, candidatesSkipped, steps, totalLatencyMs: Date.now() - start };
}

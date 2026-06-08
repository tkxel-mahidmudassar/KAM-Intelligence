import { prisma } from "@/lib/prisma";
import { applyCriteriaOverrideToDimension, healthFromOverallScore, scoreDimensionFromKey } from "@/lib/scoring/scoreOverrideMath";
import { DEFAULT_WEIGHTS, WEIGHT_KEYS, type WeightKey } from "@/lib/scoring/weights";

async function loadWeights() {
  const cfg = await prisma.appConfig.findUnique({ where: { id: "global" } }).catch(() => null);
  const stored = cfg?.scoreWeights && typeof cfg.scoreWeights === "object" ? cfg.scoreWeights as Record<string, number> : {};
  return WEIGHT_KEYS.reduce<Record<WeightKey, number>>((acc, key) => {
    acc[key] = (typeof stored[key] === "number" ? stored[key] : DEFAULT_WEIGHTS[key]) / 100;
    return acc;
  }, {} as Record<WeightKey, number>);
}

function weightedOverall(scores: Record<WeightKey, number>, weights: Record<WeightKey, number>) {
  return Math.max(0, Math.min(100, Math.round(
    WEIGHT_KEYS.reduce((sum, key) => sum + scores[key] * weights[key], 0),
  )));
}

function normalizeLegacyBaselineScores(scores: Record<WeightKey, number>, overall: number, weights: Record<WeightKey, number>) {
  const weighted = weightedOverall(scores, weights);
  if (Math.abs(weighted - overall) <= 5) return scores;

  return WEIGHT_KEYS.reduce<Record<WeightKey, number>>((normalized, key) => {
    normalized[key] = overall;
    return normalized;
  }, {} as Record<WeightKey, number>);
}

export async function createApprovedOverrideScoreSnapshot(accountId: string, kpiKey: string, approvedValue: number) {
  const dimension = scoreDimensionFromKey(kpiKey);
  if (!dimension) return null;

  const latest = await prisma.kamScore.findFirst({
    where: { accountId },
    orderBy: { computedAt: "desc" },
  });
  if (!latest) return null;

  const currentScore = (value: number | null, fallback: number) => typeof value === "number" ? value : fallback;
  const weights = await loadWeights();
  const rawScores: Record<WeightKey, number> = {
    csat: currentScore(latest.csat, latest.overall),
    relationship: currentScore(latest.relationship, latest.overall),
    risk: currentScore(latest.risk, latest.overall),
    contractHealth: currentScore(latest.contractHealth, latest.overall),
    projectHealth: currentScore(latest.projectHealth, latest.overall),
    resourceHealth: currentScore(latest.resourceHealth, latest.overall),
    financial: currentScore(latest.financial, latest.overall),
    whitespace: currentScore(latest.whitespace, latest.overall),
  };
  const nextScores = normalizeLegacyBaselineScores(rawScores, latest.overall, weights);
  nextScores[dimension] = applyCriteriaOverrideToDimension(nextScores[dimension], kpiKey, approvedValue);

  const overall = weightedOverall(nextScores, weights);
  const health = healthFromOverallScore(overall);

  const score = await prisma.kamScore.create({
    data: {
      accountId,
      overall,
      csat: nextScores.csat,
      relationship: nextScores.relationship,
      risk: nextScores.risk,
      contractHealth: nextScores.contractHealth,
      projectHealth: nextScores.projectHealth,
      resourceHealth: nextScores.resourceHealth,
      financial: nextScores.financial,
      whitespace: nextScores.whitespace,
      health,
      aiNarrative: `Manual override approved for ${dimension}. Score recalculated from ${latest.overall}/100 to ${overall}/100.`,
    },
  });

  await prisma.account.update({
    where: { id: accountId },
    data: { health, healthUpdatedAt: new Date() },
  });

  return score;
}

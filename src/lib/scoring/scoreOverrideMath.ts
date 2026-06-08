import type { WeightKey } from "@/lib/scoring/weights";

const SCORE_DIMENSION_BY_PREFIX: Record<string, WeightKey> = {
  csat: "csat",
  "customer-success": "csat",
  relationship: "relationship",
  risk: "risk",
  contractHealth: "contractHealth",
  "contract-health": "contractHealth",
  projectHealth: "projectHealth",
  "project-health": "projectHealth",
  resourceHealth: "resourceHealth",
  "resource-health": "resourceHealth",
  financial: "financial",
  "financial-health": "financial",
  whitespace: "whitespace",
};

export function scoreDimensionFromKey(kpiKey: string): WeightKey | null {
  const prefix = kpiKey.split(":")[0] ?? kpiKey;
  return SCORE_DIMENSION_BY_PREFIX[prefix] ?? null;
}

export function normalizeOneToFive(value: number) {
  const score = Number(value);
  if (!Number.isFinite(score)) return 1;
  return Math.max(1, Math.min(5, score > 5 ? score / 20 : score));
}

export function oneToFiveToPercent(value: number) {
  return Math.round(normalizeOneToFive(value) * 20);
}

export function applyCriteriaOverrideToDimension(currentDimensionScore: number, kpiKey: string, approvedValue: number) {
  if (!kpiKey.includes(":")) return oneToFiveToPercent(approvedValue);

  const currentCriteriaAverage = normalizeOneToFive(currentDimensionScore / 20);
  const nextCriteria = normalizeOneToFive(approvedValue);
  const nextDimensionAverage = ((currentCriteriaAverage * 4) + nextCriteria) / 5;
  return Math.round(nextDimensionAverage * 20);
}

export function healthFromOverallScore(score: number) {
  if (score >= 70) return "HEALTHY" as const;
  if (score >= 45) return "AT_RISK" as const;
  return "CRITICAL" as const;
}

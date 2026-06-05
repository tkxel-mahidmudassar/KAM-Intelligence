/**
 * Recommendation Expiry Sweeper
 *
 * Marks open recommendations as EXPIRED when either condition is met:
 *   1. Score recovery: the KPI dimension the rec addresses has recovered to >= 70 on the latest score
 *   2. Time limit: the recommendation has been open for 30+ days (expiresAt has passed)
 *
 * The sweeper is non-throwing — failures are logged but never crash the caller.
 *
 * Called from:
 *   - POST /api/ai/score — immediately after each account's score is computed (per-account)
 *   - chainDailyBatch in masterOrchestrator — nightly sweep across all accounts
 */

import { prisma } from "@/lib/prisma";
import { logAudit } from "@/lib/audit";

const RECOVERY_THRESHOLD = 70; // KPI dimension score above this = "recovered"

// Map recommendation category → KamScore field name
const CATEGORY_TO_SCORE_FIELD: Record<string, keyof KpiScoreFields> = {
  CSAT:          "csat",
  RELATIONSHIP:  "relationship",
  RISK:          "risk",
  CONTRACT:      "contractHealth",
  FINANCIAL:     "financial",
  PROJECT:       "projectHealth",
  RESOURCE:      "resourceHealth",
  WHITESPACE:    "whitespace",
  // Catch-all categories that don't map 1:1 — no recovery check, time-based only
};

interface KpiScoreFields {
  csat:          number | null;
  relationship:  number | null;
  risk:          number | null;
  contractHealth: number | null;
  financial:     number | null;
  projectHealth: number | null;
  resourceHealth: number | null;
  whitespace:    number | null;
}

export interface ExpirySweepResult {
  accountsChecked: number;
  recommendationsExpired: number;
  details: { accountId: string; recId: string; reason: string }[];
}

/**
 * Sweep a single account's open recommendations for expiry.
 * Pass the latest KamScore if available (avoids an extra DB query inside per-account scoring).
 */
export async function expireRecommendationsForAccount(
  accountId: string,
  latestScore?: KpiScoreFields | null,
): Promise<{ expired: number; details: { recId: string; reason: string }[] }> {
  const now = new Date();

  // Load all ACTIVE recommendations for this account that have an expiresAt set
  const openRecs = await prisma.recommendation.findMany({
    where: {
      accountId,
      status: "ACTIVE",
    },
    select: {
      id: true,
      category: true,
      expiresAt: true,
      title: true,
    },
  });

  if (openRecs.length === 0) return { expired: 0, details: [] };

  // Load latest score if not provided
  const score = latestScore ?? await prisma.kamScore.findFirst({
    where: { accountId },
    orderBy: { createdAt: "desc" },
    select: {
      csat: true, relationship: true, risk: true,
      contractHealth: true, financial: true,
      projectHealth: true, resourceHealth: true, whitespace: true,
    },
  });

  const expired: { recId: string; reason: string }[] = [];

  for (const rec of openRecs) {
    let expiryReason: string | null = null;

    // ── Check 1: time-based expiry ────────────────────────────────────────────
    if (rec.expiresAt && rec.expiresAt <= now) {
      expiryReason = "30 days elapsed without action";
    }

    // ── Check 2: score recovery expiry ───────────────────────────────────────
    if (!expiryReason && rec.category && score) {
      const scoreField = CATEGORY_TO_SCORE_FIELD[rec.category.toUpperCase()];
      if (scoreField) {
        const dimensionScore = score[scoreField];
        if (dimensionScore !== null && dimensionScore >= RECOVERY_THRESHOLD) {
          expiryReason = `${rec.category} dimension recovered to ${Math.round(dimensionScore)}`;
        }
      }
    }

    if (!expiryReason) continue;

    // Mark as EXPIRED
    await prisma.recommendation.update({
      where: { id: rec.id },
      data: {
        status: "EXPIRED",
        expiryReason,
      },
    });

    expired.push({ recId: rec.id, reason: expiryReason });

    console.log(`[expiry-sweeper] rec ${rec.id} expired (${expiryReason}) — account ${accountId}`);
  }

  if (expired.length > 0) {
    void logAudit({
      role: "KAM",
      accountId,
      action: "recommendation.expired",
      entity: "Recommendation",
      entityId: accountId,
      metadata: { count: expired.length, details: expired },
    });
  }

  return { expired: expired.length, details: expired };
}

/**
 * Sweep ALL accounts. Used by the daily_batch chain.
 */
export async function expireRecommendationsAllAccounts(): Promise<ExpirySweepResult> {
  const accounts = await prisma.account.findMany({ select: { id: true } });

  let totalExpired = 0;
  const allDetails: { accountId: string; recId: string; reason: string }[] = [];

  for (const account of accounts) {
    const result = await expireRecommendationsForAccount(account.id).catch((err) => {
      console.error(`[expiry-sweeper] failed for account ${account.id}:`, err);
      return { expired: 0, details: [] };
    });
    totalExpired += result.expired;
    allDetails.push(...result.details.map((d) => ({ accountId: account.id, ...d })));
  }

  return {
    accountsChecked: accounts.length,
    recommendationsExpired: totalExpired,
    details: allDetails,
  };
}

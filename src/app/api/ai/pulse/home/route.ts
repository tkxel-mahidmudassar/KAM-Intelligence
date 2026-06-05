/**
 * GET /api/ai/pulse/home
 *
 * Returns a trimmed AI Pulse summary for the home page:
 *   - Top 3 non-dismissed insights (RISK prioritised, then by confidence desc)
 *   - Top 2 active recommendations (by priority + due date, across all accounts)
 *     with playbook citation, rule condition, matching signals, and any related news
 *
 * Each insight includes full `sources` attribution:
 *   { newsHeadlines: [...], internalData: { health, overallScore, keyScores, signalTitles } }
 *
 * Each recommendation includes:
 *   - playbookRule.condition, playbookRule.sourceTitle, sourcePage, sourceSection
 *   - matchingSignals: open signals on the account whose type matches the rec's category
 */

import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { getRoleFromRequest, kamWhere, ok, guard, serverError } from "@/lib/api";

// Priority order for insight types on the home page
const INSIGHT_TYPE_ORDER: Record<string, number> = {
  RISK: 0, ANOMALY: 1, RECOMMENDATION: 2, OPPORTUNITY: 3, TREND: 4,
};

export async function GET(req: NextRequest) {
  try {
    const role = getRoleFromRequest(req);
    const denied = guard(role, "insight:view");
    if (denied) return denied;

    const kamUser = await prisma.user.findFirst({
      where: { role: "KAM" },
      orderBy: { createdAt: "asc" },
    });
    const where = kamWhere(role, kamUser?.id ?? "");

    // ── Top 3 insights ────────────────────────────────────────────────────────
    const recentInsights = await prisma.aIPulseInsight.findMany({
      where: {
        isDismissed: false,
        // Older pulse-agent rows were created before the task field was populated.
        // Include those null-task rows while still excluding score narratives.
        OR: [
          { task: null },
          { task: { not: "score-narrative" } },
        ],
        ...(where.kamId ? {
          account: { kamId: where.kamId },
        } : {}),
      },
      include: {
        account: {
          select: { id: true, name: true, health: true, arr: true },
        },
      },
      orderBy: { generatedAt: "desc" },
      take: 20, // fetch more, then sort and slice client-side
    });

    // Keep the newest row per type so a refresh visibly replaces stale duplicate cards.
    const newestByType = recentInsights.reduce<typeof recentInsights>((deduped, insight) => {
      if (!deduped.some((item) => item.type === insight.type)) deduped.push(insight);
      return deduped;
    }, []);

    // Sort: RISK first, then by confidence desc, then by recency
    const sortedInsights = newestByType
      .sort((a, b) => {
        const typeOrderA = INSIGHT_TYPE_ORDER[a.type] ?? 5;
        const typeOrderB = INSIGHT_TYPE_ORDER[b.type] ?? 5;
        if (typeOrderA !== typeOrderB) return typeOrderA - typeOrderB;
        const confidenceDelta = (b.confidence ?? 0) - (a.confidence ?? 0);
        if (confidenceDelta !== 0) return confidenceDelta;
        return b.generatedAt.getTime() - a.generatedAt.getTime();
      })
      .slice(0, 3);

    // ── Top 2 recommendations ─────────────────────────────────────────────────
    const recentRecs = await prisma.recommendation.findMany({
      where: {
        status: "ACTIVE",
        ...(where.kamId ? { account: { kamId: where.kamId } } : {}),
      },
      include: {
        account: {
          select: {
            id: true, name: true, health: true, arr: true,
            signals: {
              where: { resolvedAt: null, severity: { in: ["WARNING", "CRITICAL"] } },
              select: { id: true, title: true, type: true, severity: true },
              take: 5,
            },
          },
        },
        playbookRule: {
          select: {
            category: true,
            condition: true,
            sourceTitle: true,
            sourcePage: true,
            sourceSection: true,
            playbook: { select: { title: true } },
          },
        },
      },
      orderBy: [
        { priority: "asc" },
        { createdAt: "desc" },
      ],
      take: 10,
    });

    // For each rec, find signals from the account that relate to its category
    const topRecs = recentRecs.slice(0, 2).map((rec) => {
      const categoryLower = (rec.category ?? "").toLowerCase();
      const matchingSignals = (rec.account?.signals ?? []).filter((sig) => {
        const sigType = sig.type.toLowerCase().replace(/_/g, " ");
        // Match signals whose type relates to this category
        return (
          sigType.includes(categoryLower) ||
          categoryLower.includes(sigType.split("_")[0]) ||
          sig.severity === "CRITICAL"
        );
      }).slice(0, 2);

      return {
        id:               rec.id,
        title:            rec.title,
        summary:          rec.summary,
        recommendedAction: rec.recommendedAction,
        sourceType:       rec.sourceType,
        priority:         rec.priority,
        category:         rec.category,
        dueDate:          rec.dueDate,
        expiresAt:        rec.expiresAt,
        account:          rec.account
          ? { id: rec.account.id, name: rec.account.name, health: rec.account.health, arr: rec.account.arr }
          : null,
        playbookRule:     rec.playbookRule ? {
          category:     rec.playbookRule.category,
          condition:    rec.playbookRule.condition,
          sourceTitle:  rec.playbookRule.sourceTitle,
          sourcePage:   rec.playbookRule.sourcePage,
          sourceSection: rec.playbookRule.sourceSection,
          playbookTitle: rec.playbookRule.playbook?.title ?? null,
        } : null,
        matchingSignals,
      };
    });

    return ok({
      insights:        sortedInsights,
      recommendations: topRecs,
      generatedAt:     sortedInsights[0]?.generatedAt ?? null,
    });
  } catch (err) {
    return serverError(err);
  }
}

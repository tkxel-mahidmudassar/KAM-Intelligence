import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { getRoleFromRequest, getUserIdFromRequest, ok, noContent, serverError, guard, kamWhere } from "@/lib/api";

// GET /api/notifications
export async function GET(req: NextRequest) {
  try {
    const role = getRoleFromRequest(req);
    const denied = guard(role, "signal:view");
    if (denied) return denied;

    const headerUserId = getUserIdFromRequest(req);
    const kamUserId = headerUserId ?? (await prisma.user.findFirst({ where: { role: "KAM" }, orderBy: { createdAt: "asc" } }))?.id ?? "";
    const where = kamWhere(role, kamUserId);

    const sevenDaysOut = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    const allInsights  = req.nextUrl.searchParams.get("allInsights") === "true";

    const [
      pendingSignals,
      pendingOpps,
      pendingOverrides,
      upcomingQBRs,
      unreadInsights,
      allInsightsFeed,
      allSignalsFeed,
    ] = await Promise.all([
      // AI-raised signals pending review (KAM)
      prisma.signal.findMany({
        where: {
          pendingReview: true,
          isResolved:    false,
          account:       where.kamId ? { kamId: where.kamId } : undefined,
        },
        include: { account: { select: { id: true, name: true, health: true } } },
        orderBy: [{ severity: "asc" }, { detectedAt: "desc" }],
        take: 20,
      }),

      // AI-generated opportunities pending review (KAM)
      prisma.opportunity.findMany({
        where: {
          pendingReview: true,
          status: { not: "LOST" },
          account: where.kamId ? { kamId: where.kamId } : undefined,
        },
        include: { account: { select: { id: true, name: true, health: true } } },
        orderBy: { createdAt: "desc" },
        take: 20,
      }),

      // Pending score overrides (MANAGER+)
      (role === "MANAGER" || role === "EXECUTIVE" || role === "ADMIN")
        ? prisma.scoreOverride.findMany({
            where: { status: "PENDING" },
            include: { account: { select: { id: true, name: true, health: true } } },
            orderBy: { createdAt: "desc" },
            take: 10,
          })
        : Promise.resolve([]),

      // QBR sessions scheduled in the next 7 days
      prisma.qbrSession.findMany({
        where: {
          scheduledAt: { gte: new Date(), lte: sevenDaysOut },
          status: { in: ["SCHEDULED", "DRAFT"] },
          account: where.kamId ? { kamId: where.kamId } : undefined,
        },
        include: { account: { select: { id: true, name: true, health: true } } },
        orderBy: { scheduledAt: "asc" },
        take: 5,
      }),

      // Unread AI insights for the notification badge (non-log)
      prisma.aIPulseInsight.findMany({
        where: {
          isDismissed: false,
          isRead:      false,
          title:       { not: { startsWith: "[LOG]" } },
        },
        include: { account: { select: { id: true, name: true } } },
        orderBy: { generatedAt: "desc" },
        take: 10,
      }),

      // Full insight feed for AI Pulse page (allInsights=true)
      allInsights
        ? prisma.aIPulseInsight.findMany({
            where: {
              isDismissed: false,
              title:       { not: { startsWith: "[LOG]" } },
            },
            include: { account: { select: { id: true, name: true, health: true, arr: true } } },
            orderBy: { generatedAt: "desc" },
            take: 100,
          })
        : Promise.resolve(null),

      // Full signal feed for AI Pulse page (allInsights=true)
      allInsights
        ? prisma.signal.findMany({
            where: {
              isResolved:  false,
              account:     where.kamId ? { kamId: where.kamId } : undefined,
            },
            include: { account: { select: { id: true, name: true, health: true } } },
            orderBy: [{ severity: "asc" }, { detectedAt: "desc" }],
            take: 100,
          })
        : Promise.resolve(null),
    ]);

    const total = pendingSignals.length + pendingOpps.length + pendingOverrides.length + upcomingQBRs.length + unreadInsights.length;

    return ok({
      pendingSignals,
      pendingOpps,
      pendingOverrides,
      upcomingQBRs,
      unreadInsights,
      total,
      // Full feeds for AI Pulse page
      insights: allInsightsFeed ?? unreadInsights,
      signals:  allSignalsFeed  ?? pendingSignals,
    });
  } catch (err) {
    return serverError(err);
  }
}

// PATCH /api/notifications — bulk mark read
export async function PATCH(req: NextRequest) {
  try {
    const role = getRoleFromRequest(req);
    const denied = guard(role, "signal:view");
    if (denied) return denied;

    await Promise.all([
      prisma.signal.updateMany({
        where: { isRead: false, isResolved: false },
        data:  { isRead: true },
      }),
      prisma.aIPulseInsight.updateMany({
        where: { isRead: false, isDismissed: false },
        data:  { isRead: true },
      }),
    ]);

    return noContent();
  } catch (err) {
    return serverError(err);
  }
}

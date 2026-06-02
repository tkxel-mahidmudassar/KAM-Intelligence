import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { getRoleFromRequest, ok, noContent, serverError, guard, kamWhere } from "@/lib/api";

// GET /api/notifications
export async function GET(req: NextRequest) {
  try {
    const role = getRoleFromRequest(req);
    const denied = guard(role, "signal:view");
    if (denied) return denied;

    const kamUser = await prisma.user.findFirst({ where: { role: "KAM" }, orderBy: { createdAt: "asc" } });
    const where   = kamWhere(role, kamUser?.id ?? "");

    const sevenDaysOut = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

    const [
      pendingSignals,
      pendingOpps,
      pendingOverrides,
      upcomingQBRs,
      unreadInsights,
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
      (role === "MANAGER" || role === "EXECUTIVE")
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

      // Unread AI insights (non-log)
      prisma.aIPulseInsight.findMany({
        where: {
          isDismissed: false,
          isRead: false,
          title: { not: { startsWith: "[LOG]" } },
        },
        include: { account: { select: { id: true, name: true } } },
        orderBy: { generatedAt: "desc" },
        take: 10,
      }),
    ]);

    const total = pendingSignals.length + pendingOpps.length + pendingOverrides.length + upcomingQBRs.length + unreadInsights.length;

    return ok({
      pendingSignals,
      pendingOpps,
      pendingOverrides,
      upcomingQBRs,
      unreadInsights,
      total,
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

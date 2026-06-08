import { NextRequest } from "next/server";
import { Role as PrismaRole } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getRoleFromRequest, getUserIdFromRequest, ok, created, badRequest, serverError, guard, kamWhere } from "@/lib/api";

const VALID_SEVERITIES = new Set(["info", "warning", "success"]);
const VALID_ROLES = new Set(Object.values(PrismaRole));

function serializeNotification(notification: {
  id: string;
  title: string;
  detail: string;
  href: string;
  source: string;
  severity: string;
  createdAt: Date;
  isRead: boolean;
  isDismissed: boolean;
  accountId: string | null;
}) {
  return {
    id: notification.id,
    title: notification.title,
    detail: notification.detail,
    href: notification.href,
    source: notification.source,
    severity: VALID_SEVERITIES.has(notification.severity) ? notification.severity : "info",
    createdAt: notification.createdAt.toISOString(),
    createdAtIso: notification.createdAt.toISOString(),
    read: notification.isRead,
    dismissed: notification.isDismissed,
    accountId: notification.accountId,
  };
}

function visibleNotificationWhere(role: string, userId: string | null, includeDismissed = false) {
  return {
    ...(includeDismissed ? {} : { isDismissed: false }),
    OR: [
      ...(userId ? [{ userId }] : []),
      { userId: null, role: role as PrismaRole },
      { userId: null, role: null },
    ],
  };
}

function cleanString(value: unknown, fallback = "") {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

async function getDerivedNotificationFeeds(req: NextRequest, role: string, userId: string | null) {
  const kamUserId = userId ?? (await prisma.user.findFirst({ where: { role: "KAM" }, orderBy: { createdAt: "asc" } }))?.id ?? "";
  const where = kamWhere(role as never, kamUserId);
  const sevenDaysOut = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
  const allInsights = req.nextUrl.searchParams.get("allInsights") === "true";

  const [
    pendingSignals,
    pendingOpps,
    pendingOverrides,
    upcomingQBRs,
    unreadInsights,
    allInsightsFeed,
    allSignalsFeed,
  ] = await Promise.all([
    prisma.signal.findMany({
      where: {
        pendingReview: true,
        isResolved: false,
        account: where.kamId ? { kamId: where.kamId } : undefined,
      },
      include: { account: { select: { id: true, name: true, health: true } } },
      orderBy: [{ severity: "asc" }, { detectedAt: "desc" }],
      take: 20,
    }),
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
    (role === "KAM" || role === "MANAGER" || role === "EXECUTIVE" || role === "ADMIN")
      ? prisma.scoreOverride.findMany({
          where: { status: "PENDING" },
          include: { account: { select: { id: true, name: true, health: true } } },
          orderBy: { createdAt: "desc" },
          take: 10,
        })
      : Promise.resolve([]),
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
    allInsights
      ? prisma.aIPulseInsight.findMany({
          where: {
            isDismissed: false,
            title: { not: { startsWith: "[LOG]" } },
          },
          include: { account: { select: { id: true, name: true, health: true, arr: true } } },
          orderBy: { generatedAt: "desc" },
          take: 100,
        })
      : Promise.resolve(null),
    allInsights
      ? prisma.signal.findMany({
          where: {
            isResolved: false,
            account: where.kamId ? { kamId: where.kamId } : undefined,
          },
          include: { account: { select: { id: true, name: true, health: true } } },
          orderBy: [{ severity: "asc" }, { detectedAt: "desc" }],
          take: 100,
        })
      : Promise.resolve(null),
  ]);

  return {
    pendingSignals,
    pendingOpps,
    pendingOverrides,
    upcomingQBRs,
    unreadInsights,
    insights: allInsightsFeed ?? unreadInsights,
    signals: allSignalsFeed ?? pendingSignals,
  };
}

// GET /api/notifications
export async function GET(req: NextRequest) {
  try {
    const role = getRoleFromRequest(req);
    const denied = guard(role, "signal:view");
    if (denied) return denied;

    const userId = getUserIdFromRequest(req);
    const includeDismissed = req.nextUrl.searchParams.get("includeDismissed") === "true";

    const [notifications, derivedFeeds] = await Promise.all([
      prisma.notification.findMany({
        where: visibleNotificationWhere(role, userId, includeDismissed),
        orderBy: { createdAt: "desc" },
        take: 100,
      }),
      getDerivedNotificationFeeds(req, role, userId),
    ]);

    const serialized = notifications.map(serializeNotification);
    const unreadCount = serialized.filter((item) => !item.read && !item.dismissed).length;

    return ok({
      notifications: serialized,
      unreadCount,
      total: unreadCount,
      ...derivedFeeds,
    });
  } catch (err) {
    return serverError(err);
  }
}

// POST /api/notifications
export async function POST(req: NextRequest) {
  try {
    const role = getRoleFromRequest(req);
    const denied = guard(role, "signal:view");
    if (denied) return denied;

    const actorUserId = getUserIdFromRequest(req);
    const body = await req.json();
    const title = cleanString(body.title);
    const detail = cleanString(body.detail);
    const href = cleanString(body.href, "/portfolio");
    const source = cleanString(body.source, "system");
    const severity = VALID_SEVERITIES.has(body.severity) ? body.severity : "info";
    const id = cleanString(body.id) || undefined;
    const targetRole = cleanString(body.targetRole);
    const targetUserId = cleanString(body.targetUserId);
    const accountId = cleanString(body.accountId) || null;

    if (!title || !detail) return badRequest("title and detail are required");
    if (targetRole && !VALID_ROLES.has(targetRole as PrismaRole)) return badRequest("targetRole is invalid");

    const data = {
      title,
      detail,
      href,
      source,
      severity,
      accountId,
      userId: targetUserId || (targetRole ? null : actorUserId),
      role: targetRole ? targetRole as PrismaRole : null,
      isRead: false,
      isDismissed: false,
    };

    const notification = id
      ? await prisma.notification.upsert({
          where: { id },
          create: { id, ...data },
          update: data,
        })
      : await prisma.notification.create({ data });

    return created(serializeNotification(notification));
  } catch (err) {
    return serverError(err);
  }
}

// PATCH /api/notifications
export async function PATCH(req: NextRequest) {
  try {
    const role = getRoleFromRequest(req);
    const denied = guard(role, "signal:view");
    if (denied) return denied;

    const userId = getUserIdFromRequest(req);
    const body = await req.json().catch(() => ({}));
    const action = cleanString(body.action, "readAll");
    const id = cleanString(body.id);
    const scope = visibleNotificationWhere(role, userId, true);

    if (action === "readAll") {
      await prisma.notification.updateMany({
        where: { ...scope, isRead: false },
        data: { isRead: true },
      });
      return ok({ updated: true });
    }

    if (!id) return badRequest("id is required");
    const notification = await prisma.notification.findFirst({ where: { id, ...scope } });
    if (!notification) return badRequest("Notification not found");

    const updated = await prisma.notification.update({
      where: { id },
      data: action === "dismiss"
        ? { isRead: true, isDismissed: true }
        : { isRead: true },
    });

    return ok(serializeNotification(updated));
  } catch (err) {
    return serverError(err);
  }
}

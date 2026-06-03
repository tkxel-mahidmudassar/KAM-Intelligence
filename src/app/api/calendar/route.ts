import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { getRoleFromRequest, getUserIdFromRequest, ok, badRequest, serverError, guard, kamWhere } from "@/lib/api";

export interface CalendarItem {
  id: string;
  type: "action" | "qbr" | "touchpoint" | "renewal" | "signal" | "pulse";
  title: string;
  accountId: string;
  accountName: string;
  date: string;
  href?: string;
  summary?: string;
  severity?: string;
  status?: string;
  health?: string;
  priority?: string;
  confidence?: number | null;
}

function toDateKey(d: Date): string {
  return d.toISOString().split("T")[0];
}

// GET /api/calendar?from=YYYY-MM-DD&to=YYYY-MM-DD
export async function GET(req: NextRequest) {
  try {
    const role = getRoleFromRequest(req);
    const denied = guard(role, "action:view");
    if (denied) return denied;

    const { searchParams } = new URL(req.url);
    const fromStr = searchParams.get("from");
    const toStr   = searchParams.get("to");

    if (!fromStr || !toStr) return badRequest("from and to query params are required (YYYY-MM-DD)");

    const from = new Date(fromStr + "T00:00:00.000Z");
    const to   = new Date(toStr   + "T23:59:59.999Z");

    if (isNaN(from.getTime()) || isNaN(to.getTime())) return badRequest("Invalid date format");

    // Resolve KAM scope — prefer x-user-id header over POC identity hack
    const headerUserId = getUserIdFromRequest(req);
    const kamUserId = headerUserId ?? (await prisma.user.findFirst({ where: { role: "KAM" }, orderBy: { createdAt: "asc" } }))?.id ?? "";
    const where = kamWhere(role, kamUserId);

    // Fetch all data sources in parallel
    const [actions, qbrSessions, touchpoints, renewals, signals, pulseInsights] = await Promise.all([
      prisma.action.findMany({
        where: {
          dueDate:   { gte: from, lte: to },
          status:    { not: "DONE" },
          account:   where.kamId ? { kamId: where.kamId } : undefined,
        },
        include: { account: { select: { id: true, name: true, health: true } } },
      }),
      prisma.qbrSession.findMany({
        where: {
          scheduledAt: { gte: from, lte: to },
          account:     where.kamId ? { kamId: where.kamId } : undefined,
        },
        include: { account: { select: { id: true, name: true, health: true } } },
      }),
      prisma.touchpoint.findMany({
        where: {
          date:    { gte: from, lte: to },
          account: where.kamId ? { kamId: where.kamId } : undefined,
        },
        include: { account: { select: { id: true, name: true, health: true } } },
      }),
      prisma.account.findMany({
        where: {
          contractEnd: { gte: from, lte: to },
          ...(where.kamId ? { kamId: where.kamId } : {}),
        },
        select: { id: true, name: true, health: true, contractEnd: true },
      }),
      prisma.signal.findMany({
        where: {
          detectedAt:   { gte: from, lte: to },
          isResolved:   false,
          pendingReview: false,
          account:      where.kamId ? { kamId: where.kamId } : undefined,
        },
        include: { account: { select: { id: true, name: true, health: true } } },
      }),
      prisma.aIPulseInsight.findMany({
        where: {
          generatedAt:  { gte: from, lte: to },
          isDismissed:  false,
          title:        { not: { startsWith: "[LOG]" } },
          account:      where.kamId ? { kamId: where.kamId } : undefined,
        },
        include: { account: { select: { id: true, name: true, health: true } } },
        orderBy: { generatedAt: "desc" },
        take: 50,
      }),
    ]);

    const grouped: Record<string, CalendarItem[]> = {};

    const add = (key: string, item: CalendarItem) => {
      if (!grouped[key]) grouped[key] = [];
      grouped[key].push(item);
    };

    for (const a of actions) {
      if (!a.account || !a.dueDate) continue;
      add(toDateKey(a.dueDate), {
        id: a.id, type: "action", title: a.title,
        accountId: a.account.id, accountName: a.account.name,
        date: toDateKey(a.dueDate), status: a.status, priority: a.priority,
        health: a.account.health,
      });
    }
    for (const q of qbrSessions) {
      if (!q.account || !q.scheduledAt) continue;
      add(toDateKey(q.scheduledAt), {
        id: q.id, type: "qbr", title: q.title,
        accountId: q.account.id, accountName: q.account.name,
        date: toDateKey(q.scheduledAt), status: q.status, health: q.account.health,
      });
    }
    for (const t of touchpoints) {
      if (!t.account) continue;
      add(toDateKey(t.date), {
        id: t.id, type: "touchpoint", title: `${t.type} with ${t.account.name}`,
        accountId: t.account.id, accountName: t.account.name,
        date: toDateKey(t.date), health: t.account.health,
      });
    }
    for (const r of renewals) {
      if (!r.contractEnd) continue;
      add(toDateKey(r.contractEnd), {
        id: r.id, type: "renewal", title: `Contract renewal: ${r.name}`,
        accountId: r.id, accountName: r.name,
        date: toDateKey(r.contractEnd), health: r.health,
      });
    }
    for (const s of signals) {
      if (!s.account) continue;
      add(toDateKey(s.detectedAt), {
        id: s.id, type: "signal", title: s.title,
        accountId: s.account.id, accountName: s.account.name,
        date: toDateKey(s.detectedAt), severity: s.severity, health: s.account.health,
      });
    }
    for (const insight of pulseInsights) {
      const key = toDateKey(insight.generatedAt);
      add(key, {
        id: insight.id,
        type: "pulse",
        title: `AI Pulse: ${insight.title}`,
        accountId: insight.account?.id ?? "portfolio",
        accountName: insight.account?.name ?? "Portfolio",
        href: insight.account?.id ? `/accounts/${insight.account.id}` : "/ai-pulse",
        date: key,
        summary: insight.summary,
        severity: insight.type === "RISK" || insight.type === "ANOMALY" ? "WARNING" : "INFO",
        health: insight.account?.health,
        confidence: insight.confidence,
      });
    }

    return ok(grouped);
  } catch (err) {
    return serverError(err);
  }
}

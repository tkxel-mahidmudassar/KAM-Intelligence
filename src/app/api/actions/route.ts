import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { getRoleFromRequest, ok, created, badRequest, serverError, guard, kamWhere } from "@/lib/api";

// GET /api/actions?accountId=xxx&status=OPEN
export async function GET(req: NextRequest) {
  try {
    const role = getRoleFromRequest(req);
    const denied = guard(role, "action:view");
    if (denied) return denied;

    const { searchParams } = new URL(req.url);
    const accountId = searchParams.get("accountId") ?? undefined;
    const status    = searchParams.get("status") ?? undefined;
    const priority  = searchParams.get("priority") ?? undefined;
    const source    = searchParams.get("source") ?? undefined;

    // KAM scope: when fetching all actions (no accountId), limit to KAM's own accounts
    let kamAccountIds: string[] | undefined;
    if (role === "KAM" && !accountId) {
      const kamUser = await prisma.user.findFirst({ where: { role: "KAM" }, orderBy: { createdAt: "asc" } });
      const scope = kamWhere(role, kamUser?.id ?? "");
      if (scope.kamId) {
        const accs = await prisma.account.findMany({ where: scope, select: { id: true } });
        kamAccountIds = accs.map((a) => a.id);
      }
    }

    const actions = await prisma.action.findMany({
      where: {
        ...(accountId       ? { accountId }                       : {}),
        ...(kamAccountIds   ? { accountId: { in: kamAccountIds } } : {}),
        ...(status    ? { status: status as any } : {}),
        ...(priority  ? { priority: priority as any } : {}),
        ...(source    ? { source: source as any } : {}),
      },
      include: {
        owner:   { select: { id: true, name: true } },
        account: { select: { id: true, name: true, health: true } },
        _count:  { select: { comments: true } },
      },
      orderBy: [{ priority: "asc" }, { dueDate: "asc" }, { createdAt: "desc" }],
    });

    return ok(actions);
  } catch (err) {
    return serverError(err);
  }
}

// POST /api/actions
export async function POST(req: NextRequest) {
  try {
    const role = getRoleFromRequest(req);
    const denied = guard(role, "action:create");
    if (denied) return denied;

    const body = await req.json();
    const { accountId, title, description, priority, dueDate, ownerId, tags } = body;

    if (!accountId) return badRequest("accountId is required");
    if (!title)     return badRequest("title is required");

    const action = await prisma.action.create({
      data: {
        accountId,
        ownerId:     ownerId ?? null,
        title,
        description: description ?? null,
        priority:    priority ?? "MEDIUM",
        dueDate:     dueDate ? new Date(dueDate) : null,
        tags:        tags ?? null,
        source:      "HUMAN_CREATED",
      },
    });

    return created(action);
  } catch (err) {
    return serverError(err);
  }
}

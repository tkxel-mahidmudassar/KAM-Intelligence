import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { getRoleFromRequest, getUserIdFromRequest, ok, serverError, guard, kamWhere } from "@/lib/api";

// GET /api/audit?accountId=xxx&limit=50
export async function GET(req: NextRequest) {
  try {
    const role = getRoleFromRequest(req);
    const denied = guard(role, "activityLog:view");
    if (denied) return denied;

    const { searchParams } = new URL(req.url);
    const accountId = searchParams.get("accountId") ?? undefined;
    const limit     = Math.min(parseInt(searchParams.get("limit") ?? "50"), 200);

    let scopedAccountIds: string[] | undefined;
    if (role === "KAM") {
      const headerUserId = getUserIdFromRequest(req);
      const fallbackKam = headerUserId ? null : await prisma.user.findFirst({ where: { role: "KAM" }, orderBy: { createdAt: "asc" } });
      const scope = kamWhere(role, headerUserId ?? fallbackKam?.id ?? "");
      if (scope.kamId) {
        const accounts = await prisma.account.findMany({
          where: accountId ? { id: accountId, ...scope } : scope,
          select: { id: true },
        });
        scopedAccountIds = accounts.map((a) => a.id);
      }
    }

    const logs = await prisma.activityLog.findMany({
      where: {
        ...(accountId ? { accountId } : {}),
        ...(scopedAccountIds ? { accountId: { in: scopedAccountIds } } : {}),
      },
      include: {
        user:    { select: { id: true, name: true, role: true } },
        account: { select: { id: true, name: true } },
      },
      orderBy: { createdAt: "desc" },
      take: limit,
    });

    return ok(logs);
  } catch (err) {
    return serverError(err);
  }
}

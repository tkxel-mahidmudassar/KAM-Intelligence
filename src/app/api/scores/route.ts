import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { getRoleFromRequest, ok, serverError, guard } from "@/lib/api";

// GET /api/scores?accountId=xxx
export async function GET(req: NextRequest) {
  try {
    const role = getRoleFromRequest(req);
    const denied = guard(role, "score:view");
    if (denied) return denied;

    const { searchParams } = new URL(req.url);
    const accountId = searchParams.get("accountId") ?? undefined;

    const scores = await prisma.kamScore.findMany({
      where: accountId ? { accountId } : {},
      include: { account: { select: { id: true, name: true, health: true } } },
      orderBy: { computedAt: "desc" },
      take: accountId ? 10 : 50,
    });

    return ok(scores);
  } catch (err) {
    return serverError(err);
  }
}

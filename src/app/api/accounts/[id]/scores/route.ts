import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { getRoleFromRequest, ok, notFound, serverError, guard } from "@/lib/api";

type Params = { params: Promise<{ id: string }> };

// GET /api/accounts/[id]/scores?limit=30
export async function GET(req: NextRequest, { params }: Params) {
  try {
    const role = getRoleFromRequest(req);
    const denied = guard(role, "score:view");
    if (denied) return denied;

    const { id } = await params;
    const url = new URL(req.url);
    const limit = Math.min(30, Math.max(1, parseInt(url.searchParams.get("limit") ?? "10", 10)));

    const account = await prisma.account.findUnique({ where: { id }, select: { id: true } });
    if (!account) return notFound("Account");

    const scores = await prisma.kamScore.findMany({
      where: { accountId: id },
      orderBy: { computedAt: "asc" },
      take: limit,
      select: {
        id: true,
        overall: true,
        csat: true,
        relationship: true,
        risk: true,
        contractHealth: true,
        projectHealth: true,
        resourceHealth: true,
        financial: true,
        whitespace: true,
        health: true,
        computedAt: true,
      },
    });

    return ok(scores);
  } catch (err) {
    return serverError(err);
  }
}

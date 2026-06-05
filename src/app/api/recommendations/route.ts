import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { getRoleFromRequest, ok, badRequest, serverError, guard } from "@/lib/api";

// GET /api/recommendations?accountId=xxx
export async function GET(req: NextRequest) {
  try {
    const role = getRoleFromRequest(req);
    const denied = guard(role, "recommendation:view");
    if (denied) return denied;

    const { searchParams } = new URL(req.url);
    const accountId = searchParams.get("accountId");
    const status = searchParams.get("status") ?? "ACTIVE";

    if (!accountId) return badRequest("accountId is required");

    const recommendations = await prisma.recommendation.findMany({
      where: { accountId, status: status as never },
      orderBy: [{ priority: "asc" }, { createdAt: "desc" }],
      include: {
        playbookRule: {
          include: { playbook: { select: { title: true, id: true } } },
        },
      },
    });

    return ok(recommendations);
  } catch (err) {
    return serverError(err);
  }
}

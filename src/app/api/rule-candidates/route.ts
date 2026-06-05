import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { getRoleFromRequest, ok, serverError, guard } from "@/lib/api";

// GET /api/rule-candidates?status=PENDING
export async function GET(req: NextRequest) {
  try {
    const role = getRoleFromRequest(req);
    const denied = guard(role, "playbook:view");
    if (denied) return denied;

    const { searchParams } = new URL(req.url);
    const status = searchParams.get("status") ?? "PENDING";

    const candidates = await prisma.ruleCandidate.findMany({
      where: { status: status as "PENDING" | "PROMOTED" | "DISMISSED" },
      orderBy: [{ sourceCount: "desc" }, { createdAt: "desc" }],
    });

    return ok(candidates);
  } catch (err) {
    return serverError(err);
  }
}

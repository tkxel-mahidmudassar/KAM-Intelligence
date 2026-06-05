import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { getRoleFromRequest, ok, serverError, guard } from "@/lib/api";

// GET /api/activity-logs?action=orchestrator.run&limit=10
export async function GET(req: NextRequest) {
  try {
    const role = getRoleFromRequest(req);
    const denied = guard(role, "activityLog:view");
    if (denied) return denied;

    const { searchParams } = new URL(req.url);
    const action  = searchParams.get("action");
    const limit   = Math.min(parseInt(searchParams.get("limit") ?? "20"), 100);

    const logs = await prisma.activityLog.findMany({
      where: action ? { action } : undefined,
      orderBy: { createdAt: "desc" },
      take: limit,
    });

    return ok(logs);
  } catch (err) {
    return serverError(err);
  }
}

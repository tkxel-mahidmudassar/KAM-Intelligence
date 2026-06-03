import { NextRequest } from "next/server";
import { getRoleFromRequest, getUserIdFromRequest, ok, serverError, guard } from "@/lib/api";
import { runPulseInsightsAgent } from "@/lib/ai/agents/pulseInsights";
import { logAudit } from "@/lib/audit";
import { prisma } from "@/lib/prisma";

// POST /api/ai/agents/pulse
// Generates 5 account-specific AI Pulse insights (one per InsightType) using
// real-time public news + internal account data, persisted to AIPulseInsight.
export async function POST(req: NextRequest) {
  try {
    const role   = getRoleFromRequest(req);
    const denied = guard(role, "insight:view");
    if (denied) return denied;

    const userId = getUserIdFromRequest(req);

    // Resolve KAM scope: KAM role sees only their own accounts
    let kamId: string | undefined;
    if (role === "KAM") {
      const kamUser = userId
        ? await prisma.user.findUnique({ where: { id: userId }, select: { id: true } })
        : await prisma.user.findFirst({ where: { role: "KAM" }, orderBy: { createdAt: "asc" } });
      kamId = kamUser?.id ?? undefined;
    }

    const result = await runPulseInsightsAgent(kamId);

    await logAudit({
      role,
      action:   "agent.pulse",
      entity:   "AIPulseInsight",
      metadata: { count: result.output.count, userId: userId ?? null },
    });

    return ok(result);
  } catch (err) {
    return serverError(err);
  }
}

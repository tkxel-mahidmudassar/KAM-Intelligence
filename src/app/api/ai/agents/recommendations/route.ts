import { NextRequest } from "next/server";
import { getRoleFromRequest, ok, badRequest, serverError, guard } from "@/lib/api";
import { runRecommendationOrchestrator } from "@/lib/ai/agents/recommendationOrchestrator";

// POST /api/ai/agents/recommendations
// Body: { accountId: string, triggeredBy?: string }
export async function POST(req: NextRequest) {
  try {
    const role = getRoleFromRequest(req);
    const denied = guard(role, "recommendation:view");
    if (denied) return denied;

    const body = await req.json();
    const { accountId, triggeredBy = "pulse_refresh" } = body;

    if (!accountId) return badRequest("accountId is required");

    const result = await runRecommendationOrchestrator({
      accountId,
      triggeredBy,
    });

    return ok(result);
  } catch (err) {
    return serverError(err);
  }
}

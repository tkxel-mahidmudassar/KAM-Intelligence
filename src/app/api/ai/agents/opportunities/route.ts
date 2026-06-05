import { NextRequest } from "next/server";
import { getRoleFromRequest, ok, badRequest, serverError, guard } from "@/lib/api";
import { runOpportunityAnalysisAgent } from "@/lib/ai/agents/opportunityAnalysis";
import { logAudit } from "@/lib/audit";

export async function POST(req: NextRequest) {
  try {
    const role = getRoleFromRequest(req);
    const denied = guard(role, "opportunity:create");
    if (denied) return denied;

    const { accountId } = await req.json();
    if (!accountId) return badRequest("accountId is required");

    const result = await runOpportunityAnalysisAgent(accountId);

    await logAudit({
      role,
      accountId,
      action: "agent.opportunity-analysis",
      entity: "Opportunity",
      metadata: { created: result.output.length, steps: result.steps.length, latencyMs: result.totalLatencyMs },
    });

    return ok(result);
  } catch (err) {
    return serverError(err);
  }
}

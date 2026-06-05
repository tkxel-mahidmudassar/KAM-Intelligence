import { NextRequest } from "next/server";
import { getRoleFromRequest, ok, badRequest, serverError, guard } from "@/lib/api";
import { runKycDraftAgent } from "@/lib/ai/agents/kycDraft";

// Legacy compatibility endpoint. The account workspace uses /api/ai/agents/kyc,
// but this route now delegates to the same sourced KYC agent so prompts cannot drift.
export async function POST(req: NextRequest) {
  try {
    const role = getRoleFromRequest(req);
    const denied = guard(role, "kyc:create");
    if (denied) return denied;

    const { accountId, authorId } = await req.json();
    if (!accountId) return badRequest("accountId is required");

    const result = await runKycDraftAgent(accountId, authorId);
    return ok({
      kyc: result.output,
      model: result.model,
      latencyMs: result.totalLatencyMs,
      sources: result.sources,
      steps: result.steps,
    });
  } catch (err) {
    return serverError(err);
  }
}

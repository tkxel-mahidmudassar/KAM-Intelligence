import { NextRequest } from "next/server";
import { getRoleFromRequest, ok, badRequest, serverError, guard } from "@/lib/api";
import { runKycDraftAgent } from "@/lib/ai/agents/kycDraft";
import { logAudit } from "@/lib/audit";

export async function POST(req: NextRequest) {
  try {
    const role = getRoleFromRequest(req);
    const denied = guard(role, "kyc:create");
    if (denied) return denied;

    const { accountId, authorId } = await req.json();
    if (!accountId) return badRequest("accountId is required");

    const result = await runKycDraftAgent(accountId, authorId);

    await logAudit({
      role,
      accountId,
      action: "agent.kyc-draft",
      entity: "KycVersion",
      entityId: result.output?.id,
      metadata: { version: result.output?.version, steps: result.steps.length, latencyMs: result.totalLatencyMs },
    });

    return ok(result);
  } catch (err) {
    return serverError(err);
  }
}

import { NextRequest } from "next/server";
import { getRoleFromRequest, ok, badRequest, serverError, guard } from "@/lib/api";
import { runQbrPrepAgent } from "@/lib/ai/agents/qbrPrep";
import { logAudit } from "@/lib/audit";

export async function POST(req: NextRequest) {
  try {
    const role = getRoleFromRequest(req);
    const denied = guard(role, "qbr:create");
    if (denied) return denied;

    const body = await req.json();
    const { accountId, title, type } = body;
    if (!accountId) return badRequest("accountId is required");

    const result = await runQbrPrepAgent(accountId, type ?? "QBR", title);

    await logAudit({
      role,
      accountId,
      action: "agent.qbr-prep",
      entity: "QbrSession",
      entityId: result.output?.id,
      metadata: { steps: result.steps.length, latencyMs: result.totalLatencyMs },
    });

    return ok(result);
  } catch (err) {
    return serverError(err);
  }
}

import { NextRequest } from "next/server";
import { getRoleFromRequest, ok, badRequest, serverError, guard } from "@/lib/api";
import { runMasterOrchestrator, type OrchestratorTrigger } from "@/lib/ai/agents/masterOrchestrator";

const VALID_TRIGGERS: OrchestratorTrigger[] = [
  "score_computed", "playbook_uploaded", "recommendation_outcome",
  "daily_batch", "pulse_refresh", "manual_full_refresh",
];

// Manual triggers restricted to MANAGER/ADMIN only
const MANAGEMENT_TRIGGERS: OrchestratorTrigger[] = [
  "daily_batch", "manual_full_refresh",
];

// POST /api/ai/orchestrate  { trigger, context }
export async function POST(req: NextRequest) {
  try {
    const role = getRoleFromRequest(req);
    const denied = guard(role, "score:view");
    if (denied) return denied;

    const body = await req.json();
    const { trigger, context = {} } = body;

    if (!VALID_TRIGGERS.includes(trigger)) {
      return badRequest(`Invalid trigger. Valid: ${VALID_TRIGGERS.join(", ")}`);
    }

    // Management-only triggers
    if (MANAGEMENT_TRIGGERS.includes(trigger) && role !== "KAM" && role !== "MANAGER" && role !== "ADMIN") {
      return badRequest(`Trigger '${trigger}' requires MANAGER or ADMIN role`);
    }

    const run = await runMasterOrchestrator(trigger as OrchestratorTrigger, { ...context, role });

    return ok(run);
  } catch (err) {
    return serverError(err);
  }
}

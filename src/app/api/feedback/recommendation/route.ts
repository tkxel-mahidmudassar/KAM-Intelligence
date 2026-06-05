import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { getRoleFromRequest, ok, badRequest, notFound, serverError, guard } from "@/lib/api";
import { runMasterOrchestrator } from "@/lib/ai/agents/masterOrchestrator";

const VALID_FEEDBACK_TYPES = ["ACTIONED", "DISMISSED", "ACTION_COMPLETED", "ACTION_DISMISSED"] as const;
const VALID_DISMISS_REASONS = ["IRRELEVANT", "ALREADY_DONE", "WRONG_TIMING", "OTHER"] as const;

/**
 * POST /api/feedback/recommendation
 * Body: { recommendationId, feedbackType, dismissReason? }
 *
 * Updates the recommendation status and fires the master orchestrator
 * with the recommendation_outcome trigger.
 */
export async function POST(req: NextRequest) {
  try {
    const role = getRoleFromRequest(req);
    const denied = guard(role, "recommendation:view");
    if (denied) return denied;

    const body = await req.json();
    const { recommendationId, feedbackType, dismissReason } = body;

    if (!recommendationId) return badRequest("recommendationId is required");
    if (!VALID_FEEDBACK_TYPES.includes(feedbackType)) {
      return badRequest(`feedbackType must be one of: ${VALID_FEEDBACK_TYPES.join(", ")}`);
    }
    if (feedbackType === "DISMISSED" && !VALID_DISMISS_REASONS.includes(dismissReason)) {
      return badRequest(`dismissReason is required when feedbackType is DISMISSED. Must be one of: ${VALID_DISMISS_REASONS.join(", ")}`);
    }

    const rec = await prisma.recommendation.findUnique({ where: { id: recommendationId } });
    if (!rec) return notFound("Recommendation");

    // Update recommendation status
    const newStatus = feedbackType === "ACTIONED" ? "ACTIONED" : feedbackType === "DISMISSED" ? "DISMISSED" : undefined;
    if (newStatus) {
      await prisma.recommendation.update({
        where: { id: recommendationId },
        data: { status: newStatus },
      });
    }

    // Fire orchestrator non-blocking (returns suppression info via feedback capture)
    // We also want to return suppressionEligible synchronously for immediate UI feedback
    let suppressionEligible = false;
    let dismissCountForRule = 0;
    let feedbackId = "";

    try {
      const { runFeedbackCaptureAgent } = await import("@/lib/ai/agents/feedbackCapture");
      const captureResult = await runFeedbackCaptureAgent({
        recommendationId,
        feedbackType,
        dismissReason,
        accountId: rec.accountId,
      });
      suppressionEligible = captureResult.suppressionEligible;
      dismissCountForRule = captureResult.dismissCountForRule;
      feedbackId = captureResult.feedbackId;

      // Continue with rest of orchestrator chain non-blocking
      void runMasterOrchestrator("recommendation_outcome", {
        recommendationId,
        feedbackType,
        dismissReason,
        accountId: rec.accountId,
        role,
      });
    } catch (err) {
      console.error("[feedback/recommendation] capture failed:", err);
    }

    return ok({
      recommendationId,
      feedbackId,
      feedbackType,
      suppressionEligible,
      dismissCountForRule,
    });
  } catch (err) {
    return serverError(err);
  }
}

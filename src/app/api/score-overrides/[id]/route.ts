import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { getRoleFromRequest, ok, badRequest, notFound, forbidden, serverError, guard } from "@/lib/api";
import { logAudit } from "@/lib/audit";

// PATCH /api/score-overrides/[id]  — approve or decline
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const role = getRoleFromRequest(req);
    // KAMs review associate-submitted score override requests.
    if (role !== "KAM" && role !== "MANAGER" && role !== "ADMIN") {
      return forbidden("Only KAM reviewer roles can action score overrides");
    }
    const denied = guard(role, "score:approve");
    if (denied) return denied;

    const { id } = await params;
    const body = await req.json();
    const { action, approvedById, declineReason } = body; // action: "APPROVE" | "DECLINE"

    if (!action || !["APPROVE", "DECLINE"].includes(action)) {
      return badRequest("action must be APPROVE or DECLINE");
    }

    const existing = await prisma.scoreOverride.findUnique({ where: { id } });
    if (!existing) return notFound("ScoreOverride");
    if (existing.status !== "PENDING") {
      return badRequest("Override has already been actioned");
    }

    const updated = await prisma.scoreOverride.update({
      where: { id },
      data: {
        status:       action === "APPROVE" ? "APPROVED" : "DECLINED",
        approvedById: approvedById ?? null,
        approvedValue: action === "APPROVE" ? existing.requestedValue : null,
        reason: action === "DECLINE" && declineReason
          ? `${existing.reason}\n\n[Declined: ${declineReason}]`
          : existing.reason,
      },
      include: { account: { select: { id: true, name: true } } },
    });

    await logAudit({
      role,
      accountId: existing.accountId,
      action:    action === "APPROVE" ? "score_override.approved" : "score_override.declined",
      entity:    "ScoreOverride",
      entityId:  id,
      metadata:  {
        role,
        kpiKey:         existing.kpiKey,
        previousValue:  existing.previousValue,
        requestedValue: existing.requestedValue,
        ...(action === "DECLINE" && declineReason ? { declineReason } : {}),
      },
    });

    return ok(updated);
  } catch (err) {
    return serverError(err);
  }
}

// DELETE /api/score-overrides/[id]  — KAM withdraws a pending request
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const role = getRoleFromRequest(req);
    const denied = guard(role, "score:view");
    if (denied) return denied;

    const { id } = await params;
    const existing = await prisma.scoreOverride.findUnique({ where: { id } });
    if (!existing) return notFound("ScoreOverride");
    if (existing.status !== "PENDING") {
      return badRequest("Can only withdraw PENDING requests");
    }

    await prisma.scoreOverride.delete({ where: { id } });
    return ok({ deleted: true });
  } catch (err) {
    return serverError(err);
  }
}

import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { getRoleFromRequest, ok, notFound, badRequest, serverError, guard } from "@/lib/api";
import { logAudit } from "@/lib/audit";

type Params = { params: Promise<{ id: string }> };

// GET /api/kyc/[id]
export async function GET(req: NextRequest, { params }: Params) {
  try {
    const role = getRoleFromRequest(req);
    const denied = guard(role, "kyc:view");
    if (denied) return denied;

    const { id } = await params;
    const kyc = await prisma.kycVersion.findUnique({
      where: { id },
      include: {
        account: { select: { id: true, name: true, industry: true } },
        author:  { select: { id: true, name: true } },
      },
    });

    if (!kyc) return notFound("KYC version");
    return ok(kyc);
  } catch (err) {
    return serverError(err);
  }
}

// PATCH /api/kyc/[id]
export async function PATCH(req: NextRequest, { params }: Params) {
  try {
    const role = getRoleFromRequest(req);
    const { id } = await params;
    const body = await req.json();

    const existing = await prisma.kycVersion.findUnique({ where: { id } });
    if (!existing) return notFound("KYC version");

    // Lifecycle transitions
    if (body.status === "SUBMITTED") {
      const denied = guard(role, "kyc:submit");
      if (denied) return denied;
    } else if (body.status === "APPROVED") {
      const denied = guard(role, "kyc:approve");
      if (denied) return denied;
    } else if (body.status === "REJECTED") {
      const denied = guard(role, "kyc:reject");
      if (denied) return denied;
      if (!body.rejectionReason?.trim()) {
        return badRequest("A rejection reason is required.");
      }
    } else {
      const denied = guard(role, "kyc:update");
      if (denied) return denied;
    }

    const kyc = await prisma.kycVersion.update({
      where: { id },
      data: {
        status:               body.status               ?? existing.status,
        executiveSummary:     body.executiveSummary     ?? existing.executiveSummary,
        businessModel:        body.businessModel        ?? existing.businessModel,
        keyStakeholders:      body.keyStakeholders      ?? existing.keyStakeholders,
        strategicGoals:       body.strategicGoals       ?? existing.strategicGoals,
        riskFactors:          body.riskFactors          ?? existing.riskFactors,
        expansionOpportunity: body.expansionOpportunity ?? existing.expansionOpportunity,
        csatHistory:          body.csatHistory          ?? existing.csatHistory,
        competitiveLandscape: body.competitiveLandscape ?? existing.competitiveLandscape,
        financialOverview:    body.financialOverview    ?? existing.financialOverview,
        rejectionReason:      body.status === "REJECTED"  ? body.rejectionReason.trim() : existing.rejectionReason,
        submittedAt:          body.status === "SUBMITTED" ? new Date() : existing.submittedAt,
        approvedAt:           body.status === "APPROVED"  ? new Date() : existing.approvedAt,
      },
    });

    // Audit lifecycle transitions
    const lifecycleAction =
      body.status === "SUBMITTED" ? "kyc.submitted"  :
      body.status === "APPROVED"  ? "kyc.approved"   :
      body.status === "REJECTED"  ? "kyc.rejected"   : "kyc.updated";

    await logAudit({
      role,
      accountId: existing.accountId,
      action:    lifecycleAction,
      entity:    "KycVersion",
      entityId:  id,
      metadata:  {
        role,
        version: existing.version,
        ...(body.status ? { newStatus: body.status } : {}),
      },
    });

    return ok(kyc);
  } catch (err) {
    return serverError(err);
  }
}

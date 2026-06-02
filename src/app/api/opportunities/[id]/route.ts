import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { getRoleFromRequest, ok, noContent, notFound, serverError, guard } from "@/lib/api";

type Params = { params: Promise<{ id: string }> };

// PATCH /api/opportunities/[id]
export async function PATCH(req: NextRequest, { params }: Params) {
  try {
    const role = getRoleFromRequest(req);
    const denied = guard(role, "opportunity:update");
    if (denied) return denied;

    const { id } = await params;
    const body = await req.json();

    const existing = await prisma.opportunity.findUnique({ where: { id } });
    if (!existing) return notFound("Opportunity");

    const isReviewing = body.pendingReview === false && existing.pendingReview;

    const opportunity = await prisma.opportunity.update({
      where: { id },
      data: {
        status:         body.status         ?? existing.status,
        serviceLine:    body.serviceLine    ?? existing.serviceLine,
        description:    body.description    ?? existing.description,
        estimatedValue: body.estimatedValue != null ? Number(body.estimatedValue) : existing.estimatedValue,
        effort:         body.effort         ?? existing.effort,
        probability:    body.probability    != null ? Number(body.probability) : existing.probability,
        nextAction:     body.nextAction     ?? existing.nextAction,
        pendingReview:  body.pendingReview  !== undefined ? body.pendingReview  : existing.pendingReview,
        reviewNote:     body.reviewNote     !== undefined ? body.reviewNote     : existing.reviewNote,
        reviewedAt:     isReviewing ? new Date() : existing.reviewedAt,
      },
    });

    return ok(opportunity);
  } catch (err) {
    return serverError(err);
  }
}

// DELETE /api/opportunities/[id]
export async function DELETE(req: NextRequest, { params }: Params) {
  try {
    const role = getRoleFromRequest(req);
    const denied = guard(role, "opportunity:delete");
    if (denied) return denied;

    const { id } = await params;
    const existing = await prisma.opportunity.findUnique({ where: { id } });
    if (!existing) return notFound("Opportunity");

    await prisma.opportunity.delete({ where: { id } });
    return noContent();
  } catch (err) {
    return serverError(err);
  }
}

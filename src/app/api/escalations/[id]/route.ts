import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { getRoleFromRequest, ok, noContent, notFound, serverError, guard } from "@/lib/api";

type Params = { params: Promise<{ id: string }> };

// PATCH /api/escalations/[id]
// Supports: { status } for transitions, { resolutionNotes } when resolving
export async function PATCH(req: NextRequest, { params }: Params) {
  try {
    const role = getRoleFromRequest(req);
    const denied = guard(role, "escalation:update");
    if (denied) return denied;

    const { id } = await params;
    const body = await req.json();

    const existing = await prisma.escalation.findUnique({ where: { id } });
    if (!existing) return notFound("Escalation");

    // Resolving requires the resolve permission
    if (body.status === "RESOLVED") {
      const resolvedenied = guard(role, "escalation:resolve");
      if (resolvedenied) return resolvedenied;
    }

    const escalation = await prisma.escalation.update({
      where: { id },
      data: {
        status:          body.status          ?? existing.status,
        severity:        body.severity        ?? existing.severity,
        description:     body.description     ?? existing.description,
        linkedProject:   body.linkedProject   ?? existing.linkedProject,
        resolutionNotes: body.resolutionNotes ?? existing.resolutionNotes,
        closedAt:        body.status === "RESOLVED" ? new Date() : existing.closedAt,
      },
    });

    return ok(escalation);
  } catch (err) {
    return serverError(err);
  }
}

// DELETE /api/escalations/[id]  (managers only via permission check)
export async function DELETE(req: NextRequest, { params }: Params) {
  try {
    const role = getRoleFromRequest(req);
    const denied = guard(role, "escalation:update");
    if (denied) return denied;

    const { id } = await params;
    const existing = await prisma.escalation.findUnique({ where: { id } });
    if (!existing) return notFound("Escalation");

    await prisma.escalation.delete({ where: { id } });
    return noContent();
  } catch (err) {
    return serverError(err);
  }
}

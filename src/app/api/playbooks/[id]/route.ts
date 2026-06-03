import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { getRoleFromRequest, ok, badRequest, notFound, serverError, guard } from "@/lib/api";
import { logAudit } from "@/lib/audit";

type Params = { params: Promise<{ id: string }> };

// PATCH /api/playbooks/[id]
export async function PATCH(req: NextRequest, { params }: Params) {
  try {
    const role = getRoleFromRequest(req);
    const denied = guard(role, "playbook:archive");
    if (denied) return denied;

    const { id } = await params;
    const body = await req.json();
    if (body.status !== "ARCHIVED") return badRequest("Only status=ARCHIVED is supported");

    const existing = await prisma.playbook.findUnique({ where: { id } });
    if (!existing) return notFound("Playbook");

    const playbook = await prisma.playbook.update({
      where: { id },
      data: {
        status: "ARCHIVED",
        archivedAt: new Date(),
      },
      include: {
        uploadedBy: { select: { id: true, name: true, email: true, role: true } },
        _count: { select: { rules: true } },
      },
    });

    await logAudit({
      role,
      action: "playbook.archived",
      entity: "Playbook",
      entityId: playbook.id,
      metadata: { title: playbook.title },
    });

    return ok(playbook);
  } catch (err) {
    return serverError(err);
  }
}

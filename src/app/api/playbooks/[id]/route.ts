import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { getRoleFromRequest, ok, notFound, badRequest, serverError, guard } from "@/lib/api";
import { logAudit } from "@/lib/audit";

// GET /api/playbooks/[id] — single playbook with rules
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const role = getRoleFromRequest(req);
    const denied = guard(role, "playbook:view");
    if (denied) return denied;

    const { id } = await params;
    const playbook = await prisma.playbook.findUnique({
      where: { id },
      include: {
        uploadedBy: { select: { id: true, name: true, role: true } },
        rules: { orderBy: [{ priority: "asc" }, { createdAt: "desc" }] },
        _count: { select: { rules: true } },
      },
    });

    if (!playbook) return notFound("Playbook not found");
    return ok({ ...playbook, ruleCount: playbook._count.rules, _count: undefined });
  } catch (err) {
    return serverError(err);
  }
}

// PATCH /api/playbooks/[id] — archive / restore a playbook
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const role = getRoleFromRequest(req);
    const denied = guard(role, "playbook:update");
    if (denied) return denied;

    const { id } = await params;
    const body = await req.json();
    const { status } = body;

    if (!["ACTIVE", "ARCHIVED"].includes(status)) {
      return badRequest("status must be ACTIVE or ARCHIVED");
    }

    const playbook = await prisma.playbook.update({
      where: { id },
      data: { status },
    });

    logAudit({
      role,
      action: "playbook_status_changed",
      entity: "Playbook",
      entityId: id,
      metadata: { status },
    });

    return ok(playbook);
  } catch (err) {
    return serverError(err);
  }
}

// DELETE /api/playbooks/[id] — hard delete (rules cascade)
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const role = getRoleFromRequest(req);
    const denied = guard(role, "playbook:delete");
    if (denied) return denied;

    const { id } = await params;
    await prisma.playbook.delete({ where: { id } });

    logAudit({
      role,
      action: "playbook_deleted",
      entity: "Playbook",
      entityId: id,
    });

    return ok({ deleted: true });
  } catch (err) {
    return serverError(err);
  }
}

import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { getRoleFromRequest, ok, noContent, notFound, badRequest, serverError, guard } from "@/lib/api";

type Params = { params: Promise<{ id: string }> };

// GET /api/actions/[id]
export async function GET(req: NextRequest, { params }: Params) {
  try {
    const role = getRoleFromRequest(req);
    const denied = guard(role, "action:view");
    if (denied) return denied;

    const { id } = await params;
    const action = await prisma.action.findUnique({
      where: { id },
      include: {
        owner:   { select: { id: true, name: true } },
        account: { select: { id: true, name: true, health: true } },
      },
    });
    if (!action) return notFound("Action");
    return ok(action);
  } catch (err) {
    return serverError(err);
  }
}

// PATCH /api/actions/[id]
export async function PATCH(req: NextRequest, { params }: Params) {
  try {
    const role = getRoleFromRequest(req);
    const denied = guard(role, "action:update");
    if (denied) return denied;

    const { id } = await params;
    const body = await req.json();

    const existing = await prisma.action.findUnique({ where: { id } });
    if (!existing) return notFound("Action");

    const now = new Date();
    const completedAt = body.status === "DONE"      ? now : existing.completedAt;
    const dismissedAt = body.status === "DISMISSED" ? now : existing.dismissedAt;

    const action = await prisma.action.update({
      where: { id },
      data: {
        title:         body.title         ?? existing.title,
        description:   body.description   ?? existing.description,
        status:        body.status        ?? existing.status,
        priority:      body.priority      ?? existing.priority,
        dueDate:       body.dueDate       ? new Date(body.dueDate) : existing.dueDate,
        ownerId:       body.ownerId       ?? existing.ownerId,
        dismissReason: body.dismissReason ?? existing.dismissReason,
        completedAt,
        dismissedAt,
      },
    });

    // Store optional completion note as a comment
    if (body.completionNote?.trim()) {
      await prisma.actionComment.create({
        data: { actionId: id, content: body.completionNote.trim() },
      });
    }

    return ok(action);
  } catch (err) {
    return serverError(err);
  }
}

// DELETE /api/actions/[id]
export async function DELETE(req: NextRequest, { params }: Params) {
  try {
    const role = getRoleFromRequest(req);
    const denied = guard(role, "action:delete");
    if (denied) return denied;

    const { id } = await params;

    const existing = await prisma.action.findUnique({ where: { id } });
    if (!existing) return notFound("Action");

    await prisma.action.delete({ where: { id } });
    return noContent();
  } catch (err) {
    return serverError(err);
  }
}

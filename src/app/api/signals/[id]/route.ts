import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { getRoleFromRequest, ok, notFound, serverError, guard } from "@/lib/api";

type Params = { params: Promise<{ id: string }> };

// PATCH /api/signals/[id]  — resolve or mark as read
export async function PATCH(req: NextRequest, { params }: Params) {
  try {
    const role = getRoleFromRequest(req);
    const { id } = await params;
    const body   = await req.json();

    const existing = await prisma.signal.findUnique({ where: { id } });
    if (!existing) return notFound("Signal");

    // Resolving requires the resolve permission; reading only requires view
    if (body.isResolved) {
      const denied = guard(role, "signal:resolve");
      if (denied) return denied;
    } else {
      const denied = guard(role, "signal:view");
      if (denied) return denied;
    }

    const signal = await prisma.signal.update({
      where: { id },
      data: {
        isResolved:   body.isResolved    ?? existing.isResolved,
        resolvedAt:   body.isResolved    ? new Date() : existing.resolvedAt,
        resolvedNote: body.resolvedNote  !== undefined ? body.resolvedNote : existing.resolvedNote,
        isRead:       body.isRead        ?? existing.isRead,
        pendingReview: body.pendingReview !== undefined ? body.pendingReview : existing.pendingReview,
      },
    });

    return ok(signal);
  } catch (err) {
    return serverError(err);
  }
}

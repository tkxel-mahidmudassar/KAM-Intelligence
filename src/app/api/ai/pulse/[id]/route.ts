import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { getRoleFromRequest, ok, notFound, serverError, guard } from "@/lib/api";

type Params = { params: Promise<{ id: string }> };

// PATCH /api/ai/pulse/[id]  — mark read or dismiss an AI insight
export async function PATCH(req: NextRequest, { params }: Params) {
  try {
    const role = getRoleFromRequest(req);
    const denied = guard(role, "insight:view");
    if (denied) return denied;

    const { id } = await params;
    const body   = await req.json();

    const existing = await prisma.aIPulseInsight.findUnique({ where: { id } });
    if (!existing) return notFound("Insight");

    // Dismissing requires dismiss permission
    if (body.isDismissed) {
      const dismissed = guard(role, "insight:dismiss");
      if (dismissed) return dismissed;
    }

    const insight = await prisma.aIPulseInsight.update({
      where: { id },
      data: {
        isRead:      body.isRead      ?? existing.isRead,
        isDismissed: body.isDismissed ?? existing.isDismissed,
      },
    });

    return ok(insight);
  } catch (err) {
    return serverError(err);
  }
}

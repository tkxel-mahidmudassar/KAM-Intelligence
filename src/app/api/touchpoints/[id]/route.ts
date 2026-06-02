import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { getRoleFromRequest, ok, noContent, notFound, serverError, guard } from "@/lib/api";

type Params = { params: Promise<{ id: string }> };

// DELETE /api/touchpoints/[id]
export async function DELETE(req: NextRequest, { params }: Params) {
  try {
    const role = getRoleFromRequest(req);
    const denied = guard(role, "touchpoint:delete");
    if (denied) return denied;

    const { id } = await params;
    const existing = await prisma.touchpoint.findUnique({ where: { id } });
    if (!existing) return notFound("Touchpoint");

    await prisma.touchpoint.delete({ where: { id } });
    return noContent();
  } catch (err) {
    return serverError(err);
  }
}

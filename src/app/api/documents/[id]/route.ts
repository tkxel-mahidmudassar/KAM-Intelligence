import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { getRoleFromRequest, ok, noContent, notFound, serverError, guard } from "@/lib/api";

type Params = { params: Promise<{ id: string }> };

// GET /api/documents/[id]
export async function GET(req: NextRequest, { params }: Params) {
  try {
    const role = getRoleFromRequest(req);
    const denied = guard(role, "document:view");
    if (denied) return denied;

    const { id } = await params;
    const doc = await prisma.document.findUnique({ where: { id } });
    if (!doc) return notFound("Document");
    return ok(doc);
  } catch (err) {
    return serverError(err);
  }
}

// DELETE /api/documents/[id]
export async function DELETE(req: NextRequest, { params }: Params) {
  try {
    const role = getRoleFromRequest(req);
    const denied = guard(role, "document:delete");
    if (denied) return denied;

    const { id } = await params;
    const doc = await prisma.document.findUnique({ where: { id } });
    if (!doc) return notFound("Document");

    await prisma.document.delete({ where: { id } });
    return noContent();
  } catch (err) {
    return serverError(err);
  }
}

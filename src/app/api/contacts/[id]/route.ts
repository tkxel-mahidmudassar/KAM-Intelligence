import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { getRoleFromRequest, ok, noContent, notFound, serverError, guard } from "@/lib/api";

type Params = { params: Promise<{ id: string }> };

// PATCH /api/contacts/[id]
export async function PATCH(req: NextRequest, { params }: Params) {
  try {
    const role = getRoleFromRequest(req);
    const denied = guard(role, "contact:update");
    if (denied) return denied;

    const { id }  = await params;
    const body    = await req.json();
    const existing = await prisma.accountContact.findUnique({ where: { id } });
    if (!existing) return notFound("Contact");

    // Clear other primaries if promoting this one
    if (body.isPrimary && !existing.isPrimary) {
      await prisma.accountContact.updateMany({
        where: { accountId: existing.accountId, isPrimary: true },
        data:  { isPrimary: false },
      });
    }

    const contact = await prisma.accountContact.update({
      where: { id },
      data: {
        name:      body.name      ?? existing.name,
        title:     body.title     !== undefined ? body.title     : existing.title,
        email:     body.email     !== undefined ? body.email     : existing.email,
        phone:     body.phone     !== undefined ? body.phone     : existing.phone,
        isPrimary: body.isPrimary !== undefined ? body.isPrimary : existing.isPrimary,
      },
    });
    return ok(contact);
  } catch (err) {
    return serverError(err);
  }
}

// DELETE /api/contacts/[id]
export async function DELETE(req: NextRequest, { params }: Params) {
  try {
    const role = getRoleFromRequest(req);
    const denied = guard(role, "contact:delete");
    if (denied) return denied;

    const { id } = await params;
    const existing = await prisma.accountContact.findUnique({ where: { id } });
    if (!existing) return notFound("Contact");

    await prisma.accountContact.delete({ where: { id } });
    return noContent();
  } catch (err) {
    return serverError(err);
  }
}

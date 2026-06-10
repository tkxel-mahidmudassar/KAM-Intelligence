import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { getRoleFromRequest, ok, noContent, notFound, serverError, guard } from "@/lib/api";
import { logAudit } from "@/lib/audit";

type Params = { params: Promise<{ id: string }> };

// PATCH /api/users/[id] — update user access/profile fields (MANAGER+)
export async function PATCH(req: NextRequest, { params }: Params) {
  try {
    const role = getRoleFromRequest(req);
    const denied = guard(role, "user:update");
    if (denied) return denied;

    const { id } = await params;
    const body = await req.json();

    const existing = await prisma.user.findUnique({ where: { id } });
    if (!existing) return notFound("User");

    const validRoles = ["ASSOCIATE", "KAM", "EXECUTIVE"];

    const user = await prisma.user.update({
      where: { id },
      data: {
        name:      body.name?.trim()      ?? existing.name,
        role:      (body.role && validRoles.includes(body.role)) ? body.role : existing.role,
        avatarUrl: body.avatarUrl !== undefined ? body.avatarUrl : existing.avatarUrl,
        managerId: body.managerId !== undefined ? body.managerId : existing.managerId,
      },
    });

    await logAudit({ role, action: "user.update", entity: "User", entityId: id, metadata: { name: user.name, userRole: user.role } });

    return ok(user);
  } catch (err) {
    return serverError(err);
  }
}

// DELETE /api/users/[id] — delete user (ADMIN only)
export async function DELETE(req: NextRequest, { params }: Params) {
  try {
    const role = getRoleFromRequest(req);
    const denied = guard(role, "user:delete");
    if (denied) return denied;

    const { id } = await params;
    const existing = await prisma.user.findUnique({ where: { id } });
    if (!existing) return notFound("User");

    await prisma.user.delete({ where: { id } });
    await logAudit({ role, action: "user.delete", entity: "User", entityId: id, metadata: { name: existing.name } });

    return noContent();
  } catch (err) {
    return serverError(err);
  }
}

import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  getRoleFromRequest, getUserIdFromRequest,
  ok, notFound, badRequest, serverError, guard,
} from "@/lib/api";
import { logAudit } from "@/lib/audit";

// Resolve the "current user" from request context.
// In this POC we use x-user-id header if present, otherwise first user with the current role.
async function resolveUser(req: NextRequest) {
  const role = getRoleFromRequest(req);
  const headerUserId = getUserIdFromRequest(req);

  if (headerUserId) {
    return prisma.user.findUnique({ where: { id: headerUserId }, include: { manager: { select: { id: true, name: true, role: true } }, reports: { select: { id: true, name: true, role: true, avatarUrl: true } } } });
  }

  // Fallback: first user whose role matches
  const prismaRole = role as import("@prisma/client").Role;
  return prisma.user.findFirst({
    where: { role: prismaRole },
    orderBy: { createdAt: "asc" },
    include: {
      manager: { select: { id: true, name: true, role: true } },
      reports: { select: { id: true, name: true, role: true, avatarUrl: true } },
    },
  });
}

// GET /api/users/me
export async function GET(req: NextRequest) {
  try {
    const role = getRoleFromRequest(req);
    const denied = guard(role, "account:view"); // Minimum permission gate
    if (denied) return denied;

    const user = await resolveUser(req);
    if (!user) return notFound("User");

    return ok(user);
  } catch (err) {
    return serverError(err);
  }
}

// PATCH /api/users/me  { name?, phone?, notificationPrefs? }
export async function PATCH(req: NextRequest) {
  try {
    const role = getRoleFromRequest(req);
    const denied = guard(role, "account:view");
    if (denied) return denied;

    const current = await resolveUser(req);
    if (!current) return notFound("User");

    const body = await req.json();
    const { name, phone, notificationPrefs } = body;

    if (name !== undefined && typeof name !== "string") return badRequest("name must be a string");
    if (phone !== undefined && typeof phone !== "string") return badRequest("phone must be a string");

    const updated = await prisma.user.update({
      where: { id: current.id },
      data: {
        ...(name !== undefined ? { name: name.trim() } : {}),
        ...(phone !== undefined ? { phone: phone.trim() || null } : {}),
        ...(notificationPrefs !== undefined ? { notificationPrefs } : {}),
      },
      include: {
        manager: { select: { id: true, name: true, role: true } },
        reports: { select: { id: true, name: true, role: true, avatarUrl: true } },
      },
    });

    await logAudit({
      role,
      action: "user.profile_updated",
      entity: "User",
      entityId: current.id,
      metadata: { role, fields: Object.keys(body) },
    });

    return ok(updated);
  } catch (err) {
    return serverError(err);
  }
}

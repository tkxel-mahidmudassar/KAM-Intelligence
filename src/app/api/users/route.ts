import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { getRoleFromRequest, ok, created, badRequest, serverError, guard } from "@/lib/api";
import { logAudit } from "@/lib/audit";

// GET /api/users — list all users (MANAGER+)
export async function GET(req: NextRequest) {
  try {
    const role = getRoleFromRequest(req);
    const denied = guard(role, "user:view");
    if (denied) return denied;

    const users = await prisma.user.findMany({
      select: {
        id:        true,
        name:      true,
        email:     true,
        role:      true,
        avatarUrl: true,
        managerId: true,
        createdAt: true,
        _count: { select: { managedAccounts: true } },
      },
      orderBy: [{ role: "asc" }, { name: "asc" }],
    });

    return ok({ users });
  } catch (err) {
    return serverError(err);
  }
}

// POST /api/users — create user (ADMIN only)
export async function POST(req: NextRequest) {
  try {
    const role = getRoleFromRequest(req);
    const denied = guard(role, "user:create");
    if (denied) return denied;

    const body = await req.json();
    const { name, email, role: userRole, avatarUrl, initialPassword, managerId } = body;

    if (!name?.trim() || !email?.trim()) return badRequest("name and email are required");
    const validRoles = ["ASSOCIATE", "KAM", "EXECUTIVE"];
    if (userRole && !validRoles.includes(userRole)) return badRequest("Invalid role");
    if (initialPassword !== undefined && !String(initialPassword).trim()) return badRequest("Initial password cannot be empty");

    const existing = await prisma.user.findUnique({ where: { email: email.toLowerCase() } });
    if (existing) return badRequest("A user with this email already exists");

    const user = await prisma.user.create({
      data: {
        name:      name.trim(),
        email:     email.toLowerCase().trim(),
        role:      userRole ?? "KAM",
        avatarUrl: avatarUrl ?? null,
        managerId: managerId ?? null,
      },
    });

    await logAudit({ role, accountId: undefined, action: "user.create", entity: "User", entityId: user.id, metadata: { name: user.name, userRole: user.role } });

    return created(user);
  } catch (err) {
    return serverError(err);
  }
}

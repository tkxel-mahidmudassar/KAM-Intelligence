import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { getRoleFromRequest, getUserIdFromRequest, ok, serverError, guard } from "@/lib/api";

/**
 * GET /api/users/team
 *
 * Returns the team hierarchy visible to the current user:
 * - MANAGER / EXECUTIVE / ADMIN: all users grouped by role, with account counts
 * - KAM: their manager + their direct reports (associates)
 * - ASSOCIATE: their supervising KAM + siblings (other associates under the same KAM)
 */
export async function GET(req: NextRequest) {
  try {
    const role = getRoleFromRequest(req);
    const denied = guard(role, "account:view");
    if (denied) return denied;

    const headerUserId = getUserIdFromRequest(req);
    const prismaRole = role as import("@prisma/client").Role;

    // Resolve current user
    const currentUser = headerUserId
      ? await prisma.user.findUnique({ where: { id: headerUserId } })
      : await prisma.user.findFirst({ where: { role: prismaRole }, orderBy: { createdAt: "asc" } });

    if (role === "KAM" || role === "MANAGER" || role === "EXECUTIVE" || role === "ADMIN") {
      // Full team: all users grouped, with KAM→associate nesting
      const allUsers = await prisma.user.findMany({
        orderBy: [{ role: "asc" }, { name: "asc" }],
        include: {
          _count: { select: { managedAccounts: true } },
          reports: {
            select: { id: true, name: true, role: true, avatarUrl: true, phone: true },
          },
        },
      });

      // Separate into tiers
      const managers    = allUsers.filter((u) => u.role === "KAM" || role === "MANAGER");
      const kams        = allUsers.filter((u) => u.role === "KAM");
      const associates  = allUsers.filter((u) => u.role === "ASSOCIATE");
      const executives  = allUsers.filter((u) => u.role === "EXECUTIVE");

      return ok({
        view: "full",
        currentUserId: currentUser?.id ?? null,
        tiers: { managers, kams, associates, executives },
      });
    }

    // KAM or ASSOCIATE: scoped view
    if (!currentUser) return ok({ view: "scoped", currentUser: null, manager: null, peers: [], reports: [] });

    const [manager, reports] = await Promise.all([
      currentUser.managerId
        ? prisma.user.findUnique({
            where: { id: currentUser.managerId },
            include: { _count: { select: { managedAccounts: true } } },
          })
        : Promise.resolve(null),
      prisma.user.findMany({
        where: { managerId: currentUser.id },
        include: { _count: { select: { managedAccounts: true } } },
      }),
    ]);

    // Peers: other users with the same manager
    const peers = currentUser.managerId
      ? await prisma.user.findMany({
          where: { managerId: currentUser.managerId, id: { not: currentUser.id } },
          select: { id: true, name: true, role: true, avatarUrl: true },
        })
      : [];

    return ok({
      view: "scoped",
      currentUser: { ...currentUser, accountCount: 0 },
      manager,
      reports,
      peers,
    });
  } catch (err) {
    return serverError(err);
  }
}

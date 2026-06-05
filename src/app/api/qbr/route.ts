import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { getRoleFromRequest, ok, serverError, guard, kamWhere } from "@/lib/api";

// GET /api/qbr — returns QBR sessions across the portfolio
export async function GET(req: NextRequest) {
  try {
    const role   = getRoleFromRequest(req);
    const denied = guard(role, "qbr:view");
    if (denied) return denied;

    // For KAM scoping: need to find the KAM user
    let kamAccountIds: string[] | undefined;
    if (role === "KAM") {
      const kamUser = await prisma.user.findFirst({ where: { role: "KAM" }, orderBy: { createdAt: "asc" } });
      if (kamUser) {
        const accs = await prisma.account.findMany({
          where: { kamId: kamUser.id },
          select: { id: true },
        });
        kamAccountIds = accs.map((a) => a.id);
      }
    }

    const sessions = await prisma.qbrSession.findMany({
      where: kamAccountIds ? { accountId: { in: kamAccountIds } } : {},
      include: {
        account: { select: { id: true, name: true, health: true } },
        items: true,
      },
      orderBy: [{ status: "asc" }, { scheduledAt: "desc" }],
    });

    return ok(sessions);
  } catch (err) {
    return serverError(err);
  }
}

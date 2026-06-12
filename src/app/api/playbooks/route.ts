import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { getRoleFromRequest, ok, serverError, guard } from "@/lib/api";

// GET /api/playbooks — list all playbooks
export async function GET(req: NextRequest) {
  try {
    const role = getRoleFromRequest(req);
    const denied = guard(role, "playbook:view");
    if (denied) return denied;

    const includeArchived = req.nextUrl.searchParams.get("includeArchived") === "true";

    const playbooks = await prisma.playbook.findMany({
      where: includeArchived ? undefined : { status: { not: "ARCHIVED" } },
      orderBy: { createdAt: "desc" },
      include: {
        uploadedBy: { select: { id: true, name: true, role: true } },
        _count: { select: { rules: true, exclusions: true } },
      },
    });

    return ok(
      playbooks.map((p) => ({
        ...p,
        ruleCount: p._count.rules,
        exclusionCount: p._count.exclusions,
        _count: undefined,
      }))
    );
  } catch (err) {
    return serverError(err);
  }
}

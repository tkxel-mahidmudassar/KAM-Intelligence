import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { getRoleFromRequest, ok, serverError, guard } from "@/lib/api";

// GET /api/playbooks?includeArchived=false
export async function GET(req: NextRequest) {
  try {
    const role = getRoleFromRequest(req);
    const denied = guard(role, "playbook:view");
    if (denied) return denied;

    const { searchParams } = new URL(req.url);
    const includeArchived = searchParams.get("includeArchived") === "true" && role !== "EXECUTIVE";

    const playbooks = await prisma.playbook.findMany({
      where: includeArchived ? {} : { status: { not: "ARCHIVED" } },
      include: {
        uploadedBy: { select: { id: true, name: true, email: true, role: true } },
        _count: { select: { rules: true } },
      },
      orderBy: [{ updatedAt: "desc" }, { createdAt: "desc" }],
    });

    return ok(playbooks);
  } catch (err) {
    return serverError(err);
  }
}

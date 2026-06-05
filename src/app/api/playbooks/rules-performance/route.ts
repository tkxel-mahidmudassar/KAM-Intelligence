import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { getRoleFromRequest, ok, serverError, guard } from "@/lib/api";

// GET /api/playbooks/rules-performance
// Returns PlaybookRules with quality scores, for the Settings Rule Performance tab.
// Manager/Admin only.
export async function GET(req: NextRequest) {
  try {
    const role = getRoleFromRequest(req);
    const denied = guard(role, "playbook:view");
    if (denied) return denied;

    // Only rules with some feedback data
    const rules = await prisma.playbookRule.findMany({
      where: {
        playbook: { status: "ACTIVE" },
        OR: [
          { actionCount: { gt: 0 } },
          { dismissCount: { gt: 0 } },
        ],
      },
      include: {
        playbook: { select: { id: true, title: true } },
      },
      orderBy: [
        { qualityScore: { sort: "asc", nulls: "last" } },
        { dismissCount: "desc" },
      ],
    });

    return ok(rules);
  } catch (err) {
    return serverError(err);
  }
}

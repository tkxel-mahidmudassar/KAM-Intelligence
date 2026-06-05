import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { getRoleFromRequest, ok, notFound, serverError, guard } from "@/lib/api";
import { getJiraAdapter } from "@/lib/adapters/jira";
import { getWorksphereAdapter } from "@/lib/adapters/worksphere";
import { getFinanceAdapter } from "@/lib/adapters/finance";
import { calculateKpiSubscores } from "@/lib/scoring/kpi";

/**
 * GET /api/accounts/[id]/kpi-breakdown
 *
 * Returns the computed sub-scores for each of the 8 KPI dimensions.
 * Uses live mock adapter data so numbers match what the scoring engine would compute.
 * No LLM call — pure math, fast.
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const role = getRoleFromRequest(req);
    const denied = guard(role, "kpi:view");
    if (denied) return denied;

    const { id: accountId } = await params;

    const account = await prisma.account.findUnique({
      where: { id: accountId },
      select: { id: true, arr: true, contractStart: true, contractEnd: true },
    });
    if (!account) return notFound("Account");

    const kpiDimensions = await prisma.kpiDimension.findMany({
      where: { accountId },
    });

    const [jiraAdapter, worksphereAdapter, financeAdapter] = await Promise.all([
      getJiraAdapter().fetch(accountId),
      getWorksphereAdapter().fetch(accountId),
      getFinanceAdapter().fetch(accountId),
    ]);

    const kpis = kpiDimensions.map((d) => ({
      name: d.name,
      category: d.category,
      value: d.value,
      target: d.target ?? d.value,
    }));

    const { breakdown } = calculateKpiSubscores({
      account,
      kpis,
      jira: jiraAdapter.data,
      worksphere: worksphereAdapter.data,
      finance: financeAdapter.data,
    });

    return ok(breakdown);
  } catch (err) {
    return serverError(err);
  }
}

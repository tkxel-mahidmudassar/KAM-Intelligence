import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  getRoleFromRequest, ok, badRequest, notFound, serverError, guard,
} from "@/lib/api";
import { getSalesforceAdapter } from "@/lib/adapters/salesforce";
import { getJiraAdapter } from "@/lib/adapters/jira";
import { getWorksphereAdapter } from "@/lib/adapters/worksphere";
import { getFinanceAdapter } from "@/lib/adapters/finance";

type Params = { params: Promise<{ id: string }> };

// GET /api/accounts/[id]
export async function GET(req: NextRequest, { params }: Params) {
  try {
    const role = getRoleFromRequest(req);
    const denied = guard(role, "account:view");
    if (denied) return denied;

    const { id } = await params;

    const account = await prisma.account.findUnique({
      where: { id },
      include: {
        kam: { select: { id: true, name: true, email: true } },
        contacts: { orderBy: { isPrimary: "desc" } },
        kamScores: { orderBy: { computedAt: "desc" }, take: 5 },
        kpiDimensions: { orderBy: { recordedAt: "desc" } },
        actions: {
          where: { status: { not: "DONE" } },
          include: { owner: { select: { id: true, name: true } } },
          orderBy: [{ priority: "asc" }, { dueDate: "asc" }],
        },
        signals: {
          where: { isResolved: false },
          orderBy: [{ severity: "asc" }, { detectedAt: "desc" }],
        },
        documents: { orderBy: { createdAt: "desc" } },
        kycVersions: { orderBy: { version: "desc" }, take: 1 },
        qbrSessions: {
          include: { items: { orderBy: { order: "asc" } } },
          orderBy: { createdAt: "desc" },
          take: 5,
        },
        insights: {
          where: { isDismissed: false },
          orderBy: { generatedAt: "desc" },
          take: 5,
        },
      },
    });

    if (!account) return notFound("Account");

    // Fetch adapter data in parallel
    const [sf, jira, worksphere, finance] = await Promise.all([
      getSalesforceAdapter().fetch(id),
      getJiraAdapter().fetch(id),
      getWorksphereAdapter().fetch(id),
      getFinanceAdapter().fetch(id),
    ]);

    return ok({
      ...account,
      adapters: {
        salesforce: sf.data,
        jira: jira.data,
        worksphere: worksphere.data,
        finance: finance.data,
      },
    });
  } catch (err) {
    return serverError(err);
  }
}

// PATCH /api/accounts/[id]
export async function PATCH(req: NextRequest, { params }: Params) {
  try {
    const role = getRoleFromRequest(req);
    const denied = guard(role, "account:update");
    if (denied) return denied;

    const { id } = await params;
    const body = await req.json();

    const account = await prisma.account.update({
      where: { id },
      data: {
        name:     body.name,
        industry: body.industry,
        region:   body.region,
        country:  body.country,
        arr:      body.arr,
        health:   body.health,
        kamId:    body.kamId,
      },
    });

    return ok(account);
  } catch (err) {
    return serverError(err);
  }
}

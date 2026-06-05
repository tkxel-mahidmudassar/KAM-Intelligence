import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { getRoleFromRequest, ok, created, badRequest, serverError, guard } from "@/lib/api";

// GET /api/kyc?accountId=xxx
export async function GET(req: NextRequest) {
  try {
    const role = getRoleFromRequest(req);
    const denied = guard(role, "kyc:view");
    if (denied) return denied;

    const { searchParams } = new URL(req.url);
    const accountId = searchParams.get("accountId") ?? undefined;

    const versions = await prisma.kycVersion.findMany({
      where: accountId ? { accountId } : {},
      include: {
        account: { select: { id: true, name: true } },
        author:  { select: { id: true, name: true } },
      },
      orderBy: [{ accountId: "asc" }, { version: "desc" }],
    });

    return ok(versions);
  } catch (err) {
    return serverError(err);
  }
}

// POST /api/kyc
export async function POST(req: NextRequest) {
  try {
    const role = getRoleFromRequest(req);
    const denied = guard(role, "kyc:create");
    if (denied) return denied;

    const body = await req.json();
    const { accountId, authorId, ...fields } = body;

    if (!accountId) return badRequest("accountId is required");

    // Get the next version number
    const latest = await prisma.kycVersion.findFirst({
      where: { accountId },
      orderBy: { version: "desc" },
    });

    const kyc = await prisma.kycVersion.create({
      data: {
        accountId,
        authorId: authorId ?? null,
        version: (latest?.version ?? 0) + 1,
        status: "DRAFT",
        executiveSummary:     fields.executiveSummary ?? null,
        businessModel:        fields.businessModel ?? null,
        keyStakeholders:      fields.keyStakeholders ?? null,
        strategicGoals:       fields.strategicGoals ?? null,
        riskFactors:          fields.riskFactors ?? null,
        expansionOpportunity: fields.expansionOpportunity ?? null,
      },
    });

    return created(kyc);
  } catch (err) {
    return serverError(err);
  }
}

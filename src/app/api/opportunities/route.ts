import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { getRoleFromRequest, ok, created, badRequest, serverError, guard } from "@/lib/api";

const VALID_STATUSES = ["IDENTIFIED", "QUALIFYING", "PROPOSAL", "WON", "LOST"] as const;
const VALID_EFFORTS  = ["LOW", "MEDIUM", "HIGH"] as const;

// GET /api/opportunities?accountId=xxx&status=IDENTIFIED
export async function GET(req: NextRequest) {
  try {
    const role = getRoleFromRequest(req);
    const denied = guard(role, "opportunity:view");
    if (denied) return denied;

    const { searchParams } = new URL(req.url);
    const accountId = searchParams.get("accountId") ?? undefined;
    const status    = searchParams.get("status")    ?? undefined;

    const opportunities = await prisma.opportunity.findMany({
      where: {
        ...(accountId ? { accountId } : {}),
        ...(status    ? { status }    : {}),
      },
      include: {
        account: { select: { id: true, name: true } },
      },
      orderBy: [{ status: "asc" }, { estimatedValue: "desc" }, { createdAt: "desc" }],
    });

    return ok(opportunities);
  } catch (err) {
    return serverError(err);
  }
}

// POST /api/opportunities
export async function POST(req: NextRequest) {
  try {
    const role = getRoleFromRequest(req);
    const denied = guard(role, "opportunity:create");
    if (denied) return denied;

    const body = await req.json();
    const { accountId, serviceLine, description, estimatedValue, effort, probability, nextAction, source } = body;

    if (!accountId)   return badRequest("accountId is required");
    if (!serviceLine) return badRequest("serviceLine is required");
    if (!description) return badRequest("description is required");
    if (effort && !VALID_EFFORTS.includes(effort)) {
      return badRequest(`effort must be one of: ${VALID_EFFORTS.join(", ")}`);
    }

    const opportunity = await prisma.opportunity.create({
      data: {
        accountId,
        serviceLine,
        description,
        estimatedValue: estimatedValue != null ? Number(estimatedValue) : null,
        effort:         effort         ?? null,
        probability:    probability    != null ? Number(probability) : null,
        nextAction:     nextAction     ?? null,
        source:         source         ?? "KAM",
        status:         "IDENTIFIED",
      },
    });

    return created(opportunity);
  } catch (err) {
    return serverError(err);
  }
}

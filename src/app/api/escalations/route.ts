import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { getRoleFromRequest, ok, created, badRequest, serverError, guard } from "@/lib/api";

const VALID_TYPES     = ["DELIVERY", "COMMERCIAL", "RELATIONSHIP", "OTHER"] as const;
const VALID_SEVERITIES = ["LOW", "MEDIUM", "HIGH", "CRITICAL"] as const;

// GET /api/escalations?accountId=xxx&status=OPEN
export async function GET(req: NextRequest) {
  try {
    const role = getRoleFromRequest(req);
    const denied = guard(role, "escalation:view");
    if (denied) return denied;

    const { searchParams } = new URL(req.url);
    const accountId = searchParams.get("accountId") ?? undefined;
    const status    = searchParams.get("status")    ?? undefined;

    const escalations = await prisma.escalation.findMany({
      where: {
        ...(accountId ? { accountId } : {}),
        ...(status    ? { status }    : {}),
      },
      include: {
        account: { select: { id: true, name: true } },
      },
      orderBy: [{ status: "asc" }, { openedAt: "desc" }],
    });

    return ok(escalations);
  } catch (err) {
    return serverError(err);
  }
}

// POST /api/escalations
export async function POST(req: NextRequest) {
  try {
    const role = getRoleFromRequest(req);
    const denied = guard(role, "escalation:create");
    if (denied) return denied;

    const body = await req.json();
    const { accountId, type, severity, description, linkedProject, openedById } = body;

    if (!accountId)   return badRequest("accountId is required");
    if (!type)        return badRequest("type is required");
    if (!description) return badRequest("description is required");
    if (!VALID_TYPES.includes(type)) return badRequest(`type must be one of: ${VALID_TYPES.join(", ")}`);
    if (severity && !VALID_SEVERITIES.includes(severity)) {
      return badRequest(`severity must be one of: ${VALID_SEVERITIES.join(", ")}`);
    }

    const escalation = await prisma.escalation.create({
      data: {
        accountId,
        type,
        severity:      severity      ?? "MEDIUM",
        description,
        linkedProject: linkedProject ?? null,
        openedById:    openedById    ?? null,
        status:        "OPEN",
      },
    });

    return created(escalation);
  } catch (err) {
    return serverError(err);
  }
}

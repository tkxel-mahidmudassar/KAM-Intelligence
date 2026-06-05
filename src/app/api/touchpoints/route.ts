import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { getRoleFromRequest, ok, created, badRequest, serverError, guard } from "@/lib/api";

// GET /api/touchpoints?accountId=xxx&type=MEETING
export async function GET(req: NextRequest) {
  try {
    const role = getRoleFromRequest(req);
    const denied = guard(role, "touchpoint:view");
    if (denied) return denied;

    const { searchParams } = new URL(req.url);
    const accountId = searchParams.get("accountId") ?? undefined;
    const type      = searchParams.get("type") ?? undefined;

    const touchpoints = await prisma.touchpoint.findMany({
      where: {
        ...(accountId ? { accountId } : {}),
        ...(type      ? { type }      : {}),
      },
      include: {
        account: { select: { id: true, name: true } },
      },
      orderBy: { date: "desc" },
    });

    return ok(touchpoints);
  } catch (err) {
    return serverError(err);
  }
}

// POST /api/touchpoints
export async function POST(req: NextRequest) {
  try {
    const role = getRoleFromRequest(req);
    const denied = guard(role, "touchpoint:create");
    if (denied) return denied;

    const body = await req.json();
    const { accountId, type, date, notes, stakeholders, loggedBy, linkedDocumentId } = body;

    if (!accountId) return badRequest("accountId is required");
    if (!type)      return badRequest("type is required");
    if (!date)      return badRequest("date is required");

    const VALID_TYPES = ["MEETING", "CALL", "EMAIL", "QBR", "OTHER"];
    if (!VALID_TYPES.includes(type)) return badRequest(`type must be one of: ${VALID_TYPES.join(", ")}`);

    const touchpoint = await prisma.touchpoint.create({
      data: {
        accountId,
        type,
        date:             new Date(date),
        notes:            notes            ?? null,
        stakeholders:     stakeholders     ?? null,
        loggedBy:         loggedBy         ?? null,
        linkedDocumentId: linkedDocumentId ?? null,
      },
    });

    return created(touchpoint);
  } catch (err) {
    return serverError(err);
  }
}

import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { getRoleFromRequest, ok, created, badRequest, serverError, guard } from "@/lib/api";
import { logAudit } from "@/lib/audit";

// POST /api/signals — manually log a signal on an account
export async function POST(req: NextRequest) {
  try {
    const role = getRoleFromRequest(req);
    const denied = guard(role, "signal:create");
    if (denied) return denied;

    const body = await req.json();
    const { accountId, type, severity, title, description } = body;

    if (!accountId) return badRequest("accountId is required");
    if (!type)      return badRequest("type is required");
    if (!title)     return badRequest("title is required");

    const signal = await prisma.signal.create({
      data: {
        accountId,
        type:        type as any,
        severity:    (severity ?? "WARNING") as any,
        title,
        description: description ?? null,
        source:      "KAM_MANUAL",
      },
    });

    await logAudit({
      role, accountId,
      action: "signal.created",
      entity: "Signal",
      entityId: signal.id,
      metadata: { type, severity, title },
    });

    return created(signal);
  } catch (err) {
    return serverError(err);
  }
}

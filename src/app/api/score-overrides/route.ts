import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { getRoleFromRequest, ok, created, badRequest, serverError, guard } from "@/lib/api";
import { logAudit } from "@/lib/audit";
import { scoreDimensionFromKey } from "@/lib/scoring/scoreOverrideMath";
import { createApprovedOverrideScoreSnapshot } from "@/lib/scoring/scoreOverrideSnapshot";

// GET /api/score-overrides?accountId=xxx   — list for one account
// GET /api/score-overrides?status=PENDING  — all pending (manager view)
export async function GET(req: NextRequest) {
  try {
    const role = getRoleFromRequest(req);
    const denied = guard(role, "score:view");
    if (denied) return denied;

    const { searchParams } = new URL(req.url);
    const accountId = searchParams.get("accountId") ?? undefined;
    const status    = searchParams.get("status")    ?? undefined;

    const overrides = await prisma.scoreOverride.findMany({
      where: {
        ...(accountId ? { accountId } : {}),
        ...(status    ? { status }    : {}),
      },
      include: { account: { select: { id: true, name: true, health: true } } },
      orderBy: { createdAt: "desc" },
      take: 100,
    });

    return ok(overrides);
  } catch (err) {
    return serverError(err);
  }
}

// POST /api/score-overrides  — Associate requests an override for KAM review
export async function POST(req: NextRequest) {
  try {
    const role = getRoleFromRequest(req);
    const canDirectApprove = role === "KAM" || role === "MANAGER" || role === "ADMIN";
    if (role !== "ASSOCIATE" && !canDirectApprove) {
      return badRequest("Only Associates can request score overrides and KAM reviewer roles can apply direct overrides");
    }
    const denied = guard(role, canDirectApprove ? "score:approve" : "score:view");
    if (denied) return denied;

    const body = await req.json();
    const { accountId, kpiKey, requestedValue, reason, requestedById, approvedById } = body;

    if (!accountId || !kpiKey || requestedValue === undefined || !reason) {
      return badRequest("accountId, kpiKey, requestedValue and reason are required");
    }

    // Find the most recent score to record the previous value
    const latestScore = await prisma.kamScore.findFirst({
      where: { accountId },
      orderBy: { computedAt: "desc" },
    });

    const dimension = scoreDimensionFromKey(kpiKey);
    const previousValue = latestScore && dimension
      ? ((latestScore as Record<string, unknown>)[dimension] as number | null) ?? latestScore.overall
      : latestScore?.overall ?? 50;

    const override = await prisma.scoreOverride.create({
      data: {
        accountId,
        kpiKey,
        previousValue,
        requestedValue: Number(requestedValue),
        approvedValue: canDirectApprove ? Number(requestedValue) : null,
        reason,
        requestedById: requestedById ?? null,
        approvedById: canDirectApprove ? approvedById ?? requestedById ?? null : null,
        status: canDirectApprove ? "APPROVED" : "PENDING",
      },
      include: { account: { select: { id: true, name: true, health: true } } },
    });
    const scoreSnapshot = canDirectApprove
      ? await createApprovedOverrideScoreSnapshot(accountId, kpiKey, Number(requestedValue))
      : null;

    await logAudit({
      role, accountId,
      action:   canDirectApprove ? "score_override.applied" : "score_override.requested",
      entity:   "ScoreOverride",
      entityId: override.id,
      metadata: { kpiKey, previousValue, requestedValue: Number(requestedValue), reason, role },
    });

    return created({ override, score: scoreSnapshot });
  } catch (err) {
    return serverError(err);
  }
}

import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { getRoleFromRequest, ok, created, notFound, badRequest, serverError, guard } from "@/lib/api";
import { logAudit } from "@/lib/audit";

// GET /api/accounts/[id]/rule-suppressions
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const role = getRoleFromRequest(req);
    const denied = guard(role, "playbook:view");
    if (denied) return denied;

    const { id: accountId } = await params;

    const suppressions = await prisma.accountRuleSuppression.findMany({
      where: { accountId, liftedAt: null }, // only active suppressions
      include: {
        playbookRule: {
          select: { id: true, category: true, condition: true, playbook: { select: { title: true } } },
        },
      },
      orderBy: { suppressedAt: "desc" },
    });

    return ok(suppressions);
  } catch (err) {
    return serverError(err);
  }
}

// POST /api/accounts/[id]/rule-suppressions  { playbookRuleId, reason? }
// KAM explicitly requests suppression after seeing suppressionEligible = true
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const role = getRoleFromRequest(req);
    const denied = guard(role, "playbook:update");
    if (denied) return denied;

    const { id: accountId } = await params;
    const { playbookRuleId, reason } = await req.json();
    if (!playbookRuleId) return badRequest("playbookRuleId is required");

    const [account, rule] = await Promise.all([
      prisma.account.findUnique({ where: { id: accountId }, select: { id: true } }),
      prisma.playbookRule.findUnique({ where: { id: playbookRuleId }, select: { id: true, category: true } }),
    ]);
    if (!account) return notFound("Account");
    if (!rule) return notFound("PlaybookRule");

    const suppression = await prisma.accountRuleSuppression.upsert({
      where: { accountId_playbookRuleId: { accountId, playbookRuleId } },
      create: {
        accountId,
        playbookRuleId,
        reason: reason ?? "KAM requested suppression",
        liftedAt: null,
      },
      update: {
        // Re-suppress if previously lifted
        liftedAt: null,
        liftedBy: null,
        suppressedAt: new Date(),
        reason: reason ?? "KAM re-requested suppression",
      },
    });

    await logAudit({
      role,
      accountId,
      action: "rule.suppressed",
      entity: "AccountRuleSuppression",
      entityId: suppression.id,
      metadata: { role, playbookRuleId, category: rule.category },
    });

    return created(suppression);
  } catch (err) {
    return serverError(err);
  }
}

// DELETE /api/accounts/[id]/rule-suppressions?playbookRuleId=xxx  — lift suppression
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const role = getRoleFromRequest(req);
    const denied = guard(role, "playbook:update");
    if (denied) return denied;

    const { id: accountId } = await params;
    const { searchParams } = new URL(req.url);
    const playbookRuleId = searchParams.get("playbookRuleId");
    if (!playbookRuleId) return badRequest("playbookRuleId query param is required");

    await prisma.accountRuleSuppression.update({
      where: { accountId_playbookRuleId: { accountId, playbookRuleId } },
      data: { liftedAt: new Date(), liftedBy: role },
    });

    await logAudit({
      role,
      accountId,
      action: "rule.suppression_lifted",
      entity: "AccountRuleSuppression",
      metadata: { role, playbookRuleId },
    });

    return ok({ lifted: true });
  } catch (err) {
    return serverError(err);
  }
}

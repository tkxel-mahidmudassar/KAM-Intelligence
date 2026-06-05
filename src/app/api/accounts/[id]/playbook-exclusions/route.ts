import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { getRoleFromRequest, ok, created, notFound, badRequest, serverError, guard } from "@/lib/api";
import { logAudit } from "@/lib/audit";

// GET /api/accounts/[id]/playbook-exclusions
// Returns the list of playbook IDs excluded for this account
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const role = getRoleFromRequest(req);
    const denied = guard(role, "playbook:view");
    if (denied) return denied;

    const { id: accountId } = await params;

    const exclusions = await prisma.accountPlaybookExclusion.findMany({
      where: { accountId },
      select: { playbookId: true, createdAt: true },
    });

    return ok(exclusions.map((e) => e.playbookId));
  } catch (err) {
    return serverError(err);
  }
}

// POST /api/accounts/[id]/playbook-exclusions  { playbookId }
// Exclude a playbook from this account (deactivate for this account only)
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const role = getRoleFromRequest(req);
    // KAM and above can toggle
    const denied = guard(role, "playbook:update");
    if (denied) return denied;

    const { id: accountId } = await params;
    const { playbookId } = await req.json();
    if (!playbookId) return badRequest("playbookId is required");

    // Verify account and playbook exist
    const [account, playbook] = await Promise.all([
      prisma.account.findUnique({ where: { id: accountId }, select: { id: true } }),
      prisma.playbook.findUnique({ where: { id: playbookId }, select: { id: true, title: true } }),
    ]);
    if (!account) return notFound("Account");
    if (!playbook) return notFound("Playbook");

    // Upsert (idempotent)
    const exclusion = await prisma.accountPlaybookExclusion.upsert({
      where: { accountId_playbookId: { accountId, playbookId } },
      create: { accountId, playbookId },
      update: {},
    });

    await logAudit({
      role,
      accountId,
      action: "playbook.excluded",
      entity: "AccountPlaybookExclusion",
      entityId: exclusion.id,
      metadata: { role, playbookId, playbookTitle: playbook.title },
    });

    return created(exclusion);
  } catch (err) {
    return serverError(err);
  }
}

// DELETE /api/accounts/[id]/playbook-exclusions?playbookId=xxx
// Re-enable a previously excluded playbook for this account
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const role = getRoleFromRequest(req);
    const denied = guard(role, "playbook:update");
    if (denied) return denied;

    const { id: accountId } = await params;
    const { searchParams } = new URL(req.url);
    const playbookId = searchParams.get("playbookId");
    if (!playbookId) return badRequest("playbookId query param is required");

    await prisma.accountPlaybookExclusion.deleteMany({
      where: { accountId, playbookId },
    });

    await logAudit({
      role,
      accountId,
      action: "playbook.reactivated",
      entity: "AccountPlaybookExclusion",
      metadata: { role, playbookId },
    });

    return ok({ removed: true });
  } catch (err) {
    return serverError(err);
  }
}

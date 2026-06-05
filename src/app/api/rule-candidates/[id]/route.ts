import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { getRoleFromRequest, ok, notFound, badRequest, serverError, guard } from "@/lib/api";
import { logAudit } from "@/lib/audit";

// PATCH /api/rule-candidates/[id]  { action: "promote" | "dismiss", playbookId? }
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const role = getRoleFromRequest(req);
    // Only MANAGER/ADMIN can promote or dismiss rule candidates
    const denied = guard(role, "playbook:create");
    if (denied) return denied;

    const { id } = await params;
    const { action, playbookId: requestedPlaybookId } = await req.json();

    if (!["promote", "dismiss"].includes(action)) {
      return badRequest("action must be 'promote' or 'dismiss'");
    }

    const candidate = await prisma.ruleCandidate.findUnique({ where: { id } });
    if (!candidate) return notFound("RuleCandidate");
    if (candidate.status !== "PENDING") {
      return badRequest(`Candidate is already ${candidate.status}`);
    }

    if (action === "dismiss") {
      const updated = await prisma.ruleCandidate.update({
        where: { id },
        data: { status: "DISMISSED" },
      });
      await logAudit({ role, action: "rule_candidate.dismissed", entity: "RuleCandidate", entityId: id, metadata: { role } });
      return ok(updated);
    }

    // ── Promote: find or create the "AI-Discovered Rules" playbook ───────────
    let targetPlaybookId = requestedPlaybookId;

    if (!targetPlaybookId) {
      // Auto-create or find the special AI-Discovered playbook
      let aiPlaybook = await prisma.playbook.findFirst({
        where: { title: "AI-Discovered Rules", status: "ACTIVE" },
      });

      if (!aiPlaybook) {
        aiPlaybook = await prisma.playbook.create({
          data: {
            title: "AI-Discovered Rules",
            scope: "GLOBAL",
            fileName: "ai-discovered-rules",
            fileType: "generated",
            mimeType: "application/json",
            fileSize: 0,
            storagePath: "",
            status: "ACTIVE",
            processedAt: new Date(),
          },
        });
      }
      targetPlaybookId = aiPlaybook.id;
    }

    // Create the PlaybookRule from the candidate
    const newRule = await prisma.playbookRule.create({
      data: {
        playbookId: targetPlaybookId,
        category: candidate.category,
        condition: candidate.condition,
        recommendation: candidate.recommendation,
        correctiveMeasure: candidate.recommendation,
        priority: 2,
        sourceTitle: "AI-Discovered Pattern",
      },
    });

    // Mark candidate as promoted
    const updated = await prisma.ruleCandidate.update({
      where: { id },
      data: {
        status: "PROMOTED",
        promotedToRuleId: newRule.id,
        promotedToPlaybookId: targetPlaybookId,
      },
    });

    await logAudit({
      role,
      action: "rule_candidate.promoted",
      entity: "RuleCandidate",
      entityId: id,
      metadata: { role, newRuleId: newRule.id, playbookId: targetPlaybookId },
    });

    return ok({ candidate: updated, rule: newRule });
  } catch (err) {
    return serverError(err);
  }
}

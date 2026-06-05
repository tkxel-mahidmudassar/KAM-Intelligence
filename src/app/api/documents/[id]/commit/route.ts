import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { getRoleFromRequest, ok, badRequest, notFound, serverError, guard } from "@/lib/api";
import { logAudit } from "@/lib/audit";

type Params = { params: Promise<{ id: string }> };

const VALID_SIGNAL_TYPES = [
  "REVENUE_DROP", "ENGAGEMENT_LOW", "TICKET_SPIKE", "NPS_DECLINE",
  "CONTRACT_EXPIRY", "CHURN_RISK", "UPSELL_OPPORTUNITY", "RELATIONSHIP_CHANGE", "CUSTOM",
] as const;

// POST /api/documents/[id]/commit
// Body: { selectedIds?: string[], dismissAll?: boolean }
// - dismissAll=true  → mark signalStatus=COMMITTED without creating signals
// - selectedIds      → create Signal records only for the listed extraction IDs
// - neither          → commit all extracted signals
export async function POST(req: NextRequest, { params }: Params) {
  try {
    const role = getRoleFromRequest(req);
    const denied = guard(role, "document:create");
    if (denied) return denied;

    const { id } = await params;
    const body = await req.json().catch(() => ({}));
    const { selectedIds, dismissAll } = body as {
      selectedIds?: string[];
      dismissAll?: boolean;
    };

    const doc = await prisma.document.findUnique({ where: { id } });
    if (!doc) return notFound("Document");

    if (!doc.extractedSignals) return badRequest("No extracted signals to commit");

    // Parse extracted signals
    const rawSignals = Array.isArray(doc.extractedSignals)
      ? (doc.extractedSignals as Array<Record<string, unknown>>)
      : [];

    if (dismissAll) {
      // Just mark committed without creating any signals
      await prisma.document.update({
        where: { id },
        data: { signalStatus: "COMMITTED" },
      });
      await logAudit({ role, accountId: doc.accountId, action: "document.signals_dismissed", entity: "Document", entityId: id, metadata: { role, documentName: doc.name, signalCount: rawSignals.length } });
      return ok({ committed: 0, dismissed: rawSignals.length });
    }

    // Determine which signals to commit
    const toCommit = selectedIds
      ? rawSignals.filter((s) => selectedIds.includes(s.id as string))
      : rawSignals;

    // Validate and create Signal records
    const created: string[] = [];
    for (const s of toCommit) {
      const signalType = s.type as string;
      if (!VALID_SIGNAL_TYPES.includes(signalType as typeof VALID_SIGNAL_TYPES[number])) continue;

      const severity =
        s.severity === "CRITICAL" ? "CRITICAL" :
        s.severity === "WARNING"  ? "WARNING"  : "INFO";

      const signal = await prisma.signal.create({
        data: {
          accountId:   doc.accountId,
          type:        signalType as typeof VALID_SIGNAL_TYPES[number],
          severity:    severity   as "CRITICAL" | "WARNING" | "INFO",
          title:       String(s.title ?? "").slice(0, 80),
          description: String(s.description ?? ""),
          source:      `document:${doc.id}`,
          metadata:    { documentId: doc.id, documentName: doc.name },
        },
      });
      created.push(signal.id);
    }

    // Mark document as committed
    await prisma.document.update({
      where: { id },
      data: { signalStatus: "COMMITTED" },
    });

    await logAudit({ role, accountId: doc.accountId, action: "document.signals_committed", entity: "Document", entityId: id, metadata: { role, documentName: doc.name, committed: created.length } });
    return ok({ committed: created.length, signalIds: created });
  } catch (err) {
    return serverError(err);
  }
}

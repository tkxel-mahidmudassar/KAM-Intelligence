import { NextRequest } from "next/server";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { complete } from "@/lib/ai";
import { badRequest, getRoleFromRequest, guard, notFound, ok, serverError } from "@/lib/api";
import { extractStoredDocumentText } from "@/lib/documents/extractText";
import { logAudit } from "@/lib/audit";

type Params = { params: Promise<{ id: string }> };

type ImpactStatus = "PENDING_REVIEW" | "APPROVED" | "REJECTED";

interface ImpactProposal {
  id: string;
  kind: "profile" | "score" | "kyc" | "risk" | "opportunity" | "action";
  field: string;
  currentValue?: string;
  proposedValue: string;
  kpiKey?: string;
  confidence?: number;
  evidence: string;
  status: ImpactStatus;
}

const SCORE_KEYS = new Set([
  "csat",
  "relationship",
  "risk",
  "contractHealth",
  "projectHealth",
  "resourceHealth",
  "financial",
  "whitespace",
]);

function asText(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return String(value);
}

function normalizeConfidence(value: unknown): number {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return 0.7;
  return Math.max(0, Math.min(1, numeric > 1 ? numeric / 100 : numeric));
}

function readImpactPayload(doc: { extractedSignals: unknown; affectedScores: unknown; affectedKycSections: unknown }): ImpactProposal[] {
  const signals = doc.extractedSignals as { profileUpdates?: ImpactProposal[]; risks?: ImpactProposal[]; opportunities?: ImpactProposal[]; recommendedActions?: ImpactProposal[] } | null;
  const scores = Array.isArray(doc.affectedScores) ? doc.affectedScores as ImpactProposal[] : [];
  const kyc = Array.isArray(doc.affectedKycSections) ? doc.affectedKycSections as ImpactProposal[] : [];
  return [
    ...(signals?.profileUpdates ?? []),
    ...(signals?.risks ?? []),
    ...(signals?.opportunities ?? []),
    ...(signals?.recommendedActions ?? []),
    ...scores,
    ...kyc,
  ];
}

function writeImpactPayload(doc: { extractedSignals: unknown; affectedScores: unknown; affectedKycSections: unknown }, proposals: ImpactProposal[]) {
  const profileUpdates = proposals.filter((proposal) => proposal.kind === "profile");
  const risks = proposals.filter((proposal) => proposal.kind === "risk");
  const opportunities = proposals.filter((proposal) => proposal.kind === "opportunity");
  const recommendedActions = proposals.filter((proposal) => proposal.kind === "action");
  const affectedScores = proposals.filter((proposal) => proposal.kind === "score");
  const affectedKycSections = proposals.filter((proposal) => proposal.kind === "kyc");

  return {
    extractedSignals: { profileUpdates, risks, opportunities, recommendedActions } as unknown as Prisma.InputJsonValue,
    affectedScores: affectedScores as unknown as Prisma.InputJsonValue,
    affectedKycSections: affectedKycSections as unknown as Prisma.InputJsonValue,
    signalStatus: proposals.some((proposal) => proposal.status === "PENDING_REVIEW") ? "PENDING_REVIEW" : "REVIEWED",
  };
}

function parseImpactJson(content: string): ImpactProposal[] {
  const parsed = JSON.parse(content) as { proposals?: Array<Record<string, unknown>> };
  return (parsed.proposals ?? []).slice(0, 12).map((proposal, index) => {
    const kind = ["profile", "score", "kyc", "risk", "opportunity", "action"].includes(String(proposal.kind))
      ? String(proposal.kind) as ImpactProposal["kind"]
      : "kyc";
    const kpiKey = proposal.kpiKey ? String(proposal.kpiKey) : undefined;
    return {
      id: String(proposal.id ?? `impact-${Date.now()}-${index}`),
      kind,
      field: String(proposal.field ?? (kind === "score" ? kpiKey ?? "score" : kind)),
      currentValue: proposal.currentValue === undefined ? undefined : String(proposal.currentValue),
      proposedValue: String(proposal.proposedValue ?? ""),
      kpiKey: kpiKey && SCORE_KEYS.has(kpiKey) ? kpiKey : undefined,
      confidence: normalizeConfidence(proposal.confidence),
      evidence: String(proposal.evidence ?? "Inferred from uploaded document."),
      status: "PENDING_REVIEW" as const,
    };
  }).filter((proposal) => proposal.proposedValue.trim());
}

function fallbackProposals(account: { name: string; industry: string | null }, docName: string, extractedText: string): ImpactProposal[] {
  const evidence = extractedText.slice(0, 220) || `Uploaded document ${docName}`;
  return [
    {
      id: `impact-${Date.now()}-kyc`,
      kind: "kyc",
      field: "executiveSummary",
      proposedValue: `Review ${docName} for ${account.name} KYC context.`,
      confidence: 0.55,
      evidence,
      status: "PENDING_REVIEW",
    },
    {
      id: `impact-${Date.now()}-action`,
      kind: "action",
      field: "Follow-up",
      proposedValue: `Validate document findings with ${account.name} stakeholders.`,
      confidence: 0.5,
      evidence: `Document type appears relevant to ${account.industry ?? "the account"}.`,
      status: "PENDING_REVIEW",
    },
  ];
}

async function recomputeScore(req: NextRequest, accountId: string, role: string) {
  try {
    const response = await fetch(new URL("/api/ai/score", req.url), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-role": role,
      },
      body: JSON.stringify({ accountId }),
    });
    return response.ok;
  } catch {
    return false;
  }
}

export async function POST(req: NextRequest, { params }: Params) {
  try {
    const role = getRoleFromRequest(req);
    const denied = guard(role, "document:create");
    if (denied) return denied;

    const { id } = await params;
    const doc = await prisma.document.findUnique({
      where: { id },
      include: {
        account: {
          include: {
            contacts: true,
            kamScores: { orderBy: { computedAt: "desc" }, take: 1 },
          },
        },
      },
    });
    if (!doc) return notFound("Document");

    let extractedText = doc.extractedText ?? "";
    if (!extractedText && doc.fileUrl) {
      try {
        extractedText = await extractStoredDocumentText(doc);
        await prisma.document.update({ where: { id }, data: { extractedText } });
      } catch {
        extractedText = "";
      }
    }

    const latestScore = doc.account.kamScores[0];
    const scoreContext = latestScore
      ? {
          overall: latestScore.overall,
          csat: latestScore.csat,
          relationship: latestScore.relationship,
          risk: latestScore.risk,
          contractHealth: latestScore.contractHealth,
          projectHealth: latestScore.projectHealth,
          resourceHealth: latestScore.resourceHealth,
          financial: latestScore.financial,
          whitespace: latestScore.whitespace,
        }
      : {};

    let proposals: ImpactProposal[];
    try {
      const ai = await complete({
        accountId: doc.accountId,
        task: "document-impact-analysis",
        jsonMode: true,
        temperature: 0,
        maxTokens: 2200,
        messages: [
          {
            role: "system",
            content: "You analyze account documents for a KAM platform. Return JSON only with a proposals array. Suggestions must be review-gated and grounded in the supplied document text.",
          },
          {
            role: "user",
            content: JSON.stringify({
              expectedShape: {
                proposals: [
                  {
                    kind: "profile | score | kyc | risk | opportunity | action",
                    field: "Account field, KPI key, KYC section, or action title",
                    currentValue: "optional current value",
                    proposedValue: "specific proposed value",
                    kpiKey: "optional one of csat, relationship, risk, contractHealth, projectHealth, resourceHealth, financial, whitespace",
                    confidence: "0 to 1",
                    evidence: "short quote or document locator",
                  },
                ],
              },
              account: {
                name: doc.account.name,
                industry: doc.account.industry,
                segment: (doc.account as { segment?: string | null }).segment,
                region: doc.account.region,
                country: doc.account.country,
                arr: doc.account.arr,
                website: doc.account.website,
                health: doc.account.health,
                scoreContext,
                contacts: doc.account.contacts.map((contact) => ({
                  name: contact.name,
                  title: contact.title,
                  email: contact.email,
                })),
              },
              document: {
                name: doc.name,
                type: doc.type,
                extractedText: extractedText.slice(0, 12000),
              },
            }),
          },
        ],
      });
      proposals = parseImpactJson(ai.content);
      if (proposals.length === 0) proposals = fallbackProposals(doc.account, doc.name, extractedText);
    } catch {
      proposals = fallbackProposals(doc.account, doc.name, extractedText);
    }

    const payload = writeImpactPayload(doc, proposals);
    const updated = await prisma.document.update({
      where: { id },
      data: payload,
    });

    await logAudit({
      role,
      accountId: doc.accountId,
      action: "document.impact_analyzed",
      entity: "Document",
      entityId: id,
      metadata: { role, proposalCount: proposals.length },
    });

    return ok({
      document: updated,
      proposals,
    });
  } catch (err) {
    return serverError(err);
  }
}

export async function PATCH(req: NextRequest, { params }: Params) {
  try {
    const role = getRoleFromRequest(req);
    const denied = guard(role, "document:create");
    if (denied) return denied;

    const { id } = await params;
    const body = await req.json();
    const action = String(body.action ?? "");
    const proposalId = String(body.proposalId ?? "");
    const reason = String(body.reason ?? "");
    if (!["APPROVE", "REJECT"].includes(action)) return badRequest("action must be APPROVE or REJECT");
    if (!proposalId) return badRequest("proposalId is required");
    if (!reason.trim()) return badRequest("reason is required");

    const doc = await prisma.document.findUnique({
      where: { id },
      include: { account: { include: { kamScores: { orderBy: { computedAt: "desc" }, take: 1 } } } },
    });
    if (!doc) return notFound("Document");

    const proposals = readImpactPayload(doc);
    const proposal = proposals.find((item) => item.id === proposalId);
    if (!proposal) return notFound("Impact proposal");

    const nextStatus: ImpactStatus = action === "APPROVE" ? "APPROVED" : "REJECTED";
    const nextProposals = proposals.map((item) => item.id === proposalId ? { ...item, status: nextStatus } : item);
    const payload = writeImpactPayload(doc, nextProposals);

    let profileUpdated = false;
    let scoreOverrideId: string | null = null;
    let scoreRecomputed = false;

    if (action === "APPROVE") {
      if (proposal.kind === "profile") {
        const allowedFields = new Set(["name", "industry", "segment", "region", "country", "website", "logoUrl", "arr"]);
        if (allowedFields.has(proposal.field)) {
          const value = proposal.field === "arr" ? Number(proposal.proposedValue.replace(/[^0-9.]/g, "")) : proposal.proposedValue;
          await prisma.account.update({
            where: { id: doc.accountId },
            data: { [proposal.field]: value },
          });
          profileUpdated = true;
        }
      } else if (proposal.kind === "score" && proposal.kpiKey && SCORE_KEYS.has(proposal.kpiKey)) {
        const latestScore = doc.account.kamScores[0];
        const previousValue = latestScore ? Number((latestScore as Record<string, unknown>)[proposal.kpiKey] ?? latestScore.overall) : 50;
        const requestedValue = Number(proposal.proposedValue.replace(/[^0-9.]/g, ""));
        if (Number.isFinite(requestedValue)) {
          const override = await prisma.scoreOverride.create({
            data: {
              accountId: doc.accountId,
              kpiKey: proposal.kpiKey,
              previousValue,
              requestedValue,
              approvedValue: requestedValue,
              reason: `Document impact accepted from ${doc.name}: ${proposal.evidence}\n\nReviewer reason: ${reason}`,
              status: "APPROVED",
            },
          });
          scoreOverrideId = override.id;
          scoreRecomputed = await recomputeScore(req, doc.accountId, role);
        }
      }
    }

    const updated = await prisma.document.update({
      where: { id },
      data: payload,
    });

    await logAudit({
      role,
      accountId: doc.accountId,
      action: action === "APPROVE" ? "document.impact_approved" : "document.impact_rejected",
      entity: "Document",
      entityId: id,
      metadata: { role, proposalId, proposalKind: proposal.kind, reason, profileUpdated, scoreOverrideId, scoreRecomputed },
    });

    return ok({
      document: updated,
      proposal: nextProposals.find((item) => item.id === proposalId),
      profileUpdated,
      scoreOverrideId,
      scoreRecomputed,
      proposals: nextProposals,
    });
  } catch (err) {
    return serverError(err);
  }
}

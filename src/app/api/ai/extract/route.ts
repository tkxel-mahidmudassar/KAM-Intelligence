import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { complete } from "@/lib/ai";
import { getRoleFromRequest, ok, badRequest, notFound, serverError, guard } from "@/lib/api";

const VALID_SIGNAL_TYPES = [
  "REVENUE_DROP", "ENGAGEMENT_LOW", "TICKET_SPIKE", "NPS_DECLINE",
  "CONTRACT_EXPIRY", "CHURN_RISK", "UPSELL_OPPORTUNITY", "RELATIONSHIP_CHANGE", "CUSTOM",
] as const;

const VALID_KYC_SECTIONS = [
  "executiveSummary", "businessModel", "keyStakeholders", "strategicGoals",
  "riskFactors", "expansionOpportunity", "csatHistory", "competitiveLandscape", "financialOverview",
] as const;

// POST /api/ai/extract  { documentId, rawText }
export async function POST(req: NextRequest) {
  try {
    const role = getRoleFromRequest(req);
    const denied = guard(role, "document:create");
    if (denied) return denied;

    const { documentId, rawText } = await req.json();
    if (!documentId) return badRequest("documentId is required");
    if (!rawText)    return badRequest("rawText is required");

    const doc = await prisma.document.findUnique({ where: { id: documentId } });
    if (!doc) return notFound("Document");

    const prompt = `You are a Kamazing engine. Analyse this document and extract key information for a Key Account Manager.

Return ONLY a JSON object with ALL of these exact keys:
{
  "summary": "2-3 sentence summary",
  "keyTerms": ["term1", "term2"],
  "obligations": ["obligation1", "obligation2"],
  "renewalDate": "YYYY-MM-DD or null",
  "contractValue": <number or null>,
  "signals": [
    {
      "type": "one of: REVENUE_DROP | CONTRACT_EXPIRY | CHURN_RISK | NPS_DECLINE | ENGAGEMENT_LOW | TICKET_SPIKE | RELATIONSHIP_CHANGE | UPSELL_OPPORTUNITY | CUSTOM",
      "severity": "INFO | WARNING | CRITICAL",
      "title": "concise signal title (max 80 chars)",
      "description": "1-2 sentences explaining the signal and its source in the document"
    }
  ],
  "affectedKycSections": ["array of KYC section names this document is relevant to — pick from: executiveSummary, businessModel, keyStakeholders, strategicGoals, riskFactors, expansionOpportunity, csatHistory, competitiveLandscape, financialOverview"],
  "kycSuggestions": {
    "sectionName": "suggested text update based on document content (only for sections this document directly informs)"
  }
}

Rules:
- "signals" may be an empty array if nothing notable is found
- Only include signals that are clearly supported by document content
- "affectedKycSections" may be empty if document doesn't map to any KYC section
- "kycSuggestions" only for sections directly updated by this document (may be empty object)

Document type: ${doc.type}
Document name: ${doc.name}

Content (first 4000 chars):
${rawText.slice(0, 4000)}`;

    const aiResponse = await complete({
      accountId: doc.accountId,
      task: "document-extract",
      messages: [{ role: "user", content: prompt }],
      maxTokens: 2048,
      jsonMode: true, // temperature enforced to 0.0 at provider level
    });

    let extracted: Record<string, unknown> = {};
    try {
      const jsonMatch = aiResponse.content.match(/\{[\s\S]*\}/);
      extracted = JSON.parse(jsonMatch?.[0] ?? aiResponse.content);
    } catch {
      extracted = { summary: aiResponse.content };
    }

    // Normalise and validate extracted signals
    const rawSignals = Array.isArray(extracted.signals) ? extracted.signals : [];
    const validSignals = rawSignals
      .filter((s: Record<string, unknown>) =>
        VALID_SIGNAL_TYPES.includes(s.type as typeof VALID_SIGNAL_TYPES[number]) &&
        s.title && typeof s.title === "string"
      )
      .map((s: Record<string, unknown>, i: number) => ({
        id:          `extracted_${i}`,
        type:        s.type,
        severity:    ["INFO","WARNING","CRITICAL"].includes(s.severity as string) ? s.severity : "WARNING",
        title:       String(s.title).slice(0, 80),
        description: String(s.description ?? ""),
      }));

    const rawKycSections = Array.isArray(extracted.affectedKycSections)
      ? (extracted.affectedKycSections as string[]).filter((s) =>
          VALID_KYC_SECTIONS.includes(s as typeof VALID_KYC_SECTIONS[number])
        )
      : [];

    const kycSuggestions = extracted.kycSuggestions && typeof extracted.kycSuggestions === "object"
      ? extracted.kycSuggestions
      : {};

    // Persist extraction results on the document
    await prisma.document.update({
      where: { id: documentId },
      data: {
        extractedText:       rawText,
        extractedSignals:    validSignals.length > 0 ? (validSignals as unknown as import("@prisma/client").Prisma.InputJsonValue) : undefined,
        affectedScores:      rawKycSections.length > 0 ? (rawKycSections as unknown as import("@prisma/client").Prisma.InputJsonValue) : undefined,
        affectedKycSections: Object.keys(kycSuggestions as object).length > 0 ? (kycSuggestions as unknown as import("@prisma/client").Prisma.InputJsonValue) : undefined,
        signalStatus:        validSignals.length > 0 ? "PENDING_REVIEW" : "COMMITTED",
      },
    });

    return ok({
      extracted: {
        summary:       extracted.summary       ?? null,
        keyTerms:      extracted.keyTerms       ?? [],
        obligations:   extracted.obligations    ?? [],
        renewalDate:   extracted.renewalDate    ?? null,
        contractValue: extracted.contractValue  ?? null,
      },
      signals:            validSignals,
      affectedKycSections: rawKycSections,
      kycSuggestions,
      hasPendingSignals:  validSignals.length > 0,
      model: aiResponse.model,
      latencyMs: aiResponse.latencyMs,
    });
  } catch (err) {
    return serverError(err);
  }
}

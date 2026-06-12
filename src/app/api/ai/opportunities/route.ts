import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { complete } from "@/lib/ai";
import { getRoleFromRequest, ok, badRequest, notFound, serverError, guard } from "@/lib/api";

function scoreOutOfFiveLabel(score: number | null | undefined) {
  if (score == null || !Number.isFinite(score)) return "N/A";
  const normalized = score <= 5 ? score : score / 20;
  return Number.isInteger(normalized) ? String(normalized) : normalized.toFixed(1);
}

// POST /api/ai/opportunities  { accountId }
export async function POST(req: NextRequest) {
  try {
    const role = getRoleFromRequest(req);
    const denied = guard(role, "opportunity:create");
    if (denied) return denied;

    const { accountId } = await req.json();
    if (!accountId) return badRequest("accountId is required");

    const account = await prisma.account.findUnique({
      where: { id: accountId },
      include: {
        contacts:      { orderBy: { isPrimary: "desc" } },
        kpiDimensions: { orderBy: { recordedAt: "desc" } },
        kamScores:     { orderBy: { computedAt: "desc" }, take: 1 },
        signals:       { where: { isResolved: false } },
        kycVersions:   {
          orderBy: { version: "desc" },
          take: 1,
          select: { expansionOpportunity: true, businessModel: true, strategicGoals: true },
        },
      },
    });
    if (!account) return notFound("Account");

    const score = account.kamScores[0];
    const existingOpportunities = account.kycVersions[0]?.expansionOpportunity ?? "";

    const prompt = `You are a DotKAM engine. Identify 3-5 realistic expansion or upsell opportunities for the account below.

Return ONLY a JSON array of opportunity objects with these exact keys:
[
  {
    "serviceLine": "short service or product line name (e.g. 'AI/ML Engineering', 'Cloud Migration', 'QA Automation')",
    "description": "2-3 sentences explaining the opportunity, why it fits this account, and the expected impact",
    "estimatedValue": <number — annual value in USD, integer, no currency symbol>,
    "effort": "LOW" | "MEDIUM" | "HIGH",
    "probability": <number 0.0 to 1.0>,
    "nextAction": "concrete next step (e.g. 'Schedule discovery call with CTO', 'Send proposal draft')"
  }
]

Account Context:
Name: ${account.name}
Industry: ${account.industry ?? "N/A"} | Region: ${account.region ?? "N/A"}
ARR: $${account.arr.toLocaleString()} | Health: ${account.health}
Overall Score: ${scoreOutOfFiveLabel(score?.overall)}/5
Whitespace Score: ${scoreOutOfFiveLabel(score?.whitespace)}/5
CSAT: ${scoreOutOfFiveLabel(score?.csat)}/5

Key Stakeholders: ${account.contacts.slice(0, 4).map((c) => `${c.name} (${c.title})`).join(", ")}

Active Signals: ${account.signals.map((s) => s.title).join("; ") || "None"}

KPIs:
${account.kpiDimensions.slice(0, 8).map((k) => `  ${k.name}: ${k.value}${k.unit ?? ""} vs target ${k.target ?? "N/A"}${k.unit ?? ""}`).join("\n")}

${account.kycVersions[0]?.strategicGoals ? `Strategic Goals: ${account.kycVersions[0].strategicGoals}` : ""}
${account.kycVersions[0]?.businessModel  ? `Business Model: ${account.kycVersions[0].businessModel}`   : ""}
${existingOpportunities ? `Existing expansion notes: ${existingOpportunities}` : ""}

Focus on services adjacent to current engagement, white space in the account, and signals of unmet needs. Do not duplicate existing expansion notes or active opportunities in the account context.`;

    const aiResponse = await complete({
      accountId,
      task: "opportunity-analysis",
      messages: [{ role: "user", content: prompt }],
      maxTokens: 2048,
      temperature: 0.4,
    });

    // Parse JSON array
    let parsed: Array<{
      serviceLine: string;
      description: string;
      estimatedValue?: number;
      effort?: string;
      probability?: number;
      nextAction?: string;
    }>;

    try {
      const jsonMatch = aiResponse.content.match(/\[[\s\S]*\]/);
      parsed = JSON.parse(jsonMatch?.[0] ?? aiResponse.content);
      if (!Array.isArray(parsed)) throw new Error("not an array");
    } catch {
      return serverError("AI returned malformed JSON — please retry");
    }

    const VALID_EFFORTS = ["LOW", "MEDIUM", "HIGH"];

    // Persist all opportunities
    const created = await Promise.all(
      parsed.map((item) =>
        prisma.opportunity.create({
          data: {
            accountId,
            serviceLine:    item.serviceLine ?? "Unspecified",
            description:    item.description ?? "",
            estimatedValue: item.estimatedValue != null ? Number(item.estimatedValue) : null,
            effort:         VALID_EFFORTS.includes(item.effort ?? "") ? item.effort! : null,
            probability:    item.probability  != null ? Math.min(1, Math.max(0, Number(item.probability))) : null,
            nextAction:     item.nextAction   ?? null,
            source:         "AI",
            status:         "IDENTIFIED",
          },
        })
      )
    );

    return ok({ opportunities: created, model: aiResponse.model, latencyMs: aiResponse.latencyMs });
  } catch (err) {
    return serverError(err);
  }
}

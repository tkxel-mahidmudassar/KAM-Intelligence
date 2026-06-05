import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { complete } from "@/lib/ai";
import { getSalesforceAdapter } from "@/lib/adapters/salesforce";
import { getRoleFromRequest, ok, badRequest, notFound, serverError, guard } from "@/lib/api";

// POST /api/ai/kyc  { accountId, authorId? }
export async function POST(req: NextRequest) {
  try {
    const role = getRoleFromRequest(req);
    const denied = guard(role, "kyc:create");
    if (denied) return denied;

    const { accountId, authorId } = await req.json();
    if (!accountId) return badRequest("accountId is required");

    const account = await prisma.account.findUnique({
      where: { id: accountId },
      include: {
        contacts:      { orderBy: { isPrimary: "desc" } },
        kpiDimensions: { orderBy: { recordedAt: "desc" } },
        kamScores:     { orderBy: { computedAt: "desc" }, take: 1 },
        signals:       { where: { isResolved: false } },
      },
    });
    if (!account) return notFound("Account");

    const sf = await getSalesforceAdapter().fetch(accountId);

    const prompt = `You are a KAM Intelligence engine. Draft a full 9-section Know Your Customer (KYC) document for the account below.

Return ONLY a JSON object with these exact keys:
{
  "executiveSummary": "2-3 sentences about the account, their business, and strategic importance",
  "businessModel": "1-2 sentences on how they make money and their market position",
  "keyStakeholders": "[{name, role, influence}] as a JSON string",
  "strategicGoals": "Their top 2-3 goals for the next 12 months based on available signals",
  "riskFactors": "Key risks based on health score, signals, and KPIs",
  "expansionOpportunity": "Upsell or expansion opportunities based on data",
  "csatHistory": "2-3 sentences on CSAT/NPS trend, satisfaction level, and relationship health",
  "competitiveLandscape": "2-3 sentences on main competitors, displacement risk, and Tkxel's differentiators",
  "financialOverview": "2-3 sentences on ARR, contract terms, invoicing health, and renewal outlook"
}

Account Data:
Name: ${account.name}
Industry: ${account.industry ?? "N/A"} | Region: ${account.region ?? "N/A"} | Country: ${account.country ?? "N/A"}
ARR: $${account.arr.toLocaleString()} | Health: ${account.health}
Contract: ${account.contractStart?.toISOString().split("T")[0] ?? "N/A"} → ${account.contractEnd?.toISOString().split("T")[0] ?? "N/A"}
Health Score: ${account.kamScores[0]?.overall ?? "N/A"}/100

Contacts: ${account.contacts.map((c) => `${c.name} (${c.title})`).join(", ")}

KPIs:
${account.kpiDimensions.map((k) => `  ${k.name}: ${k.value}${k.unit ?? ""} vs target ${k.target ?? "N/A"}${k.unit ?? ""}`).join("\n")}

Active Signals: ${account.signals.map((s) => s.title).join("; ")}

Salesforce Opportunities: ${sf.data.opportunities.map((o) => `${o.name} ($${o.amount.toLocaleString()}, ${o.stage})`).join(", ")}`;

    const aiResponse = await complete({
      accountId,
      task: "kyc-draft",
      messages: [{ role: "user", content: prompt }],
      maxTokens: 4096,
      jsonMode: true, // migrated from heuristic extraction; temperature enforced to 0.0 at provider level
    });

    // Parse JSON
    let parsed: Record<string, string>;
    try {
      parsed = JSON.parse(aiResponse.content);
    } catch {
      return serverError("AI returned malformed JSON — please retry");
    }

    // Get next version number
    const latest = await prisma.kycVersion.findFirst({
      where: { accountId },
      orderBy: { version: "desc" },
    });

    const kyc = await prisma.kycVersion.create({
      data: {
        accountId,
        authorId:             authorId ?? null,
        version:              (latest?.version ?? 0) + 1,
        status:               "DRAFT",
        executiveSummary:     parsed.executiveSummary     ?? null,
        businessModel:        parsed.businessModel        ?? null,
        keyStakeholders:      parsed.keyStakeholders      ?? null,
        strategicGoals:       parsed.strategicGoals       ?? null,
        riskFactors:          parsed.riskFactors          ?? null,
        expansionOpportunity: parsed.expansionOpportunity ?? null,
        csatHistory:          parsed.csatHistory          ?? null,
        competitiveLandscape: parsed.competitiveLandscape ?? null,
        financialOverview:    parsed.financialOverview    ?? null,
      },
    });

    return ok({ kyc, model: aiResponse.model, latencyMs: aiResponse.latencyMs });
  } catch (err) {
    return serverError(err);
  }
}

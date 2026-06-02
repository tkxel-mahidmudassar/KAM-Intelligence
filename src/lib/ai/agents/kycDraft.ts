import { prisma } from "@/lib/prisma";
import { complete } from "@/lib/ai";
import { getSalesforceAdapter } from "@/lib/adapters/salesforce";
import { makeStep, type AgentResult, type AgentStep } from "./types";
import type { KycVersion } from "@prisma/client";

export async function runKycDraftAgent(
  accountId: string,
  authorId?: string,
): Promise<AgentResult<KycVersion>> {
  const agentStart = Date.now();
  const steps: AgentStep[] = [];

  const [account, sf] = await Promise.all([
    prisma.account.findUnique({
      where: { id: accountId },
      include: {
        contacts:      { orderBy: { isPrimary: "desc" } },
        kpiDimensions: { orderBy: { recordedAt: "desc" } },
        kamScores:     { orderBy: { computedAt: "desc" }, take: 1 },
        signals:       { where: { isResolved: false } },
        documents:     { where: { extractedText: { not: null } }, take: 3, select: { name: true, extractedText: true } },
        touchpoints:   { orderBy: { date: "desc" }, take: 5 },
      },
    }),
    getSalesforceAdapter().fetch(accountId),
  ]);

  if (!account) throw new Error("Account not found");

  const docSummaries = account.documents
    .map((d) => `[${d.name}]: ${d.extractedText?.slice(0, 300) ?? ""}`)
    .join("\n");

  const contextBlock = `
Account: ${account.name}
Industry: ${account.industry ?? "N/A"} | Region: ${account.region ?? "N/A"} | Country: ${account.country ?? "N/A"}
ARR: $${account.arr.toLocaleString()} | Health: ${account.health}
Contract: ${account.contractStart?.toISOString().split("T")[0] ?? "N/A"} to ${account.contractEnd?.toISOString().split("T")[0] ?? "N/A"}
Score: ${account.kamScores[0]?.overall ?? "N/A"}/100

Contacts: ${account.contacts.map((c) => `${c.name} (${c.title ?? "N/A"})`).join(", ")}
KPIs: ${account.kpiDimensions.map((k) => `${k.name}: ${k.value}${k.unit ?? ""}`).join(", ")}
Active signals: ${account.signals.map((s) => s.title).join("; ") || "none"}
Salesforce opportunities: ${sf.data.opportunities.map((o) => `${o.name} ($${o.amount?.toLocaleString() ?? 0}, ${o.stage})`).join(", ") || "none"}
Recent touchpoints: ${account.touchpoints.map((t) => `${t.type} (${new Date(t.date).toLocaleDateString()})`).join(", ") || "none"}
${docSummaries ? `\nDocument extracts:\n${docSummaries}` : ""}`.trim();

  // Step A: extract key facts
  const promptA = `You are a KYC analysis agent. Extract the 5 most important facts about this account.

${contextBlock}

Return JSON only:
["fact 1", "fact 2", "fact 3", "fact 4", "fact 5"]`;

  const tA = Date.now();
  const responseA = await complete({
    accountId,
    task: "kyc-agent-facts",
    messages: [{ role: "user", content: promptA }],
    maxTokens: 512,
    temperature: 0.2,
    jsonMode: true,
  });
  steps.push(makeStep("extract-key-facts", promptA, responseA.content, Date.now() - tA));

  let keyFacts: string[] = [];
  try {
    const raw = responseA.content.replace(/```json|```/g, "").trim();
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) keyFacts = parsed.slice(0, 5);
  } catch { /* continue */ }

  // Step B: draft full KYC
  const promptB = `You are a KYC document author. Using the account context and key facts, draft a complete 9-section KYC.

${contextBlock}

Key facts identified:
${keyFacts.map((f, i) => `${i + 1}. ${f}`).join("\n")}

Return JSON only with these exact keys:
{
  "executiveSummary": "2-3 sentences on the account, business, and strategic importance",
  "businessModel": "1-2 sentences on how they make money and market position",
  "keyStakeholders": "JSON string of [{name, role, influence}] array",
  "strategicGoals": "top 2-3 goals for the next 12 months",
  "riskFactors": "key risks based on health, signals, and KPIs",
  "expansionOpportunity": "upsell or expansion opportunities based on data",
  "csatHistory": "2-3 sentences on CSAT/NPS trend and relationship health",
  "competitiveLandscape": "2-3 sentences on competitors, displacement risk, and Tkxel differentiators",
  "financialOverview": "2-3 sentences on ARR, contract terms, invoicing health, renewal outlook"
}`;

  const tB = Date.now();
  const responseB = await complete({
    accountId,
    task: "kyc-agent-draft",
    messages: [{ role: "user", content: promptB }],
    maxTokens: 4096,
    temperature: 0.3,
    jsonMode: true,
  });
  steps.push(makeStep("draft-kyc-document", promptB, responseB.content, Date.now() - tB));

  let kycData: Record<string, string> = {};
  try {
    const raw = responseB.content.replace(/```json|```/g, "").trim();
    kycData = JSON.parse(raw);
  } catch {
    throw new Error("KYC agent returned malformed JSON — please retry");
  }

  const latest = await prisma.kycVersion.findFirst({
    where: { accountId },
    orderBy: { version: "desc" },
    select: { version: true },
  });

  const kyc = await prisma.kycVersion.create({
    data: {
      accountId,
      authorId:             authorId ?? null,
      version:              (latest?.version ?? 0) + 1,
      status:               "DRAFT",
      executiveSummary:     kycData.executiveSummary     ?? null,
      businessModel:        kycData.businessModel        ?? null,
      keyStakeholders:      kycData.keyStakeholders      ?? null,
      strategicGoals:       kycData.strategicGoals       ?? null,
      riskFactors:          kycData.riskFactors          ?? null,
      expansionOpportunity: kycData.expansionOpportunity ?? null,
      csatHistory:          kycData.csatHistory          ?? null,
      competitiveLandscape: kycData.competitiveLandscape ?? null,
      financialOverview:    kycData.financialOverview    ?? null,
    },
  });

  return {
    output: kyc,
    steps,
    model: responseB.model,
    totalLatencyMs: Date.now() - agentStart,
  };
}

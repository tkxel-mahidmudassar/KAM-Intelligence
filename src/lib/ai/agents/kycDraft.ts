import { prisma } from "@/lib/prisma";
import { complete } from "@/lib/ai";
import { getSalesforceAdapter } from "@/lib/adapters/salesforce";
import { formatNewsForPrompt, gatherPublicIntelligence } from "@/lib/intelligence/newsSearch";
import { makeStep, type AgentResult, type AgentStep, type AgentSource } from "./types";
import type { KycVersion } from "@prisma/client";

const KYC_SOURCE_RUBRIC = `
KYC research rubric and required source discipline:
- Executive Summary: 4-5 sentences after all other sections are populated. Include who the company is, current relationship state, most critical risk, biggest opportunity, one recommended immediate action, and current KAM. Every sentence must end with an inline [Source: ...] marker.
- Industry Overview: use industry classification, market context, sector trends, public web/news, and industry databases when available.
- Company History: use KYC RAG, Wikipedia/company website/news/SEC EDGAR style public sources when available; include founding year, origin, ownership structure, corporate milestones, acquisitions, and current structure when known.
- Account History with Tkxel: use Salesforce, uploaded SOWs/proposals/previous KYC briefs, touchpoints, QBRs, and project documents.
- Account Stakeholders: use LinkedIn/company website-style public context plus KAM manual/contact data. Identify technical decision makers, financial decision makers, C-level contacts, relationship map, main point of contact, and actual vs ideal contact gaps.
- Company Financials: use Crunchbase/SEC EDGAR-style public context, Salesforce ARR/MRR/funding/renewal data, invoices/contract value, revenue concentration, and dependency.
- Engagement History: use Salesforce, uploaded SOWs/proposals/project documentation, touchpoints, meetings, escalations, migrations, timelines, service lines, team composition, and in-house vs outsourced context.
- Tkxel Team on Account: use Worksphere mock/API/live roster context when available, KAM editable fields, account owner, delivery team, employment status, start dates, allocation, and allocation percentage.
- Competitors: use public sources plus KAM manual input. Identify known competitors, competitive exposure, displacement risk, AI-sourced public signals, and unknowns needing KAM input.

Stored KYC field mapping:
- executiveSummary = Executive Summary.
- businessModel = Industry Overview + Company History + business model.
- keyStakeholders = Account Stakeholders.
- strategicGoals = Account History with Tkxel + strategic goals.
- riskFactors = current account risks, relationship gaps, delivery/financial/customer risk.
- expansionOpportunity = whitespace, upsell, Tkxel team/opportunity context.
- csatHistory = Engagement History, CSAT/client feedback, relationship health, major touchpoints.
- competitiveLandscape = Competitors and displacement risk.
- financialOverview = Company Financials + Tkxel commercial/contract view.

For every field, write concise prose and include visible source attribution:
- Add inline citations for specific facts using [Source: source label].
- End each field with a final line exactly like: Sources: source label 1; source label 2.
- If a fact is not available from sources, say "Not available in current sources" rather than inventing it.
`.trim();

const SECTION_SOURCE_FALLBACKS: Record<string, string> = {
  executiveSummary:     "Generated from completed sourced KYC sections; account score; Salesforce; public intelligence",
  businessModel:        "KYC RAG public intelligence; account industry metadata; company/news sources",
  keyStakeholders:      "Account contacts; KAM manual input; public company/LinkedIn-style context",
  strategicGoals:       "Salesforce; uploaded documents; touchpoints; previous KYC/account history",
  riskFactors:          "Health score; active signals; KPIs; Salesforce/account context",
  expansionOpportunity: "Salesforce opportunities; whitespace signals; public intelligence; KAM/account context",
  csatHistory:          "Touchpoints; active signals; KPIs; uploaded SOWs/project documents",
  competitiveLandscape: "Public intelligence; KAM manual input; company/news sources",
  financialOverview:    "ARR/contract data; Salesforce opportunities; public financial/company sources",
};

function withRequiredSources(value: unknown, sectionKey: string): string | null {
  if (typeof value !== "string" || !value.trim()) return null;
  const trimmed = value.trim();
  if (/\n?Sources:\s*/i.test(trimmed) || /\[Source:/i.test(trimmed)) return trimmed;
  return `${trimmed}\nSources: ${SECTION_SOURCE_FALLBACKS[sectionKey] ?? "Current account sources"}`;
}

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

  const publicIntel = await gatherPublicIntelligence(account.name, account.industry ?? "technology");

  // Build sources from all fetched data
  const sources: AgentSource[] = [
    { type: "score",   label: "Overall score",   value: account.kamScores[0] ? `${account.kamScores[0].overall}/100` : "N/A" },
    { type: "score",   label: "Account health",   value: account.health },
    ...account.contacts.map((c): AgentSource => ({ type: "contact", label: `Contact: ${c.name}`, value: c.title ?? undefined })),
    ...account.kpiDimensions.slice(0, 8).map((k): AgentSource => ({ type: "kpi", label: k.name, value: `${k.value}${k.unit ?? ""}` })),
    ...account.signals.map((s): AgentSource => ({ type: "signal", label: `Signal: ${s.title}`, value: s.severity })),
    ...account.documents.map((d): AgentSource => ({ type: "document", label: `Document: ${d.name}`, value: d.extractedText ? `${d.extractedText.slice(0, 60)}…` : undefined })),
    ...account.touchpoints.slice(0, 4).map((t): AgentSource => ({ type: "touchpoint", label: `Touchpoint: ${t.type}`, value: new Date(t.date).toLocaleDateString() })),
    ...(sf.data.opportunities.length > 0 ? [{ type: "adapter" as const, label: "Salesforce opportunities", value: `${sf.data.opportunities.length} open` }] : []),
    ...publicIntel.slice(0, 8).map((n): AgentSource => ({ type: "public", label: `${n.source}: ${n.title}`, value: n.publishedAt ? new Date(n.publishedAt).toLocaleDateString() : undefined })),
  ];

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
Public intelligence:
${formatNewsForPrompt(publicIntel)}
${docSummaries ? `\nDocument extracts:\n${docSummaries}` : ""}`.trim();

  // Step A: extract key facts
  const promptA = `You are a KYC analysis agent. Extract the 8 most important sourced facts about this account.

${KYC_SOURCE_RUBRIC}

${contextBlock}

Return JSON only:
[
  {"fact": "fact 1", "source": "source label"},
  {"fact": "fact 2", "source": "source label"}
]`;

  const tA = Date.now();
  const responseA = await complete({
    accountId,
    task: "kyc-agent-facts",
    messages: [{ role: "user", content: promptA }],
    maxTokens: 512,
    jsonMode: true, // temperature enforced to 0.0 at provider level
  });
  steps.push(makeStep("extract-key-facts", promptA, responseA.content, Date.now() - tA));

  let keyFacts: string[] = [];
  try {
    const raw = responseA.content.replace(/```json|```/g, "").trim();
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      keyFacts = parsed.slice(0, 8).map((item) =>
        typeof item === "string" ? item : `${item.fact ?? "Fact"} [Source: ${item.source ?? "Current account sources"}]`
      );
    }
  } catch { /* continue */ }

  // Step B: draft full KYC
  const promptB = `You are a senior KYC research and document authoring agent. Using the training rubric, account context, public intelligence, Salesforce context, documents, and key facts, draft a complete sourced KYC.

${KYC_SOURCE_RUBRIC}

${contextBlock}

Key facts identified:
${keyFacts.map((f, i) => `${i + 1}. ${f}`).join("\n")}

Return JSON only with these exact keys:
{
  "executiveSummary": "4-5 sourced sentences. Include [Source: ...] after every sentence, then final Sources line.",
  "businessModel": "Industry overview + company history + business model, with inline [Source: ...] and final Sources line.",
  "keyStakeholders": "Stakeholder map in prose or compact list, including actual vs missing ideal contacts, with source markers and final Sources line.",
  "strategicGoals": "Account history with Tkxel + strategic goals/milestones, with source markers and final Sources line.",
  "riskFactors": "Current delivery, relationship, commercial, and data confidence risks, with source markers and final Sources line.",
  "expansionOpportunity": "Whitespace/upsell/Tkxel team opportunity context, with source markers and final Sources line.",
  "csatHistory": "Engagement history, CSAT/client feedback, projects, timelines, and relationship health, with source markers and final Sources line.",
  "competitiveLandscape": "Known competitors, exposure, displacement risk, unknowns, with source markers and final Sources line.",
  "financialOverview": "ARR/contract/funding/revenue concentration/dependency/renewal outlook, with source markers and final Sources line."
}`;

  const tB = Date.now();
  const responseB = await complete({
    accountId,
    task: "kyc-agent-draft",
    messages: [{ role: "user", content: promptB }],
    maxTokens: 4096,
    jsonMode: true, // temperature enforced to 0.0 at provider level
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
      executiveSummary:     withRequiredSources(kycData.executiveSummary,     "executiveSummary"),
      businessModel:        withRequiredSources(kycData.businessModel,        "businessModel"),
      keyStakeholders:      withRequiredSources(kycData.keyStakeholders,      "keyStakeholders"),
      strategicGoals:       withRequiredSources(kycData.strategicGoals,       "strategicGoals"),
      riskFactors:          withRequiredSources(kycData.riskFactors,          "riskFactors"),
      expansionOpportunity: withRequiredSources(kycData.expansionOpportunity, "expansionOpportunity"),
      csatHistory:          withRequiredSources(kycData.csatHistory,          "csatHistory"),
      competitiveLandscape: withRequiredSources(kycData.competitiveLandscape, "competitiveLandscape"),
      financialOverview:    withRequiredSources(kycData.financialOverview,    "financialOverview"),
    },
  });

  return {
    output: kyc,
    sources,
    steps,
    model: responseB.model,
    totalLatencyMs: Date.now() - agentStart,
  };
}

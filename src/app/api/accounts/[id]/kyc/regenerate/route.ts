import OpenAI from "openai";
import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { complete } from "@/lib/ai";
import { forbidden, getRoleFromRequest, guard, notFound, ok, serverError } from "@/lib/api";
import { logAudit } from "@/lib/audit";

type Params = { params: Promise<{ id: string }> };

interface KycDraftPayload {
  executiveSummary?: string;
  businessModel?: string;
  keyStakeholders?: string;
  strategicGoals?: string;
  riskFactors?: string;
  expansionOpportunity?: string;
  csatHistory?: string;
  competitiveLandscape?: string;
  financialOverview?: string;
  citations?: Array<{ title: string; url: string }>;
}

function extractJson(content: string): KycDraftPayload {
  try {
    return JSON.parse(content) as KycDraftPayload;
  } catch {
    const firstBrace = content.indexOf("{");
    const lastBrace = content.lastIndexOf("}");
    if (firstBrace >= 0 && lastBrace > firstBrace) {
      return JSON.parse(content.slice(firstBrace, lastBrace + 1)) as KycDraftPayload;
    }
    throw new Error("KYC response was not valid JSON");
  }
}

function citationListFromResponse(response: unknown): Array<{ title: string; url: string }> {
  const citations: Array<{ title: string; url: string }> = [];
  const output = (response as { output?: Array<{ content?: Array<{ annotations?: Array<Record<string, unknown>> }> }> }).output ?? [];
  for (const item of output) {
    for (const content of item.content ?? []) {
      for (const annotation of content.annotations ?? []) {
        const url = String(annotation.url ?? "");
        if (!url) continue;
        citations.push({
          title: String(annotation.title ?? url),
          url,
        });
      }
    }
  }
  return citations;
}

function fallbackKyc(account: { name: string; industry: string | null; arr: number }, documents: Array<{ name: string; extractedText: string | null }>): KycDraftPayload {
  const documentNames = documents.map((document) => document.name).join(", ") || "no uploaded documents";
  const context = documents.map((document) => document.extractedText ?? "").join("\n").slice(0, 900);
  return {
    executiveSummary: `${account.name} is a ${account.industry ?? "customer"} account with ARR of ${account.arr}. This draft is based on the current profile and uploaded documents: ${documentNames}.`,
    businessModel: context || "Business model details were not available in the uploaded document context.",
    keyStakeholders: "Stakeholder details should be confirmed from the account profile and recent uploaded materials.",
    strategicGoals: "Strategic goals should be validated with the customer before approval.",
    riskFactors: "No external web-search facts were added. Review uploaded document findings for risks before approval.",
    expansionOpportunity: "Expansion opportunities require review of accepted document suggestions and KAM context.",
    csatHistory: "CSAT history was not present in the supplied context.",
    competitiveLandscape: "Web search was not available for competitive landscape enrichment.",
    financialOverview: `ARR: ${account.arr}. Additional contract and billing detail should be confirmed from account documents.`,
    citations: [],
  };
}

async function generateWithOpenAiWebSearch(prompt: string): Promise<{ payload: KycDraftPayload; model: string; webSearchUsed: boolean }> {
  if (!process.env.OPENAI_API_KEY) {
    throw new Error("OpenAI web search is not configured because OPENAI_API_KEY is missing");
  }

  const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  const model = process.env.OPENAI_WEB_SEARCH_MODEL || process.env.OPENAI_MODEL || process.env.AI_MODEL || "gpt-5.4-mini";
  const response = await client.responses.create({
    model,
    tools: [{ type: "web_search_preview" }],
    tool_choice: "auto",
    input: prompt,
  } as OpenAI.Responses.ResponseCreateParamsNonStreaming);

  const content = response.output_text ?? "";
  const payload = extractJson(content);
  payload.citations = [...(payload.citations ?? []), ...citationListFromResponse(response)];
  return { payload, model, webSearchUsed: true };
}

async function generateWithoutWebSearch(prompt: string, accountId: string): Promise<{ payload: KycDraftPayload; model: string; webSearchUsed: boolean }> {
  const response = await complete({
    accountId,
    task: "kyc-regenerate",
    jsonMode: true,
    temperature: 0,
    maxTokens: 2800,
    messages: [
      {
        role: "system",
        content: "Generate a KYC draft from supplied context only. Return valid JSON only.",
      },
      {
        role: "user",
        content: prompt,
      },
    ],
  });

  return {
    payload: extractJson(response.content),
    model: response.model,
    webSearchUsed: false,
  };
}

export async function POST(req: NextRequest, { params }: Params) {
  try {
    const role = getRoleFromRequest(req);
    if (role === "EXECUTIVE") return forbidden("Executives can view KYC but cannot regenerate it");
    const denied = guard(role, "kyc:view");
    if (denied) return denied;

    const { id } = await params;
    const account = await prisma.account.findUnique({
      where: { id },
      include: {
        contacts: true,
        documents: { orderBy: { createdAt: "desc" } },
        resources: { orderBy: { createdAt: "asc" } },
        journeyItems: { orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }] },
        kycVersions: { orderBy: { version: "desc" }, take: 1 },
        touchpoints: { orderBy: { date: "desc" }, take: 10 },
        recommendations: { where: { status: { not: "DISMISSED" } }, orderBy: { createdAt: "desc" }, take: 10 },
        kamScores: { orderBy: { computedAt: "desc" }, take: 3 },
      },
    });
    if (!account) return notFound("Account");

    const acceptedFindings = account.documents.flatMap((document) => {
      const signals = document.extractedSignals as { profileUpdates?: unknown[]; risks?: unknown[]; opportunities?: unknown[]; recommendedActions?: unknown[] } | null;
      return [
        ...(signals?.profileUpdates ?? []),
        ...(signals?.risks ?? []),
        ...(signals?.opportunities ?? []),
        ...(signals?.recommendedActions ?? []),
        ...((Array.isArray(document.affectedScores) ? document.affectedScores : []) as unknown[]),
        ...((Array.isArray(document.affectedKycSections) ? document.affectedKycSections : []) as unknown[]),
      ].filter((proposal) => String((proposal as { status?: string }).status ?? "") === "APPROVED");
    });

    const accountSegment = (account as { segment?: string | null }).segment;
    const prompt = `Return JSON only with these keys: executiveSummary, businessModel, keyStakeholders, strategicGoals, riskFactors, expansionOpportunity, csatHistory, competitiveLandscape, financialOverview, citations.

Create a fresh KYC version for this account. Use all linked account documents, local account profile, contacts, Tkxel resources, account journey, accepted document findings, recent touchpoints, latest scores, and web search where available.

Rules:
- Return the requested JSON object only.
- Populate every field with concrete KYC text where evidence exists.
- Use uploaded document text for account-specific history, project context, risks, stakeholders, and Tkxel delivery context.
- Use web search for current public company context, competitive landscape, business model, financial/public market context, and recent external signals.
- Do not invent facts. If a field is under-evidenced, say what is missing.
- Keep citations as [{ "title": "...", "url": "..." }] for web-backed claims.

Account context:
${JSON.stringify({
  account: {
    name: account.name,
    industry: account.industry,
    segment: accountSegment,
    website: account.website,
    region: account.region,
    country: account.country,
    arr: account.arr,
    contractStart: account.contractStart,
    contractEnd: account.contractEnd,
    health: account.health,
  },
  contacts: account.contacts,
  resources: account.resources,
  journeyItems: account.journeyItems,
  recentScores: account.kamScores,
  recentTouchpoints: account.touchpoints,
  activeRecommendations: account.recommendations,
  acceptedDocumentFindings: acceptedFindings,
  documents: account.documents.map((document) => ({
    name: document.name,
    type: document.type,
    createdAt: document.createdAt,
    signalStatus: document.signalStatus,
    extractedText: document.extractedText?.slice(0, 3000) ?? "",
    affectedScores: document.affectedScores,
    affectedKycSections: document.affectedKycSections,
  })),
})}`;

    let generation: { payload: KycDraftPayload; model: string; webSearchUsed: boolean };
    try {
      generation = await generateWithOpenAiWebSearch(prompt);
    } catch {
      try {
        generation = await generateWithoutWebSearch(prompt, id);
      } catch {
        generation = { payload: fallbackKyc(account, account.documents), model: "fallback", webSearchUsed: false };
      }
    }

    const latestVersion = account.kycVersions[0]?.version ?? 0;
    const citationsText = generation.payload.citations?.length
      ? `\n\nSources:\n${generation.payload.citations.map((citation) => `- ${citation.title}: ${citation.url}`).join("\n")}`
      : "";

    const kyc = await prisma.kycVersion.create({
      data: {
        accountId: id,
        version: latestVersion + 1,
        status: "DRAFT",
        executiveSummary: `${generation.payload.executiveSummary ?? ""}${citationsText}`.trim() || null,
        businessModel: generation.payload.businessModel ?? null,
        keyStakeholders: generation.payload.keyStakeholders ?? null,
        strategicGoals: generation.payload.strategicGoals ?? null,
        riskFactors: generation.payload.riskFactors ?? null,
        expansionOpportunity: generation.payload.expansionOpportunity ?? null,
        csatHistory: generation.payload.csatHistory ?? null,
        competitiveLandscape: generation.payload.competitiveLandscape ?? null,
        financialOverview: generation.payload.financialOverview ?? null,
      },
    });

    await logAudit({
      role,
      accountId: id,
      action: "kyc.regenerated",
      entity: "KycVersion",
      entityId: kyc.id,
      metadata: { role, model: generation.model, webSearchUsed: generation.webSearchUsed, citationCount: generation.payload.citations?.length ?? 0 },
    });

    return ok({
      kyc,
      model: generation.model,
      webSearchUsed: generation.webSearchUsed,
      citations: generation.payload.citations ?? [],
    });
  } catch (err) {
    return serverError(err);
  }
}

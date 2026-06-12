import { prisma } from "@/lib/prisma";
import { complete } from "@/lib/ai";
import { makeStep, type AgentResult, type AgentStep, type AgentSource } from "./types";
import type { Opportunity } from "@prisma/client";

interface ExpansionVector {
  serviceLine: string;
  hypothesis: string;
  signals: string[];
}

interface OppResult {
  serviceLine: string;
  description: string;
  estimatedValue: number | null;
  effort: string | null;
  probability: number | null;
  nextAction: string | null;
}

function scoreOutOfFiveLabel(score: number | null | undefined) {
  if (score == null || !Number.isFinite(score)) return "N/A";
  const normalized = score <= 5 ? score : score / 20;
  return Number.isInteger(normalized) ? String(normalized) : normalized.toFixed(1);
}

export async function runOpportunityAnalysisAgent(
  accountId: string,
): Promise<AgentResult<Opportunity[]>> {
  const agentStart = Date.now();
  const steps: AgentStep[] = [];

  const account = await prisma.account.findUnique({
    where: { id: accountId },
    include: {
      kamScores:   { orderBy: { computedAt: "desc" }, take: 1 },
      kpiDimensions: { orderBy: { recordedAt: "desc" } },
      signals:     { where: { isResolved: false }, take: 8 },
      kycVersions: { orderBy: { version: "desc" }, take: 1, select: { strategicGoals: true, businessModel: true, expansionOpportunity: true } },
      opportunities: { where: { status: { not: "LOST" } }, select: { serviceLine: true } },
    },
  });

  if (!account) return { output: [], sources: [], steps, model: "skipped", totalLatencyMs: 0 };

  const existingLines = account.opportunities.map((o) => o.serviceLine).join(", ") || "none";
  const score = account.kamScores[0];

  // Build sources list from fetched DB data
  const sources: AgentSource[] = [
    { type: "score",   label: "Overall score",   value: score ? `${scoreOutOfFiveLabel(score.overall)}/5 (${account.health})` : "N/A" },
    { type: "score",   label: "Whitespace score", value: score?.whitespace != null ? `${scoreOutOfFiveLabel(score.whitespace)}/5` : "N/A" },
    { type: "score",   label: "CSAT score",       value: score?.csat != null ? `${scoreOutOfFiveLabel(score.csat)}/5` : "N/A" },
    ...account.signals.map((s): AgentSource => ({ type: "signal", label: `Signal: ${s.title}`, value: s.severity })),
    ...account.kpiDimensions.slice(0, 6).map((k): AgentSource => ({ type: "kpi", label: k.name, value: `${k.value}${k.unit ?? ""}` })),
    ...(account.kycVersions[0]?.strategicGoals ? [{ type: "kyc" as const, label: "Strategic goals", value: account.kycVersions[0].strategicGoals?.slice(0, 80) }] : []),
    ...(existingLines !== "none" ? [{ type: "opportunity" as const, label: "Existing service lines", value: existingLines }] : []),
  ];

  // Step A: identify expansion vectors
  const promptA = `You are a DotKAM expansion analyst.

Account: ${account.name}
Industry: ${account.industry ?? "N/A"} | ARR: $${account.arr.toLocaleString()} | Health: ${account.health}
Score: ${scoreOutOfFiveLabel(score?.overall)}/5 | Whitespace: ${scoreOutOfFiveLabel(score?.whitespace)}/5 | CSAT: ${scoreOutOfFiveLabel(score?.csat)}/5
Active signals: ${account.signals.map((s) => s.title).join("; ") || "none"}
KPIs: ${account.kpiDimensions.slice(0, 6).map((k) => `${k.name}: ${k.value}${k.unit ?? ""}`).join(", ")}
Strategic goals: ${account.kycVersions[0]?.strategicGoals ?? "N/A"}
Business model: ${account.kycVersions[0]?.businessModel ?? "N/A"}
Existing service lines: ${existingLines}
Existing expansion notes: ${account.kycVersions[0]?.expansionOpportunity ?? "N/A"}

Identify 4-6 realistic expansion vectors. Return JSON array only:
[{ "serviceLine": "short name", "hypothesis": "1-2 sentences on why this fits", "signals": ["supporting signal 1"] }]`;

  const tA = Date.now();
  const responseA = await complete({
    accountId,
    task: "opportunity-agent-vectors",
    messages: [{ role: "user", content: promptA }],
    maxTokens: 1024,
    jsonMode: true, // temperature enforced to 0.0 at provider level
  });
  steps.push(makeStep("identify-vectors", promptA, responseA.content, Date.now() - tA));

  let vectors: ExpansionVector[] = [];
  try {
    const raw = responseA.content.replace(/```json|```/g, "").trim();
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) vectors = parsed.slice(0, 6);
  } catch {
    vectors = [];
  }

  if (vectors.length === 0) {
    return { output: [], sources, steps, model: responseA.model, totalLatencyMs: Date.now() - agentStart };
  }

  // Step B: score and flesh out each vector
  const promptB = `You are evaluating expansion opportunities for ${account.name} (${account.health}, ARR $${account.arr.toLocaleString()}).

Vectors to evaluate:
${vectors.map((v, i) => `${i + 1}. ${v.serviceLine}: ${v.hypothesis}`).join("\n")}

For each vector, produce a full opportunity object. Return JSON array only:
[
  {
    "serviceLine": "same as input",
    "description": "2-3 sentences: what is needed, why this account, expected impact",
    "estimatedValue": <annual USD integer or null>,
    "effort": "LOW" | "MEDIUM" | "HIGH",
    "probability": <0.0-1.0>,
    "nextAction": "concrete next step string"
  }
]`;

  const tB = Date.now();
  const responseB = await complete({
    accountId,
    task: "opportunity-agent-evaluate",
    messages: [{ role: "user", content: promptB }],
    maxTokens: 2048,
    jsonMode: true, // temperature enforced to 0.0 at provider level
  });
  steps.push(makeStep("evaluate-opportunities", promptB, responseB.content, Date.now() - tB));

  let evaluated: OppResult[] = [];
  try {
    const raw = responseB.content.replace(/```json|```/g, "").trim();
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) evaluated = parsed;
  } catch {
    evaluated = [];
  }

  // Deduplicate against existing service lines
  const existingSet = new Set(account.opportunities.map((o) => o.serviceLine.toLowerCase()));
  const deduped = evaluated.filter(
    (o) => !existingSet.has((o.serviceLine ?? "").toLowerCase()),
  );

  const VALID_EFFORTS = ["LOW", "MEDIUM", "HIGH"];
  const created = await Promise.all(
    deduped.map((item) =>
      prisma.opportunity.create({
        data: {
          accountId,
          serviceLine:    item.serviceLine ?? "Unspecified",
          description:    item.description ?? "",
          estimatedValue: item.estimatedValue != null ? Number(item.estimatedValue) : null,
          effort:         VALID_EFFORTS.includes(item.effort ?? "") ? item.effort : null,
          probability:    item.probability != null ? Math.min(1, Math.max(0, Number(item.probability))) : null,
          nextAction:     item.nextAction ?? null,
          source:         "AI",
          status:         "IDENTIFIED",
          pendingReview:  true,
        },
      }),
    ),
  );

  return {
    output: created,
    sources,
    steps,
    model: responseB.model,
    totalLatencyMs: Date.now() - agentStart,
  };
}

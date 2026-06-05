import { prisma } from "@/lib/prisma";
import { complete } from "@/lib/ai";
import { getSalesforceAdapter } from "@/lib/adapters/salesforce";
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

export async function runOpportunityAnalysisAgent(
  accountId: string,
): Promise<AgentResult<Opportunity[]>> {
  const agentStart = Date.now();
  const steps: AgentStep[] = [];

  const [account, sf] = await Promise.all([
    prisma.account.findUnique({
      where: { id: accountId },
      include: {
        kamScores:   { orderBy: { computedAt: "desc" }, take: 1 },
        kpiDimensions: { orderBy: { recordedAt: "desc" } },
        signals:     { where: { isResolved: false }, take: 8 },
        kycVersions: { orderBy: { version: "desc" }, take: 1, select: { strategicGoals: true, businessModel: true, expansionOpportunity: true } },
        opportunities: { where: { status: { not: "LOST" } }, select: { serviceLine: true } },
      },
    }),
    getSalesforceAdapter().fetch(accountId),
  ]);

  if (!account) return { output: [], sources: [], steps, model: "skipped", totalLatencyMs: 0 };

  const existingLines = account.opportunities.map((o) => o.serviceLine).join(", ") || "none";
  const score = account.kamScores[0];
  const sfOpps = sf.data.opportunities.map((o) => `${o.name} ($${o.amount?.toLocaleString() ?? 0}, ${o.stage})`).join(", ") || "none";

  // Build sources list from fetched DB data
  const sources: AgentSource[] = [
    { type: "score",   label: "Overall score",   value: score ? `${score.overall}/100 (${account.health})` : "N/A" },
    { type: "score",   label: "Whitespace score", value: score?.whitespace != null ? `${score.whitespace}/100` : "N/A" },
    { type: "score",   label: "CSAT score",       value: score?.csat != null ? `${score.csat}/100` : "N/A" },
    ...account.signals.map((s): AgentSource => ({ type: "signal", label: `Signal: ${s.title}`, value: s.severity })),
    ...account.kpiDimensions.slice(0, 6).map((k): AgentSource => ({ type: "kpi", label: k.name, value: `${k.value}${k.unit ?? ""}` })),
    ...(account.kycVersions[0]?.strategicGoals ? [{ type: "kyc" as const, label: "Strategic goals", value: account.kycVersions[0].strategicGoals?.slice(0, 80) }] : []),
    ...(existingLines !== "none" ? [{ type: "opportunity" as const, label: "Existing service lines", value: existingLines }] : []),
    ...(sfOpps !== "none" ? [{ type: "adapter" as const, label: "Salesforce opportunities", value: sfOpps.slice(0, 100) }] : []),
  ];

  // Step A: identify expansion vectors
  const promptA = `You are a KAM Intelligence expansion analyst.

Account: ${account.name}
Industry: ${account.industry ?? "N/A"} | ARR: $${account.arr.toLocaleString()} | Health: ${account.health}
Score: ${score?.overall ?? "N/A"}/100 | Whitespace: ${score?.whitespace ?? "N/A"}/100 | CSAT: ${score?.csat ?? "N/A"}/100
Active signals: ${account.signals.map((s) => s.title).join("; ") || "none"}
KPIs: ${account.kpiDimensions.slice(0, 6).map((k) => `${k.name}: ${k.value}${k.unit ?? ""}`).join(", ")}
Strategic goals: ${account.kycVersions[0]?.strategicGoals ?? "N/A"}
Business model: ${account.kycVersions[0]?.businessModel ?? "N/A"}
Existing service lines: ${existingLines}
Existing Salesforce opps: ${sfOpps}

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

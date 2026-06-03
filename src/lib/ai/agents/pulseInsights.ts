/**
 * Pulse Insights Agent
 *
 * Generates 5 account-specific AI Pulse insights (one per InsightType) by:
 *   1. Fetching all accounts with their scores, signals, actions, opportunities
 *   2. Gathering real-time public intelligence (Google News, Reddit, Yahoo Finance, Business Recorder)
 *   3. Running 5 parallel Gemini calls — one per insight type — each producing
 *      a single account-specific insight grounded in both internal data and public news
 *   4. Persisting results to AIPulseInsight
 *
 * Returns AgentResult<AIPulseInsight[]>
 */

import { prisma } from "@/lib/prisma";
import { complete } from "@/lib/ai";
import { gatherPublicIntelligence, formatNewsForPrompt } from "@/lib/intelligence/newsSearch";
import type { AgentResult, AgentStep } from "./types";
import { makeStep } from "./types";
import { InsightType } from "@prisma/client";

// ─── Types ────────────────────────────────────────────────────────────────────

interface AccountContext {
  id:           string;
  name:         string;
  industry:     string | null;
  health:       string;
  arr:          number;
  contractEnd:  Date | null;
  latestScore:  number | null;
  kpiScores: {
    csat: number | null; relationship: number | null; risk: number | null;
    contractHealth: number | null; projectHealth: number | null;
    resourceHealth: number | null; financial: number | null; whitespace: number | null;
  } | null;
  openSignals:  { type: string; severity: string; title: string }[];
  openActions:  number;
  opportunities:{ serviceLine: string; estimatedValue: number | null; status: string }[];
  news:         string; // formatted news string for prompt
}

// ─── Prompt templates per insight type ───────────────────────────────────────

const TYPE_INSTRUCTIONS: Record<InsightType, string> = {
  RISK: `Identify the SINGLE most urgent risk across the portfolio. Look for: declining health scores, expiring contracts, churn signals, negative public news (lawsuits, layoffs, leadership exits, funding issues), NPS drops, or engagement collapse. Focus on what could lose this account.`,

  OPPORTUNITY: `Identify the SINGLE best expansion or upsell opportunity across the portfolio. Look for: high whitespace scores, positive news (funding rounds, expansion plans, hiring surges, product launches), healthy accounts exceeding platform limits, or accounts whose public news signals a need for more services. Focus on revenue growth potential.`,

  TREND: `Identify the most meaningful TREND across the portfolio — either for a specific account or based on its industry. Look for: consistent score trajectory (improving/declining over time), industry headwinds or tailwinds visible in the news, seasonal patterns, or behavioural shifts in engagement or usage. Must be grounded in data, not speculation.`,

  ANOMALY: `Identify the most interesting ANOMALY — a mismatch or unexpected pattern. Examples: an account with high internal health scores but negative public news (surface risk not yet reflected internally), or an account with poor internal scores but very positive news (opportunity to re-engage), or an unusually large gap between two KPI dimensions that signals a hidden problem.`,

  RECOMMENDATION: `Generate the SINGLE most important specific action a KAM should take THIS WEEK. It must be concrete, time-sensitive, and directly tied to data — not generic. Examples: "Call Jordan Walsh before the contract expires in 8 days", "Submit the enterprise upgrade proposal to Beacon while they are in active fundraising mode", or "Assign a dedicated support engineer to Helix before the emergency QBR on [date]".`,
};

// ─── Build portfolio context string ──────────────────────────────────────────

function buildPortfolioContext(accounts: AccountContext[]): string {
  return accounts.map((a) => {
    const kpis = a.kpiScores
      ? `CSAT ${a.kpiScores.csat ?? "?"} | Relationship ${a.kpiScores.relationship ?? "?"} | Risk ${a.kpiScores.risk ?? "?"} | ContractHealth ${a.kpiScores.contractHealth ?? "?"} | Whitespace ${a.kpiScores.whitespace ?? "?"}`
      : "No KPI breakdown available";

    const renewal = a.contractEnd
      ? `Renews in ${Math.round((a.contractEnd.getTime() - Date.now()) / 86400000)}d`
      : "No renewal date";

    const signals = a.openSignals.length > 0
      ? a.openSignals.map((s) => `  [${s.severity}] ${s.title}`).join("\n")
      : "  None";

    const opps = a.opportunities.length > 0
      ? a.opportunities.map((o) => `  ${o.serviceLine} ($${(o.estimatedValue ?? 0).toLocaleString()}) — ${o.status}`).join("\n")
      : "  None";

    return `
=== ${a.name} ===
Health: ${a.health} | Score: ${a.latestScore ?? "N/A"}/100 | ARR: $${a.arr.toLocaleString()} | ${renewal}
Industry: ${a.industry ?? "Unknown"}
KPIs: ${kpis}
Open signals:
${signals}
Open actions: ${a.openActions}
Opportunities:
${opps}
Recent public news & intelligence:
${a.news}`.trim();
  }).join("\n\n");
}

// ─── Single typed insight call ────────────────────────────────────────────────

async function generateTypedInsight(
  type: InsightType,
  portfolioContext: string,
  accountIds: Record<string, string>, // name → id map
): Promise<{ insight: { accountId: string; type: InsightType; title: string; summary: string; confidence: number; model: string; promptTokens: number; outputTokens: number } | null; step: AgentStep }> {
  const t0 = Date.now();

  const prompt = `You are an AI intelligence engine for a B2B Key Account Management platform.
You have access to internal account data AND real-time public news for each account.

Your task: Generate ONE ${type} insight — the most significant one across the entire portfolio.
The insight MUST be linked to a specific account (not portfolio-wide).

INSTRUCTION: ${TYPE_INSTRUCTIONS[type]}

PORTFOLIO DATA:
${portfolioContext}

ACCOUNT NAMES (use exact name to identify the account):
${Object.keys(accountIds).map((n) => `- ${n}`).join("\n")}

Return ONLY a JSON object (no markdown, no explanation):
{
  "accountName": "<exact account name from the list above>",
  "title": "<concise title under 90 chars>",
  "summary": "<2-4 sentence insight grounding the finding in specific data points and/or news. Include a recommended action.>",
  "confidence": <0.0-1.0>
}`;

  try {
    const response = await complete({
      task:        `pulse-${type.toLowerCase()}`,
      messages:    [{ role: "user", content: prompt }],
      maxTokens:   1024,
      temperature: 0.4,
      jsonMode:    true,
    });

    const step = makeStep(`pulse:${type}`, prompt, response.content, Date.now() - t0);

    let parsed: { accountName: string; title: string; summary: string; confidence: number };
    try {
      parsed = JSON.parse(response.content);
    } catch {
      // Fallback: extract JSON from response
      const first = response.content.indexOf("{");
      const last  = response.content.lastIndexOf("}");
      parsed = JSON.parse(response.content.slice(first, last + 1));
    }

    const accountId = accountIds[parsed.accountName];
    if (!accountId) {
      console.warn(`[pulseInsights] Unknown account name in response: "${parsed.accountName}"`);
      return { insight: null, step };
    }

    return {
      insight: {
        accountId,
        type,
        title:        parsed.title,
        summary:      parsed.summary,
        confidence:   Math.min(1, Math.max(0, parsed.confidence ?? 0.75)),
        model:        response.model,
        promptTokens: response.promptTokens ?? 0,
        outputTokens: response.outputTokens ?? 0,
      },
      step,
    };
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err);
    return {
      insight: null,
      step: makeStep(`pulse:${type}`, prompt.slice(0, 300), `ERROR: ${errMsg}`, Date.now() - t0),
    };
  }
}

// ─── Main agent function ──────────────────────────────────────────────────────

export async function runPulseInsightsAgent(kamId?: string): Promise<AgentResult<{ count: number }>> {
  const t0    = Date.now();
  const steps: AgentStep[] = [];

  // 1. Load all accounts with recent data
  const accounts = await prisma.account.findMany({
    where: kamId ? { kamId } : undefined,
    include: {
      kamScores:    { orderBy: { computedAt: "desc" }, take: 1 },
      signals:      { where: { isResolved: false }, select: { type: true, severity: true, title: true } },
      opportunities:{ where: { status: { not: "LOST" } }, select: { serviceLine: true, estimatedValue: true, status: true } },
      _count:       { select: { actions: { where: { status: { in: ["OPEN", "IN_PROGRESS"] } } } } },
    },
    orderBy: { health: "asc" }, // CRITICAL first
  });

  steps.push(makeStep(
    "load-accounts",
    `Fetching accounts${kamId ? ` for KAM ${kamId}` : " (all)"}`,
    `Loaded ${accounts.length} accounts`,
    0,
  ));

  // 2. Gather public news for each account in parallel
  const newsResults = await Promise.all(
    accounts.map((a) => gatherPublicIntelligence(a.name, a.industry ?? "B2B SaaS"))
  );

  const accountContexts: AccountContext[] = accounts.map((a, i) => ({
    id:          a.id,
    name:        a.name,
    industry:    a.industry,
    health:      a.health,
    arr:         a.arr,
    contractEnd: a.contractEnd,
    latestScore: a.kamScores[0]?.overall ?? null,
    kpiScores:   a.kamScores[0] ? {
      csat:           a.kamScores[0].csat,
      relationship:   a.kamScores[0].relationship,
      risk:           a.kamScores[0].risk,
      contractHealth: a.kamScores[0].contractHealth,
      projectHealth:  a.kamScores[0].projectHealth,
      resourceHealth: a.kamScores[0].resourceHealth,
      financial:      a.kamScores[0].financial,
      whitespace:     a.kamScores[0].whitespace,
    } : null,
    openSignals:  a.signals,
    openActions:  a._count.actions,
    opportunities:a.opportunities,
    news:         formatNewsForPrompt(newsResults[i]),
  }));

  steps.push(makeStep(
    "gather-news",
    `Searching public sources for ${accounts.length} accounts`,
    `Gathered news for: ${accountContexts.map((a) => `${a.name} (${newsResults[accounts.indexOf(accounts.find((x) => x.id === a.id)!)].length} items)`).join(", ")}`,
    0,
  ));

  // 3. Build portfolio context and account name→id map
  const portfolioContext = buildPortfolioContext(accountContexts);
  const accountIds: Record<string, string> = Object.fromEntries(
    accountContexts.map((a) => [a.name, a.id])
  );

  // 4. Run 5 typed insight calls in parallel
  const insightTypes: InsightType[] = [
    InsightType.RISK,
    InsightType.OPPORTUNITY,
    InsightType.TREND,
    InsightType.ANOMALY,
    InsightType.RECOMMENDATION,
  ];

  const results = await Promise.all(
    insightTypes.map((type) => generateTypedInsight(type, portfolioContext, accountIds))
  );

  results.forEach(({ step }) => steps.push(step));

  // 5. Persist successful insights
  const toCreate = results
    .map((r) => r.insight)
    .filter((i): i is NonNullable<typeof i> => i !== null);

  if (toCreate.length > 0) {
    await prisma.aIPulseInsight.createMany({
      data: toCreate.map((i) => ({
        accountId:    i.accountId,
        type:         i.type,
        title:        i.title,
        summary:      i.summary,
        confidence:   i.confidence,
        model:        i.model,
        promptTokens: i.promptTokens,
        outputTokens: i.outputTokens,
        isDismissed:  false,
        isRead:       false,
      })),
    });
  }

  return {
    output:         { count: toCreate.length },
    sources:        accountContexts.map((a) => ({
      type:  "score" as const,
      label: `${a.name} — ${a.health} (${a.latestScore ?? "N/A"}/100)`,
      value: `ARR $${a.arr.toLocaleString()}`,
    })),
    steps,
    model:          "gemini-2.5-flash",
    totalLatencyMs: Date.now() - t0,
  };
}

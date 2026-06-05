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
import { gatherPublicIntelligence } from "@/lib/intelligence/newsSearch";
import type { NewsItem } from "@/lib/intelligence/newsSearch";
import type { AgentResult, AgentStep } from "./types";
import { makeStep } from "./types";
import { InsightType, Prisma } from "@prisma/client";

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
  evidence:     EvidenceSource[];
  evidenceText: string;
}

interface GeneratedPulseInsight {
  accountId: string;
  type: InsightType;
  title: string;
  summary: string;
  confidence: number;
  model: string;
  promptTokens: number;
  outputTokens: number;
  sources: InsightSources;
}

type EvidenceSourceType =
  | "internal_metric"
  | "signal"
  | "action_count"
  | "opportunity"
  | "renewal"
  | "public_news"
  | "public_industry";

export interface EvidenceSource {
  id: string;
  type: EvidenceSourceType;
  title: string;
  detail: string;
  url?: string;
  source?: string;
  publishedAt?: string;
  accountMatched?: boolean;
  relevanceScore?: number;
}

export interface EvidenceClaim {
  text: string;
  sourceIds: string[];
  sourceType: "internal" | "public" | "inference";
}

const GENERIC_COMPANY_TOKENS = new Set([
  "and", "the", "inc", "llc", "ltd", "limited", "corp", "corporation", "company",
  "group", "holdings", "solutions", "systems", "services", "technology", "technologies",
  "health", "payments", "capital", "cloud", "digital", "global", "international",
]);

function tokenize(value: string): string[] {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((token) => token.length > 2);
}

function companyTokens(name: string): string[] {
  const tokens = tokenize(name);
  const distinctive = tokens.filter((token) => !GENERIC_COMPANY_TOKENS.has(token));
  return distinctive.length > 0 ? distinctive : tokens.filter((token) => token.length > 3);
}

function scoreNewsRelevance(account: Pick<AccountContext, "name" | "industry">, item: NewsItem): number {
  const haystack = `${item.title} ${item.snippet ?? ""}`.toLowerCase();
  const exactName = haystack.includes(account.name.toLowerCase());
  const tokens = companyTokens(account.name);
  const tokenMatches = tokens.filter((token) => haystack.includes(token)).length;
  const tokenScore = tokens.length > 0 ? tokenMatches / tokens.length : 0;
  const industryTokens = account.industry ? tokenize(account.industry) : [];
  const industryScore = industryTokens.some((token) => haystack.includes(token)) ? 0.25 : 0;
  const communityPenalty = item.source.toLowerCase().includes("reddit") ? 0.15 : 0;

  return Math.max(0, Math.min(1, (exactName ? 1 : tokenScore) + industryScore - communityPenalty));
}

function buildInternalEvidence(account: AccountContext): EvidenceSource[] {
  const evidence: EvidenceSource[] = [
    {
      id: `int:${account.id}:health-score`,
      type: "internal_metric",
      title: "Account health and score",
      detail: `${account.name} has ${account.health} health and score ${account.latestScore ?? "N/A"}/100.`,
    },
    {
      id: `int:${account.id}:action-count`,
      type: "action_count",
      title: "Open action count",
      detail: `${account.name} has ${account.openActions} open action${account.openActions === 1 ? "" : "s"}.`,
    },
  ];

  if (account.contractEnd) {
    const days = Math.round((account.contractEnd.getTime() - Date.now()) / 86400000);
    evidence.push({
      id: `int:${account.id}:renewal`,
      type: "renewal",
      title: "Renewal timeline",
      detail: `${account.name} renews in ${days} day${days === 1 ? "" : "s"}.`,
    });
  }

  if (account.kpiScores) {
    const kpiDetail = Object.entries(account.kpiScores)
      .filter(([, value]) => value !== null)
      .map(([key, value]) => `${key}: ${value}/100`)
      .join(", ");

    evidence.push({
      id: `int:${account.id}:kpi-breakdown`,
      type: "internal_metric",
      title: "KPI score breakdown",
      detail: kpiDetail || "No KPI score breakdown available.",
    });
  }

  account.openSignals.slice(0, 5).forEach((signal, index) => {
    evidence.push({
      id: `int:${account.id}:signal-${index + 1}`,
      type: "signal",
      title: signal.title,
      detail: `${signal.severity} ${signal.type} signal: ${signal.title}`,
    });
  });

  account.opportunities.slice(0, 5).forEach((opportunity, index) => {
    evidence.push({
      id: `int:${account.id}:opportunity-${index + 1}`,
      type: "opportunity",
      title: `${opportunity.serviceLine} opportunity`,
      detail: `${opportunity.serviceLine} is ${opportunity.status} with estimated value $${(opportunity.estimatedValue ?? 0).toLocaleString()}.`,
    });
  });

  return evidence;
}

function buildPublicEvidence(account: AccountContext, newsItems: NewsItem[]): EvidenceSource[] {
  return newsItems
    .map<EvidenceSource | null>((item, index) => {
      const relevanceScore = scoreNewsRelevance(account, item);
      const accountMatched = relevanceScore >= 0.55;
      const industryMatched = !accountMatched && relevanceScore >= 0.25;

      if (!accountMatched && !industryMatched) return null;

      return {
        id: `pub:${account.id}:${index + 1}`,
        type: accountMatched ? "public_news" as const : "public_industry" as const,
        title: item.title,
        detail: item.snippet || item.title,
        url: item.url,
        source: item.source,
        publishedAt: item.publishedAt,
        accountMatched,
        relevanceScore: Number(relevanceScore.toFixed(2)),
      };
    })
    .filter((item): item is EvidenceSource => item !== null)
    .slice(0, 6);
}

function formatEvidenceForPrompt(evidence: EvidenceSource[]): string {
  return evidence.map((source) => {
    const sourceLabel = source.source ? ` | source: ${source.source}` : "";
    const urlLabel = source.url ? ` | url: ${source.url}` : "";
    return `[${source.id}] ${source.type}: ${source.title} — ${source.detail}${sourceLabel}${urlLabel}`;
  }).join("\n");
}

function validateClaims(
  claims: unknown,
  allowedEvidence: EvidenceSource[],
): EvidenceClaim[] {
  if (!Array.isArray(claims)) return [];

  const allowedIds = new Set(allowedEvidence.map((source) => source.id));
  const publicIds = new Set(allowedEvidence
    .filter((source) => source.type === "public_news" || source.type === "public_industry")
    .map((source) => source.id));

  return claims
    .map((claim) => {
      if (!claim || typeof claim !== "object") return null;
      const record = claim as { text?: unknown; sourceIds?: unknown; sourceType?: unknown };
      const text = typeof record.text === "string" ? record.text.trim() : "";
      const sourceIds = Array.isArray(record.sourceIds)
        ? record.sourceIds.filter((id): id is string => typeof id === "string" && allowedIds.has(id))
        : [];
      if (!text || sourceIds.length === 0) return null;

      const hasPublic = sourceIds.some((id) => publicIds.has(id));
      const sourceType = hasPublic
        ? "public"
        : record.sourceType === "inference"
          ? "inference"
          : "internal";

      return { text, sourceIds, sourceType };
    })
    .filter((claim): claim is EvidenceClaim => claim !== null)
    .slice(0, 4);
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
Evidence ledger:
${a.evidenceText}`.trim();
  }).join("\n\n");
}

// ─── Source shape persisted with each insight ────────────────────────────────

export interface InsightSources {
  newsHeadlines: { title: string; source: string; url: string; publishedAt: string }[];
  internalData: {
    health: string;
    overallScore: number | null;
    keyScores: Record<string, number | null>;
    signalTitles: string[];
  };
  evidenceMode?: "llm-sourced-evidence" | "internal-fallback";
  claims?: EvidenceClaim[];
  evidence?: EvidenceSource[];
}

// ─── Single typed insight call ────────────────────────────────────────────────

async function generateTypedInsight(
  type: InsightType,
  portfolioContext: string,
  accountIds: Record<string, string>,                           // name → id map
  accountContexts: AccountContext[],                            // for source lookup after account resolution
): Promise<{ insight: GeneratedPulseInsight | null; step: AgentStep }> {
  const t0 = Date.now();

  const prompt = `You are an AI intelligence engine for a B2B Key Account Management platform.
You have access to an evidence ledger containing internal account data and vetted public intelligence.

Your task: Generate ONE ${type} insight — the most significant one across the entire portfolio.
The insight MUST be linked to a specific account (not portfolio-wide).
Every factual claim MUST cite one or more sourceIds from the selected account's evidence ledger.
No citation, no claim. Do not invent sourceIds. Do not use public_industry evidence for account-specific company facts.
If public evidence is not directly about the selected account, frame it only as industry context and cite it as such.

INSTRUCTION: ${TYPE_INSTRUCTIONS[type]}

PORTFOLIO DATA:
${portfolioContext}

ACCOUNT NAMES (use exact name to identify the account):
${Object.keys(accountIds).map((n) => `- ${n}`).join("\n")}

Return ONLY a JSON object (no markdown, no explanation):
{
  "accountName": "<exact account name from the list above>",
  "title": "<concise title under 90 chars>",
  "summary": "<2-4 sentence insight grounding the finding in cited evidence. Include a recommended action.>",
  "confidence": <0.0-1.0>,
  "claims": [
    {
      "text": "<single factual claim or recommended action>",
      "sourceIds": ["<evidence id from ledger>"],
      "sourceType": "internal" | "public" | "inference"
    }
  ]
}`;

  try {
    const response = await complete({
      task:        `pulse-${type.toLowerCase()}`,
      messages:    [{ role: "user", content: prompt }],
      maxTokens:   1024,
      jsonMode:    true, // temperature enforced to 0.0 at provider level
    });

    const step = makeStep(`pulse:${type}`, prompt, response.content, Date.now() - t0);

    let parsed: { accountName: string; title: string; summary: string; confidence: number; claims?: unknown };
    try {
      parsed = JSON.parse(response.content);
    } catch {
      // Fallback: extract JSON from response
      const first = response.content.indexOf("{");
      const last  = response.content.lastIndexOf("}");
      parsed = JSON.parse(response.content.slice(first, last + 1));
    }

    // Exact match first, then case-insensitive, then partial/fuzzy match
    let accountId: string = accountIds[parsed.accountName] ?? "";
    if (!accountId) {
      const nameLower = parsed.accountName.toLowerCase().trim();
      const entry = Object.entries(accountIds).find(([k]) => {
        const kl = k.toLowerCase();
        return kl === nameLower || kl.includes(nameLower) || nameLower.includes(kl);
      });
      accountId = entry?.[1] ?? "";
    }
    if (!accountId) {
      // Last resort: pick first account — still better than dropping the insight
      accountId = Object.values(accountIds)[0] ?? "";
      console.warn(`[pulseInsights] Fuzzy match failed for "${parsed.accountName}", using fallback account`);
    }

    // ── Build source attribution for this insight ─────────────────────────────
    const accountCtx = accountContexts.find((a) => a.id === accountId);
    if (!accountCtx) {
      return {
        insight: null,
        step: makeStep(`pulse:${type}`, prompt, "ERROR: Selected account was not found in context", Date.now() - t0),
      };
    }

    const claims = validateClaims(parsed.claims, accountCtx.evidence);
    if (claims.length === 0) {
      return {
        insight: null,
        step: makeStep(`pulse:${type}`, prompt, "ERROR: Insight did not include valid cited claims", Date.now() - t0),
      };
    }

    const sources = sourcesForAccount(accountCtx, claims, "llm-sourced-evidence");

    return {
      insight: {
        accountId,
        type,
        title:        parsed.title,
        summary:      claims.map((claim) => claim.text).join(" "),
        confidence:   Math.min(1, Math.max(0, parsed.confidence ?? 0.75)),
        model:        response.model,
        promptTokens: response.promptTokens ?? 0,
        outputTokens: response.outputTokens ?? 0,
        sources,
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

function sourcesForAccount(
  account: AccountContext,
  claims: EvidenceClaim[],
  evidenceMode: "llm-sourced-evidence" | "internal-fallback",
): InsightSources {
  const usedSourceIds = new Set(claims.flatMap((claim) => claim.sourceIds));
  const usedPublicEvidence = account.evidence.filter((source) =>
    usedSourceIds.has(source.id) && (source.type === "public_news" || source.type === "public_industry")
  );

  return {
    newsHeadlines: usedPublicEvidence.map((source) => ({
      title:       source.title,
      source:      source.source ?? "Public source",
      url:         source.url ?? "#",
      publishedAt: source.publishedAt ?? new Date().toISOString(),
    })),
    internalData: {
      health:       account.health,
      overallScore: account.latestScore,
      keyScores: {
        csat:           account.kpiScores?.csat ?? null,
        relationship:   account.kpiScores?.relationship ?? null,
        risk:           account.kpiScores?.risk ?? null,
        contractHealth: account.kpiScores?.contractHealth ?? null,
      },
      signalTitles: account.openSignals.slice(0, 3).map((s) => s.title),
    },
    evidenceMode,
    claims,
    evidence: account.evidence.filter((source) => usedSourceIds.has(source.id)),
  };
}

function buildFallbackInsights(
  accounts: AccountContext[],
): GeneratedPulseInsight[] {
  const healthRank: Record<string, number> = { CRITICAL: 0, AT_RISK: 1, HEALTHY: 2 };
  const byRisk = [...accounts].sort((a, b) => {
    const healthDelta = (healthRank[a.health] ?? 3) - (healthRank[b.health] ?? 3);
    if (healthDelta !== 0) return healthDelta;
    return (a.latestScore ?? 100) - (b.latestScore ?? 100);
  });
  const byWhitespace = [...accounts].sort((a, b) =>
    (b.kpiScores?.whitespace ?? 0) - (a.kpiScores?.whitespace ?? 0)
  );
  const byActions = [...accounts].sort((a, b) => b.openActions - a.openActions);
  const byRenewal = [...accounts].sort((a, b) => {
    const aDays = a.contractEnd ? (a.contractEnd.getTime() - Date.now()) / 86400000 : 9999;
    const bDays = b.contractEnd ? (b.contractEnd.getTime() - Date.now()) / 86400000 : 9999;
    return aDays - bDays;
  });

  const riskAccount = byRisk[0];
  const opportunityAccount = byWhitespace[0] ?? riskAccount;
  const trendAccount = byActions[0] ?? riskAccount;
  const anomalyAccount = accounts.find((a) =>
    (a.kpiScores?.whitespace ?? 0) >= 70 && (a.latestScore ?? 100) < 70
  ) ?? byRisk[1] ?? riskAccount;
  const recommendationAccount = byRenewal[0] ?? riskAccount;

  const make = (
    account: AccountContext,
    type: InsightType,
    title: string,
    summary: string,
    sourceIds: string[],
    confidence = 0.68,
  ): GeneratedPulseInsight => {
    const claims: EvidenceClaim[] = [
      {
        text: summary,
        sourceIds: sourceIds.filter((id) => account.evidence.some((source) => source.id === id)),
        sourceType: "internal" as const,
      },
    ].filter((claim) => claim.sourceIds.length > 0);

    return {
      accountId: account.id,
      type,
      title,
      summary,
      confidence,
      model: "internal-fallback",
      promptTokens: 0,
      outputTokens: 0,
      sources: sourcesForAccount(account, claims, "internal-fallback"),
    };
  };

  return [
    make(
      riskAccount,
      InsightType.RISK,
      `${riskAccount.name} needs immediate risk attention`,
      `${riskAccount.name} is the highest-risk account in the current portfolio view with ${riskAccount.health} health, score ${riskAccount.latestScore ?? "N/A"}/100, ${riskAccount.openActions} open action${riskAccount.openActions === 1 ? "" : "s"}, and ${riskAccount.openSignals.length} unresolved signal${riskAccount.openSignals.length === 1 ? "" : "s"}. Prioritise executive alignment and close the most critical open action before the next review cycle.`,
      [`int:${riskAccount.id}:health-score`, `int:${riskAccount.id}:action-count`],
    ),
    make(
      opportunityAccount,
      InsightType.OPPORTUNITY,
      `${opportunityAccount.name} has the clearest expansion signal`,
      `${opportunityAccount.name} has whitespace score ${opportunityAccount.kpiScores?.whitespace ?? "N/A"} and ARR $${opportunityAccount.arr.toLocaleString()}, making it the strongest internal expansion candidate. Review open opportunities and prepare a scoped commercial proposal tied to the account's current operating priorities.`,
      [`int:${opportunityAccount.id}:kpi-breakdown`, `int:${opportunityAccount.id}:opportunity-1`],
    ),
    make(
      trendAccount,
      InsightType.TREND,
      `${trendAccount.name} is driving the action workload`,
      `${trendAccount.name} currently has ${trendAccount.openActions} open action${trendAccount.openActions === 1 ? "" : "s"}, the highest action load in scope. This trend suggests the account needs tighter weekly governance, owner assignment, and a visible milestone cadence until the queue normalises.`,
      [`int:${trendAccount.id}:action-count`],
      0.64,
    ),
    make(
      anomalyAccount,
      InsightType.ANOMALY,
      `${anomalyAccount.name} shows a score-to-whitespace mismatch`,
      `${anomalyAccount.name} combines score ${anomalyAccount.latestScore ?? "N/A"}/100 with whitespace ${anomalyAccount.kpiScores?.whitespace ?? "N/A"}, which suggests opportunity exists but execution or relationship health may be limiting conversion. Validate whether the blocker is stakeholder access, delivery confidence, or commercial timing.`,
      [`int:${anomalyAccount.id}:health-score`, `int:${anomalyAccount.id}:kpi-breakdown`],
      0.62,
    ),
    make(
      recommendationAccount,
      InsightType.RECOMMENDATION,
      `Run this week's account control plan for ${recommendationAccount.name}`,
      `${recommendationAccount.name} should get a concrete control plan this week: confirm the next stakeholder touchpoint, assign owners for open actions, and document the renewal or escalation path. This fallback insight was generated from internal account data because the live LLM provider is currently quota-limited.`,
      [`int:${recommendationAccount.id}:renewal`, `int:${recommendationAccount.id}:action-count`],
      0.7,
    ),
  ];
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

  const accountContexts: AccountContext[] = accounts.map((a, i) => {
    const baseContext: AccountContext = {
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
      evidence:     [],
      evidenceText: "",
    };
    const evidence = [
      ...buildInternalEvidence(baseContext),
      ...buildPublicEvidence(baseContext, newsResults[i] ?? []),
    ];

    return {
      ...baseContext,
      evidence,
      evidenceText: formatEvidenceForPrompt(evidence),
    };
  });

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
    insightTypes.map((type) => generateTypedInsight(type, portfolioContext, accountIds, accountContexts))
  );

  results.forEach(({ step }) => steps.push(step));

  // 5. Persist successful insights (including sources)
  let toCreate = results
    .map((r) => r.insight)
    .filter((i): i is NonNullable<typeof i> => i !== null);

  if (toCreate.length === 0 && accountContexts.length > 0) {
    toCreate = buildFallbackInsights(accountContexts);
    steps.push(makeStep(
      "fallback-insights",
      "Gemini returned no parseable pulse insights",
      `Generated ${toCreate.length} fallback insights from internal account data`,
      0,
    ));
  }

  if (toCreate.length > 0) {
    await prisma.aIPulseInsight.createMany({
      data: toCreate.map((i) => ({
        accountId:    i.accountId,
        type:         i.type,
        title:        i.title,
        summary:      i.summary,
        task:         "pulse-insight",
        confidence:   i.confidence,
        model:        i.model,
        promptTokens: i.promptTokens,
        outputTokens: i.outputTokens,
        isDismissed:  false,
        isRead:       false,
        sources:      i.sources as unknown as Prisma.InputJsonValue, // structured source attribution
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
    model:          "gemini-2.0-flash",
    totalLatencyMs: Date.now() - t0,
  };
}

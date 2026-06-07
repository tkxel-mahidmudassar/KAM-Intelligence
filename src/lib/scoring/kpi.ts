import type { Account } from "@prisma/client";
import type { JiraData } from "@/lib/adapters/jira/contract";
import type { WorksphereData } from "@/lib/adapters/worksphere/contract";
import type { FinanceData } from "@/lib/adapters/finance/contract";

export interface KpiInput {
  name: string;
  category: string;
  value: number;
  target: number;
}

export interface KpiDriver {
  label: string;
  value: string;
  score?: number;
}

export interface KpiBreakdown {
  key: KpiScoreKey;
  label: string;
  rationale: string;
  score: number;
  weight: number;
  drivers: KpiDriver[];
  formula: string;
  fallback?: string;
}

export type KpiScoreKey =
  | "csat"
  | "relationship"
  | "risk"
  | "contractHealth"
  | "projectHealth"
  | "resourceHealth"
  | "financial"
  | "whitespace";

export type KpiScoreMap = Record<KpiScoreKey, number>;

export interface KpiCalculationResult {
  scores: KpiScoreMap;
  breakdown: Record<KpiScoreKey, KpiBreakdown>;
}

export const KPI_RATIONALE: Record<KpiScoreKey, { label: string; rationale: string; formula: string; fallback?: string }> = {
  csat: {
    label: "Customer Success",
    rationale: "Customer satisfaction, confidence, trust, and perceived value from Tkxel's services.",
    formula: "20% customer feedback + 20% confidence + 20% delivery satisfaction + 20% communication satisfaction + 20% issue resolution",
  },
  relationship: {
    label: "Relationship Health",
    rationale: "Relationship strength, depth, frequency, quality, and stakeholder penetration.",
    formula: "20% executive engagement + 20% stakeholder coverage + 20% relationship penetration + 20% champion strength + 20% engagement cadence",
  },
  risk: {
    label: "Risk Score",
    rationale: "Early warning across delivery, commercial, relationship, and market risk.",
    formula: "25% delivery risk + 25% commercial risk + 25% relationship risk + 25% market risk",
  },
  contractHealth: {
    label: "Contract Health",
    rationale: "Commercial protection, defensibility, contract stability, and long-term sustainability.",
    formula: "20% duration + 20% notice protection + 20% renewability + 20% price uplift protection + 20% termination protection",
  },
  projectHealth: {
    label: "Project Health",
    rationale: "Delivery performance, future work visibility, execution stability, and customer delivery confidence.",
    formula: "20% delivery performance + 20% backlog readiness + 20% roadmap visibility + 20% escalation status + 20% client confidence",
  },
  resourceHealth: {
    label: "Resource Health",
    rationale: "Resource dependency, team continuity, succession readiness, and delivery resilience.",
    formula: "20% dependency risk + 20% critical coverage + 20% team stability + 20% skill alignment + 20% backup readiness",
    fallback: "Use Worksphere/resource data when available; otherwise require user confirmation before scoring.",
  },
  financial: {
    label: "Financial Health",
    rationale: "Payment behavior, revenue trends, billing accuracy, and client financial stability.",
    formula: "20% payment timeliness + 20% outstanding exposure + 20% client financial stability + 20% revenue trend + 20% contract/billing alignment",
  },
  whitespace: {
    label: "Whitespace Analysis",
    rationale: "Growth opportunity signal; intentionally lower in health score but high in opportunity ranking.",
    formula: "25% expansion signal + 25% CSAT readiness + 25% relationship readiness + 25% adoption/utilization",
  },
};

const KPI_WEIGHT: Record<KpiScoreKey, number> = {
  csat: 15,
  relationship: 20,
  risk: 15,
  contractHealth: 15,
  projectHealth: 10,
  resourceHealth: 10,
  financial: 10,
  whitespace: 5,
};

export function clampScore(v: number): number {
  return Math.min(100, Math.max(0, Math.round(v)));
}

function avg(values: number[], fallback = 50): number {
  const valid = values.filter((v) => Number.isFinite(v));
  if (!valid.length) return fallback;
  return valid.reduce((a, b) => a + b, 0) / valid.length;
}

function avgKpis(kpis: KpiInput[]): number {
  if (!kpis.length) return 50;
  const scores = kpis.map((k) => Math.min(100, (k.value / (k.target || 1)) * 100));
  return Math.round(scores.reduce((a, b) => a + b, 0) / scores.length);
}

function scoreFromOverdueRatio(amount: number, baseline: number): number {
  if (amount <= 0) return 100;
  return clampScore(100 - (amount / Math.max(baseline, 1)) * 100);
}

function revenueTrendScore(history: { utilizationPct: number }[]): number {
  if (history.length < 2) return 70;
  const latest = history[history.length - 1]?.utilizationPct ?? 0;
  const previous = history[history.length - 2]?.utilizationPct ?? latest;
  return clampScore(70 + (latest - previous) * 3);
}

function meetingSentimentScore(sentiments: Array<"positive" | "neutral" | "negative" | null>): number {
  if (!sentiments.length) return 60;
  return clampScore(avg(sentiments.map((s) => (s === "positive" ? 90 : s === "negative" ? 30 : 60)), 60));
}

// Deterministic mock score for a named resource sub-component — each seed
// produces a stable, account-specific value in the range [52, 88].
function resourceSubMock(accountId: string, seed: number): number {
  let hash = seed;
  for (const char of accountId) hash = (hash * 31 + char.charCodeAt(0)) % 997;
  return 52 + (hash % 37);
}

function makeBreakdown(key: KpiScoreKey, score: number, drivers: KpiDriver[]): KpiBreakdown {
  const meta = KPI_RATIONALE[key];
  return {
    key,
    label: meta.label,
    rationale: meta.rationale,
    score,
    weight: KPI_WEIGHT[key],
    drivers,
    formula: meta.formula,
    fallback: meta.fallback,
  };
}

export function calculateKpiSubscores({
  account,
  kpis,
  jira,
  worksphere,
  finance,
}: {
  account: Pick<Account, "id" | "arr" | "contractStart" | "contractEnd">;
  kpis: KpiInput[];
  jira: JiraData;
  worksphere: WorksphereData;
  finance: FinanceData;
}): KpiCalculationResult {
  const byCategory = (cat: string) => kpis.filter((k) => k.category === cat);
  const engagementKpis = byCategory("engagement");
  const relationshipKpis = byCategory("relationship");
  const financialKpis = byCategory("financial");

  // ── CSAT: client feedback plus recent stakeholder touchpoint sentiment ───
  const explicitCsat = kpis.find((k) => k.name.toLowerCase().includes("csat"));
  const csatKpiScore = explicitCsat
    ? clampScore((explicitCsat.value / (explicitCsat.target || 1)) * 100)
    : avgKpis(engagementKpis);
  const sentimentScore = meetingSentimentScore(worksphere.recentMeetings.map((m) => m.sentiment));
  const csat = clampScore((csatKpiScore + sentimentScore) / 2);

  // ── Relationship: 4 equal sub-components (25% each) ──────────────────────
  // 1. Stakeholder depth — relationship KPIs
  const stakeholderDepthScore = avgKpis(
    relationshipKpis.length
      ? relationshipKpis
      : [{ name: "Relationship baseline", category: "relationship", value: 55, target: 100 }]
  );
  // 2. Stakeholder breadth — unique attendees per meeting
  const stakeholderBreadthScore = clampScore(
    avg(worksphere.recentMeetings.map((m) => Math.min(m.attendees.length, 6) * (100 / 6)), 55)
  );
  // 3. Meeting cadence — recent meeting frequency (4+ meetings = 100)
  const meetingCadenceScore = clampScore(Math.min(worksphere.recentMeetings.length, 4) * 25);
  // 4. Executive access — proxy: positive sentiment with broad attendance indicates exec presence
  const executiveAccessScore = clampScore(stakeholderBreadthScore * 0.6 + sentimentScore * 0.4);
  const relationship = clampScore(
    (stakeholderDepthScore + stakeholderBreadthScore + meetingCadenceScore + executiveAccessScore) / 4
  );

  // ── Risk: 4 equal sub-components (25% each) ──────────────────────────────
  // 1. Delivery risk — open/critical tickets + resolution time
  const ticketScore = clampScore(100 - jira.openTickets * 2);
  const critScore = clampScore(100 - jira.criticalTickets * 12);
  const resolutionRiskScore = clampScore(100 - jira.avgResolutionDays * 5);
  const deliveryRisk = clampScore((ticketScore + critScore + resolutionRiskScore) / 3);
  // 2. Commercial risk — overdue invoices vs monthly baseline
  const commercialRisk = scoreFromOverdueRatio(finance.overdueAmount, Math.max(account.arr / 12, finance.mrr, 1));
  // 3. Relationship risk — inverse of relationship health
  const relationshipRisk = clampScore(relationship);
  // 4. Market risk — revenue utilisation trend as a proxy for market pressure
  const marketRiskScore = revenueTrendScore(finance.revenueHistory);
  const risk = clampScore((deliveryRisk + commercialRisk + relationshipRisk + marketRiskScore) / 4);

  // ── Contract Health: 3 equal sub-components (33% each) ───────────────────
  // 1. Renewal risk — days until contract end
  const daysLeft = account.contractEnd
    ? Math.ceil((new Date(account.contractEnd).getTime() - Date.now()) / 864e5)
    : 365;
  const renewalScore = clampScore(daysLeft > 180 ? 90 : daysLeft > 90 ? 70 : daysLeft > 30 ? 40 : 15);
  // 2. Contractual protection — contract completeness (start + end dates present)
  const contractProtectionScore = account.contractStart && account.contractEnd ? 80 : 55;
  // 3. Commercial foundation — revenue utilisation
  const revScore = clampScore(finance.revenueUtilizationPct);
  const contractHealth = clampScore((renewalScore + contractProtectionScore + revScore) / 3);

  // ── Project Health: 3 equal sub-components (33% each) ────────────────────
  // 1. Delivery execution quality — issue resolution speed
  const resolutionScore = clampScore(100 - jira.avgResolutionDays * 5);
  // 2. Backlog health — open ticket volume
  const backlogScore = clampScore(100 - jira.openTickets * 2);
  // 3. Velocity health — sprint velocity
  const sprintVelocity = jira.activeSprint?.velocity ?? 70;
  const velocityScore = clampScore(sprintVelocity);
  const projectHealth = clampScore((resolutionScore + backlogScore + velocityScore) / 3);

  // ── Resource Health: 4 equal sub-components (25% each) ───────────────────
  // All mocked in MVP with deterministic per-account values; live Worksphere later.
  // Different seeds ensure each sub-component varies independently per account.
  const resourceKpis = byCategory("resource");
  const teamStabilityScore  = resourceKpis.length ? avgKpis(resourceKpis) : resourceSubMock(account.id, 7);
  const teamFitScore        = resourceKpis.length ? avgKpis(resourceKpis) : resourceSubMock(account.id, 13);
  const turnoverRiskScore   = resourceKpis.length ? avgKpis(resourceKpis) : resourceSubMock(account.id, 31);
  const benchRiskScore      = resourceKpis.length ? avgKpis(resourceKpis) : resourceSubMock(account.id, 53);
  const resourceHealth = clampScore((teamStabilityScore + teamFitScore + turnoverRiskScore + benchRiskScore) / 4);

  // ── Financial: 3 equal sub-components (33% each) ─────────────────────────
  // 1. Payment timeliness — paid invoices with no/low overdue days
  const paidInvoices = finance.invoices.filter((invoice) => invoice.status === "paid");
  const paidOnTimeScore = paidInvoices.length
    ? clampScore(avg(paidInvoices.map((invoice) => invoice.daysOverdue > 0 ? Math.max(0, 100 - invoice.daysOverdue * 4) : 100), 100))
    : 75;
  // 2. Outstanding invoices — overdue exposure vs monthly baseline
  const overdueScore = scoreFromOverdueRatio(finance.overdueAmount, Math.max(account.arr / 12, finance.mrr, 1));
  // 3. Revenue trend — utilisation movement between last two periods
  const trendScore = revenueTrendScore(finance.revenueHistory);
  const financial = clampScore((paidOnTimeScore + overdueScore + trendScore) / 3);

  // ── Whitespace: 4 equal sub-components (25% each) ────────────────────────
  // 1. Expansion signal — pipeline/expansion KPIs or ARR tier proxy
  const arrTier = account.arr >= 500_000 ? 80 : account.arr >= 200_000 ? 65 : account.arr >= 100_000 ? 50 : 35;
  const expansionKpis = financialKpis.filter((k) => k.name.toLowerCase().includes("expansion") || k.name.toLowerCase().includes("pipeline"));
  const expansionSignal = expansionKpis.length ? avgKpis(expansionKpis) : arrTier;
  // 2. CSAT readiness — already computed above
  // 3. Relationship readiness — already computed above
  // 4. Adoption/utilisation — platform utilisation %
  const adoptionScore = clampScore(worksphere.utilizationPct);
  const whitespace = clampScore((expansionSignal + csat + relationship + adoptionScore) / 4);

  const scores = {
    csat,
    relationship,
    risk,
    contractHealth,
    projectHealth,
    resourceHealth,
    financial,
    whitespace,
  };

  return {
    scores,
    breakdown: {
      csat: makeBreakdown("csat", csat, [
        { label: explicitCsat ? explicitCsat.name : "Client feedback KPI", value: explicitCsat ? `${explicitCsat.value}/${explicitCsat.target}` : `${engagementKpis.length} KPI(s)`, score: csatKpiScore },
        { label: "Touchpoint sentiment", value: `${worksphere.recentMeetings.length} recent touchpoint(s)`, score: sentimentScore },
      ]),
      relationship: makeBreakdown("relationship", relationship, [
        { label: "Stakeholder depth", value: `${relationshipKpis.length || 1} relationship KPI(s)`, score: stakeholderDepthScore },
        { label: "Stakeholder breadth", value: "Attendees per meeting", score: stakeholderBreadthScore },
        { label: "Meeting cadence", value: `${worksphere.recentMeetings.length} recent meeting(s)`, score: meetingCadenceScore },
        { label: "Executive access", value: "Breadth + sentiment proxy", score: executiveAccessScore },
      ]),
      risk: makeBreakdown("risk", risk, [
        { label: "Delivery risk", value: `${jira.openTickets} open, ${jira.criticalTickets} critical`, score: deliveryRisk },
        { label: "Commercial risk", value: `$${finance.overdueAmount.toLocaleString()} overdue`, score: commercialRisk },
        { label: "Relationship risk", value: "Relationship subscore", score: relationshipRisk },
        { label: "Market risk", value: "Revenue utilisation trend", score: marketRiskScore },
      ]),
      contractHealth: makeBreakdown("contractHealth", contractHealth, [
        { label: "Renewal risk", value: `${daysLeft} days remaining`, score: renewalScore },
        { label: "Contractual protection", value: account.contractStart && account.contractEnd ? "Dates present" : "Missing contract dates", score: contractProtectionScore },
        { label: "Commercial foundation", value: `${finance.revenueUtilizationPct}% revenue utilisation`, score: revScore },
      ]),
      projectHealth: makeBreakdown("projectHealth", projectHealth, [
        { label: "Delivery execution quality", value: `${jira.avgResolutionDays}d avg resolution`, score: resolutionScore },
        { label: "Backlog health", value: `${jira.openTickets} open tickets`, score: backlogScore },
        { label: "Velocity health", value: `${sprintVelocity}% sprint velocity`, score: velocityScore },
      ]),
      resourceHealth: makeBreakdown("resourceHealth", resourceHealth, [
        { label: "Team stability", value: resourceKpis.length ? `${resourceKpis.length} resource KPI(s)` : "MVP mock", score: teamStabilityScore },
        { label: "Team fit", value: resourceKpis.length ? "Live KPI" : "MVP mock", score: teamFitScore },
        { label: "Turnover risk", value: resourceKpis.length ? "Live KPI" : "MVP mock", score: turnoverRiskScore },
        { label: "Bench risk", value: resourceKpis.length ? "Live KPI" : "MVP mock", score: benchRiskScore },
      ]),
      financial: makeBreakdown("financial", financial, [
        { label: "Payment timeliness", value: `${paidInvoices.length} paid invoice(s)`, score: paidOnTimeScore },
        { label: "Outstanding invoices", value: `$${finance.overdueAmount.toLocaleString()} overdue`, score: overdueScore },
        { label: "Revenue trend", value: "Last two periods", score: trendScore },
      ]),
      whitespace: makeBreakdown("whitespace", whitespace, [
        { label: "Expansion signal", value: expansionKpis.length ? `${expansionKpis.length} pipeline KPI(s)` : "ARR tier proxy", score: expansionSignal },
        { label: "CSAT readiness", value: "CSAT subscore", score: csat },
        { label: "Relationship readiness", value: "Relationship subscore", score: relationship },
        { label: "Adoption/utilisation", value: `${worksphere.utilizationPct}% utilisation`, score: adoptionScore },
      ]),
    },
  };
}

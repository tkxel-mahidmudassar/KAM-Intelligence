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
    label: "CSAT Score",
    rationale: "Direct client satisfaction and most important relationship-quality signal.",
    formula: "50% CSAT/client feedback KPI + 50% stakeholder touchpoint sentiment",
  },
  relationship: {
    label: "Relationship Score",
    rationale: "Depth and breadth of stakeholder penetration and executive access.",
    formula: "25% stakeholder depth + 25% stakeholder breadth + 25% meeting cadence + 25% executive access",
  },
  risk: {
    label: "Risk Score",
    rationale: "Early warning across delivery, commercial, relationship, and market risk.",
    formula: "25% delivery risk + 25% commercial risk + 25% relationship risk + 25% market risk",
  },
  contractHealth: {
    label: "Contract Health Score",
    rationale: "Renewal risk, contractual protection, and commercial foundation.",
    formula: "33% renewal risk + 33% contractual protection + 33% commercial foundation",
  },
  projectHealth: {
    label: "Project Health Score",
    rationale: "Delivery execution quality and backlog/velocity health.",
    formula: "33% delivery execution quality + 33% backlog health + 33% velocity health",
  },
  resourceHealth: {
    label: "Resource Health Score",
    rationale: "Team stability, fit, turnover, and bench risk; mocked in MVP, live Worksphere later.",
    formula: "25% team stability + 25% team fit + 25% turnover risk + 25% bench risk",
    fallback: "MVP uses deterministic per-account mock for each sub-component until live Worksphere resource data exists.",
  },
  financial: {
    label: "Financial Score",
    rationale: "Payment timeliness, outstanding invoices, and revenue trend.",
    formula: "33% payment timeliness + 33% outstanding invoices + 33% revenue trend",
  },
  whitespace: {
    label: "Whitespace Analysis",
    rationale: "Growth opportunity signal; intentionally lower in health score but high in opportunity ranking.",
    formula: "25% expansion signal + 25% CSAT readiness + 25% relationship readiness + 25% adoption/utilization",
  },
};

const KPI_WEIGHT: Record<KpiScoreKey, number> = {
  relationship: 20,
  csat: 15,
  risk: 15,
  contractHealth: 15,
  projectHealth: 10,
  resourceHealth: 10,
  financial: 10,
  whitespace: 5,
};

const NEUTRAL_SCORE = 60; // 3/5: moderate, requires monitoring, and no unsupported assumption.
const NEUTRAL_VALUE = "No source evidence; neutral 3/5 baseline";

export function clampScore(v: number): number {
  return Math.min(100, Math.max(0, Math.round(v)));
}

function avg(values: number[], fallback = NEUTRAL_SCORE): number {
  const valid = values.filter((v) => Number.isFinite(v));
  if (!valid.length) return fallback;
  return valid.reduce((a, b) => a + b, 0) / valid.length;
}

function avgKpis(kpis: KpiInput[]): number {
  if (!kpis.length) return NEUTRAL_SCORE;
  const scores = kpis.map((k) => Math.min(100, (k.value / (k.target || 1)) * 100));
  return Math.round(scores.reduce((a, b) => a + b, 0) / scores.length);
}

function scoreFromOverdueRatio(amount: number, baseline: number): number {
  if (amount <= 0) return 100;
  return clampScore(100 - (amount / Math.max(baseline, 1)) * 100);
}

function revenueTrendScore(history: { utilizationPct: number }[]): number {
  if (history.length < 2) return NEUTRAL_SCORE;
  const latest = history[history.length - 1]?.utilizationPct ?? 0;
  const previous = history[history.length - 2]?.utilizationPct ?? latest;
  return clampScore(70 + (latest - previous) * 3);
}

function meetingSentimentScore(sentiments: Array<"positive" | "neutral" | "negative" | null>): number {
  if (!sentiments.length) return NEUTRAL_SCORE;
  return clampScore(avg(sentiments.map((s) => (s === "positive" ? 90 : s === "negative" ? 30 : NEUTRAL_SCORE)), NEUTRAL_SCORE));
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
  const hasJiraEvidence = jira.tickets.length > 0 || Boolean(jira.activeSprint) || jira.openTickets > 0 || jira.criticalTickets > 0 || jira.avgResolutionDays > 0;
  const hasWorksphereEvidence = worksphere.recentMeetings.length > 0 || worksphere.npsScore !== null || worksphere.npsSampleSize > 0 || worksphere.totalLicenses > 0 || worksphere.activeUsers > 0;
  const hasFinanceEvidence = finance.invoices.length > 0 || finance.revenueHistory.length > 0 || finance.outstandingBalance > 0 || finance.overdueAmount > 0;

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
      : [{ name: "Relationship baseline", category: "relationship", value: NEUTRAL_SCORE, target: 100 }]
  );
  // 2. Stakeholder breadth — unique attendees per meeting
  const stakeholderBreadthScore = clampScore(
    avg(worksphere.recentMeetings.map((m) => Math.min(m.attendees.length, 6) * (100 / 6)), NEUTRAL_SCORE)
  );
  // 3. Meeting cadence — recent meeting frequency (4+ meetings = 100)
  const meetingCadenceScore = worksphere.recentMeetings.length
    ? clampScore(Math.min(worksphere.recentMeetings.length, 4) * 25)
    : NEUTRAL_SCORE;
  // 4. Executive access — proxy: positive sentiment with broad attendance indicates exec presence
  const executiveAccessScore = clampScore(stakeholderBreadthScore * 0.6 + sentimentScore * 0.4);
  const relationship = clampScore(
    (stakeholderDepthScore + stakeholderBreadthScore + meetingCadenceScore + executiveAccessScore) / 4
  );

  // ── Risk: 4 equal sub-components (25% each) ──────────────────────────────
  // 1. Delivery risk — open/critical tickets + resolution time
  const ticketScore = hasJiraEvidence ? clampScore(100 - jira.openTickets * 2) : NEUTRAL_SCORE;
  const critScore = hasJiraEvidence ? clampScore(100 - jira.criticalTickets * 12) : NEUTRAL_SCORE;
  const resolutionRiskScore = hasJiraEvidence ? clampScore(100 - jira.avgResolutionDays * 5) : NEUTRAL_SCORE;
  const deliveryRisk = clampScore((ticketScore + critScore + resolutionRiskScore) / 3);
  // 2. Commercial risk — overdue invoices vs monthly baseline
  const commercialRisk = hasFinanceEvidence
    ? scoreFromOverdueRatio(finance.overdueAmount, Math.max(account.arr / 12, finance.mrr, 1))
    : NEUTRAL_SCORE;
  // 3. Relationship risk — inverse of relationship health
  const relationshipRisk = clampScore(relationship);
  // 4. Market risk — revenue utilisation trend as a proxy for market pressure
  const marketRiskScore = revenueTrendScore(finance.revenueHistory);
  const risk = clampScore((deliveryRisk + commercialRisk + relationshipRisk + marketRiskScore) / 4);

  // ── Contract Health: 3 equal sub-components (33% each) ───────────────────
  // 1. Renewal risk — days until contract end
  const daysLeft = account.contractEnd
    ? Math.ceil((new Date(account.contractEnd).getTime() - Date.now()) / 864e5)
    : null;
  const renewalScore = daysLeft === null ? NEUTRAL_SCORE : clampScore(daysLeft > 180 ? 90 : daysLeft > 90 ? 70 : daysLeft > 30 ? 40 : 15);
  // 2. Contractual protection — contract completeness (start + end dates present)
  const contractProtectionScore = account.contractStart && account.contractEnd ? 80 : NEUTRAL_SCORE;
  // 3. Commercial foundation — revenue utilisation
  const revScore = finance.revenueHistory.length ? clampScore(finance.revenueUtilizationPct) : NEUTRAL_SCORE;
  const contractHealth = clampScore((renewalScore + contractProtectionScore + revScore) / 3);

  // ── Project Health: 3 equal sub-components (33% each) ────────────────────
  // 1. Delivery execution quality — issue resolution speed
  const resolutionScore = hasJiraEvidence ? clampScore(100 - jira.avgResolutionDays * 5) : NEUTRAL_SCORE;
  // 2. Backlog health — open ticket volume
  const backlogScore = hasJiraEvidence ? clampScore(100 - jira.openTickets * 2) : NEUTRAL_SCORE;
  // 3. Velocity health — sprint velocity
  const sprintVelocity = jira.activeSprint?.velocity ?? NEUTRAL_SCORE;
  const velocityScore = clampScore(sprintVelocity);
  const projectHealth = clampScore((resolutionScore + backlogScore + velocityScore) / 3);

  // ── Resource Health: 4 equal sub-components (25% each) ───────────────────
  const resourceKpis = byCategory("resource");
  const resourceEvidenceScore = resourceKpis.length ? avgKpis(resourceKpis) : NEUTRAL_SCORE;
  const teamStabilityScore  = resourceEvidenceScore;
  const teamFitScore        = resourceEvidenceScore;
  const turnoverRiskScore   = resourceEvidenceScore;
  const benchRiskScore      = resourceEvidenceScore;
  const resourceHealth = clampScore((teamStabilityScore + teamFitScore + turnoverRiskScore + benchRiskScore) / 4);

  // ── Financial: 3 equal sub-components (33% each) ─────────────────────────
  // 1. Payment timeliness — paid invoices with no/low overdue days
  const paidInvoices = finance.invoices.filter((invoice) => invoice.status === "paid");
  const paidOnTimeScore = paidInvoices.length
    ? clampScore(avg(paidInvoices.map((invoice) => invoice.daysOverdue > 0 ? Math.max(0, 100 - invoice.daysOverdue * 4) : 100), 100))
    : NEUTRAL_SCORE;
  // 2. Outstanding invoices — overdue exposure vs monthly baseline
  const overdueScore = hasFinanceEvidence
    ? scoreFromOverdueRatio(finance.overdueAmount, Math.max(account.arr / 12, finance.mrr, 1))
    : NEUTRAL_SCORE;
  // 3. Revenue trend — utilisation movement between last two periods
  const trendScore = revenueTrendScore(finance.revenueHistory);
  const financial = clampScore((paidOnTimeScore + overdueScore + trendScore) / 3);

  // ── Whitespace: 4 equal sub-components (25% each) ────────────────────────
  // 1. Expansion signal — pipeline/expansion KPIs only; missing evidence stays neutral.
  const expansionKpis = financialKpis.filter((k) => k.name.toLowerCase().includes("expansion") || k.name.toLowerCase().includes("pipeline"));
  const expansionSignal = expansionKpis.length ? avgKpis(expansionKpis) : NEUTRAL_SCORE;
  // 2. CSAT readiness — already computed above
  // 3. Relationship readiness — already computed above
  // 4. Adoption/utilisation — platform utilisation %
  const adoptionScore = hasWorksphereEvidence ? clampScore(worksphere.utilizationPct) : NEUTRAL_SCORE;
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
        { label: explicitCsat ? explicitCsat.name : "Client feedback KPI", value: explicitCsat ? `${explicitCsat.value}/${explicitCsat.target}` : (engagementKpis.length ? `${engagementKpis.length} KPI(s)` : NEUTRAL_VALUE), score: csatKpiScore },
        { label: "Touchpoint sentiment", value: worksphere.recentMeetings.length ? `${worksphere.recentMeetings.length} recent touchpoint(s)` : NEUTRAL_VALUE, score: sentimentScore },
      ]),
      relationship: makeBreakdown("relationship", relationship, [
        { label: "Stakeholder depth", value: relationshipKpis.length ? `${relationshipKpis.length} relationship KPI(s)` : NEUTRAL_VALUE, score: stakeholderDepthScore },
        { label: "Stakeholder breadth", value: worksphere.recentMeetings.length ? "Attendees per meeting" : NEUTRAL_VALUE, score: stakeholderBreadthScore },
        { label: "Meeting cadence", value: worksphere.recentMeetings.length ? `${worksphere.recentMeetings.length} recent meeting(s)` : NEUTRAL_VALUE, score: meetingCadenceScore },
        { label: "Executive access", value: worksphere.recentMeetings.length ? "Breadth + sentiment proxy" : NEUTRAL_VALUE, score: executiveAccessScore },
      ]),
      risk: makeBreakdown("risk", risk, [
        { label: "Delivery risk", value: hasJiraEvidence ? `${jira.openTickets} open, ${jira.criticalTickets} critical` : NEUTRAL_VALUE, score: deliveryRisk },
        { label: "Commercial risk", value: hasFinanceEvidence ? `$${finance.overdueAmount.toLocaleString()} overdue` : NEUTRAL_VALUE, score: commercialRisk },
        { label: "Relationship risk", value: "Relationship subscore", score: relationshipRisk },
        { label: "Market risk", value: finance.revenueHistory.length >= 2 ? "Revenue utilisation trend" : NEUTRAL_VALUE, score: marketRiskScore },
      ]),
      contractHealth: makeBreakdown("contractHealth", contractHealth, [
        { label: "Renewal risk", value: daysLeft === null ? NEUTRAL_VALUE : `${daysLeft} days remaining`, score: renewalScore },
        { label: "Contractual protection", value: account.contractStart && account.contractEnd ? "Dates present" : "Missing contract dates", score: contractProtectionScore },
        { label: "Commercial foundation", value: finance.revenueHistory.length ? `${finance.revenueUtilizationPct}% revenue utilisation` : NEUTRAL_VALUE, score: revScore },
      ]),
      projectHealth: makeBreakdown("projectHealth", projectHealth, [
        { label: "Delivery execution quality", value: hasJiraEvidence ? `${jira.avgResolutionDays}d avg resolution` : NEUTRAL_VALUE, score: resolutionScore },
        { label: "Backlog health", value: hasJiraEvidence ? `${jira.openTickets} open tickets` : NEUTRAL_VALUE, score: backlogScore },
        { label: "Velocity health", value: jira.activeSprint ? `${sprintVelocity}% sprint velocity` : NEUTRAL_VALUE, score: velocityScore },
      ]),
      resourceHealth: makeBreakdown("resourceHealth", resourceHealth, [
        { label: "Team stability", value: resourceKpis.length ? `${resourceKpis.length} resource KPI(s)` : NEUTRAL_VALUE, score: teamStabilityScore },
        { label: "Team fit", value: resourceKpis.length ? "Live KPI" : NEUTRAL_VALUE, score: teamFitScore },
        { label: "Turnover risk", value: resourceKpis.length ? "Live KPI" : NEUTRAL_VALUE, score: turnoverRiskScore },
        { label: "Bench risk", value: resourceKpis.length ? "Live KPI" : NEUTRAL_VALUE, score: benchRiskScore },
      ]),
      financial: makeBreakdown("financial", financial, [
        { label: "Payment timeliness", value: paidInvoices.length ? `${paidInvoices.length} paid invoice(s)` : NEUTRAL_VALUE, score: paidOnTimeScore },
        { label: "Outstanding invoices", value: hasFinanceEvidence ? `$${finance.overdueAmount.toLocaleString()} overdue` : NEUTRAL_VALUE, score: overdueScore },
        { label: "Revenue trend", value: finance.revenueHistory.length >= 2 ? "Last two periods" : NEUTRAL_VALUE, score: trendScore },
      ]),
      whitespace: makeBreakdown("whitespace", whitespace, [
        { label: "Expansion signal", value: expansionKpis.length ? `${expansionKpis.length} pipeline KPI(s)` : NEUTRAL_VALUE, score: expansionSignal },
        { label: "CSAT readiness", value: "CSAT subscore", score: csat },
        { label: "Relationship readiness", value: "Relationship subscore", score: relationship },
        { label: "Adoption/utilisation", value: hasWorksphereEvidence ? `${worksphere.utilizationPct}% utilisation` : NEUTRAL_VALUE, score: adoptionScore },
      ]),
    },
  };
}

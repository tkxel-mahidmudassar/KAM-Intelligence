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
    formula: "55% NPS + 30% explicit CSAT/engagement KPI + 15% meeting sentiment",
  },
  relationship: {
    label: "Relationship Score",
    rationale: "Depth and breadth of stakeholder penetration and executive access.",
    formula: "50% relationship KPIs + 25% stakeholder breadth + 15% meeting cadence + 10% sentiment",
  },
  risk: {
    label: "Risk Score",
    rationale: "Early warning across delivery, commercial, relationship, and internal risk.",
    formula: "45% delivery risk + 25% commercial risk + 20% relationship health + 10% CSAT",
  },
  contractHealth: {
    label: "Contract Health Score",
    rationale: "Renewal risk, contractual protection, and commercial foundation.",
    formula: "40% renewal proximity + 25% overdue exposure + 20% revenue utilization + 15% contract completeness",
  },
  projectHealth: {
    label: "Project Health Score",
    rationale: "Delivery execution quality and backlog/velocity health.",
    formula: "35% sprint velocity + 25% backlog health + 25% resolution speed + 15% support/project KPI",
  },
  resourceHealth: {
    label: "Resource Health Score",
    rationale: "Team stability, fit, turnover, and bench risk; mocked in MVP, live Worksphere later.",
    formula: "Resource KPI if present; otherwise deterministic resource stability mock blended with project and relationship health",
    fallback: "MVP uses deterministic account-level mock until live Worksphere resource data exists.",
  },
  financial: {
    label: "Financial Score",
    rationale: "Payment timeliness, outstanding invoices, and revenue trend.",
    formula: "35% overdue exposure + 25% payment timeliness + 20% revenue trend + 10% outstanding balance + 10% financial KPI",
  },
  whitespace: {
    label: "Whitespace Analysis",
    rationale: "Growth opportunity signal; intentionally lower in health score but high in opportunity ranking.",
    formula: "45% expansion signal + 25% CSAT + 15% relationship + 15% adoption/utilization",
  },
};

const KPI_WEIGHT: Record<KpiScoreKey, number> = {
  csat: 20,
  relationship: 15,
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

function resourceHealthMockScore(accountId: string): number {
  let hash = 0;
  for (const char of accountId) hash = (hash * 31 + char.charCodeAt(0)) % 997;
  return 58 + (hash % 28);
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
  const supportKpis = byCategory("support");
  const engagementKpis = byCategory("engagement");
  const relationshipKpis = byCategory("relationship");
  const financialKpis = byCategory("financial");

  const npsScore = clampScore(((worksphere.npsScore ?? 0) + 100) / 2);
  const explicitCsat = kpis.find((k) => k.name.toLowerCase().includes("csat"));
  const csatKpiScore = explicitCsat
    ? clampScore((explicitCsat.value / (explicitCsat.target || 1)) * 100)
    : avgKpis(engagementKpis);
  const sentimentScore = meetingSentimentScore(worksphere.recentMeetings.map((m) => m.sentiment));
  const csat = clampScore(npsScore * 0.55 + csatKpiScore * 0.30 + sentimentScore * 0.15);

  const meetingCadenceScore = clampScore(Math.min(worksphere.recentMeetings.length, 4) * 25);
  const stakeholderBreadthScore = clampScore(avg(worksphere.recentMeetings.map((m) => Math.min(m.attendees.length, 6) * (100 / 6)), 55));
  const relationshipKpiScore = avgKpis(relationshipKpis.length ? relationshipKpis : [{ name: "Default relationship baseline", category: "relationship", value: 55, target: 100 }]);
  const relationship = clampScore(
    relationshipKpiScore * 0.50 +
    stakeholderBreadthScore * 0.25 +
    meetingCadenceScore * 0.15 +
    sentimentScore * 0.10
  );

  const ticketScore = clampScore(100 - jira.openTickets * 2);
  const critScore = clampScore(100 - jira.criticalTickets * 12);
  const resolutionRiskScore = clampScore(100 - jira.avgResolutionDays * 5);
  const deliveryRisk = clampScore(ticketScore * 0.45 + critScore * 0.35 + resolutionRiskScore * 0.20);
  const commercialRisk = scoreFromOverdueRatio(finance.overdueAmount, Math.max(account.arr / 12, finance.mrr, 1));
  const relationshipRisk = clampScore(relationship);
  const risk = clampScore(deliveryRisk * 0.45 + commercialRisk * 0.25 + relationshipRisk * 0.20 + csat * 0.10);

  const revScore = clampScore(finance.revenueUtilizationPct);
  const overdueScore = scoreFromOverdueRatio(finance.overdueAmount, Math.max(account.arr / 12, finance.mrr, 1));
  const daysLeft = account.contractEnd
    ? Math.ceil((new Date(account.contractEnd).getTime() - Date.now()) / 864e5)
    : 365;
  const renewalScore = clampScore(daysLeft > 180 ? 90 : daysLeft > 90 ? 70 : daysLeft > 30 ? 40 : 15);
  const contractProtectionScore = account.contractStart && account.contractEnd ? 80 : 55;
  const contractHealth = clampScore(renewalScore * 0.40 + overdueScore * 0.25 + revScore * 0.20 + contractProtectionScore * 0.15);

  const sprintVelocity = jira.activeSprint?.velocity ?? 70;
  const velocityScore = clampScore(sprintVelocity);
  const resolutionScore = clampScore(100 - jira.avgResolutionDays * 5);
  const backlogScore = clampScore(100 - jira.openTickets * 2);
  const projectKpiScore = avgKpis(supportKpis.length ? supportKpis : [{ name: "Sprint velocity", category: "support", value: velocityScore, target: 100 }]);
  const projectHealth = clampScore(velocityScore * 0.35 + backlogScore * 0.25 + resolutionScore * 0.25 + projectKpiScore * 0.15);

  const resourceKpis = byCategory("resource");
  const resourceMock = resourceHealthMockScore(account.id);
  const resourceHealth = clampScore(
    resourceKpis.length
      ? avgKpis(resourceKpis)
      : resourceMock * 0.75 + projectHealth * 0.15 + relationship * 0.10
  );

  const paidInvoices = finance.invoices.filter((invoice) => invoice.status === "paid");
  const paidOnTimeScore = paidInvoices.length
    ? clampScore(avg(paidInvoices.map((invoice) => invoice.daysOverdue > 0 ? Math.max(0, 100 - invoice.daysOverdue * 4) : 100), 100))
    : 75;
  const outstandingScore = scoreFromOverdueRatio(finance.outstandingBalance, Math.max(finance.mrr * 2, account.arr / 6, 1));
  const trendScore = revenueTrendScore(finance.revenueHistory);
  const financialKpiScore = avgKpis(financialKpis.length ? financialKpis : [{ name: "Revenue utilization", category: "financial", value: revScore, target: 100 }]);
  const financial = clampScore(overdueScore * 0.35 + paidOnTimeScore * 0.25 + trendScore * 0.20 + outstandingScore * 0.10 + financialKpiScore * 0.10);

  const arrTier = account.arr >= 500_000 ? 80 : account.arr >= 200_000 ? 65 : account.arr >= 100_000 ? 50 : 35;
  const adoptionScore = clampScore(worksphere.utilizationPct);
  const expansionKpis = financialKpis.filter((k) => k.name.toLowerCase().includes("expansion") || k.name.toLowerCase().includes("pipeline"));
  const expansionSignal = expansionKpis.length ? avgKpis(expansionKpis) : arrTier;
  const whitespace = clampScore(expansionSignal * 0.45 + csat * 0.25 + relationship * 0.15 + adoptionScore * 0.15);

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
        { label: "NPS normalized", value: `${worksphere.npsScore ?? "N/A"}`, score: npsScore },
        { label: explicitCsat ? explicitCsat.name : "Engagement KPI fallback", value: explicitCsat ? `${explicitCsat.value}/${explicitCsat.target}` : `${engagementKpis.length} KPI(s)`, score: csatKpiScore },
        { label: "Meeting sentiment", value: `${worksphere.recentMeetings.length} recent meeting(s)`, score: sentimentScore },
      ]),
      relationship: makeBreakdown("relationship", relationship, [
        { label: "Relationship KPIs", value: `${relationshipKpis.length || 1} KPI(s)`, score: relationshipKpiScore },
        { label: "Stakeholder breadth", value: "Attendees per meeting", score: stakeholderBreadthScore },
        { label: "Meeting cadence", value: `${worksphere.recentMeetings.length} recent meeting(s)`, score: meetingCadenceScore },
        { label: "Sentiment", value: "Recent meeting tone", score: sentimentScore },
      ]),
      risk: makeBreakdown("risk", risk, [
        { label: "Delivery risk", value: `${jira.openTickets} open, ${jira.criticalTickets} critical`, score: deliveryRisk },
        { label: "Commercial risk", value: `$${finance.overdueAmount.toLocaleString()} overdue`, score: commercialRisk },
        { label: "Relationship health", value: "Relationship subscore", score: relationshipRisk },
        { label: "CSAT health", value: "CSAT subscore", score: csat },
      ]),
      contractHealth: makeBreakdown("contractHealth", contractHealth, [
        { label: "Renewal proximity", value: `${daysLeft} days`, score: renewalScore },
        { label: "Overdue exposure", value: `$${finance.overdueAmount.toLocaleString()} overdue`, score: overdueScore },
        { label: "Revenue utilization", value: `${finance.revenueUtilizationPct}%`, score: revScore },
        { label: "Contract completeness", value: account.contractStart && account.contractEnd ? "Start/end present" : "Missing contract dates", score: contractProtectionScore },
      ]),
      projectHealth: makeBreakdown("projectHealth", projectHealth, [
        { label: "Sprint velocity", value: `${sprintVelocity}%`, score: velocityScore },
        { label: "Backlog health", value: `${jira.openTickets} open tickets`, score: backlogScore },
        { label: "Resolution speed", value: `${jira.avgResolutionDays}d average`, score: resolutionScore },
        { label: "Support/project KPI", value: `${supportKpis.length || 1} KPI(s)`, score: projectKpiScore },
      ]),
      resourceHealth: makeBreakdown("resourceHealth", resourceHealth, [
        { label: "Resource stability", value: resourceKpis.length ? `${resourceKpis.length} resource KPI(s)` : "MVP mock", score: resourceKpis.length ? avgKpis(resourceKpis) : resourceMock },
        { label: "Project health blend", value: "Delivery pressure proxy", score: projectHealth },
        { label: "Relationship blend", value: "Fit proxy", score: relationship },
      ]),
      financial: makeBreakdown("financial", financial, [
        { label: "Overdue exposure", value: `$${finance.overdueAmount.toLocaleString()} overdue`, score: overdueScore },
        { label: "Payment timeliness", value: `${paidInvoices.length} paid invoice(s)`, score: paidOnTimeScore },
        { label: "Revenue trend", value: "Last two periods", score: trendScore },
        { label: "Outstanding balance", value: `$${finance.outstandingBalance.toLocaleString()}`, score: outstandingScore },
        { label: "Financial KPI", value: `${financialKpis.length || 1} KPI(s)`, score: financialKpiScore },
      ]),
      whitespace: makeBreakdown("whitespace", whitespace, [
        { label: "Expansion signal", value: expansionKpis.length ? `${expansionKpis.length} pipeline KPI(s)` : `${account.arr.toLocaleString()} ARR tier`, score: expansionSignal },
        { label: "CSAT readiness", value: "CSAT subscore", score: csat },
        { label: "Relationship readiness", value: "Relationship subscore", score: relationship },
        { label: "Adoption/utilization", value: `${worksphere.utilizationPct}% utilization`, score: adoptionScore },
      ]),
    },
  };
}

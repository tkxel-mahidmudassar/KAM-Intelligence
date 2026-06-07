"use client";

import * as Dialog from "@radix-ui/react-dialog";
import * as Tabs from "@radix-ui/react-tabs";
import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { CalendarDays, Check, FileText, Mail, Pencil, Phone, Plus, Search, Settings, Sparkles, X } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { useNotifications } from "@/context/NotificationContext";
import { useRole } from "@/context/RoleContext";
import { readCachedApiAccounts, upsertCachedApiAccount, writeCachedApiAccounts, type CachedApiAccount } from "@/lib/v2/accountCache";
import { associatePortfolio, portfolioAccounts, type PortfolioAccount, type PortfolioHealth } from "@/lib/v2/portfolioData";
import type { Role } from "@/types";

const demoAccountIds = new Set([...portfolioAccounts, ...associatePortfolio].map((account) => account.id));

const healthLabel: Record<PortfolioHealth, string> = {
  HEALTHY: "Healthy",
  AT_RISK: "At Risk",
  CRITICAL: "Critical",
};

const healthAccent: Record<PortfolioHealth, string> = {
  HEALTHY: "border-l-[#7FB99A]",
  AT_RISK: "border-l-[#D7A24A]",
  CRITICAL: "border-l-[#D66A5B]",
};

const scoreTone: Record<PortfolioHealth, string> = {
  HEALTHY: "text-[#238B57]",
  AT_RISK: "text-[#B97813]",
  CRITICAL: "text-[#B33D32]",
};

type KpiTrend = "up" | "down" | "flat";
type TaskType = "Meeting" | "QBR" | "To-do";
type OverrideStatus = "Pending" | "Approved" | "Denied";
type TaskResolutionAction = "Done" | "Dismiss";
type ProposalResolutionAction = "approve" | "deny";

interface KpiOverviewRow {
  id: string;
  name: string;
  weight: string;
  rationale: string;
  score: number;
  trend: KpiTrend;
  subParameters: Array<{
    name: string;
    score: number;
    rationale: string;
    trend?: KpiTrend;
    fallingWhy?: {
      summary: string;
      sources: string[];
    };
  }>;
  why?: string;
  task?: string;
  taskType?: TaskType;
  dueInDays?: number;
}

interface ActiveTask {
  id: string;
  kpiName: string;
  task: string;
  type: TaskType;
  dueDate: string;
}

interface TaskResolutionDraft {
  taskId: string;
  action: TaskResolutionAction;
  reason: string;
}

interface ScoreOverrideRequest {
  targetId: string;
  requestedScore: number;
  reason: string;
  status: OverrideStatus;
}

interface ScoreOverride {
  targetId: string;
  score: number;
  reason: string;
}

interface KpiWeightRequest {
  requestedWeights: Record<string, number>;
  reason: string;
  status: OverrideStatus;
}

interface AccountContact {
  id: string;
  name: string;
  designation: string;
  location: string;
  timeZone: string;
  email: string;
  mobile: string;
  hierarchyRank: number;
}

interface TkxelResource {
  id: string;
  name: string;
  role: string;
  pod: string;
  location: string;
  startDate: string;
}

interface ResourceDraft {
  name: string;
  role: string;
  pod: string;
  location: string;
  startDate: string;
}

interface JourneyItem {
  id: string;
  title: string;
  type: TaskType;
  date: string;
  detail: string;
}

interface ContactDraft {
  name: string;
  email: string;
  mobile: string;
  designation: string;
  location: string;
  timeZone: string;
  hierarchyRank: string;
}

interface JourneyItemDraft {
  type: TaskType;
  title: string;
  date: string;
  detail: string;
}

interface DocumentTypeConfig {
  type: string;
  extracts: string;
  affects: string;
}

interface UploadedAccountDocument {
  id: string;
  name: string;
  type: string;
  uploadedBy: string;
  uploadedAt: string;
  uploadedAtMs: number;
  status: "Processed" | "Pending review";
  affected: string;
  url: string;
}

interface DocumentSignalProposal {
  id: string;
  sourceDocument: string;
  field: string;
  currentValue: string;
  proposedValue: string;
  status: "Needs review" | "Routed to KAM" | "Approved" | "Denied";
  kind?: "profile" | "score" | "kyc" | "risk" | "opportunity" | "action";
  kpiKey?: string;
  confidence?: number;
  evidence?: string;
  documentId?: string;
  associateReason?: string;
  kamReason?: string;
  latestReason?: string;
  latestDecisionBy?: Role;
  latestDecisionAt?: string;
}

function documentReviewStatus(proposals: DocumentSignalProposal[]) {
  if (proposals.some((proposal) => proposal.status === "Needs review")) return "Needs review";
  if (proposals.some((proposal) => proposal.status === "Routed to KAM")) return "Routed to KAM";
  if (proposals.length > 0 && proposals.every((proposal) => proposal.status === "Approved" || proposal.status === "Denied")) return "Reviewed";
  return "No proposals";
}

interface ProposalResolutionDraft {
  proposalId: string;
  action: ProposalResolutionAction;
  reason: string;
}

interface QbrPromptDraft {
  audience: string;
  period: string;
  goals: string;
  risks: string;
  asks: string;
}

interface CammieMessage {
  role: "user" | "assistant";
  content: string;
  artifact?: {
    title: string;
    fileUrl: string;
    format: string;
    summary: string;
  };
}

interface DocumentUploadDraft {
  type: string;
  fileName: string;
  fileUrl: string;
  file?: File;
}

interface AccountProfileDraft {
  name: string;
  industry: string;
  segment: string;
  arr: string;
  website: string;
  country: string;
  region: string;
  kamOwner: string;
  associateOwner: string;
  contractEnd: string;
}

type OnboardingStage = "source-upload" | "workspace";
type AccountOnboardingStep = "profile" | "kyc" | "journey" | "review";
type AccountWorkspaceTab = "overview" | "profile" | "documents";
type OnboardingSuggestionStatus = "Pending" | "Accepted" | "Dismissed";
const LS_ACCOUNT_CREATION_REQUESTS = "kam_v2_account_creation_requests";
type OnboardingStepStatus = "Done" | "Active" | "Pending";

interface AccountDraft {
  name: string;
  industry: string;
  segment: string;
  arr: string;
  location: string;
  contractRenewal: string;
  kamOwner: string;
  associateOwner: string;
  primaryContact: string;
  activeRisk: string;
  openOpportunity: string;
  nextTouchpoint: string;
}

interface OnboardingSuggestion {
  id: string;
  field: keyof AccountDraft;
  label: string;
  proposedValue: string;
  source: string;
  status: OnboardingSuggestionStatus;
  dismissalReason?: string;
}

interface OnboardingDocumentDraft {
  type: string;
  fileName: string;
  fileUrl: string;
  file?: File;
}

interface OnboardingDocument {
  id: string;
  type: string;
  fileName: string;
  fileUrl: string;
  uploadedAt: string;
  extractedText?: string;
  preview?: string;
  charCount?: number;
  parseError?: string;
}

interface OnboardingJourneyDraftItem {
  id: string;
  type: TaskType;
  title: string;
  dueDate: string;
  recurrence: string;
}

interface KycDraftSection {
  id: string;
  title: string;
  source: string;
  status: "Ready" | "Needs input";
  draft: string;
}

interface GeneratedKycDocument {
  title: string;
  fileName: string;
  fileUrl: string;
  summary: string;
  approvalStatus: "Draft" | "Submitted to KAM" | "Approved";
}

interface SuggestionDismissalDraft {
  suggestionId: string;
  reason: string;
}

interface PendingAccountCreationRequest {
  id: string;
  submittedBy: string;
  submittedAt: string;
  creatorRole?: Role;
  status?: "Draft" | "Submitted to KAM";
  associateReason: string;
  draft: AccountDraft;
  sourceFiles: string[];
  kycSections?: KycDraftSection[];
  journey?: OnboardingJourneyDraftItem[];
}

interface AccountRuntimeMetadata {
  accountId?: string;
  accountName: string;
  primaryContact?: string;
  sourceFiles?: string[];
  kycSections?: KycDraftSection[];
  journey?: OnboardingJourneyDraftItem[];
}

const LS_ACCOUNT_RUNTIME_METADATA = "kam_v2_account_runtime_metadata";

function accountRuntimeMetadataKeys(account: Pick<PortfolioAccount, "id" | "name">) {
  return [account.id, `name:${account.name.trim().toLowerCase()}`];
}

function readAccountRuntimeMetadata() {
  if (typeof window === "undefined") return {};
  try {
    const parsed = JSON.parse(window.localStorage.getItem(LS_ACCOUNT_RUNTIME_METADATA) ?? "{}") as Record<string, AccountRuntimeMetadata>;
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function getAccountRuntimeMetadata(account: Pick<PortfolioAccount, "id" | "name">) {
  const metadata = readAccountRuntimeMetadata();
  return accountRuntimeMetadataKeys(account).map((key) => metadata[key]).find(Boolean);
}

function saveAccountRuntimeMetadata(account: Pick<PortfolioAccount, "id" | "name">, metadata: AccountRuntimeMetadata) {
  if (typeof window === "undefined") return;
  try {
    const allMetadata = readAccountRuntimeMetadata();
    accountRuntimeMetadataKeys(account).forEach((key) => {
      allMetadata[key] = { ...metadata, accountId: account.id, accountName: account.name };
    });
    window.localStorage.setItem(LS_ACCOUNT_RUNTIME_METADATA, JSON.stringify(allMetadata));
  } catch {
    // No-op for restricted browser storage.
  }
}

const baseKpiOverviewRows: KpiOverviewRow[] = [
  {
    id: "relationship",
    name: "Relationship Health",
    weight: "20%",
    rationale: "Measures relationship strength and stakeholder penetration.",
    score: 4,
    trend: "up",
    subParameters: [
      { name: "Executive Engagement", score: 4, rationale: "Monthly executive engagement is healthy; multiple executive touchpoints monthly is excellent." },
      { name: "Stakeholder Coverage", score: 4, rationale: "Multi-department coverage is healthy; broad organizational coverage is excellent." },
      { name: "Relationship Penetration", score: 4, rationale: "Multiple business units are covered; strong hierarchy-wide penetration is excellent." },
      { name: "Champion Strength", score: 4, rationale: "Strong advocate is healthy; executive sponsor or champion is excellent." },
      { name: "Engagement Cadence", score: 4, rationale: "Bi-weekly interaction is healthy; weekly structured engagement is excellent." },
    ],
  },
  {
    id: "contract-health",
    name: "Contract Health",
    weight: "15%",
    rationale: "Measures commercial protection and contract stability.",
    score: 4,
    trend: "flat",
    subParameters: [
      { name: "Contract Duration", score: 4, rationale: "Two-year contracts are healthy; three-plus years are excellent." },
      { name: "Notice Period Protection", score: 4, rationale: "Sixty-day notice is healthy; ninety-plus days is excellent." },
      { name: "Renewability", score: 4, rationale: "Renewable agreements are healthy; auto-renewable agreements are excellent." },
      { name: "Price Uplift Protection", score: 4, rationale: "Annual review is healthy; contractual uplift mechanism is excellent." },
      { name: "Termination Protection", score: 4, rationale: "Strong protections are healthy; highly protected/non-terminable terms are excellent." },
    ],
  },
  {
    id: "customer-success",
    name: "Customer Success",
    weight: "15%",
    rationale: "Measures customer satisfaction and confidence.",
    score: 4,
    trend: "up",
    subParameters: [
      { name: "Customer Feedback", score: 4, rationale: "Promoter-level feedback is healthy; strong promoter feedback is excellent." },
      { name: "Customer Confidence", score: 4, rationale: "Good confidence is healthy; high confidence is excellent." },
      { name: "Delivery Satisfaction", score: 4, rationale: "Satisfied delivery feedback is healthy; highly satisfied feedback is excellent." },
      { name: "Communication Satisfaction", score: 4, rationale: "Good communication is healthy; excellent communication is excellent." },
      { name: "Issue Resolution", score: 4, rationale: "Timely resolution is healthy; rapid proactive resolution is excellent." },
    ],
  },
  {
    id: "risk",
    name: "Risk Score",
    weight: "15%",
    rationale: "Measures retention and business risks.",
    score: 2,
    trend: "down",
    subParameters: [
      {
        name: "Industry Risk",
        score: 3,
        rationale: "Moderate concern requires monitoring; stable or growing market reduces account risk.",
        trend: "down",
        fallingWhy: {
          summary: "The account is exposed to moderate market uncertainty, so the playbook recommends confirming business continuity assumptions before renewal planning.",
          sources: ["Risk scoring framework", "Account journey history", "AI rules learning log"],
        },
      },
      {
        name: "Competitive Threat",
        score: 3,
        rationale: "Moderate competition requires monitoring; low or no significant threat is healthier.",
        trend: "down",
        fallingWhy: {
          summary: "Competitive pressure has not been ruled out, so the system should prompt for competitor exposure before assuming the account is secure.",
          sources: ["Risk scoring framework", "Account journey history", "AI rules learning log"],
        },
      },
      {
        name: "Vendor Displacement Risk",
        score: 2,
        rationale: "Strong displacement signals are weak; no displacement signal is excellent.",
        trend: "down",
        fallingWhy: {
          summary: "There are unresolved signs that Tkxel could be displaced, so the corrective task should validate executive sponsorship and active value proof.",
          sources: ["Risk scoring framework", "Account journey history", "AI rules learning log"],
        },
      },
      {
        name: "Delivery Risk",
        score: 2,
        rationale: "High delivery concerns are weak; no delivery concerns is excellent.",
        trend: "down",
        fallingWhy: {
          summary: "Delivery risk is below target because the current journey does not yet show a named mitigation owner for recent blockers.",
          sources: ["Risk scoring framework", "Account journey history", "AI rules learning log"],
        },
      },
      {
        name: "Commercial Risk",
        score: 2,
        rationale: "Major commercial concern is weak; commercially secure is excellent.",
        trend: "down",
        fallingWhy: {
          summary: "Commercial risk remains weak until renewal likelihood, budget owner, and scope protection are explicitly confirmed.",
          sources: ["Risk scoring framework", "Contract history", "AI rules learning log"],
        },
      },
    ],
    why: "Retention and business risk dimensions are below the healthy threshold.",
    task: "Confirm the risk owner, mitigation path, and renewal exposure for the weak risk dimensions.",
    taskType: "To-do",
    dueInDays: 3,
  },
  {
    id: "resource-health",
    name: "Resource Health",
    weight: "10%",
    rationale: "Measures dependency and continuity risks.",
    score: 3,
    trend: "down",
    subParameters: [
      {
        name: "Resource Dependency Risk",
        score: 2,
        rationale: "High dependency is weak; no dependency risk is excellent.",
        trend: "down",
        fallingWhy: {
          summary: "Resource health is soft because a critical dependency has not been covered by a named backup.",
          sources: ["Resource health scoring framework", "Account resource history", "AI rules learning log"],
        },
      },
      { name: "Critical Resource Coverage", score: 3, rationale: "Adequate coverage is moderate; fully staffed is excellent." },
      { name: "Team Stability", score: 3, rationale: "Moderate stability requires monitoring; highly stable team is excellent." },
      { name: "Skill Alignment", score: 4, rationale: "Good fit is healthy; perfect fit is excellent." },
      { name: "Backup Readiness", score: 2, rationale: "Limited backup is weak; full succession coverage is excellent.", trend: "down" },
    ],
    why: "Resource dependency and backup readiness are below the target band.",
    task: "Create a backup coverage plan for critical resources and confirm succession ownership.",
    taskType: "To-do",
    dueInDays: 7,
  },
  {
    id: "project-health",
    name: "Project Health",
    weight: "10%",
    rationale: "Measures delivery confidence and execution stability.",
    score: 3,
    trend: "down",
    subParameters: [
      {
        name: "Delivery Performance",
        score: 3,
        rationale: "Minor delays are moderate; ahead of schedule is excellent.",
        trend: "down",
        fallingWhy: {
          summary: "Delivery performance is moderate because recent checkpoints do not yet show stable on-track execution.",
          sources: ["Project health scoring framework", "Account journey history", "AI rules learning log"],
        },
      },
      { name: "Backlog Readiness", score: 3, rationale: "Two months of backlog is moderate; six-plus months visibility is excellent." },
      { name: "Roadmap Visibility", score: 3, rationale: "Partial roadmap is moderate; long-term roadmap agreement is excellent." },
      {
        name: "Escalation Status",
        score: 3,
        rationale: "Occasional escalations are moderate; no escalations is excellent.",
        trend: "down",
        fallingWhy: {
          summary: "Escalation status is not healthy because recent account history still contains unresolved escalation signals.",
          sources: ["Project health scoring framework", "Meeting history", "AI rules learning log"],
        },
      },
      { name: "Client Confidence", score: 3, rationale: "Neutral confidence is moderate; strong confidence is excellent." },
    ],
    why: "Delivery confidence and roadmap visibility require monitoring.",
    task: "Run a delivery governance review covering backlog, roadmap, escalations, and client confidence.",
    taskType: "Meeting",
    dueInDays: 5,
  },
  {
    id: "financial-health",
    name: "Financial Health",
    weight: "10%",
    rationale: "Measures commercial and financial performance.",
    score: 4,
    trend: "flat",
    subParameters: [
      { name: "Payment Timeliness", score: 4, rationale: "Minor delays are healthy; always on-time payment is excellent." },
      { name: "Outstanding Exposure", score: 4, rationale: "Low exposure is healthy; no exposure is excellent." },
      { name: "Client Financial Stability", score: 4, rationale: "Stable client financials are healthy; strong financial position is excellent." },
      { name: "Revenue Trend", score: 4, rationale: "Growing revenue is healthy; strong growth is excellent." },
      { name: "Contract vs Billing Alignment", score: 4, rationale: "Mostly aligned billing is healthy; fully aligned is excellent." },
    ],
  },
  {
    id: "whitespace",
    name: "Whitespace Analysis",
    weight: "5%",
    rationale: "Measures growth and expansion opportunities.",
    score: 3,
    trend: "up",
    subParameters: [
      { name: "Service Penetration", score: 3, rationale: "Some opportunities are moderate; significant untapped services is excellent." },
      { name: "Cross-Sell Potential", score: 3, rationale: "Moderate cross-sell potential requires active validation." },
      { name: "Upsell Potential", score: 3, rationale: "Moderate upsell potential requires active validation." },
      {
        name: "Growth Signals",
        score: 3,
        rationale: "Moderate signals should be validated; active expansion indicators are excellent.",
        trend: "down",
        fallingWhy: {
          summary: "Growth signals have not yet been converted into an active expansion motion with sponsor, timing, and value hypothesis.",
          sources: ["Whitespace scoring framework", "Opportunity history", "AI rules learning log"],
        },
      },
      { name: "Expansion Readiness", score: 3, rationale: "Moderate readiness needs planning; highly ready accounts can move straight into expansion." },
    ],
    why: "Growth opportunity exists but needs sponsor validation and timing clarity.",
    task: "Create an expansion validation checkpoint with the commercial sponsor.",
    taskType: "QBR",
    dueInDays: 10,
  },
];

function cloneKpiRows() {
  return baseKpiOverviewRows.map((row) => ({
    ...row,
    subParameters: row.subParameters.map((parameter) => ({
      ...parameter,
      fallingWhy: parameter.fallingWhy
        ? {
            ...parameter.fallingWhy,
            sources: [...parameter.fallingWhy.sources],
          }
        : undefined,
    })),
  }));
}

function clampFrameworkScore(score: number) {
  return Math.min(5, Math.max(1, score));
}

function accountScoreBand(account: PortfolioAccount) {
  if (account.health === "CRITICAL") return 2;
  if (account.health === "AT_RISK") return 3;
  if (account.healthScore >= 90) return 5;
  return 4;
}

function accountTrend(score: number): KpiTrend {
  if (score <= 2) return "down";
  if (score === 3) return "flat";
  return "up";
}

function findKpiRow(rows: KpiOverviewRow[], rowId: string) {
  return rows.find((row) => row.id === rowId);
}

function setKpiScore(rows: KpiOverviewRow[], rowId: string, score: number, trend: KpiTrend = accountTrend(score)) {
  const row = findKpiRow(rows, rowId);
  if (!row) return;
  row.score = clampFrameworkScore(score);
  row.trend = trend;
}

function setSubParameterScore(
  rows: KpiOverviewRow[],
  rowId: string,
  parameterName: string,
  score: number,
  trend: KpiTrend = accountTrend(score),
  summary?: string,
) {
  const row = findKpiRow(rows, rowId);
  const parameter = row?.subParameters.find((item) => item.name === parameterName);
  if (!parameter) return;
  parameter.score = clampFrameworkScore(score);
  parameter.trend = trend;
  parameter.fallingWhy =
    summary && score <= 3
      ? {
          summary,
          sources: ["Account score trend", "Account journey history", "AI rules learning log"],
        }
      : undefined;
}

function setKpiAction(rows: KpiOverviewRow[], rowId: string, why: string, task: string, taskType: TaskType, dueInDays: number) {
  const row = findKpiRow(rows, rowId);
  if (!row) return;
  row.why = why;
  row.task = task;
  row.taskType = taskType;
  row.dueInDays = dueInDays;
}

function clearKpiAction(rows: KpiOverviewRow[], rowId: string) {
  const row = findKpiRow(rows, rowId);
  if (!row) return;
  delete row.why;
  delete row.task;
  delete row.taskType;
  delete row.dueInDays;
}

function alignSubParametersToRowScores(rows: KpiOverviewRow[], account: PortfolioAccount) {
  rows.forEach((row, rowIndex) => {
    row.subParameters.forEach((parameter, parameterIndex) => {
      const variationSeed = account.id.length + rowIndex + parameterIndex;
      const variation = variationSeed % 5 === 0 ? -1 : variationSeed % 4 === 0 ? 1 : 0;
      const score = clampFrameworkScore(row.score + variation);
      parameter.score = score;
      parameter.trend = score < row.score ? "down" : row.trend;
      parameter.fallingWhy =
        score <= 3 && row.score <= 3
          ? {
              summary: `${parameter.name} is below the healthy band for ${account.name}, so it should be checked against the account journey before the next client checkpoint.`,
              sources: ["Account score trend", "Account journey history", "AI rules learning log"],
            }
          : undefined;
    });
  });
}

function applyBaselineScores(rows: KpiOverviewRow[], account: PortfolioAccount) {
  const baseline = accountScoreBand(account);
  const renewalPressure = account.renewalDays < 90 ? 2 : account.renewalDays < 140 ? 3 : baseline;
  const deliveryPressure = account.health === "CRITICAL" ? 2 : account.health === "AT_RISK" ? 3 : baseline;
  const relationshipScore = account.relationshipSignal.toLowerCase().includes("escalation")
    ? 2
    : account.relationshipSignal.toLowerCase().includes("friction") || account.relationshipSignal.toLowerCase().includes("incomplete")
      ? 3
      : baseline;

  setKpiScore(rows, "relationship", relationshipScore);
  setKpiScore(rows, "contract-health", renewalPressure);
  setKpiScore(rows, "customer-success", account.health === "HEALTHY" ? baseline : Math.max(2, baseline - 1));
  setKpiScore(rows, "risk", account.health === "CRITICAL" ? 1 : account.health === "AT_RISK" ? 2 : 4, account.health === "HEALTHY" ? "flat" : "down");
  setKpiScore(rows, "resource-health", deliveryPressure);
  setKpiScore(rows, "project-health", deliveryPressure);
  setKpiScore(rows, "financial-health", account.health === "CRITICAL" ? 2 : account.arr > 1_500_000 ? 4 : 3);
  setKpiScore(rows, "whitespace", account.health === "HEALTHY" ? (account.relationshipSignal.toLowerCase().includes("expansion") ? 5 : 4) : 3);

  alignSubParametersToRowScores(rows, account);

  if (account.renewalDays < 140) {
    setSubParameterScore(
      rows,
      "contract-health",
      "Renewability",
      renewalPressure,
      "down",
      `${account.name} is ${account.renewalDays} days from renewal, so the renewal owner and commercial next step need to be confirmed.`,
    );
    setSubParameterScore(
      rows,
      "contract-health",
      "Notice Period Protection",
      Math.max(2, renewalPressure),
      "down",
      `${account.name} has a near-term contract window, making notice-period and procurement timing more important than usual.`,
    );
  }

  if (account.health !== "HEALTHY") {
    setSubParameterScore(
      rows,
      "risk",
      "Delivery Risk",
      account.health === "CRITICAL" ? 1 : 2,
      "down",
      `${account.name} is marked ${healthLabel[account.health]}, and the current workstream (${account.currentWork}) has not yet been converted into a named mitigation path.`,
    );
    setSubParameterScore(
      rows,
      "project-health",
      "Client Confidence",
      account.health === "CRITICAL" ? 2 : 3,
      "down",
      `${account.name}'s relationship signal is "${account.relationshipSignal}", so client confidence needs direct validation in the next checkpoint.`,
    );
  }
}

function applyIndustrySpecificScores(rows: KpiOverviewRow[], account: PortfolioAccount) {
  const industry = account.industry.toLowerCase();
  if (industry.includes("logistics")) {
    setSubParameterScore(
      rows,
      "project-health",
      "Delivery Performance",
      account.health === "HEALTHY" ? 4 : 2,
      account.health === "HEALTHY" ? "flat" : "down",
      `${account.name}'s logistics work depends on operational reliability, so delivery performance is weighted by exception handling and platform stability.`,
    );
    setSubParameterScore(rows, "risk", "Industry Risk", account.health === "HEALTHY" ? 4 : 3, account.health === "HEALTHY" ? "flat" : "down");
  }
  if (industry.includes("aviation") || industry.includes("energy")) {
    setSubParameterScore(
      rows,
      "risk",
      "Commercial Risk",
      account.health === "CRITICAL" ? 1 : 2,
      "down",
      `${account.name} operates in a high-governance ${account.industry} environment, so unresolved scope or sponsor pressure materially raises commercial risk.`,
    );
    setSubParameterScore(rows, "project-health", "Escalation Status", account.health === "HEALTHY" ? 4 : 2, account.health === "HEALTHY" ? "flat" : "down");
  }
  if (industry.includes("banking") || industry.includes("financial") || industry.includes("payments") || industry.includes("fintech")) {
    setSubParameterScore(rows, "contract-health", "Termination Protection", account.health === "HEALTHY" ? 4 : 3, account.health === "HEALTHY" ? "flat" : "down");
    setSubParameterScore(rows, "financial-health", "Contract vs Billing Alignment", account.health === "HEALTHY" ? 5 : 3, account.health === "HEALTHY" ? "up" : "flat");
  }
  if (industry.includes("pharma") || industry.includes("health")) {
    setSubParameterScore(rows, "customer-success", "Issue Resolution", account.health === "HEALTHY" ? 5 : 3, account.health === "HEALTHY" ? "up" : "down");
    setSubParameterScore(rows, "contract-health", "Contract Duration", account.health === "HEALTHY" ? 4 : 3, account.health === "HEALTHY" ? "flat" : "down");
  }
  if (industry.includes("retail") || industry.includes("commerce")) {
    setSubParameterScore(rows, "whitespace", "Cross-Sell Potential", account.health === "HEALTHY" ? 4 : 3, account.health === "HEALTHY" ? "up" : "flat");
    setSubParameterScore(rows, "customer-success", "Communication Satisfaction", account.health === "HEALTHY" ? 4 : 3, account.health === "HEALTHY" ? "up" : "down");
  }
}

function applyNamedAccountReality(rows: KpiOverviewRow[], account: PortfolioAccount) {
  const name = account.name.toLowerCase();
  if (name.includes("maersk")) {
    setKpiScore(rows, "risk", 2, "down");
    setKpiScore(rows, "contract-health", 3, "down");
    setKpiScore(rows, "project-health", 2, "down");
    setSubParameterScore(rows, "risk", "Delivery Risk", 1, "down", "Port visibility delivery timing is under review, so the blocker owner and recovery path are not yet credible.");
    setSubParameterScore(rows, "risk", "Competitive Threat", 3, "down", "Maersk has not confirmed whether alternative logistics technology partners are being evaluated before renewal.");
    setSubParameterScore(rows, "project-health", "Delivery Performance", 2, "down", "The current workstream is delivery-sensitive and recent checkpoints have not cleared timing concerns.");
    setSubParameterScore(rows, "project-health", "Roadmap Visibility", 2, "down", "The next delivery checkpoint exists, but the client-facing recovery roadmap is not explicit enough.");
    setSubParameterScore(rows, "contract-health", "Renewability", 3, "down", "The renewal window is close enough that renewal owner, value proof, and commercial path need confirmation.");
    setKpiAction(
      rows,
      "risk",
      "Maersk is inside a near-renewal window and the port visibility workstream has delivery timing under review.",
      "Confirm delivery risk owner, competitor exposure, and renewal mitigation plan for Maersk.",
      "To-do",
      3,
    );
    setKpiAction(
      rows,
      "project-health",
      "The port visibility platform needs a clearer execution checkpoint before commercial confidence can recover.",
      "Run a Maersk delivery governance review with the pod lead and client sponsor.",
      "Meeting",
      6,
    );
  } else if (name.includes("emirates")) {
    setKpiScore(rows, "project-health", 2, "down");
    setKpiScore(rows, "risk", 2, "down");
    setKpiScore(rows, "relationship", 3, "flat");
    setSubParameterScore(rows, "project-health", "Backlog Readiness", 2, "down", "Scope pressure is creating uncertainty about what is actually committed for the next passenger operations release.");
    setSubParameterScore(rows, "project-health", "Escalation Status", 2, "down", "Scope-change pressure needs a formal governance decision before it becomes an escalation.");
    setSubParameterScore(rows, "relationship", "Champion Strength", 3, "flat", "A sponsor exists, but decision authority on scope changes is not yet clean enough.");
    setSubParameterScore(rows, "risk", "Commercial Risk", 2, "down", "Uncontrolled scope pressure can turn into commercial leakage if change control is not locked.");
    setKpiAction(
      rows,
      "project-health",
      "Emirates has scope-change pressure around the passenger operations dashboard, which can dilute delivery confidence.",
      "Lock scope-change decisions and next milestone owners for Emirates.",
      "Meeting",
      5,
    );
  } else if (name.includes("adidas")) {
    setKpiScore(rows, "contract-health", 2, "down");
    setKpiScore(rows, "risk", 2, "down");
    setKpiScore(rows, "whitespace", 3, "flat");
    setSubParameterScore(rows, "contract-health", "Renewability", 1, "down", "Adidas is inside a 74-day renewal window and the renewal narrative has not been converted into a decision plan.");
    setSubParameterScore(rows, "contract-health", "Notice Period Protection", 2, "down", "Procurement timing is tight enough that notice-period and decision-path risk need explicit tracking.");
    setSubParameterScore(rows, "risk", "Vendor Displacement Risk", 2, "down", "A weak renewal narrative leaves room for replacement or internal reprioritization.");
    setSubParameterScore(rows, "whitespace", "Expansion Readiness", 2, "down", "Potential commerce expansion exists, but renewal proof has to come before expansion positioning.");
    setKpiAction(
      rows,
      "contract-health",
      "Adidas has only 74 days to renewal and the renewal narrative is not yet mature.",
      "Create the Adidas renewal readiness map covering buyer, procurement path, and value proof.",
      "To-do",
      2,
    );
  } else if (name === "bp") {
    setKpiScore(rows, "risk", 1, "down");
    setKpiScore(rows, "relationship", 2, "down");
    setKpiScore(rows, "contract-health", 2, "down");
    setKpiScore(rows, "project-health", 2, "down");
    setSubParameterScore(rows, "relationship", "Executive Engagement", 1, "down", "The executive conversation is currently escalation-led, not relationship-led.");
    setSubParameterScore(rows, "relationship", "Champion Strength", 2, "down", "The account needs a credible internal sponsor who can own the recovery path.");
    setSubParameterScore(rows, "risk", "Commercial Risk", 1, "down", "Critical health plus a 48-day renewal window creates immediate retention exposure.");
    setSubParameterScore(rows, "risk", "Vendor Displacement Risk", 1, "down", "The open escalation creates a realistic displacement risk until executive confidence is restored.");
    setSubParameterScore(rows, "project-health", "Escalation Status", 1, "down", "The escalation is active and must be treated as the primary account-health driver.");
    setKpiAction(
      rows,
      "relationship",
      "BP has an open executive escalation, so stakeholder confidence cannot be treated as healthy.",
      "Schedule an executive recovery call for BP with a named remediation owner.",
      "Meeting",
      1,
    );
    setKpiAction(
      rows,
      "risk",
      "BP combines a critical health score with a 48-day renewal window, creating immediate retention exposure.",
      "Build a BP renewal rescue plan with commercial, delivery, and executive owners.",
      "To-do",
      1,
    );
  } else if (name.includes("fedex")) {
    setKpiScore(rows, "project-health", 1, "down");
    setKpiScore(rows, "resource-health", 2, "down");
    setKpiScore(rows, "risk", 1, "down");
    setSubParameterScore(rows, "project-health", "Delivery Performance", 1, "down", "Exception triage workflows are damaging delivery confidence and require a recovery cadence.");
    setSubParameterScore(rows, "project-health", "Client Confidence", 1, "down", "The relationship signal explicitly says delivery confidence is damaged.");
    setSubParameterScore(rows, "resource-health", "Critical Resource Coverage", 2, "down", "The recovery plan needs named owners for exception triage, delivery lead coverage, and escalation handling.");
    setSubParameterScore(rows, "resource-health", "Backup Readiness", 2, "down", "Backup coverage must be visible because the recovery path cannot depend on one overloaded owner.");
    setSubParameterScore(rows, "risk", "Delivery Risk", 1, "down", "Delivery risk is the core account risk, not a generic renewal issue.");
    setKpiAction(
      rows,
      "project-health",
      "FedEx delivery confidence is damaged on exception triage workflows, so recovery needs to be visible before renewal.",
      "Stand up a FedEx recovery plan with daily exception triage and sponsor updates.",
      "Meeting",
      1,
    );
    setKpiAction(
      rows,
      "resource-health",
      "FedEx needs named recovery ownership and backup coverage for exception triage.",
      "Assign FedEx recovery owners and backup coverage for every critical workflow.",
      "To-do",
      2,
    );
  } else if (name.includes("jpmorgan")) {
    setKpiScore(rows, "contract-health", 3, "down");
    setKpiScore(rows, "relationship", 3, "flat");
    setKpiScore(rows, "financial-health", 3, "flat");
    setSubParameterScore(rows, "contract-health", "Price Uplift Protection", 2, "down", "Procurement friction means commercial protections need to be reconfirmed before renewal negotiation.");
    setSubParameterScore(rows, "financial-health", "Contract vs Billing Alignment", 3, "flat", "Commercial review requires finance and contract evidence to be aligned before account confidence improves.");
    setSubParameterScore(rows, "relationship", "Stakeholder Coverage", 3, "flat", "The decision map needs procurement plus business owner coverage, not just delivery contacts.");
    setKpiAction(
      rows,
      "contract-health",
      "JPMorgan has procurement friction, so commercial path and buyer authority need to be made explicit.",
      "Confirm JPMorgan procurement route, buyer authority, and renewal evidence pack.",
      "To-do",
      5,
    );
  } else if (name.includes("hsbc")) {
    setKpiScore(rows, "relationship", 2, "down");
    setKpiScore(rows, "risk", 2, "down");
    setSubParameterScore(rows, "relationship", "Stakeholder Coverage", 2, "down", "HSBC has an incomplete stakeholder map, so relationship coverage is the primary weakness.");
    setSubParameterScore(rows, "relationship", "Relationship Penetration", 2, "down", "The account needs coverage across risk, compliance, procurement, and the business sponsor.");
    setSubParameterScore(rows, "risk", "Commercial Risk", 3, "flat", "The risk workflow modernization path is not blocked commercially yet, but stakeholder gaps can turn into renewal friction.");
    setKpiAction(
      rows,
      "relationship",
      "HSBC's stakeholder map is incomplete, which makes the account vulnerable even if delivery is not the main problem.",
      "Build the HSBC stakeholder coverage map and identify missing business, risk, and procurement owners.",
      "To-do",
      6,
    );
  } else if (name.includes("barclays")) {
    setKpiScore(rows, "contract-health", 2, "down");
    setKpiScore(rows, "financial-health", 3, "flat");
    setSubParameterScore(rows, "contract-health", "Termination Protection", 2, "down", "Commercial review is pending, so contract protection and continuation assumptions are not yet safe.");
    setSubParameterScore(rows, "contract-health", "Price Uplift Protection", 2, "down", "Pricing or uplift protection needs confirmation before the commercial review closes.");
    setSubParameterScore(rows, "financial-health", "Revenue Trend", 3, "flat", "Revenue is not the first failure, but commercial review can constrain growth if unresolved.");
    setKpiAction(
      rows,
      "contract-health",
      "Barclays has a commercial review pending, so the issue is contract protection rather than delivery execution.",
      "Prepare Barclays commercial review pack covering scope, uplift, renewal assumptions, and finance owner.",
      "QBR",
      7,
    );
  } else if (name.includes("roche")) {
    setKpiScore(rows, "project-health", 3, "down");
    setKpiScore(rows, "risk", 2, "down");
    setKpiScore(rows, "customer-success", 3, "down");
    setSubParameterScore(rows, "project-health", "Backlog Readiness", 2, "down", "Lab systems integration blockers make backlog readiness weaker than the account average.");
    setSubParameterScore(rows, "customer-success", "Issue Resolution", 2, "down", "Technical blockers remain active and have not been converted into resolved issue evidence.");
    setSubParameterScore(rows, "risk", "Delivery Risk", 2, "down", "The delivery risk is technical integration risk, not renewal or procurement risk.");
    setKpiAction(
      rows,
      "project-health",
      "Roche has active technical integration blockers, so execution confidence depends on blocker closure.",
      "Run a Roche technical blocker closure meeting with lab systems owner and integration lead.",
      "Meeting",
      4,
    );
  } else if (name.includes("philips")) {
    setKpiScore(rows, "customer-success", 2, "down");
    setKpiScore(rows, "relationship", 3, "down");
    setKpiScore(rows, "risk", 2, "down");
    setSubParameterScore(rows, "customer-success", "Customer Confidence", 2, "down", "Clinical stakeholder concerns are the dominant signal, so confidence must be recovered directly.");
    setSubParameterScore(rows, "customer-success", "Communication Satisfaction", 2, "down", "Concerns from clinical stakeholders indicate the communication loop needs tightening.");
    setSubParameterScore(rows, "relationship", "Champion Strength", 3, "down", "A clinical champion or sponsor needs to validate the device-data workflow value path.");
    setKpiAction(
      rows,
      "customer-success",
      "Philips has clinical stakeholder concerns, so the immediate weakness is customer confidence rather than raw delivery cadence.",
      "Set a Philips clinical feedback review and document concern-by-concern owner responses.",
      "Meeting",
      4,
    );
  }
}

function removeUnneededActions(rows: KpiOverviewRow[], account: PortfolioAccount) {
  rows.forEach((row) => {
    if (row.score >= 4 || (account.health === "HEALTHY" && row.score >= 3)) {
      clearKpiAction(rows, row.id);
    }
  });
}

function buildAccountKpiRows(account: PortfolioAccount | null): KpiOverviewRow[] {
  const rows = cloneKpiRows();
  if (!account) return rows;

  applyBaselineScores(rows, account);
  applyIndustrySpecificScores(rows, account);
  applyNamedAccountReality(rows, account);

  if (account.health === "HEALTHY" && account.relationshipSignal.toLowerCase().includes("expansion")) {
    setKpiScore(rows, "whitespace", 5, "up");
  }

  if (account.health !== "HEALTHY" && !findKpiRow(rows, "risk")?.task) {
    setKpiAction(
      rows,
      "risk",
      `${account.name} is currently ${healthLabel[account.health]} with a ${account.renewalDays}-day renewal window and a "${account.relationshipSignal}" signal.`,
      `Confirm the next risk owner and mitigation checkpoint for ${account.name}.`,
      "To-do",
      account.health === "CRITICAL" ? 1 : 4,
    );
  }

  removeUnneededActions(rows, account);
  return rows;
}

const accountContacts: AccountContact[] = [
  {
    id: "contact-cto",
    name: "Maya Rodriguez",
    designation: "Chief Technology Officer",
    location: "San Francisco, USA",
    timeZone: "Pacific Time",
    email: "maya.rodriguez@example.com",
    mobile: "+1 415 555 0198",
    hierarchyRank: 1,
  },
  {
    id: "contact-vp-product",
    name: "Ethan Walsh",
    designation: "VP Product Platforms",
    location: "Seattle, USA",
    timeZone: "Pacific Time",
    email: "ethan.walsh@example.com",
    mobile: "+1 206 555 0142",
    hierarchyRank: 2,
  },
  {
    id: "contact-director",
    name: "Nadia Kapoor",
    designation: "Director, Payments Engineering",
    location: "New York, USA",
    timeZone: "Eastern Time",
    email: "nadia.kapoor@example.com",
    mobile: "+1 212 555 0176",
    hierarchyRank: 3,
  },
  {
    id: "contact-pm",
    name: "Owen Pierce",
    designation: "Senior Technical Program Manager",
    location: "Austin, USA",
    timeZone: "Central Time",
    email: "owen.pierce@example.com",
    mobile: "+1 512 555 0129",
    hierarchyRank: 4,
  },
];

const tkxelResources: TkxelResource[] = [
  {
    id: "resource-delivery-lead",
    name: "Hassan Ali",
    role: "Delivery Lead",
    pod: "Payments Modernization",
    location: "Lahore, Pakistan",
    startDate: "Jan 2026",
  },
  {
    id: "resource-architect",
    name: "Sara Iqbal",
    role: "Solution Architect",
    pod: "Platform Engineering",
    location: "Karachi, Pakistan",
    startDate: "Feb 2026",
  },
  {
    id: "resource-engineer",
    name: "Bilal Khan",
    role: "Senior Backend Engineer",
    pod: "Payments Modernization",
    location: "Islamabad, Pakistan",
    startDate: "Jan 2026",
  },
  {
    id: "resource-qa",
    name: "Mina Farooq",
    role: "QA Automation Engineer",
    pod: "Quality Engineering",
    location: "Lahore, Pakistan",
    startDate: "Mar 2026",
  },
];

const completedJourneyItems: JourneyItem[] = [
  {
    id: "journey-kickoff",
    title: "Executive kickoff completed",
    type: "Meeting",
    date: "Apr 18",
    detail: "Confirmed executive sponsor, delivery cadence, and first ninety-day success markers.",
  },
  {
    id: "journey-qbr",
    title: "QBR closed with expansion themes",
    type: "QBR",
    date: "May 7",
    detail: "Reviewed platform roadmap, incident trends, and initial co-marketing opportunity.",
  },
  {
    id: "journey-risk",
    title: "Risk review converted into mitigation owners",
    type: "To-do",
    date: "May 23",
    detail: "Assigned owners for gateway reliability, stakeholder mapping, and renewal readiness.",
  },
];

const upcomingJourneyItems: JourneyItem[] = [
  {
    id: "journey-renewal-map",
    title: "Validate renewal decision map",
    type: "To-do",
    date: "Jun 12",
    detail: "Confirm economic buyer, technical sponsor, procurement path, and success criteria.",
  },
  {
    id: "journey-sponsor-sync",
    title: "Executive sponsor sync",
    type: "Meeting",
    date: "Jun 18",
    detail: "Align on payment modernization status and expansion timing.",
  },
  {
    id: "journey-qbr-next",
    title: "Prepare next QBR narrative",
    type: "QBR",
    date: "Jun 27",
    detail: "Build the account story around delivery health, value realized, and next whitespace bet.",
  },
];

const documentTypes: DocumentTypeConfig[] = [
  {
    type: "Meeting minutes",
    extracts: "Executive engagement, customer confidence, issue resolution, risk flags, whitespace intent signals, strategic direction clues",
    affects: "Relationship Health, Customer Success, Risk Score, Whitespace Analysis, KYC Brief sections 4 and 8",
  },
  {
    type: "Contract document",
    extracts: "Auto-renewal clause, price hike clauses, non-terminable clauses, contract duration",
    affects: "Contract Health, KYC Brief section 3",
  },
  {
    type: "Statement of Work (SOW)",
    extracts: "Scope, service lines, deliverables, commercial terms",
    affects: "Engagement History, Whitespace Analysis",
  },
  {
    type: "Proposal",
    extracts: "Services pitched, pricing signals, accepted vs. rejected scope",
    affects: "Engagement History, Whitespace Analysis",
  },
  {
    type: "Project documentation",
    extracts: "Delivery history, tech stack, team composition, milestones",
    affects: "Engagement History, Project Health, Resource Health",
  },
  {
    type: "Previous KYC brief",
    extracts: "Historical account intelligence, prior stakeholder maps, risk history",
    affects: "All KYC sections",
  },
  {
    type: "Project status report",
    extracts: "Delivery quality narrative, blockers, velocity commentary",
    affects: "Project Health, Risk Score",
  },
];

const seededAccountDocuments: UploadedAccountDocument[] = [
  {
    id: "doc-sow",
    name: "Stripe Payments Modernization SOW.pdf",
    type: "Statement of Work (SOW)",
    uploadedBy: "Aisha Khan",
    uploadedAt: "Jun 2",
    uploadedAtMs: new Date("2026-06-02T09:00:00").getTime(),
    status: "Processed",
    affected: "Engagement History, Whitespace Analysis",
    url: documentPreviewUrl("Stripe Payments Modernization SOW.pdf", "Statement of Work (SOW)"),
  },
  {
    id: "doc-minutes",
    name: "Executive Sponsor Sync Notes.docx",
    type: "Meeting minutes",
    uploadedBy: "Aisha Khan",
    uploadedAt: "Jun 5",
    uploadedAtMs: new Date("2026-06-05T14:00:00").getTime(),
    status: "Pending review",
    affected: "Relationship Health, Risk Score",
    url: documentPreviewUrl("Executive Sponsor Sync Notes.docx", "Meeting minutes"),
  },
];

const seededDocumentProposals: DocumentSignalProposal[] = [
  {
    id: "proposal-arr",
    sourceDocument: "Stripe Payments Modernization SOW.pdf",
    field: "ARR",
    currentValue: "$2.9M",
    proposedValue: "$3.1M",
    status: "Needs review",
  },
  {
    id: "proposal-contact",
    sourceDocument: "Executive Sponsor Sync Notes.docx",
    field: "Contact",
    currentValue: "No procurement owner listed",
    proposedValue: "Add Priya Nair, VP Procurement",
    status: "Needs review",
  },
  {
    id: "proposal-score",
    sourceDocument: "Executive Sponsor Sync Notes.docx",
    field: "Relationship Health",
    currentValue: "4",
    proposedValue: "5",
    status: "Needs review",
  },
];

const emptyAccountDraft: AccountDraft = {
  name: "",
  industry: "",
  segment: "",
  arr: "",
  location: "",
  contractRenewal: "",
  kamOwner: "",
  associateOwner: "",
  primaryContact: "",
  activeRisk: "",
  openOpportunity: "",
  nextTouchpoint: "",
};

const accountDraftFields = new Set<keyof AccountDraft>([
  "name",
  "industry",
  "segment",
  "arr",
  "location",
  "contractRenewal",
  "kamOwner",
  "associateOwner",
  "primaryContact",
  "activeRisk",
  "openOpportunity",
  "nextTouchpoint",
]);

function normalizeAccountDraftField(field: unknown): keyof AccountDraft {
  return typeof field === "string" && accountDraftFields.has(field as keyof AccountDraft)
    ? (field as keyof AccountDraft)
    : "openOpportunity";
}

const seededOnboardingSuggestions: OnboardingSuggestion[] = [
  {
    id: "suggest-name",
    field: "name",
    label: "Account name",
    proposedValue: "NovaGrid Energy",
    source: "Initial source files",
    status: "Pending",
  },
  {
    id: "suggest-industry",
    field: "industry",
    label: "Industry",
    proposedValue: "Energy and grid analytics",
    source: "Salesforce mock",
    status: "Pending",
  },
  {
    id: "suggest-segment",
    field: "segment",
    label: "Segment",
    proposedValue: "Enterprise",
    source: "Salesforce mock",
    status: "Pending",
  },
  {
    id: "suggest-arr",
    field: "arr",
    label: "ARR",
    proposedValue: "$1.4M",
    source: "Initial source files",
    status: "Pending",
  },
  {
    id: "suggest-location",
    field: "location",
    label: "Location",
    proposedValue: "USA · North America",
    source: "Salesforce mock",
    status: "Pending",
  },
  {
    id: "suggest-renewal",
    field: "contractRenewal",
    label: "Contract renewal",
    proposedValue: "Mar 15, 2027",
    source: "Initial source files",
    status: "Pending",
  },
  {
    id: "suggest-contact",
    field: "primaryContact",
    label: "Primary contact",
    proposedValue: "Amelia Hart, VP Operations",
    source: "Initial source files",
    status: "Pending",
  },
  {
    id: "suggest-risk",
    field: "activeRisk",
    label: "Active risk",
    proposedValue: "Commercial owner not confirmed for phase two scope.",
    source: "Setup assistant",
    status: "Pending",
  },
  {
    id: "suggest-opportunity",
    field: "openOpportunity",
    label: "Open opportunity",
    proposedValue: "Predictive maintenance analytics expansion.",
    source: "Setup assistant",
    status: "Pending",
  },
];

const pendingAccountCreationRequests: PendingAccountCreationRequest[] = [
  {
    id: "pending-novagrid",
    submittedBy: "Aisha Khan",
    submittedAt: "Today",
    associateReason: "Initial source files identify NovaGrid as a new energy analytics account with expansion potential. ARR, primary sponsor, and renewal assumptions were accepted from uploaded sales notes and should be reviewed by the KAM before creation.",
    sourceFiles: ["NovaGrid kickoff notes.pdf", "Energy analytics SOW.docx", "Salesforce opportunity export.csv"],
    draft: {
      name: "NovaGrid Energy",
      industry: "Energy and grid analytics",
      segment: "Enterprise",
      arr: "$1.4M",
      location: "USA · North America",
      contractRenewal: "Mar 15, 2027",
      kamOwner: "Sarah Chen",
      associateOwner: "Aisha Khan",
      primaryContact: "Amelia Hart, VP Operations",
      activeRisk: "Commercial owner not confirmed for phase two scope.",
      openOpportunity: "Predictive maintenance analytics expansion.",
      nextTouchpoint: "Executive kickoff",
    },
  },
];

const standardOnboardingJourney: OnboardingJourneyDraftItem[] = [
  { id: "journey-day-0-assignment", type: "To-do", title: "Account assignment and sales handover", dueDate: "2026-06-07", recurrence: "Day 0" },
  { id: "journey-day-7-discovery", type: "To-do", title: "Discovery and KYC review", dueDate: "2026-06-14", recurrence: "Day 7" },
  { id: "journey-day-14-stakeholders", type: "Meeting", title: "Stakeholder mapping and relationship planning", dueDate: "2026-06-21", recurrence: "Day 14" },
  { id: "journey-day-30-health", type: "To-do", title: "Initial account health review", dueDate: "2026-07-07", recurrence: "Day 30" },
  { id: "journey-day-45-exec", type: "Meeting", title: "Executive alignment review", dueDate: "2026-07-22", recurrence: "Day 45" },
  { id: "journey-day-60-delivery", type: "Meeting", title: "Delivery governance review", dueDate: "2026-08-06", recurrence: "Day 60" },
  { id: "journey-day-90-qbr", type: "QBR", title: "First quarterly business review", dueDate: "2026-09-05", recurrence: "Day 90" },
  { id: "journey-monthly-review", type: "To-do", title: "Monthly account review", dueDate: "2026-10-05", recurrence: "Every 30 days" },
  { id: "journey-quarterly-qbr", type: "QBR", title: "Quarterly business review package", dueDate: "2026-12-05", recurrence: "Every 90 days" },
  { id: "journey-semiannual-strategy", type: "Meeting", title: "Semi-annual strategic review", dueDate: "2027-03-05", recurrence: "Every 180 days" },
  { id: "journey-renewal-t180", type: "To-do", title: "Renewal readiness assessment", dueDate: "2026-09-16", recurrence: "T-180 days" },
  { id: "journey-renewal-t120", type: "Meeting", title: "Renewal planning and budget validation", dueDate: "2026-11-15", recurrence: "T-120 days" },
  { id: "journey-renewal-t90", type: "Meeting", title: "Renewal execution and proposal submission", dueDate: "2026-12-15", recurrence: "T-90 days" },
  { id: "journey-renewal-t30", type: "To-do", title: "Renewal finalization and account plan update", dueDate: "2027-02-14", recurrence: "T-30 days" },
  { id: "journey-ai-monitoring", type: "To-do", title: "AI monitoring and exception management", dueDate: "2026-06-07", recurrence: "Continuous" },
];

const kycDraftSections: KycDraftSection[] = [
  {
    id: "kyc-executive-summary",
    title: "Executive summary",
    source: "Accepted profile fields, Salesforce mock, uploaded source files",
    status: "Needs input",
    draft: "A short KYC narrative will summarize the account, critical risks, opportunity, and recommended next action after required profile fields are confirmed.",
  },
  {
    id: "kyc-industry-overview",
    title: "Industry overview",
    source: "Initial source files and assistant research prompt",
    status: "Ready",
    draft: "Energy and grid analytics context, sector trends, and relevant market pressure will be captured here.",
  },
  {
    id: "kyc-company-history",
    title: "Company history",
    source: "Initial source files and Salesforce mock",
    status: "Ready",
    draft: "Founding context, ownership structure, acquisition notes, and operating footprint are staged for review.",
  },
  {
    id: "kyc-account-history",
    title: "Account history with Tkxel",
    source: "Source files, support documents, account journey",
    status: "Needs input",
    draft: "Relationship age, past engagement summary, milestones, and previous project outcomes will be assembled once the journey is confirmed.",
  },
  {
    id: "kyc-stakeholders",
    title: "Account stakeholders",
    source: "Parsed contacts and user confirmation",
    status: "Needs input",
    draft: "Decision makers, technical contacts, commercial sponsors, and main points of contact need user confirmation.",
  },
  {
    id: "kyc-financials",
    title: "Company financials",
    source: "Salesforce mock, initial source files, support documents",
    status: "Ready",
    draft: "ARR, renewal timing, commercial exposure, and expansion opportunity values are staged for review.",
  },
  {
    id: "kyc-engagement-history",
    title: "Engagement history",
    source: "Account journey and uploaded statements of work",
    status: "Needs input",
    draft: "Past and current projects, delivery status, team allocation, and cadence will be generated from the confirmed journey.",
  },
  {
    id: "kyc-tkxel-team",
    title: "Tkxel team on account",
    source: "Resource list and user confirmation",
    status: "Needs input",
    draft: "Assigned Tkxel resources, roles, start dates, and ownership coverage need confirmation.",
  },
  {
    id: "kyc-competitors",
    title: "Competitors",
    source: "Assistant research prompt and user confirmation",
    status: "Needs input",
    draft: "Competitor exposure and displacement risk require a research prompt or manual confirmation before final draft generation.",
  },
];

function onboardingSteps(sourceFileCount: number, draft: AccountDraft, suggestions: OnboardingSuggestion[], documents: OnboardingDocument[], journey: OnboardingJourneyDraftItem[]): Array<{ label: string; status: OnboardingStepStatus }> {
  const acceptedSuggestions = suggestions.filter((suggestion) => suggestion.status === "Accepted").length;
  const hasSourceFiles = sourceFileCount > 0;
  return [
    { label: "Source files uploaded", status: hasSourceFiles ? "Done" : "Active" },
    { label: "Salesforce mock pull", status: hasSourceFiles ? "Done" : "Pending" },
    { label: "Account profile", status: draft.name && draft.industry && draft.arr ? "Done" : hasSourceFiles ? "Active" : "Pending" },
    { label: "KYC draft", status: acceptedSuggestions >= 5 ? "Done" : hasSourceFiles ? "Active" : "Pending" },
    { label: "Account journey", status: journey.length > 0 ? "Done" : "Pending" },
    { label: "Supporting documents", status: documents.length > 0 ? "Done" : hasSourceFiles ? "Active" : "Pending" },
    { label: "Review and submit", status: acceptedSuggestions >= 5 && journey.length > 0 ? "Active" : "Pending" },
  ];
}

function money(value: number) {
  if (value >= 1_000_000) return `$${(value / 1_000_000).toFixed(1)}M`;
  return `$${Math.round(value / 1_000)}K`;
}

function parseArrValue(value: string) {
  const normalized = value.trim().toUpperCase().replace(/[$,\s]/g, "");
  const numeric = Number(normalized.replace(/[MK]/g, ""));
  if (!Number.isFinite(numeric)) return 0;
  if (normalized.endsWith("M")) return Math.round(numeric * 1_000_000);
  if (normalized.endsWith("K")) return Math.round(numeric * 1_000);
  return Math.round(numeric);
}

function daysUntil(dateValue?: string | null) {
  if (!dateValue) return 180;
  const time = new Date(dateValue).getTime();
  if (Number.isNaN(time)) return 180;
  return Math.max(0, Math.ceil((time - Date.now()) / (1000 * 60 * 60 * 24)));
}

function healthScoreFromAccount(account: Record<string, unknown>, health: PortfolioHealth) {
  const scores = Array.isArray(account.kamScores) ? account.kamScores as Array<Record<string, unknown>> : [];
  const latestScore = Number(scores[0]?.overall);
  if (Number.isFinite(latestScore)) return Math.round(latestScore);
  if (health === "CRITICAL") return 35;
  if (health === "AT_RISK") return 58;
  return 82;
}

function mapApiAccountToPortfolioAccount(account: Record<string, unknown>): PortfolioAccount {
  const health = String(account.health ?? "HEALTHY") as PortfolioHealth;
  const kam = account.kam as { name?: string } | undefined;
  const metadata = getAccountRuntimeMetadata({
    id: String(account.id),
    name: String(account.name ?? "New account"),
  });
  return {
    id: String(account.id),
    name: String(account.name ?? "New account"),
    industry: String(account.industry ?? "Industry not set"),
    segment: String(account.segment ?? ""),
    region: String(account.region ?? "Region not set"),
    country: String(account.country ?? "Country not set"),
    arr: Number(account.arr ?? 0),
    health,
    healthScore: healthScoreFromAccount(account, health),
    renewalDays: daysUntil(account.contractEnd as string | null | undefined),
    kamOwner: kam?.name ?? "KAM not set",
    associateOwner: kam?.name ?? "Account owner not set",
    contactName: metadata?.primaryContact || "Primary contact not set",
    logoUrl: typeof account.logoUrl === "string" ? account.logoUrl : undefined,
    deliveryModel: String(account.segment ?? "Delivery model not set"),
    currentWork: "Account setup in progress",
    relationshipSignal: "Review latest account documents",
  };
}

function mapApiAccountsToCreatedPortfolioAccounts(accounts: Array<Record<string, unknown>>) {
  const seededNames = new Set(portfolioAccounts.map((account) => account.name.toLowerCase()));
  return accounts
    .filter((account) => !String(account.id ?? "").startsWith("acc-"))
    .map(mapApiAccountToPortfolioAccount)
    .filter((account) => !seededNames.has(account.name.toLowerCase()));
}

const taskTypeTone: Record<TaskType, string> = {
  Meeting: "border-[#B7D8C3] bg-[#EEF8F1] text-[#23633E]",
  QBR: "border-[#DEC997] bg-[#FFF7E4] text-[#8A5C16]",
  "To-do": "border-[#C9D6EE] bg-[#F0F5FF] text-[#2D5790]",
};

function renewalDate(daysFromNow: number) {
  const date = new Date();
  date.setDate(date.getDate() + daysFromNow);
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function dueDate(daysFromNow = 7) {
  const date = new Date();
  date.setDate(date.getDate() + daysFromNow);
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function displayDateFromInput(value: string) {
  if (!value) return "";
  const [year, month, day] = value.split("-").map(Number);
  if (!year || !month || !day) return value;
  return new Date(year, month - 1, day).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function journeyDateSortValue(value: string) {
  const date = new Date(`${value}, ${new Date().getFullYear()}`);
  const time = date.getTime();
  return Number.isNaN(time) ? Number.MAX_SAFE_INTEGER : time;
}

function openExternalTab(url: string) {
  window.open(url, "_blank", "noopener,noreferrer");
}

function documentPreviewUrl(name: string, type: string) {
  return `data:text/plain;charset=utf-8,${encodeURIComponent(`${name}\n${type}`)}`;
}

function AccountLogo({ account, size = "md" }: { account: PortfolioAccount; size?: "md" | "lg" }) {
  const initials = account.name.split(/\s+/).slice(0, 2).map((part) => part[0]).join("").toUpperCase();
  return (
    <div
      className={`flex shrink-0 items-center justify-center overflow-hidden rounded-2xl border border-[#E7DED1] bg-white shadow-[0_12px_22px_-18px_rgba(36,27,16,0.68)] ${
        size === "lg" ? "h-14 w-14" : "h-12 w-12"
      }`}
    >
      {account.logoUrl ? (
        <img
          src={account.logoUrl}
          alt={`${account.name} logo`}
          className="h-full w-full object-contain p-2"
          loading="lazy"
          referrerPolicy="no-referrer"
          onError={(event) => {
            event.currentTarget.style.opacity = "0";
          }}
        />
      ) : (
        <span className="text-[13px] font-black text-[#25352E]">{initials}</span>
      )}
    </div>
  );
}

function ScoreNumber({ account }: { account: PortfolioAccount }) {
  return (
    <div className="shrink-0 text-right" aria-label={`${healthLabel[account.health]} score ${account.healthScore} out of 100`}>
      <p className={`text-[18px] font-black leading-none tracking-[-0.04em] ${scoreTone[account.health]}`}>{account.healthScore}</p>
      <p className="mt-0.5 text-[10px] font-semibold text-[var(--text-muted)]">/100</p>
    </div>
  );
}

function SummaryItem({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-[#E1D7CA] bg-[#FFF9EF]/72 px-4 py-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.7)]">
      <p className="text-[12px] font-semibold text-[#8A7A69]">{label}</p>
      <div className="mt-1 text-[18px] font-black tracking-[-0.04em] text-[#25352E]">{value}</div>
    </div>
  );
}

function TrendSpark({ trend }: { trend: KpiTrend }) {
  const stroke = trend === "up" ? "#238B57" : trend === "down" ? "#B33D32" : "#8A7A69";
  const points = trend === "up" ? "2,16 9,12 15,14 22,6" : trend === "down" ? "2,7 9,10 15,8 22,16" : "2,11 9,11 15,11 22,11";

  return (
    <div className="inline-flex h-6 w-8 items-center justify-center rounded-full border border-[#E5DACD] bg-[#FFF9EF]/70" aria-label={`Score trend ${trend}`}>
      <svg viewBox="0 0 24 22" className="h-4 w-6" aria-hidden="true">
        <polyline points={points} fill="none" stroke={stroke} strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </div>
  );
}

function KpiScorePill({ score }: { score: number }) {
  const tone = score >= 4 ? "text-[#238B57] bg-[#EAF6EF] border-[#BFE4CE]" : score >= 3 ? "text-[#B97813] bg-[#FFF4DF] border-[#EAC77B]" : "text-[#B33D32] bg-[#FDEBE8] border-[#F0BBB4]";

  return (
    <span className={`inline-flex h-7 min-w-12 items-center justify-center rounded-full border px-2 text-[12px] font-black ${tone}`}>
      {score}/5
    </span>
  );
}

function clampKpiScore(value: string) {
  const parsed = Number(value);
  if (Number.isNaN(parsed)) return 1;
  return Math.max(1, Math.min(5, Math.round(parsed)));
}

function clampPercent(value: string) {
  const parsed = Number(value);
  if (Number.isNaN(parsed)) return 0;
  return Math.max(0, Math.min(100, Math.round(parsed)));
}

function parseWeightValue(weight: string) {
  const match = weight.match(/\d+/);
  return match ? Number(match[0]) : 0;
}

function formatWeight(value: number) {
  return `${Math.max(0, Math.min(100, Math.round(value)))}%`;
}

function subParameterKey(rowId: string, parameterName: string) {
  return `${rowId}:${parameterName.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")}`;
}

function ScoreOverrideEditor({
  targetId,
  targetName,
  currentScore,
  isAssociate,
  canOverrideDirectly,
  overrideRequest,
  scoreOverride,
  overrideDraft,
  onDraftChange,
  onSubmitRequest,
  onApplyOverride,
  onApproveRequest,
  onDenyRequest,
  onClose,
}: {
  targetId: string;
  targetName: string;
  currentScore: number;
  isAssociate: boolean;
  canOverrideDirectly: boolean;
  overrideRequest: ScoreOverrideRequest | undefined;
  scoreOverride: ScoreOverride | undefined;
  overrideDraft: { score: string; reason: string } | undefined;
  onDraftChange: (rowId: string, field: "score" | "reason", value: string) => void;
  onSubmitRequest: (targetId: string) => void;
  onApplyOverride: (targetId: string) => void;
  onApproveRequest: (targetId: string) => void;
  onDenyRequest: (targetId: string) => void;
  onClose: () => void;
}) {
  const draft = overrideDraft ?? { score: String(currentScore), reason: "" };
  const hasReason = draft.reason.trim().length > 0;
  const primaryActionLabel = isAssociate ? "Request" : "Save";

  const shell = (children: React.ReactNode) => (
    <Dialog.Root open onOpenChange={(open) => !open && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-[70] bg-[#1B1812]/24 backdrop-blur-[2px]" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-[80] w-[min(440px,92vw)] -translate-x-1/2 -translate-y-1/2 overflow-hidden rounded-3xl border border-[#D8CAB9] bg-[#FBF7EF] shadow-[0_28px_88px_-48px_rgba(43,32,19,0.82)] focus:outline-none">
          {children}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );

  const header = (title: string, description?: React.ReactNode) => (
    <div className="flex items-start justify-between gap-4 border-b border-[#E5DACD] bg-[#FFF9EF]/90 px-4 py-3">
      <div>
        <Dialog.Title className="text-[18px] font-black tracking-[-0.04em] text-[#1F2722]">{title}</Dialog.Title>
        <Dialog.Description className="mt-1 text-[12px] leading-relaxed text-[#7D6E5F]">
          {description ?? "Add a score and reason before saving."}
        </Dialog.Description>
      </div>
      <Dialog.Close asChild>
        <button
          type="button"
          className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-[#DED1C1] bg-white/70 text-[#6F6254] transition-colors hover:bg-white hover:text-[#25352E]"
          aria-label="Close score editor"
        >
          <X className="h-4 w-4" />
        </button>
      </Dialog.Close>
    </div>
  );

  const scoreForm = ({
    scoreLabel,
    reasonPlaceholder,
    action,
  }: {
    scoreLabel: string;
    reasonPlaceholder: string;
    action: () => void;
  }) => (
    <div className="space-y-3 p-4">
      <label className="block">
        <span className="text-[12px] font-bold text-[#6F6254]">Score</span>
        <input
          type="number"
          min={1}
          max={5}
          value={draft.score}
          onChange={(event) => onDraftChange(targetId, "score", event.target.value)}
          className="mt-1 h-10 w-full rounded-xl border border-[#E1D7CA] bg-white/75 px-3 text-[14px] font-bold text-[#25352E] outline-none focus:border-[#25352E]/40"
          aria-label={scoreLabel}
        />
      </label>
      <label className="block">
        <span className="text-[12px] font-bold text-[#6F6254]">Reason</span>
        <textarea
          value={draft.reason}
          onChange={(event) => onDraftChange(targetId, "reason", event.target.value)}
          placeholder={reasonPlaceholder}
          className="mt-1 min-h-24 w-full resize-none rounded-xl border border-[#E1D7CA] bg-white/75 p-3 text-[13px] text-[#25352E] outline-none placeholder:text-[#A69A8B] focus:border-[#25352E]/40"
          aria-label={`${scoreLabel} reason`}
        />
      </label>
      <div className="flex justify-end">
        <button
          type="button"
          onClick={action}
          disabled={!hasReason}
          className="h-9 rounded-full bg-[#25352E] px-4 text-[12px] font-bold text-[#FFF9EF] disabled:cursor-not-allowed disabled:bg-[#25352E]/35"
        >
          {primaryActionLabel}
        </button>
      </div>
    </div>
  );

  if (isAssociate) {
    return shell(
      <>
        {header(
          `Edit ${targetName}`,
          overrideRequest ? `Current request is ${overrideRequest.status.toLowerCase()} for ${overrideRequest.requestedScore}/5.` : "Submit a score change request for this sub-parameter.",
        )}
        {scoreForm({
          scoreLabel: `Requested override score for ${targetName}`,
          reasonPlaceholder: "Why should this score change?",
          action: () => {
            onSubmitRequest(targetId);
            onClose();
          },
        })}
      </>,
    );
  }

  if (canOverrideDirectly) {
    return shell(
      <>
        {header(`Edit ${targetName}`, scoreOverride ? `Applied: ${scoreOverride.score}/5. ${scoreOverride.reason}` : "Save a direct score override for this sub-parameter.")}
        {overrideRequest?.status === "Pending" ? (
          <div className="mx-4 mt-4 rounded-xl border border-[#DEC997] bg-[#FFF7E4] px-3 py-2 text-[12px] text-[#6F6254]">
            <p className="font-bold text-[#25352E]">Associate request: {overrideRequest.requestedScore}/5</p>
            <p className="mt-1">{overrideRequest.reason}</p>
            <div className="mt-2 flex gap-2">
              <button type="button" onClick={() => onApproveRequest(targetId)} className="rounded-full bg-[#25352E] px-3 py-1.5 text-[12px] font-bold text-[#FFF9EF]">
                Approve
              </button>
              <button type="button" onClick={() => onDenyRequest(targetId)} className="rounded-full border border-[#D8CAB9] bg-white/70 px-3 py-1.5 text-[12px] font-bold text-[#6F6254]">
                Deny
              </button>
            </div>
          </div>
        ) : null}
        {scoreForm({
          scoreLabel: `Direct override score for ${targetName}`,
          reasonPlaceholder: "Reason for direct override",
          action: () => {
            onApplyOverride(targetId);
            onClose();
          },
        })}
      </>,
    );
  }

  return shell(
    <>
      {header(`Edit ${targetName}`, "Score edits are read-only in this view.")}
      <div className="flex justify-end p-4">
        <p className="text-[12px] text-[#7D6E5F]">Use the cross icon to close this window.</p>
      </div>
    </>,
  );
}

function TaskTypeBadge({ type }: { type: TaskType }) {
  return (
    <span className={`inline-flex w-fit items-center rounded-full border px-2.5 py-1 text-[11px] font-bold ${taskTypeTone[type]}`}>
      {type}
    </span>
  );
}

function EmptyMark({ kind = "dash" }: { kind?: "dash" | "check" }) {
  return (
    <span className={kind === "check" ? "text-[18px] font-black text-[#238B57]" : "text-[16px] font-bold text-[#A69A8B]"}>
      {kind === "check" ? "✓" : "—"}
    </span>
  );
}

function OverviewActionCell({
  row,
  isAccepted,
  isDenied,
  denialReason,
  pendingReason,
  onAccept,
  onStartDeny,
  onReasonChange,
  onConfirmDeny,
  onCancelDeny,
}: {
  row: KpiOverviewRow;
  isAccepted: boolean;
  isDenied: boolean;
  denialReason: string;
  pendingReason: string | undefined;
  onAccept: (row: KpiOverviewRow) => void;
  onStartDeny: (row: KpiOverviewRow) => void;
  onReasonChange: (rowId: string, value: string) => void;
  onConfirmDeny: (row: KpiOverviewRow) => void;
  onCancelDeny: (rowId: string) => void;
}) {
  const healthy = row.score >= 4;
  if (healthy) return <span className="text-[18px] font-black text-[#238B57]">✓</span>;
  if (isDenied) {
    return (
      <div className="flex flex-col gap-1">
        <span className="text-[18px]" aria-label="Denied">⛔</span>
        <span className="max-w-[14rem] text-[11px] text-[#8A7A69]">{denialReason}</span>
      </div>
    );
  }
  if (pendingReason !== undefined) {
    return (
      <div className="space-y-2">
        <textarea
          value={pendingReason}
          onChange={(event) => onReasonChange(row.id, event.target.value)}
          placeholder="Reason for denial"
          className="min-h-16 w-full rounded-2xl border border-[#E1D7CA] bg-white/70 p-3 text-[12px] text-[#25352E] outline-none placeholder:text-[#A69A8B] focus:border-[#25352E]/40"
        />
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => onConfirmDeny(row)}
            disabled={!pendingReason.trim()}
            className="rounded-full bg-[#B33D32] px-3 py-1.5 text-[12px] font-bold text-white disabled:cursor-not-allowed disabled:bg-[#B33D32]/35"
          >
            Save reason
          </button>
          <button
            type="button"
            onClick={() => onCancelDeny(row.id)}
            className="rounded-full border border-[#E1D7CA] bg-white/60 px-3 py-1.5 text-[12px] font-bold text-[#6F6254]"
          >
            Cancel
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-wrap gap-2">
      <button
        type="button"
        onClick={() => onAccept(row)}
        disabled={isAccepted}
        aria-label={`Accept ${row.name}`}
        className="rounded-full bg-[#25352E] px-3 py-1.5 text-[12px] font-bold text-[#FFF9EF] disabled:bg-[#25352E]/35"
      >
        {isAccepted ? "Queued" : "Accept"}
      </button>
      <button
        type="button"
        onClick={() => onStartDeny(row)}
        disabled={isAccepted}
        aria-label={`Deny ${row.name}`}
        className="rounded-full border border-[#E1D7CA] bg-white/60 px-3 py-1.5 text-[12px] font-bold text-[#6F6254] disabled:opacity-45"
      >
        Deny
      </button>
    </div>
  );
}

function KpiWeightSettingsModal({
  open,
  onOpenChange,
  kpiRows,
  kpiWeights,
  weightDrafts,
  weightRequest,
  weightReason,
  isAssociate,
  canOverrideDirectly,
  onDraftChange,
  onReasonChange,
  onSubmitRequest,
  onSaveWeight,
  onApproveRequest,
  onDenyRequest,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  kpiRows: KpiOverviewRow[];
  kpiWeights: Record<string, number>;
  weightDrafts: Record<string, { weight: string }>;
  weightRequest: KpiWeightRequest | undefined;
  weightReason: string;
  isAssociate: boolean;
  canOverrideDirectly: boolean;
  onDraftChange: (rowId: string, value: string) => void;
  onReasonChange: (value: string) => void;
  onSubmitRequest: () => void;
  onSaveWeight: () => void;
  onApproveRequest: () => void;
  onDenyRequest: () => void;
}) {
  const draftWeights = kpiRows.reduce<Record<string, number>>((weights, row) => {
    weights[row.id] = clampPercent(weightDrafts[row.id]?.weight ?? String(kpiWeights[row.id] ?? parseWeightValue(row.weight)));
    return weights;
  }, {});
  const totalWeight = Object.values(draftWeights).reduce((sum, weight) => sum + weight, 0);
  const hasReason = weightReason.trim().length > 0;
  const canSubmitWeights = totalWeight === 100 && hasReason;
  const totalTone = totalWeight === 100 ? "border-[#BFE4CE] bg-[#EAF6EF] text-[#238B57]" : "border-[#EAC77B] bg-[#FFF4DF] text-[#B97813]";
  const actionLabel = isAssociate ? "Request changes" : "Save weights";

  return (
    <Dialog.Root modal={false} open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-[70] bg-[#1B1812]/24 backdrop-blur-[2px]" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-[80] flex max-h-[82vh] w-[min(900px,92vw)] -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-3xl border border-[#D8CAB9] bg-[#FBF7EF] shadow-[0_28px_88px_-48px_rgba(43,32,19,0.82)] focus:outline-none">
          <div className="flex shrink-0 items-start justify-between gap-4 border-b border-[#E5DACD] bg-[#FFF9EF]/90 px-4 py-3">
            <div>
              <Dialog.Title className="text-[18px] font-black tracking-[-0.04em] text-[#1F2722]">KPI weight settings</Dialog.Title>
              <Dialog.Description className="mt-1 text-[12px] text-[#7D6E5F]">
                Adjust how each KPI contributes to the account score.
              </Dialog.Description>
            </div>
            <Dialog.Close asChild>
              <button
                type="button"
                className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-[#DED1C1] bg-white/70 text-[#6F6254] transition-colors hover:bg-white hover:text-[#25352E]"
                aria-label="Close KPI weight settings"
              >
                <X className="h-4 w-4" />
              </button>
            </Dialog.Close>
          </div>

          <div className="min-h-0 overflow-y-auto p-4 pb-5">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <span className={`rounded-full border px-3 py-1.5 text-[12px] font-black ${totalTone}`}>Total: {totalWeight}%</span>
              <span className="text-[12px] font-semibold text-[#7D6E5F]">Weights must equal 100% before changes can be submitted.</span>
            </div>

            {canOverrideDirectly && weightRequest?.status === "Pending" ? (
              <div className="mb-3 rounded-2xl border border-[#DEC997] bg-[#FFF7E4] px-3 py-2 text-[12px] text-[#6F6254]">
                <p className="font-bold text-[#25352E]">Pending associate weight request</p>
                <p className="mt-1">{weightRequest.reason}</p>
                <div className="mt-2 flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={onApproveRequest}
                    className="rounded-full bg-[#25352E] px-3 py-1.5 text-[12px] font-bold text-[#FFF9EF]"
                  >
                    Approve
                  </button>
                  <button
                    type="button"
                    onClick={onDenyRequest}
                    className="rounded-full border border-[#D8CAB9] bg-white/70 px-3 py-1.5 text-[12px] font-bold text-[#6F6254]"
                  >
                    Deny
                  </button>
                </div>
              </div>
            ) : null}

            <div className="grid gap-3 sm:grid-cols-2">
              {kpiRows.map((row) => {
                const currentWeight = kpiWeights[row.id] ?? parseWeightValue(row.weight);
                const draft = weightDrafts[row.id] ?? { weight: String(currentWeight) };
                const draftWeight = clampPercent(draft.weight);

                return (
                  <div key={row.id} className="rounded-2xl border border-[#E5DACD] bg-white/58 p-3">
                    <div className="flex items-start justify-between gap-2">
                      <p className="text-[13px] font-black tracking-[-0.03em] text-[#25352E]">{row.name}</p>
                      <p className="shrink-0 text-[11px] font-semibold text-[#7D6E5F]">Current {formatWeight(currentWeight)}</p>
                    </div>

                    {isAssociate || canOverrideDirectly ? (
                      <div className="mt-3 space-y-2">
                        <div className="flex items-center justify-between gap-3">
                          <span className="text-[11px] font-bold text-[#8A7A69]">0%</span>
                          <span className="rounded-full border border-[#D8CAB9] bg-[#FFF9EF] px-3 py-1 text-[12px] font-black text-[#25352E]">
                            {formatWeight(draftWeight)}
                          </span>
                          <span className="text-[11px] font-bold text-[#8A7A69]">100%</span>
                        </div>
                        <input
                          type="range"
                          min={0}
                          max={100}
                          step={1}
                          value={draftWeight}
                          onChange={(event) => onDraftChange(row.id, event.target.value)}
                          className="h-3 w-full cursor-pointer appearance-none rounded-full bg-[#E8DED1] accent-[#25352E] outline-none"
                          style={{
                            background: `linear-gradient(to right, #25352E 0%, #25352E ${draftWeight}%, #E8DED1 ${draftWeight}%, #E8DED1 100%)`,
                          }}
                          aria-label={`${row.name} weight`}
                        />
                      </div>
                    ) : (
                      <p className="mt-3 rounded-xl border border-[#E5DACD] bg-[#FFF9EF]/70 px-3 py-2 text-[12px] text-[#7D6E5F]">
                        Weight changes are read-only in this view.
                      </p>
                    )}
                  </div>
                );
              })}
            </div>

            {isAssociate || canOverrideDirectly ? (
              <div className="mt-4 rounded-2xl border border-[#E5DACD] bg-white/58 p-3">
                <textarea
                  value={weightReason}
                  onChange={(event) => onReasonChange(event.target.value)}
                  placeholder={isAssociate ? "Overall reason for requesting these weight changes" : "Overall reason for changing these weights"}
                  className="min-h-24 w-full resize-none rounded-xl border border-[#E1D7CA] bg-white/75 p-3 text-[13px] text-[#25352E] outline-none placeholder:text-[#A69A8B] focus:border-[#25352E]/40"
                  aria-label="Overall KPI weight change reason"
                />
                <div className="mt-3 flex justify-end">
                  <button
                    type="button"
                    data-kpi-weight-action={isAssociate ? "request" : "save"}
                    onClick={isAssociate ? onSubmitRequest : onSaveWeight}
                    disabled={!canSubmitWeights}
                    className="h-10 rounded-full bg-[#25352E] px-5 text-[12px] font-bold text-[#FFF9EF] disabled:cursor-not-allowed disabled:bg-[#25352E]/35"
                  >
                    {actionLabel}
                  </button>
                </div>
              </div>
            ) : null}
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function OverviewTab({
  kpiRows,
  activeTasks,
  acceptedTaskIds,
  pendingDenials,
  deniedReasons,
  overrideDrafts,
  overrideRequests,
  scoreOverrides,
  kpiWeights,
  weightDrafts,
  weightRequest,
  weightReason,
  isAssociate,
  canOverrideDirectly,
  onAccept,
  onStartDeny,
  onReasonChange,
  onConfirmDeny,
  onCancelDeny,
  onOverrideDraftChange,
  onSubmitOverrideRequest,
  onApplyScoreOverride,
  onApproveOverrideRequest,
  onDenyOverrideRequest,
  onWeightDraftChange,
  onWeightReasonChange,
  onSubmitWeightRequest,
  onSaveKpiWeight,
  onApproveWeightRequest,
  onDenyWeightRequest,
}: {
  kpiRows: KpiOverviewRow[];
  activeTasks: ActiveTask[];
  acceptedTaskIds: Set<string>;
  pendingDenials: Record<string, string>;
  deniedReasons: Record<string, string>;
  overrideDrafts: Record<string, { score: string; reason: string }>;
  overrideRequests: Record<string, ScoreOverrideRequest>;
  scoreOverrides: Record<string, ScoreOverride>;
  kpiWeights: Record<string, number>;
  weightDrafts: Record<string, { weight: string }>;
  weightRequest: KpiWeightRequest | undefined;
  weightReason: string;
  isAssociate: boolean;
  canOverrideDirectly: boolean;
  onAccept: (row: KpiOverviewRow) => void;
  onStartDeny: (row: KpiOverviewRow) => void;
  onReasonChange: (rowId: string, value: string) => void;
  onConfirmDeny: (row: KpiOverviewRow) => void;
  onCancelDeny: (rowId: string) => void;
  onOverrideDraftChange: (rowId: string, field: "score" | "reason", value: string) => void;
  onSubmitOverrideRequest: (targetId: string) => void;
  onApplyScoreOverride: (targetId: string) => void;
  onApproveOverrideRequest: (targetId: string) => void;
  onDenyOverrideRequest: (targetId: string) => void;
  onWeightDraftChange: (rowId: string, value: string) => void;
  onWeightReasonChange: (value: string) => void;
  onSubmitWeightRequest: () => void;
  onSaveKpiWeight: () => void;
  onApproveWeightRequest: () => void;
  onDenyWeightRequest: () => void;
}) {
  const [activeOverrideTargetId, setActiveOverrideTargetId] = useState<string | null>(null);
  const [hoveredOverrideTargetId, setHoveredOverrideTargetId] = useState<string | null>(null);
  const [expandedRows, setExpandedRows] = useState<Set<string>>(() => new Set());
  const [weightSettingsOpen, setWeightSettingsOpen] = useState(false);
  const sortedKpiRows = [...kpiRows].sort((a, b) => a.score - b.score);

  function toggleRow(rowId: string) {
    setExpandedRows((rows) => {
      const next = new Set(rows);
      if (next.has(rowId)) next.delete(rowId);
      else next.add(rowId);
      return next;
    });
  }

  return (
    <div className="space-y-3">
      <div className="rounded-2xl border border-[#E5DACD] bg-white/55">
        <div className="flex items-center gap-3 border-b border-[#E9DED0] px-4 py-2">
          <div className="grid flex-1 grid-cols-[1.2fr_0.35fr_0.35fr_1fr] gap-3 text-[11px] font-bold text-[#8A7A69] max-lg:hidden">
            <span>KPI</span>
            <span className="text-center">Score</span>
            <span className="text-center">Weight</span>
            <span className="text-left">Proposed next step</span>
          </div>
          <button
            type="button"
            onClick={() => setWeightSettingsOpen(true)}
            className="ml-auto inline-flex h-8 w-8 items-center justify-center rounded-full border border-[#E1D7CA] bg-[#FFF9EF]/82 text-[#6F6254] transition-colors hover:bg-[#25352E] hover:text-[#FFF9EF]"
            aria-label="Open KPI weight settings"
          >
            <Settings className="h-4 w-4" />
          </button>
        </div>

        <div className="divide-y divide-[#E9DED0]">
          {sortedKpiRows.map((row) => {
            const currentScore = row.score;
            const currentWeight = kpiWeights[row.id] ?? parseWeightValue(row.weight);
            const healthy = currentScore >= 4;
            const isExpanded = expandedRows.has(row.id) || Boolean(activeOverrideTargetId?.startsWith(`${row.id}:`));
            const hasProposedAction = Boolean(row.why || row.task);
            return (
              <div key={row.id} className="group">
                <button
                  type="button"
                  onClick={() => toggleRow(row.id)}
                  className="grid min-h-[74px] w-full cursor-pointer items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-[#FFF9EF]/58 lg:grid-cols-[1.2fr_0.35fr_0.35fr_1fr]"
                  aria-expanded={isExpanded}
                >
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-[14px] font-black tracking-[-0.03em] text-[#1F2722]">{row.name}</span>
                      <TrendSpark trend={row.trend} />
                      <span className="rounded-full border border-[#E1D7CA] bg-[#FFF9EF]/70 px-2 py-0.5 text-[10px] font-bold text-[#6F6254] lg:hidden">
                        {formatWeight(currentWeight)}
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center justify-center">
                    <KpiScorePill score={currentScore} />
                  </div>
                  <div className="hidden items-center justify-center text-center text-[12px] font-bold text-[#6F6254] lg:flex">{formatWeight(currentWeight)}</div>
                  <div className="flex min-h-[48px] min-w-0 items-center gap-3">
                    {healthy ? (
                      <span className="inline-flex min-h-[36px] flex-1 items-center text-left text-[12px] font-semibold text-[#8A7A69]">No proposed task</span>
                    ) : (
                      <div className="flex min-h-[48px] min-w-0 flex-1 flex-col justify-center text-left">
                        <div className="flex flex-wrap items-center gap-2">
                          {row.taskType ? <TaskTypeBadge type={row.taskType} /> : null}
                          <span className="text-[11px] font-bold text-[#8A7A69]">Due {dueDate(row.dueInDays)}</span>
                        </div>
                        <p className="mt-1 truncate text-[12px] font-semibold text-[#25352E]">{row.task}</p>
                      </div>
                    )}
                    <span className={`shrink-0 text-[14px] text-[#8A7A69] transition-transform ${isExpanded ? "rotate-180" : ""}`}>⌄</span>
                  </div>
                </button>

                {isExpanded ? (
                <div className="space-y-3 bg-[#FCF8F0]/70 px-4 pb-3 pt-2">
                  <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
                    {row.subParameters.map((parameter) => {
                      const targetId = subParameterKey(row.id, parameter.name);
                      const parameterScore = scoreOverrides[targetId]?.score ?? parameter.score;
                      return (
                        <div
                          key={parameter.name}
                          onMouseOver={() => setHoveredOverrideTargetId(targetId)}
                          onMouseLeave={() => setHoveredOverrideTargetId((hoveredTargetId) => (hoveredTargetId === targetId ? null : hoveredTargetId))}
                          className="w-full rounded-xl border border-[#E5DACD] bg-white/58 px-2.5 py-1.5"
                        >
                          <div className="flex h-7 items-center justify-between gap-2">
                            <div className="flex min-w-0 items-center gap-2">
                              <p className="truncate text-[12px] font-black text-[#25352E]">{parameter.name}</p>
                              {parameter.trend === "down" ? (
                                <span className="inline-flex h-5 items-center rounded-full border border-[#F0BBB4] bg-[#FFF0ED] px-2 text-[10px] font-black text-[#B33D32]">
                                  Falling
                                </span>
                              ) : null}
                              <button
                                type="button"
                                onClick={() => {
                                  setExpandedRows((rows) => new Set(rows).add(row.id));
                                  setActiveOverrideTargetId((activeTargetId) => (activeTargetId === targetId ? null : targetId));
                                }}
                                onFocus={() => setHoveredOverrideTargetId(targetId)}
                                onBlur={() => setHoveredOverrideTargetId((hoveredTargetId) => (hoveredTargetId === targetId ? null : hoveredTargetId))}
                                className={`inline-flex h-6 w-6 items-center justify-center rounded-full border border-[#E1D7CA] bg-white/70 text-[#6F6254] transition-all hover:bg-[#25352E] hover:text-[#FFF9EF] focus:opacity-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#25352E]/35 ${
                                  hoveredOverrideTargetId === targetId || activeOverrideTargetId === targetId ? "opacity-100" : "opacity-0"
                                }`}
                                aria-label={`Edit ${parameter.name} score`}
                              >
                                <Pencil className="h-3 w-3" />
                              </button>
                            </div>
                            <span className="shrink-0">
                              <KpiScorePill score={parameterScore} />
                            </span>
                          </div>
                          {scoreOverrides[targetId] ? <p className="mt-1 text-[11px] font-bold text-[#6F6254]">Override applied from {parameter.score}/5</p> : null}
                          {parameter.trend === "down" && parameter.fallingWhy ? (
                            <div className="mt-2 rounded-xl border border-[#F0D1C9] bg-[#FFF8F5] px-2.5 py-2">
                              <p className="text-[11px] font-black text-[#B33D32]">Likely cause</p>
                              <p className="mt-1 text-[11px] font-semibold leading-relaxed text-[#25352E]">{parameter.fallingWhy.summary}</p>
                              <div className="mt-2 flex flex-wrap gap-1">
                                {parameter.fallingWhy.sources.map((source) => (
                                  <span key={source} className="rounded-full border border-[#E5DACD] bg-white/70 px-2 py-0.5 text-[10px] font-bold text-[#6F6254]">
                                    {source}
                                  </span>
                                ))}
                              </div>
                            </div>
                          ) : null}
                          {activeOverrideTargetId === targetId ? (
                            <div className="mt-3">
                              <ScoreOverrideEditor
                                targetId={targetId}
                                targetName={parameter.name}
                                currentScore={parameterScore}
                                isAssociate={isAssociate}
                                canOverrideDirectly={canOverrideDirectly}
                                overrideRequest={overrideRequests[targetId]}
                                scoreOverride={scoreOverrides[targetId]}
                                overrideDraft={overrideDrafts[targetId]}
                                onDraftChange={onOverrideDraftChange}
                                onSubmitRequest={onSubmitOverrideRequest}
                                onApplyOverride={onApplyScoreOverride}
                                onApproveRequest={onApproveOverrideRequest}
                                onDenyRequest={onDenyOverrideRequest}
                                onClose={() => setActiveOverrideTargetId(null)}
                              />
                            </div>
                          ) : null}
                        </div>
                      );
                    })}
                  </div>

                  {hasProposedAction ? (
                    <div className="grid gap-2 lg:grid-cols-[1fr_1.2fr_0.85fr]">
                      <div className="rounded-xl border border-[#E5DACD] bg-white/58 p-3 text-[12px] text-[#25352E]">
                        <p className="mb-1 font-bold text-[#8A7A69]">Why?</p>
                        {row.why}
                      </div>

                      <div className="rounded-xl border border-[#E5DACD] bg-white/58 p-3 text-[12px] text-[#25352E]">
                        <p className="mb-1 font-bold text-[#8A7A69]">Task</p>
                        <div className="space-y-2">
                          <div className="flex flex-wrap items-center gap-2">
                            {row.taskType ? <TaskTypeBadge type={row.taskType} /> : null}
                            <span className="text-[11px] font-bold text-[#8A7A69]">Due {dueDate(row.dueInDays)}</span>
                          </div>
                          <p>{row.task}</p>
                        </div>
                      </div>

                      <div className="rounded-xl border border-[#E5DACD] bg-white/58 p-3">
                        <p className="mb-1 text-[12px] font-bold text-[#8A7A69]">Accept / Deny</p>
                        <OverviewActionCell
                          row={{ ...row, score: currentScore }}
                          isAccepted={acceptedTaskIds.has(row.id)}
                          isDenied={Boolean(deniedReasons[row.id])}
                          denialReason={deniedReasons[row.id] ?? ""}
                          pendingReason={pendingDenials[row.id]}
                          onAccept={onAccept}
                          onStartDeny={onStartDeny}
                          onReasonChange={onReasonChange}
                          onConfirmDeny={onConfirmDeny}
                          onCancelDeny={onCancelDeny}
                        />
                      </div>
                    </div>
                  ) : null}

                </div>
                ) : null}
              </div>
            );
          })}
        </div>
      </div>

      <KpiWeightSettingsModal
        open={weightSettingsOpen}
        onOpenChange={setWeightSettingsOpen}
        kpiRows={kpiRows}
        kpiWeights={kpiWeights}
        weightDrafts={weightDrafts}
        weightRequest={weightRequest}
        weightReason={weightReason}
        isAssociate={isAssociate}
        canOverrideDirectly={canOverrideDirectly}
        onDraftChange={onWeightDraftChange}
        onReasonChange={onWeightReasonChange}
        onSubmitRequest={onSubmitWeightRequest}
        onSaveWeight={onSaveKpiWeight}
        onApproveRequest={onApproveWeightRequest}
        onDenyRequest={onDenyWeightRequest}
      />

    </div>
  );
}

function ContactCard({
  contact,
  deletionRequested,
  role,
  onDelete,
}: {
  contact: AccountContact;
  deletionRequested: boolean;
  role: Role;
  onDelete: (id: string) => void;
}) {
  const [phoneOpen, setPhoneOpen] = useState(false);
  const gmailHref = `https://mail.google.com/mail/?view=cm&fs=1&to=${encodeURIComponent(contact.email)}`;
  const calendarHref = `https://calendar.google.com/calendar/render?action=TEMPLATE&add=${encodeURIComponent(contact.email)}`;
  const deleteLabel = role === "KAM" ? (deletionRequested ? "Approve deletion" : "Delete") : "Request deletion";

  return (
    <article className="group relative rounded-2xl border border-[#E5DACD] bg-white/62 p-3 shadow-[0_14px_30px_-30px_rgba(55,43,28,0.52)]">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <p className="truncate text-[15px] font-black tracking-[-0.04em] text-[#1F2722]">{contact.name}</p>
            {deletionRequested ? <span className="rounded-full border border-[#EAC77B] bg-[#FFF4DF] px-2 py-0.5 text-[10px] font-bold text-[#8A5C16]">Deletion requested</span> : null}
          </div>
          <p className="mt-1 text-[12px] font-bold text-[#6F6254]">{contact.designation}</p>
          <p className="mt-2 text-[12px] text-[#8A7A69]">{contact.location} · {contact.timeZone}</p>
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          <button
            type="button"
            onClick={() => setPhoneOpen((open) => !open)}
            className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-[#E1D7CA] bg-[#FFF9EF]/80 text-[#6F6254] transition-colors hover:bg-[#25352E] hover:text-[#FFF9EF]"
            aria-label={`Call ${contact.name}`}
          >
            <Phone className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            onClick={() => openExternalTab(gmailHref)}
            className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-[#E1D7CA] bg-[#FFF9EF]/80 text-[#6F6254] transition-colors hover:bg-[#25352E] hover:text-[#FFF9EF]"
            aria-label={`Email ${contact.name}`}
          >
            <Mail className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            onClick={() => openExternalTab(calendarHref)}
            className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-[#E1D7CA] bg-[#FFF9EF]/80 text-[#6F6254] transition-colors hover:bg-[#25352E] hover:text-[#FFF9EF]"
            aria-label={`Schedule with ${contact.name}`}
          >
            <CalendarDays className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
      <button
        type="button"
        onClick={() => onDelete(contact.id)}
        className="absolute bottom-3 right-3 rounded-full border border-[#E8B8B0] bg-[#FFF0ED] px-3 py-1.5 text-[11px] font-bold text-[#B33D32] opacity-0 shadow-[0_12px_24px_-20px_rgba(179,61,50,0.65)] transition-opacity group-hover:opacity-100 focus:opacity-100"
      >
        {deleteLabel}
      </button>

      {phoneOpen ? (
        <div className="absolute right-3 top-12 z-20 w-64 rounded-2xl border border-[#D8CAB9] bg-[#FBF7EF] p-3 text-[12px] shadow-[0_22px_70px_-42px_rgba(43,32,19,0.78)]">
          <p className="font-bold text-[#25352E]">{contact.mobile}</p>
          <button
            type="button"
            onClick={() => openExternalTab(calendarHref)}
            className="mt-2 inline-flex rounded-full border border-[#D8CAB9] bg-white/70 px-3 py-1.5 font-bold text-[#6F6254] hover:bg-white"
          >
            Set up Google Meet
          </button>
        </div>
      ) : null}
    </article>
  );
}

function TkxelResourceCard({
  resource,
  deletionRequested,
  role,
  onDelete,
}: {
  resource: TkxelResource;
  deletionRequested: boolean;
  role: Role;
  onDelete: (id: string) => void;
}) {
  const deleteLabel = role === "KAM" ? (deletionRequested ? "Approve deletion" : "Delete") : "Request deletion";

  return (
    <article className="group relative rounded-2xl border border-[#E5DACD] bg-white/62 p-3 shadow-[0_14px_30px_-30px_rgba(55,43,28,0.52)]">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <p className="truncate text-[15px] font-black tracking-[-0.04em] text-[#1F2722]">{resource.name}</p>
            {deletionRequested ? <span className="rounded-full border border-[#EAC77B] bg-[#FFF4DF] px-2 py-0.5 text-[10px] font-bold text-[#8A5C16]">Deletion requested</span> : null}
          </div>
          <p className="mt-1 text-[12px] font-bold text-[#6F6254]">{resource.role}</p>
          <p className="mt-2 text-[12px] text-[#8A7A69]">{resource.pod}</p>
        </div>
      </div>
      <div className="mt-3 grid gap-2 border-t border-[#E5DACD] pt-3 text-[12px] font-bold text-[#6F6254] sm:grid-cols-2">
        <span>{resource.location}</span>
        <span>Since {resource.startDate}</span>
      </div>
      <button
        type="button"
        onClick={() => onDelete(resource.id)}
        className="absolute bottom-3 right-3 rounded-full border border-[#E8B8B0] bg-[#FFF0ED] px-3 py-1.5 text-[11px] font-bold text-[#B33D32] opacity-0 shadow-[0_12px_24px_-20px_rgba(179,61,50,0.65)] transition-opacity group-hover:opacity-100 focus:opacity-100"
      >
        {deleteLabel}
      </button>
    </article>
  );
}

function JourneyResolutionForm({
  open,
  action,
  reason,
  itemTitle,
  onOpenChange,
  onReasonChange,
  onConfirm,
  onCancel,
}: {
  open: boolean;
  action: TaskResolutionAction;
  reason: string;
  itemTitle?: string;
  onOpenChange: (open: boolean) => void;
  onReasonChange: (reason: string) => void;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <Dialog.Root modal={false} open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-[70] bg-[#1F2722]/28 backdrop-blur-[2px]" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-[80] w-[min(92vw,460px)] -translate-x-1/2 -translate-y-1/2 rounded-3xl border border-[#D8CAB9] bg-[#FFF9EF] p-4 shadow-[0_28px_70px_-32px_rgba(31,39,34,0.56)] focus:outline-none">
          <div className="flex items-start justify-between gap-3">
            <div>
              <Dialog.Title className="text-[20px] font-black tracking-[-0.05em] text-[#1F2722]">
                Mark item {action.toLowerCase()}
              </Dialog.Title>
              {itemTitle ? <p className="mt-1 text-[13px] font-bold text-[#6F6254]">{itemTitle}</p> : null}
            </div>
            <button
              type="button"
              onClick={onCancel}
              className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-[#DED1C1] bg-white/70 text-[#6F6254] hover:text-[#25352E]"
              aria-label="Close resolution modal"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <textarea
            value={reason}
            onChange={(event) => onReasonChange(event.target.value)}
            placeholder={`Reason this item is being marked ${action.toLowerCase()}`}
            className="mt-4 min-h-28 w-full rounded-xl border border-[#E1D7CA] bg-white/80 p-3 text-[13px] text-[#25352E] outline-none placeholder:text-[#A69A8B] focus:border-[#25352E]/45"
          />
          <div className="mt-4 flex justify-end gap-2">
            <button
              type="button"
              onClick={onCancel}
              className="rounded-full border border-[#D8CAB9] bg-white/70 px-4 py-2 text-[13px] font-bold text-[#6F6254]"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={onConfirm}
              disabled={!reason.trim()}
              className="rounded-full bg-[#25352E] px-4 py-2 text-[13px] font-bold text-[#FFF9EF] disabled:cursor-not-allowed disabled:bg-[#25352E]/35"
            >
              Confirm
            </button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function ProposalResolutionForm({
  open,
  action,
  reason,
  proposal,
  role,
  onOpenChange,
  onReasonChange,
  onConfirm,
  onCancel,
}: {
  open: boolean;
  action: ProposalResolutionAction;
  reason: string;
  proposal?: DocumentSignalProposal;
  role: Role;
  onOpenChange: (open: boolean) => void;
  onReasonChange: (reason: string) => void;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const isApproval = action === "approve";
  const actionLabel = isApproval ? (role === "ASSOCIATE" ? "Route proposal" : "Approve proposal") : "Deny proposal";
  const reasonPlaceholder = isApproval ? "Reason for approving this proposal" : "Reason for denying this proposal";

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-[70] bg-[#1F2722]/28 backdrop-blur-[2px]" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-[80] w-[min(92vw,500px)] -translate-x-1/2 -translate-y-1/2 rounded-3xl border border-[#D8CAB9] bg-[#FFF9EF] p-4 shadow-[0_28px_70px_-32px_rgba(31,39,34,0.56)] focus:outline-none">
          <div className="flex items-start justify-between gap-3">
            <Dialog.Title className="text-[20px] font-black tracking-[-0.05em] text-[#1F2722]">{actionLabel}</Dialog.Title>
            <button
              type="button"
              onClick={onCancel}
              className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-[#DED1C1] bg-white/70 text-[#6F6254] hover:text-[#25352E]"
              aria-label="Close proposal reason modal"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          {proposal ? (
            <div className="mt-4 rounded-2xl border border-[#E5DACD] bg-white/62 p-3">
              <p className="text-[13px] font-black text-[#1F2722]">{proposal.field}</p>
              <div className="mt-2 grid gap-2 text-[12px] font-bold text-[#6F6254] sm:grid-cols-2">
                <span>Current: {proposal.currentValue}</span>
                <span>Proposed: {proposal.proposedValue}</span>
              </div>
              {role === "KAM" && proposal.associateReason ? (
                <div className="mt-3 rounded-xl border border-[#E1D7CA] bg-[#FFF9EF]/80 p-3">
                  <p className="text-[12px] font-bold text-[#7D6E5F]">Associate reason</p>
                  <p className="mt-1 text-[13px] font-bold text-[#25352E]">{proposal.associateReason}</p>
                </div>
              ) : null}
            </div>
          ) : null}

          <textarea
            value={reason}
            onChange={(event) => onReasonChange(event.target.value)}
            placeholder={reasonPlaceholder}
            className="mt-4 min-h-28 w-full rounded-xl border border-[#E1D7CA] bg-white/80 p-3 text-[13px] text-[#25352E] outline-none placeholder:text-[#A69A8B] focus:border-[#25352E]/45"
          />
          <div className="mt-4 flex justify-end gap-2">
            <button
              type="button"
              onClick={onCancel}
              className="rounded-full border border-[#D8CAB9] bg-white/70 px-4 py-2 text-[13px] font-bold text-[#6F6254]"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={onConfirm}
              disabled={!reason.trim()}
              className="rounded-full bg-[#25352E] px-4 py-2 text-[13px] font-bold text-[#FFF9EF] disabled:cursor-not-allowed disabled:bg-[#25352E]/35"
            >
              Confirm
            </button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function FieldLabel({ children }: { children: string }) {
  return <span className="text-[12px] font-bold text-[#7D6E5F]">{children}</span>;
}

function AddContactDialog({
  open,
  draft,
  onOpenChange,
  onDraftChange,
  onSave,
}: {
  open: boolean;
  draft: ContactDraft;
  onOpenChange: (open: boolean) => void;
  onDraftChange: (draft: ContactDraft) => void;
  onSave: () => void;
}) {
  const canSave = Boolean(draft.name.trim() && draft.email.trim() && draft.designation.trim());
  const inputClass = "mt-1 h-10 w-full rounded-xl border border-[#E1D7CA] bg-white/80 px-3 text-[13px] text-[#25352E] outline-none placeholder:text-[#A69A8B] focus:border-[#25352E]/45";

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-[70] bg-[#1F2722]/28 backdrop-blur-[2px]" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-[80] w-[min(92vw,560px)] -translate-x-1/2 -translate-y-1/2 rounded-3xl border border-[#D8CAB9] bg-[#FFF9EF] p-4 shadow-[0_28px_70px_-32px_rgba(31,39,34,0.56)] focus:outline-none">
          <div className="flex items-start justify-between gap-3">
            <div>
              <Dialog.Title className="text-[20px] font-black tracking-[-0.05em] text-[#1F2722]">Add contact</Dialog.Title>
            </div>
            <button
              type="button"
              onClick={() => onOpenChange(false)}
              className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-[#DED1C1] bg-white/70 text-[#6F6254] hover:text-[#25352E]"
              aria-label="Close add contact"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="mt-4 grid gap-3 md:grid-cols-2">
            <label>
              <FieldLabel>Name</FieldLabel>
              <input className={inputClass} value={draft.name} onChange={(event) => onDraftChange({ ...draft, name: event.target.value })} placeholder="Contact name" />
            </label>
            <label>
              <FieldLabel>Designation</FieldLabel>
              <input className={inputClass} value={draft.designation} onChange={(event) => onDraftChange({ ...draft, designation: event.target.value })} placeholder="Role or title" />
            </label>
            <label>
              <FieldLabel>Email</FieldLabel>
              <input className={inputClass} type="email" value={draft.email} onChange={(event) => onDraftChange({ ...draft, email: event.target.value })} placeholder="name@company.com" />
            </label>
            <label>
              <FieldLabel>Mobile number</FieldLabel>
              <input className={inputClass} value={draft.mobile} onChange={(event) => onDraftChange({ ...draft, mobile: event.target.value })} placeholder="+1 000 000 0000" />
            </label>
            <label>
              <FieldLabel>Location</FieldLabel>
              <input className={inputClass} value={draft.location} onChange={(event) => onDraftChange({ ...draft, location: event.target.value })} placeholder="City, country" />
            </label>
            <label>
              <FieldLabel>Time zone</FieldLabel>
              <input className={inputClass} value={draft.timeZone} onChange={(event) => onDraftChange({ ...draft, timeZone: event.target.value })} placeholder="Pacific Time" />
            </label>
            <label className="md:col-span-2">
              <FieldLabel>Seniority order</FieldLabel>
              <input className={inputClass} type="number" min="1" value={draft.hierarchyRank} onChange={(event) => onDraftChange({ ...draft, hierarchyRank: event.target.value })} placeholder="1 is most senior" />
            </label>
          </div>

          <div className="mt-5 flex justify-end gap-2">
            <button type="button" onClick={() => onOpenChange(false)} className="rounded-full border border-[#D8CAB9] bg-white/70 px-4 py-2 text-[13px] font-bold text-[#6F6254]">
              Cancel
            </button>
            <button type="button" onClick={onSave} disabled={!canSave} className="rounded-full bg-[#25352E] px-4 py-2 text-[13px] font-bold text-[#FFF9EF] disabled:cursor-not-allowed disabled:bg-[#25352E]/35">
              Save
            </button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function AddResourceDialog({
  open,
  draft,
  onOpenChange,
  onDraftChange,
  onSave,
}: {
  open: boolean;
  draft: ResourceDraft;
  onOpenChange: (open: boolean) => void;
  onDraftChange: (draft: ResourceDraft) => void;
  onSave: () => void;
}) {
  const canSave = Boolean(draft.name.trim() && draft.role.trim() && draft.pod.trim());
  const inputClass = "mt-1 h-10 w-full rounded-xl border border-[#E1D7CA] bg-white/80 px-3 text-[13px] text-[#25352E] outline-none placeholder:text-[#A69A8B] focus:border-[#25352E]/45";

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-[70] bg-[#1F2722]/28 backdrop-blur-[2px]" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-[80] w-[min(92vw,540px)] -translate-x-1/2 -translate-y-1/2 rounded-3xl border border-[#D8CAB9] bg-[#FFF9EF] p-4 shadow-[0_28px_70px_-32px_rgba(31,39,34,0.56)] focus:outline-none">
          <div className="flex items-start justify-between gap-3">
            <Dialog.Title className="text-[20px] font-black tracking-[-0.05em] text-[#1F2722]">Add resource</Dialog.Title>
            <button
              type="button"
              onClick={() => onOpenChange(false)}
              className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-[#DED1C1] bg-white/70 text-[#6F6254] hover:text-[#25352E]"
              aria-label="Close add resource"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="mt-4 grid gap-3 md:grid-cols-2">
            <label>
              <FieldLabel>Name</FieldLabel>
              <input className={inputClass} value={draft.name} onChange={(event) => onDraftChange({ ...draft, name: event.target.value })} placeholder="Resource name" />
            </label>
            <label>
              <FieldLabel>Role</FieldLabel>
              <input className={inputClass} value={draft.role} onChange={(event) => onDraftChange({ ...draft, role: event.target.value })} placeholder="Delivery Lead" />
            </label>
            <label>
              <FieldLabel>Pod</FieldLabel>
              <input className={inputClass} value={draft.pod} onChange={(event) => onDraftChange({ ...draft, pod: event.target.value })} placeholder="Payments Modernization" />
            </label>
            <label>
              <FieldLabel>Location</FieldLabel>
              <input className={inputClass} value={draft.location} onChange={(event) => onDraftChange({ ...draft, location: event.target.value })} placeholder="Lahore, Pakistan" />
            </label>
            <label className="md:col-span-2">
              <FieldLabel>Start date</FieldLabel>
              <input className={inputClass} value={draft.startDate} onChange={(event) => onDraftChange({ ...draft, startDate: event.target.value })} placeholder="Jun 2026" />
            </label>
          </div>

          <div className="mt-5 flex justify-end gap-2">
            <button type="button" onClick={() => onOpenChange(false)} className="rounded-full border border-[#D8CAB9] bg-white/70 px-4 py-2 text-[13px] font-bold text-[#6F6254]">
              Cancel
            </button>
            <button type="button" onClick={onSave} disabled={!canSave} className="rounded-full bg-[#25352E] px-4 py-2 text-[13px] font-bold text-[#FFF9EF] disabled:cursor-not-allowed disabled:bg-[#25352E]/35">
              Save
            </button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function AddJourneyItemDialog({
  open,
  draft,
  onOpenChange,
  onDraftChange,
  onSave,
}: {
  open: boolean;
  draft: JourneyItemDraft;
  onOpenChange: (open: boolean) => void;
  onDraftChange: (draft: JourneyItemDraft) => void;
  onSave: () => void;
}) {
  const canSave = Boolean(draft.title.trim() && draft.date && draft.detail.trim());
  const inputClass = "mt-1 h-10 w-full rounded-xl border border-[#E1D7CA] bg-white/80 px-3 text-[13px] text-[#25352E] outline-none placeholder:text-[#A69A8B] focus:border-[#25352E]/45";

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-[70] bg-[#1F2722]/28 backdrop-blur-[2px]" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-[80] w-[min(92vw,520px)] -translate-x-1/2 -translate-y-1/2 rounded-3xl border border-[#D8CAB9] bg-[#FFF9EF] p-4 shadow-[0_28px_70px_-32px_rgba(31,39,34,0.56)] focus:outline-none">
          <div className="flex items-start justify-between gap-3">
            <div>
              <Dialog.Title className="text-[20px] font-black tracking-[-0.05em] text-[#1F2722]">Add journey item</Dialog.Title>
            </div>
            <button
              type="button"
              onClick={() => onOpenChange(false)}
              className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-[#DED1C1] bg-white/70 text-[#6F6254] hover:text-[#25352E]"
              aria-label="Close add journey item"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="mt-4 grid gap-3">
            <label>
              <FieldLabel>Tag</FieldLabel>
              <select className={inputClass} value={draft.type} onChange={(event) => onDraftChange({ ...draft, type: event.target.value as TaskType })}>
                <option value="Meeting">Meeting</option>
                <option value="QBR">QBR</option>
                <option value="To-do">To-do</option>
              </select>
            </label>
            <label>
              <FieldLabel>Title</FieldLabel>
              <input className={inputClass} value={draft.title} onChange={(event) => onDraftChange({ ...draft, title: event.target.value })} placeholder="Journey item title" />
            </label>
            <label>
              <FieldLabel>Due date</FieldLabel>
              <input className={inputClass} type="date" value={draft.date} onChange={(event) => onDraftChange({ ...draft, date: event.target.value })} />
            </label>
            <label>
              <FieldLabel>Details</FieldLabel>
              <textarea
                value={draft.detail}
                onChange={(event) => onDraftChange({ ...draft, detail: event.target.value })}
                placeholder="What needs to happen and why"
                className="mt-1 min-h-24 w-full rounded-xl border border-[#E1D7CA] bg-white/80 px-3 py-2 text-[13px] text-[#25352E] outline-none placeholder:text-[#A69A8B] focus:border-[#25352E]/45"
              />
            </label>
          </div>

          <div className="mt-5 flex justify-end gap-2">
            <button type="button" onClick={() => onOpenChange(false)} className="rounded-full border border-[#D8CAB9] bg-white/70 px-4 py-2 text-[13px] font-bold text-[#6F6254]">
              Cancel
            </button>
            <button type="button" onClick={onSave} disabled={!canSave} className="rounded-full bg-[#25352E] px-4 py-2 text-[13px] font-bold text-[#FFF9EF] disabled:cursor-not-allowed disabled:bg-[#25352E]/35">
              Save
            </button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function QbrBuilderDialog({
  open,
  draft,
  generating,
  onOpenChange,
  onDraftChange,
  onGenerate,
}: {
  open: boolean;
  draft: QbrPromptDraft;
  generating: boolean;
  onOpenChange: (open: boolean) => void;
  onDraftChange: (draft: QbrPromptDraft) => void;
  onGenerate: () => void;
}) {
  const canGenerate = Boolean(draft.audience.trim() && draft.period.trim() && draft.goals.trim());
  const inputClass = "mt-1 h-10 w-full rounded-xl border border-[#E1D7CA] bg-white/80 px-3 text-[13px] text-[#25352E] outline-none placeholder:text-[#A69A8B] focus:border-[#25352E]/45";
  const textareaClass = "mt-1 min-h-20 w-full rounded-xl border border-[#E1D7CA] bg-white/80 px-3 py-2 text-[13px] text-[#25352E] outline-none placeholder:text-[#A69A8B] focus:border-[#25352E]/45";

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-[70] bg-[#1F2722]/28 backdrop-blur-[2px]" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-[80] w-[min(92vw,620px)] -translate-x-1/2 -translate-y-1/2 rounded-3xl border border-[#D8CAB9] bg-[#FFF9EF] p-4 shadow-[0_28px_70px_-32px_rgba(31,39,34,0.56)] focus:outline-none">
          <div className="flex items-start justify-between gap-3">
            <Dialog.Title className="text-[20px] font-black tracking-[-0.05em] text-[#1F2722]">Generate QBR</Dialog.Title>
            <button
              type="button"
              onClick={() => onOpenChange(false)}
              className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-[#DED1C1] bg-white/70 text-[#6F6254] hover:text-[#25352E]"
              aria-label="Close QBR builder"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="mt-4 grid gap-3 md:grid-cols-2">
            <label>
              <FieldLabel>Audience</FieldLabel>
              <input className={inputClass} value={draft.audience} onChange={(event) => onDraftChange({ ...draft, audience: event.target.value })} placeholder="Client leadership, internal execs" />
            </label>
            <label>
              <FieldLabel>QBR period</FieldLabel>
              <input className={inputClass} value={draft.period} onChange={(event) => onDraftChange({ ...draft, period: event.target.value })} placeholder="Q2 2026" />
            </label>
            <label className="md:col-span-2">
              <FieldLabel>Primary goals</FieldLabel>
              <textarea className={textareaClass} value={draft.goals} onChange={(event) => onDraftChange({ ...draft, goals: event.target.value })} placeholder="What this QBR needs to accomplish" />
            </label>
            <label>
              <FieldLabel>Risks to address</FieldLabel>
              <textarea className={textareaClass} value={draft.risks} onChange={(event) => onDraftChange({ ...draft, risks: event.target.value })} placeholder="Known risks, blockers, or escalation themes" />
            </label>
            <label>
              <FieldLabel>Client asks</FieldLabel>
              <textarea className={textareaClass} value={draft.asks} onChange={(event) => onDraftChange({ ...draft, asks: event.target.value })} placeholder="Decisions, approvals, or next steps needed" />
            </label>
          </div>

          <div className="mt-5 flex justify-end gap-2">
            <button type="button" onClick={() => onOpenChange(false)} className="rounded-full border border-[#D8CAB9] bg-white/70 px-4 py-2 text-[13px] font-bold text-[#6F6254]">
              Cancel
            </button>
            <button type="button" onClick={onGenerate} disabled={!canGenerate || generating} className="rounded-full bg-[#25352E] px-4 py-2 text-[13px] font-bold text-[#FFF9EF] disabled:cursor-not-allowed disabled:bg-[#25352E]/35">
              {generating ? "Generating" : "Generate"}
            </button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function UploadDocumentDialog({
  open,
  draft,
  onOpenChange,
  onDraftChange,
  onSave,
}: {
  open: boolean;
  draft: DocumentUploadDraft;
  onOpenChange: (open: boolean) => void;
  onDraftChange: (draft: DocumentUploadDraft) => void;
  onSave: () => void;
}) {
  const selectedType = documentTypes.find((documentType) => documentType.type === draft.type) ?? documentTypes[0];
  const canSave = Boolean(draft.fileName);

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-[70] bg-[#1F2722]/28 backdrop-blur-[2px]" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-[80] w-[min(92vw,560px)] -translate-x-1/2 -translate-y-1/2 rounded-3xl border border-[#D8CAB9] bg-[#FFF9EF] p-4 shadow-[0_28px_70px_-32px_rgba(31,39,34,0.56)] focus:outline-none">
          <div className="flex items-start justify-between gap-3">
            <Dialog.Title className="text-[20px] font-black tracking-[-0.05em] text-[#1F2722]">Upload document</Dialog.Title>
            <button
              type="button"
              onClick={() => onOpenChange(false)}
              className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-[#DED1C1] bg-white/70 text-[#6F6254] hover:text-[#25352E]"
              aria-label="Close upload document"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="mt-4 grid gap-3">
            <label>
              <FieldLabel>Document type</FieldLabel>
              <select
                value={draft.type}
                onChange={(event) => onDraftChange({ ...draft, type: event.target.value })}
                className="mt-1 h-11 w-full rounded-xl border border-[#E1D7CA] bg-white/80 px-3 text-[13px] font-bold text-[#25352E] outline-none focus:border-[#25352E]/45"
              >
                {documentTypes.map((documentType) => (
                  <option key={documentType.type} value={documentType.type}>
                    {documentType.type}
                  </option>
                ))}
              </select>
            </label>

            <label className="rounded-2xl border border-dashed border-[#D8CAB9] bg-white/62 p-4">
              <FieldLabel>File</FieldLabel>
              <input
                type="file"
                accept=".pdf,.docx,.txt"
                className="mt-3 block w-full text-[13px] font-bold text-[#25352E] file:mr-3 file:rounded-full file:border-0 file:bg-[#25352E] file:px-4 file:py-2 file:text-[13px] file:font-bold file:text-[#FFF9EF]"
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  if (!file) return;
                  onDraftChange({ ...draft, fileName: file.name, fileUrl: URL.createObjectURL(file), file });
                }}
              />
              {draft.fileName ? <p className="mt-3 text-[13px] font-black text-[#1F2722]">{draft.fileName}</p> : null}
            </label>

            <div className="grid gap-2 md:grid-cols-2">
              <div className="rounded-2xl border border-[#E5DACD] bg-white/62 p-3">
                <p className="text-[12px] font-bold text-[#7D6E5F]">Extracts</p>
                <p className="mt-1 text-[13px] font-bold text-[#25352E]">{selectedType.extracts}</p>
              </div>
              <div className="rounded-2xl border border-[#E5DACD] bg-white/62 p-3">
                <p className="text-[12px] font-bold text-[#7D6E5F]">Affects</p>
                <p className="mt-1 text-[13px] font-bold text-[#25352E]">{selectedType.affects}</p>
              </div>
            </div>
          </div>

          <div className="mt-5 flex justify-end gap-2">
            <button type="button" onClick={() => onOpenChange(false)} className="rounded-full border border-[#D8CAB9] bg-white/70 px-4 py-2 text-[13px] font-bold text-[#6F6254]">
              Cancel
            </button>
            <button type="button" onClick={onSave} disabled={!canSave} className="rounded-full bg-[#25352E] px-4 py-2 text-[13px] font-bold text-[#FFF9EF] disabled:cursor-not-allowed disabled:bg-[#25352E]/35">
              Save
            </button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function DocumentsTab({ account, onAccountUpdate }: { account: PortfolioAccount; onAccountUpdate: (account: PortfolioAccount) => void }) {
  const { role } = useRole();
  const isDemoAccount = demoAccountIds.has(account.id);
  const accountMetadata = getAccountRuntimeMetadata(account);
  const metadataDocuments = (accountMetadata?.sourceFiles ?? []).map((fileName, index): UploadedAccountDocument => ({
    id: `source-doc-${account.id}-${index}`,
    name: fileName,
    type: "Account source",
    uploadedBy: account.associateOwner || "Associate",
    uploadedAt: "Account setup",
    uploadedAtMs: Date.now() - index,
    status: "Processed",
    affected: "Account profile and KYC",
    url: documentPreviewUrl(fileName, "Account source"),
  }));
  const [uploadedDocuments, setUploadedDocuments] = useState<UploadedAccountDocument[]>(() => isDemoAccount ? seededAccountDocuments : metadataDocuments);
  const [signalProposals, setSignalProposals] = useState<DocumentSignalProposal[]>(() => isDemoAccount ? seededDocumentProposals : []);
  const [uploadOpen, setUploadOpen] = useState(false);
  const [documentUploading, setDocumentUploading] = useState(false);
  const [documentUploadError, setDocumentUploadError] = useState("");
  const [qbrOpen, setQbrOpen] = useState(false);
  const [qbrDraftReady, setQbrDraftReady] = useState(false);
  const [qbrDeckUrl, setQbrDeckUrl] = useState("");
  const [qbrGenerating, setQbrGenerating] = useState(false);
  const [qbrError, setQbrError] = useState("");
  const [proposalResolutionDraft, setProposalResolutionDraft] = useState<ProposalResolutionDraft | null>(null);
  const [uploadDraft, setUploadDraft] = useState<DocumentUploadDraft>({
    type: documentTypes[0].type,
    fileName: "",
    fileUrl: "",
  });
  const [qbrDraft, setQbrDraft] = useState<QbrPromptDraft>({
    audience: "",
    period: "",
    goals: "",
    risks: "",
    asks: "",
  });
  const canApproveDirectly = role === "KAM";
  const canReviewProposals = role === "ASSOCIATE" || role === "KAM";
  const proposalUnderReview = proposalResolutionDraft ? signalProposals.find((proposal) => proposal.id === proposalResolutionDraft.proposalId) : undefined;
  const recentDocuments = [...uploadedDocuments].sort((a, b) => b.uploadedAtMs - a.uploadedAtMs);

  useEffect(() => {
    const nextIsDemoAccount = demoAccountIds.has(account.id);
    const nextMetadata = getAccountRuntimeMetadata(account);
    const nextMetadataDocuments = (nextMetadata?.sourceFiles ?? []).map((fileName, index): UploadedAccountDocument => ({
      id: `source-doc-${account.id}-${index}`,
      name: fileName,
      type: "Account source",
      uploadedBy: account.associateOwner || "Associate",
      uploadedAt: "Account setup",
      uploadedAtMs: Date.now() - index,
      status: "Processed",
      affected: "Account profile and KYC",
      url: documentPreviewUrl(fileName, "Account source"),
    }));
    setUploadedDocuments(nextIsDemoAccount ? seededAccountDocuments : nextMetadataDocuments);
    setSignalProposals(nextIsDemoAccount ? seededDocumentProposals : []);
    setProposalResolutionDraft(null);
    setDocumentUploadError("");
    setQbrDraftReady(false);
    setQbrDeckUrl("");
  }, [account.id]);

  function apiDocumentType(type: string) {
    const normalized = type.toUpperCase().replace(/[^A-Z0-9]+/g, "_");
    if (["CONTRACT", "SOW", "MSA", "NDA", "PROPOSAL", "QBR_DECK", "OTHER"].includes(normalized)) return normalized;
    return "OTHER";
  }

  function impactProposalToDocumentProposal(proposal: Record<string, unknown>, sourceDocument: string, documentId: string): DocumentSignalProposal {
    return {
      id: String(proposal.id ?? `proposal-${Date.now()}`),
      sourceDocument,
      field: String(proposal.field ?? "Document finding"),
      currentValue: String(proposal.currentValue ?? "Current account value"),
      proposedValue: String(proposal.proposedValue ?? ""),
      status: proposal.status === "APPROVED" ? "Approved" : proposal.status === "REJECTED" ? "Denied" : "Needs review",
      kind: proposal.kind as DocumentSignalProposal["kind"],
      kpiKey: proposal.kpiKey ? String(proposal.kpiKey) : undefined,
      confidence: Number(proposal.confidence ?? 0),
      evidence: proposal.evidence ? String(proposal.evidence) : undefined,
      documentId,
    };
  }

  async function refreshAccountFromApi() {
    try {
      const response = await fetch(`/api/accounts/${account.id}`, { headers: { "x-role": role } });
      const payload = await response.json();
      if (response.ok) {
        onAccountUpdate({
          ...account,
          ...mapApiAccountToPortfolioAccount(payload.data as Record<string, unknown>),
          currentWork: account.currentWork,
          relationshipSignal: account.relationshipSignal,
        });
      }
    } catch {
      // The local card remains usable if refresh fails.
    }
  }

  async function saveUploadedDocument() {
    if (!uploadDraft.fileName) return;
    const selectedType = documentTypes.find((documentType) => documentType.type === uploadDraft.type) ?? documentTypes[0];
    setDocumentUploading(true);
    setDocumentUploadError("");
    if (uploadDraft.file && !account.id.startsWith("v2-acct-")) {
      try {
        const formData = new FormData();
        formData.append("file", uploadDraft.file);
        formData.append("accountId", account.id);
        formData.append("type", apiDocumentType(uploadDraft.type));
        const uploadResponse = await fetch("/api/documents/upload", {
          method: "POST",
          headers: { "x-role": role },
          body: formData,
        });
        const uploadPayload = await uploadResponse.json();
        if (!uploadResponse.ok) throw new Error(uploadPayload.error || "Document upload failed");
        const uploaded = uploadPayload.data as Record<string, unknown>;
        const documentId = String(uploaded.id);
        let proposals: DocumentSignalProposal[] = [];
        try {
          const analysisResponse = await fetch(`/api/documents/${documentId}/analyze-impact`, {
            method: "POST",
            headers: { "x-role": role },
          });
          const analysisPayload = await analysisResponse.json();
          if (analysisResponse.ok && Array.isArray(analysisPayload.data?.proposals)) {
            proposals = (analysisPayload.data.proposals as Array<Record<string, unknown>>).map((proposal) =>
              impactProposalToDocumentProposal(proposal, uploadDraft.fileName, documentId),
            );
          }
        } catch {
          proposals = [];
        }
        setUploadedDocuments((documents) => [
          {
            id: documentId,
            name: uploadDraft.fileName,
            type: uploadDraft.type,
            uploadedBy: "Current user",
            uploadedAt: "Today",
            uploadedAtMs: Date.now(),
            status: proposals.length > 0 ? "Pending review" : "Processed",
            affected: selectedType.affects,
            url: String((uploaded.fileUrl ?? uploadDraft.fileUrl) || documentPreviewUrl(uploadDraft.fileName, uploadDraft.type)),
          },
          ...documents,
        ]);
        setSignalProposals((items) => [
          ...(proposals.length > 0 ? proposals : [{
            id: `proposal-${Date.now()}`,
            sourceDocument: uploadDraft.fileName,
            field: "Document analysis",
            currentValue: "No reviewed finding",
            proposedValue: "Document uploaded. No score/profile changes were suggested automatically.",
            status: "Needs review" as const,
            documentId,
            kind: "kyc" as const,
          }]),
          ...items,
        ]);
        setUploadDraft({
          type: documentTypes[0].type,
          fileName: "",
          fileUrl: "",
          file: undefined,
        });
        setUploadOpen(false);
        return;
      } catch (error) {
        setDocumentUploadError(error instanceof Error ? error.message : "Document upload failed");
      } finally {
        setDocumentUploading(false);
      }
      return;
    }

    setUploadedDocuments((documents) => [
      {
        id: `uploaded-${Date.now()}`,
        name: uploadDraft.fileName,
        type: uploadDraft.type,
        uploadedBy: "Current user",
        uploadedAt: "Today",
        uploadedAtMs: Date.now(),
        status: "Pending review",
        affected: selectedType.affects,
        url: uploadDraft.fileUrl || documentPreviewUrl(uploadDraft.fileName, uploadDraft.type),
      },
      ...documents,
    ]);
    setSignalProposals((proposals) => [
      {
        id: `proposal-${Date.now()}`,
        sourceDocument: uploadDraft.fileName,
        field: "Account update",
        currentValue: "Existing account values",
        proposedValue: "Parsed values pending review",
        status: "Needs review",
      },
      ...proposals,
    ]);
    setUploadDraft({
      type: documentTypes[0].type,
      fileName: "",
      fileUrl: "",
      file: undefined,
    });
    setUploadOpen(false);
    setDocumentUploading(false);
  }

  function startProposalResolution(proposalId: string, action: ProposalResolutionAction) {
    setProposalResolutionDraft({ proposalId, action, reason: "" });
  }

  async function confirmProposalResolution() {
    const reason = proposalResolutionDraft?.reason.trim();
    if (!proposalResolutionDraft || !reason) return;
    const decidedAt = "Today";
    const currentProposal = signalProposals.find((proposal) => proposal.id === proposalResolutionDraft.proposalId);
    if (currentProposal?.documentId) {
      try {
        const response = await fetch(`/api/documents/${currentProposal.documentId}/analyze-impact`, {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
            "x-role": role,
          },
          body: JSON.stringify({
            action: proposalResolutionDraft.action === "approve" ? "APPROVE" : "REJECT",
            proposalId: currentProposal.id,
            reason,
          }),
        });
        const payload = await response.json();
        if (!response.ok) throw new Error(payload.error || "Document proposal review failed");
        if (payload.data?.profileUpdated || payload.data?.scoreRecomputed) {
          void refreshAccountFromApi();
        }
      } catch (error) {
        setDocumentUploadError(error instanceof Error ? error.message : "Document proposal review failed");
        return;
      }
    }
    setSignalProposals((proposals) =>
      proposals.map((proposal) => {
        if (proposal.id !== proposalResolutionDraft.proposalId) return proposal;
        const status = proposalResolutionDraft.action === "deny" ? "Denied" : canApproveDirectly ? "Approved" : "Routed to KAM";
        return {
          ...proposal,
          status,
          associateReason: role === "ASSOCIATE" ? reason : proposal.associateReason,
          kamReason: role === "KAM" ? reason : proposal.kamReason,
          latestReason: reason,
          latestDecisionBy: role,
          latestDecisionAt: decidedAt,
        };
      }),
    );
    setProposalResolutionDraft(null);
  }

  async function generateQbr() {
    if (!qbrDraft.audience.trim() || !qbrDraft.period.trim() || !qbrDraft.goals.trim()) return;
    setQbrGenerating(true);
    setQbrError("");
    try {
      const response = await fetch("/api/qbr/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          account: {
            name: account.name,
            healthScore: account.healthScore,
            arr: money(account.arr),
            renewalDate: renewalDate(account.renewalDays),
            industry: account.industry,
            location: `${account.country} · ${account.region}`,
            owner: account.associateOwner,
          },
          prompt: qbrDraft,
          documents: recentDocuments.map((document) => ({
            name: document.name,
            type: document.type,
            affected: document.affected,
            status: documentReviewStatus(signalProposals.filter((proposal) => proposal.sourceDocument === document.name)),
          })),
          proposals: signalProposals.map((proposal) => ({
            sourceDocument: proposal.sourceDocument,
            field: proposal.field,
            currentValue: proposal.currentValue,
            proposedValue: proposal.proposedValue,
            status: proposal.status,
            associateReason: proposal.associateReason,
            kamReason: proposal.kamReason,
            latestReason: proposal.latestReason,
          })),
        }),
      });

      if (!response.ok) {
        const errorBody = await response.json().catch(() => ({}));
        throw new Error(errorBody.error || "QBR generation failed");
      }

      const blob = await response.blob();
      if (qbrDeckUrl) URL.revokeObjectURL(qbrDeckUrl);
      setQbrDeckUrl(URL.createObjectURL(blob));
      setQbrDraftReady(true);
      setQbrOpen(false);
    } catch (error) {
      setQbrError(error instanceof Error ? error.message : "QBR generation failed");
    } finally {
      setQbrGenerating(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-end gap-2">
        <button type="button" onClick={() => setUploadOpen(true)} disabled={documentUploading} className="rounded-full border border-[#D8CAB9] bg-white/70 px-4 py-2 text-[13px] font-bold text-[#25352E] disabled:opacity-60">
          {documentUploading ? "Uploading..." : "Upload"}
        </button>
        <button type="button" onClick={() => setQbrOpen(true)} className="rounded-full bg-[#25352E] px-4 py-2 text-[13px] font-bold text-[#FFF9EF]">
          Generate QBR
        </button>
      </div>
      <section className="rounded-3xl border border-[#E5DACD] bg-white/58 p-4">
        {recentDocuments.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-[#D8CAB9] bg-[#FFF9EF]/70 p-4 text-[13px] font-bold text-[#7D6E5F]">
            No account documents have been uploaded yet.
          </div>
        ) : (
          <div className="grid gap-2">
            {recentDocuments.map((document) => {
            const documentProposals = signalProposals.filter((proposal) => proposal.sourceDocument === document.name);
            const reviewStatus = documentReviewStatus(documentProposals);

            return (
              <article key={document.id} className="grid gap-3 rounded-2xl border border-[#E5DACD] bg-[#FFF9EF]/72 p-3 lg:grid-cols-[0.9fr_1.1fr]">
                <div>
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <button type="button" onClick={() => openExternalTab(document.url)} className="text-left text-[14px] font-black text-[#1F2722] underline decoration-[#C9BBA9] underline-offset-4">
                      {document.name}
                    </button>
                    <span className="rounded-full border border-[#D8CAB9] bg-white/70 px-2.5 py-1 text-[11px] font-bold text-[#6F6254]">{reviewStatus}</span>
                  </div>
                  <p className="mt-1 text-[12px] font-bold text-[#7D6E5F]">{document.type}</p>
                  <div className="mt-3 grid gap-2 text-[12px] font-bold text-[#6F6254] sm:grid-cols-3">
                    <span>{document.uploadedAt}</span>
                    <span>{document.uploadedBy}</span>
                    <span>{document.affected}</span>
                  </div>
                </div>
                <div className="grid gap-2">
                  {documentProposals.map((proposal) => (
                    <div key={proposal.id} className="rounded-2xl border border-[#E5DACD] bg-white/62 p-3">
                      <div className="grid gap-3 md:grid-cols-[0.8fr_1fr_1fr]">
                        <div>
                          <p className="text-[12px] font-bold text-[#7D6E5F]">{proposal.field}</p>
                          <span className="mt-2 inline-flex rounded-full border border-[#D8CAB9] bg-white/70 px-2.5 py-1 text-[11px] font-bold text-[#6F6254]">{proposal.status}</span>
                          {role === "KAM" && proposal.associateReason ? (
                            <div className="mt-2 rounded-xl border border-[#E1D7CA] bg-[#FFF9EF]/80 p-2">
                              <p className="text-[11px] font-bold text-[#7D6E5F]">Associate reason</p>
                              <p className="mt-1 text-[12px] font-bold text-[#25352E]">{proposal.associateReason}</p>
                            </div>
                          ) : null}
                          {proposal.latestReason && !(role === "KAM" && proposal.status === "Routed to KAM" && proposal.associateReason) ? (
                            <div className="mt-2 rounded-xl border border-[#E1D7CA] bg-[#FFF9EF]/80 p-2">
                              <p className="text-[11px] font-bold text-[#7D6E5F]">Logged reason</p>
                              <p className="mt-1 text-[12px] font-bold text-[#25352E]">{proposal.latestReason}</p>
                            </div>
                          ) : null}
                        </div>
                        <div>
                          <p className="text-[12px] font-bold text-[#7D6E5F]">Current</p>
                          <p className="mt-1 text-[13px] font-bold text-[#25352E]">{proposal.currentValue}</p>
                        </div>
                        <div>
                          <p className="text-[12px] font-bold text-[#7D6E5F]">Proposed</p>
                          <p className="mt-1 text-[13px] font-bold text-[#25352E]">{proposal.proposedValue}</p>
                        </div>
                      </div>
                      {canReviewProposals && (proposal.status === "Needs review" || (role === "KAM" && proposal.status === "Routed to KAM")) ? (
                        <div className="mt-3 flex flex-wrap gap-2">
                          <button type="button" onClick={() => startProposalResolution(proposal.id, "approve")} className="rounded-full bg-[#25352E] px-3 py-1.5 text-[12px] font-bold text-[#FFF9EF]">
                            {canApproveDirectly ? "Approve" : "Route to KAM"}
                          </button>
                          <button type="button" onClick={() => startProposalResolution(proposal.id, "deny")} className="rounded-full border border-[#D8CAB9] bg-white/70 px-3 py-1.5 text-[12px] font-bold text-[#6F6254]">
                            Deny
                          </button>
                        </div>
                      ) : null}
                    </div>
                  ))}
                </div>
              </article>
            );
            })}
          </div>
        )}
      </section>

      {qbrDraftReady ? (
        <section className="rounded-3xl border border-[#D8CAB9] bg-[#FFF9EF]/72 p-4">
          <h3 className="text-[18px] font-black tracking-[-0.04em] text-[#1F2722]">Generated QBR deck</h3>
          <div className="mt-3 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-[#E5DACD] bg-white/64 p-3">
            <p className="text-[14px] font-black text-[#1F2722]">{account.name} QBR deck</p>
            <button type="button" onClick={() => openExternalTab(qbrDeckUrl)} className="rounded-full bg-[#25352E] px-3 py-1.5 text-[12px] font-bold text-[#FFF9EF]">
              Open deck
            </button>
          </div>
        </section>
      ) : null}

      {qbrError ? (
        <div className="rounded-2xl border border-[#E8B8B0] bg-[#FFF0ED] p-3 text-[13px] font-bold text-[#B33D32]">
          {qbrError}
        </div>
      ) : null}
      {documentUploadError ? (
        <div className="rounded-2xl border border-[#E8B8B0] bg-[#FFF0ED] p-3 text-[13px] font-bold text-[#B33D32]">
          {documentUploadError}
        </div>
      ) : null}

      <QbrBuilderDialog open={qbrOpen} draft={qbrDraft} onOpenChange={setQbrOpen} onDraftChange={setQbrDraft} onGenerate={generateQbr} generating={qbrGenerating} />
      <UploadDocumentDialog open={uploadOpen} draft={uploadDraft} onOpenChange={setUploadOpen} onDraftChange={setUploadDraft} onSave={saveUploadedDocument} />
      <ProposalResolutionForm
        open={Boolean(proposalResolutionDraft)}
        action={proposalResolutionDraft?.action ?? "approve"}
        reason={proposalResolutionDraft?.reason ?? ""}
        proposal={proposalUnderReview}
        role={role}
        onOpenChange={(nextOpen) => {
          if (!nextOpen) setProposalResolutionDraft(null);
        }}
        onReasonChange={(reason) => setProposalResolutionDraft((draft) => (draft ? { ...draft, reason } : draft))}
        onConfirm={confirmProposalResolution}
        onCancel={() => setProposalResolutionDraft(null)}
      />
    </div>
  );
}

function ProfileTab({
  account,
  activeTasks,
  onAccountUpdate,
  onResolveQueuedTask,
}: {
  account: PortfolioAccount;
  activeTasks: ActiveTask[];
  onAccountUpdate: (account: PortfolioAccount) => void;
  onResolveQueuedTask: (taskId: string) => void;
}) {
  const { role } = useRole();
  const canEditProfile = role !== "EXECUTIVE";
  const isDemoAccount = demoAccountIds.has(account.id);
  const accountMetadata = getAccountRuntimeMetadata(account);
  const primaryContactName = accountMetadata?.primaryContact || account.contactName;
  const accountDerivedContacts: AccountContact[] = !isDemoAccount && primaryContactName && primaryContactName !== "Primary contact not set"
    ? [{
        id: `derived-contact-${account.id}`,
        name: primaryContactName,
        designation: "Primary contact",
        location: account.country && account.country !== "Country not set" ? account.country : "Location not set",
        timeZone: "Time zone not set",
        email: "Email not set",
        mobile: "Mobile not set",
        hierarchyRank: 1,
      }]
    : [];
  const baseContacts = isDemoAccount ? accountContacts : accountDerivedContacts;
  const baseResources = isDemoAccount ? tkxelResources : [];
  const metadataJourneyItems: JourneyItem[] = (accountMetadata?.journey ?? []).map((item) => ({
    id: `metadata-${item.id}`,
    title: item.title,
    type: item.type,
    date: item.dueDate,
    detail: item.recurrence,
  }));
  const baseUpcomingJourneyItems = isDemoAccount ? upcomingJourneyItems : metadataJourneyItems;
  const baseCompletedJourneyItems = isDemoAccount ? completedJourneyItems : [];
  const [profileEditing, setProfileEditing] = useState(false);
  const [profileSaving, setProfileSaving] = useState(false);
  const [profileError, setProfileError] = useState("");
  const [profileDraft, setProfileDraft] = useState<AccountProfileDraft>(() => ({
    name: account.name,
    industry: account.industry,
    segment: account.segment ?? account.deliveryModel,
    arr: String(account.arr),
    website: "",
    country: account.country,
    region: account.region,
    kamOwner: account.kamOwner,
    associateOwner: account.associateOwner,
    contractEnd: new Date(Date.now() + account.renewalDays * 24 * 60 * 60 * 1000).toISOString().slice(0, 10),
  }));
  const [journeyResolutionDraft, setJourneyResolutionDraft] = useState<TaskResolutionDraft | null>(null);
  const [resolvedJourneyItems, setResolvedJourneyItems] = useState<Record<string, { action: TaskResolutionAction; reason: string }>>({});
  const [customContacts, setCustomContacts] = useState<AccountContact[]>([]);
  const [customResources, setCustomResources] = useState<TkxelResource[]>([]);
  const [customJourneyItems, setCustomJourneyItems] = useState<JourneyItem[]>([]);
  const [deletedContactIds, setDeletedContactIds] = useState<Set<string>>(() => new Set());
  const [deletedResourceIds, setDeletedResourceIds] = useState<Set<string>>(() => new Set());
  const [contactDeletionRequests, setContactDeletionRequests] = useState<Set<string>>(() => new Set());
  const [resourceDeletionRequests, setResourceDeletionRequests] = useState<Set<string>>(() => new Set());
  const [contactDialogOpen, setContactDialogOpen] = useState(false);
  const [resourceDialogOpen, setResourceDialogOpen] = useState(false);
  const [journeyDialogOpen, setJourneyDialogOpen] = useState(false);
  const [contactDraft, setContactDraft] = useState<ContactDraft>({
    name: "",
    email: "",
    mobile: "",
    designation: "",
    location: "",
    timeZone: "",
    hierarchyRank: "",
  });
  const [resourceDraft, setResourceDraft] = useState<ResourceDraft>({
    name: "",
    role: "",
    pod: "",
    location: "",
    startDate: "",
  });
  const [journeyDraft, setJourneyDraft] = useState<JourneyItemDraft>({
    type: "To-do",
    title: "",
    date: "",
    detail: "",
  });
  const sortedContacts = [...baseContacts, ...customContacts]
    .filter((contact) => !deletedContactIds.has(contact.id))
    .sort((a, b) => a.hierarchyRank - b.hierarchyRank);
  const visibleResources = [...baseResources, ...customResources].filter((resource) => !deletedResourceIds.has(resource.id));
  const queuedJourneyItems: JourneyItem[] = activeTasks.map((task) => ({
    id: task.id,
    title: task.task,
    type: task.type,
    date: task.dueDate,
    detail: `Queued from ${task.kpiName}.`,
  }));
  const visibleUpcomingItems = [...baseUpcomingJourneyItems, ...customJourneyItems, ...queuedJourneyItems]
    .filter((item) => resolvedJourneyItems[item.id]?.action !== "Dismiss")
    .sort((a, b) => journeyDateSortValue(a.date) - journeyDateSortValue(b.date));
  const visibleCompletedItems = [
    ...Object.entries(resolvedJourneyItems)
      .filter(([, resolution]) => resolution.action === "Done")
      .map(([itemId, resolution]) => {
        const item = [...baseUpcomingJourneyItems, ...customJourneyItems, ...queuedJourneyItems].find((candidate) => candidate.id === itemId);
        return item
          ? {
              id: `${item.id}-done`,
              title: item.title,
              type: item.type,
              date: "Done",
              detail: resolution.reason,
            }
          : null;
      })
      .filter((item): item is JourneyItem => Boolean(item)),
    ...baseCompletedJourneyItems,
  ];
  const resolutionItem = journeyResolutionDraft
    ? [...baseUpcomingJourneyItems, ...customJourneyItems, ...queuedJourneyItems].find((item) => item.id === journeyResolutionDraft.taskId)
    : undefined;

  useEffect(() => {
    setProfileDraft({
      name: account.name,
      industry: account.industry,
      segment: account.segment ?? account.deliveryModel,
      arr: String(account.arr),
      website: "",
      country: account.country,
      region: account.region,
      kamOwner: account.kamOwner,
      associateOwner: account.associateOwner,
      contractEnd: new Date(Date.now() + account.renewalDays * 24 * 60 * 60 * 1000).toISOString().slice(0, 10),
    });
    setProfileEditing(false);
    setProfileError("");
    setCustomContacts([]);
    setCustomResources([]);
    setCustomJourneyItems([]);
    setDeletedContactIds(new Set());
    setDeletedResourceIds(new Set());
    setContactDeletionRequests(new Set());
    setResourceDeletionRequests(new Set());
    setResolvedJourneyItems({});
    setJourneyResolutionDraft(null);
  }, [account]);

  function updateProfileDraft(field: keyof AccountProfileDraft, value: string) {
    setProfileDraft((draft) => ({ ...draft, [field]: value }));
  }

  async function saveProfile() {
    if (!profileDraft.name.trim()) return;
    setProfileSaving(true);
    setProfileError("");
    try {
      const localUpdatedAccount: PortfolioAccount = {
        ...account,
        name: profileDraft.name.trim(),
        industry: profileDraft.industry.trim() || "Industry not set",
        segment: profileDraft.segment.trim() || undefined,
        deliveryModel: profileDraft.segment.trim() || account.deliveryModel,
        arr: parseArrValue(profileDraft.arr),
        country: profileDraft.country.trim() || "Country not set",
        region: profileDraft.region.trim() || "Region not set",
        renewalDays: daysUntil(profileDraft.contractEnd),
        kamOwner: profileDraft.kamOwner.trim() || account.kamOwner,
        associateOwner: profileDraft.associateOwner.trim() || account.associateOwner,
      };

      if (account.id.startsWith("v2-acct-")) {
        onAccountUpdate(localUpdatedAccount);
        setProfileEditing(false);
        return;
      }

      const response = await fetch(`/api/accounts/${account.id}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          "x-role": role,
        },
        body: JSON.stringify({
          name: profileDraft.name.trim(),
          industry: profileDraft.industry.trim(),
          segment: profileDraft.segment.trim(),
          arr: parseArrValue(profileDraft.arr),
          website: profileDraft.website.trim() || undefined,
          country: profileDraft.country.trim(),
          region: profileDraft.region.trim(),
          kamOwnerName: profileDraft.kamOwner.trim() || undefined,
          contractEnd: profileDraft.contractEnd || undefined,
        }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Profile update failed");
      upsertCachedApiAccount(role, payload.data as CachedApiAccount);
      const updated = mapApiAccountToPortfolioAccount(payload.data as Record<string, unknown>);
      onAccountUpdate({
        ...localUpdatedAccount,
        ...updated,
        kamOwner: localUpdatedAccount.kamOwner,
        associateOwner: localUpdatedAccount.associateOwner,
        currentWork: localUpdatedAccount.currentWork,
        relationshipSignal: localUpdatedAccount.relationshipSignal,
      });
      setProfileEditing(false);
    } catch (error) {
      setProfileError(error instanceof Error ? error.message : "Profile update failed");
    } finally {
      setProfileSaving(false);
    }
  }

  async function uploadAccountIcon(file: File) {
    setProfileSaving(true);
    setProfileError("");
    try {
      const formData = new FormData();
      formData.append("file", file);
      const response = await fetch(`/api/accounts/${account.id}/icon`, {
        method: "POST",
        headers: { "x-role": role },
        body: formData,
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Icon upload failed");
      onAccountUpdate({ ...account, logoUrl: payload.data?.logoUrl ?? account.logoUrl });
    } catch (error) {
      setProfileError(error instanceof Error ? error.message : "Icon upload failed");
    } finally {
      setProfileSaving(false);
    }
  }

  function startJourneyResolution(itemId: string, action: TaskResolutionAction) {
    setJourneyResolutionDraft({ taskId: itemId, action, reason: "" });
  }

  function confirmJourneyResolution() {
    const reason = journeyResolutionDraft?.reason.trim();
    if (!journeyResolutionDraft || !reason) return;
    setResolvedJourneyItems((items) => ({
      ...items,
      [journeyResolutionDraft.taskId]: {
        action: journeyResolutionDraft.action,
        reason,
      },
    }));
    if (activeTasks.some((task) => task.id === journeyResolutionDraft.taskId)) {
      onResolveQueuedTask(journeyResolutionDraft.taskId);
    }
    setJourneyResolutionDraft(null);
  }

  function saveContact() {
    if (!contactDraft.name.trim() || !contactDraft.email.trim() || !contactDraft.designation.trim()) return;
    setCustomContacts((contacts) => [
      ...contacts,
      {
        id: `custom-contact-${Date.now()}`,
        name: contactDraft.name.trim(),
        designation: contactDraft.designation.trim(),
        location: contactDraft.location.trim() || "Location not set",
        timeZone: contactDraft.timeZone.trim() || "Time zone not set",
        email: contactDraft.email.trim(),
        mobile: contactDraft.mobile.trim() || "Mobile not set",
        hierarchyRank: Number(contactDraft.hierarchyRank) || baseContacts.length + contacts.length + 1,
      },
    ]);
    setContactDraft({
      name: "",
      email: "",
      mobile: "",
      designation: "",
      location: "",
      timeZone: "",
      hierarchyRank: "",
    });
    setContactDialogOpen(false);
  }

  function saveResource() {
    if (!resourceDraft.name.trim() || !resourceDraft.role.trim() || !resourceDraft.pod.trim()) return;
    setCustomResources((resources) => [
      ...resources,
      {
        id: `custom-resource-${Date.now()}`,
        name: resourceDraft.name.trim(),
        role: resourceDraft.role.trim(),
        pod: resourceDraft.pod.trim(),
        location: resourceDraft.location.trim() || "Location not set",
        startDate: resourceDraft.startDate.trim() || "Start date not set",
      },
    ]);
    setResourceDraft({
      name: "",
      role: "",
      pod: "",
      location: "",
      startDate: "",
    });
    setResourceDialogOpen(false);
  }

  function handleContactDelete(contactId: string) {
    if (role === "KAM") {
      setDeletedContactIds((ids) => new Set(ids).add(contactId));
      setContactDeletionRequests((requests) => {
        const next = new Set(requests);
        next.delete(contactId);
        return next;
      });
      return;
    }
    setContactDeletionRequests((requests) => new Set(requests).add(contactId));
  }

  function handleResourceDelete(resourceId: string) {
    if (role === "KAM") {
      setDeletedResourceIds((ids) => new Set(ids).add(resourceId));
      setResourceDeletionRequests((requests) => {
        const next = new Set(requests);
        next.delete(resourceId);
        return next;
      });
      return;
    }
    setResourceDeletionRequests((requests) => new Set(requests).add(resourceId));
  }

  function saveJourneyItem() {
    if (!journeyDraft.title.trim() || !journeyDraft.date || !journeyDraft.detail.trim()) return;
    setCustomJourneyItems((items) => [
      ...items,
      {
        id: `custom-journey-${Date.now()}`,
        title: journeyDraft.title.trim(),
        type: journeyDraft.type,
        date: displayDateFromInput(journeyDraft.date),
        detail: journeyDraft.detail.trim(),
      },
    ]);
    setJourneyDraft({
      type: "To-do",
      title: "",
      date: "",
      detail: "",
    });
    setJourneyDialogOpen(false);
  }

  return (
    <div className="space-y-4">
      <section className="rounded-3xl border border-[#E5DACD] bg-white/58 p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h3 className="truncate text-[18px] font-black tracking-[-0.04em] text-[#1F2722]">Profile details</h3>
            <p className="mt-1 text-[12px] font-bold text-[#7D6E5F]">{account.industry} - {account.segment ?? account.deliveryModel}</p>
          </div>
          {canEditProfile ? (
            <div className="flex flex-wrap gap-2">
              <label className="inline-flex cursor-pointer items-center gap-2 rounded-full border border-[#D8CAB9] bg-white/70 px-3 py-1.5 text-[12px] font-bold text-[#25352E]">
                <Pencil className="h-3.5 w-3.5" />
                Icon
                <input
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  className="sr-only"
                  disabled={profileSaving}
                  onChange={(event) => {
                    const file = event.target.files?.[0];
                    if (file) void uploadAccountIcon(file);
                    event.currentTarget.value = "";
                  }}
                />
              </label>
              <button
                type="button"
                onClick={() => setProfileEditing((editing) => !editing)}
                className="inline-flex items-center gap-2 rounded-full bg-[#25352E] px-3 py-1.5 text-[12px] font-bold text-[#FFF9EF]"
              >
                <Pencil className="h-3.5 w-3.5" />
                {profileEditing ? "Close" : "Edit profile"}
              </button>
            </div>
          ) : null}
        </div>

        {profileEditing ? (
          <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            <label>
              <FieldLabel>Account name</FieldLabel>
              <input value={profileDraft.name} onChange={(event) => updateProfileDraft("name", event.target.value)} className="mt-1 h-11 w-full rounded-xl border border-[#E1D7CA] bg-white/80 px-3 text-[13px] font-bold text-[#25352E] outline-none" />
            </label>
            <label>
              <FieldLabel>Industry</FieldLabel>
              <input value={profileDraft.industry} onChange={(event) => updateProfileDraft("industry", event.target.value)} className="mt-1 h-11 w-full rounded-xl border border-[#E1D7CA] bg-white/80 px-3 text-[13px] font-bold text-[#25352E] outline-none" />
            </label>
            <label>
              <FieldLabel>Segment</FieldLabel>
              <input value={profileDraft.segment} onChange={(event) => updateProfileDraft("segment", event.target.value)} className="mt-1 h-11 w-full rounded-xl border border-[#E1D7CA] bg-white/80 px-3 text-[13px] font-bold text-[#25352E] outline-none" />
            </label>
            <label>
              <FieldLabel>ARR</FieldLabel>
              <input value={profileDraft.arr} onChange={(event) => updateProfileDraft("arr", event.target.value)} className="mt-1 h-11 w-full rounded-xl border border-[#E1D7CA] bg-white/80 px-3 text-[13px] font-bold text-[#25352E] outline-none" />
            </label>
            <label>
              <FieldLabel>Website</FieldLabel>
              <input value={profileDraft.website} onChange={(event) => updateProfileDraft("website", event.target.value)} className="mt-1 h-11 w-full rounded-xl border border-[#E1D7CA] bg-white/80 px-3 text-[13px] font-bold text-[#25352E] outline-none" />
            </label>
            <label>
              <FieldLabel>Country</FieldLabel>
              <input value={profileDraft.country} onChange={(event) => updateProfileDraft("country", event.target.value)} className="mt-1 h-11 w-full rounded-xl border border-[#E1D7CA] bg-white/80 px-3 text-[13px] font-bold text-[#25352E] outline-none" />
            </label>
            <label>
              <FieldLabel>Region</FieldLabel>
              <input value={profileDraft.region} onChange={(event) => updateProfileDraft("region", event.target.value)} className="mt-1 h-11 w-full rounded-xl border border-[#E1D7CA] bg-white/80 px-3 text-[13px] font-bold text-[#25352E] outline-none" />
            </label>
            <label>
              <FieldLabel>KAM owner</FieldLabel>
              <input value={profileDraft.kamOwner} onChange={(event) => updateProfileDraft("kamOwner", event.target.value)} className="mt-1 h-11 w-full rounded-xl border border-[#E1D7CA] bg-white/80 px-3 text-[13px] font-bold text-[#25352E] outline-none" />
            </label>
            <label>
              <FieldLabel>Associate owner</FieldLabel>
              <input value={profileDraft.associateOwner} onChange={(event) => updateProfileDraft("associateOwner", event.target.value)} className="mt-1 h-11 w-full rounded-xl border border-[#E1D7CA] bg-white/80 px-3 text-[13px] font-bold text-[#25352E] outline-none" />
            </label>
            <label>
              <FieldLabel>Contract end</FieldLabel>
              <input type="date" value={profileDraft.contractEnd} onChange={(event) => updateProfileDraft("contractEnd", event.target.value)} className="mt-1 h-11 w-full rounded-xl border border-[#E1D7CA] bg-white/80 px-3 text-[13px] font-bold text-[#25352E] outline-none" />
            </label>
            <div className="md:col-span-2 xl:col-span-4 flex flex-wrap items-center justify-end gap-2">
              {profileError ? <p className="mr-auto text-[12px] font-bold text-[#B33D32]">{profileError}</p> : null}
              <button type="button" onClick={() => setProfileEditing(false)} className="rounded-full border border-[#D8CAB9] bg-white/70 px-4 py-2 text-[13px] font-bold text-[#6F6254]">
                Cancel
              </button>
              <button type="button" onClick={saveProfile} disabled={profileSaving} className="rounded-full bg-[#25352E] px-4 py-2 text-[13px] font-bold text-[#FFF9EF] disabled:bg-[#25352E]/35">
                {profileSaving ? "Saving..." : "Save profile"}
              </button>
            </div>
          </div>
        ) : (
          <div className="mt-4 grid gap-2 md:grid-cols-4">
            <SummaryItem label="Segment" value={account.segment ?? account.deliveryModel} />
            <SummaryItem label="ARR" value={money(account.arr)} />
            <SummaryItem label="Location" value={`${account.country} - ${account.region}`} />
            <SummaryItem label="KAM owner" value={account.kamOwner} />
          </div>
        )}
      </section>

      <section className="rounded-3xl border border-[#E5DACD] bg-white/58 p-4">
        <div className="flex items-center justify-between gap-3">
          <h3 className="text-[18px] font-black tracking-[-0.04em] text-[#1F2722]">Contacts</h3>
          <button
            type="button"
            onClick={() => setContactDialogOpen(true)}
            className="inline-flex items-center gap-2 rounded-full bg-[#25352E] px-3 py-1.5 text-[12px] font-bold text-[#FFF9EF] shadow-[0_12px_22px_-18px_rgba(31,39,34,0.7)]"
          >
            <Plus className="h-3.5 w-3.5" />
            Add contact
          </button>
        </div>
        <div className="mt-3 grid gap-3 md:grid-cols-2">
          {sortedContacts.map((contact) => (
            <ContactCard key={contact.id} contact={contact} deletionRequested={contactDeletionRequests.has(contact.id)} role={role} onDelete={handleContactDelete} />
          ))}
          {sortedContacts.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-[#D8CAB9] bg-[#FFF9EF]/70 p-4 text-[13px] font-bold text-[#7D6E5F] md:col-span-2">
              No contacts identified yet. Add contacts or upload account documents for review.
            </div>
          ) : null}
        </div>
      </section>

      <section className="rounded-3xl border border-[#E5DACD] bg-white/58 p-4">
        <div className="flex items-center justify-between gap-3">
          <h3 className="text-[18px] font-black tracking-[-0.04em] text-[#1F2722]">Tkxel resources</h3>
          <button
            type="button"
            onClick={() => setResourceDialogOpen(true)}
            className="inline-flex items-center gap-2 rounded-full bg-[#25352E] px-3 py-1.5 text-[12px] font-bold text-[#FFF9EF] shadow-[0_12px_22px_-18px_rgba(31,39,34,0.7)]"
          >
            <Plus className="h-3.5 w-3.5" />
            Add resource
          </button>
        </div>
        <div className="mt-3 grid gap-3 md:grid-cols-2">
          {visibleResources.map((resource) => (
            <TkxelResourceCard key={resource.id} resource={resource} deletionRequested={resourceDeletionRequests.has(resource.id)} role={role} onDelete={handleResourceDelete} />
          ))}
          {visibleResources.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-[#D8CAB9] bg-[#FFF9EF]/70 p-4 text-[13px] font-bold text-[#7D6E5F] md:col-span-2">
              No Tkxel resources assigned yet.
            </div>
          ) : null}
        </div>
      </section>

      <section className="rounded-3xl border border-[#E5DACD] bg-white/58 p-4">
        <div className="flex items-center justify-between gap-3">
          <h3 className="text-[18px] font-black tracking-[-0.04em] text-[#1F2722]">Account journey</h3>
          <button
            type="button"
            onClick={() => setJourneyDialogOpen(true)}
            className="inline-flex items-center gap-2 rounded-full bg-[#25352E] px-3 py-1.5 text-[12px] font-bold text-[#FFF9EF] shadow-[0_12px_22px_-18px_rgba(31,39,34,0.7)]"
          >
            <Plus className="h-3.5 w-3.5" />
            Add item
          </button>
        </div>
        <div className="mt-4 overflow-x-auto pb-2">
          <div className="flex min-w-max items-stretch gap-3">
            {visibleUpcomingItems.map((item) => {
              const isQueued = activeTasks.some((task) => task.id === item.id);
              return (
                <article key={item.id} className="flex min-h-48 w-72 flex-col rounded-2xl border border-[#E5DACD] bg-[#FFF9EF]/72 p-3">
                  <div className="flex items-center justify-between gap-2">
                    <TaskTypeBadge type={item.type} />
                    <span className="rounded-full border border-[#E1D7CA] bg-white/70 px-2.5 py-1 text-[11px] font-bold text-[#6F6254]">{item.date}</span>
                  </div>
                  <div className="flex-1">
                    <p className="mt-3 text-[13px] font-black leading-snug text-[#1F2722]">{item.title}</p>
                    <p className="mt-2 text-[12px] leading-relaxed text-[#7D6E5F]">{item.detail}</p>
                    {isQueued ? <p className="mt-2 text-[11px] font-bold text-[#238B57]">Queued task</p> : null}
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <button type="button" onClick={() => startJourneyResolution(item.id, "Done")} className="rounded-full bg-[#25352E] px-3 py-1.5 text-[12px] font-bold text-[#FFF9EF]">
                      Done
                    </button>
                    <button type="button" onClick={() => startJourneyResolution(item.id, "Dismiss")} className="rounded-full border border-[#D8CAB9] bg-white/70 px-3 py-1.5 text-[12px] font-bold text-[#6F6254]">
                      Dismiss
                    </button>
                  </div>
                </article>
              );
            })}
            {visibleUpcomingItems.length === 0 ? (
              <div className="w-80 rounded-2xl border border-dashed border-[#D8CAB9] bg-[#FFF9EF]/70 p-4 text-[13px] font-bold text-[#7D6E5F]">
                No journey items have been created yet.
              </div>
            ) : null}
          </div>
        </div>

        <div className="mt-5 border-l border-[#D8CAB9] pl-4">
          {visibleCompletedItems.map((item) => (
            <article key={item.id} className="relative pb-5 last:pb-0">
              <span className="absolute -left-[1.35rem] top-1 h-3 w-3 rounded-full border border-[#D8CAB9] bg-[#25352E]" />
              <div className="flex flex-wrap items-center gap-2">
                <TaskTypeBadge type={item.type} />
                <span className="text-[12px] font-bold text-[#8A7A69]">{item.date}</span>
              </div>
              <p className="mt-2 text-[14px] font-black tracking-[-0.03em] text-[#1F2722]">{item.title}</p>
              <p className="mt-1 max-w-3xl text-[12px] leading-relaxed text-[#7D6E5F]">{item.detail}</p>
            </article>
          ))}
        </div>
      </section>

      <AddContactDialog
        open={contactDialogOpen}
        draft={contactDraft}
        onOpenChange={setContactDialogOpen}
        onDraftChange={setContactDraft}
        onSave={saveContact}
      />
      <AddResourceDialog
        open={resourceDialogOpen}
        draft={resourceDraft}
        onOpenChange={setResourceDialogOpen}
        onDraftChange={setResourceDraft}
        onSave={saveResource}
      />
      <AddJourneyItemDialog
        open={journeyDialogOpen}
        draft={journeyDraft}
        onOpenChange={setJourneyDialogOpen}
        onDraftChange={setJourneyDraft}
        onSave={saveJourneyItem}
      />
      <JourneyResolutionForm
        open={Boolean(journeyResolutionDraft)}
        action={journeyResolutionDraft?.action ?? "Done"}
        reason={journeyResolutionDraft?.reason ?? ""}
        itemTitle={resolutionItem?.title}
        onOpenChange={(nextOpen) => {
          if (!nextOpen) setJourneyResolutionDraft(null);
        }}
        onReasonChange={(reason) => setJourneyResolutionDraft((draft) => (draft ? { ...draft, reason } : draft))}
        onConfirm={confirmJourneyResolution}
        onCancel={() => setJourneyResolutionDraft(null)}
      />
    </div>
  );
}

function AccountModal({
  account,
  open,
  initialTab,
  onAccountUpdate,
  onOpenChange,
}: {
  account: PortfolioAccount | null;
  open: boolean;
  initialTab: AccountWorkspaceTab;
  onAccountUpdate: (account: PortfolioAccount) => void;
  onOpenChange: (open: boolean) => void;
}) {
  const { role } = useRole();
  const [activeTab, setActiveTab] = useState<AccountWorkspaceTab>(initialTab);
  const [activeTasks, setActiveTasks] = useState<ActiveTask[]>([]);
  const [pendingDenials, setPendingDenials] = useState<Record<string, string>>({});
  const [deniedReasons, setDeniedReasons] = useState<Record<string, string>>({});
  const [overrideDrafts, setOverrideDrafts] = useState<Record<string, { score: string; reason: string }>>({});
  const [overrideRequests, setOverrideRequests] = useState<Record<string, ScoreOverrideRequest>>({});
  const [scoreOverrides, setScoreOverrides] = useState<Record<string, ScoreOverride>>({});
  const [kpiWeights, setKpiWeights] = useState<Record<string, number>>({});
  const [weightDrafts, setWeightDrafts] = useState<Record<string, { weight: string }>>({});
  const [weightReason, setWeightReason] = useState("");
  const [weightRequest, setWeightRequest] = useState<KpiWeightRequest | undefined>();
  const [kycRegenerating, setKycRegenerating] = useState(false);
  const [kycRegenerationMessage, setKycRegenerationMessage] = useState("");
  const [kycRegenerationError, setKycRegenerationError] = useState("");

  const acceptedTaskIds = useMemo(() => new Set(activeTasks.map((task) => task.id)), [activeTasks]);
  const kpiRows = useMemo(() => buildAccountKpiRows(account), [account]);
  const isAssociate = role === "ASSOCIATE";
  const canOverrideDirectly = role === "KAM";

  useEffect(() => {
    if (open) {
      setActiveTab(initialTab);
      setKycRegenerationMessage("");
      setKycRegenerationError("");
    }
  }, [account?.id, initialTab, open]);

  function acceptRecommendation(row: KpiOverviewRow) {
    if (!row.task || acceptedTaskIds.has(row.id)) return;
    setActiveTasks((tasks) => [
      ...tasks,
      {
        id: row.id,
        kpiName: row.name,
        task: row.task ?? "",
        type: row.taskType ?? "To-do",
        dueDate: dueDate(row.dueInDays),
      },
    ]);
  }

  function resolveQueuedTask(taskId: string) {
    setActiveTasks((tasks) => tasks.filter((task) => task.id !== taskId));
  }

  function startDeny(row: KpiOverviewRow) {
    setPendingDenials((reasons) => ({ ...reasons, [row.id]: "" }));
  }

  function updateDenialReason(rowId: string, value: string) {
    setPendingDenials((reasons) => ({ ...reasons, [rowId]: value }));
  }

  function confirmDeny(row: KpiOverviewRow) {
    const reason = pendingDenials[row.id]?.trim();
    if (!reason) return;
    setDeniedReasons((reasons) => ({ ...reasons, [row.id]: reason }));
    setPendingDenials((reasons) => {
      const next = { ...reasons };
      delete next[row.id];
      return next;
    });
  }

  function cancelDeny(rowId: string) {
    setPendingDenials((reasons) => {
      const next = { ...reasons };
      delete next[rowId];
      return next;
    });
  }

  function updateOverrideDraft(rowId: string, field: "score" | "reason", value: string) {
    setOverrideDrafts((drafts) => ({
      ...drafts,
      [rowId]: {
        score: field === "score" ? value : drafts[rowId]?.score ?? String(defaultScoreForOverrideTarget(rowId)),
        reason: field === "reason" ? value : drafts[rowId]?.reason ?? "",
      },
    }));
  }

  function defaultScoreForOverrideTarget(targetId: string) {
    for (const row of kpiRows) {
      for (const parameter of row.subParameters) {
        if (subParameterKey(row.id, parameter.name) === targetId) return parameter.score;
      }
    }
    return 1;
  }

  function submitOverrideRequest(targetId: string) {
    const draft = overrideDrafts[targetId] ?? { score: String(defaultScoreForOverrideTarget(targetId)), reason: "" };
    const reason = draft.reason.trim();
    if (!reason) return;
    setOverrideRequests((requests) => ({
      ...requests,
      [targetId]: {
        targetId,
        requestedScore: clampKpiScore(draft.score),
        reason,
        status: "Pending",
      },
    }));
    setOverrideDrafts((drafts) => ({ ...drafts, [targetId]: { score: draft.score, reason: "" } }));
  }

  function applyScoreOverride(targetId: string) {
    const draft = overrideDrafts[targetId] ?? { score: String(scoreOverrides[targetId]?.score ?? defaultScoreForOverrideTarget(targetId)), reason: "" };
    const reason = draft.reason.trim();
    if (!reason) return;
    setScoreOverrides((overrides) => ({
      ...overrides,
      [targetId]: {
        targetId,
        score: clampKpiScore(draft.score),
        reason,
      },
    }));
    setOverrideDrafts((drafts) => ({ ...drafts, [targetId]: { score: draft.score, reason: "" } }));
  }

  function approveOverrideRequest(targetId: string) {
    const request = overrideRequests[targetId];
    if (!request) return;
    setScoreOverrides((overrides) => ({
      ...overrides,
      [targetId]: {
        targetId,
        score: request.requestedScore,
        reason: `Approved request: ${request.reason}`,
      },
    }));
    setOverrideRequests((requests) => ({
      ...requests,
      [targetId]: {
        ...request,
        status: "Approved",
      },
    }));
  }

  function denyOverrideRequest(targetId: string) {
    const request = overrideRequests[targetId];
    if (!request) return;
    setOverrideRequests((requests) => ({
      ...requests,
      [targetId]: {
        ...request,
        status: "Denied",
      },
    }));
  }

  function defaultWeightForKpi(rowId: string) {
    const row = kpiRows.find((item) => item.id === rowId);
    return row ? parseWeightValue(row.weight) : 0;
  }

  function draftKpiWeights() {
    return kpiRows.reduce<Record<string, number>>((weights, row) => {
      weights[row.id] = clampPercent(weightDrafts[row.id]?.weight ?? String(kpiWeights[row.id] ?? defaultWeightForKpi(row.id)));
      return weights;
    }, {});
  }

  function draftWeightTotal() {
    return Object.values(draftKpiWeights()).reduce((sum, weight) => sum + weight, 0);
  }

  function updateWeightDraft(rowId: string, value: string) {
    setWeightDrafts((drafts) => ({
      ...drafts,
      [rowId]: {
        weight: value,
      },
    }));
  }

  function submitWeightRequest() {
    const reason = weightReason.trim();
    if (!reason || draftWeightTotal() !== 100) return;
    setWeightRequest({
      requestedWeights: draftKpiWeights(),
      reason,
      status: "Pending",
    });
    setWeightReason("");
  }

  function saveKpiWeight() {
    const reason = weightReason.trim();
    if (!reason || draftWeightTotal() !== 100) return;
    setKpiWeights(draftKpiWeights());
    setWeightReason("");
  }

  function approveWeightRequest() {
    if (!weightRequest) return;
    setKpiWeights(weightRequest.requestedWeights);
    setWeightRequest({
      ...weightRequest,
      status: "Approved",
    });
  }

  function denyWeightRequest() {
    if (!weightRequest) return;
    setWeightRequest({
      ...weightRequest,
      status: "Denied",
    });
  }

  async function regenerateKyc() {
    if (!account || kycRegenerating) return;
    setKycRegenerating(true);
    setKycRegenerationError("");
    setKycRegenerationMessage("");
    try {
      const response = await fetch(`/api/accounts/${account.id}/kyc/regenerate`, {
        method: "POST",
        headers: { "x-role": role },
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "KYC regeneration failed");
      const version = payload.data?.kyc?.version;
      const source = payload.data?.webSearchUsed ? "with web search" : "from account context";
      setKycRegenerationMessage(`KYC v${version ?? "new"} generated ${source}.`);
    } catch (error) {
      setKycRegenerationError(error instanceof Error ? error.message : "KYC regeneration failed");
    } finally {
      setKycRegenerating(false);
    }
  }

  if (!account) return null;

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-[#1B1812]/42 backdrop-blur-[4px] data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-50 flex h-[92vh] w-[min(1360px,94vw)] -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-[1.5rem] border border-[#E2D8CC] bg-[#FBF7EF] shadow-[0_34px_110px_-56px_rgba(43,32,19,0.78)] focus:outline-none data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95">
          <div className="relative z-20 shrink-0 overflow-hidden border-b border-[#E5DACD] bg-[#F7F1E7] px-5 py-4">
            <div className="pointer-events-none absolute right-[-7rem] top-[-10rem] h-72 w-72 rounded-full bg-[#A7C7B4]/36 blur-3xl" />
            <div className="pointer-events-none absolute bottom-[-8rem] left-[30%] h-64 w-64 rounded-full bg-[#E8BE86]/24 blur-3xl" />
            <div className="relative z-10 flex items-center justify-between gap-4">
              <div className="flex min-w-0 items-center gap-4">
                <AccountLogo account={account} size="lg" />
                <div className="min-w-0">
                  <Dialog.Title className="truncate text-3xl font-black leading-none tracking-[-0.06em] text-[#1F2722]">
                    {account.name}
                  </Dialog.Title>
                  <Dialog.Description className="sr-only">
                    Account workspace for {account.name}
                  </Dialog.Description>
                </div>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                {role !== "EXECUTIVE" ? (
                  <button
                    type="button"
                    onClick={regenerateKyc}
                    disabled={kycRegenerating}
                    className="inline-flex items-center gap-2 rounded-full border border-[#D8CAB9] bg-[#FFF9EF]/80 px-3 py-2 text-[12px] font-bold text-[#25352E] disabled:opacity-60"
                  >
                    <Sparkles className="h-3.5 w-3.5" />
                    {kycRegenerating ? "Regenerating..." : "Regenerate KYC"}
                  </button>
                ) : null}
                <Dialog.Close asChild>
                  <button
                    type="button"
                    className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-[#DED1C1] bg-[#FFF9EF]/80 text-[#6F6254] transition-colors hover:bg-white hover:text-[#25352E]"
                    aria-label="Close account modal"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </Dialog.Close>
              </div>
            </div>

            {kycRegenerationMessage || kycRegenerationError ? (
              <div className={`relative z-10 mt-3 rounded-2xl border p-3 text-[12px] font-bold ${
                kycRegenerationError ? "border-[#E8B8B0] bg-[#FFF0ED] text-[#B33D32]" : "border-[#B7D8C3] bg-[#EEF8F1] text-[#23633E]"
              }`}>
                {kycRegenerationError || kycRegenerationMessage}
              </div>
            ) : null}

            <div className="relative z-10 mt-4 grid gap-3 md:grid-cols-3 xl:grid-cols-6">
              <SummaryItem label="Score" value={<span className={scoreTone[account.health]}>{account.healthScore}/100</span>} />
              <SummaryItem label="ARR" value={money(account.arr)} />
              <SummaryItem label="Contract renewal" value={renewalDate(account.renewalDays)} />
              <SummaryItem label="Industry" value={account.industry} />
              <SummaryItem label="Location" value={`${account.country} · ${account.region}`} />
              <SummaryItem label="Account owner" value={account.associateOwner} />
            </div>
          </div>

          <Tabs.Root value={activeTab} onValueChange={(value) => setActiveTab(value as AccountWorkspaceTab)} className="flex min-h-0 flex-1 flex-col overflow-hidden">
            <Tabs.List className="sticky top-0 z-10 flex shrink-0 items-center gap-2 border-b border-[#E5DACD] bg-[#FFF9EF]/90 px-4 py-2 [backdrop-filter:blur(14px)]">
              {["Overview", "Profile", "Documents"].map((tab) => (
                <Tabs.Trigger
                  key={tab}
                  value={tab.toLowerCase()}
                  className="rounded-full px-3 py-1.5 text-[12px] font-bold text-[#6F6254] transition-colors hover:bg-[#F1E7D8] data-[state=active]:bg-[#25352E] data-[state=active]:text-[#FFF9EF]"
                >
                  {tab}
                </Tabs.Trigger>
              ))}
            </Tabs.List>
            <div className="min-h-0 flex-1 overflow-y-auto p-4">
              <Tabs.Content value="overview" className="focus:outline-none">
                <OverviewTab
                  kpiRows={kpiRows}
                  activeTasks={activeTasks}
                  acceptedTaskIds={acceptedTaskIds}
                  pendingDenials={pendingDenials}
                  deniedReasons={deniedReasons}
                  overrideDrafts={overrideDrafts}
                  overrideRequests={overrideRequests}
                  scoreOverrides={scoreOverrides}
                  kpiWeights={kpiWeights}
                  weightDrafts={weightDrafts}
                  weightRequest={weightRequest}
                  weightReason={weightReason}
                  isAssociate={isAssociate}
                  canOverrideDirectly={canOverrideDirectly}
                  onAccept={acceptRecommendation}
                  onStartDeny={startDeny}
                  onReasonChange={updateDenialReason}
                  onConfirmDeny={confirmDeny}
                  onCancelDeny={cancelDeny}
                  onOverrideDraftChange={updateOverrideDraft}
                  onSubmitOverrideRequest={submitOverrideRequest}
                  onApplyScoreOverride={applyScoreOverride}
                  onApproveOverrideRequest={approveOverrideRequest}
                  onDenyOverrideRequest={denyOverrideRequest}
                  onWeightDraftChange={updateWeightDraft}
                  onWeightReasonChange={setWeightReason}
                  onSubmitWeightRequest={submitWeightRequest}
                  onSaveKpiWeight={saveKpiWeight}
                  onApproveWeightRequest={approveWeightRequest}
                  onDenyWeightRequest={denyWeightRequest}
                />
              </Tabs.Content>
              <Tabs.Content value="profile" className="focus:outline-none">
                <ProfileTab account={account} activeTasks={activeTasks} onAccountUpdate={onAccountUpdate} onResolveQueuedTask={resolveQueuedTask} />
              </Tabs.Content>
              <Tabs.Content value="documents" className="focus:outline-none">
                <DocumentsTab account={account} onAccountUpdate={onAccountUpdate} />
              </Tabs.Content>
            </div>
          </Tabs.Root>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function PortfolioCard({ account, readonly, onOpen }: { account: PortfolioAccount; readonly: boolean; onOpen: (account: PortfolioAccount) => void }) {
  return (
    <article
      role="button"
      tabIndex={0}
      aria-label={`Open ${account.name} account`}
      onClick={() => onOpen(account)}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onOpen(account);
        }
      }}
      className={`group relative cursor-pointer overflow-hidden rounded-3xl border border-l-4 border-[var(--glass-border)] ${healthAccent[account.health]} bg-[rgba(255,252,247,0.78)] p-4 shadow-[0_18px_46px_-34px_rgba(55,43,28,0.58),inset_0_1px_0_rgba(255,255,255,0.78)] transition-all duration-300 [backdrop-filter:var(--glass-blur)] hover:-translate-y-0.5 hover:bg-[rgba(255,252,247,0.92)] hover:shadow-[0_24px_58px_-34px_rgba(55,43,28,0.7)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#25352E]/40`}
    >
      <div className="pointer-events-none absolute right-[-4rem] top-[-4rem] h-32 w-32 rounded-full bg-[#E9D4B7]/28 blur-2xl" />
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <AccountLogo account={account} />
          <div className="min-w-0">
            <h3 className="truncate text-[16px] font-extrabold tracking-[-0.03em] text-[var(--text-primary)]">{account.name}</h3>
            <p className="truncate text-[12px] text-[var(--text-muted)]">{account.industry} · {account.region}</p>
          </div>
        </div>
        <ScoreNumber account={account} />
      </div>

      <div className="mt-5 grid grid-cols-3 gap-2">
        <div className="rounded-2xl border border-[var(--border-subtle)] bg-white/45 p-3">
          <p className="text-[10px] font-bold text-[var(--text-muted)]">ARR</p>
          <p className="mt-1 text-[18px] font-black tracking-[-0.04em] text-[var(--text-primary)]">{money(account.arr)}</p>
        </div>
        <div className="rounded-2xl border border-[var(--border-subtle)] bg-white/45 p-3">
          <p className="text-[10px] font-bold text-[var(--text-muted)]">Renewal</p>
          <p className="mt-1 text-[18px] font-black tracking-[-0.04em] text-[var(--text-primary)]">{account.renewalDays}d</p>
        </div>
        <div className="rounded-2xl border border-[var(--border-subtle)] bg-white/45 p-3">
          <p className="text-[10px] font-bold text-[var(--text-muted)]">Country</p>
          <p className="mt-1 truncate text-[14px] font-bold text-[var(--text-primary)]">{account.country}</p>
        </div>
      </div>

      <div className="mt-4 border-t border-[var(--border-subtle)] pt-3">
        <div>
          <p className="text-[10px] font-bold text-[var(--text-muted)]">{readonly ? "KAM" : "Owner"}</p>
          <p className="text-[12px] font-semibold text-[var(--text-primary)]">{readonly ? account.kamOwner : account.associateOwner}</p>
        </div>
      </div>
    </article>
  );
}

function AccountSourceUploadDialog({
  open,
  files,
  isUploading,
  uploadError,
  onOpenChange,
  onFilesChange,
  onContinue,
}: {
  open: boolean;
  files: File[];
  isUploading: boolean;
  uploadError: string;
  onOpenChange: (open: boolean) => void;
  onFilesChange: (files: File[]) => void;
  onContinue: () => void;
}) {
  const fileNames = files.map((file) => file.name);

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-[70] bg-[#1F2722]/28 backdrop-blur-[2px]" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-[80] w-[min(92vw,560px)] -translate-x-1/2 -translate-y-1/2 rounded-3xl border border-[#D8CAB9] bg-[#FFF9EF] p-4 shadow-[0_28px_70px_-32px_rgba(31,39,34,0.56)] focus:outline-none">
          <div className="flex items-start justify-between gap-3">
            <Dialog.Title className="text-[22px] font-black tracking-[-0.05em] text-[#1F2722]">Upload account source files</Dialog.Title>
            <button
              type="button"
              onClick={() => onOpenChange(false)}
              className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-[#DED1C1] bg-white/70 text-[#6F6254] hover:text-[#25352E]"
              aria-label="Close account source upload"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <label className="mt-5 block rounded-2xl border border-dashed border-[#D8CAB9] bg-white/62 p-4">
            <span className="flex items-center gap-2 text-[12px] font-bold text-[#7D6E5F]">
              <FileText className="h-4 w-4" />
              Source files
            </span>
            <input
              type="file"
              accept=".pdf,.docx,.txt"
              multiple
              className="mt-3 block w-full text-[13px] font-bold text-[#25352E] file:mr-3 file:rounded-full file:border-0 file:bg-[#25352E] file:px-4 file:py-2 file:text-[13px] file:font-bold file:text-[#FFF9EF]"
              onChange={(event) => {
                onFilesChange(Array.from(event.target.files ?? []));
              }}
            />
            {fileNames.length > 0 ? (
              <div className="mt-3 space-y-2">
                {fileNames.map((fileName) => (
                  <div key={fileName} className="flex items-center gap-3 rounded-xl border border-[#E5DACD] bg-white/70 px-3 py-2">
                    <p className="min-w-0 flex-1 truncate text-[13px] font-black text-[#1F2722]">{fileName}</p>
                    <button
                      type="button"
                      onClick={(event) => {
                        event.preventDefault();
                        event.stopPropagation();
                        onFilesChange(files.filter((file) => file.name !== fileName));
                      }}
                      className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[#9B9084] transition-colors hover:bg-[#F1E7D8] hover:text-[#25352E]"
                      aria-label={`Remove ${fileName}`}
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            ) : null}
          </label>

          {uploadError ? (
            <div className="mt-3 rounded-2xl border border-[#F0C6BE] bg-[#FFF0ED] px-3 py-2 text-[13px] font-bold text-[#B33D32]">
              {uploadError}
            </div>
          ) : null}

          <div className="mt-5 flex justify-end gap-2">
            <button type="button" onClick={() => onOpenChange(false)} className="rounded-full border border-[#D8CAB9] bg-white/70 px-4 py-2 text-[13px] font-bold text-[#6F6254]">
              Cancel
            </button>
            <button
              type="button"
              onClick={onContinue}
              disabled={files.length === 0 || isUploading}
              className="rounded-full bg-[#25352E] px-4 py-2 text-[13px] font-bold text-[#FFF9EF] disabled:cursor-not-allowed disabled:bg-[#25352E]/35"
            >
              {isUploading ? "Parsing..." : "Continue"}
            </button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function AccountDraftField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="block rounded-2xl border border-[#E5DACD] bg-white/62 p-3">
      <FieldLabel>{label}</FieldLabel>
      <input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="mt-2 h-9 w-full rounded-xl border border-[#E1D7CA] bg-[#FFF9EF]/80 px-3 text-[13px] font-bold text-[#25352E] outline-none focus:border-[#25352E]/45"
      />
    </label>
  );
}

function SuggestionDismissalDialog({
  open,
  suggestion,
  reason,
  onOpenChange,
  onReasonChange,
  onConfirm,
  onCancel,
}: {
  open: boolean;
  suggestion?: OnboardingSuggestion;
  reason: string;
  onOpenChange: (open: boolean) => void;
  onReasonChange: (reason: string) => void;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-[90] bg-[#1F2722]/28 backdrop-blur-[2px]" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-[100] w-[min(92vw,460px)] -translate-x-1/2 -translate-y-1/2 rounded-3xl border border-[#D8CAB9] bg-[#FFF9EF] p-4 shadow-[0_28px_70px_-32px_rgba(31,39,34,0.56)] focus:outline-none">
          <div className="flex items-start justify-between gap-3">
            <Dialog.Title className="text-[20px] font-black tracking-[-0.05em] text-[#1F2722]">Dismiss suggestion</Dialog.Title>
            <button
              type="button"
              onClick={onCancel}
              className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-[#DED1C1] bg-white/70 text-[#6F6254] hover:text-[#25352E]"
              aria-label="Close dismissal reason"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
          {suggestion ? <p className="mt-3 text-[13px] font-bold text-[#25352E]">{suggestion.label}: {suggestion.proposedValue}</p> : null}
          <textarea
            value={reason}
            onChange={(event) => onReasonChange(event.target.value)}
            placeholder="Reason for dismissing this suggestion"
            className="mt-4 min-h-28 w-full rounded-xl border border-[#E1D7CA] bg-white/80 p-3 text-[13px] text-[#25352E] outline-none placeholder:text-[#A69A8B] focus:border-[#25352E]/45"
          />
          <div className="mt-4 flex justify-end gap-2">
            <button type="button" onClick={onCancel} className="rounded-full border border-[#D8CAB9] bg-white/70 px-4 py-2 text-[13px] font-bold text-[#6F6254]">
              Cancel
            </button>
            <button type="button" onClick={onConfirm} disabled={!reason.trim()} className="rounded-full bg-[#25352E] px-4 py-2 text-[13px] font-bold text-[#FFF9EF] disabled:cursor-not-allowed disabled:bg-[#25352E]/35">
              Confirm
            </button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function PendingAccountCreationDialog({
  open,
  request,
  onOpenChange,
  onUpdateRequest,
  onDeleteRequest,
  onApproveRequest,
  role,
}: {
  open: boolean;
  request: PendingAccountCreationRequest | null;
  onOpenChange: (open: boolean) => void;
  onUpdateRequest: (request: PendingAccountCreationRequest) => void;
  onDeleteRequest: (requestId: string) => void;
  onApproveRequest: (request: PendingAccountCreationRequest) => Promise<void>;
  role: Role;
}) {
  const [draft, setDraft] = useState<AccountDraft>(request?.draft ?? emptyAccountDraft);
  const [decisionReason, setDecisionReason] = useState("");
  const [status, setStatus] = useState<"Pending" | "Edits saved" | "Approved" | "Denied">("Pending");
  const [sourceFiles, setSourceFiles] = useState<string[]>(request?.sourceFiles ?? []);
  const [editableKycSections, setEditableKycSections] = useState<KycDraftSection[]>(request?.kycSections ?? kycDraftSections);
  const [editableJourney, setEditableJourney] = useState<OnboardingJourneyDraftItem[]>(request?.journey ?? standardOnboardingJourney);
  const [approvalLoading, setApprovalLoading] = useState(false);
  const [approvalError, setApprovalError] = useState("");
  const [assistantMessage, setAssistantMessage] = useState("");
  const [assistantDocumentDraft, setAssistantDocumentDraft] = useState<OnboardingDocumentDraft>({
    type: documentTypes[0].type,
    fileName: "",
    fileUrl: "",
  });
  const [activeStep, setActiveStep] = useState<AccountOnboardingStep>("profile");
  const [assistantCollapsed, setAssistantCollapsed] = useState(false);
  const [assistantNotes, setAssistantNotes] = useState<string[]>([
    "I can help the KAM review this account draft, update fields, inspect sources, and refine KYC or journey items before approval.",
  ]);
  const setupTabs: Array<{ id: AccountOnboardingStep; label: string }> = [
    { id: "profile", label: "Profile" },
    { id: "kyc", label: "KYC draft" },
    { id: "journey", label: "Journey" },
    { id: "review", label: "Review" },
  ];
  const canSubmitToKam = role === "ASSOCIATE" && request?.status !== "Submitted to KAM";
  const canApproveRequest = role === "KAM";

  useEffect(() => {
    if (!request) return;
    setDraft(request.draft);
    setSourceFiles(request.sourceFiles);
    setEditableKycSections(request.kycSections ?? kycDraftSections);
    setEditableJourney(request.journey ?? standardOnboardingJourney);
    setStatus("Pending");
    setDecisionReason("");
    setApprovalError("");
    setApprovalLoading(false);
  }, [request]);

  if (!request) return null;

  function updateDraft(nextDraft: AccountDraft) {
    setDraft(nextDraft);
    setStatus("Pending");
  }

  async function approve() {
    if (!request || approvalLoading) return;
    setApprovalLoading(true);
    setApprovalError("");
    try {
      await onApproveRequest({
        ...request,
        status: "Submitted to KAM",
        draft,
        sourceFiles,
        kycSections: editableKycSections,
        journey: editableJourney,
      });
      setStatus("Approved");
      setDecisionReason("");
    } catch (error) {
      setApprovalError(error instanceof Error ? error.message : "Account approval failed");
    } finally {
      setApprovalLoading(false);
    }
  }

  function deny() {
    if (!decisionReason.trim()) return;
    setStatus("Denied");
    setDecisionReason("");
  }

  function saveEdits() {
    if (!request) return;
    onUpdateRequest({
      ...request,
      draft,
      sourceFiles,
      kycSections: editableKycSections,
      journey: editableJourney,
    });
    setStatus("Edits saved");
  }

  function deleteDraft() {
    if (!request) return;
    onDeleteRequest(request.id);
  }

  function submitToKam() {
    if (!request) return;
    const nextRequest: PendingAccountCreationRequest = {
      ...request,
      status: "Submitted to KAM",
      associateReason: "Submitted from the Associate draft workspace for KAM review.",
      draft,
      sourceFiles,
      kycSections: editableKycSections,
      journey: editableJourney,
    };
    onUpdateRequest(nextRequest);
    setAssistantNotes((notes) => [`Submitted ${nextRequest.draft.name} to KAM for review.`, ...notes]);
    setStatus("Edits saved");
  }

  function sendAssistantMessage() {
    const message = assistantMessage.trim();
    if (!message && !assistantDocumentDraft.fileName) return;
    if (assistantDocumentDraft.fileName) {
      setSourceFiles((files) => [assistantDocumentDraft.fileName, ...files]);
      setAssistantNotes((notes) => [`Added ${assistantDocumentDraft.fileName} as a source for review.`, ...notes]);
      setAssistantDocumentDraft({
        type: documentTypes[0].type,
        fileName: "",
        fileUrl: "",
      });
    }
    if (message) {
      setAssistantNotes((notes) => [message, "I will apply that instruction once the V2 review agent is wired.", ...notes]);
      setAssistantMessage("");
    }
  }

  function renderActiveStep() {
    if (activeStep === "profile") {
      return (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          <AccountDraftField label="Account name" value={draft.name} onChange={(value) => updateDraft({ ...draft, name: value })} />
          <AccountDraftField label="Industry" value={draft.industry} onChange={(value) => updateDraft({ ...draft, industry: value })} />
          <AccountDraftField label="Segment" value={draft.segment} onChange={(value) => updateDraft({ ...draft, segment: value })} />
          <AccountDraftField label="ARR" value={draft.arr} onChange={(value) => updateDraft({ ...draft, arr: value })} />
          <AccountDraftField label="Location" value={draft.location} onChange={(value) => updateDraft({ ...draft, location: value })} />
          <AccountDraftField label="Contract renewal" value={draft.contractRenewal} onChange={(value) => updateDraft({ ...draft, contractRenewal: value })} />
          <AccountDraftField label="KAM owner" value={draft.kamOwner} onChange={(value) => updateDraft({ ...draft, kamOwner: value })} />
          <AccountDraftField label="Associate owner" value={draft.associateOwner} onChange={(value) => updateDraft({ ...draft, associateOwner: value })} />
          <AccountDraftField label="Primary contact" value={draft.primaryContact} onChange={(value) => updateDraft({ ...draft, primaryContact: value })} />
          <AccountDraftField label="Active risk" value={draft.activeRisk} onChange={(value) => updateDraft({ ...draft, activeRisk: value })} />
          <AccountDraftField label="Open opportunity" value={draft.openOpportunity} onChange={(value) => updateDraft({ ...draft, openOpportunity: value })} />
          <AccountDraftField label="Next touchpoint" value={draft.nextTouchpoint} onChange={(value) => updateDraft({ ...draft, nextTouchpoint: value })} />
        </div>
      );
    }

    if (activeStep === "kyc") {
      return (
        <div>
          <h3 className="text-[18px] font-black tracking-[-0.04em] text-[#1F2722]">KYC draft</h3>
          <div className="mt-3 grid gap-2 md:grid-cols-2">
            {editableKycSections.map((section) => (
              <article key={section.id} className="rounded-2xl border border-[#E5DACD] bg-[#FFF9EF]/68 p-3">
                <div className="grid gap-2 sm:grid-cols-[1fr_120px]">
                  <label className="space-y-1">
                    <span className="text-[11px] font-black uppercase tracking-[0.08em] text-[#8A7A69]">Section</span>
                    <input
                      value={section.title}
                      onChange={(event) => setEditableKycSections((sections) => sections.map((item) => item.id === section.id ? { ...item, title: event.target.value } : item))}
                      className="h-10 w-full rounded-xl border border-[#E1D7CA] bg-white/70 px-3 text-[13px] font-black text-[#25352E] outline-none focus:border-[#25352E]/45"
                    />
                  </label>
                  <label className="space-y-1">
                    <span className="text-[11px] font-black uppercase tracking-[0.08em] text-[#8A7A69]">Status</span>
                    <select
                      value={section.status}
                      onChange={(event) => setEditableKycSections((sections) => sections.map((item) => item.id === section.id ? { ...item, status: event.target.value as KycDraftSection["status"] } : item))}
                      className="h-10 w-full rounded-xl border border-[#E1D7CA] bg-white/70 px-3 text-[12px] font-bold text-[#25352E] outline-none focus:border-[#25352E]/45"
                    >
                      <option value="Ready">Ready</option>
                      <option value="Needs input">Needs input</option>
                    </select>
                  </label>
                </div>
                <label className="mt-2 block space-y-1">
                  <span className="text-[11px] font-black uppercase tracking-[0.08em] text-[#8A7A69]">Source</span>
                  <input
                    value={section.source}
                    onChange={(event) => setEditableKycSections((sections) => sections.map((item) => item.id === section.id ? { ...item, source: event.target.value } : item))}
                    className="h-10 w-full rounded-xl border border-[#E1D7CA] bg-white/70 px-3 text-[12px] font-bold text-[#25352E] outline-none focus:border-[#25352E]/45"
                  />
                </label>
                <label className="mt-2 block space-y-1">
                  <span className="text-[11px] font-black uppercase tracking-[0.08em] text-[#8A7A69]">Draft copy</span>
                  <textarea
                    value={section.draft}
                    onChange={(event) => setEditableKycSections((sections) => sections.map((item) => item.id === section.id ? { ...item, draft: event.target.value } : item))}
                    className="min-h-24 w-full rounded-xl border border-[#E1D7CA] bg-white/70 p-3 text-[12px] font-bold leading-relaxed text-[#25352E] outline-none focus:border-[#25352E]/45"
                  />
                </label>
              </article>
            ))}
          </div>
        </div>
      );
    }

    if (activeStep === "journey") {
      return (
        <div>
          <h3 className="text-[18px] font-black tracking-[-0.04em] text-[#1F2722]">Account journey</h3>
          <div className="mt-3 grid gap-2">
            {editableJourney.map((item) => (
              <div key={item.id} className="grid gap-2 rounded-2xl border border-[#E5DACD] bg-[#FFF9EF]/68 p-3 md:grid-cols-[130px_minmax(0,1fr)_150px_140px]">
                <select
                  value={item.type}
                  onChange={(event) => setEditableJourney((journey) => journey.map((journeyItem) => journeyItem.id === item.id ? { ...journeyItem, type: event.target.value as TaskType } : journeyItem))}
                  className="h-10 rounded-xl border border-[#E1D7CA] bg-white/70 px-3 text-[12px] font-bold text-[#25352E] outline-none focus:border-[#25352E]/45"
                >
                  {Object.keys(taskTypeTone).map((type) => (
                    <option key={type} value={type}>{type}</option>
                  ))}
                </select>
                <input
                  value={item.title}
                  onChange={(event) => setEditableJourney((journey) => journey.map((journeyItem) => journeyItem.id === item.id ? { ...journeyItem, title: event.target.value } : journeyItem))}
                  className="h-10 min-w-0 rounded-xl border border-[#E1D7CA] bg-white/70 px-3 text-[13px] font-black text-[#25352E] outline-none focus:border-[#25352E]/45"
                />
                <input
                  type="date"
                  value={item.dueDate}
                  onChange={(event) => setEditableJourney((journey) => journey.map((journeyItem) => journeyItem.id === item.id ? { ...journeyItem, dueDate: event.target.value } : journeyItem))}
                  className="h-10 rounded-xl border border-[#E1D7CA] bg-white/70 px-3 text-[12px] font-bold text-[#25352E] outline-none focus:border-[#25352E]/45"
                />
                <input
                  value={item.recurrence}
                  onChange={(event) => setEditableJourney((journey) => journey.map((journeyItem) => journeyItem.id === item.id ? { ...journeyItem, recurrence: event.target.value } : journeyItem))}
                  className="h-10 rounded-xl border border-[#E1D7CA] bg-white/70 px-3 text-[12px] font-bold text-[#25352E] outline-none focus:border-[#25352E]/45"
                />
              </div>
            ))}
          </div>
        </div>
      );
    }

    return (
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="rounded-3xl border border-[#E5DACD] bg-white/58 p-4">
          <FieldLabel>Associate reason</FieldLabel>
          <p className="mt-2 text-[13px] font-bold leading-relaxed text-[#25352E]">{request?.associateReason ?? "No review reason provided."}</p>
          <div className="mt-4">
            <FieldLabel>Source files</FieldLabel>
            <div className="mt-2 space-y-2">
              {sourceFiles.length > 0 ? sourceFiles.map((fileName) => (
                <button
                  key={fileName}
                  type="button"
                  onClick={() => openExternalTab(documentPreviewUrl(fileName, "Account creation source"))}
                  className="block w-full truncate rounded-xl border border-[#E5DACD] bg-[#FFF9EF]/70 px-3 py-2 text-left text-[12px] font-bold text-[#25352E] transition-colors hover:bg-white"
                >
                  {fileName}
                </button>
              )) : (
                <p className="rounded-xl border border-[#E5DACD] bg-[#FFF9EF]/70 px-3 py-2 text-[12px] font-bold text-[#7D6E5F]">No source files attached.</p>
              )}
            </div>
          </div>
        </div>
        <div className="rounded-3xl border border-[#E5DACD] bg-white/58 p-4">
          <FieldLabel>KAM decision notes</FieldLabel>
          <textarea
            value={decisionReason}
            onChange={(event) => setDecisionReason(event.target.value)}
            placeholder="Required when denying this request"
            className="mt-3 min-h-24 w-full rounded-xl border border-[#E1D7CA] bg-[#FFF9EF]/80 p-3 text-[13px] text-[#25352E] outline-none placeholder:text-[#A69A8B] focus:border-[#25352E]/45"
          />
          <div className="mt-3 flex flex-wrap gap-2">
            <button type="button" onClick={saveEdits} className="rounded-full border border-[#D8CAB9] bg-white/70 px-3 py-2 text-[12px] font-bold text-[#6F6254]">
              Save edits
            </button>
            {canApproveRequest ? (
              <>
                <button type="button" onClick={approve} disabled={approvalLoading} className="rounded-full bg-[#25352E] px-3 py-2 text-[12px] font-bold text-[#FFF9EF] disabled:cursor-not-allowed disabled:opacity-50">
                  {approvalLoading ? "Approving..." : "Approve"}
                </button>
                <button type="button" onClick={deny} disabled={!decisionReason.trim() || approvalLoading} className="rounded-full border border-[#E2B7AF] bg-[#FFF0ED] px-3 py-2 text-[12px] font-bold text-[#B33D32] disabled:cursor-not-allowed disabled:opacity-45">
                  Deny
                </button>
              </>
            ) : null}
            <button type="button" onClick={deleteDraft} className="rounded-full border border-[#E2B7AF] bg-white/70 px-3 py-2 text-[12px] font-bold text-[#B33D32]">
              {request?.status === "Submitted to KAM" ? "Delete request" : "Delete draft"}
            </button>
          </div>
          {approvalError ? (
            <p className="mt-3 rounded-xl border border-[#F0C6BE] bg-[#FFF0ED] px-3 py-2 text-[12px] font-bold text-[#B33D32]">{approvalError}</p>
          ) : null}
          <p className="mt-3 text-[12px] font-black text-[#25352E]">Status: {status}</p>
        </div>
      </div>
    );
  }

  return (
    <Dialog.Root modal={false} open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="pointer-events-none fixed inset-0 z-[90] bg-[#1F2722]/32 backdrop-blur-[3px]" />
        <Dialog.Content
          onInteractOutside={(event) => event.preventDefault()}
          onPointerDownOutside={(event) => event.preventDefault()}
          onFocusOutside={(event) => event.preventDefault()}
          className="fixed inset-4 z-[100] flex max-h-[calc(100vh-2rem)] flex-col overflow-hidden rounded-[1.75rem] border border-[#D8CAB9] bg-[#FBF7EF] shadow-[0_34px_110px_-56px_rgba(43,32,19,0.78)] focus:outline-none"
        >
          <div className="flex shrink-0 items-center justify-between gap-3 border-b border-[#E5DACD] bg-[#F7F1E7] px-5 py-4">
            <div>
              <Dialog.Title className="text-[26px] font-black tracking-[-0.06em] text-[#1F2722]">Review account creation</Dialog.Title>
              <p className="mt-1 text-[13px] font-bold text-[#6F6254]">{request.submittedBy} - {request.submittedAt} - {request.status ?? "Draft"}</p>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <button
                type="button"
                onClick={deleteDraft}
                className="rounded-full border border-[#E2B7AF] bg-white/70 px-3 py-2 text-[12px] font-bold text-[#B33D32] hover:bg-[#FFF0ED]"
              >
                {request.status === "Submitted to KAM" ? "Delete request" : "Delete draft"}
              </button>
              <button
                type="button"
                onClick={() => onOpenChange(false)}
                className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-[#DED1C1] bg-[#FFF9EF]/80 text-[#6F6254] hover:text-[#25352E]"
                aria-label="Close account creation review"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>

          <div className={`grid min-h-0 flex-1 gap-4 overflow-hidden p-4 ${assistantCollapsed ? "lg:grid-cols-[1fr_auto]" : "lg:grid-cols-[minmax(0,1fr)_390px]"}`}>
            <div className="flex min-h-0 min-w-0 flex-col">
              <div className="mb-3 flex flex-wrap gap-2">
                {setupTabs.map((tab) => (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => setActiveStep(tab.id)}
                    className={`rounded-full px-4 py-2 text-[13px] font-bold transition-colors ${
                      activeStep === tab.id ? "bg-[#25352E] text-[#FFF9EF]" : "border border-[#D8CAB9] bg-white/64 text-[#6F6254] hover:text-[#25352E]"
                    }`}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>

              <section className="min-h-0 flex-1 overflow-y-auto rounded-3xl border border-[#E5DACD] bg-white/50 p-4">
                {renderActiveStep()}
              </section>
            </div>

            {assistantCollapsed ? (
              <button
                type="button"
                onClick={() => setAssistantCollapsed(false)}
                className="hidden h-full w-12 items-center justify-center rounded-3xl border border-[#D8CAB9] bg-[#FFF9EF] text-[#25352E] shadow-[0_18px_46px_-34px_rgba(55,43,28,0.58)] lg:flex"
                aria-label="Expand setup assistant"
              >
                <Sparkles className="h-4 w-4" />
              </button>
            ) : (
              <aside className="flex min-h-0 min-w-0 flex-col overflow-hidden rounded-[1.5rem] border border-[#D8CAB9] bg-[#FFF9EF] shadow-[0_18px_46px_-34px_rgba(55,43,28,0.58)]">
                <div className="relative overflow-hidden border-b border-[#E5DACD] bg-[#F7F1E7] px-4 py-4">
                  <div className="relative z-10 flex items-center justify-between gap-3">
                    <div className="flex min-w-0 items-center gap-3">
                      <div className="relative h-10 w-10 shrink-0 rounded-2xl bg-[#25352E]">
                        <span className="absolute left-2 top-2 h-4 w-4 rounded-full bg-[#FFF9EF]" />
                        <span className="absolute bottom-2 right-2 h-3.5 w-3.5 rounded-full bg-[#E8BE86]" />
                        <span className="absolute left-3.5 top-3.5 h-3.5 w-3.5 rounded-full bg-[#A7C7B4]" />
                      </div>
                      <div className="min-w-0">
                        <h2 className="truncate text-[18px] font-black tracking-[-0.04em] text-[#1F2722]">Setup assistant</h2>
                        <p className="text-[12px] font-bold text-[#7D6E5F]">KAM review</p>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => setAssistantCollapsed(true)}
                      className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-[#DED1C1] bg-[#FFF9EF]/80 text-[#6F6254] hover:text-[#25352E]"
                      aria-label="Collapse setup assistant"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
                <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-4">
                  {assistantNotes.map((note, index) => (
                    <p key={`${note}-${index}`} className="rounded-2xl border border-[#E5DACD] bg-white/70 px-3 py-2 text-[13px] font-bold leading-relaxed text-[#25352E]">
                      {note}
                    </p>
                  ))}
                </div>
                <div className="border-t border-[#E5DACD] bg-[#FFF9EF]/95 p-3">
                  {assistantDocumentDraft.fileName ? (
                    <div className="mb-2 flex items-center gap-2 rounded-xl border border-[#E5DACD] bg-white/70 px-3 py-2">
                      <FileText className="h-4 w-4 shrink-0 text-[#7D6E5F]" />
                      <p className="min-w-0 flex-1 truncate text-[12px] font-black text-[#25352E]">{assistantDocumentDraft.fileName}</p>
                      <button type="button" onClick={() => setAssistantDocumentDraft({ ...assistantDocumentDraft, fileName: "", fileUrl: "" })} className="text-[#9B9084] hover:text-[#25352E]" aria-label="Remove attached review document">
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  ) : null}
                  <div className="rounded-2xl border border-[#D8CAB9] bg-white/75 p-2">
                    <textarea
                      value={assistantMessage}
                      onChange={(event) => setAssistantMessage(event.target.value)}
                      placeholder="Message setup assistant..."
                      className="max-h-32 min-h-12 w-full resize-none bg-transparent px-2 py-1 text-[13px] font-bold text-[#25352E] outline-none placeholder:text-[#A69A8B]"
                    />
                    <div className="mt-2 flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <label className="inline-flex h-9 w-9 cursor-pointer items-center justify-center rounded-full border border-[#D8CAB9] bg-[#FFF9EF] text-[#6F6254] hover:text-[#25352E]" aria-label="Attach review document">
                          <Plus className="h-4 w-4" />
                          <input
                            type="file"
                            accept=".pdf,.docx,.txt"
                            className="sr-only"
                            onChange={(event) => {
                              const file = event.target.files?.[0];
                              if (file) setAssistantDocumentDraft({ ...assistantDocumentDraft, fileName: file.name, fileUrl: URL.createObjectURL(file) });
                            }}
                          />
                        </label>
                        <select value={assistantDocumentDraft.type} onChange={(event) => setAssistantDocumentDraft({ ...assistantDocumentDraft, type: event.target.value })} className="h-9 max-w-[170px] rounded-full border border-[#D8CAB9] bg-[#FFF9EF] px-3 text-[11px] font-bold text-[#25352E] outline-none">
                          {documentTypes.map((documentType) => (
                            <option key={documentType.type} value={documentType.type}>{documentType.type}</option>
                          ))}
                        </select>
                      </div>
                      <button
                        type="button"
                        onClick={sendAssistantMessage}
                        disabled={!assistantMessage.trim() && !assistantDocumentDraft.fileName}
                        className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-[#25352E] text-[#FFF9EF] disabled:cursor-not-allowed disabled:bg-[#25352E]/35"
                        aria-label="Send review assistant message"
                      >
                        <Sparkles className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                  {canSubmitToKam ? (
                    <button
                      type="button"
                      onClick={submitToKam}
                      className="mt-3 w-full rounded-full bg-[#25352E] px-3 py-2 text-[12px] font-bold text-[#FFF9EF]"
                    >
                      Submit to KAM
                    </button>
                  ) : null}
                </div>
              </aside>
            )}
          </div>

          <div className="hidden">
            <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
              <section className="space-y-4">
                <div className="rounded-3xl border border-[#E5DACD] bg-white/50 p-4">
                  <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                  <AccountDraftField label="Account name" value={draft.name} onChange={(value) => updateDraft({ ...draft, name: value })} />
                  <AccountDraftField label="Industry" value={draft.industry} onChange={(value) => updateDraft({ ...draft, industry: value })} />
                  <AccountDraftField label="Segment" value={draft.segment} onChange={(value) => updateDraft({ ...draft, segment: value })} />
                  <AccountDraftField label="ARR" value={draft.arr} onChange={(value) => updateDraft({ ...draft, arr: value })} />
                  <AccountDraftField label="Location" value={draft.location} onChange={(value) => updateDraft({ ...draft, location: value })} />
                  <AccountDraftField label="Contract renewal" value={draft.contractRenewal} onChange={(value) => updateDraft({ ...draft, contractRenewal: value })} />
                  <AccountDraftField label="KAM owner" value={draft.kamOwner} onChange={(value) => updateDraft({ ...draft, kamOwner: value })} />
                  <AccountDraftField label="Associate owner" value={draft.associateOwner} onChange={(value) => updateDraft({ ...draft, associateOwner: value })} />
                  <AccountDraftField label="Primary contact" value={draft.primaryContact} onChange={(value) => updateDraft({ ...draft, primaryContact: value })} />
                  <AccountDraftField label="Active risk" value={draft.activeRisk} onChange={(value) => updateDraft({ ...draft, activeRisk: value })} />
                  <AccountDraftField label="Open opportunity" value={draft.openOpportunity} onChange={(value) => updateDraft({ ...draft, openOpportunity: value })} />
                  <AccountDraftField label="Next touchpoint" value={draft.nextTouchpoint} onChange={(value) => updateDraft({ ...draft, nextTouchpoint: value })} />
                  </div>
                </div>

                <div className="rounded-3xl border border-[#E5DACD] bg-white/50 p-4">
                  <h3 className="text-[18px] font-black tracking-[-0.04em] text-[#1F2722]">KYC draft</h3>
                  <div className="mt-3 grid gap-2 md:grid-cols-2">
                    {kycDraftSections.map((section) => (
                      <article key={section.id} className="rounded-2xl border border-[#E5DACD] bg-[#FFF9EF]/68 p-3">
                        <div className="flex items-start justify-between gap-3">
                          <p className="text-[13px] font-black text-[#25352E]">{section.title}</p>
                          <span className="rounded-full border border-[#DEC997] bg-[#FFF7E4] px-2 py-1 text-[10px] font-bold text-[#8A5C16]">{section.status}</span>
                        </div>
                        <p className="mt-2 text-[12px] font-bold leading-relaxed text-[#6F6254]">{section.draft}</p>
                      </article>
                    ))}
                  </div>
                </div>

                <div className="rounded-3xl border border-[#E5DACD] bg-white/50 p-4">
                  <h3 className="text-[18px] font-black tracking-[-0.04em] text-[#1F2722]">Account journey</h3>
                  <div className="mt-3 grid gap-2">
                    {standardOnboardingJourney.map((item) => (
                      <div key={item.id} className="grid gap-2 rounded-2xl border border-[#E5DACD] bg-[#FFF9EF]/68 p-3 md:grid-cols-[90px_1fr_140px_110px]">
                        <span className={`w-fit rounded-full border px-2 py-1 text-[11px] font-bold ${taskTypeTone[item.type]}`}>{item.type}</span>
                        <p className="text-[13px] font-black text-[#25352E]">{item.title}</p>
                        <p className="text-[12px] font-bold text-[#6F6254]">{item.dueDate}</p>
                        <p className="text-[12px] font-bold text-[#6F6254]">{item.recurrence}</p>
                      </div>
                    ))}
                  </div>
                </div>
              </section>

              <aside className="space-y-3">
                <div className="rounded-3xl border border-[#E5DACD] bg-white/58 p-4">
                  <FieldLabel>Associate reason</FieldLabel>
                  <p className="mt-2 text-[13px] font-bold leading-relaxed text-[#25352E]">{request.associateReason}</p>
                </div>
                <div className="rounded-3xl border border-[#E5DACD] bg-white/58 p-4">
                  <FieldLabel>Source files</FieldLabel>
                  <div className="mt-2 space-y-2">
                    {sourceFiles.map((fileName) => (
                      <button
                        key={fileName}
                        type="button"
                        onClick={() => openExternalTab(documentPreviewUrl(fileName, "Account creation source"))}
                        className="block w-full truncate rounded-xl border border-[#E5DACD] bg-[#FFF9EF]/70 px-3 py-2 text-left text-[12px] font-bold text-[#25352E] transition-colors hover:bg-white"
                      >
                        {fileName}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="rounded-3xl border border-[#E5DACD] bg-white/58 p-4">
                  <FieldLabel>KAM decision notes</FieldLabel>
                  <textarea
                    value={decisionReason}
                    onChange={(event) => setDecisionReason(event.target.value)}
                    placeholder="Required when denying this request"
                    className="mt-3 min-h-24 w-full rounded-xl border border-[#E1D7CA] bg-[#FFF9EF]/80 p-3 text-[13px] text-[#25352E] outline-none placeholder:text-[#A69A8B] focus:border-[#25352E]/45"
                  />
                  <div className="mt-3 flex flex-wrap gap-2">
                    <button type="button" onClick={() => setStatus("Edits saved")} className="rounded-full border border-[#D8CAB9] bg-white/70 px-3 py-2 text-[12px] font-bold text-[#6F6254]">
                      Save edits
                    </button>
                    <button type="button" onClick={approve} className="rounded-full bg-[#25352E] px-3 py-2 text-[12px] font-bold text-[#FFF9EF]">
                      Approve
                    </button>
                    <button type="button" onClick={deny} disabled={!decisionReason.trim()} className="rounded-full border border-[#E2B7AF] bg-[#FFF0ED] px-3 py-2 text-[12px] font-bold text-[#B33D32] disabled:cursor-not-allowed disabled:opacity-45">
                      Deny
                    </button>
                  </div>
                  <p className="mt-3 text-[12px] font-black text-[#25352E]">Status: {status}</p>
                </div>
              </aside>
            </div>
          </div>
        </Dialog.Content>
        <div className="hidden pointer-events-auto fixed bottom-8 right-8 z-[105] h-[min(660px,calc(100vh-5rem))] w-[min(420px,26vw)] min-w-[360px] flex-col overflow-hidden rounded-[1.75rem] border border-[#D8CAB9] bg-[#FFF9EF] shadow-[0_32px_110px_-42px_rgba(31,39,34,0.72)]">
          <div className="relative overflow-hidden border-b border-[#E5DACD] bg-[#F7F1E7] px-4 py-4">
            <div className="relative z-10 flex items-center gap-3">
              <div className="relative h-10 w-10 rounded-2xl bg-[#25352E]">
                <span className="absolute left-2 top-2 h-4 w-4 rounded-full bg-[#FFF9EF]" />
                <span className="absolute bottom-2 right-2 h-3.5 w-3.5 rounded-full bg-[#E8BE86]" />
                <span className="absolute left-3.5 top-3.5 h-3.5 w-3.5 rounded-full bg-[#A7C7B4]" />
              </div>
              <div>
                <h2 className="text-[18px] font-black tracking-[-0.04em] text-[#1F2722]">Setup assistant</h2>
                <p className="text-[12px] font-bold text-[#7D6E5F]">KAM review</p>
              </div>
            </div>
          </div>
          <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-4">
            {assistantNotes.map((note, index) => (
              <p key={`${note}-${index}`} className="rounded-2xl border border-[#E5DACD] bg-white/70 px-3 py-2 text-[13px] font-bold leading-relaxed text-[#25352E]">
                {note}
              </p>
            ))}
          </div>
          <div className="border-t border-[#E5DACD] bg-[#FFF9EF]/95 p-3">
            {assistantDocumentDraft.fileName ? (
              <div className="mb-2 flex items-center gap-2 rounded-xl border border-[#E5DACD] bg-white/70 px-3 py-2">
                <FileText className="h-4 w-4 shrink-0 text-[#7D6E5F]" />
                <p className="min-w-0 flex-1 truncate text-[12px] font-black text-[#25352E]">{assistantDocumentDraft.fileName}</p>
                <button type="button" onClick={() => setAssistantDocumentDraft({ ...assistantDocumentDraft, fileName: "", fileUrl: "" })} className="text-[#9B9084] hover:text-[#25352E]" aria-label="Remove attached review document">
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            ) : null}
            <div className="rounded-2xl border border-[#D8CAB9] bg-white/75 p-2">
              <textarea
                value={assistantMessage}
                onChange={(event) => setAssistantMessage(event.target.value)}
                placeholder="Message setup assistant..."
                className="max-h-32 min-h-12 w-full resize-none bg-transparent px-2 py-1 text-[13px] font-bold text-[#25352E] outline-none placeholder:text-[#A69A8B]"
              />
              <div className="mt-2 flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <label className="inline-flex h-9 w-9 cursor-pointer items-center justify-center rounded-full border border-[#D8CAB9] bg-[#FFF9EF] text-[#6F6254] hover:text-[#25352E]" aria-label="Attach review document">
                    <Plus className="h-4 w-4" />
                    <input
                      type="file"
                      accept=".pdf,.docx,.txt"
                      className="sr-only"
                      onChange={(event) => {
                        const file = event.target.files?.[0];
                        if (file) setAssistantDocumentDraft({ ...assistantDocumentDraft, fileName: file.name, fileUrl: URL.createObjectURL(file) });
                      }}
                    />
                  </label>
                  <select value={assistantDocumentDraft.type} onChange={(event) => setAssistantDocumentDraft({ ...assistantDocumentDraft, type: event.target.value })} className="h-9 max-w-[170px] rounded-full border border-[#D8CAB9] bg-[#FFF9EF] px-3 text-[11px] font-bold text-[#25352E] outline-none">
                    {documentTypes.map((documentType) => (
                      <option key={documentType.type} value={documentType.type}>{documentType.type}</option>
                    ))}
                  </select>
                </div>
                <button
                  type="button"
                  onClick={sendAssistantMessage}
                  disabled={!assistantMessage.trim() && !assistantDocumentDraft.fileName}
                  className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-[#25352E] text-[#FFF9EF] disabled:cursor-not-allowed disabled:bg-[#25352E]/35"
                  aria-label="Send review assistant message"
                >
                  <Sparkles className="h-4 w-4" />
                </button>
              </div>
            </div>
          </div>
        </div>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function AccountOnboardingWorkspace({
  open,
  role,
  sourceFileNames,
  draft,
  suggestions,
  documents,
  kycSections,
  generatedKycDocument,
  kycGenerationLoading,
  kycGenerationError,
  journeyAgentLoading,
  journeyAgentError,
  assistantMessages,
  assistantLoading,
  assistantError,
  documentDraft,
  journey,
  prompt,
  dismissalDraft,
  onOpenChange,
  onDraftChange,
  onAcceptSuggestion,
  onStartDismissSuggestion,
  onDismissReasonChange,
  onConfirmDismissSuggestion,
  onCancelDismissSuggestion,
  onDocumentDraftChange,
  onAddDocument,
  onJourneyChange,
  onAddJourneyItem,
  onDeleteJourneyItem,
  onRunJourneyAgent,
  onGenerateKycDocument,
  onSubmitKycForKam,
  onApproveKycDocument,
  onPromptChange,
  onApplyPrompt,
  onSaveDraft,
  onFinalizeAccount,
}: {
  open: boolean;
  role: Role;
  sourceFileNames: string[];
  draft: AccountDraft;
  suggestions: OnboardingSuggestion[];
  documents: OnboardingDocument[];
  kycSections: KycDraftSection[];
  generatedKycDocument: GeneratedKycDocument | null;
  kycGenerationLoading: boolean;
  kycGenerationError: string;
  journeyAgentLoading: boolean;
  journeyAgentError: string;
  assistantMessages: string[];
  assistantLoading: boolean;
  assistantError: string;
  documentDraft: OnboardingDocumentDraft;
  journey: OnboardingJourneyDraftItem[];
  prompt: string;
  dismissalDraft: SuggestionDismissalDraft | null;
  onOpenChange: (open: boolean) => void;
  onDraftChange: (draft: AccountDraft) => void;
  onAcceptSuggestion: (suggestion: OnboardingSuggestion) => void;
  onStartDismissSuggestion: (suggestionId: string) => void;
  onDismissReasonChange: (reason: string) => void;
  onConfirmDismissSuggestion: () => void;
  onCancelDismissSuggestion: () => void;
  onDocumentDraftChange: (draft: OnboardingDocumentDraft) => void;
  onAddDocument: () => void;
  onJourneyChange: (itemId: string, field: keyof OnboardingJourneyDraftItem, value: string) => void;
  onAddJourneyItem: () => void;
  onDeleteJourneyItem: (itemId: string) => void;
  onRunJourneyAgent: (mode: "generate" | "enhance") => void;
  onGenerateKycDocument: () => void;
  onSubmitKycForKam: () => void;
  onApproveKycDocument: () => void;
  onPromptChange: (prompt: string) => void;
  onApplyPrompt: () => void;
  onSaveDraft: () => void;
  onFinalizeAccount: () => void | Promise<void>;
}) {
  const [activeStep, setActiveStep] = useState<AccountOnboardingStep>("profile");
  const [acceptedKycSections, setAcceptedKycSections] = useState<Set<string>>(() => new Set());
  const [dismissedKycSections, setDismissedKycSections] = useState<Set<string>>(() => new Set());
  const [assistantCollapsed, setAssistantCollapsed] = useState(false);
  const steps = onboardingSteps(sourceFileNames.length, draft, suggestions, documents, journey);
  const dismissedSuggestion = dismissalDraft ? suggestions.find((suggestion) => suggestion.id === dismissalDraft.suggestionId) : undefined;
  const isKam = role === "KAM";
  const acceptedSuggestions = suggestions.filter((suggestion) => suggestion.status === "Accepted");
  const pendingSuggestions = suggestions.filter((suggestion) => suggestion.status === "Pending");
  const setupTabs: Array<{ id: AccountOnboardingStep; label: string }> = [
    { id: "profile", label: "Profile" },
    { id: "kyc", label: "KYC draft" },
    { id: "journey", label: "Journey" },
    { id: "review", label: "Review" },
  ];

  function updateKycSection(sectionId: string, status: "accepted" | "dismissed") {
    if (status === "accepted") {
      setAcceptedKycSections((current) => new Set([...current, sectionId]));
      setDismissedKycSections((current) => {
        const next = new Set(current);
        next.delete(sectionId);
        return next;
      });
      return;
    }
    setDismissedKycSections((current) => new Set([...current, sectionId]));
    setAcceptedKycSections((current) => {
      const next = new Set(current);
      next.delete(sectionId);
      return next;
    });
  }

  function enhanceKycSection(section: KycDraftSection) {
    onPromptChange(`Enhance KYC section: ${section.title}. `);
  }

  function renderProfileStep() {
    return (
      <div className="space-y-4">
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          <AccountDraftField label="Account name" value={draft.name} onChange={(value) => onDraftChange({ ...draft, name: value })} />
          <AccountDraftField label="Industry" value={draft.industry} onChange={(value) => onDraftChange({ ...draft, industry: value })} />
          <AccountDraftField label="Segment" value={draft.segment} onChange={(value) => onDraftChange({ ...draft, segment: value })} />
          <AccountDraftField label="ARR" value={draft.arr} onChange={(value) => onDraftChange({ ...draft, arr: value })} />
          <AccountDraftField label="Location" value={draft.location} onChange={(value) => onDraftChange({ ...draft, location: value })} />
          <AccountDraftField label="Contract renewal" value={draft.contractRenewal} onChange={(value) => onDraftChange({ ...draft, contractRenewal: value })} />
          <AccountDraftField label="KAM owner" value={draft.kamOwner} onChange={(value) => onDraftChange({ ...draft, kamOwner: value })} />
          <AccountDraftField label="Associate owner" value={draft.associateOwner} onChange={(value) => onDraftChange({ ...draft, associateOwner: value })} />
          <AccountDraftField label="Primary contact" value={draft.primaryContact} onChange={(value) => onDraftChange({ ...draft, primaryContact: value })} />
          <AccountDraftField label="Active risk" value={draft.activeRisk} onChange={(value) => onDraftChange({ ...draft, activeRisk: value })} />
          <AccountDraftField label="Open opportunity" value={draft.openOpportunity} onChange={(value) => onDraftChange({ ...draft, openOpportunity: value })} />
          <AccountDraftField label="Next touchpoint" value={draft.nextTouchpoint} onChange={(value) => onDraftChange({ ...draft, nextTouchpoint: value })} />
        </div>
      </div>
    );
  }

  function renderKycStep() {
    return (
      <div className="space-y-4">
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {sourceFileNames.map((fileName) => (
            <div key={fileName} className="rounded-2xl border border-[#E5DACD] bg-[#FFF9EF]/72 p-3">
              <p className="truncate text-[13px] font-black text-[#25352E]">{fileName}</p>
              <p className="mt-2 text-[12px] font-bold text-[#7D6E5F]">Initial source</p>
            </div>
          ))}
          {documents.map((document) => (
            <div key={document.id} className="rounded-2xl border border-[#E5DACD] bg-white/60 p-3">
              <p className="truncate text-[13px] font-black text-[#25352E]">{document.fileName}</p>
              <p className="mt-2 text-[12px] font-bold text-[#7D6E5F]">{document.type}</p>
            </div>
          ))}
        </div>

        <div className="space-y-2">
          {kycSections.map((section) => {
            const sectionStatus = acceptedKycSections.has(section.id) ? "Accepted" : dismissedKycSections.has(section.id) ? "Dismissed" : section.status;
            return (
              <article key={section.id} className="rounded-2xl border border-[#E5DACD] bg-white/62 p-3">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <h3 className="text-[15px] font-black tracking-[-0.03em] text-[#1F2722]">{section.title}</h3>
                    <p className="mt-1 text-[12px] font-bold text-[#7D6E5F]">Source: {section.source}</p>
                  </div>
                  <span className={`rounded-full border px-3 py-1 text-[11px] font-bold ${
                    sectionStatus === "Accepted" ? "border-[#BFE4CE] bg-[#EAF6EF] text-[#238B57]" : sectionStatus === "Dismissed" ? "border-[#F0C6BE] bg-[#FFF0ED] text-[#B33D32]" : "border-[#DEC997] bg-[#FFF7E4] text-[#8A5C16]"
                  }`}>
                    {sectionStatus}
                  </span>
                </div>
                <p className="mt-3 text-[13px] leading-relaxed text-[#25352E]">{section.draft}</p>
                <div className="mt-3 flex flex-wrap gap-2">
                  <button type="button" onClick={() => updateKycSection(section.id, "accepted")} className="rounded-full bg-[#25352E] px-3 py-1.5 text-[12px] font-bold text-[#FFF9EF]">
                    Accept section
                  </button>
                  <button type="button" onClick={() => updateKycSection(section.id, "dismissed")} className="rounded-full border border-[#D8CAB9] bg-white/70 px-3 py-1.5 text-[12px] font-bold text-[#6F6254]">
                    Dismiss
                  </button>
                  <button type="button" onClick={() => enhanceKycSection(section)} className="rounded-full border border-[#D8CAB9] bg-white/70 px-3 py-1.5 text-[12px] font-bold text-[#25352E]">
                    Enhance with assistant
                  </button>
                </div>
              </article>
            );
          })}
        </div>
      </div>
    );
  }

  function renderJourneyStep() {
    return (
      <div className="space-y-3">
        <div className="flex flex-wrap justify-end gap-2">
          <button type="button" onClick={() => onRunJourneyAgent("generate")} disabled={journeyAgentLoading} className="rounded-full border border-[#D8CAB9] bg-white/70 px-3 py-1.5 text-[12px] font-bold text-[#25352E] disabled:cursor-not-allowed disabled:opacity-50">
            Generate with AI
          </button>
          <button type="button" onClick={() => onRunJourneyAgent("enhance")} disabled={journeyAgentLoading} className="rounded-full border border-[#D8CAB9] bg-white/70 px-3 py-1.5 text-[12px] font-bold text-[#25352E] disabled:cursor-not-allowed disabled:opacity-50">
            Enhance with AI
          </button>
          <button type="button" onClick={onAddJourneyItem} className="rounded-full bg-[#25352E] px-3 py-1.5 text-[12px] font-bold text-[#FFF9EF]">
            Add item
          </button>
        </div>
        {journeyAgentLoading ? (
          <div className="rounded-2xl border border-[#DEC997] bg-[#FFF7E4] px-3 py-2 text-[13px] font-bold text-[#8A5C16]">
            Journey agent is updating the plan...
          </div>
        ) : null}
        {journeyAgentError ? (
          <div className="rounded-2xl border border-[#F0C6BE] bg-[#FFF0ED] px-3 py-2 text-[13px] font-bold text-[#B33D32]">
            {journeyAgentError}
          </div>
        ) : null}
        <div className="grid gap-2">
          {journey.map((item) => (
            <div key={item.id} className="grid gap-2 rounded-2xl border border-[#E5DACD] bg-white/60 p-3 md:grid-cols-[130px_1fr_160px_130px_auto]">
              <select value={item.type} onChange={(event) => onJourneyChange(item.id, "type", event.target.value)} className="h-10 rounded-xl border border-[#E1D7CA] bg-[#FFF9EF]/80 px-3 text-[12px] font-bold text-[#25352E]">
                <option value="To-do">To-do</option>
                <option value="Meeting">Meeting</option>
                <option value="QBR">QBR</option>
              </select>
              <input value={item.title} onChange={(event) => onJourneyChange(item.id, "title", event.target.value)} className="h-10 rounded-xl border border-[#E1D7CA] bg-[#FFF9EF]/80 px-3 text-[13px] font-bold text-[#25352E]" />
              <input type="date" value={item.dueDate} onChange={(event) => onJourneyChange(item.id, "dueDate", event.target.value)} className="h-10 rounded-xl border border-[#E1D7CA] bg-[#FFF9EF]/80 px-3 text-[12px] font-bold text-[#25352E]" />
              <input value={item.recurrence} onChange={(event) => onJourneyChange(item.id, "recurrence", event.target.value)} className="h-10 rounded-xl border border-[#E1D7CA] bg-[#FFF9EF]/80 px-3 text-[12px] font-bold text-[#25352E]" />
              <button type="button" onClick={() => onDeleteJourneyItem(item.id)} className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-[#D8CAB9] bg-white/70 text-[#6F6254] hover:text-[#B33D32]" aria-label={`Delete ${item.title}`}>
                <X className="h-4 w-4" />
              </button>
            </div>
          ))}
        </div>
      </div>
    );
  }

  function renderReviewStep() {
    return (
      <div className="grid gap-3 md:grid-cols-2">
        <div className="rounded-2xl border border-[#E5DACD] bg-white/62 p-3">
          <FieldLabel>Initial files</FieldLabel>
          <div className="mt-2 space-y-2">
            {sourceFileNames.map((fileName) => (
              <p key={fileName} className="truncate text-[13px] font-black text-[#25352E]">{fileName}</p>
            ))}
          </div>
        </div>
        <div className="rounded-2xl border border-[#E5DACD] bg-white/62 p-3">
          <FieldLabel>Accepted profile updates</FieldLabel>
          <p className="mt-2 text-[20px] font-black text-[#25352E]">{acceptedSuggestions.length}</p>
        </div>
        <div className="rounded-2xl border border-[#E5DACD] bg-white/62 p-3">
          <FieldLabel>KYC draft sections accepted</FieldLabel>
          <p className="mt-2 text-[20px] font-black text-[#25352E]">{acceptedKycSections.size}/{kycSections.length}</p>
        </div>
        <div className="rounded-2xl border border-[#E5DACD] bg-white/62 p-3">
          <FieldLabel>Journey items</FieldLabel>
          <p className="mt-2 text-[20px] font-black text-[#25352E]">{journey.length}</p>
        </div>
        <div className="rounded-2xl border border-[#E5DACD] bg-white/62 p-3 md:col-span-2">
          <FieldLabel>KYC document handoff</FieldLabel>
          {generatedKycDocument ? (
            <div className="mt-3 rounded-2xl border border-[#E5DACD] bg-[#FFF9EF]/80 p-3">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <a href={generatedKycDocument.fileUrl} target="_blank" rel="noreferrer" className="text-[15px] font-black text-[#25352E] underline-offset-4 hover:underline">
                    {generatedKycDocument.title}
                  </a>
                  <p className="mt-1 text-[12px] font-bold text-[#6F6254]">{generatedKycDocument.summary}</p>
                </div>
                <span className="rounded-full border border-[#D8CAB9] bg-white/70 px-3 py-1 text-[11px] font-bold text-[#25352E]">{generatedKycDocument.approvalStatus}</span>
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                {role === "ASSOCIATE" && generatedKycDocument.approvalStatus === "Draft" ? (
                  <button type="button" onClick={onSubmitKycForKam} className="rounded-full bg-[#25352E] px-3 py-1.5 text-[12px] font-bold text-[#FFF9EF]">
                    Submit to KAM
                  </button>
                ) : null}
                {isKam && generatedKycDocument.approvalStatus !== "Approved" ? (
                  <button type="button" onClick={onApproveKycDocument} className="rounded-full bg-[#25352E] px-3 py-1.5 text-[12px] font-bold text-[#FFF9EF]">
                    Approve KYC
                  </button>
                ) : null}
              </div>
            </div>
          ) : null}
          {kycGenerationError ? (
            <div className="mt-3 rounded-2xl border border-[#F0C6BE] bg-[#FFF0ED] px-3 py-2 text-[13px] font-bold text-[#B33D32]">
              {kycGenerationError}
            </div>
          ) : null}
          <button type="button" onClick={onGenerateKycDocument} disabled={kycGenerationLoading} className="mt-3 rounded-full bg-[#25352E] px-3 py-1.5 text-[12px] font-bold text-[#FFF9EF] disabled:cursor-not-allowed disabled:opacity-50">
            {kycGenerationLoading ? "Generating KYC..." : generatedKycDocument ? "Regenerate KYC" : "Generate KYC document"}
          </button>
        </div>
      </div>
    );
  }

  function renderActiveStep() {
    if (activeStep === "kyc") return renderKycStep();
    if (activeStep === "journey") return renderJourneyStep();
    if (activeStep === "review") return renderReviewStep();
    return renderProfileStep();
  }

  return (
    <Dialog.Root modal={false} open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="pointer-events-none fixed inset-0 z-[70] bg-[#1F2722]/32 backdrop-blur-[3px]" />
        <Dialog.Content
          onInteractOutside={(event) => event.preventDefault()}
          onPointerDownOutside={(event) => event.preventDefault()}
          onFocusOutside={(event) => event.preventDefault()}
          className="fixed left-1/2 top-1/2 z-[80] flex h-[92vh] w-[min(1460px,96vw)] -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-[1.75rem] border border-[#D8CAB9] bg-[#FBF7EF] shadow-[0_34px_110px_-56px_rgba(43,32,19,0.78)] focus:outline-none"
        >
          <div className="flex shrink-0 items-center justify-between gap-3 border-b border-[#E5DACD] bg-[#F7F1E7] px-5 py-4">
            <div>
              <Dialog.Title className="text-[28px] font-black tracking-[-0.06em] text-[#1F2722]">New account setup</Dialog.Title>
              <p className="mt-1 text-[13px] font-bold text-[#6F6254]">{sourceFileNames.length} source file{sourceFileNames.length === 1 ? "" : "s"} loaded</p>
            </div>
            <button
              type="button"
              onClick={() => onOpenChange(false)}
              className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-[#DED1C1] bg-[#FFF9EF]/80 text-[#6F6254] hover:text-[#25352E]"
              aria-label="Close account setup"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className={`grid min-h-0 flex-1 gap-4 overflow-hidden p-4 ${assistantCollapsed ? "lg:grid-cols-[1fr_auto]" : "lg:grid-cols-[minmax(0,1fr)_390px]"}`}>
            <div className="flex min-h-0 min-w-0 flex-col">
              <div className="mb-3 flex flex-wrap gap-2">
                {setupTabs.map((tab) => (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => setActiveStep(tab.id)}
                    className={`rounded-full px-4 py-2 text-[13px] font-bold transition-colors ${
                      activeStep === tab.id ? "bg-[#25352E] text-[#FFF9EF]" : "border border-[#D8CAB9] bg-white/64 text-[#6F6254] hover:text-[#25352E]"
                    }`}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>

              <section className="min-h-0 flex-1 overflow-y-auto rounded-3xl border border-[#E5DACD] bg-white/50 p-4">
                {renderActiveStep()}
              </section>
            </div>

            {assistantCollapsed ? (
              <button
                type="button"
                onClick={() => setAssistantCollapsed(false)}
                className="hidden h-full w-12 items-center justify-center rounded-3xl border border-[#D8CAB9] bg-[#FFF9EF] text-[#25352E] shadow-[0_18px_46px_-34px_rgba(55,43,28,0.58)] lg:flex"
                aria-label="Expand setup assistant"
              >
                <Sparkles className="h-4 w-4" />
              </button>
            ) : (
              <aside className="flex min-h-0 min-w-0 flex-col overflow-hidden rounded-[1.5rem] border border-[#D8CAB9] bg-[#FFF9EF] shadow-[0_18px_46px_-34px_rgba(55,43,28,0.58)]">
                <div className="relative overflow-hidden border-b border-[#E5DACD] bg-[#F7F1E7] px-4 py-4">
                  <div className="pointer-events-none absolute right-[-4rem] top-[-5rem] h-36 w-36 rounded-full bg-[#A7C7B4]/45 blur-2xl" />
                  <div className="relative z-10 flex items-center justify-between gap-3">
                    <div className="flex min-w-0 items-center gap-3">
                      <div className="relative h-10 w-10 shrink-0 rounded-2xl bg-[#25352E]">
                        <span className="absolute left-2 top-2 h-4 w-4 rounded-full bg-[#FFF9EF]" />
                        <span className="absolute bottom-2 right-2 h-3.5 w-3.5 rounded-full bg-[#E8BE86]" />
                        <span className="absolute left-3.5 top-3.5 h-3.5 w-3.5 rounded-full bg-[#A7C7B4]" />
                      </div>
                      <div className="min-w-0">
                        <h2 className="truncate text-[18px] font-black tracking-[-0.04em] text-[#1F2722]">Setup assistant</h2>
                        <p className="text-[12px] font-bold text-[#7D6E5F]">New account setup</p>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => setAssistantCollapsed(true)}
                      className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-[#DED1C1] bg-[#FFF9EF]/80 text-[#6F6254] hover:text-[#25352E]"
                      aria-label="Collapse setup assistant"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>

                <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-4">
                  <div className="flex justify-start">
                    <p className="max-w-[88%] rounded-2xl border border-[#E5DACD] bg-white/70 px-3 py-2 text-[13px] font-bold leading-relaxed text-[#25352E]">
                      I can review uploaded files, suggest field changes, update the draft, and prepare KYC sections. Send instructions or attach more documents below.
                    </p>
                  </div>

                  <div className="rounded-2xl border border-[#E5DACD] bg-white/58 p-3">
                    <div className="flex flex-wrap gap-1.5">
                      {steps.map((step) => (
                        <span key={step.label} className={`rounded-full border px-2 py-1 text-[10px] font-bold ${
                          step.status === "Done" ? "border-[#BFE4CE] bg-[#EAF6EF] text-[#238B57]" : step.status === "Active" ? "border-[#DEC997] bg-[#FFF7E4] text-[#8A5C16]" : "border-[#E1D7CA] bg-white text-[#8A7A69]"
                        }`}>
                          {step.label}
                        </span>
                      ))}
                    </div>
                  </div>

                  {pendingSuggestions.map((suggestion) => (
                    <div key={suggestion.id} className="rounded-2xl border border-[#E5DACD] bg-white/70 p-3">
                      <p className="text-[12px] font-bold text-[#7D6E5F]">{suggestion.label}</p>
                      <p className="mt-1 text-[13px] font-black text-[#25352E]">{suggestion.proposedValue}</p>
                      <p className="mt-1 text-[11px] font-bold text-[#8A7A69]">Source: {suggestion.source}</p>
                      <div className="mt-3 flex gap-2">
                        <button type="button" onClick={() => onAcceptSuggestion(suggestion)} className="rounded-full bg-[#25352E] px-3 py-1.5 text-[12px] font-bold text-[#FFF9EF]">
                          Accept
                        </button>
                        <button type="button" onClick={() => onStartDismissSuggestion(suggestion.id)} className="rounded-full border border-[#D8CAB9] bg-white/70 px-3 py-1.5 text-[12px] font-bold text-[#6F6254]">
                          Dismiss
                        </button>
                      </div>
                    </div>
                  ))}

                  {assistantLoading ? (
                    <div className="rounded-2xl border border-[#DEC997] bg-[#FFF7E4] px-3 py-2 text-[13px] font-bold text-[#8A5C16]">
                      Thinking through the account setup...
                    </div>
                  ) : null}

                  {assistantError ? (
                    <div className="rounded-2xl border border-[#F0C6BE] bg-[#FFF0ED] px-3 py-2 text-[13px] font-bold text-[#B33D32]">
                      {assistantError}
                    </div>
                  ) : null}

                  {assistantMessages.map((message, index) => (
                    <div key={`${message}-${index}`} className="rounded-2xl border border-[#E5DACD] bg-white/70 px-3 py-2 text-[13px] font-bold leading-relaxed text-[#25352E]">
                      {message}
                    </div>
                  ))}

                  {documents.map((document) => (
                    <div key={document.id} className="rounded-2xl border border-[#E5DACD] bg-[#FFF9EF]/70 p-3">
                      <p className="truncate text-[12px] font-black text-[#25352E]">{document.fileName}</p>
                      <p className="mt-1 text-[11px] font-bold text-[#8A7A69]">{document.type} - {document.uploadedAt}</p>
                    </div>
                  ))}
                </div>

                <div className="border-t border-[#E5DACD] bg-[#FFF9EF]/95 p-3">
                  {documentDraft.fileName ? (
                    <div className="mb-2 flex items-center gap-2 rounded-xl border border-[#E5DACD] bg-white/70 px-3 py-2">
                      <FileText className="h-4 w-4 shrink-0 text-[#7D6E5F]" />
                      <p className="min-w-0 flex-1 truncate text-[12px] font-black text-[#25352E]">{documentDraft.fileName}</p>
                      <button type="button" onClick={() => onDocumentDraftChange({ ...documentDraft, fileName: "", fileUrl: "", file: undefined })} className="text-[#9B9084] hover:text-[#25352E]" aria-label="Remove attached setup document">
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  ) : null}
                  <div className="rounded-2xl border border-[#D8CAB9] bg-white/75 p-2">
                    <textarea
                      value={prompt}
                      onChange={(event) => onPromptChange(event.target.value)}
                      placeholder="Message setup assistant..."
                      className="max-h-32 min-h-12 w-full resize-none bg-transparent px-2 py-1 text-[13px] font-bold text-[#25352E] outline-none placeholder:text-[#A69A8B]"
                    />
                    <div className="mt-2 flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <label className="inline-flex h-9 w-9 cursor-pointer items-center justify-center rounded-full border border-[#D8CAB9] bg-[#FFF9EF] text-[#6F6254] hover:text-[#25352E]" aria-label="Attach setup document">
                          <Plus className="h-4 w-4" />
                          <input
                            type="file"
                            accept=".pdf,.docx,.txt"
                            className="sr-only"
                            onChange={(event) => {
                              const file = event.target.files?.[0];
                              if (file) onDocumentDraftChange({ ...documentDraft, fileName: file.name, fileUrl: URL.createObjectURL(file), file });
                            }}
                          />
                        </label>
                        <select value={documentDraft.type} onChange={(event) => onDocumentDraftChange({ ...documentDraft, type: event.target.value })} className="h-9 max-w-[170px] rounded-full border border-[#D8CAB9] bg-[#FFF9EF] px-3 text-[11px] font-bold text-[#25352E] outline-none">
                          {documentTypes.map((documentType) => (
                            <option key={documentType.type} value={documentType.type}>{documentType.type}</option>
                          ))}
                        </select>
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          if (documentDraft.fileName) {
                            onAddDocument();
                            return;
                          }
                          onApplyPrompt();
                        }}
                        disabled={!prompt.trim() && !documentDraft.fileName}
                        className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-[#25352E] text-[#FFF9EF] disabled:cursor-not-allowed disabled:bg-[#25352E]/35"
                        aria-label="Send setup assistant message"
                      >
                        <Sparkles className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                  <div className="mt-3 flex gap-2">
                    <button type="button" onClick={onSaveDraft} className="flex-1 rounded-full border border-[#D8CAB9] bg-white/70 px-3 py-2 text-[12px] font-bold text-[#6F6254]">
                      Save draft
                    </button>
                    <button type="button" onClick={onFinalizeAccount} className="flex-1 rounded-full bg-[#25352E] px-3 py-2 text-[12px] font-bold text-[#FFF9EF]">
                      {isKam ? "Create account" : "Submit to KAM"}
                    </button>
                  </div>
                </div>
              </aside>
            )}
          </div>
          <SuggestionDismissalDialog
            open={Boolean(dismissalDraft)}
            suggestion={dismissedSuggestion}
            reason={dismissalDraft?.reason ?? ""}
            onOpenChange={(nextOpen) => {
              if (!nextOpen) onCancelDismissSuggestion();
            }}
            onReasonChange={onDismissReasonChange}
            onConfirm={onConfirmDismissSuggestion}
            onCancel={onCancelDismissSuggestion}
          />
        </Dialog.Content>
        <div className="hidden pointer-events-auto fixed bottom-8 right-8 z-[95] h-[min(660px,calc(100vh-5rem))] w-[min(420px,92vw)] flex-col overflow-hidden rounded-[1.75rem] border border-[#D8CAB9] bg-[#FFF9EF] shadow-[0_32px_110px_-42px_rgba(31,39,34,0.72)]">
          <div className="relative overflow-hidden border-b border-[#E5DACD] bg-[#F7F1E7] px-4 py-4">
            <div className="pointer-events-none absolute right-[-4rem] top-[-5rem] h-36 w-36 rounded-full bg-[#A7C7B4]/45 blur-2xl" />
            <div className="relative z-10 flex items-center gap-3">
              <div className="relative h-10 w-10 rounded-2xl bg-[#25352E]">
                <span className="absolute left-2 top-2 h-4 w-4 rounded-full bg-[#FFF9EF]" />
                <span className="absolute bottom-2 right-2 h-3.5 w-3.5 rounded-full bg-[#E8BE86]" />
                <span className="absolute left-3.5 top-3.5 h-3.5 w-3.5 rounded-full bg-[#A7C7B4]" />
              </div>
              <div>
                <h2 className="text-[18px] font-black tracking-[-0.04em] text-[#1F2722]">Setup assistant</h2>
                <p className="text-[12px] font-bold text-[#7D6E5F]">New account setup</p>
              </div>
            </div>
          </div>

          <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-4">
            <div className="flex justify-start">
              <p className="max-w-[88%] rounded-2xl border border-[#E5DACD] bg-white/70 px-3 py-2 text-[13px] font-bold leading-relaxed text-[#25352E]">
                I can review uploaded files, suggest field changes, update the draft, and prepare KYC sections. Send instructions or attach more documents below.
              </p>
            </div>

            <div className="rounded-2xl border border-[#E5DACD] bg-white/58 p-3">
              <div className="flex flex-wrap gap-1.5">
                {steps.map((step) => (
                  <span key={step.label} className={`rounded-full border px-2 py-1 text-[10px] font-bold ${
                    step.status === "Done" ? "border-[#BFE4CE] bg-[#EAF6EF] text-[#238B57]" : step.status === "Active" ? "border-[#DEC997] bg-[#FFF7E4] text-[#8A5C16]" : "border-[#E1D7CA] bg-white text-[#8A7A69]"
                  }`}>
                    {step.label}
                  </span>
                ))}
              </div>
            </div>

            {pendingSuggestions.map((suggestion) => (
              <div key={suggestion.id} className="rounded-2xl border border-[#E5DACD] bg-white/70 p-3">
                <p className="text-[12px] font-bold text-[#7D6E5F]">{suggestion.label}</p>
                <p className="mt-1 text-[13px] font-black text-[#25352E]">{suggestion.proposedValue}</p>
                <p className="mt-1 text-[11px] font-bold text-[#8A7A69]">Source: {suggestion.source}</p>
                <div className="mt-3 flex gap-2">
                  <button type="button" onClick={() => onAcceptSuggestion(suggestion)} className="rounded-full bg-[#25352E] px-3 py-1.5 text-[12px] font-bold text-[#FFF9EF]">
                    Accept
                  </button>
                  <button type="button" onClick={() => onStartDismissSuggestion(suggestion.id)} className="rounded-full border border-[#D8CAB9] bg-white/70 px-3 py-1.5 text-[12px] font-bold text-[#6F6254]">
                    Dismiss
                  </button>
                </div>
              </div>
            ))}

            {assistantLoading ? (
              <div className="rounded-2xl border border-[#DEC997] bg-[#FFF7E4] px-3 py-2 text-[13px] font-bold text-[#8A5C16]">
                Thinking through the account setup...
              </div>
            ) : null}

            {assistantError ? (
              <div className="rounded-2xl border border-[#F0C6BE] bg-[#FFF0ED] px-3 py-2 text-[13px] font-bold text-[#B33D32]">
                {assistantError}
              </div>
            ) : null}

            {assistantMessages.map((message, index) => (
              <div key={`${message}-${index}`} className="rounded-2xl border border-[#E5DACD] bg-white/70 px-3 py-2 text-[13px] font-bold leading-relaxed text-[#25352E]">
                {message}
              </div>
            ))}

            {documents.map((document) => (
              <div key={document.id} className="rounded-2xl border border-[#E5DACD] bg-[#FFF9EF]/70 p-3">
                <p className="truncate text-[12px] font-black text-[#25352E]">{document.fileName}</p>
                <p className="mt-1 text-[11px] font-bold text-[#8A7A69]">{document.type} · {document.uploadedAt}</p>
              </div>
            ))}
          </div>

          <div className="border-t border-[#E5DACD] bg-[#FFF9EF]/95 p-3">
            {documentDraft.fileName ? (
              <div className="mb-2 flex items-center gap-2 rounded-xl border border-[#E5DACD] bg-white/70 px-3 py-2">
                <FileText className="h-4 w-4 shrink-0 text-[#7D6E5F]" />
                <p className="min-w-0 flex-1 truncate text-[12px] font-black text-[#25352E]">{documentDraft.fileName}</p>
                <button type="button" onClick={() => onDocumentDraftChange({ ...documentDraft, fileName: "", fileUrl: "", file: undefined })} className="text-[#9B9084] hover:text-[#25352E]" aria-label="Remove attached setup document">
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            ) : null}
            <div className="rounded-2xl border border-[#D8CAB9] bg-white/75 p-2">
              <textarea
                value={prompt}
                onChange={(event) => onPromptChange(event.target.value)}
                placeholder="Message setup assistant..."
                className="max-h-32 min-h-12 w-full resize-none bg-transparent px-2 py-1 text-[13px] font-bold text-[#25352E] outline-none placeholder:text-[#A69A8B]"
              />
              <div className="mt-2 flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <label className="inline-flex h-9 w-9 cursor-pointer items-center justify-center rounded-full border border-[#D8CAB9] bg-[#FFF9EF] text-[#6F6254] hover:text-[#25352E]" aria-label="Attach setup document">
                    <Plus className="h-4 w-4" />
                    <input
                      type="file"
                      accept=".pdf,.docx,.txt"
                      className="sr-only"
                      onChange={(event) => {
                        const file = event.target.files?.[0];
                        if (file) onDocumentDraftChange({ ...documentDraft, fileName: file.name, fileUrl: URL.createObjectURL(file), file });
                      }}
                    />
                  </label>
                  <select value={documentDraft.type} onChange={(event) => onDocumentDraftChange({ ...documentDraft, type: event.target.value })} className="h-9 max-w-[170px] rounded-full border border-[#D8CAB9] bg-[#FFF9EF] px-3 text-[11px] font-bold text-[#25352E] outline-none">
                    {documentTypes.map((documentType) => (
                      <option key={documentType.type} value={documentType.type}>{documentType.type}</option>
                    ))}
                  </select>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    if (documentDraft.fileName) {
                      onAddDocument();
                      return;
                    }
                    onApplyPrompt();
                  }}
                  disabled={!prompt.trim() && !documentDraft.fileName}
                  className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-[#25352E] text-[#FFF9EF] disabled:cursor-not-allowed disabled:bg-[#25352E]/35"
                  aria-label="Send setup assistant message"
                >
                  <Sparkles className="h-4 w-4" />
                </button>
              </div>
            </div>
            <div className="mt-3 flex gap-2">
              <button type="button" onClick={onSaveDraft} className="flex-1 rounded-full border border-[#D8CAB9] bg-white/70 px-3 py-2 text-[12px] font-bold text-[#6F6254]">
                Save draft
              </button>
              <button type="button" onClick={onFinalizeAccount} className="flex-1 rounded-full bg-[#25352E] px-3 py-2 text-[12px] font-bold text-[#FFF9EF]">
                {isKam ? "Create account" : "Submit to KAM"}
              </button>
            </div>
          </div>
        </div>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function CammiePanel({
  role,
  accounts,
  activeAccount,
}: {
  role: Role;
  accounts: PortfolioAccount[];
  activeAccount: PortfolioAccount | null;
}) {
  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState("");
  const [thread, setThread] = useState<CammieMessage[]>([
    { role: "assistant", content: "Cammie is ready for portfolio, account, document, and web research questions." },
  ]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  function cammieAccountPayload(account: PortfolioAccount) {
    return {
      id: account.id,
      name: account.name,
      industry: account.industry,
      region: account.region,
      country: account.country,
      arr: money(account.arr),
      healthScore: account.healthScore,
      health: healthLabel[account.health],
      renewalDays: account.renewalDays,
      kamOwner: account.kamOwner,
      associateOwner: account.associateOwner,
      contactName: account.contactName,
    };
  }

  async function sendMessage() {
    const value = message.trim();
    if (!value || loading) return;
    const nextThread: CammieMessage[] = [...thread, { role: "user", content: value }];
    setThread(nextThread);
    setMessage("");
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/v2/cammie", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          role,
          message: value,
          activeAccount: activeAccount ? cammieAccountPayload(activeAccount) : null,
          accounts: accounts.map(cammieAccountPayload),
          conversation: nextThread.slice(-8),
        }),
      });
      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload.error || "Cammie could not respond");
      }
      const documentNote = payload.generatedDocument
        ? ""
        : payload.intent === "document_request" && payload.documentRequest?.nextAction
          ? `\n\nDocument route: ${payload.documentRequest.nextAction}`
          : "";
      setThread((items) => [
        ...items,
        {
          role: "assistant",
          content: `${String(payload.reply || "I reviewed the current context.")}${documentNote}`,
          artifact: payload.generatedDocument
            ? {
                title: String(payload.generatedDocument.title || "Generated document"),
                fileUrl: String(payload.generatedDocument.fileUrl || ""),
                format: String(payload.generatedDocument.format || "Document"),
                summary: String(payload.generatedDocument.summary || ""),
              }
            : undefined,
        },
      ]);
    } catch (caught) {
      const messageText = caught instanceof Error ? caught.message : "Cammie could not respond";
      setError(messageText);
      setThread((items) => [...items, { role: "assistant", content: "I could not reach the V2 assistant route. Try again after the server is ready." }]);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed bottom-5 right-5 z-[45] flex flex-col items-end">
      {open ? (
        <div className="mb-3 flex h-[min(620px,calc(100vh-7rem))] w-[min(92vw,390px)] flex-col overflow-hidden rounded-[1.75rem] border border-[#D8CAB9] bg-[#FFF9EF] shadow-[0_30px_90px_-42px_rgba(31,39,34,0.72)]">
          <div className="relative overflow-hidden border-b border-[#E5DACD] bg-[#F7F1E7] px-4 py-4">
            <div className="pointer-events-none absolute right-[-4rem] top-[-5rem] h-36 w-36 rounded-full bg-[#A7C7B4]/45 blur-2xl" />
            <div className="relative z-10 flex items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="relative h-11 w-11 rounded-2xl border border-[#D8CAB9] bg-[#25352E] shadow-[0_14px_26px_-20px_rgba(37,53,46,0.9)]">
                  <div className="absolute left-2 top-2 h-5 w-5 rounded-full bg-[#FFF9EF]" />
                  <div className="absolute bottom-2 right-2 h-4 w-4 rounded-full bg-[#E8BE86]" />
                  <div className="absolute left-4 top-4 h-4 w-4 rounded-full bg-[#A7C7B4]" />
                </div>
                <div>
                  <h3 className="text-[18px] font-black tracking-[-0.05em] text-[#1F2722]">Cammie</h3>
                  <p className="text-[12px] font-bold text-[#7D6E5F]">Portfolio and research assistant</p>
                </div>
              </div>
              <button type="button" onClick={() => setOpen(false)} className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-[#DED1C1] bg-white/70 text-[#6F6254]" aria-label="Close Cammie">
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>
          <div className="min-h-0 flex-1 space-y-2 overflow-y-auto p-4">
            {thread.map((item, index) => {
              const userMessage = item.role === "user";
              return (
                <div key={`${item.role}-${item.content}-${index}`} className={`flex ${userMessage ? "justify-end" : "justify-start"}`}>
                  <div className={`max-w-[82%] rounded-2xl px-3 py-2 text-[13px] font-bold leading-relaxed ${
                    userMessage ? "bg-[#25352E] text-[#FFF9EF]" : "border border-[#E5DACD] bg-white/70 text-[#25352E]"
                  }`}>
                    {item.content}
                    {item.artifact?.fileUrl ? (
                      <a
                        href={item.artifact.fileUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="mt-3 block rounded-xl border border-[#D8CAB9] bg-[#FFF9EF] px-3 py-2 text-[#25352E] hover:bg-white"
                      >
                        <span className="block text-[12px] font-black">{item.artifact.title}</span>
                        <span className="mt-1 block text-[11px] font-bold text-[#7D6E5F]">{item.artifact.format}</span>
                        {item.artifact.summary ? <span className="mt-1 block text-[11px] font-bold text-[#6F6254]">{item.artifact.summary}</span> : null}
                      </a>
                    ) : null}
                  </div>
                </div>
              );
            })}
            {loading ? (
              <div className="flex justify-start">
                <p className="max-w-[82%] rounded-2xl border border-[#E5DACD] bg-white/70 px-3 py-2 text-[13px] font-bold leading-relaxed text-[#6F6254]">
                  Thinking...
                </p>
              </div>
            ) : null}
            {error ? (
              <p className="rounded-2xl border border-[#EAB8B0] bg-[#FDEBE8] px-3 py-2 text-[12px] font-bold text-[#B33D32]">{error}</p>
            ) : null}
          </div>
          <div className="border-t border-[#E5DACD] bg-[#FFF9EF]/92 p-3">
            <div className="flex gap-2 rounded-2xl border border-[#E1D7CA] bg-white/72 p-1">
              <input
                value={message}
                onChange={(event) => setMessage(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") sendMessage();
                }}
                className="h-10 min-w-0 flex-1 bg-transparent px-3 text-[13px] font-bold text-[#25352E] outline-none placeholder:text-[#A69A8B]"
                placeholder="Ask about accounts, documents, or the web"
              />
              <button type="button" onClick={sendMessage} disabled={loading} className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#25352E] text-[#FFF9EF] disabled:cursor-not-allowed disabled:opacity-55" aria-label="Send Cammie message">
                <Sparkles className="h-4 w-4" />
              </button>
            </div>
          </div>
        </div>
      ) : null}
      <button
        type="button"
        onClick={() => setOpen((current) => !current)}
        className="group inline-flex h-14 items-center gap-3 rounded-full border border-[#D8CAB9] bg-[#FFF9EF] pl-3 pr-5 text-[#25352E] shadow-[0_18px_42px_-24px_rgba(31,39,34,0.82)] transition-transform hover:-translate-y-0.5"
        aria-label="Open Cammie"
      >
        <span className="relative h-9 w-9 rounded-2xl bg-[#25352E]">
          <span className="absolute left-1.5 top-1.5 h-4 w-4 rounded-full bg-[#FFF9EF]" />
          <span className="absolute bottom-1.5 right-1.5 h-3.5 w-3.5 rounded-full bg-[#E8BE86]" />
          <span className="absolute left-3 top-3 h-3.5 w-3.5 rounded-full bg-[#A7C7B4]" />
        </span>
        <span className="text-[13px] font-black tracking-[-0.02em]">Ask Cammie</span>
      </button>
    </div>
  );
}

export function PortfolioPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { role } = useRole();
  const { fireNotification } = useNotifications();
  const [query, setQuery] = useState("");
  const [healthFilter, setHealthFilter] = useState<PortfolioHealth | "ALL">("ALL");
  const [selectedAccount, setSelectedAccount] = useState<PortfolioAccount | null>(null);
  const [selectedAccountTab, setSelectedAccountTab] = useState<AccountWorkspaceTab>("overview");
  const [createdAccounts, setCreatedAccounts] = useState<PortfolioAccount[]>([]);
  const [persistedAccountsLoaded, setPersistedAccountsLoaded] = useState(false);
  const [accountOverrides, setAccountOverrides] = useState<Record<string, PortfolioAccount>>({});
  const [accountCreationRequests, setAccountCreationRequests] = useState<PendingAccountCreationRequest[]>([]);
  const [accountCreationRequestsLoaded, setAccountCreationRequestsLoaded] = useState(false);
  const [selectedAccountCreationRequestId, setSelectedAccountCreationRequestId] = useState<string | null>(null);
  const [pendingAccountReviewOpen, setPendingAccountReviewOpen] = useState(() => searchParams.get("focus") === "pending-account-draft");
  const [onboardingOpen, setOnboardingOpen] = useState(false);
  const [onboardingStage, setOnboardingStage] = useState<OnboardingStage>("source-upload");
  const [selectedSourceFiles, setSelectedSourceFiles] = useState<File[]>([]);
  const [sourceDocuments, setSourceDocuments] = useState<OnboardingDocument[]>([]);
  const [sourceUploadLoading, setSourceUploadLoading] = useState(false);
  const [sourceUploadError, setSourceUploadError] = useState("");
  const [accountDraft, setAccountDraft] = useState<AccountDraft>(emptyAccountDraft);
  const [onboardingSuggestions, setOnboardingSuggestions] = useState<OnboardingSuggestion[]>([]);
  const [onboardingDocuments, setOnboardingDocuments] = useState<OnboardingDocument[]>([]);
  const [onboardingKycSections, setOnboardingKycSections] = useState<KycDraftSection[]>(kycDraftSections);
  const [generatedKycDocument, setGeneratedKycDocument] = useState<GeneratedKycDocument | null>(null);
  const [kycGenerationLoading, setKycGenerationLoading] = useState(false);
  const [kycGenerationError, setKycGenerationError] = useState("");
  const [journeyAgentLoading, setJourneyAgentLoading] = useState(false);
  const [journeyAgentError, setJourneyAgentError] = useState("");
  const [onboardingAssistantMessages, setOnboardingAssistantMessages] = useState<string[]>([]);
  const [onboardingAssistantLoading, setOnboardingAssistantLoading] = useState(false);
  const [onboardingAssistantError, setOnboardingAssistantError] = useState("");
  const [onboardingDocumentDraft, setOnboardingDocumentDraft] = useState<OnboardingDocumentDraft>({
    type: documentTypes[0].type,
    fileName: "",
    fileUrl: "",
  });
  const [onboardingJourney, setOnboardingJourney] = useState<OnboardingJourneyDraftItem[]>(standardOnboardingJourney);
  const [onboardingPrompt, setOnboardingPrompt] = useState("");
  const [suggestionDismissalDraft, setSuggestionDismissalDraft] = useState<SuggestionDismissalDraft | null>(null);

  const isExecutive = role === "EXECUTIVE" || role === "ADMIN" || role === "MANAGER";
  const demoPortfolioAccounts = portfolioAccounts.map((account) => accountOverrides[account.id] ?? account);
  const demoAssociateAccounts = associatePortfolio.map((account) => accountOverrides[account.id] ?? account);
  const roleAccounts = role === "ASSOCIATE" ? demoAssociateAccounts : [...createdAccounts, ...demoPortfolioAccounts];
  const visibleAccounts = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return roleAccounts.filter((account) => {
      const matchesHealth = healthFilter === "ALL" || account.health === healthFilter;
      const matchesQuery = !normalized || [
        account.name,
        account.industry,
        account.contactName,
      ].some((value) => value.toLowerCase().includes(normalized));
      return matchesHealth && matchesQuery;
    });
  }, [healthFilter, query, roleAccounts]);

  const totalArr = visibleAccounts.reduce((sum, account) => sum + account.arr, 0);
  const upcomingRenewals = visibleAccounts.filter((account) => account.renewalDays <= 90).length;
  const accountHydrationPending = role !== "ASSOCIATE" && !persistedAccountsLoaded;
  const sourceFileNames = sourceDocuments.map((document) => document.fileName);
  const routeFocus = searchParams.get("focus");
  const visibleAccountCreationRequests = role === "ASSOCIATE"
    ? accountCreationRequests.filter((request) => request.creatorRole === "ASSOCIATE" || request.submittedBy === "Aisha Khan" || request.id.endsWith("-associate"))
    : accountCreationRequests;
  const pendingReviewDialogOpen = pendingAccountReviewOpen || routeFocus === "pending-account-draft";
  const selectedAccountCreationRequest =
    visibleAccountCreationRequests.find((request) => request.id === selectedAccountCreationRequestId) ??
    visibleAccountCreationRequests[0] ??
    null;

  function updatePortfolioAccount(updatedAccount: PortfolioAccount) {
    setCreatedAccounts((accounts) => accounts.map((account) => account.id === updatedAccount.id ? updatedAccount : account));
    setAccountOverrides((accounts) => ({ ...accounts, [updatedAccount.id]: updatedAccount }));
    setSelectedAccount((account) => account?.id === updatedAccount.id ? updatedAccount : account);
  }

  function pendingRequestFromDraft(status: "Draft" | "Submitted to KAM"): PendingAccountCreationRequest {
    const draftName = accountDraft.name.trim() || "Untitled account draft";
    const sourceFiles = [...sourceDocuments, ...onboardingDocuments].map((document) => document.fileName);
    return {
      id: `pending-${draftName.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "account"}-${role.toLowerCase()}`,
      submittedBy: role === "ASSOCIATE" ? "Aisha Khan" : accountDraft.kamOwner.trim() || "Sarah Chen",
      submittedAt: "Today",
      creatorRole: role,
      status,
      associateReason: status === "Draft"
        ? "Draft saved from the account onboarding workspace."
        : "Submitted from the account onboarding workspace for KAM review.",
      sourceFiles,
      draft: {
        ...accountDraft,
        name: draftName,
      },
      kycSections: onboardingKycSections,
      journey: onboardingJourney,
    };
  }

  function upsertAccountCreationRequest(request: PendingAccountCreationRequest) {
    setAccountCreationRequests((requests) => [
      request,
      ...requests.filter((item) => item.id !== request.id),
    ]);
    setSelectedAccountCreationRequestId(request.id);
  }

  function updateAccountCreationRequest(request: PendingAccountCreationRequest) {
    setAccountCreationRequests((requests) => requests.map((item) => item.id === request.id ? request : item));
    setSelectedAccountCreationRequestId(request.id);
  }

  function deleteAccountCreationRequest(requestId: string) {
    setAccountCreationRequests((requests) => requests.filter((item) => item.id !== requestId));
    setSelectedAccountCreationRequestId((selectedId) => selectedId === requestId ? null : selectedId);
    setPendingAccountReviewOpen(false);
    if (routeFocus === "pending-account-draft") router.push("/portfolio");
  }

  async function approveAccountCreationRequest(request: PendingAccountCreationRequest) {
    let nextAccount = createPortfolioAccountFromDraft(request.draft);
    const renewalDate = new Date(request.draft.contractRenewal);
    const contractEnd = Number.isNaN(renewalDate.getTime())
      ? new Date(Date.now() + nextAccount.renewalDays * 24 * 60 * 60 * 1000)
      : renewalDate;
    const response = await fetch("/api/accounts", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-role": "KAM",
      },
      body: JSON.stringify({
        name: nextAccount.name,
        industry: nextAccount.industry,
        segment: request.draft.segment.trim() || nextAccount.deliveryModel,
        region: nextAccount.region,
        country: nextAccount.country,
        arr: nextAccount.arr,
        kamOwnerName: request.draft.kamOwner.trim() || nextAccount.kamOwner,
        contractEnd: contractEnd.toISOString(),
      }),
    });
    const payload = await response.json();
    if (!response.ok) {
      throw new Error(payload.error || "Account approval failed");
    }
    upsertCachedApiAccount("KAM", payload.data as CachedApiAccount);

    nextAccount = {
      ...nextAccount,
      ...mapApiAccountToPortfolioAccount(payload.data as Record<string, unknown>),
      contactName: nextAccount.contactName,
      currentWork: nextAccount.currentWork,
      relationshipSignal: nextAccount.relationshipSignal,
    };
    saveAccountRuntimeMetadata(nextAccount, {
      accountId: nextAccount.id,
      accountName: nextAccount.name,
      primaryContact: request.draft.primaryContact.trim() || nextAccount.contactName,
      sourceFiles: request.sourceFiles,
      kycSections: request.kycSections ?? [],
      journey: request.journey ?? [],
    });
    setCreatedAccounts((accounts) => [nextAccount, ...accounts.filter((account) => account.id !== nextAccount.id)]);
    setAccountCreationRequests((requests) => requests.filter((item) => item.id !== request.id));
    setSelectedAccountCreationRequestId(null);
    setPendingAccountReviewOpen(false);
    setSelectedAccountTab("overview");
    setSelectedAccount(nextAccount);
    fireNotification({
      id: `account-approved-${request.id}`,
      title: `${nextAccount.name} account approved`,
      detail: "The submitted account was created and added to the portfolio.",
      href: `/portfolio?focus=account-created&target=${nextAccount.id}`,
      source: "account-creation-approval",
      severity: "success",
    });
    if (routeFocus === "pending-account-draft") router.push("/portfolio");
  }

  useEffect(() => {
    try {
      const stored = localStorage.getItem(LS_ACCOUNT_CREATION_REQUESTS);
      const parsed = stored ? JSON.parse(stored) as PendingAccountCreationRequest[] : [];
      setAccountCreationRequests(Array.isArray(parsed) ? parsed.filter((request) => request.id !== "pending-novagrid") : []);
    } catch {
      setAccountCreationRequests([]);
    } finally {
      setAccountCreationRequestsLoaded(true);
    }
  }, []);

  useEffect(() => {
    if (!accountCreationRequestsLoaded) return;
    try {
      localStorage.setItem(LS_ACCOUNT_CREATION_REQUESTS, JSON.stringify(accountCreationRequests));
    } catch {
      // No-op for restricted browser storage.
    }
  }, [accountCreationRequests, accountCreationRequestsLoaded]);

  useEffect(() => {
    const pendingRequest = accountCreationRequests.find((request) => request.status === "Submitted to KAM");
    if (pendingRequest && role !== "ASSOCIATE") {
      fireNotification({
        id: `account-draft-${pendingRequest.id}`,
        title: `${pendingRequest.draft.name} account draft needs review`,
        detail: `${pendingRequest.submittedBy} submitted an account creation package.`,
        href: "/portfolio?focus=pending-account-draft",
        source: "account-creation-approval",
        severity: "warning",
        createdAt: "Today",
      });
    }

    const watchedAccount = portfolioAccounts.find((account) => account.id === "v2-acct-maersk");
    if (watchedAccount && watchedAccount.health !== "HEALTHY") {
      fireNotification({
        id: `score-drop-${watchedAccount.id}`,
        title: `${watchedAccount.name} risk score fell`,
        detail: `Score ${watchedAccount.healthScore}/100. Review the proposed mitigation task.`,
        href: `/portfolio?focus=risk-score&target=${watchedAccount.id}`,
        source: "score-monitor",
        severity: "warning",
        createdAt: "Today",
      });
    }
  }, [accountCreationRequests, fireNotification, role]);

  useEffect(() => {
    let cancelled = false;
    async function loadPersistedAccounts() {
      const cachedAccounts = readCachedApiAccounts(role);
      if (cachedAccounts) {
        setCreatedAccounts(mapApiAccountsToCreatedPortfolioAccounts(cachedAccounts));
        setPersistedAccountsLoaded(true);
      } else {
        setPersistedAccountsLoaded(false);
      }
      try {
        const response = await fetch("/api/accounts", { headers: { "x-role": role } });
        const payload = await response.json();
        if (!response.ok) return;
        const apiAccounts = Array.isArray(payload.data) ? payload.data as CachedApiAccount[] : [];
        writeCachedApiAccounts(role, apiAccounts);
        const accounts = mapApiAccountsToCreatedPortfolioAccounts(apiAccounts);
        if (!cancelled) setCreatedAccounts(accounts);
      } catch {
        if (!cancelled && !cachedAccounts) setCreatedAccounts((accounts) => accounts);
      } finally {
        if (!cancelled) setPersistedAccountsLoaded(true);
      }
    }
    void loadPersistedAccounts();
    return () => {
      cancelled = true;
    };
  }, [role]);

  useEffect(() => {
    if (routeFocus === "pending-account-draft") {
      setSelectedAccount(null);
      setPendingAccountReviewOpen(true);
      return;
    }
  }, [routeFocus]);

  useEffect(() => {
    function openFromNotification(event: Event) {
      const href = (event as CustomEvent<{ href?: string }>).detail?.href;
      if (!href) return;
      const target = new URL(href, window.location.origin);
      const focusTarget = target.searchParams.get("focus");
      if (focusTarget === "pending-account-draft") {
        setSelectedAccount(null);
        setPendingAccountReviewOpen(true);
        return;
      }

      const accountTarget = target.searchParams.get("target") ?? target.searchParams.get("account");
      if (!accountTarget) return;
      const account = [...createdAccounts, ...portfolioAccounts, ...associatePortfolio].find((item) => (
        item.id === accountTarget || item.name.toLowerCase().replace(/\s+/g, "-") === accountTarget.replace(/^acc-/, "")
      ));
      if (!account) return;
      setSelectedAccountTab("overview");
      setSelectedAccount(account);
    }

    window.addEventListener("kam:notification-selected", openFromNotification);
    return () => window.removeEventListener("kam:notification-selected", openFromNotification);
  }, [createdAccounts]);

  function resetOnboardingState() {
    setOnboardingStage("source-upload");
    setSelectedSourceFiles([]);
    setSourceDocuments([]);
    setSourceUploadLoading(false);
    setSourceUploadError("");
    setAccountDraft(emptyAccountDraft);
    setOnboardingSuggestions([]);
    setOnboardingDocuments([]);
    setOnboardingKycSections(kycDraftSections);
    setGeneratedKycDocument(null);
    setKycGenerationLoading(false);
    setKycGenerationError("");
    setJourneyAgentLoading(false);
    setJourneyAgentError("");
    setOnboardingAssistantMessages([]);
    setOnboardingAssistantLoading(false);
    setOnboardingAssistantError("");
    setOnboardingDocumentDraft({
      type: documentTypes[0].type,
      fileName: "",
      fileUrl: "",
    });
    setOnboardingJourney(standardOnboardingJourney);
    setOnboardingPrompt("");
    setSuggestionDismissalDraft(null);
  }

  function openOnboarding() {
    resetOnboardingState();
    setOnboardingOpen(true);
  }

  async function uploadOnboardingDocuments(files: File[], type: string) {
    const formData = new FormData();
    files.forEach((file) => formData.append("files", file));
    formData.append("type", type);

    const response = await fetch("/api/v2/onboarding/documents/upload", {
      method: "POST",
      body: formData,
    });
    const payload = await response.json();
    if (!response.ok) {
      throw new Error(payload.error || "Document upload failed");
    }
    const documents = Array.isArray(payload.documents) ? (payload.documents as OnboardingDocument[]) : [];
    return documents.map((document) => {
      const matchingFile = files.find((file) => file.name === document.fileName);
      return {
        ...document,
        fileUrl: document.fileUrl || (matchingFile ? URL.createObjectURL(matchingFile) : ""),
      };
    });
  }

  async function continueFromSourceUpload() {
    if (selectedSourceFiles.length === 0 || sourceUploadLoading) return;
    setSourceUploadLoading(true);
    setSourceUploadError("");
    let uploadedSources: OnboardingDocument[] = [];
    try {
      uploadedSources = await uploadOnboardingDocuments(selectedSourceFiles, "Account source");
      setSourceDocuments(uploadedSources);
    } catch (error) {
      setSourceUploadError(error instanceof Error ? error.message : "Source upload failed");
      setSourceUploadLoading(false);
      return;
    }
    setOnboardingStage("workspace");
    setSourceUploadLoading(false);
    void runOnboardingAssistant("Review the uploaded source files and propose the first account profile, KYC, and journey updates.", onboardingDocuments, uploadedSources);
  }

  function acceptOnboardingSuggestion(suggestion: OnboardingSuggestion) {
    setAccountDraft((draft) => ({ ...draft, [suggestion.field]: suggestion.proposedValue }));
    setOnboardingSuggestions((items) =>
      items.map((item) => (item.id === suggestion.id ? { ...item, status: "Accepted" } : item)),
    );
  }

  function startDismissSuggestion(suggestionId: string) {
    setSuggestionDismissalDraft({ suggestionId, reason: "" });
  }

  function updateDismissReason(reason: string) {
    setSuggestionDismissalDraft((draft) => (draft ? { ...draft, reason } : draft));
  }

  function cancelDismissSuggestion() {
    setSuggestionDismissalDraft(null);
  }

  function confirmDismissSuggestion() {
    const reason = suggestionDismissalDraft?.reason.trim();
    if (!suggestionDismissalDraft || !reason) return;
    setOnboardingSuggestions((items) =>
      items.map((item) =>
        item.id === suggestionDismissalDraft.suggestionId
          ? { ...item, status: "Dismissed", dismissalReason: reason }
          : item,
      ),
    );
    setSuggestionDismissalDraft(null);
  }

  async function runOnboardingAssistant(promptOverride?: string, documentsOverride?: OnboardingDocument[], sourceDocumentsOverride?: OnboardingDocument[]) {
    const prompt = (promptOverride ?? onboardingPrompt).trim();
    const activeSourceDocuments = sourceDocumentsOverride ?? sourceDocuments;
    setOnboardingAssistantLoading(true);
    setOnboardingAssistantError("");
    try {
      const response = await fetch("/api/v2/onboarding/assistant", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          role,
          sourceFiles: activeSourceDocuments.map((document) => document.fileName),
          prompt,
          draft: accountDraft,
          documents: [...activeSourceDocuments, ...(documentsOverride ?? onboardingDocuments)].map((document) => ({
            fileName: document.fileName,
            type: document.type,
            uploadedAt: document.uploadedAt,
            extractedText: document.extractedText?.slice(0, 5000),
            preview: document.preview,
            charCount: document.charCount,
          })),
          journey: onboardingJourney.map((item) => ({
            type: item.type,
            title: item.title,
            dueDate: item.dueDate,
            recurrence: item.recurrence,
          })),
        }),
      });

      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload.error || "Setup assistant failed");
      }

      if (payload.assistantReply) {
        setOnboardingAssistantMessages((messages) => [String(payload.assistantReply), ...messages]);
      }
      if (Array.isArray(payload.missingQuestions) && payload.missingQuestions.length > 0) {
        setOnboardingAssistantMessages((messages) => [
          `Missing information: ${payload.missingQuestions.map(String).join(" ")}`,
          ...messages,
        ]);
      }
      if (Array.isArray(payload.suggestions) && payload.suggestions.length > 0) {
        setOnboardingSuggestions((items) => [
          ...payload.suggestions.map((suggestion: Partial<OnboardingSuggestion>, index: number) => ({
            id: `agent-suggest-${Date.now()}-${index}`,
            field: normalizeAccountDraftField(suggestion.field),
            label: suggestion.label ?? "Suggested update",
            proposedValue: suggestion.proposedValue ?? "",
            source: suggestion.source ?? "V2 setup assistant",
            status: "Pending" as OnboardingSuggestionStatus,
          })),
          ...items,
        ]);
      }
      if (Array.isArray(payload.kycSections) && payload.kycSections.length > 0) {
        const timestamp = Date.now();
        const incomingSections: KycDraftSection[] = payload.kycSections.map((section: Partial<KycDraftSection>, index: number) => ({
          id: `agent-kyc-${timestamp}-${index}`,
          title: section.title ?? "KYC section",
          source: section.source ?? "V2 setup assistant",
          status: section.status === "Ready" ? "Ready" : "Needs input",
          draft: section.draft ?? "",
        }));
        setOnboardingKycSections((sections) => {
          const nextSections = [...sections];
          incomingSections.forEach((incomingSection) => {
            const matchIndex = nextSections.findIndex((section) => section.title.trim().toLowerCase() === incomingSection.title.trim().toLowerCase());
            if (matchIndex >= 0) {
              nextSections[matchIndex] = {
                ...nextSections[matchIndex],
                ...incomingSection,
                id: nextSections[matchIndex].id,
              };
              return;
            }
            nextSections.push(incomingSection);
          });
          return nextSections;
        });
      }
      if (Array.isArray(payload.journeyItems) && payload.journeyItems.length > 0) {
        setOnboardingJourney((items) => [
          ...items,
          ...payload.journeyItems.map((item: Partial<OnboardingJourneyDraftItem>, index: number) => ({
            id: `agent-journey-${Date.now()}-${index}`,
            type: item.type === "Meeting" || item.type === "QBR" ? item.type : "To-do",
            title: item.title ?? "Suggested journey item",
            dueDate: item.dueDate ?? "2026-06-30",
            recurrence: item.recurrence ?? "Once",
          })),
        ]);
      }
      setOnboardingPrompt("");
    } catch (error) {
      setOnboardingAssistantError(error instanceof Error ? error.message : "Setup assistant failed");
    } finally {
      setOnboardingAssistantLoading(false);
    }
  }

  async function addOnboardingDocument() {
    if (!onboardingDocumentDraft.fileName) return;
    const draftFile = onboardingDocumentDraft.file;
    let uploadedDocuments: OnboardingDocument[] = [];
    if (draftFile) {
      try {
        uploadedDocuments = await uploadOnboardingDocuments([draftFile], onboardingDocumentDraft.type);
      } catch (error) {
        setOnboardingAssistantError(error instanceof Error ? error.message : "Support document upload failed");
        return;
      }
    } else {
      uploadedDocuments = [{
        id: `setup-doc-${Date.now()}`,
        type: onboardingDocumentDraft.type,
        fileName: onboardingDocumentDraft.fileName,
        fileUrl: onboardingDocumentDraft.fileUrl,
        uploadedAt: "Today",
      }];
    }
    const documentName = uploadedDocuments[0]?.fileName ?? onboardingDocumentDraft.fileName;
    const nextDocuments = [...uploadedDocuments, ...onboardingDocuments];
    setOnboardingDocuments(nextDocuments);
    setOnboardingDocumentDraft({
      type: documentTypes[0].type,
      fileName: "",
      fileUrl: "",
      file: undefined,
    });
    void runOnboardingAssistant(`Review the newly attached ${onboardingDocumentDraft.type}: ${documentName}. Propose only updates that are supported by this document metadata and current draft context.`, nextDocuments);
  }

  function updateJourneyItem(itemId: string, field: keyof OnboardingJourneyDraftItem, value: string) {
    setOnboardingJourney((items) => items.map((item) => (item.id === itemId ? { ...item, [field]: value } : item)));
  }

  function addJourneyItem() {
    setOnboardingJourney((items) => [
      ...items,
      {
        id: `journey-new-${Date.now()}`,
        type: "To-do",
        title: "New journey item",
        dueDate: "2026-06-30",
        recurrence: "Once",
      },
    ]);
  }

  function deleteJourneyItem(itemId: string) {
    setOnboardingJourney((items) => items.filter((item) => item.id !== itemId));
  }

  async function runJourneyAgent(mode: "generate" | "enhance") {
    setJourneyAgentLoading(true);
    setJourneyAgentError("");
    try {
      const response = await fetch("/api/v2/onboarding/journey", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          role,
          mode,
          prompt: onboardingPrompt,
          draft: accountDraft,
          documents: [...sourceDocuments, ...onboardingDocuments].map((document) => ({
            fileName: document.fileName,
            type: document.type,
            preview: document.preview,
            extractedText: document.extractedText?.slice(0, 5000),
          })),
          journey: onboardingJourney.map((item) => ({
            type: item.type,
            title: item.title,
            dueDate: item.dueDate,
            recurrence: item.recurrence,
          })),
        }),
      });
      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload.error || "Journey agent failed");
      }
      if (Array.isArray(payload.journeyItems) && payload.journeyItems.length > 0) {
        setOnboardingJourney(
          payload.journeyItems.map((item: Partial<OnboardingJourneyDraftItem>, index: number) => ({
            id: `journey-agent-${Date.now()}-${index}`,
            type: item.type === "Meeting" || item.type === "QBR" ? item.type : "To-do",
            title: item.title ?? "Journey item",
            dueDate: item.dueDate ?? "2026-06-30",
            recurrence: item.recurrence ?? "Once",
          })),
        );
      }
      if (payload.assistantReply) {
        setOnboardingAssistantMessages((messages) => [String(payload.assistantReply), ...messages]);
      }
      setOnboardingPrompt("");
    } catch (error) {
      setJourneyAgentError(error instanceof Error ? error.message : "Journey agent failed");
    } finally {
      setJourneyAgentLoading(false);
    }
  }

  async function generateKycDocument() {
    setKycGenerationLoading(true);
    setKycGenerationError("");
    try {
      const response = await fetch("/api/v2/onboarding/kyc/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          role,
          draft: accountDraft,
          sourceFiles: sourceFileNames,
          documents: [...sourceDocuments, ...onboardingDocuments].map((document) => ({
            fileName: document.fileName,
            type: document.type,
            preview: document.preview,
            extractedText: document.extractedText?.slice(0, 5000),
          })),
          kycSections: onboardingKycSections,
          journey: onboardingJourney.map((item) => ({
            type: item.type,
            title: item.title,
            dueDate: item.dueDate,
            recurrence: item.recurrence,
          })),
        }),
      });
      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload.error || "KYC generation failed");
      }
      setGeneratedKycDocument(payload as GeneratedKycDocument);
      setOnboardingAssistantMessages((messages) => [`Generated final KYC document: ${payload.title}`, ...messages]);
    } catch (error) {
      setKycGenerationError(error instanceof Error ? error.message : "KYC generation failed");
    } finally {
      setKycGenerationLoading(false);
    }
  }

  function submitKycForKam() {
    setGeneratedKycDocument((document) => document ? { ...document, approvalStatus: "Submitted to KAM" } : document);
    setOnboardingAssistantMessages((messages) => ["KYC document submitted to KAM for approval.", ...messages]);
    fireNotification({
      id: `kyc-submitted-${accountDraft.name || "new-account"}`,
      title: "KYC draft submitted for KAM review",
      detail: `${accountDraft.name || "New account"} KYC is waiting for approval.`,
      href: "/portfolio?focus=pending-account-draft",
      source: "kyc-approval",
      severity: "warning",
    });
  }

  function approveKycDocument() {
    setGeneratedKycDocument((document) => document ? { ...document, approvalStatus: "Approved" } : document);
    setOnboardingAssistantMessages((messages) => ["KYC document approved.", ...messages]);
    fireNotification({
      id: `kyc-approved-${accountDraft.name || "new-account"}`,
      title: "KYC draft approved",
      detail: `${accountDraft.name || "New account"} KYC has been approved.`,
      href: "/portfolio?focus=pending-account-draft",
      source: "kyc-approval",
      severity: "success",
    });
  }

  function applyOnboardingPrompt() {
    void runOnboardingAssistant();
  }

  function saveOnboardingDraft() {
    const request = pendingRequestFromDraft("Draft");
    upsertAccountCreationRequest(request);
    setOnboardingAssistantMessages((messages) => [`Account setup draft saved: ${request.draft.name}.`, ...messages]);
    fireNotification({
      id: `account-draft-saved-${request.id}`,
      title: `${request.draft.name} draft saved`,
      detail: "The draft is available in pending account creations.",
      href: "/portfolio?focus=pending-account-draft",
      source: "account-onboarding",
      severity: "info",
    });
    setOnboardingOpen(false);
    setPendingAccountReviewOpen(true);
  }

  function createPortfolioAccountFromDraft(draftInput: AccountDraft = accountDraft): PortfolioAccount {
    const arr = parseArrValue(draftInput.arr);
    const name = draftInput.name.trim() || "New account";
    const [countryPart, regionPart] = accountDraft.location.split("·").map((part) => part.trim());
    return {
      id: `v2-acct-created-${Date.now()}`,
      name,
      industry: draftInput.industry.trim() || "Industry not set",
      region: regionPart || "Region not set",
      country: draftInput.location.trim() || countryPart || "Country not set",
      arr,
      health: "HEALTHY",
      healthScore: 80,
      renewalDays: 180,
      kamOwner: draftInput.kamOwner.trim() || "Sarah Chen",
      associateOwner: draftInput.associateOwner.trim() || "Aisha Khan",
      contactName: draftInput.primaryContact.trim() || "Primary contact not set",
      deliveryModel: draftInput.segment.trim() || "Delivery model not set",
      currentWork: draftInput.openOpportunity.trim() || "Account setup in progress",
      relationshipSignal: draftInput.nextTouchpoint.trim() || "Next touchpoint not set",
    };
  }

  async function finalizeOnboardingAccount() {
    if (role === "KAM") {
      let nextAccount = createPortfolioAccountFromDraft();
      try {
        const response = await fetch("/api/accounts", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-role": role,
          },
          body: JSON.stringify({
            name: nextAccount.name,
            industry: nextAccount.industry,
            segment: accountDraft.segment.trim() || nextAccount.deliveryModel,
            region: nextAccount.region,
            country: nextAccount.country,
            arr: nextAccount.arr,
            kamOwnerName: accountDraft.kamOwner.trim() || nextAccount.kamOwner,
            contractEnd: new Date(Date.now() + nextAccount.renewalDays * 24 * 60 * 60 * 1000).toISOString(),
          }),
        });
        const payload = await response.json();
        if (response.ok) {
          upsertCachedApiAccount(role, payload.data as CachedApiAccount);
          nextAccount = {
            ...nextAccount,
            ...mapApiAccountToPortfolioAccount(payload.data as Record<string, unknown>),
            contactName: nextAccount.contactName,
            currentWork: nextAccount.currentWork,
            relationshipSignal: nextAccount.relationshipSignal,
          };
          saveAccountRuntimeMetadata(nextAccount, {
            accountId: nextAccount.id,
            accountName: nextAccount.name,
            primaryContact: accountDraft.primaryContact.trim() || nextAccount.contactName,
            sourceFiles: [...sourceDocuments, ...onboardingDocuments].map((document) => document.fileName),
            kycSections: onboardingKycSections,
            journey: onboardingJourney,
          });
        }
      } catch {
        // Keep the in-session account available if persistence is temporarily unavailable.
      }
      saveAccountRuntimeMetadata(nextAccount, {
        accountId: nextAccount.id,
        accountName: nextAccount.name,
        primaryContact: accountDraft.primaryContact.trim() || nextAccount.contactName,
        sourceFiles: [...sourceDocuments, ...onboardingDocuments].map((document) => document.fileName),
        kycSections: onboardingKycSections,
        journey: onboardingJourney,
      });
      setCreatedAccounts((accounts) => [nextAccount, ...accounts]);
      setOnboardingAssistantMessages((messages) => [`Created account: ${nextAccount.name}.`, ...messages]);
      fireNotification({
        id: `account-created-${nextAccount.id}`,
        title: `${nextAccount.name} account created`,
        detail: "The new account is now available in the portfolio.",
        href: `/portfolio?focus=account-created&target=${nextAccount.id}`,
        source: "account-onboarding",
        severity: "success",
      });
      setOnboardingOpen(false);
      setSelectedAccountTab("overview");
      setSelectedAccount(nextAccount);
      return;
    }
    const submittedRequest = pendingRequestFromDraft("Submitted to KAM");
    upsertAccountCreationRequest(submittedRequest);
    setOnboardingAssistantMessages((messages) => ["Account creation submitted to KAM for review.", ...messages]);
    fireNotification({
      id: `account-submitted-${submittedRequest.id}`,
      title: "Account creation submitted",
      detail: `${submittedRequest.draft.name} is waiting for KAM review.`,
      href: "/portfolio?focus=pending-account-draft",
      source: "account-onboarding",
      severity: "warning",
    });
    setOnboardingOpen(false);
    setPendingAccountReviewOpen(true);
  }

  return (
    <main className="min-h-screen bg-[var(--bg-gradient)] px-5 py-6 text-[var(--text-primary)]">
      <section className="mx-auto max-w-[1500px] space-y-5">
        <div className="relative overflow-hidden rounded-[2rem] border border-[#E6DDCF] bg-[#F7F1E7] p-6 text-[#26312D] shadow-[0_22px_70px_-38px_rgba(75,62,45,0.42),inset_0_1px_0_rgba(255,255,255,0.72)]">
          <div className="absolute inset-0 bg-[linear-gradient(135deg,rgba(255,250,241,0.96)_0%,rgba(245,235,218,0.88)_48%,rgba(223,239,229,0.72)_100%)]" />
          <div className="absolute right-[-7rem] top-[-11rem] h-[27rem] w-[27rem] rounded-full bg-[#A7C7B4]/38 blur-3xl" />
          <div className="absolute bottom-[-9rem] left-[28%] h-[22rem] w-[22rem] rounded-full bg-[#E8BE86]/28 blur-3xl" />
          <div className="absolute left-0 top-0 h-full w-full opacity-[0.18] [background-image:radial-gradient(rgba(65,51,35,0.22)_1px,transparent_1px)] [background-size:18px_18px]" />
          <div className="relative z-10 space-y-7">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
              <h1 className="max-w-3xl text-5xl font-black leading-[0.95] tracking-[-0.06em] text-[#1F2722] md:text-7xl">Portfolio</h1>
              <Button
                disabled={isExecutive}
                onClick={openOnboarding}
                className="w-fit rounded-full bg-[#25352E] px-5 text-[#FFF9EF] shadow-[0_14px_30px_-18px_rgba(37,53,46,0.85)] hover:bg-[#1D2A24] disabled:bg-[#25352E]/30 disabled:text-[#FFF9EF]/65 sm:mt-2"
                size="lg"
              >
                <Plus className="h-4 w-4" />
                Account
              </Button>
            </div>

            <div className="grid gap-3 sm:grid-cols-3">
              <div className="rounded-2xl border border-[#DED1C1] bg-[#FFF9EF]/58 p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.75)]">
                <p className="text-[13px] font-bold text-[#8A7A69]">Accounts</p>
                <p className="mt-2 text-3xl font-black text-[#25352E]">{accountHydrationPending ? "..." : visibleAccounts.length}</p>
              </div>
              <div className="rounded-2xl border border-[#DED1C1] bg-[#FFF9EF]/58 p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.75)]">
                <p className="text-[13px] font-bold text-[#8A7A69]">ARR</p>
                <p className="mt-2 text-3xl font-black text-[#25352E]">{accountHydrationPending ? "..." : money(totalArr)}</p>
              </div>
              <div className="rounded-2xl border border-[#DED1C1] bg-[#FFF9EF]/58 p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.75)]">
                <p className="text-[13px] font-bold text-[#8A7A69]">Renewals &lt;90d</p>
                <p className="mt-2 text-3xl font-black text-[#25352E]">{accountHydrationPending ? "..." : upcomingRenewals}</p>
              </div>
            </div>
          </div>
        </div>

        {role === "KAM" || role === "ASSOCIATE" ? (
          <section className="rounded-[1.5rem] border border-[#E5DACD] bg-[#FFF9EF]/78 p-4 shadow-[0_18px_46px_-34px_rgba(55,43,28,0.58)]">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 className="text-[18px] font-black tracking-[-0.04em] text-[#1F2722]">Pending account creations</h2>
              <span className="rounded-full border border-[#D8CAB9] bg-white/70 px-3 py-1 text-[12px] font-bold text-[#6F6254]">{visibleAccountCreationRequests.length} draft{visibleAccountCreationRequests.length === 1 ? "" : "s"}</span>
            </div>
            <div className="mt-3 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {visibleAccountCreationRequests.map((request) => (
                <button
                  key={request.id}
                  type="button"
                  onClick={() => {
                    setSelectedAccountCreationRequestId(request.id);
                    setPendingAccountReviewOpen(true);
                  }}
                  className="rounded-3xl border border-[#E5DACD] bg-white/62 p-4 text-left transition-colors hover:bg-white"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-[16px] font-black tracking-[-0.04em] text-[#1F2722]">{request.draft.name}</p>
                      <p className="mt-1 text-[13px] font-bold text-[#6F6254]">{request.submittedBy} - {request.submittedAt}</p>
                    </div>
                    <span className="rounded-full border border-[#DEC997] bg-[#FFF7E4] px-3 py-1 text-[11px] font-bold text-[#8A5C16]">{request.status ?? "Draft"}</span>
                  </div>
                  <div className="mt-4 grid grid-cols-3 gap-2">
                    <div className="rounded-2xl border border-[#E5DACD] bg-[#FFF9EF]/70 p-3">
                      <p className="text-[11px] font-bold text-[#7D6E5F]">ARR</p>
                      <p className="mt-1 text-[15px] font-black text-[#25352E]">{request.draft.arr}</p>
                    </div>
                    <div className="rounded-2xl border border-[#E5DACD] bg-[#FFF9EF]/70 p-3">
                      <p className="text-[11px] font-bold text-[#7D6E5F]">Industry</p>
                      <p className="mt-1 truncate text-[13px] font-black text-[#25352E]">{request.draft.industry}</p>
                    </div>
                    <div className="rounded-2xl border border-[#E5DACD] bg-[#FFF9EF]/70 p-3">
                      <p className="text-[11px] font-bold text-[#7D6E5F]">Files</p>
                      <p className="mt-1 text-[15px] font-black text-[#25352E]">{request.sourceFiles.length}</p>
                    </div>
                  </div>
                </button>
              ))}
            </div>
            {visibleAccountCreationRequests.length === 0 ? (
              <div className="mt-3 rounded-2xl border border-dashed border-[#D8CAB9] bg-white/50 p-4 text-[13px] font-bold text-[#7D6E5F]">
                No account drafts or Associate submissions are waiting for review.
              </div>
            ) : null}
          </section>
        ) : null}

        <section className="max-h-[min(760px,calc(100vh-7rem))] overflow-hidden rounded-[1.5rem] border border-[var(--glass-border)] bg-[var(--glass-bg)] shadow-[var(--glass-shadow)] [backdrop-filter:var(--glass-blur)]">
          <div className="sticky top-0 z-20 border-b border-[var(--border-subtle)] bg-[rgba(250,247,241,0.9)] p-4 shadow-[0_12px_28px_-26px_rgba(19,25,31,0.45)] [backdrop-filter:blur(16px)]">
            <div className="grid gap-3 lg:grid-cols-[1fr_auto]">
              <label className="flex h-11 items-center gap-3 rounded-2xl border border-[var(--border-subtle)] bg-white/65 px-4">
                <Search className="h-4 w-4 text-[var(--text-muted)]" />
                <input
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Search account, industry, or contact name..."
                  className="h-full flex-1 bg-transparent text-[13px] font-medium text-[var(--text-primary)] outline-none placeholder:text-[var(--text-muted)]"
                />
              </label>

              <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-[var(--border-subtle)] bg-white/55 p-1">
                {(["ALL", "HEALTHY", "AT_RISK", "CRITICAL"] as const).map((filter) => (
                  <button
                    key={filter}
                    type="button"
                    onClick={() => setHealthFilter(filter)}
                    className={`h-9 rounded-xl px-3 text-[12px] font-bold transition-colors ${
                      healthFilter === filter ? "bg-[#071225] text-white" : "text-[var(--text-secondary)] hover:bg-white/70"
                    }`}
                  >
                    {filter === "ALL" ? "All" : healthLabel[filter]}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="max-h-[calc(min(760px,100vh-7rem)-5.25rem)] overflow-y-auto p-4">
            {accountHydrationPending ? (
              <div className="rounded-2xl border border-dashed border-[#D8CAB9] bg-white/50 p-6 text-[13px] font-bold text-[#7D6E5F]">
                Loading portfolio accounts...
              </div>
            ) : (
              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
                {visibleAccounts.map((account) => (
                  <PortfolioCard
                    key={account.id}
                    account={account}
                    readonly={isExecutive}
                    onOpen={(nextAccount) => {
                      setSelectedAccountTab("overview");
                      setSelectedAccount(nextAccount);
                    }}
                  />
                ))}
              </div>
            )}
          </div>
        </section>
      </section>
      <CammiePanel role={role} accounts={accountHydrationPending ? [] : visibleAccounts} activeAccount={selectedAccount} />
      <PendingAccountCreationDialog
        open={pendingReviewDialogOpen}
        request={selectedAccountCreationRequest}
        onUpdateRequest={updateAccountCreationRequest}
        onDeleteRequest={deleteAccountCreationRequest}
        onApproveRequest={approveAccountCreationRequest}
        role={role}
        onOpenChange={(open) => {
          setPendingAccountReviewOpen(open);
          if (!open && routeFocus === "pending-account-draft") router.push("/portfolio");
        }}
      />
      <AccountModal
        account={selectedAccount}
        open={Boolean(selectedAccount)}
        initialTab={selectedAccountTab}
        onAccountUpdate={updatePortfolioAccount}
        onOpenChange={(open) => !open && setSelectedAccount(null)}
      />
      <AccountSourceUploadDialog
        open={onboardingOpen && onboardingStage === "source-upload"}
        files={selectedSourceFiles}
        isUploading={sourceUploadLoading}
        uploadError={sourceUploadError}
        onOpenChange={(open) => {
          setOnboardingOpen(open);
          if (!open) resetOnboardingState();
        }}
        onFilesChange={setSelectedSourceFiles}
        onContinue={continueFromSourceUpload}
      />
      <AccountOnboardingWorkspace
        open={onboardingOpen && onboardingStage === "workspace"}
        role={role}
        sourceFileNames={sourceFileNames}
        draft={accountDraft}
        suggestions={onboardingSuggestions}
        documents={onboardingDocuments}
        kycSections={onboardingKycSections}
        generatedKycDocument={generatedKycDocument}
        kycGenerationLoading={kycGenerationLoading}
        kycGenerationError={kycGenerationError}
        journeyAgentLoading={journeyAgentLoading}
        journeyAgentError={journeyAgentError}
        assistantMessages={onboardingAssistantMessages}
        assistantLoading={onboardingAssistantLoading}
        assistantError={onboardingAssistantError}
        documentDraft={onboardingDocumentDraft}
        journey={onboardingJourney}
        prompt={onboardingPrompt}
        dismissalDraft={suggestionDismissalDraft}
        onOpenChange={(open) => {
          setOnboardingOpen(open);
          if (!open) resetOnboardingState();
        }}
        onDraftChange={setAccountDraft}
        onAcceptSuggestion={acceptOnboardingSuggestion}
        onStartDismissSuggestion={startDismissSuggestion}
        onDismissReasonChange={updateDismissReason}
        onConfirmDismissSuggestion={confirmDismissSuggestion}
        onCancelDismissSuggestion={cancelDismissSuggestion}
        onDocumentDraftChange={setOnboardingDocumentDraft}
        onAddDocument={addOnboardingDocument}
        onJourneyChange={updateJourneyItem}
        onAddJourneyItem={addJourneyItem}
        onDeleteJourneyItem={deleteJourneyItem}
        onRunJourneyAgent={runJourneyAgent}
        onGenerateKycDocument={generateKycDocument}
        onSubmitKycForKam={submitKycForKam}
        onApproveKycDocument={approveKycDocument}
        onPromptChange={setOnboardingPrompt}
        onApplyPrompt={applyOnboardingPrompt}
        onSaveDraft={saveOnboardingDraft}
        onFinalizeAccount={finalizeOnboardingAccount}
      />
    </main>
  );
}

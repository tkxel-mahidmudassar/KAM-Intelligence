"use client";

import * as Dialog from "@radix-ui/react-dialog";
import * as Tabs from "@radix-ui/react-tabs";
import { type ReactNode, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowLeft, CalendarDays, Check, FileText, Loader2, Mail, Pencil, Phone, Plus, Search, Settings, Sparkles, X } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { useAccountCache } from "@/context/AccountCacheContext";
import { useNotifications } from "@/context/NotificationContext";
import { useRole } from "@/context/RoleContext";
import type { CachedApiAccount } from "@/lib/v2/accountCache";
import {
  accountDocumentTypes,
  defaultAccountJourneyItems,
  documentGenerationTypes,
  documentOutputFormats,
  journeyDateFromOffset,
  normalizeJourneyRecurrence,
} from "@/lib/v2/configuration";
import { type PortfolioAccount, type PortfolioHealth } from "@/lib/v2/portfolioData";
import { defaultKpiWeights } from "@/lib/v2/workspaceData";
import { buildLearningRuleText, shouldCreateLearningRule, suppressesRecommendation, type AiRule } from "@/lib/v2/aiRuleHeuristics";
import type { Role } from "@/types";

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

interface ApiKpiDriver {
  label?: string;
  value?: string;
  score?: number;
}

interface ApiKpiBreakdown {
  key?: string;
  label?: string;
  rationale?: string;
  score?: number;
  weight?: number;
  drivers?: ApiKpiDriver[];
  formula?: string;
  fallback?: string;
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
  id?: string;
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
  sowName?: string;
  location: string;
  startDate: string;
}

interface ResourceDraft {
  name: string;
  role: string;
  pod: string;
  sowName: string;
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
  status: "Processed" | "Pending review" | "Draft";
  affected: string;
  url: string;
  kind?: "uploaded" | "generated" | "generated-kyc";
  draftContent?: string;
  kycPayload?: GeneratedWorkspaceKycPayload;
  acceptedAt?: string;
}

interface GeneratedWorkspaceKycPayload {
  id?: string;
  version?: number;
  status?: string;
  executiveSummary?: unknown;
  businessModel?: unknown;
  keyStakeholders?: unknown;
  strategicGoals?: unknown;
  riskFactors?: unknown;
  expansionOpportunity?: unknown;
  csatHistory?: unknown;
  competitiveLandscape?: unknown;
  financialOverview?: unknown;
  createdAt?: unknown;
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

const SOURCE_DOCUMENT_BASE_TS = Date.UTC(2026, 5, 8, 9, 0, 0);

function documentUploadedAtMs(uploadedAt: string | undefined, fallbackIndex: number) {
  if (uploadedAt) {
    const parsed = Date.parse(uploadedAt);
    if (Number.isFinite(parsed)) return parsed;
  }
  return SOURCE_DOCUMENT_BASE_TS - fallbackIndex;
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
  documentType: string;
  outputFormat: "pptx" | "docx" | "pdf" | "xlsx";
  audience: string;
  period: string;
  goals: string;
  risks: string;
  asks: string;
}

const documentGenerationFieldCopy: Record<string, {
  audienceLabel: string;
  audiencePlaceholder: string;
  periodLabel: string;
  periodPlaceholder: string;
  goalsLabel: string;
  goalsPlaceholder: string;
  risksLabel: string;
  risksPlaceholder: string;
  asksLabel: string;
  asksPlaceholder: string;
}> = {
  QBR: {
    audienceLabel: "QBR audience",
    audiencePlaceholder: "Client sponsor, delivery leadership, Tkxel account team",
    periodLabel: "Quarter",
    periodPlaceholder: "Q2 2026",
    goalsLabel: "QBR goals",
    goalsPlaceholder: "Business outcomes, renewal narrative, delivery health, expansion decisions",
    risksLabel: "Risks or blockers",
    risksPlaceholder: "Delivery, commercial, stakeholder, or relationship risks to address",
    asksLabel: "Client decisions needed",
    asksPlaceholder: "Approvals, next-step commitments, executive asks",
  },
  MBR: {
    audienceLabel: "MBR audience",
    audiencePlaceholder: "Client operating team, delivery owners, KAM",
    periodLabel: "Month",
    periodPlaceholder: "June 2026",
    goalsLabel: "Monthly review focus",
    goalsPlaceholder: "Progress, open actions, blockers, delivery confidence, decisions needed",
    risksLabel: "Monthly risks",
    risksPlaceholder: "Items requiring attention before the next check-in",
    asksLabel: "Follow-up asks",
    asksPlaceholder: "Requests for the client, Tkxel team, or sponsor",
  },
  DBR: {
    audienceLabel: "DBR audience",
    audiencePlaceholder: "Delivery leads, product owners, project stakeholders",
    periodLabel: "Delivery period",
    periodPlaceholder: "Sprint 14 or current delivery window",
    goalsLabel: "Delivery review focus",
    goalsPlaceholder: "Sprint progress, blockers, scope movement, resource needs",
    risksLabel: "Delivery risks",
    risksPlaceholder: "Backlog, scope, dependency, resource, or quality risks",
    asksLabel: "Delivery asks",
    asksPlaceholder: "Decisions needed from delivery owners or client stakeholders",
  },
  EBR: {
    audienceLabel: "Executive audience",
    audiencePlaceholder: "C-suite sponsor, executive steering committee, Tkxel leadership",
    periodLabel: "Executive period",
    periodPlaceholder: "H1 2026 or executive steering cycle",
    goalsLabel: "Executive storyline",
    goalsPlaceholder: "Strategic outcomes, account health, sponsor alignment, renewal posture",
    risksLabel: "Executive risks",
    risksPlaceholder: "Issues that require executive awareness or intervention",
    asksLabel: "Executive decisions",
    asksPlaceholder: "Steering asks, escalation decisions, growth approvals",
  },
  KYC: {
    audienceLabel: "KYC reviewer",
    audiencePlaceholder: "KAM, associate, delivery lead, or executive reviewer",
    periodLabel: "KYC purpose",
    periodPlaceholder: "New account onboarding or renewal refresh",
    goalsLabel: "KYC sections to emphasize",
    goalsPlaceholder: "Company profile, stakeholders, commercial context, engagement history",
    risksLabel: "Unknowns to resolve",
    risksPlaceholder: "Missing sources, uncertain stakeholders, unverified financial details",
    asksLabel: "Review requirements",
    asksPlaceholder: "What the reviewer should confirm before approving",
  },
  "Account Brief": {
    audienceLabel: "Brief recipient",
    audiencePlaceholder: "Internal leadership, KAM handoff, delivery pod, executive sponsor",
    periodLabel: "Brief purpose",
    periodPlaceholder: "Exec handoff, internal account review, pre-meeting prep",
    goalsLabel: "Briefing focus",
    goalsPlaceholder: "Current state, priorities, relationship map, risks, opportunities",
    risksLabel: "Watch items",
    risksPlaceholder: "Risks, gaps, or source uncertainty to call out",
    asksLabel: "Recommended actions",
    asksPlaceholder: "Actions the reader should take after reading the brief",
  },
  "Renewal Plan": {
    audienceLabel: "Renewal audience",
    audiencePlaceholder: "Commercial sponsor, procurement, account leadership",
    periodLabel: "Renewal window",
    periodPlaceholder: "90 days before renewal",
    goalsLabel: "Renewal objectives",
    goalsPlaceholder: "Retention path, commercial strategy, stakeholders, blockers",
    risksLabel: "Renewal risks",
    risksPlaceholder: "Contract, delivery, pricing, stakeholder, or competitor risks",
    asksLabel: "Renewal asks",
    asksPlaceholder: "Approvals, evidence, or conversations needed to close renewal",
  },
  "Executive Summary": {
    audienceLabel: "Summary audience",
    audiencePlaceholder: "Executive leadership, sponsor, or internal review group",
    periodLabel: "Summary purpose",
    periodPlaceholder: "Leadership update, board note, account snapshot",
    goalsLabel: "Summary focus",
    goalsPlaceholder: "Most important account context and decisions needed",
    risksLabel: "Exceptions",
    risksPlaceholder: "Anything leadership should not miss",
    asksLabel: "Leadership asks",
    asksPlaceholder: "Decisions or next actions expected from the reader",
  },
};

function generationCopyFor(documentType: string) {
  return documentGenerationFieldCopy[documentType] ?? documentGenerationFieldCopy["Account Brief"];
}

interface CammieMessage {
  role: "user" | "assistant";
  content: string;
  artifact?: {
    title: string;
    fileName?: string;
    fileUrl: string;
    format: string;
    summary: string;
  };
}

interface PlaybookRecommendationOverlay {
  why: string;
  task: string;
  taskType: TaskType;
  dueInDays: number;
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
  currentWork: string;
  relationshipSignal: string;
  contractEnd: string;
}

type OnboardingStage = "source-upload" | "workspace";
type AccountOnboardingStep = "profile" | "scoring" | "kyc" | "journey" | "review";
type AccountWorkspaceTab = "overview" | "profile" | "documents" | "kyc";

const accountWorkspaceTabs: Array<{ label: string; value: AccountWorkspaceTab }> = [
  { label: "Overview", value: "overview" },
  { label: "Profile", value: "profile" },
  { label: "Docs & AI", value: "documents" },
  { label: "KYC", value: "kyc" },
];

const accountWorkspaceTabValues = new Set<AccountWorkspaceTab>(accountWorkspaceTabs.map((tab) => tab.value));

function normalizeWorkspaceTab(value: string | null): AccountWorkspaceTab {
  return value && accountWorkspaceTabValues.has(value as AccountWorkspaceTab) ? (value as AccountWorkspaceTab) : "overview";
}

function slugifyRouteValue(value: string) {
  return value.trim().toLowerCase().replace(/^v2-acct-/, "").replace(/^acc-/, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

function accountMatchesRouteTarget(account: PortfolioAccount, target: string) {
  const normalizedTarget = slugifyRouteValue(target);
  const accountSlug = slugifyRouteValue(account.name);
  const accountIdSlug = slugifyRouteValue(account.id);
  return account.id === target || accountIdSlug === normalizedTarget || accountSlug === normalizedTarget;
}

function normalizeFocusTarget(value: string | null) {
  return value ? slugifyRouteValue(value.replace(/-score$/, "")) : null;
}

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

interface OnboardingScoreDraft {
  id: string;
  name: string;
  weight: number;
  score: number;
  source: string;
  why: string;
  proposedTask: string;
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
    name: "Relationship Score",
    weight: "15%",
    rationale: "Depth and breadth of stakeholder penetration and executive access.",
    score: 4,
    trend: "up",
    subParameters: [
      { name: "Stakeholder depth", score: 4, rationale: "How deeply Tkxel is connected into the account's decision hierarchy." },
      { name: "Stakeholder breadth", score: 4, rationale: "How broadly Tkxel is covered across business, product, finance, procurement, and delivery owners." },
      { name: "Meeting cadence", score: 4, rationale: "Whether the account has a reliable operating rhythm with meaningful client touchpoints." },
      { name: "Executive access", score: 4, rationale: "Whether senior sponsors are reachable for decisions, escalation handling, and renewal alignment." },
    ],
  },
  {
    id: "contract-health",
    name: "Contract Health Score",
    weight: "15%",
    rationale: "Renewal risk, contractual protection, and commercial foundation.",
    score: 4,
    trend: "flat",
    subParameters: [
      { name: "Renewal risk", score: 4, rationale: "How exposed the account is to renewal timing, unclear owners, or unproven value before contract decision." },
      { name: "Contractual protection", score: 4, rationale: "Whether the agreement gives Tkxel enough protection around continuation, scope, notice, and commercial terms." },
      { name: "Commercial foundation", score: 4, rationale: "Whether pricing, scope, value proof, and procurement path are clear enough to support the relationship." },
    ],
  },
  {
    id: "customer-success",
    name: "CSAT Score",
    weight: "20%",
    rationale: "Direct client satisfaction and most important relationship-quality signal.",
    score: 4,
    trend: "up",
    subParameters: [
      { name: "Client feedback", score: 4, rationale: "Explicit client satisfaction or dissatisfaction gathered from direct feedback, surveys, or meeting notes." },
      { name: "Stakeholder touchpoint sentiment", score: 4, rationale: "The tone and confidence observed across recent stakeholder interactions." },
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
        name: "Market risk",
        score: 3,
        rationale: "External market, regulatory, or industry pressure that could affect the account.",
        trend: "down",
        fallingWhy: {
          summary: "The account is exposed to moderate market uncertainty, so the playbook recommends confirming business continuity assumptions before renewal planning.",
          sources: ["Risk scoring framework", "Account journey history", "AI rules learning log"],
        },
      },
      {
        name: "Relationship risk",
        score: 3,
        rationale: "Risk created by weak sponsorship, low trust, poor access, or stakeholder churn.",
        trend: "down",
        fallingWhy: {
          summary: "Competitive pressure has not been ruled out, so the system should prompt for competitor exposure before assuming the account is secure.",
          sources: ["Risk scoring framework", "Account journey history", "AI rules learning log"],
        },
      },
      {
        name: "Commercial risk",
        score: 2,
        rationale: "Risk from pricing, procurement, budget, renewal, or contractual uncertainty.",
        trend: "down",
        fallingWhy: {
          summary: "There are unresolved signs that Tkxel could be displaced, so the corrective task should validate executive sponsorship and active value proof.",
          sources: ["Risk scoring framework", "Account journey history", "AI rules learning log"],
        },
      },
      {
        name: "Delivery risk",
        score: 2,
        rationale: "Risk from missed delivery expectations, unresolved blockers, poor execution, or delivery confidence gaps.",
        trend: "down",
        fallingWhy: {
          summary: "Delivery risk is below target because the current journey does not yet show a named mitigation owner for recent blockers.",
          sources: ["Risk scoring framework", "Account journey history", "AI rules learning log"],
        },
      },
      {
        name: "Displacement signal",
        score: 2,
        rationale: "Evidence that the client could replace, reduce, or deprioritize Tkxel.",
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
    name: "Resource Health Score",
    weight: "10%",
    rationale: "Team stability, fit, turnover, and bench risk.",
    score: 3,
    trend: "down",
    subParameters: [
      {
        name: "Team stability",
        score: 2,
        rationale: "Whether the delivery team is stable enough to maintain account continuity.",
        trend: "down",
        fallingWhy: {
          summary: "Resource health is soft because a critical dependency has not been covered by a named backup.",
          sources: ["Resource health scoring framework", "Account resource history", "AI rules learning log"],
        },
      },
      { name: "Team fit", score: 3, rationale: "Whether assigned resources have the right domain, technical, and relationship fit for the account." },
      { name: "Turnover risk", score: 3, rationale: "Whether attrition, churn, or role instability could affect continuity." },
      { name: "Bench risk", score: 2, rationale: "Whether backup capacity exists if the account needs coverage changes or rapid support.", trend: "down" },
    ],
    why: "Resource dependency and backup readiness are below the target band.",
    task: "Create a backup coverage plan for critical resources and confirm succession ownership.",
    taskType: "To-do",
    dueInDays: 7,
  },
  {
    id: "project-health",
    name: "Project Health Score",
    weight: "10%",
    rationale: "Delivery execution quality and backlog/velocity health.",
    score: 3,
    trend: "down",
    subParameters: [
      {
        name: "Delivery execution quality",
        score: 3,
        rationale: "How well the team is executing delivery commitments and resolving blockers.",
        trend: "down",
        fallingWhy: {
          summary: "Delivery performance is moderate because recent checkpoints do not yet show stable on-track execution.",
          sources: ["Project health scoring framework", "Account journey history", "AI rules learning log"],
        },
      },
      { name: "Backlog health", score: 3, rationale: "Whether the account has clear, validated upcoming work and committed priorities." },
      { name: "Velocity health", score: 3, rationale: "Whether execution pace is steady enough to sustain delivery confidence." },
      {
        name: "Blocker control",
        score: 3,
        rationale: "Whether open blockers and escalations are controlled with owners and next actions.",
        trend: "down",
        fallingWhy: {
          summary: "Escalation status is not healthy because recent account history still contains unresolved escalation signals.",
          sources: ["Project health scoring framework", "Meeting history", "AI rules learning log"],
        },
      },
    ],
    why: "Delivery confidence and roadmap visibility require monitoring.",
    task: "Run a delivery governance review covering backlog, roadmap, escalations, and client confidence.",
    taskType: "Meeting",
    dueInDays: 5,
  },
  {
    id: "financial-health",
    name: "Financial Score",
    weight: "10%",
    rationale: "Payment timeliness, outstanding invoices, and revenue trend.",
    score: 4,
    trend: "flat",
    subParameters: [
      { name: "Payment timeliness", score: 4, rationale: "Whether invoices are paid on time and payment behavior is predictable." },
      { name: "Outstanding invoices", score: 4, rationale: "Whether unpaid invoice exposure creates commercial or renewal risk." },
      { name: "Revenue trend", score: 4, rationale: "Whether account revenue is stable, growing, or declining." },
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
      { name: "Expansion signal", score: 3, rationale: "Whether there is visible evidence of potential expansion or new work." },
      { name: "CSAT readiness", score: 3, rationale: "Whether client satisfaction is strong enough to support expansion conversations." },
      { name: "Relationship readiness", score: 3, rationale: "Whether stakeholder access and sponsorship are strong enough for expansion." },
      {
        name: "Adoption/utilization",
        score: 3,
        rationale: "Whether current adoption, usage, or delivery footprint supports a credible growth motion.",
        trend: "down",
        fallingWhy: {
          summary: "Growth signals have not yet been converted into an active expansion motion with sponsor, timing, and value hypothesis.",
          sources: ["Whitespace scoring framework", "Opportunity history", "AI rules learning log"],
        },
      },
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

function recommendationCategoryToKpiRowId(category: string) {
  const normalized = category.toUpperCase();
  const categoryMap: Record<string, string> = {
    CSAT: "customer-success",
    CUSTOMER_SUCCESS: "customer-success",
    RELATIONSHIP: "relationship",
    RISK: "risk",
    CONTRACT: "contract-health",
    CONTRACT_HEALTH: "contract-health",
    PROJECT: "project-health",
    PROJECT_HEALTH: "project-health",
    RESOURCE: "resource-health",
    RESOURCE_HEALTH: "resource-health",
    FINANCIAL: "financial-health",
    FINANCIAL_HEALTH: "financial-health",
    WHITESPACE: "whitespace",
  };
  return categoryMap[normalized];
}

function priorityToDueInDays(priority: string) {
  const normalized = priority.toUpperCase();
  if (normalized === "CRITICAL") return 1;
  if (normalized === "HIGH") return 3;
  if (normalized === "MEDIUM") return 7;
  return 10;
}

function normalizeRecommendationTaskType(value: unknown): TaskType {
  const label = String(value ?? "").toLowerCase();
  if (label.includes("qbr")) return "QBR";
  if (label.includes("meeting") || label.includes("sync") || label.includes("review")) return "Meeting";
  return "To-do";
}

function recommendationPayloadToOverlay(item: Record<string, unknown>): PlaybookRecommendationOverlay | null {
  const rowId = recommendationCategoryToKpiRowId(String(item.category ?? ""));
  if (!rowId) return null;
  const playbookRule = item.playbookRule as Record<string, unknown> | null | undefined;
  const playbook = playbookRule?.playbook as Record<string, unknown> | null | undefined;
  const title = String(item.title ?? "Recommended action");
  const summary = String(item.summary ?? playbookRule?.condition ?? "The playbook recommendation engine flagged this KPI for review.");
  const recommendedAction = String(item.recommendedAction ?? title);
  const priority = String(item.priority ?? "MEDIUM");
  const source = playbook?.title ? ` Source: ${String(playbook.title)}.` : "";
  return {
    why: `${summary}${source}`,
    task: recommendedAction,
    taskType: normalizeRecommendationTaskType(recommendedAction),
    dueInDays: priorityToDueInDays(priority),
  };
}

function applyRecommendationOverlays(rows: KpiOverviewRow[], overlays: Record<string, PlaybookRecommendationOverlay>) {
  return rows.map((row) => {
    const overlay = overlays[row.id];
    if (!overlay) return row;
    return {
      ...row,
      why: overlay.why,
      task: overlay.task,
      taskType: overlay.taskType,
      dueInDays: overlay.dueInDays,
    };
  });
}

function applyAiRuleSuppressions(rows: KpiOverviewRow[], rules: AiRule[], account: PortfolioAccount | null) {
  if (rules.length === 0) return rows;
  return rows.map((row) => {
    const targetText = [account?.name, row.name, row.why, row.task, row.taskType].filter(Boolean).join(" ");
    if (!targetText || !suppressesRecommendation(rules, targetText)) return row;
    return {
      ...row,
      why: undefined,
      task: undefined,
      taskType: undefined,
      dueInDays: undefined,
    };
  });
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
      "Renewal risk",
      renewalPressure,
      "down",
      `${account.name} is ${account.renewalDays} days from renewal, so the renewal owner and commercial next step need to be confirmed.`,
    );
    setSubParameterScore(
      rows,
      "contract-health",
      "Contractual protection",
      Math.max(2, renewalPressure),
      "down",
      `${account.name} has a near-term contract window, making notice-period and procurement timing more important than usual.`,
    );
  }

  if (account.health !== "HEALTHY") {
    setSubParameterScore(
      rows,
      "risk",
      "Delivery risk",
      account.health === "CRITICAL" ? 1 : 2,
      "down",
      `${account.name} is marked ${healthLabel[account.health]}, and the current workstream (${account.currentWork}) has not yet been converted into a named mitigation path.`,
    );
    setSubParameterScore(
      rows,
      "project-health",
      "Delivery execution quality",
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
      "Delivery execution quality",
      account.health === "HEALTHY" ? 4 : 2,
      account.health === "HEALTHY" ? "flat" : "down",
      `${account.name}'s logistics work depends on operational reliability, so delivery performance is weighted by exception handling and platform stability.`,
    );
    setSubParameterScore(rows, "risk", "Market risk", account.health === "HEALTHY" ? 4 : 3, account.health === "HEALTHY" ? "flat" : "down");
  }
  if (industry.includes("aviation") || industry.includes("energy")) {
    setSubParameterScore(
      rows,
      "risk",
      "Commercial risk",
      account.health === "CRITICAL" ? 1 : 2,
      "down",
      `${account.name} operates in a high-governance ${account.industry} environment, so unresolved scope or sponsor pressure materially raises commercial risk.`,
    );
    setSubParameterScore(rows, "project-health", "Blocker control", account.health === "HEALTHY" ? 4 : 2, account.health === "HEALTHY" ? "flat" : "down");
  }
  if (industry.includes("banking") || industry.includes("financial") || industry.includes("payments") || industry.includes("fintech")) {
    setSubParameterScore(rows, "contract-health", "Contractual protection", account.health === "HEALTHY" ? 4 : 3, account.health === "HEALTHY" ? "flat" : "down");
    setSubParameterScore(rows, "financial-health", "Payment timeliness", account.health === "HEALTHY" ? 5 : 3, account.health === "HEALTHY" ? "up" : "flat");
  }
  if (industry.includes("pharma") || industry.includes("health")) {
    setSubParameterScore(rows, "customer-success", "Client feedback", account.health === "HEALTHY" ? 5 : 3, account.health === "HEALTHY" ? "up" : "down");
    setSubParameterScore(rows, "contract-health", "Commercial foundation", account.health === "HEALTHY" ? 4 : 3, account.health === "HEALTHY" ? "flat" : "down");
  }
  if (industry.includes("retail") || industry.includes("commerce")) {
    setSubParameterScore(rows, "whitespace", "Expansion signal", account.health === "HEALTHY" ? 4 : 3, account.health === "HEALTHY" ? "up" : "flat");
    setSubParameterScore(rows, "customer-success", "Stakeholder touchpoint sentiment", account.health === "HEALTHY" ? 4 : 3, account.health === "HEALTHY" ? "up" : "down");
  }
}

function applyNamedAccountReality(rows: KpiOverviewRow[], account: PortfolioAccount) {
  const name = account.name.toLowerCase();
  if (name.includes("maersk")) {
    setKpiScore(rows, "risk", 2, "down");
    setKpiScore(rows, "contract-health", 3, "down");
    setKpiScore(rows, "project-health", 2, "down");
    setSubParameterScore(rows, "risk", "Delivery risk", 1, "down", "Port visibility delivery timing is under review, so the blocker owner and recovery path are not yet credible.");
    setSubParameterScore(rows, "risk", "Relationship risk", 3, "down", "Maersk has not confirmed whether alternative logistics technology partners are being evaluated before renewal.");
    setSubParameterScore(rows, "project-health", "Delivery execution quality", 2, "down", "The current workstream is delivery-sensitive and recent checkpoints have not cleared timing concerns.");
    setSubParameterScore(rows, "project-health", "Velocity health", 2, "down", "The next delivery checkpoint exists, but the client-facing recovery roadmap is not explicit enough.");
    setSubParameterScore(rows, "contract-health", "Renewal risk", 3, "down", "The renewal window is close enough that renewal owner, value proof, and commercial path need confirmation.");
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
    setSubParameterScore(rows, "project-health", "Backlog health", 2, "down", "Scope pressure is creating uncertainty about what is actually committed for the next passenger operations release.");
    setSubParameterScore(rows, "project-health", "Blocker control", 2, "down", "Scope-change pressure needs a formal governance decision before it becomes an escalation.");
    setSubParameterScore(rows, "relationship", "Executive access", 3, "flat", "A sponsor exists, but decision authority on scope changes is not yet clean enough.");
    setSubParameterScore(rows, "risk", "Commercial risk", 2, "down", "Uncontrolled scope pressure can turn into commercial leakage if change control is not locked.");
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
    setSubParameterScore(rows, "contract-health", "Renewal risk", 1, "down", "Adidas is inside a 74-day renewal window and the renewal narrative has not been converted into a decision plan.");
    setSubParameterScore(rows, "contract-health", "Contractual protection", 2, "down", "Procurement timing is tight enough that notice-period and decision-path risk need explicit tracking.");
    setSubParameterScore(rows, "risk", "Displacement signal", 2, "down", "A weak renewal narrative leaves room for replacement or internal reprioritization.");
    setSubParameterScore(rows, "whitespace", "Relationship readiness", 2, "down", "Potential commerce expansion exists, but renewal proof has to come before expansion positioning.");
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
    setSubParameterScore(rows, "relationship", "Executive access", 1, "down", "The executive conversation is currently escalation-led, not relationship-led.");
    setSubParameterScore(rows, "relationship", "Stakeholder depth", 2, "down", "The account needs a credible internal sponsor who can own the recovery path.");
    setSubParameterScore(rows, "risk", "Commercial risk", 1, "down", "Critical health plus a 48-day renewal window creates immediate retention exposure.");
    setSubParameterScore(rows, "risk", "Displacement signal", 1, "down", "The open escalation creates a realistic displacement risk until executive confidence is restored.");
    setSubParameterScore(rows, "project-health", "Blocker control", 1, "down", "The escalation is active and must be treated as the primary account-health driver.");
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
    setSubParameterScore(rows, "project-health", "Delivery execution quality", 1, "down", "Exception triage workflows are damaging delivery confidence and require a recovery cadence.");
    setSubParameterScore(rows, "project-health", "Velocity health", 1, "down", "The relationship signal explicitly says delivery confidence is damaged.");
    setSubParameterScore(rows, "resource-health", "Team fit", 2, "down", "The recovery plan needs named owners for exception triage, delivery lead coverage, and escalation handling.");
    setSubParameterScore(rows, "resource-health", "Bench risk", 2, "down", "Backup coverage must be visible because the recovery path cannot depend on one overloaded owner.");
    setSubParameterScore(rows, "risk", "Delivery risk", 1, "down", "Delivery risk is the core account risk, not a generic renewal issue.");
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
    setSubParameterScore(rows, "contract-health", "Commercial foundation", 2, "down", "Procurement friction means commercial protections need to be reconfirmed before renewal negotiation.");
    setSubParameterScore(rows, "financial-health", "Outstanding invoices", 3, "flat", "Commercial review requires finance and contract evidence to be aligned before account confidence improves.");
    setSubParameterScore(rows, "relationship", "Stakeholder breadth", 3, "flat", "The decision map needs procurement plus business owner coverage, not just delivery contacts.");
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
    setSubParameterScore(rows, "relationship", "Stakeholder breadth", 2, "down", "HSBC has an incomplete stakeholder map, so relationship coverage is the primary weakness.");
    setSubParameterScore(rows, "relationship", "Stakeholder depth", 2, "down", "The account needs coverage across risk, compliance, procurement, and the business sponsor.");
    setSubParameterScore(rows, "risk", "Commercial risk", 3, "flat", "The risk workflow modernization path is not blocked commercially yet, but stakeholder gaps can turn into renewal friction.");
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
    setSubParameterScore(rows, "contract-health", "Contractual protection", 2, "down", "Commercial review is pending, so contract protection and continuation assumptions are not yet safe.");
    setSubParameterScore(rows, "contract-health", "Commercial foundation", 2, "down", "Pricing or uplift protection needs confirmation before the commercial review closes.");
    setSubParameterScore(rows, "financial-health", "Revenue trend", 3, "flat", "Revenue is not the first failure, but commercial review can constrain growth if unresolved.");
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
    setSubParameterScore(rows, "project-health", "Backlog health", 2, "down", "Lab systems integration blockers make backlog readiness weaker than the account average.");
    setSubParameterScore(rows, "customer-success", "Client feedback", 2, "down", "Technical blockers remain active and have not been converted into resolved issue evidence.");
    setSubParameterScore(rows, "risk", "Delivery risk", 2, "down", "The delivery risk is technical integration risk, not renewal or procurement risk.");
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
    setSubParameterScore(rows, "customer-success", "Client feedback", 2, "down", "Clinical stakeholder concerns are the dominant signal, so confidence must be recovered directly.");
    setSubParameterScore(rows, "customer-success", "Stakeholder touchpoint sentiment", 2, "down", "Concerns from clinical stakeholders indicate the communication loop needs tightening.");
    setSubParameterScore(rows, "relationship", "Executive access", 3, "down", "A clinical champion or sponsor needs to validate the device-data workflow value path.");
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

const scoreDimensionByRowId: Record<string, keyof NonNullable<PortfolioAccount["scoreDimensions"]>> = {
  "customer-success": "csat",
  relationship: "relationship",
  risk: "risk",
  "contract-health": "contractHealth",
  "project-health": "projectHealth",
  "resource-health": "resourceHealth",
  "financial-health": "financial",
  whitespace: "whitespace",
};

const rowIdByScoreDimension: Record<string, string> = Object.fromEntries(
  Object.entries(scoreDimensionByRowId).map(([rowId, dimension]) => [dimension, rowId]),
);

function percentToFrameworkScore(value: number | null | undefined) {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  return clampFrameworkScore(Math.round(value / 20));
}

function applyPersistedScoreDimensions(rows: KpiOverviewRow[], account: PortfolioAccount) {
  const dimensions = account.scoreDimensions;
  if (!dimensions) return;

  rows.forEach((row) => {
    const dimensionKey = scoreDimensionByRowId[row.id];
    const score = percentToFrameworkScore(dimensionKey ? dimensions[dimensionKey] : null);
    if (!score) return;

    row.score = score;
    row.trend = accountTrend(score);
  });
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
  const hasPersistedDimensions = Boolean(account.scoreDimensions && Object.values(account.scoreDimensions).some((value) => typeof value === "number"));

  if (!hasPersistedDimensions) {
    applyBaselineScores(rows, account);
    applyIndustrySpecificScores(rows, account);
    applyNamedAccountReality(rows, account);
  }
  applyPersistedScoreDimensions(rows, account);

  if (account.health === "HEALTHY" && account.relationshipSignal.toLowerCase().includes("expansion")) {
    if (!account.scoreDimensions?.whitespace) setKpiScore(rows, "whitespace", 5, "up");
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

function kpiRowFromApiBreakdown(
  row: KpiOverviewRow,
  breakdown: ApiKpiBreakdown,
  account: PortfolioAccount,
): KpiOverviewRow {
  const rowScore = percentToFrameworkScore(typeof breakdown.score === "number" ? breakdown.score : null) ?? row.score;
  const drivers = Array.isArray(breakdown.drivers) ? breakdown.drivers : [];
  const subParameters = drivers.length > 0
    ? drivers.map((driver, index) => {
        const score = percentToFrameworkScore(typeof driver.score === "number" ? driver.score : breakdown.score) ?? rowScore;
        const label = String(driver.label ?? `Driver ${index + 1}`);
        const value = driver.value ? String(driver.value) : breakdown.formula ?? breakdown.rationale ?? "DB-backed score driver";
        return {
          name: label,
          score,
          rationale: value,
          trend: accountTrend(score),
          fallingWhy: score <= 3
            ? {
                summary: `${label} is below the healthy band in the latest DB-backed score calculation for ${account.name}.`,
                sources: ["KPI dimension data", "Adapter score inputs"],
              }
            : undefined,
        };
      })
    : row.subParameters.map((parameter) => ({
        ...parameter,
        score: rowScore,
        rationale: breakdown.rationale ?? parameter.rationale,
        trend: accountTrend(rowScore),
      }));

  const nextRow: KpiOverviewRow = {
    ...row,
    name: String(breakdown.label ?? row.name),
    weight: `${typeof breakdown.weight === "number" ? breakdown.weight : parseWeightValue(row.weight)}%`,
    rationale: String(breakdown.rationale ?? row.rationale),
    score: rowScore,
    trend: accountTrend(rowScore),
    subParameters,
    why: rowScore < 4 ? String(breakdown.rationale ?? row.why ?? `${row.name} needs review based on the latest score calculation.`) : undefined,
    task: rowScore < 4 ? `Review ${String(breakdown.label ?? row.name).toLowerCase()} drivers and confirm the recovery action.` : undefined,
    taskType: rowScore < 4 ? "To-do" : undefined,
    dueInDays: rowScore < 3 ? 3 : 7,
  };

  return nextRow;
}

function mapKpiBreakdownToOverviewRows(
  breakdown: Record<string, ApiKpiBreakdown>,
  account: PortfolioAccount,
): KpiOverviewRow[] {
  const baseRows = cloneKpiRows();
  const rows = baseRows.map((row) => {
    const dimension = scoreDimensionByRowId[row.id];
    const apiRow = dimension ? breakdown[dimension] : undefined;
    return apiRow ? kpiRowFromApiBreakdown(row, apiRow, account) : row;
  });

  for (const [dimension, apiRow] of Object.entries(breakdown)) {
    if (rowIdByScoreDimension[dimension]) continue;
    const score = percentToFrameworkScore(typeof apiRow.score === "number" ? apiRow.score : null) ?? 3;
    rows.push({
      id: `db-${dimension}`,
      name: String(apiRow.label ?? dimension),
      weight: `${typeof apiRow.weight === "number" ? apiRow.weight : 0}%`,
      rationale: String(apiRow.rationale ?? "DB-backed score dimension"),
      score,
      trend: accountTrend(score),
      subParameters: (apiRow.drivers ?? []).map((driver, index) => ({
        name: String(driver.label ?? `Driver ${index + 1}`),
        score: percentToFrameworkScore(typeof driver.score === "number" ? driver.score : apiRow.score) ?? score,
        rationale: String(driver.value ?? apiRow.formula ?? "DB-backed score driver"),
        trend: accountTrend(percentToFrameworkScore(typeof driver.score === "number" ? driver.score : apiRow.score) ?? score),
      })),
    });
  }

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

const documentTypes: DocumentTypeConfig[] = accountDocumentTypes;
const journeyRecurrenceOptions = ["Does not repeat", "Daily", "Weekly", "Bi-weekly", "Monthly", "Quarterly", "Yearly"];

function normalizedJourneyRecurrence(value: string) {
  if (value === "Once" || value === "One-time") return "Does not repeat";
  return journeyRecurrenceOptions.includes(value) ? value : "Does not repeat";
}

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
    affected: "Relationship Score, Risk Score",
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
    field: "Relationship Score",
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

const accountDraftFieldLabels: Record<keyof AccountDraft, string> = {
  name: "Account name",
  industry: "Industry",
  segment: "Domain",
  arr: "ARR",
  location: "Location",
  contractRenewal: "Contract renewal",
  kamOwner: "KAM owner",
  associateOwner: "Associate owner",
  primaryContact: "Client POC",
  activeRisk: "Active risk",
  openOpportunity: "Open opportunity",
  nextTouchpoint: "Next touchpoint",
};

const mandatoryAccountDraftFields = new Set<keyof AccountDraft>([
  "name",
  "industry",
  "segment",
  "arr",
  "location",
  "contractRenewal",
  "kamOwner",
  "primaryContact",
]);

const numericAccountDraftFields = new Set<keyof AccountDraft>(["arr"]);
const dateAccountDraftFields = new Set<keyof AccountDraft>(["contractRenewal"]);

const accountDraftFieldTooltips: Partial<Record<keyof AccountDraft, string>> = {
  name: "Legal or commonly used client account name.",
  industry: "The client industry, for example fintech, healthcare, logistics, or retail.",
  segment: "The business domain or service domain this account belongs to.",
  arr: "Annual recurring revenue. Use a value such as $1.4M, 850K, or 1400000.",
  location: "Primary client location and region.",
  contractRenewal: "Next contract renewal or contract end date.",
  kamOwner: "Tkxel KAM accountable for the account.",
  associateOwner: "Associate supporting the KAM, if assigned.",
  primaryContact: "Client-side point of contact for the account.",
  activeRisk: "Known current risk, if one exists.",
  openOpportunity: "Known growth, upsell, or whitespace opportunity, if one exists.",
  nextTouchpoint: "Next planned meeting, follow-up, or governance checkpoint.",
};

function normalizeAccountDraftField(field: unknown): keyof AccountDraft {
  return typeof field === "string" && accountDraftFields.has(field as keyof AccountDraft)
    ? (field as keyof AccountDraft)
    : "openOpportunity";
}

function accountDraftFieldHasValue(field: keyof AccountDraft, draft: AccountDraft) {
  return Boolean(draft[field]?.trim());
}

function accountDraftValidationError(field: keyof AccountDraft, value: string) {
  const trimmed = value.trim();
  if (mandatoryAccountDraftFields.has(field) && !trimmed) return `${accountDraftFieldLabels[field]} is required.`;
  if (dateAccountDraftFields.has(field) && trimmed && !toDateInputValue(trimmed)) {
    return `${accountDraftFieldLabels[field]} must be a valid date.`;
  }
  if (numericAccountDraftFields.has(field) && trimmed && !/^\$?\s?\d+(?:\.\d+)?\s?(?:k|m|b)?$/i.test(trimmed.replace(/,/g, ""))) {
    return "Use a valid revenue value, e.g. $1.4M, 850K, or 1400000.";
  }
  return "";
}

function toDateInputValue(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return "";
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return trimmed;
  const timestamp = Date.parse(trimmed);
  if (!Number.isFinite(timestamp)) return "";
  return new Date(timestamp).toISOString().slice(0, 10);
}

function correctionFromDismissalReason(reason: string) {
  const normalized = reason.trim();
  const patterns = [
    /\b(?:it'?s|it is|should be|correct(?: answer| value)? is|actually|change(?: it)? to)\s+["“]?([^"”.\n]+)["”]?/i,
    /\bnot\s+.+?,\s*(?:it'?s|it is|should be)\s+["“]?([^"”.\n]+)["”]?/i,
    /\bnot\s+.+?\s+-\s+["“]?([^"”.\n]+)["”]?/i,
  ];
  for (const pattern of patterns) {
    const match = normalized.match(pattern);
    const value = match?.[1]?.trim();
    if (value && value.length <= 180) return value.replace(/\s+instead$/i, "").trim();
  }
  return "";
}

function promptExplicitlyTargetsFilledField(prompt: string, suggestion: Partial<OnboardingSuggestion>, field: keyof AccountDraft) {
  const normalized = prompt.toLowerCase();
  if (!/(change|update|correct|replace|actually|wrong|not\b|instead)/i.test(normalized)) return false;
  const fieldTerms = accountDraftFieldQuestionTerms[field] ?? [];
  const label = String(suggestion.label ?? accountDraftFieldLabels[field]).toLowerCase();
  return normalized.includes(label) || fieldTerms.some((term) => normalized.includes(term));
}

function shouldKeepOnboardingSuggestion(suggestion: Partial<OnboardingSuggestion>, draft: AccountDraft, prompt: string) {
  const field = normalizeAccountDraftField(suggestion.field);
  if (!accountDraftFieldHasValue(field, draft)) return true;
  return promptExplicitlyTargetsFilledField(prompt, suggestion, field);
}

function formatAssistantMessage(message: string) {
  const trimmed = message.trim();
  if (!trimmed) return "";
  if (trimmed.includes("\n") || trimmed.startsWith("- ")) return trimmed;
  const segments = trimmed
    .split(/(?<=\.)\s+(?=[A-Z])/)
    .map((segment) => segment.trim())
    .filter(Boolean);
  if (segments.length <= 1) return trimmed;
  return segments.map((segment) => `- ${segment}`).join("\n");
}

const accountDraftFieldQuestionTerms: Record<keyof AccountDraft, string[]> = {
  name: ["account name", "company name", "client name"],
  industry: ["industry"],
  segment: ["domain", "business domain", "service domain", "segment"],
  arr: ["arr", "revenue", "annual recurring"],
  location: ["location", "country", "region"],
  contractRenewal: ["contract renewal", "renewal date", "contract end"],
  kamOwner: ["kam owner", "kam"],
  associateOwner: ["associate owner", "associate"],
  primaryContact: ["client poc", "primary contact", "point of contact", "poc", "contact"],
  activeRisk: ["active risk", "risk"],
  openOpportunity: ["open opportunity", "opportunity", "whitespace"],
  nextTouchpoint: ["next touchpoint", "next meeting", "touchpoint"],
};

function missingQuestionIsStillNeeded(question: string, draft: AccountDraft) {
  const normalized = question.toLowerCase();
  return !Object.entries(accountDraftFieldQuestionTerms).some(([field, terms]) => {
    const value = draft[field as keyof AccountDraft];
    return Boolean(value.trim()) && terms.some((term) => normalized.includes(term));
  });
}

function storedDocumentTemplates() {
  if (typeof window === "undefined") return [];
  try {
    const parsed = JSON.parse(window.localStorage.getItem("kamazing:document-templates") || window.localStorage.getItem("dotkam:document-templates") || "[]");
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
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
    source: "Initial source files",
    status: "Pending",
  },
  {
    id: "suggest-segment",
    field: "segment",
    label: "Domain",
    proposedValue: "Grid modernization and analytics",
    source: "Initial source files",
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
    source: "Initial source files",
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
    label: "Client POC",
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
    sourceFiles: ["NovaGrid kickoff notes.pdf", "Energy analytics SOW.docx", "Executive discovery notes.docx"],
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

function buildStandardOnboardingJourney(baseDate = new Date()): OnboardingJourneyDraftItem[] {
  return defaultAccountJourneyItems.map((item) => ({
    id: item.id,
    type: item.type,
    title: item.title,
    dueDate: journeyDateFromOffset(item.offsetDays, baseDate),
    recurrence: normalizeJourneyRecurrence(item.recurrence),
  }));
}

const kycDraftSections: KycDraftSection[] = [
  {
    id: "kyc-executive-summary",
    title: "Executive summary",
    source: "Accepted profile fields and uploaded source files",
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
    source: "Initial source files",
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
    source: "Initial source files and support documents",
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

const onboardingScoreDrafts: OnboardingScoreDraft[] = defaultKpiWeights.map((kpi, index) => ({
  id: kpi.id,
  name: kpi.name,
  weight: kpi.weight,
  score: [4.1, 3.8, 3.6, 3.2, 3.4, 3.7, 4.0, 3.1][index] ?? 3.5,
  source: "Source files + user-confirmed context",
  why: {
    relationship:
      "Proposed from the visible sponsor/contact evidence, current draft ownership fields, and any meeting or stakeholder references found in the source package. This score should stay above average only if the account has named executive access, more than one functional stakeholder, a clear internal champion, and a repeatable engagement cadence. If those contacts are not confirmed, the score should be reduced because relationship coverage would be too dependent on assumptions.",
    "contract-health":
      "Proposed from renewal timing, contract/source-file references, and any commercial terms visible in the draft. The score reflects whether the account has enough contractual protection: duration, notice period, renewability, pricing/uplift language, and termination safeguards. If the uploaded files do not prove those terms, this should be treated as a provisional score until the SOW/MSA or signed contract evidence confirms them.",
    "customer-success":
      "Proposed from client feedback signals, issue-resolution notes, communication cadence, and delivery satisfaction evidence found in the onboarding context. A healthy score requires explicit signs that the client is satisfied and responsive, not just an absence of complaints. If feedback is indirect or missing, the score should remain conservative until a sponsor or recent meeting note confirms confidence.",
    risk:
      "Proposed from the strongest downside signals in the source package: market/industry exposure, competitor or replacement risk, delivery concerns, commercial friction, and stakeholder uncertainty. This score is intentionally conservative because risk should not be inferred away without evidence. It can improve once the setup confirms named risk owners, mitigation path, renewal path, and whether any delivery or commercial blocker is already resolved.",
    "resource-health":
      "Proposed from the available Tkxel team/resource information, role coverage, skill fit, backup readiness, and whether delivery depends on one critical person. If the uploaded material names only partial team coverage or does not prove continuity, the score should stay mid-range even when the rest of the account looks healthy. Strong named backups, stable staffing, and clear ownership would justify increasing it.",
    "project-health":
      "Proposed from delivery scope, backlog/roadmap clarity, active escalation signals, and whether the account journey already includes a near-term governance checkpoint. The score is not just about whether work exists; it reflects whether delivery is controlled, visible, and trusted by the client. Missing roadmap, unresolved escalations, or vague delivery ownership should keep this score lower until confirmed.",
    "financial-health":
      "Proposed from ARR, payment/commercial references, invoice exposure, revenue trend, and contract-to-billing alignment evidence. A high score needs source-backed signs that revenue is stable, invoices are current, and commercial terms match what is being billed. If finance evidence is only inferred from ARR or filename context, the score should remain provisional rather than pretending payment health is known.",
    whitespace:
      "Proposed from expansion clues such as unsold services, cross-sell/upsell references, sponsor appetite, and whether the current work creates a credible next buying motion. This score can be positive even when overall health is not perfect, but only if there is evidence of a real expansion path. If the source package does not identify a sponsor, need, or next commercial step, the score should stay conservative and trigger validation rather than automatic optimism.",
  }[kpi.id] ?? "Proposed from uploaded source files and the current account draft. Keep this score provisional unless the underlying sub-parameters have source-backed evidence or user confirmation.",
  proposedTask:
    index === 3
      ? "Confirm risk owner and mitigation path before onboarding handoff."
      : index === 7
        ? "Validate expansion paths with the commercial sponsor."
        : "",
}));

function onboardingSteps(sourceFileCount: number, draft: AccountDraft, suggestions: OnboardingSuggestion[], documents: OnboardingDocument[], journey: OnboardingJourneyDraftItem[]): Array<{ label: string; status: OnboardingStepStatus }> {
  const acceptedSuggestions = suggestions.filter((suggestion) => suggestion.status === "Accepted").length;
  const hasSourceFiles = sourceFileCount > 0;
  return [
    { label: "Source files uploaded", status: hasSourceFiles ? "Done" : "Active" },
    { label: "Evidence extraction", status: hasSourceFiles ? "Done" : "Pending" },
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

function latestKamScoreFromAccount(account: Record<string, unknown>) {
  const scores = Array.isArray(account.kamScores) ? account.kamScores as Array<Record<string, unknown>> : [];
  return scores[0];
}

function numericScoreField(score: Record<string, unknown> | undefined, field: string) {
  const value = Number(score?.[field]);
  return Number.isFinite(value) ? Math.max(0, Math.min(100, Math.round(value))) : null;
}

function mapApiAccountToPortfolioAccount(account: Record<string, unknown>): PortfolioAccount {
  const health = String(account.health ?? "HEALTHY") as PortfolioHealth;
  const latestScore = latestKamScoreFromAccount(account);
  const kam = account.kam as { name?: string } | undefined;
  const associateOwner = account.associateOwner as { name?: string } | undefined;
  const contacts = Array.isArray(account.contacts) ? account.contacts as Array<Record<string, unknown>> : [];
  const resources = Array.isArray(account.resources) ? account.resources as Array<Record<string, unknown>> : [];
  const journeyItems = Array.isArray(account.journeyItems) ? account.journeyItems as Array<Record<string, unknown>> : [];
  const documents = Array.isArray(account.documents) ? account.documents as Array<Record<string, unknown>> : [];
  const kycVersions = Array.isArray(account.kycVersions) ? account.kycVersions as Array<Record<string, unknown>> : [];
  const latestKyc = kycVersions[0];
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
    scoreDimensions: {
      csat: numericScoreField(latestScore, "csat"),
      relationship: numericScoreField(latestScore, "relationship"),
      risk: numericScoreField(latestScore, "risk"),
      contractHealth: numericScoreField(latestScore, "contractHealth"),
      projectHealth: numericScoreField(latestScore, "projectHealth"),
      resourceHealth: numericScoreField(latestScore, "resourceHealth"),
      financial: numericScoreField(latestScore, "financial"),
      whitespace: numericScoreField(latestScore, "whitespace"),
    },
    renewalDays: daysUntil(account.contractEnd as string | null | undefined),
    kamOwner: kam?.name ?? "KAM not set",
    associateOwner: associateOwner?.name ?? "Account owner not set",
    contactName: metadata?.primaryContact || String(contacts.find((contact) => contact.isPrimary)?.name ?? contacts[0]?.name ?? "Client POC not set"),
    logoUrl: typeof account.logoUrl === "string" ? account.logoUrl : undefined,
    deliveryModel: String(account.deliveryModel ?? account.segment ?? "Delivery model not set"),
    currentWork: String(account.currentWork ?? "Account setup in progress"),
    relationshipSignal: String(account.relationshipSignal ?? "Review latest account documents"),
    contacts: contacts.map((contact, index) => ({
      id: String(contact.id ?? `contact-${index}`),
      name: String(contact.name ?? "Unnamed contact"),
      designation: String(contact.title ?? "Contact"),
      location: String(contact.location ?? "Location not set"),
      timeZone: String(contact.timeZone ?? "Time zone not set"),
      email: String(contact.email ?? "Email not set"),
      mobile: String(contact.phone ?? "Mobile not set"),
      hierarchyRank: Number(contact.hierarchyRank ?? index + 1),
    })),
    resources: resources.map((resource, index) => ({
      id: String(resource.id ?? `resource-${index}`),
      name: String(resource.name ?? "Unnamed resource"),
      role: String(resource.role ?? "Role not set"),
      pod: String(resource.pod ?? "Pod not set"),
      location: String(resource.location ?? "Location not set"),
      startDate: String(resource.startDate ?? "Start date not set"),
    })),
    journeyItems: journeyItems.map((item, index) => ({
      id: String(item.id ?? `journey-${index}`),
      title: String(item.title ?? "Journey item"),
      type: String(item.type ?? "To-do") as "Meeting" | "QBR" | "To-do",
      date: String(item.dateLabel ?? "Date not set"),
      detail: String(item.detail ?? ""),
      status: String(item.status ?? "UPCOMING"),
    })),
    documents: documents.map((document, index) => ({
      id: String(document.id ?? `document-${index}`),
      name: String(document.name ?? "Document"),
      type: String(document.type ?? "OTHER"),
      uploadedAt: document.createdAt ? new Date(String(document.createdAt)).toLocaleDateString("en-US", { month: "short", day: "numeric" }) : "Uploaded",
      status: String(document.signalStatus ?? "Processed"),
      url: String(document.fileUrl ?? documentPreviewUrl(String(document.name ?? "Document"), String(document.type ?? "OTHER"))),
    })),
    kycVersion: latestKyc ? {
      id: String(latestKyc.id ?? ""),
      version: Number(latestKyc.version ?? 1),
      status: String(latestKyc.status ?? "DRAFT"),
      executiveSummary: latestKyc.executiveSummary as string | null | undefined,
      businessModel: latestKyc.businessModel as string | null | undefined,
      keyStakeholders: latestKyc.keyStakeholders as string | null | undefined,
      strategicGoals: latestKyc.strategicGoals as string | null | undefined,
      riskFactors: latestKyc.riskFactors as string | null | undefined,
      expansionOpportunity: latestKyc.expansionOpportunity as string | null | undefined,
      csatHistory: latestKyc.csatHistory as string | null | undefined,
      competitiveLandscape: latestKyc.competitiveLandscape as string | null | undefined,
      financialOverview: latestKyc.financialOverview as string | null | undefined,
    } : undefined,
  };
}

function mapApiAccountsToPortfolioAccounts(accounts: Array<Record<string, unknown>>) {
  return accounts.map(mapApiAccountToPortfolioAccount);
}

function scoreOutOfFive(score: number) {
  const normalized = score <= 5 ? score : score / 20;
  return Math.max(0, Math.min(5, normalized));
}

function scoreOutOfFiveLabel(score: number) {
  const value = scoreOutOfFive(score);
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
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

function asPlainRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function stringifyKycValue(value: unknown): string {
  if (Array.isArray(value)) {
    return value.map(stringifyKycValue).filter(Boolean).join("\n");
  }
  if (value && typeof value === "object") {
    return Object.entries(value as Record<string, unknown>)
      .map(([key, item]) => `${key}: ${stringifyKycValue(item)}`)
      .filter((line) => !line.endsWith(": "))
      .join("\n");
  }
  return String(value ?? "").trim();
}

function meaningfulKycText(value: unknown) {
  const text = stringifyKycValue(value);
  if (!text) return "";
  const weakSignals = ["not enough information", "not available", "not provided", "insufficient evidence", "limited available"];
  return weakSignals.some((signal) => text.toLowerCase().includes(signal)) ? "" : text;
}

function kycDraftContent(account: PortfolioAccount, kyc: GeneratedWorkspaceKycPayload) {
  const sections: Array<[string, unknown]> = [
    ["Executive summary", kyc.executiveSummary],
    ["Business model", kyc.businessModel],
    ["Key stakeholders", kyc.keyStakeholders],
    ["Strategic goals", kyc.strategicGoals],
    ["Risk factors", kyc.riskFactors],
    ["Expansion opportunity", kyc.expansionOpportunity],
    ["CSAT history", kyc.csatHistory],
    ["Competitive landscape", kyc.competitiveLandscape],
    ["Financial overview", kyc.financialOverview],
  ];
  return [
    `# ${account.name} KYC Draft`,
    `Generated: ${new Date().toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}`,
    "",
    ...sections.flatMap(([title, value]) => [`## ${title}`, stringifyKycValue(value) || "No generated content for this section.", ""]),
  ].join("\n");
}

function generatedKycDocumentFromPayload(account: PortfolioAccount, kyc: GeneratedWorkspaceKycPayload): UploadedAccountDocument {
  const createdAtMs = Date.parse(String(kyc.createdAt ?? ""));
  const safeCreatedAtMs = Number.isFinite(createdAtMs) ? createdAtMs : Date.now();
  const version = Number(kyc.version ?? 1);
  const fileName = `${account.name} KYC v${version}.docx`;
  return {
    id: `kyc-draft-${String(kyc.id ?? `${account.id}-${safeCreatedAtMs}`)}`,
    name: fileName,
    type: "KYC draft",
    uploadedBy: "T-Man",
    uploadedAt: new Date(safeCreatedAtMs).toLocaleDateString("en-US", { month: "short", day: "numeric" }),
    uploadedAtMs: safeCreatedAtMs,
    status: "Draft",
    affected: "KYC review and account profile",
    url: documentPreviewUrl(fileName, "KYC draft"),
    kind: "generated-kyc",
    draftContent: kycDraftContent(account, kyc),
    kycPayload: kyc,
  };
}

function xmlEscape(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function markdownToDocxParagraphs(content: string) {
  return content
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const heading = line.match(/^#{1,3}\s+(.+)/);
      const text = xmlEscape((heading ? heading[1] : line).replace(/^[-*]\s+/, "• "));
      const style = heading ? '<w:pStyle w:val="Heading1"/>' : "";
      return `<w:p><w:pPr>${style}</w:pPr><w:r><w:t xml:space="preserve">${text}</w:t></w:r></w:p>`;
    })
    .join("");
}

async function downloadDocxArtifact(fileName: string, content: string) {
  const { default: JSZip } = await import("jszip");
  const zip = new JSZip();
  zip.file("[Content_Types].xml", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
  <Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>
</Types>`);
  zip.folder("_rels")?.file(".rels", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
  <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/>
</Relationships>`);
  zip.folder("docProps")?.file("core.xml", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/">
  <dc:creator>DotKAM T-Man</dc:creator>
  <dc:title>${xmlEscape(fileName.replace(/\.docx$/i, ""))}</dc:title>
</cp:coreProperties>`);
  zip.folder("word")?.file("document.xml", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body>${markdownToDocxParagraphs(content)}<w:sectPr><w:pgSz w:w="12240" w:h="15840"/><w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440"/></w:sectPr></w:body>
</w:document>`);
  const blob = await zip.generateAsync({ type: "blob", mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document" });
  triggerDownload(fileName.replace(/\.(md|txt)$/i, ".docx"), blob);
}

function triggerDownload(fileName: string, blob: Blob) {
  const blobUrl = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = blobUrl;
  anchor.download = fileName;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(blobUrl);
}

function downloadTextArtifact(fileName: string, content: string) {
  triggerDownload(fileName, new Blob([content], { type: "text/markdown;charset=utf-8" }));
}

function downloadUrlArtifact(url: string, fileName: string) {
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = fileName;
  anchor.rel = "noopener";
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
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
    <div className="shrink-0 text-right" aria-label={`${healthLabel[account.health]} score ${scoreOutOfFiveLabel(account.healthScore)} out of 5`}>
      <p className={`text-[18px] font-black leading-none tracking-[-0.04em] ${scoreTone[account.health]}`}>{scoreOutOfFiveLabel(account.healthScore)}</p>
      <p className="mt-0.5 text-[10px] font-semibold text-[var(--text-muted)]">/5</p>
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

function settleUiAction() {
  return new Promise<void>((resolve) => {
    window.setTimeout(resolve, 180);
  });
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
  isSubmitting,
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
  isSubmitting: boolean;
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
          disabled={!hasReason || isSubmitting}
          className="inline-flex h-9 items-center gap-2 rounded-full bg-[#25352E] px-4 text-[12px] font-bold text-[#FFF9EF] disabled:cursor-not-allowed disabled:bg-[#25352E]/35"
        >
          {isSubmitting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
          {isSubmitting ? (isAssociate ? "Requesting..." : "Saving...") : primaryActionLabel}
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
              <button
                type="button"
                onClick={() => onApproveRequest(targetId)}
                disabled={isSubmitting}
                className="inline-flex items-center gap-2 rounded-full bg-[#25352E] px-3 py-1.5 text-[12px] font-bold text-[#FFF9EF] disabled:cursor-not-allowed disabled:bg-[#25352E]/35"
              >
                {isSubmitting ? <Loader2 className="h-3 w-3 animate-spin" /> : null}
                {isSubmitting ? "Working..." : "Approve"}
              </button>
              <button
                type="button"
                onClick={() => onDenyRequest(targetId)}
                disabled={isSubmitting}
                className="inline-flex items-center gap-2 rounded-full border border-[#D8CAB9] bg-white/70 px-3 py-1.5 text-[12px] font-bold text-[#6F6254] disabled:cursor-not-allowed disabled:opacity-55"
              >
                {isSubmitting ? <Loader2 className="h-3 w-3 animate-spin" /> : null}
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
  weightSubmitting,
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
  weightSubmitting: boolean;
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
                    disabled={weightSubmitting}
                    className="inline-flex items-center gap-2 rounded-full bg-[#25352E] px-3 py-1.5 text-[12px] font-bold text-[#FFF9EF] disabled:cursor-not-allowed disabled:bg-[#25352E]/35"
                  >
                    {weightSubmitting ? <Loader2 className="h-3 w-3 animate-spin" /> : null}
                    {weightSubmitting ? "Working..." : "Approve"}
                  </button>
                  <button
                    type="button"
                    onClick={onDenyRequest}
                    disabled={weightSubmitting}
                    className="inline-flex items-center gap-2 rounded-full border border-[#D8CAB9] bg-white/70 px-3 py-1.5 text-[12px] font-bold text-[#6F6254] disabled:cursor-not-allowed disabled:opacity-55"
                  >
                    {weightSubmitting ? <Loader2 className="h-3 w-3 animate-spin" /> : null}
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
                    disabled={!canSubmitWeights || weightSubmitting}
                    className="inline-flex h-10 items-center gap-2 rounded-full bg-[#25352E] px-5 text-[12px] font-bold text-[#FFF9EF] disabled:cursor-not-allowed disabled:bg-[#25352E]/35"
                  >
                    {weightSubmitting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
                    {weightSubmitting ? (isAssociate ? "Requesting..." : "Saving...") : actionLabel}
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

function effectiveSubParameterScore(row: KpiOverviewRow, parameterName: string, scoreOverrides: Record<string, ScoreOverride>) {
  const parameter = row.subParameters.find((item) => item.name === parameterName);
  if (!parameter) return 1;
  return scoreOverrides[subParameterKey(row.id, parameter.name)]?.score ?? parameter.score;
}

function effectiveKpiRowScore(row: KpiOverviewRow, scoreOverrides: Record<string, ScoreOverride>) {
  if (row.subParameters.length === 0) return row.score;
  const total = row.subParameters.reduce((sum, parameter) => sum + effectiveSubParameterScore(row, parameter.name, scoreOverrides), 0);
  return clampFrameworkScore(Math.round(total / row.subParameters.length));
}

function withEffectiveKpiScores(kpiRows: KpiOverviewRow[], scoreOverrides: Record<string, ScoreOverride>) {
  return kpiRows.map((row) => {
    const score = effectiveKpiRowScore(row, scoreOverrides);
    return {
      ...row,
      score,
      trend: accountTrend(score),
    };
  });
}

function OverviewTab({
  kpiRows,
  initialFocus,
  isLoadingKpis,
  kpiRowsError,
  activeTasks,
  acceptedTaskIds,
  pendingDenials,
  deniedReasons,
  overrideDrafts,
  overrideSubmitting,
  overrideRequests,
  scoreOverrides,
  kpiWeights,
  weightDrafts,
  weightRequest,
  weightReason,
  weightSubmitting,
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
  initialFocus: string | null;
  isLoadingKpis: boolean;
  kpiRowsError: string;
  activeTasks: ActiveTask[];
  acceptedTaskIds: Set<string>;
  pendingDenials: Record<string, string>;
  deniedReasons: Record<string, string>;
  overrideDrafts: Record<string, { score: string; reason: string }>;
  overrideSubmitting: string | null;
  overrideRequests: Record<string, ScoreOverrideRequest>;
  scoreOverrides: Record<string, ScoreOverride>;
  kpiWeights: Record<string, number>;
  weightDrafts: Record<string, { weight: string }>;
  weightRequest: KpiWeightRequest | undefined;
  weightReason: string;
  weightSubmitting: boolean;
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
  const effectiveKpiRows = useMemo(() => withEffectiveKpiScores(kpiRows, scoreOverrides), [kpiRows, scoreOverrides]);
  const sortedKpiRows = [...effectiveKpiRows].sort((a, b) => a.score - b.score);

  useEffect(() => {
    const normalizedFocus = normalizeFocusTarget(initialFocus);
    if (!normalizedFocus) return;
    const matchingRow = kpiRows.find((row) => normalizeFocusTarget(row.id) === normalizedFocus);
    if (!matchingRow) return;
    setExpandedRows((rows) => {
      const next = new Set(rows);
      next.add(matchingRow.id);
      return next;
    });
  }, [initialFocus, kpiRows]);

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
      {isLoadingKpis ? (
        <div className="rounded-2xl border border-dashed border-[#D8CAB9] bg-[#FFF9EF]/70 p-4 text-[13px] font-bold text-[#7D6E5F]">
          Loading DB-backed score breakdown...
        </div>
      ) : null}
      {kpiRowsError ? (
        <div className="rounded-2xl border border-[#E8B8B0] bg-[#FFF0ED] p-4 text-[13px] font-bold text-[#B33D32]">
          {kpiRowsError}. Showing fallback framework rows until the score API is available.
        </div>
      ) : null}
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
          {!isLoadingKpis && kpiRows.length === 0 ? (
            <div className="p-4 text-[13px] font-bold text-[#7D6E5F]">
              No score breakdown is available for this account yet.
            </div>
          ) : null}
          {sortedKpiRows.map((row) => {
            const currentScore = row.score;
            const currentWeight = kpiWeights[row.id] ?? parseWeightValue(row.weight);
            const healthy = currentScore >= 4;
            const isExpanded = expandedRows.has(row.id) || Boolean(activeOverrideTargetId?.startsWith(`${row.id}:`));
            const hasProposedAction = Boolean(row.why || row.task);
            return (
	              <div key={row.id} data-kpi-focus={normalizeFocusTarget(row.id) ?? row.id} className="group scroll-mt-24">
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
                      const effectiveTrend: KpiTrend = scoreOverrides[targetId]
                        ? parameterScore > parameter.score ? "up" : parameterScore < parameter.score ? "down" : "flat"
                        : parameter.trend ?? row.trend;
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
                              {effectiveTrend !== "flat" ? (
                                <span className={`inline-flex h-5 items-center rounded-full border px-2 text-[10px] font-black ${
                                  effectiveTrend === "up" ? "border-[#BFD9C6] bg-[#F2FAF1] text-[#1F6C42]" : "border-[#F0BBB4] bg-[#FFF0ED] text-[#B33D32]"
                                }`}>
                                  {effectiveTrend === "up" ? "Rising" : "Falling"}
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
                          {effectiveTrend === "down" && parameter.fallingWhy ? (
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
                                isSubmitting={overrideSubmitting === targetId}
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
        kpiRows={effectiveKpiRows}
        kpiWeights={kpiWeights}
        weightDrafts={weightDrafts}
        weightRequest={weightRequest}
        weightReason={weightReason}
        weightSubmitting={weightSubmitting}
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
  saving,
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
  saving?: boolean;
  onOpenChange: (open: boolean) => void;
  onReasonChange: (reason: string) => void;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const isApproval = action === "approve";
  const actionLabel = isApproval ? (role === "ASSOCIATE" ? "Route proposal" : "Approve proposal") : "Deny proposal";
  const reasonPlaceholder = isApproval ? "Reason for approving this proposal" : "Reason for denying this proposal";

  return (
    <Dialog.Root open={open} onOpenChange={(nextOpen) => {
      if (saving && !nextOpen) return;
      onOpenChange(nextOpen);
    }}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-[70] bg-[#1F2722]/28 backdrop-blur-[2px]" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-[80] w-[min(92vw,500px)] -translate-x-1/2 -translate-y-1/2 rounded-3xl border border-[#D8CAB9] bg-[#FFF9EF] p-4 shadow-[0_28px_70px_-32px_rgba(31,39,34,0.56)] focus:outline-none">
          <div className="flex items-start justify-between gap-3">
            <Dialog.Title className="text-[20px] font-black tracking-[-0.05em] text-[#1F2722]">{actionLabel}</Dialog.Title>
            <button
              type="button"
              onClick={onCancel}
              disabled={saving}
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
            disabled={saving}
            className="mt-4 min-h-28 w-full rounded-xl border border-[#E1D7CA] bg-white/80 p-3 text-[13px] text-[#25352E] outline-none placeholder:text-[#A69A8B] focus:border-[#25352E]/45"
          />
          <div className="mt-4 flex justify-end gap-2">
            <button
              type="button"
              onClick={onCancel}
              disabled={saving}
              className="rounded-full border border-[#D8CAB9] bg-white/70 px-4 py-2 text-[13px] font-bold text-[#6F6254]"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={onConfirm}
              disabled={!reason.trim() || saving}
              className="inline-flex items-center gap-2 rounded-full bg-[#25352E] px-4 py-2 text-[13px] font-bold text-[#FFF9EF] disabled:cursor-not-allowed disabled:bg-[#25352E]/35"
            >
              {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
              {saving ? "Saving..." : "Confirm"}
            </button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function FieldLabel({ children, required, tooltip }: { children: ReactNode; required?: boolean; tooltip?: string }) {
  return (
    <span className="inline-flex items-center gap-1 text-[12px] font-bold text-[#7D6E5F]">
      <span>
        {children}
        {required ? <span className="ml-0.5 text-[#B33D32]">*</span> : null}
      </span>
      {tooltip ? (
        <span className="group relative inline-flex h-4 w-4 items-center justify-center rounded-full border border-[#D8CAB9] text-[10px] font-black text-[#8A7A69]">
          ?
          <span className="pointer-events-none absolute left-1/2 top-5 z-20 hidden w-52 -translate-x-1/2 rounded-xl border border-[#D8CAB9] bg-[#FFF9EF] px-3 py-2 text-left text-[11px] font-bold leading-relaxed text-[#25352E] shadow-[0_16px_38px_-26px_rgba(31,39,34,0.58)] group-hover:block">
            {tooltip}
          </span>
        </span>
      ) : null}
    </span>
  );
}

function AddContactDialog({
  open,
  draft,
  saving,
  onOpenChange,
  onDraftChange,
  onSave,
}: {
  open: boolean;
  draft: ContactDraft;
  saving: boolean;
  onOpenChange: (open: boolean) => void;
  onDraftChange: (draft: ContactDraft) => void;
  onSave: () => void;
}) {
  const canSave = Boolean(draft.name.trim() && draft.email.trim() && draft.designation.trim());
  const inputClass = "mt-1 h-10 w-full rounded-xl border border-[#E1D7CA] bg-white/80 px-3 text-[13px] text-[#25352E] outline-none placeholder:text-[#A69A8B] focus:border-[#25352E]/45";

  return (
    <Dialog.Root open={open} onOpenChange={(nextOpen) => {
      if (saving && !nextOpen) return;
      onOpenChange(nextOpen);
    }}>
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
              <FieldLabel required>Name</FieldLabel>
              <input className={inputClass} value={draft.name} onChange={(event) => onDraftChange({ ...draft, name: event.target.value })} placeholder="Contact name" />
            </label>
            <label>
              <FieldLabel required>Designation</FieldLabel>
              <input className={inputClass} value={draft.designation} onChange={(event) => onDraftChange({ ...draft, designation: event.target.value })} placeholder="Role or title" />
            </label>
            <label>
              <FieldLabel required>Email</FieldLabel>
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
            <button type="button" onClick={onSave} disabled={!canSave || saving} className="rounded-full bg-[#25352E] px-4 py-2 text-[13px] font-bold text-[#FFF9EF] disabled:cursor-not-allowed disabled:bg-[#25352E]/35">
              {saving ? "Saving..." : "Save"}
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
  saving,
  onOpenChange,
  onDraftChange,
  onSave,
}: {
  open: boolean;
  draft: ResourceDraft;
  saving: boolean;
  onOpenChange: (open: boolean) => void;
  onDraftChange: (draft: ResourceDraft) => void;
  onSave: () => void;
}) {
  const canSave = Boolean(draft.name.trim() && draft.role.trim() && draft.pod.trim());
  const inputClass = "mt-1 h-10 w-full rounded-xl border border-[#E1D7CA] bg-white/80 px-3 text-[13px] text-[#25352E] outline-none placeholder:text-[#A69A8B] focus:border-[#25352E]/45";

  return (
    <Dialog.Root open={open} onOpenChange={(nextOpen) => {
      if (saving && !nextOpen) return;
      onOpenChange(nextOpen);
    }}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-[70] bg-[#1F2722]/28 backdrop-blur-[2px]" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-[80] w-[min(92vw,540px)] -translate-x-1/2 -translate-y-1/2 rounded-3xl border border-[#D8CAB9] bg-[#FFF9EF] p-4 shadow-[0_28px_70px_-32px_rgba(31,39,34,0.56)] focus:outline-none">
          <div className="flex items-start justify-between gap-3">
            <Dialog.Title className="text-[20px] font-black tracking-[-0.05em] text-[#1F2722]">Add resource</Dialog.Title>
            <button
              type="button"
              onClick={() => onOpenChange(false)}
              disabled={saving}
              className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-[#DED1C1] bg-white/70 text-[#6F6254] hover:text-[#25352E]"
              aria-label="Close add resource"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="mt-4 grid gap-3 md:grid-cols-2">
            <label>
              <FieldLabel required>Name</FieldLabel>
              <input className={inputClass} value={draft.name} disabled={saving} onChange={(event) => onDraftChange({ ...draft, name: event.target.value })} placeholder="Resource name" />
            </label>
            <label>
              <FieldLabel required>Role</FieldLabel>
              <input className={inputClass} value={draft.role} disabled={saving} onChange={(event) => onDraftChange({ ...draft, role: event.target.value })} placeholder="Delivery Lead" />
            </label>
            <label>
              <FieldLabel required>Pod</FieldLabel>
              <input className={inputClass} value={draft.pod} disabled={saving} onChange={(event) => onDraftChange({ ...draft, pod: event.target.value })} placeholder="Payments Modernization" />
            </label>
            <label>
              <FieldLabel>SOW name</FieldLabel>
              <input className={inputClass} value={draft.sowName} disabled={saving} onChange={(event) => onDraftChange({ ...draft, sowName: event.target.value })} placeholder="Statement of work name" />
            </label>
            <label>
              <FieldLabel>Location</FieldLabel>
              <input className={inputClass} value={draft.location} disabled={saving} onChange={(event) => onDraftChange({ ...draft, location: event.target.value })} placeholder="Lahore, Pakistan" />
            </label>
            <label>
              <FieldLabel>Start date</FieldLabel>
              <input className={inputClass} value={draft.startDate} disabled={saving} onChange={(event) => onDraftChange({ ...draft, startDate: event.target.value })} placeholder="Jun 2026" />
            </label>
          </div>

          <div className="mt-5 flex justify-end gap-2">
            <button type="button" onClick={() => onOpenChange(false)} disabled={saving} className="rounded-full border border-[#D8CAB9] bg-white/70 px-4 py-2 text-[13px] font-bold text-[#6F6254] disabled:opacity-60">
              Cancel
            </button>
            <button type="button" onClick={onSave} disabled={!canSave || saving} className="inline-flex items-center gap-2 rounded-full bg-[#25352E] px-4 py-2 text-[13px] font-bold text-[#FFF9EF] disabled:cursor-not-allowed disabled:bg-[#25352E]/35">
              {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
              {saving ? "Saving..." : "Save"}
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
  saving,
  onOpenChange,
  onDraftChange,
  onSave,
}: {
  open: boolean;
  draft: JourneyItemDraft;
  saving: boolean;
  onOpenChange: (open: boolean) => void;
  onDraftChange: (draft: JourneyItemDraft) => void;
  onSave: () => void;
}) {
  const canSave = Boolean(draft.title.trim() && draft.date && draft.detail.trim());
  const inputClass = "mt-1 h-10 w-full rounded-xl border border-[#E1D7CA] bg-white/80 px-3 text-[13px] text-[#25352E] outline-none placeholder:text-[#A69A8B] focus:border-[#25352E]/45";

  return (
    <Dialog.Root open={open} onOpenChange={(nextOpen) => {
      if (saving && !nextOpen) return;
      onOpenChange(nextOpen);
    }}>
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
              <FieldLabel required>Tag</FieldLabel>
              <select className={inputClass} value={draft.type} onChange={(event) => onDraftChange({ ...draft, type: event.target.value as TaskType })}>
                <option value="Meeting">Meeting</option>
                <option value="QBR">QBR</option>
                <option value="To-do">To-do</option>
              </select>
            </label>
            <label>
              <FieldLabel required>Title</FieldLabel>
              <input className={inputClass} value={draft.title} onChange={(event) => onDraftChange({ ...draft, title: event.target.value })} placeholder="Journey item title" />
            </label>
            <label>
              <FieldLabel required>Due date</FieldLabel>
              <input className={inputClass} type="date" value={draft.date} onChange={(event) => onDraftChange({ ...draft, date: event.target.value })} />
            </label>
            <label>
              <FieldLabel required>Details</FieldLabel>
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
            <button type="button" onClick={onSave} disabled={!canSave || saving} className="rounded-full bg-[#25352E] px-4 py-2 text-[13px] font-bold text-[#FFF9EF] disabled:cursor-not-allowed disabled:bg-[#25352E]/35">
              {saving ? "Saving..." : "Save"}
            </button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function GenerateDocumentDialog({
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
  const canGenerate = Boolean(draft.documentType.trim() && draft.outputFormat && draft.audience.trim() && draft.period.trim() && draft.goals.trim());
  const copy = generationCopyFor(draft.documentType);
  const inputClass = "mt-1 h-10 w-full rounded-xl border border-[#E1D7CA] bg-white/80 px-3 text-[13px] text-[#25352E] outline-none placeholder:text-[#A69A8B] focus:border-[#25352E]/45";
  const textareaClass = "mt-1 min-h-20 w-full rounded-xl border border-[#E1D7CA] bg-white/80 px-3 py-2 text-[13px] text-[#25352E] outline-none placeholder:text-[#A69A8B] focus:border-[#25352E]/45";

  return (
    <Dialog.Root open={open} onOpenChange={(nextOpen) => {
      if (generating && !nextOpen) return;
      onOpenChange(nextOpen);
    }}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-[70] bg-[#1F2722]/28 backdrop-blur-[2px]" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-[80] w-[min(92vw,620px)] -translate-x-1/2 -translate-y-1/2 rounded-3xl border border-[#D8CAB9] bg-[#FFF9EF] p-4 shadow-[0_28px_70px_-32px_rgba(31,39,34,0.56)] focus:outline-none">
          <div className="flex items-start justify-between gap-3">
            <Dialog.Title className="text-[20px] font-black tracking-[-0.05em] text-[#1F2722]">Generate document</Dialog.Title>
            <button
              type="button"
              onClick={() => onOpenChange(false)}
              disabled={generating}
              className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-[#DED1C1] bg-white/70 text-[#6F6254] hover:text-[#25352E]"
              aria-label="Close document builder"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="mt-4 grid gap-3 md:grid-cols-2">
            <label>
              <FieldLabel required>Document</FieldLabel>
              <select className={inputClass} value={draft.documentType} disabled={generating} onChange={(event) => onDraftChange({ ...draft, documentType: event.target.value })}>
                {documentGenerationTypes.map((type) => (
                  <option key={type} value={type}>{type}</option>
                ))}
              </select>
            </label>
            <label>
              <FieldLabel required>Format</FieldLabel>
              <select className={inputClass} value={draft.outputFormat} disabled={generating} onChange={(event) => onDraftChange({ ...draft, outputFormat: event.target.value as QbrPromptDraft["outputFormat"] })}>
                {documentOutputFormats.map((format) => (
                  <option key={format} value={format}>{format}</option>
                ))}
              </select>
            </label>
            <label>
              <FieldLabel required>{copy.audienceLabel}</FieldLabel>
              <input className={inputClass} value={draft.audience} disabled={generating} onChange={(event) => onDraftChange({ ...draft, audience: event.target.value })} placeholder={copy.audiencePlaceholder} />
            </label>
            <label>
              <FieldLabel required>{copy.periodLabel}</FieldLabel>
              <input className={inputClass} value={draft.period} disabled={generating} onChange={(event) => onDraftChange({ ...draft, period: event.target.value })} placeholder={copy.periodPlaceholder} />
            </label>
            <label className="md:col-span-2">
              <FieldLabel required>{copy.goalsLabel}</FieldLabel>
              <textarea className={textareaClass} value={draft.goals} disabled={generating} onChange={(event) => onDraftChange({ ...draft, goals: event.target.value })} placeholder={copy.goalsPlaceholder} />
            </label>
            <label>
              <FieldLabel>{copy.risksLabel}</FieldLabel>
              <textarea className={textareaClass} value={draft.risks} disabled={generating} onChange={(event) => onDraftChange({ ...draft, risks: event.target.value })} placeholder={copy.risksPlaceholder} />
            </label>
            <label>
              <FieldLabel>{copy.asksLabel}</FieldLabel>
              <textarea className={textareaClass} value={draft.asks} disabled={generating} onChange={(event) => onDraftChange({ ...draft, asks: event.target.value })} placeholder={copy.asksPlaceholder} />
            </label>
          </div>

          <div className="mt-5 flex justify-end gap-2">
            <button type="button" onClick={() => onOpenChange(false)} disabled={generating} className="rounded-full border border-[#D8CAB9] bg-white/70 px-4 py-2 text-[13px] font-bold text-[#6F6254] disabled:opacity-60">
              Cancel
            </button>
            <button type="button" onClick={onGenerate} disabled={!canGenerate || generating} className="inline-flex items-center gap-2 rounded-full bg-[#25352E] px-4 py-2 text-[13px] font-bold text-[#FFF9EF] disabled:cursor-not-allowed disabled:bg-[#25352E]/35">
              {generating ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
              {generating ? "Generating..." : "Generate"}
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
  saving,
  onOpenChange,
  onDraftChange,
  onSave,
}: {
  open: boolean;
  draft: DocumentUploadDraft;
  saving: boolean;
  onOpenChange: (open: boolean) => void;
  onDraftChange: (draft: DocumentUploadDraft) => void;
  onSave: () => void;
}) {
  const selectedType = documentTypes.find((documentType) => documentType.type === draft.type) ?? documentTypes[0];
  const canSave = Boolean(draft.fileName);

  return (
    <Dialog.Root open={open} onOpenChange={(nextOpen) => {
      if (saving && !nextOpen) return;
      onOpenChange(nextOpen);
    }}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-[70] bg-[#1F2722]/28 backdrop-blur-[2px]" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-[80] w-[min(92vw,560px)] -translate-x-1/2 -translate-y-1/2 rounded-3xl border border-[#D8CAB9] bg-[#FFF9EF] p-4 shadow-[0_28px_70px_-32px_rgba(31,39,34,0.56)] focus:outline-none">
          <div className="flex items-start justify-between gap-3">
            <Dialog.Title className="text-[20px] font-black tracking-[-0.05em] text-[#1F2722]">Upload document</Dialog.Title>
            <button
              type="button"
              onClick={() => onOpenChange(false)}
              disabled={saving}
              className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-[#DED1C1] bg-white/70 text-[#6F6254] hover:text-[#25352E]"
              aria-label="Close upload document"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="mt-4 grid gap-3">
            <label>
              <FieldLabel required>Document type</FieldLabel>
              <select
                value={draft.type}
                disabled={saving}
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
              <FieldLabel required>File</FieldLabel>
              <input
                type="file"
                accept=".pdf,.doc,.docx,.pptx,.txt,.md,.xlsx,.xls"
                disabled={saving}
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
            <button type="button" onClick={() => onOpenChange(false)} disabled={saving} className="rounded-full border border-[#D8CAB9] bg-white/70 px-4 py-2 text-[13px] font-bold text-[#6F6254] disabled:opacity-60">
              Cancel
            </button>
            <button type="button" onClick={onSave} disabled={!canSave || saving} className="inline-flex items-center gap-2 rounded-full bg-[#25352E] px-4 py-2 text-[13px] font-bold text-[#FFF9EF] disabled:cursor-not-allowed disabled:bg-[#25352E]/35">
              {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
              {saving ? "Saving..." : "Save"}
            </button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function DocumentsTab({
  account,
  onAccountUpdate,
  generatedKycDraftDocument,
  onGeneratedKycAccepted,
  onGeneratedKycDismissed,
}: {
  account: PortfolioAccount;
  onAccountUpdate: (account: PortfolioAccount) => void;
  generatedKycDraftDocument?: UploadedAccountDocument | null;
  onGeneratedKycAccepted?: (documentId: string) => void;
  onGeneratedKycDismissed?: (documentId: string, reason: string) => void;
}) {
  const { role, userId } = useRole();
  const { upsertAccount } = useAccountCache();
  const accountMetadata = getAccountRuntimeMetadata(account);
  const accountDocuments = (account.documents ?? []).map((document, index): UploadedAccountDocument => ({
    id: document.id,
    name: document.name,
    type: document.type,
    uploadedBy: account.associateOwner || "Associate",
    uploadedAt: document.uploadedAt,
    uploadedAtMs: documentUploadedAtMs(document.uploadedAt, index),
    status: document.status === "PENDING_REVIEW" ? "Pending review" : "Processed",
    affected: "Account profile and KYC",
    url: document.url,
  }));
  const metadataDocuments = (accountMetadata?.sourceFiles ?? []).map((fileName, index): UploadedAccountDocument => ({
    id: `source-doc-${account.id}-${index}`,
    name: fileName,
    type: "Account source",
    uploadedBy: account.associateOwner || "Associate",
    uploadedAt: "Account setup",
    uploadedAtMs: documentUploadedAtMs(undefined, index),
    status: "Processed",
    affected: "Account profile and KYC",
    url: documentPreviewUrl(fileName, "Account source"),
  }));
  const [uploadedDocuments, setUploadedDocuments] = useState<UploadedAccountDocument[]>(() => accountDocuments.length > 0 ? accountDocuments : metadataDocuments);
  const [signalProposals, setSignalProposals] = useState<DocumentSignalProposal[]>([]);
  const [uploadOpen, setUploadOpen] = useState(false);
  const [documentUploading, setDocumentUploading] = useState(false);
  const [documentUploadError, setDocumentUploadError] = useState("");
  const [draftDocumentEditor, setDraftDocumentEditor] = useState<UploadedAccountDocument | null>(null);
  const [savingDraftDocument, setSavingDraftDocument] = useState(false);
  const [qbrOpen, setQbrOpen] = useState(false);
  const [qbrDeckUrl, setQbrDeckUrl] = useState("");
  const [qbrGenerating, setQbrGenerating] = useState(false);
  const [qbrError, setQbrError] = useState("");
  const [proposalResolutionDraft, setProposalResolutionDraft] = useState<ProposalResolutionDraft | null>(null);
  const [proposalResolutionSaving, setProposalResolutionSaving] = useState(false);
  const [acceptingKycDraftId, setAcceptingKycDraftId] = useState<string | null>(null);
  const [kycDismissDraft, setKycDismissDraft] = useState<{ documentId: string; reason: string } | null>(null);
  const [dismissingKycDraft, setDismissingKycDraft] = useState(false);
  const [uploadDraft, setUploadDraft] = useState<DocumentUploadDraft>({
    type: documentTypes[0].type,
    fileName: "",
    fileUrl: "",
  });
  const [qbrDraft, setQbrDraft] = useState<QbrPromptDraft>({
    documentType: "QBR",
    outputFormat: "pptx",
    audience: "",
    period: "",
    goals: "",
    risks: "",
    asks: "",
  });
  const canApproveDirectly = role === "KAM";
  const canReviewProposals = role === "ASSOCIATE" || role === "KAM";
  const proposalUnderReview = proposalResolutionDraft ? signalProposals.find((proposal) => proposal.id === proposalResolutionDraft.proposalId) : undefined;

  async function recordDocumentLearningRule(input: { reason: string; itemTitle?: string | null; category?: string | null }) {
    const reason = input.reason.trim();
    if (!shouldCreateLearningRule(reason)) return;
    try {
      await fetch("/api/v2/ai-rules", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-role": role,
          ...(userId ? { "x-user-id": userId } : {}),
        },
        body: JSON.stringify({
          source: "dismissal",
          reason,
          accountId: account.id,
          accountName: account.name,
          itemTitle: input.itemTitle,
          category: input.category,
          text: buildLearningRuleText({
            reason,
            accountName: account.name,
            itemTitle: input.itemTitle,
            category: input.category,
          }),
        }),
      });
    } catch {
      // Do not block document review if the learning-rule capture fails.
    }
  }
  const recentDocuments = [...uploadedDocuments].sort((a, b) => b.uploadedAtMs - a.uploadedAtMs);
  const kycDraftUnderDismissal = kycDismissDraft ? uploadedDocuments.find((document) => document.id === kycDismissDraft.documentId) : undefined;

  useEffect(() => {
    const nextMetadata = getAccountRuntimeMetadata(account);
    const nextAccountDocuments = (account.documents ?? []).map((document, index): UploadedAccountDocument => ({
      id: document.id,
      name: document.name,
      type: document.type,
      uploadedBy: account.associateOwner || "Associate",
      uploadedAt: document.uploadedAt,
      uploadedAtMs: documentUploadedAtMs(document.uploadedAt, index),
      status: document.status === "PENDING_REVIEW" ? "Pending review" : "Processed",
      affected: "Account profile and KYC",
      url: document.url,
    }));
    const nextMetadataDocuments = (nextMetadata?.sourceFiles ?? []).map((fileName, index): UploadedAccountDocument => ({
      id: `source-doc-${account.id}-${index}`,
      name: fileName,
      type: "Account source",
      uploadedBy: account.associateOwner || "Associate",
      uploadedAt: "Account setup",
      uploadedAtMs: documentUploadedAtMs(undefined, index),
      status: "Processed",
      affected: "Account profile and KYC",
      url: documentPreviewUrl(fileName, "Account source"),
    }));
    setUploadedDocuments(nextAccountDocuments.length > 0 ? nextAccountDocuments : nextMetadataDocuments);
    setSignalProposals([]);
    setProposalResolutionDraft(null);
    setDocumentUploadError("");
    setQbrDeckUrl("");
  }, [account.id]);

  useEffect(() => {
    if (!generatedKycDraftDocument) return;
    setUploadedDocuments((documents) => [
      generatedKycDraftDocument,
      ...documents.filter((document) => document.id !== generatedKycDraftDocument.id),
    ]);
  }, [generatedKycDraftDocument?.id]);

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
        upsertAccount(payload.data as CachedApiAccount);
        onAccountUpdate(mapApiAccountToPortfolioAccount(payload.data as Record<string, unknown>));
      }
    } catch {
      // The local card remains usable if refresh fails.
    }
  }

  function previewDocument(document: UploadedAccountDocument) {
    if (document.draftContent) {
      setDraftDocumentEditor(document);
      return;
    }
    openExternalTab(document.url);
  }

  async function downloadDocument(document: UploadedAccountDocument) {
    if (document.draftContent) {
      if (document.name.toLowerCase().endsWith(".docx")) {
        await downloadDocxArtifact(document.name, document.draftContent);
      } else if (/\.(md|markdown|txt)$/i.test(document.name)) {
        downloadTextArtifact(document.name, document.draftContent);
      } else if (document.url) {
        downloadUrlArtifact(document.url, document.name);
      } else {
        downloadTextArtifact(document.name.replace(/\.[^.]+$/, ".md"), document.draftContent);
      }
      return;
    }
    openExternalTab(document.url);
  }

  async function saveDraftDocumentEdits() {
    if (!draftDocumentEditor || savingDraftDocument) return;
    setSavingDraftDocument(true);
    try {
      await settleUiAction();
      setUploadedDocuments((documents) =>
        documents.map((document) => (document.id === draftDocumentEditor.id ? draftDocumentEditor : document)),
      );
      setDraftDocumentEditor(null);
    } finally {
      setSavingDraftDocument(false);
    }
  }

  async function acceptKycDraft(document: UploadedAccountDocument) {
    if (document.kind !== "generated" && document.kind !== "generated-kyc") return;
    if (acceptingKycDraftId) return;
    setAcceptingKycDraftId(document.id);
    const acceptedAtMs = new Date().getTime();
    const kyc = document.kycPayload;
    if (!kyc) {
      try {
        await settleUiAction();
        setUploadedDocuments((documents) =>
          documents.map((item) =>
            item.id === document.id
              ? {
                  ...item,
                  status: "Processed",
                  type: item.type.replace(/\bdraft\b/i, "accepted").trim() || "Accepted generated document",
                  acceptedAt: "Today",
                  uploadedAtMs: acceptedAtMs,
                }
              : item,
          ),
        );
      } finally {
        setAcceptingKycDraftId(null);
      }
      return;
    }
    const financialOverview = asPlainRecord(kyc.financialOverview);
    const parsedArr = Number(financialOverview.arr);
    const contractEnd = String(financialOverview.contractEnd ?? "").trim();
    const executiveSummary = meaningfulKycText(kyc.executiveSummary);
    const riskFactors = meaningfulKycText(kyc.riskFactors);
    const expansionOpportunity = meaningfulKycText(kyc.expansionOpportunity);
    const nextAccount: PortfolioAccount = {
      ...account,
      arr: Number.isFinite(parsedArr) && parsedArr > 0 ? parsedArr : account.arr,
      renewalDays: contractEnd ? daysUntil(contractEnd) : account.renewalDays,
      currentWork: executiveSummary || account.currentWork,
      relationshipSignal: riskFactors || expansionOpportunity || account.relationshipSignal,
    };

    try {
      await settleUiAction();
      setUploadedDocuments((documents) =>
        documents.map((item) =>
          item.id === document.id
            ? {
                ...item,
                status: "Processed",
                type: "Accepted KYC",
                acceptedAt: "Today",
                uploadedAtMs: acceptedAtMs,
              }
            : item,
        ),
      );
      onGeneratedKycAccepted?.(document.id);
      onAccountUpdate(nextAccount);

      if (!account.id.startsWith("v2-acct-")) {
        const response = await fetch(`/api/accounts/${account.id}`, {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
            "x-role": role,
          },
          body: JSON.stringify({
            arr: nextAccount.arr,
            contractEnd: contractEnd || undefined,
            currentWork: nextAccount.currentWork,
            relationshipSignal: nextAccount.relationshipSignal,
          }),
        });
        const payload = await response.json();
        if (!response.ok) throw new Error(payload.error || "Accepted KYC could not update account information");
        upsertAccount(payload.data as CachedApiAccount);
        onAccountUpdate(mapApiAccountToPortfolioAccount(payload.data as Record<string, unknown>));
      }
    } catch (error) {
      setDocumentUploadError(error instanceof Error ? error.message : "Accepted KYC could not update account information");
    } finally {
      setAcceptingKycDraftId(null);
    }
  }

  async function dismissKycDraft() {
    if (!kycDismissDraft || !kycDismissDraft.reason.trim() || dismissingKycDraft) return;
    setDismissingKycDraft(true);
    try {
      await settleUiAction();
      setUploadedDocuments((documents) => documents.filter((document) => document.id !== kycDismissDraft.documentId));
      if (kycDraftUnderDismissal?.kind === "generated-kyc") {
        onGeneratedKycDismissed?.(kycDismissDraft.documentId, kycDismissDraft.reason.trim());
      }
      void recordDocumentLearningRule({
        reason: kycDismissDraft.reason.trim(),
        itemTitle: kycDraftUnderDismissal?.name ?? "Generated KYC",
        category: "KYC",
      });
      setKycDismissDraft(null);
    } finally {
      setDismissingKycDraft(false);
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
    if (!proposalResolutionDraft || !reason || proposalResolutionSaving) return;
    setProposalResolutionSaving(true);
    const decidedAt = "Today";
    const currentProposal = signalProposals.find((proposal) => proposal.id === proposalResolutionDraft.proposalId);
    try {
      if (currentProposal?.documentId) {
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
      }
      if (proposalResolutionDraft.action === "deny" && currentProposal) {
        void recordDocumentLearningRule({
          reason,
          itemTitle: `${currentProposal.field}: ${currentProposal.proposedValue}`,
          category: currentProposal.kind ?? "Document proposal",
        });
      }
      await settleUiAction();
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
    } catch (error) {
      setDocumentUploadError(error instanceof Error ? error.message : "Document proposal review failed");
    } finally {
      setProposalResolutionSaving(false);
    }
  }

  async function generateQbr() {
    if (!qbrDraft.audience.trim() || !qbrDraft.period.trim() || !qbrDraft.goals.trim()) return;
    setQbrGenerating(true);
    setQbrError("");
    try {
      const wantsQbrPptx = qbrDraft.documentType === "QBR" && qbrDraft.outputFormat === "pptx";
      if (!wantsQbrPptx) {
        const response = await fetch("/api/v2/cammie", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            role,
            message: `Generate a ${qbrDraft.documentType} for ${account.name} as ${qbrDraft.outputFormat}. Audience: ${qbrDraft.audience}. Period or purpose: ${qbrDraft.period}. Goals: ${qbrDraft.goals}. Risks: ${qbrDraft.risks}. Client asks: ${qbrDraft.asks}.`,
            activeAccount: {
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
            },
            accounts: [],
            attachments: recentDocuments.map((document) => ({
              fileName: document.name,
              type: document.type,
              preview: `${document.affected}. Review status: ${documentReviewStatus(signalProposals.filter((proposal) => proposal.sourceDocument === document.name))}.`,
            })),
            templates: storedDocumentTemplates(),
            conversation: [],
            generateDocument: {
              documentType: qbrDraft.documentType,
              outputFormat: qbrDraft.outputFormat,
            },
          }),
        });
        const payload = await response.json();
        if (!response.ok) throw new Error(payload.error || "Document generation failed");
        const generatedDocument = payload.generatedDocument as
          | { title?: unknown; documentType?: unknown; fileName?: unknown; fileUrl?: unknown; format?: unknown; summary?: unknown; markdown?: unknown }
          | undefined;
        if (!generatedDocument?.fileUrl) {
          throw new Error(payload.reply || "T-Man needs more input before generating this document.");
        }
        const generatedMarkdown = String(generatedDocument.markdown || "");
        const generatedTitle = String(generatedDocument.title || `${account.name} ${qbrDraft.documentType}`);
        const generatedFileName = String(generatedDocument.fileName || `${generatedTitle}.${qbrDraft.outputFormat}`);
        const generatedAt = new Date();
        const generatedAtMs = generatedAt.getTime();
        if (qbrDraft.documentType.toLowerCase() === "kyc") {
          const kycDocument: UploadedAccountDocument = {
            id: `generated-kyc-${account.id}-${generatedAtMs}`,
            name: generatedFileName.toLowerCase().endsWith(".docx") ? generatedFileName : `${account.name} KYC.docx`,
            type: "KYC draft",
            uploadedBy: "T-Man",
            uploadedAt: "Today",
            uploadedAtMs: generatedAtMs,
            status: "Draft",
            affected: "KYC review and account profile",
            url: String(generatedDocument.fileUrl),
            kind: "generated-kyc",
            draftContent: generatedMarkdown || `# ${generatedTitle}\n\n${String(generatedDocument.summary || "Generated KYC draft.")}`,
            kycPayload: {
              version: 1,
              status: "DRAFT",
              createdAt: generatedAt.toISOString(),
              executiveSummary: generatedMarkdown || String(generatedDocument.summary || "Generated KYC draft."),
            },
          };
          setUploadedDocuments((documents) => [kycDocument, ...documents.filter((document) => document.id !== kycDocument.id)]);
          setQbrDeckUrl("");
        } else {
          const generatedDraftDocument: UploadedAccountDocument = {
            id: `generated-${qbrDraft.documentType.toLowerCase()}-${account.id}-${generatedAtMs}`,
            name: generatedFileName,
            type: `${qbrDraft.documentType} draft`,
            uploadedBy: "T-Man",
            uploadedAt: "Today",
            uploadedAtMs: generatedAtMs,
            status: "Draft",
            affected: `${qbrDraft.documentType} review and account context`,
            url: String(generatedDocument.fileUrl),
            kind: "generated",
            draftContent: generatedMarkdown || `# ${generatedTitle}\n\n${String(generatedDocument.summary || "Generated document draft.")}`,
          };
          setUploadedDocuments((documents) => [generatedDraftDocument, ...documents.filter((document) => document.id !== generatedDraftDocument.id)]);
          setQbrDeckUrl("");
        }
        setQbrOpen(false);
        return;
      }

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
        throw new Error(errorBody.error || "Document generation failed");
      }

      const blob = await response.blob();
      const generatedAtMs = new Date().getTime();
      if (qbrDeckUrl && qbrDeckUrl.startsWith("blob:")) URL.revokeObjectURL(qbrDeckUrl);
      const blobUrl = URL.createObjectURL(blob);
      const qbrDocument: UploadedAccountDocument = {
        id: `generated-qbr-${account.id}-${generatedAtMs}`,
        name: `${account.name} QBR.pptx`,
        type: "QBR draft",
        uploadedBy: "T-Man",
        uploadedAt: "Today",
        uploadedAtMs: generatedAtMs,
        status: "Draft",
        affected: "QBR review and account context",
        url: blobUrl,
        kind: "generated",
      };
      setUploadedDocuments((documents) => [qbrDocument, ...documents.filter((document) => document.id !== qbrDocument.id)]);
      setQbrDeckUrl("");
      setQbrOpen(false);
    } catch (error) {
      setQbrError(error instanceof Error ? error.message : "Document generation failed");
    } finally {
      setQbrGenerating(false);
    }
  }

  return (
    <div className="space-y-4">
      <section className="rounded-3xl border border-[#E5DACD] bg-white/58 p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h3 className="text-[18px] font-black tracking-[-0.04em] text-[#1F2722]">AI impact review</h3>
            <p className="mt-1 max-w-3xl text-[12px] font-bold leading-relaxed text-[#7D6E5F]">
              Uploaded account documents are parsed for profile, score, KYC, risk, opportunity, and action suggestions. Suggested changes stay in review until approved.
            </p>
          </div>
          <span className="rounded-full border border-[#D8CAB9] bg-[#FFF9EF]/80 px-3 py-1 text-[11px] font-black text-[#6F6254]">
            {signalProposals.filter((proposal) => proposal.status === "Needs review" || proposal.status === "Routed to KAM").length} pending
          </span>
        </div>
      </section>

      <div className="flex justify-end gap-2">
        <button type="button" onClick={() => setUploadOpen(true)} disabled={documentUploading} className="inline-flex items-center gap-2 rounded-full border border-[#D8CAB9] bg-white/70 px-4 py-2 text-[13px] font-bold text-[#25352E] disabled:opacity-60">
          {documentUploading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
          {documentUploading ? "Uploading..." : "Upload"}
        </button>
        <button type="button" onClick={() => setQbrOpen(true)} className="rounded-full bg-[#25352E] px-4 py-2 text-[13px] font-bold text-[#FFF9EF]">
          Generate
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
              const reviewStatus = document.status === "Draft" ? "Draft" : document.acceptedAt ? "Accepted" : documentReviewStatus(documentProposals);
              const isGeneratedDraft = (document.kind === "generated" || document.kind === "generated-kyc") && document.status === "Draft";
              const approvalLabel = document.kind === "generated-kyc" ? "Approve KYC" : "Approve";

              return (
                <article key={document.id} className="grid gap-3 rounded-2xl border border-[#E5DACD] bg-[#FFF9EF]/72 p-3 lg:grid-cols-[0.9fr_1.1fr]">
                  <div>
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <button type="button" onClick={() => previewDocument(document)} className="text-left text-[14px] font-black text-[#1F2722] underline decoration-[#C9BBA9] underline-offset-4">
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
                    <div className="mt-3 flex flex-wrap gap-2">
                      <button type="button" onClick={() => previewDocument(document)} className="rounded-full border border-[#D8CAB9] bg-white/70 px-3 py-1.5 text-[12px] font-bold text-[#25352E]">
                        Preview
                      </button>
                      {document.draftContent ? (
                        <button type="button" onClick={() => previewDocument(document)} className="rounded-full border border-[#D8CAB9] bg-white/70 px-3 py-1.5 text-[12px] font-bold text-[#25352E]">
                          Edit
                        </button>
                      ) : null}
                      <button type="button" onClick={() => void downloadDocument(document)} className="rounded-full border border-[#D8CAB9] bg-white/70 px-3 py-1.5 text-[12px] font-bold text-[#25352E]">
                        Download
                      </button>
                      {isGeneratedDraft ? (
                        <>
                          <button type="button" onClick={() => void acceptKycDraft(document)} disabled={acceptingKycDraftId === document.id} className="inline-flex items-center gap-2 rounded-full bg-[#25352E] px-3 py-1.5 text-[12px] font-bold text-[#FFF9EF] disabled:cursor-not-allowed disabled:bg-[#25352E]/35">
                            {acceptingKycDraftId === document.id ? <Loader2 className="h-3 w-3 animate-spin" /> : null}
                            {acceptingKycDraftId === document.id ? "Approving..." : approvalLabel}
                          </button>
                          <button type="button" onClick={() => setKycDismissDraft({ documentId: document.id, reason: "" })} className="rounded-full border border-[#D8CAB9] bg-white/70 px-3 py-1.5 text-[12px] font-bold text-[#6F6254]">
                            Dismiss
                          </button>
                        </>
                      ) : null}
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
                          <button type="button" onClick={() => startProposalResolution(proposal.id, "approve")} disabled={proposalResolutionSaving} className="rounded-full bg-[#25352E] px-3 py-1.5 text-[12px] font-bold text-[#FFF9EF] disabled:cursor-not-allowed disabled:bg-[#25352E]/35">
                            {canApproveDirectly ? "Approve" : "Route to KAM"}
                          </button>
                          <button type="button" onClick={() => startProposalResolution(proposal.id, "deny")} disabled={proposalResolutionSaving} className="rounded-full border border-[#D8CAB9] bg-white/70 px-3 py-1.5 text-[12px] font-bold text-[#6F6254] disabled:opacity-60">
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

      <Dialog.Root open={Boolean(draftDocumentEditor)} onOpenChange={(nextOpen) => {
        if (!nextOpen) setDraftDocumentEditor(null);
      }}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 z-[70] bg-[#1B1812]/38 backdrop-blur-[3px]" />
          <Dialog.Content className="fixed left-1/2 top-1/2 z-[71] flex h-[min(760px,84vh)] w-[min(860px,92vw)] -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-[1.35rem] border border-[#E2D8CC] bg-[#FBF7EF] shadow-[0_28px_90px_-48px_rgba(43,32,19,0.85)] focus:outline-none">
            <div className="flex shrink-0 items-center justify-between gap-3 border-b border-[#E5DACD] px-4 py-3">
              <Dialog.Title className="truncate text-[20px] font-black tracking-[-0.05em] text-[#1F2722]">
                {draftDocumentEditor?.name ?? "Document draft"}
              </Dialog.Title>
              <Dialog.Close asChild>
                <button type="button" className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-[#D8CAB9] bg-white/70 text-[#6F6254]" aria-label="Close document draft">
                  <X className="h-4 w-4" />
                </button>
              </Dialog.Close>
            </div>
            <div className="min-h-0 flex-1 p-4">
              <textarea
                value={draftDocumentEditor?.draftContent ?? ""}
                onChange={(event) => setDraftDocumentEditor((document) => document ? { ...document, draftContent: event.target.value } : document)}
                className="h-full w-full resize-none rounded-2xl border border-[#E1D7CA] bg-white/75 p-4 font-mono text-[13px] leading-relaxed text-[#25352E] outline-none focus:border-[#25352E]/45"
              />
            </div>
            <div className="flex shrink-0 flex-wrap items-center justify-end gap-2 border-t border-[#E5DACD] px-4 py-3">
              <button
                type="button"
                onClick={() => {
                  if (!draftDocumentEditor?.draftContent) return;
                  if (draftDocumentEditor.name.toLowerCase().endsWith(".docx")) {
                    void downloadDocxArtifact(draftDocumentEditor.name, draftDocumentEditor.draftContent);
                  } else if (/\.(md|markdown|txt)$/i.test(draftDocumentEditor.name)) {
                    downloadTextArtifact(draftDocumentEditor.name, draftDocumentEditor.draftContent);
                  } else if (draftDocumentEditor.url) {
                    downloadUrlArtifact(draftDocumentEditor.url, draftDocumentEditor.name);
                  } else {
                    downloadTextArtifact(draftDocumentEditor.name.replace(/\.[^.]+$/, ".md"), draftDocumentEditor.draftContent);
                  }
                }}
                className="rounded-full border border-[#D8CAB9] bg-white/70 px-4 py-2 text-[13px] font-bold text-[#25352E]"
              >
                Download
              </button>
              <button type="button" onClick={() => void saveDraftDocumentEdits()} disabled={savingDraftDocument} className="inline-flex items-center gap-2 rounded-full bg-[#25352E] px-4 py-2 text-[13px] font-bold text-[#FFF9EF] disabled:cursor-not-allowed disabled:bg-[#25352E]/35">
                {savingDraftDocument ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
                {savingDraftDocument ? "Saving..." : "Save draft"}
              </button>
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
      <GenerateDocumentDialog open={qbrOpen} draft={qbrDraft} onOpenChange={setQbrOpen} onDraftChange={setQbrDraft} onGenerate={generateQbr} generating={qbrGenerating} />
      <UploadDocumentDialog open={uploadOpen} draft={uploadDraft} saving={documentUploading} onOpenChange={setUploadOpen} onDraftChange={setUploadDraft} onSave={saveUploadedDocument} />
      <ProposalResolutionForm
        open={Boolean(proposalResolutionDraft)}
        action={proposalResolutionDraft?.action ?? "approve"}
        reason={proposalResolutionDraft?.reason ?? ""}
        proposal={proposalUnderReview}
        role={role}
        saving={proposalResolutionSaving}
        onOpenChange={(nextOpen) => {
          if (!nextOpen) setProposalResolutionDraft(null);
        }}
        onReasonChange={(reason) => setProposalResolutionDraft((draft) => (draft ? { ...draft, reason } : draft))}
        onConfirm={confirmProposalResolution}
        onCancel={() => setProposalResolutionDraft(null)}
      />
      <Dialog.Root open={Boolean(kycDismissDraft)} onOpenChange={(nextOpen) => {
        if (!nextOpen && !dismissingKycDraft) setKycDismissDraft(null);
      }}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 z-[70] bg-[#1B1812]/38 backdrop-blur-[3px]" />
          <Dialog.Content className="fixed left-1/2 top-1/2 z-[81] w-[min(520px,92vw)] -translate-x-1/2 -translate-y-1/2 rounded-3xl border border-[#D8CAB9] bg-[#FFF9EF] p-4 shadow-[0_28px_70px_-32px_rgba(31,39,34,0.56)] focus:outline-none">
            <div className="flex items-start justify-between gap-3">
              <div>
                <Dialog.Title className="text-[20px] font-black tracking-[-0.05em] text-[#1F2722]">Dismiss generated draft</Dialog.Title>
                <p className="mt-1 text-[12px] font-bold text-[#7D6E5F]">{kycDraftUnderDismissal?.name ?? "Generated draft"}</p>
              </div>
              <Dialog.Close asChild>
                <button type="button" disabled={dismissingKycDraft} className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-[#DED1C1] bg-white/70 text-[#6F6254]" aria-label="Close dismiss KYC dialog">
                  <X className="h-4 w-4" />
                </button>
              </Dialog.Close>
            </div>
            <textarea
              value={kycDismissDraft?.reason ?? ""}
              onChange={(event) => setKycDismissDraft((draft) => (draft ? { ...draft, reason: event.target.value } : draft))}
              placeholder="Reason for dismissing this draft"
              className="mt-4 min-h-28 w-full resize-none rounded-2xl border border-[#E1D7CA] bg-white/75 p-3 text-[13px] font-bold text-[#25352E] outline-none placeholder:text-[#A69A8B] focus:border-[#25352E]/45"
            />
            <div className="mt-4 flex justify-end gap-2">
              <button type="button" onClick={() => setKycDismissDraft(null)} disabled={dismissingKycDraft} className="rounded-full border border-[#D8CAB9] bg-white/70 px-4 py-2 text-[13px] font-bold text-[#6F6254]">
                Cancel
              </button>
              <button type="button" onClick={() => void dismissKycDraft()} disabled={!kycDismissDraft?.reason.trim() || dismissingKycDraft} className="inline-flex items-center gap-2 rounded-full bg-[#25352E] px-4 py-2 text-[13px] font-bold text-[#FFF9EF] disabled:cursor-not-allowed disabled:bg-[#25352E]/35">
                {dismissingKycDraft ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
                {dismissingKycDraft ? "Dismissing..." : "Confirm"}
              </button>
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
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
  const { role, userId } = useRole();
  const { upsertAccount } = useAccountCache();
  const canEditProfile = role !== "EXECUTIVE";
  const accountMetadata = getAccountRuntimeMetadata(account);
  const primaryContactName = accountMetadata?.primaryContact || account.contactName;
  const accountPersistedContacts: AccountContact[] = (account.contacts ?? []).map((contact) => ({
    id: contact.id,
    name: contact.name,
    designation: contact.designation,
    location: contact.location,
    timeZone: contact.timeZone,
    email: contact.email,
    mobile: contact.mobile,
    hierarchyRank: contact.hierarchyRank,
  }));
  const accountDerivedContacts: AccountContact[] = accountPersistedContacts.length === 0 && primaryContactName && primaryContactName !== "Client POC not set"
    ? [{
        id: `derived-contact-${account.id}`,
        name: primaryContactName,
        designation: "Client POC",
        location: account.country && account.country !== "Country not set" ? account.country : "Location not set",
        timeZone: "Time zone not set",
        email: "Email not set",
        mobile: "Mobile not set",
        hierarchyRank: 1,
      }]
    : [];
  const baseContacts = accountPersistedContacts.length > 0 ? accountPersistedContacts : accountDerivedContacts;
  const baseResources = (account.resources ?? []).map((resource) => ({
    id: resource.id,
    name: resource.name,
    role: resource.role,
    pod: resource.pod,
    location: resource.location,
    startDate: resource.startDate,
  }));
  const persistedUpcomingJourneyItems: JourneyItem[] = (account.journeyItems ?? [])
    .filter((item) => item.status !== "COMPLETED" && item.status !== "DISMISSED")
    .map((item) => ({
      id: item.id,
      title: item.title,
      type: item.type,
      date: item.date,
      detail: item.detail,
    }));
  const metadataJourneyItems: JourneyItem[] = persistedUpcomingJourneyItems.length === 0 ? (accountMetadata?.journey ?? []).map((item) => ({
    id: `metadata-${item.id}`,
    title: item.title,
    type: item.type,
    date: item.dueDate,
    detail: item.recurrence,
  })) : [];
  const baseUpcomingJourneyItems = persistedUpcomingJourneyItems.length > 0 ? persistedUpcomingJourneyItems : metadataJourneyItems;
  const baseCompletedJourneyItems = (account.journeyItems ?? [])
    .filter((item) => item.status === "COMPLETED")
    .map((item) => ({
      id: item.id,
      title: item.title,
      type: item.type,
      date: "Done",
      detail: item.detail,
    }));
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
    currentWork: account.currentWork,
    relationshipSignal: account.relationshipSignal,
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
    sowName: "",
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
      currentWork: account.currentWork,
      relationshipSignal: account.relationshipSignal,
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
        currentWork: profileDraft.currentWork.trim() || account.currentWork,
        relationshipSignal: profileDraft.relationshipSignal.trim() || account.relationshipSignal,
      };

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
          associateOwnerName: profileDraft.associateOwner.trim() || undefined,
          deliveryModel: profileDraft.segment.trim() || undefined,
          currentWork: profileDraft.currentWork.trim() || undefined,
          relationshipSignal: profileDraft.relationshipSignal.trim() || undefined,
          contractEnd: profileDraft.contractEnd || undefined,
        }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Profile update failed");
      upsertAccount(payload.data as CachedApiAccount);
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
      upsertAccount(payload.data as CachedApiAccount);
      onAccountUpdate(mapApiAccountToPortfolioAccount(payload.data as Record<string, unknown>));
    } catch (error) {
      setProfileError(error instanceof Error ? error.message : "Icon upload failed");
    } finally {
      setProfileSaving(false);
    }
  }

  function startJourneyResolution(itemId: string, action: TaskResolutionAction) {
    setJourneyResolutionDraft({ taskId: itemId, action, reason: "" });
  }

  async function recordJourneyLearningRule(reason: string, itemTitle?: string | null) {
    if (!shouldCreateLearningRule(reason)) return;
    try {
      await fetch("/api/v2/ai-rules", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-role": role,
          "x-user-id": userId ?? "",
        },
        body: JSON.stringify({
          source: "dismissal",
          reason,
          accountId: account.id,
          accountName: account.name,
          itemTitle: itemTitle ?? "Account journey item",
          category: "Account journey",
          text: buildLearningRuleText({
            reason,
            accountName: account.name,
            itemTitle: itemTitle ?? "Account journey item",
            category: "Account journey",
          }),
        }),
      });
    } catch {
      // Learning capture is non-blocking; the user's task resolution should still succeed.
    }
  }

  async function confirmJourneyResolution() {
    const reason = journeyResolutionDraft?.reason.trim();
    if (!journeyResolutionDraft || !reason) return;
    const persistedItem = account.journeyItems?.find((item) => item.id === journeyResolutionDraft.taskId);
    const dismissedItemTitle = resolutionItem?.title ?? persistedItem?.title ?? "Account journey item";
    if (journeyResolutionDraft.action === "Dismiss") {
      void recordJourneyLearningRule(reason, dismissedItemTitle);
    }
    if (persistedItem) {
      try {
        const response = await fetch(`/api/accounts/${account.id}/journey-items`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json", "x-role": role },
          body: JSON.stringify({
            id: persistedItem.id,
            status: journeyResolutionDraft.action === "Done" ? "COMPLETED" : "DISMISSED",
            dismissReason: journeyResolutionDraft.action === "Dismiss" ? reason : undefined,
          }),
        });
        const payload = await response.json();
        if (!response.ok) throw new Error(payload.error || "Journey update failed");
        upsertAccount(payload.data as CachedApiAccount);
        onAccountUpdate(mapApiAccountToPortfolioAccount(payload.data as Record<string, unknown>));
        setJourneyResolutionDraft(null);
        return;
      } catch (error) {
        setProfileError(error instanceof Error ? error.message : "Journey update failed");
        return;
      }
    }
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

  async function saveContact() {
    if (profileSaving || !contactDraft.name.trim() || !contactDraft.email.trim() || !contactDraft.designation.trim()) return;
    setProfileError("");
    setProfileSaving(true);
    try {
      const response = await fetch(`/api/accounts/${account.id}/contacts`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-role": role },
        body: JSON.stringify({
          name: contactDraft.name.trim(),
          title: contactDraft.designation.trim(),
          email: contactDraft.email.trim(),
          phone: contactDraft.mobile.trim() || undefined,
          location: contactDraft.location.trim() || undefined,
          timeZone: contactDraft.timeZone.trim() || undefined,
          hierarchyRank: Number(contactDraft.hierarchyRank) || baseContacts.length + customContacts.length + 1,
          isPrimary: sortedContacts.length === 0,
        }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Contact save failed");
      upsertAccount(payload.data as CachedApiAccount);
      onAccountUpdate(mapApiAccountToPortfolioAccount(payload.data as Record<string, unknown>));
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
    } catch (error) {
      setProfileError(error instanceof Error ? error.message : "Contact save failed");
    } finally {
      setProfileSaving(false);
    }
  }

  async function saveResource() {
    if (profileSaving || !resourceDraft.name.trim() || !resourceDraft.role.trim() || !resourceDraft.pod.trim()) return;
    setProfileError("");
    setProfileSaving(true);
    try {
      const response = await fetch(`/api/accounts/${account.id}/resources`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-role": role },
        body: JSON.stringify({
          name: resourceDraft.name.trim(),
          role: resourceDraft.role.trim(),
          pod: resourceDraft.pod.trim(),
          sowName: resourceDraft.sowName.trim() || undefined,
          location: resourceDraft.location.trim() || undefined,
          startDate: resourceDraft.startDate.trim() || undefined,
        }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Resource save failed");
      upsertAccount(payload.data as CachedApiAccount);
      onAccountUpdate(mapApiAccountToPortfolioAccount(payload.data as Record<string, unknown>));
      setResourceDraft({
        name: "",
        role: "",
        pod: "",
        sowName: "",
        location: "",
        startDate: "",
      });
      setResourceDialogOpen(false);
    } catch (error) {
      setProfileError(error instanceof Error ? error.message : "Resource save failed");
    } finally {
      setProfileSaving(false);
    }
  }

  async function handleContactDelete(contactId: string) {
    if (role === "KAM") {
      try {
        const response = await fetch(`/api/accounts/${account.id}/contacts?id=${encodeURIComponent(contactId)}`, {
          method: "DELETE",
          headers: { "x-role": role },
        });
        const payload = await response.json();
        if (!response.ok) throw new Error(payload.error || "Contact delete failed");
        upsertAccount(payload.data as CachedApiAccount);
        onAccountUpdate(mapApiAccountToPortfolioAccount(payload.data as Record<string, unknown>));
      } catch (error) {
        setProfileError(error instanceof Error ? error.message : "Contact delete failed");
      }
      return;
    }
    setContactDeletionRequests((requests) => new Set(requests).add(contactId));
  }

  async function handleResourceDelete(resourceId: string) {
    if (role === "KAM") {
      try {
        const response = await fetch(`/api/accounts/${account.id}/resources?id=${encodeURIComponent(resourceId)}`, {
          method: "DELETE",
          headers: { "x-role": role },
        });
        const payload = await response.json();
        if (!response.ok) throw new Error(payload.error || "Resource delete failed");
        upsertAccount(payload.data as CachedApiAccount);
        onAccountUpdate(mapApiAccountToPortfolioAccount(payload.data as Record<string, unknown>));
      } catch (error) {
        setProfileError(error instanceof Error ? error.message : "Resource delete failed");
      }
      return;
    }
    setResourceDeletionRequests((requests) => new Set(requests).add(resourceId));
  }

  async function saveJourneyItem() {
    if (profileSaving || !journeyDraft.title.trim() || !journeyDraft.date || !journeyDraft.detail.trim()) return;
    setProfileError("");
    setProfileSaving(true);
    try {
      const response = await fetch(`/api/accounts/${account.id}/journey-items`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-role": role },
        body: JSON.stringify({
          title: journeyDraft.title.trim(),
          type: journeyDraft.type,
          dateLabel: displayDateFromInput(journeyDraft.date),
          detail: journeyDraft.detail.trim(),
          status: "UPCOMING",
          sortOrder: visibleUpcomingItems.length + 1,
        }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Journey item save failed");
      upsertAccount(payload.data as CachedApiAccount);
      onAccountUpdate(mapApiAccountToPortfolioAccount(payload.data as Record<string, unknown>));
      setJourneyDraft({
        type: "To-do",
        title: "",
        date: "",
        detail: "",
      });
      setJourneyDialogOpen(false);
    } catch (error) {
      setProfileError(error instanceof Error ? error.message : "Journey item save failed");
    } finally {
      setProfileSaving(false);
    }
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
              <FieldLabel required>Domain</FieldLabel>
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
            <label className="md:col-span-2">
              <FieldLabel>Current work</FieldLabel>
              <input value={profileDraft.currentWork} onChange={(event) => updateProfileDraft("currentWork", event.target.value)} className="mt-1 h-11 w-full rounded-xl border border-[#E1D7CA] bg-white/80 px-3 text-[13px] font-bold text-[#25352E] outline-none" />
            </label>
            <label className="md:col-span-2">
              <FieldLabel>Relationship signal</FieldLabel>
              <input value={profileDraft.relationshipSignal} onChange={(event) => updateProfileDraft("relationshipSignal", event.target.value)} className="mt-1 h-11 w-full rounded-xl border border-[#E1D7CA] bg-white/80 px-3 text-[13px] font-bold text-[#25352E] outline-none" />
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
            <SummaryItem label="Domain" value={account.segment ?? account.deliveryModel} />
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
        saving={profileSaving}
        onOpenChange={setContactDialogOpen}
        onDraftChange={setContactDraft}
        onSave={saveContact}
      />
      <AddResourceDialog
        open={resourceDialogOpen}
        draft={resourceDraft}
        saving={profileSaving}
        onOpenChange={setResourceDialogOpen}
        onDraftChange={setResourceDraft}
        onSave={saveResource}
      />
      <AddJourneyItemDialog
        open={journeyDialogOpen}
        draft={journeyDraft}
        saving={profileSaving}
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
  initialFocus,
  onAccountUpdate,
  onOpenChange,
}: {
  account: PortfolioAccount | null;
  open: boolean;
  initialTab: AccountWorkspaceTab;
  initialFocus: string | null;
  onAccountUpdate: (account: PortfolioAccount) => void;
  onOpenChange: (open: boolean) => void;
}) {
  const { role, userId } = useRole();
  const { fireNotification } = useNotifications();
  const { upsertAccount } = useAccountCache();
  const [activeTab, setActiveTab] = useState<AccountWorkspaceTab>(initialTab);
  const [activeTasks, setActiveTasks] = useState<ActiveTask[]>([]);
  const [pendingDenials, setPendingDenials] = useState<Record<string, string>>({});
  const [deniedReasons, setDeniedReasons] = useState<Record<string, string>>({});
  const [overrideDrafts, setOverrideDrafts] = useState<Record<string, { score: string; reason: string }>>({});
  const [overrideSubmitting, setOverrideSubmitting] = useState<string | null>(null);
  const [overrideRequests, setOverrideRequests] = useState<Record<string, ScoreOverrideRequest>>({});
  const [scoreOverrides, setScoreOverrides] = useState<Record<string, ScoreOverride>>({});
  const [scoreOverrideMessage, setScoreOverrideMessage] = useState("");
  const [scoreOverrideError, setScoreOverrideError] = useState("");
  const [dbKpiRows, setDbKpiRows] = useState<KpiOverviewRow[] | null>(null);
  const [kpiRowsLoading, setKpiRowsLoading] = useState(false);
  const [kpiRowsError, setKpiRowsError] = useState("");
  const [kpiWeights, setKpiWeights] = useState<Record<string, number>>({});
  const [weightDrafts, setWeightDrafts] = useState<Record<string, { weight: string }>>({});
  const [weightReason, setWeightReason] = useState("");
  const [weightRequest, setWeightRequest] = useState<KpiWeightRequest | undefined>();
  const [weightSubmitting, setWeightSubmitting] = useState(false);
  const [kycRegenerating, setKycRegenerating] = useState(false);
  const [kycRegenerationMessage, setKycRegenerationMessage] = useState("");
  const [kycRegenerationError, setKycRegenerationError] = useState("");
  const [generatedKycDraftDocument, setGeneratedKycDraftDocument] = useState<UploadedAccountDocument | null>(null);
  const [recommendationOverlays, setRecommendationOverlays] = useState<Record<string, PlaybookRecommendationOverlay>>({});
  const [aiRules, setAiRules] = useState<AiRule[]>([]);

  const acceptedTaskIds = useMemo(() => new Set(activeTasks.map((task) => task.id)), [activeTasks]);
  const fallbackKpiRows = useMemo(() => buildAccountKpiRows(account), [account]);
  const baseKpiRows = useMemo(() => dbKpiRows ?? fallbackKpiRows, [dbKpiRows, fallbackKpiRows]);
  const kpiRows = useMemo(
    () => applyAiRuleSuppressions(applyRecommendationOverlays(baseKpiRows, recommendationOverlays), aiRules, account),
    [account, aiRules, baseKpiRows, recommendationOverlays],
  );
  const pendingOverrideRequests = useMemo(() => Object.values(overrideRequests).filter((request) => request.status === "Pending"), [overrideRequests]);
  const overrideRequestLabels = useMemo(() => {
    const labels: Record<string, string> = {};
    for (const row of kpiRows) {
      for (const parameter of row.subParameters) {
        labels[subParameterKey(row.id, parameter.name)] = `${row.name} - ${parameter.name}`;
      }
    }
    return labels;
  }, [kpiRows]);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    async function loadAiRules() {
      try {
        const response = await fetch("/api/v2/ai-rules", {
          headers: {
            "x-role": role,
            ...(userId ? { "x-user-id": userId } : {}),
          },
        });
        const payload = await response.json();
        if (!response.ok) return;
        if (!cancelled) setAiRules((payload.data ?? []) as AiRule[]);
      } catch {
        if (!cancelled) setAiRules([]);
      }
    }
    void loadAiRules();
    return () => {
      cancelled = true;
    };
  }, [open, role, userId]);

  async function recordLearningRule(input: { reason: string; itemTitle?: string | null; category?: string | null }) {
    const reason = input.reason.trim();
    if (!shouldCreateLearningRule(reason)) return;
    try {
      const response = await fetch("/api/v2/ai-rules", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-role": role,
          ...(userId ? { "x-user-id": userId } : {}),
        },
        body: JSON.stringify({
          source: "dismissal",
          reason,
          accountId: account?.id,
          accountName: account?.name,
          itemTitle: input.itemTitle,
          category: input.category,
          text: buildLearningRuleText({
            reason,
            accountName: account?.name,
            itemTitle: input.itemTitle,
            category: input.category,
          }),
        }),
      });
      const payload = await response.json();
      if (response.ok && payload.data?.rule) setAiRules((rules) => [payload.data.rule as AiRule, ...rules]);
    } catch {
      // Learning capture should not interrupt approval or dismissal workflows.
    }
  }

  const isAssociate = role === "ASSOCIATE";
  const canOverrideDirectly = role === "KAM";

  function applyApiAccountUpdate(rawAccount: Record<string, unknown>) {
    upsertAccount(rawAccount as CachedApiAccount);
    onAccountUpdate(mapApiAccountToPortfolioAccount(rawAccount));
  }

  function applyScoreSnapshotUpdate(rawScore: unknown) {
    if (!account || !rawScore || typeof rawScore !== "object") return;
    const score = rawScore as Record<string, unknown>;
    const overall = Number(score.overall);
    const nextHealth = String(score.health ?? account.health) as PortfolioHealth;
    if (!Number.isFinite(overall)) return;
    onAccountUpdate({
      ...account,
      health: nextHealth,
      healthScore: Math.round(overall),
      scoreDimensions: {
        csat: numericScoreField(score, "csat"),
        relationship: numericScoreField(score, "relationship"),
        risk: numericScoreField(score, "risk"),
        contractHealth: numericScoreField(score, "contractHealth"),
        projectHealth: numericScoreField(score, "projectHealth"),
        resourceHealth: numericScoreField(score, "resourceHealth"),
        financial: numericScoreField(score, "financial"),
        whitespace: numericScoreField(score, "whitespace"),
      },
    });
  }

  useEffect(() => {
    if (open) {
      setActiveTab(initialTab);
      setKycRegenerationMessage("");
      setKycRegenerationError("");
      setGeneratedKycDraftDocument(null);
      setRecommendationOverlays({});
      setScoreOverrideMessage("");
      setScoreOverrideError("");
      setDbKpiRows(null);
      setKpiRowsError("");
      setKpiRowsLoading(true);
      setOverrideDrafts({});
      setOverrideRequests({});
      setScoreOverrides({});
    }
	  }, [account?.id, initialTab, open]);

	  useEffect(() => {
	    if (!open || !initialFocus) return;
	    const normalizedFocus = normalizeFocusTarget(initialFocus);
	    if (!normalizedFocus) return;
	    const timeout = window.setTimeout(() => {
	      const target = document.querySelector(`[data-kpi-focus="${normalizedFocus}"]`);
	      target?.scrollIntoView({ behavior: "smooth", block: "center" });
	    }, 180);
	    return () => window.clearTimeout(timeout);
	  }, [account?.id, activeTab, initialFocus, open]);

  useEffect(() => {
    if (!open || !account?.id) return;
    const currentAccount = account;
    let cancelled = false;
    setDbKpiRows(null);
    setKpiRowsError("");
    setKpiRowsLoading(true);

    async function loadKpiBreakdown() {
      try {
        const response = await fetch(`/api/accounts/${currentAccount.id}/kpi-breakdown`, {
          headers: {
            "x-role": role,
            ...(userId ? { "x-user-id": userId } : {}),
          },
        });
        const payload = await response.json();
        if (!response.ok) throw new Error(payload.error || "Score breakdown could not be loaded");
        const breakdown = payload.data && typeof payload.data === "object"
          ? payload.data as Record<string, ApiKpiBreakdown>
          : {};
        if (!cancelled) setDbKpiRows(mapKpiBreakdownToOverviewRows(breakdown, currentAccount));
      } catch (error) {
        if (!cancelled) setKpiRowsError(error instanceof Error ? error.message : "Score breakdown could not be loaded");
      } finally {
        if (!cancelled) setKpiRowsLoading(false);
      }
    }

    void loadKpiBreakdown();
    return () => {
      cancelled = true;
    };
  }, [account?.id, open, role, userId]);

  useEffect(() => {
    if (!open || !account?.id) return;
    const accountId = account.id;
    let cancelled = false;

    async function loadRecommendations(generateIfEmpty: boolean) {
      try {
        const response = await fetch(`/api/recommendations?accountId=${encodeURIComponent(accountId)}`, {
          headers: { "x-role": role },
        });
        const payload = await response.json();
        if (!response.ok) throw new Error(payload.error || "Recommendations could not be loaded");
        let items = Array.isArray(payload.data) ? payload.data as Array<Record<string, unknown>> : [];

        if (items.length === 0 && generateIfEmpty) {
          await fetch("/api/ai/agents/recommendations", {
            method: "POST",
            headers: { "Content-Type": "application/json", "x-role": role },
            body: JSON.stringify({ accountId, triggeredBy: "account_workspace_opened" }),
          });
          const refresh = await fetch(`/api/recommendations?accountId=${encodeURIComponent(accountId)}`, {
            headers: { "x-role": role },
          });
          const refreshPayload = await refresh.json();
          items = refresh.ok && Array.isArray(refreshPayload.data) ? refreshPayload.data as Array<Record<string, unknown>> : [];
        }

        const overlays: Record<string, PlaybookRecommendationOverlay> = {};
        for (const item of items) {
          const rowId = recommendationCategoryToKpiRowId(String(item.category ?? ""));
          const overlay = recommendationPayloadToOverlay(item);
          if (rowId && overlay && !overlays[rowId]) overlays[rowId] = overlay;
        }
        if (!cancelled) setRecommendationOverlays(overlays);
      } catch {
        if (!cancelled) setRecommendationOverlays({});
      }
    }

    void loadRecommendations(true);
    return () => {
      cancelled = true;
    };
  }, [account?.id, open, role]);

  useEffect(() => {
    if (!open || !account?.id) return;
    const accountId = account.id;
    let cancelled = false;

    async function loadScoreOverrides() {
      try {
        const response = await fetch(`/api/score-overrides?accountId=${accountId}`, {
          headers: { "x-role": role },
        });
        const payload = await response.json();
        if (!response.ok) throw new Error(payload.error || "Score override requests could not be loaded");
        let overrideItems = Array.isArray(payload.data) ? payload.data as Array<Record<string, unknown>> : [];
        if (overrideItems.length === 0 && canOverrideDirectly && account?.name) {
          const pendingResponse = await fetch("/api/score-overrides?status=PENDING", {
            headers: { "x-role": role },
          });
          const pendingPayload = await pendingResponse.json();
          if (pendingResponse.ok) {
            overrideItems = ((Array.isArray(pendingPayload.data) ? pendingPayload.data : []) as Array<Record<string, unknown>>)
              .filter((item) => String((item.account as { name?: string } | undefined)?.name ?? "").toLowerCase() === account.name.toLowerCase());
          }
        }

        const requests: Record<string, ScoreOverrideRequest> = {};
        const overrides: Record<string, ScoreOverride> = {};
        for (const item of overrideItems) {
          const targetId = String(item.kpiKey ?? "");
          if (!targetId) continue;
          const status = String(item.status ?? "PENDING");
          const requestedScore = clampKpiScore(String(item.requestedValue ?? 1));
          const reason = String(item.reason ?? "");
          if (status === "PENDING") {
            requests[targetId] = {
              id: String(item.id ?? ""),
              targetId,
              requestedScore,
              reason,
              status: "Pending",
            };
          }
          if (status === "APPROVED") {
            overrides[targetId] = {
              targetId,
              score: clampKpiScore(String(item.approvedValue ?? item.requestedValue ?? 1)),
              reason: `Approved request: ${reason}`,
            };
          }
        }
        if (!cancelled) {
          setOverrideRequests(requests);
          setScoreOverrides(overrides);
        }
      } catch (error) {
        if (!cancelled) setScoreOverrideError(error instanceof Error ? error.message : "Score override requests could not be loaded");
      }
    }

    void loadScoreOverrides();
    return () => {
      cancelled = true;
    };
  }, [account?.id, account?.name, canOverrideDirectly, open, role]);

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
    void recordLearningRule({ reason, itemTitle: row.task ?? row.name, category: row.name });
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
    void submitOverrideRequestAsync(targetId);
  }

  async function submitOverrideRequestAsync(targetId: string) {
    if (!account?.id || overrideSubmitting) return;
    const draft = overrideDrafts[targetId] ?? { score: String(defaultScoreForOverrideTarget(targetId)), reason: "" };
    const reason = draft.reason.trim();
    if (!reason) return;
    setScoreOverrideMessage("");
    setScoreOverrideError("");
    setOverrideSubmitting(targetId);

    try {
      const requestedScore = clampKpiScore(draft.score);
      const response = await fetch("/api/score-overrides", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-role": role,
        },
        body: JSON.stringify({
          accountId: account.id,
          kpiKey: targetId,
          requestedValue: requestedScore,
          reason,
          requestedById: userId,
        }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Score change request could not be submitted");
      const responseData = payload.data as Record<string, unknown>;
      const created = (responseData.override ?? responseData) as Record<string, unknown>;

      setOverrideRequests((requests) => ({
        ...requests,
        [targetId]: {
          id: String(created.id ?? ""),
          targetId,
          requestedScore,
          reason,
          status: "Pending",
        },
      }));
      setOverrideDrafts((drafts) => ({ ...drafts, [targetId]: { score: draft.score, reason: "" } }));
      setScoreOverrideMessage("Score change request submitted to KAM for review.");
      fireNotification({
        id: `score-override-request-${created.id ?? `${account.id}-${targetId}`}`,
        title: `${account.name} score change requested`,
        detail: "An Associate submitted a score update for KAM review.",
        href: `/portfolio?focus=score-override&target=${account.id}`,
        source: "score-override",
        severity: "warning",
        targetRole: "KAM",
      });
    } catch (error) {
      setScoreOverrideError(error instanceof Error ? error.message : "Score change request could not be submitted");
    } finally {
      setOverrideSubmitting(null);
    }
  }

  function applyScoreOverride(targetId: string) {
    void applyScoreOverrideAsync(targetId);
  }

  async function applyScoreOverrideAsync(targetId: string) {
    if (!account?.id || overrideSubmitting) return;
    const draft = overrideDrafts[targetId] ?? { score: String(scoreOverrides[targetId]?.score ?? defaultScoreForOverrideTarget(targetId)), reason: "" };
    const reason = draft.reason.trim();
    if (!reason) return;
    setScoreOverrideMessage("");
    setScoreOverrideError("");
    setOverrideSubmitting(targetId);

    try {
      const score = clampKpiScore(draft.score);
      const response = await fetch("/api/score-overrides", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-role": role,
        },
        body: JSON.stringify({
          accountId: account.id,
          kpiKey: targetId,
          requestedValue: score,
          reason,
          requestedById: userId,
          approvedById: userId,
        }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Score override could not be saved");

      setScoreOverrides((overrides) => ({
        ...overrides,
        [targetId]: {
          targetId,
          score,
          reason,
        },
      }));
      setOverrideDrafts((drafts) => ({ ...drafts, [targetId]: { score: draft.score, reason: "" } }));
      applyScoreSnapshotUpdate(payload.data?.score);

      const accountResponse = await fetch(`/api/accounts/${account.id}`, {
        headers: {
          "x-role": role,
          ...(userId ? { "x-user-id": userId } : {}),
        },
      });
      const accountPayload = await accountResponse.json();
      if (accountResponse.ok) applyApiAccountUpdate(accountPayload.data as Record<string, unknown>);
      const recalculated = payload.data?.score?.overall;
      setScoreOverrideMessage(`Score override saved${typeof recalculated === "number" ? `; account score is now ${scoreOutOfFiveLabel(recalculated)}/5` : ""}.`);
    } catch (error) {
      setScoreOverrideError(error instanceof Error ? error.message : "Score override could not be saved");
    } finally {
      setOverrideSubmitting(null);
    }
  }

  function approveOverrideRequest(targetId: string) {
    void approveOverrideRequestAsync(targetId);
  }

  async function approveOverrideRequestAsync(targetId: string) {
    const request = overrideRequests[targetId];
    if (!request || overrideSubmitting) return;
    setScoreOverrideMessage("");
    setScoreOverrideError("");
    setOverrideSubmitting(targetId);

    try {
      if (request.id) {
        const response = await fetch(`/api/score-overrides/${request.id}`, {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
            "x-role": role,
          },
          body: JSON.stringify({ action: "APPROVE", approvedById: userId }),
        });
        const payload = await response.json();
        if (!response.ok) throw new Error(payload.error || "Score request could not be approved");
        applyScoreSnapshotUpdate(payload.data?.score);
      }
      if (account?.id) {
        const accountResponse = await fetch(`/api/accounts/${account.id}`, {
          headers: {
            "x-role": role,
            ...(userId ? { "x-user-id": userId } : {}),
          },
        });
        const accountPayload = await accountResponse.json();
        if (accountResponse.ok) applyApiAccountUpdate(accountPayload.data as Record<string, unknown>);
      }
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
      setScoreOverrideMessage("Score change request approved.");
    } catch (error) {
      setScoreOverrideError(error instanceof Error ? error.message : "Score request could not be approved");
    } finally {
      setOverrideSubmitting(null);
    }
  }

  function denyOverrideRequest(targetId: string) {
    void denyOverrideRequestAsync(targetId);
  }

  async function denyOverrideRequestAsync(targetId: string) {
    const request = overrideRequests[targetId];
    if (!request || overrideSubmitting) return;
    setScoreOverrideMessage("");
    setScoreOverrideError("");
    setOverrideSubmitting(targetId);

    try {
      if (request.id) {
        const response = await fetch(`/api/score-overrides/${request.id}`, {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
            "x-role": role,
          },
          body: JSON.stringify({ action: "DECLINE", approvedById: userId, declineReason: "Denied from account workspace." }),
        });
        const payload = await response.json();
        if (!response.ok) throw new Error(payload.error || "Score request could not be denied");
      }
      setOverrideRequests((requests) => ({
        ...requests,
        [targetId]: {
          ...request,
          status: "Denied",
        },
      }));
      setScoreOverrideMessage("Score change request denied.");
    } catch (error) {
      setScoreOverrideError(error instanceof Error ? error.message : "Score request could not be denied");
    } finally {
      setOverrideSubmitting(null);
    }
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

  async function submitWeightRequest() {
    if (weightSubmitting) return;
    const reason = weightReason.trim();
    if (!reason || draftWeightTotal() !== 100) return;
    setWeightSubmitting(true);
    try {
      await settleUiAction();
      setWeightRequest({
        requestedWeights: draftKpiWeights(),
        reason,
        status: "Pending",
      });
      setWeightReason("");
    } finally {
      setWeightSubmitting(false);
    }
  }

  async function saveKpiWeight() {
    if (weightSubmitting) return;
    const reason = weightReason.trim();
    if (!reason || draftWeightTotal() !== 100) return;
    setWeightSubmitting(true);
    try {
      await settleUiAction();
      setKpiWeights(draftKpiWeights());
      setWeightReason("");
    } finally {
      setWeightSubmitting(false);
    }
  }

  async function approveWeightRequest() {
    if (!weightRequest || weightSubmitting) return;
    setWeightSubmitting(true);
    try {
      await settleUiAction();
      setKpiWeights(weightRequest.requestedWeights);
      setWeightRequest({
        ...weightRequest,
        status: "Approved",
      });
    } finally {
      setWeightSubmitting(false);
    }
  }

  async function denyWeightRequest() {
    if (!weightRequest || weightSubmitting) return;
    setWeightSubmitting(true);
    try {
      await settleUiAction();
      setWeightRequest({
        ...weightRequest,
        status: "Denied",
      });
    } finally {
      setWeightSubmitting(false);
    }
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
      const generatedKyc = payload.data?.kyc as GeneratedWorkspaceKycPayload | undefined;
      if (generatedKyc) {
        setGeneratedKycDraftDocument(generatedKycDocumentFromPayload(account, generatedKyc));
      }
      const accountResponse = await fetch(`/api/accounts/${account.id}`, {
        headers: {
          "x-role": role,
          ...(userId ? { "x-user-id": userId } : {}),
        },
      });
      const accountPayload = await accountResponse.json();
      if (accountResponse.ok) applyApiAccountUpdate(accountPayload.data as Record<string, unknown>);
      setActiveTab(generatedKyc ? "documents" : "kyc");
      setKycRegenerationMessage(`KYC v${version ?? "new"} generated ${source}. Review it in draft documents before accepting.`);
    } catch (error) {
      setKycRegenerationError(error instanceof Error ? error.message : "KYC regeneration failed");
    } finally {
      setKycRegenerating(false);
    }
  }

  if (!account || !open) return null;

  return (
    <main className="min-h-screen bg-[var(--bg-gradient)] px-5 py-5 text-[var(--text-primary)]">
      <section className="mx-auto flex h-[calc(100vh-2.5rem)] max-w-[1500px] flex-col overflow-hidden rounded-[1.5rem] border border-[#E2D8CC] bg-[#FBF7EF] shadow-[0_28px_90px_-60px_rgba(43,32,19,0.68)]">
          <div className="relative z-20 shrink-0 overflow-hidden border-b border-[#E5DACD] bg-[#F7F1E7] px-5 py-4">
            <div className="pointer-events-none absolute right-[-7rem] top-[-10rem] h-72 w-72 rounded-full bg-[#A7C7B4]/36 blur-3xl" />
            <div className="pointer-events-none absolute bottom-[-8rem] left-[30%] h-64 w-64 rounded-full bg-[#E8BE86]/24 blur-3xl" />
            <div className="relative z-10 flex items-center justify-between gap-4">
              <div className="flex min-w-0 items-center gap-4">
                <button
                  type="button"
                  onClick={() => onOpenChange(false)}
                  className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-[#DED1C1] bg-[#FFF9EF]/80 text-[#25352E] transition-colors hover:bg-white"
                  aria-label="Back to portfolio"
                >
                  <ArrowLeft className="h-4 w-4" />
                </button>
                <AccountLogo account={account} size="lg" />
                <div className="min-w-0">
                  <h1 className="truncate text-3xl font-black leading-none tracking-[-0.06em] text-[#1F2722]">
                    {account.name}
                  </h1>
                  <p className="sr-only">
                    Account workspace for {account.name}
                  </p>
                </div>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <button
                  type="button"
                  onClick={() => onOpenChange(false)}
                  className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-[#DED1C1] bg-[#FFF9EF]/80 text-[#6F6254] transition-colors hover:bg-white hover:text-[#25352E]"
                  aria-label="Close account page"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            </div>

            {scoreOverrideMessage || scoreOverrideError ? (
              <div className={`relative z-10 mt-3 rounded-2xl border p-3 text-[12px] font-bold ${
                scoreOverrideError ? "border-[#E8B8B0] bg-[#FFF0ED] text-[#B33D32]" : "border-[#B7D8C3] bg-[#EEF8F1] text-[#23633E]"
              }`}>
                {scoreOverrideError || scoreOverrideMessage}
              </div>
            ) : null}

            <div className="relative z-10 mt-4 grid gap-3 md:grid-cols-3 xl:grid-cols-6">
              <SummaryItem label="Score" value={<span className={scoreTone[account.health]}>{scoreOutOfFiveLabel(account.healthScore)}/5</span>} />
              <SummaryItem label="ARR" value={money(account.arr)} />
              <SummaryItem label="Contract renewal" value={renewalDate(account.renewalDays)} />
              <SummaryItem label="Industry" value={account.industry} />
              <SummaryItem label="Location" value={`${account.country} · ${account.region}`} />
              <SummaryItem label="Account owner" value={account.associateOwner} />
            </div>
          </div>

          <Tabs.Root value={activeTab} onValueChange={(value) => setActiveTab(value as AccountWorkspaceTab)} className="flex min-h-0 flex-1 flex-col overflow-hidden">
            <Tabs.List className="sticky top-0 z-10 flex shrink-0 items-center gap-2 border-b border-[#E5DACD] bg-[#FFF9EF]/90 px-4 py-2 [backdrop-filter:blur(14px)]">
              {accountWorkspaceTabs.map((tab) => (
                <Tabs.Trigger
                  key={tab.value}
                  value={tab.value}
                  className="rounded-full px-3 py-1.5 text-[12px] font-bold text-[#6F6254] transition-colors hover:bg-[#F1E7D8] data-[state=active]:bg-[#25352E] data-[state=active]:text-[#FFF9EF]"
                >
                  {tab.label}
                </Tabs.Trigger>
              ))}
            </Tabs.List>
            <div className="min-h-0 flex-1 overflow-y-auto p-4">
              <Tabs.Content value="overview" className="focus:outline-none">
                {canOverrideDirectly && pendingOverrideRequests.length > 0 ? (
                  <PendingScoreOverrideReviewPanel
                    requests={pendingOverrideRequests}
                    labels={overrideRequestLabels}
                    onApprove={approveOverrideRequest}
                    onDeny={denyOverrideRequest}
                  />
                ) : null}
                <OverviewTab
                  kpiRows={kpiRows}
                  initialFocus={initialFocus}
                  isLoadingKpis={kpiRowsLoading}
                  kpiRowsError={kpiRowsError}
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
                  overrideSubmitting={overrideSubmitting}
                  weightSubmitting={weightSubmitting}
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
                <DocumentsTab
                  account={account}
                  onAccountUpdate={onAccountUpdate}
                  generatedKycDraftDocument={generatedKycDraftDocument}
                  onGeneratedKycAccepted={(documentId) => {
                    setGeneratedKycDraftDocument((document) => document?.id === documentId ? null : document);
                    setKycRegenerationMessage("KYC accepted and added to documents.");
                  }}
                  onGeneratedKycDismissed={(documentId) => {
                    setGeneratedKycDraftDocument((document) => document?.id === documentId ? null : document);
                    setKycRegenerationMessage("");
                  }}
                />
              </Tabs.Content>
              <Tabs.Content value="kyc" className="focus:outline-none">
                <KycTab
                  account={account}
                  canRegenerate={role !== "EXECUTIVE"}
                  isRegenerating={kycRegenerating}
                  regenerationMessage={kycRegenerationMessage}
                  regenerationError={kycRegenerationError}
                  onRegenerate={regenerateKyc}
                />
              </Tabs.Content>
            </div>
          </Tabs.Root>
      </section>
    </main>
  );
}

function PendingScoreOverrideReviewPanel({
  requests,
  labels,
  onApprove,
  onDeny,
}: {
  requests: ScoreOverrideRequest[];
  labels: Record<string, string>;
  onApprove: (targetId: string) => void;
  onDeny: (targetId: string) => void;
}) {
  return (
    <div className="mb-4 rounded-2xl border border-[#E8C27F] bg-[#FFF6E8] p-4 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-[13px] font-black text-[#25352E]">Pending score change requests</p>
          <p className="mt-1 text-[12px] font-semibold text-[#7D6E5F]">
            Review Associate-submitted score updates before they affect the account view.
          </p>
        </div>
        <span className="rounded-full border border-[#E8C27F] bg-white/70 px-2.5 py-1 text-[11px] font-black text-[#9A6413]">
          {requests.length} pending
        </span>
      </div>

      <div className="mt-3 space-y-2">
        {requests.map((request) => (
          <div key={request.targetId} className="rounded-xl border border-[#E9DED0] bg-white/70 p-3">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <p className="text-[12px] font-black text-[#25352E]">{labels[request.targetId] ?? request.targetId}</p>
                <p className="mt-1 text-[12px] font-semibold text-[#6F6254]">
                  Requested score: <span className="font-black text-[#25352E]">{request.requestedScore}/5</span>
                </p>
                <p className="mt-1 text-[12px] font-semibold leading-snug text-[#7D6E5F]">{request.reason}</p>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <button
                  type="button"
                  onClick={() => onDeny(request.targetId)}
                  className="h-9 rounded-full border border-[#E1D7CA] bg-white px-4 text-[12px] font-black text-[#6F6254] transition-colors hover:border-[#D66A5B] hover:text-[#B33D32]"
                >
                  Deny
                </button>
                <button
                  type="button"
                  onClick={() => onApprove(request.targetId)}
                  className="h-9 rounded-full bg-[#25352E] px-4 text-[12px] font-black text-[#FFF9EF] transition-colors hover:bg-[#1B2922]"
                >
                  Approve
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function KycTab({
  account,
  canRegenerate,
  isRegenerating,
  regenerationMessage,
  regenerationError,
  onRegenerate,
}: {
  account: PortfolioAccount;
  canRegenerate: boolean;
  isRegenerating: boolean;
  regenerationMessage: string;
  regenerationError: string;
  onRegenerate: () => void;
}) {
  const kyc = account.kycVersion;
  const sections = kyc ? [
    ["Executive summary", kyc.executiveSummary],
    ["Business model", kyc.businessModel],
    ["Key stakeholders", kyc.keyStakeholders],
    ["Strategic goals", kyc.strategicGoals],
    ["Risk factors", kyc.riskFactors],
    ["Expansion opportunity", kyc.expansionOpportunity],
    ["CSAT history", kyc.csatHistory],
    ["Competitive landscape", kyc.competitiveLandscape],
    ["Financial overview", kyc.financialOverview],
  ] : [];

  const regenerateControl = (
    <div className="rounded-2xl border border-[#E1D3C2] bg-[#FFF8ED] p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="max-w-3xl">
          <p className="text-[14px] font-black text-[#25352E]">KYC regeneration</p>
          <p className="mt-1 text-[12px] font-bold leading-relaxed text-[#75685A]">
            Builds a new KYC version from profile data, all linked account documents, accepted document findings, contacts, resources, journey context, latest scores, and web-backed company research.
          </p>
        </div>
        {canRegenerate ? (
          <button
            type="button"
            onClick={onRegenerate}
            disabled={isRegenerating}
            className="inline-flex h-10 shrink-0 items-center gap-2 rounded-full bg-[#25352E] px-4 text-[12px] font-black text-[#FFF9EF] transition-colors hover:bg-[#1B2922] disabled:cursor-not-allowed disabled:opacity-60"
          >
            <Sparkles className="h-3.5 w-3.5" />
            {isRegenerating ? "Regenerating..." : kyc ? "Regenerate KYC" : "Generate KYC"}
          </button>
        ) : (
          <span className="rounded-full border border-[#D8C7B4] bg-[#FFFCF6] px-3 py-1 text-[11px] font-black text-[#6F6254]">Read only</span>
        )}
      </div>
      {regenerationMessage || regenerationError ? (
        <div className={`mt-3 rounded-2xl border p-3 text-[12px] font-bold ${
          regenerationError ? "border-[#E8B8B0] bg-[#FFF0ED] text-[#B33D32]" : "border-[#B7D8C3] bg-[#EEF8F1] text-[#23633E]"
        }`}>
          {regenerationError || regenerationMessage}
        </div>
      ) : null}
    </div>
  );

  if (!kyc) {
    return (
      <div className="space-y-3">
        {regenerateControl}
        <div className="rounded-2xl border border-[#E1D3C2] bg-[#FFF8ED] p-4">
          <p className="text-[14px] font-black text-[#25352E]">No KYC version yet</p>
          <p className="mt-2 text-[13px] font-bold leading-relaxed text-[#75685A]">
            Generate a draft to populate the KYC fields for this account.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {regenerateControl}
      <div className="rounded-2xl border border-[#E1D3C2] bg-[#FFF8ED] p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-[14px] font-black text-[#25352E]">KYC version {kyc.version}</p>
            <p className="mt-1 text-[12px] font-bold text-[#75685A]">Latest generated draft for {account.name}</p>
          </div>
          <span className="rounded-full border border-[#D8C7B4] bg-[#FFFCF6] px-3 py-1 text-[11px] font-black text-[#6F6254]">{kyc.status}</span>
        </div>
      </div>
      <div className="grid gap-3 lg:grid-cols-2">
        {sections.map(([title, value]) => (
          <section key={title} className="rounded-2xl border border-[#E1D3C2] bg-[#FFF8ED] p-4">
            <h3 className="text-[13px] font-black text-[#25352E]">{title}</h3>
            <p className="mt-2 whitespace-pre-line text-[12px] font-semibold leading-relaxed text-[#6F6254]">
              {value || "Not available in current sources."}
            </p>
          </section>
        ))}
      </div>
    </div>
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
              accept=".pdf,.doc,.docx,.pptx,.txt,.md,.xlsx,.xls"
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
  field,
  label,
  value,
  onChange,
}: {
  field: keyof AccountDraft;
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  const validationError = accountDraftValidationError(field, value);
  const required = mandatoryAccountDraftFields.has(field);
  const isNumeric = numericAccountDraftFields.has(field);
  const isDate = dateAccountDraftFields.has(field);
  return (
    <label className={`block rounded-2xl border bg-white/62 p-3 ${validationError ? "border-[#EAB3A9]" : "border-[#E5DACD]"}`}>
      <FieldLabel required={required} tooltip={accountDraftFieldTooltips[field]}>{label}</FieldLabel>
      <input
        type={isDate ? "date" : "text"}
        value={isDate ? toDateInputValue(value) : value}
        inputMode={isNumeric ? "decimal" : undefined}
        onChange={(event) => onChange(event.target.value)}
        aria-invalid={Boolean(validationError)}
        className={`mt-2 h-9 w-full rounded-xl border bg-[#FFF9EF]/80 px-3 text-[13px] font-bold text-[#25352E] outline-none focus:border-[#25352E]/45 ${validationError ? "border-[#EAB3A9]" : "border-[#E1D7CA]"}`}
      />
      {validationError ? <p className="mt-1 text-[11px] font-bold text-[#B33D32]">{validationError}</p> : null}
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
  const [editableJourney, setEditableJourney] = useState<OnboardingJourneyDraftItem[]>(request?.journey ?? buildStandardOnboardingJourney());
  const [editableScores, setEditableScores] = useState<OnboardingScoreDraft[]>(onboardingScoreDrafts);
  const [approvalLoading, setApprovalLoading] = useState(false);
  const [approvalError, setApprovalError] = useState("");
  const [assistantMessage, setAssistantMessage] = useState("");
  const [assistantDocumentDraft, setAssistantDocumentDraft] = useState<OnboardingDocumentDraft>({
    type: documentTypes[0].type,
    fileName: "",
    fileUrl: "",
  });
  const [assistantLoading, setAssistantLoading] = useState(false);
  const [assistantError, setAssistantError] = useState("");
  const [activeStep, setActiveStep] = useState<AccountOnboardingStep>("profile");
  const [assistantCollapsed, setAssistantCollapsed] = useState(false);
  const [assistantNotes, setAssistantNotes] = useState<string[]>([
    "I can help the KAM review this account draft, update fields, inspect sources, and refine KYC or journey items before approval.",
  ]);
  const setupTabs: Array<{ id: AccountOnboardingStep; label: string }> = [
    { id: "profile", label: "Profile" },
    { id: "scoring", label: "Scoring" },
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
    setEditableJourney(request.journey ?? buildStandardOnboardingJourney());
    setEditableScores(onboardingScoreDrafts);
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

  async function sendAssistantMessage() {
    const message = assistantMessage.trim();
    if ((!message && !assistantDocumentDraft.fileName) || assistantLoading) return;
    const attachedFileName = assistantDocumentDraft.fileName;
    const attachedType = assistantDocumentDraft.type;
    if (assistantDocumentDraft.fileName) {
      setSourceFiles((files) => [assistantDocumentDraft.fileName, ...files]);
      setAssistantNotes((notes) => [`Added ${assistantDocumentDraft.fileName} as a source for review.`, ...notes]);
      setAssistantDocumentDraft({
        type: documentTypes[0].type,
        fileName: "",
        fileUrl: "",
      });
    }
    if (!message) return;

    setAssistantMessage("");
    setAssistantLoading(true);
    setAssistantError("");
    setAssistantNotes((notes) => [`You: ${message}`, ...notes]);
    try {
      const response = await fetch("/api/v2/onboarding/assistant", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          role,
          activeStep,
          sourceFiles: attachedFileName ? [attachedFileName, ...sourceFiles] : sourceFiles,
          prompt: message,
          draft,
          documents: [
            ...(attachedFileName ? [{ fileName: attachedFileName, type: attachedType, uploadedAt: "Today" }] : []),
            ...sourceFiles.map((fileName) => ({ fileName, type: "Account creation source", uploadedAt: "Previously attached" })),
          ],
          journey: editableJourney.map((item) => ({
            type: item.type,
            title: item.title,
            dueDate: item.dueDate,
            recurrence: item.recurrence,
          })),
          kycSections: editableKycSections.map((section) => ({
            title: section.title,
            source: section.source,
            status: section.status,
            draft: section.draft,
          })),
        }),
      });
      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload.error || "Setup assistant failed");
      }
      if (payload.assistantReply) {
        setAssistantNotes((notes) => [formatAssistantMessage(String(payload.assistantReply)), ...notes]);
      }
      if (Array.isArray(payload.missingQuestions) && payload.missingQuestions.length > 0) {
        setAssistantNotes((notes) => [
          `Missing information\n${payload.missingQuestions.map((question: unknown) => `- ${String(question)}`).join("\n")}`,
          ...notes,
        ]);
      }
      if (Array.isArray(payload.kycSections) && payload.kycSections.length > 0) {
        const timestamp = Date.now();
        const incomingSections: KycDraftSection[] = payload.kycSections.map((section: Partial<KycDraftSection>, index: number) => ({
          id: `review-kyc-${timestamp}-${index}`,
          title: section.title ?? "KYC section",
          source: section.source ?? "V2 setup assistant",
          status: section.status === "Ready" ? "Ready" : "Needs input",
          draft: section.draft ?? "",
        }));
        setEditableKycSections((sections) => {
          const nextSections = [...sections];
          incomingSections.forEach((incomingSection) => {
            const matchIndex = nextSections.findIndex((section) => section.title.trim().toLowerCase() === incomingSection.title.trim().toLowerCase());
            if (matchIndex >= 0) {
              nextSections[matchIndex] = { ...nextSections[matchIndex], ...incomingSection, id: nextSections[matchIndex].id };
              return;
            }
            nextSections.push(incomingSection);
          });
          return nextSections;
        });
      }
      if (Array.isArray(payload.journeyItems) && payload.journeyItems.length > 0) {
        setEditableJourney((items) => [
          ...items,
          ...payload.journeyItems.map((item: Partial<OnboardingJourneyDraftItem>, index: number) => ({
            id: `review-journey-${Date.now()}-${index}`,
            type: item.type === "Meeting" || item.type === "QBR" ? item.type : "To-do",
            title: item.title ?? "Suggested journey item",
            dueDate: item.dueDate ?? "2026-06-30",
            recurrence: normalizedJourneyRecurrence(item.recurrence ?? ""),
          })),
        ]);
      }
    } catch (error) {
      const messageText = error instanceof Error ? error.message : "Setup assistant failed";
      setAssistantError(messageText);
      setAssistantNotes((notes) => [messageText, ...notes]);
    } finally {
      setAssistantLoading(false);
    }
  }

  function renderActiveStep() {
    if (activeStep === "profile") {
      return (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          <AccountDraftField field="name" label="Account name" value={draft.name} onChange={(value) => updateDraft({ ...draft, name: value })} />
          <AccountDraftField field="industry" label="Industry" value={draft.industry} onChange={(value) => updateDraft({ ...draft, industry: value })} />
          <AccountDraftField field="segment" label="Domain" value={draft.segment} onChange={(value) => updateDraft({ ...draft, segment: value })} />
          <AccountDraftField field="arr" label="ARR" value={draft.arr} onChange={(value) => updateDraft({ ...draft, arr: value })} />
          <AccountDraftField field="location" label="Location" value={draft.location} onChange={(value) => updateDraft({ ...draft, location: value })} />
          <AccountDraftField field="contractRenewal" label="Contract renewal" value={draft.contractRenewal} onChange={(value) => updateDraft({ ...draft, contractRenewal: value })} />
          <AccountDraftField field="kamOwner" label="KAM owner" value={draft.kamOwner} onChange={(value) => updateDraft({ ...draft, kamOwner: value })} />
          <AccountDraftField field="associateOwner" label="Associate owner" value={draft.associateOwner} onChange={(value) => updateDraft({ ...draft, associateOwner: value })} />
          <AccountDraftField field="primaryContact" label="Client POC" value={draft.primaryContact} onChange={(value) => updateDraft({ ...draft, primaryContact: value })} />
          <AccountDraftField field="activeRisk" label="Active risk" value={draft.activeRisk} onChange={(value) => updateDraft({ ...draft, activeRisk: value })} />
          <AccountDraftField field="openOpportunity" label="Open opportunity" value={draft.openOpportunity} onChange={(value) => updateDraft({ ...draft, openOpportunity: value })} />
          <AccountDraftField field="nextTouchpoint" label="Next touchpoint" value={draft.nextTouchpoint} onChange={(value) => updateDraft({ ...draft, nextTouchpoint: value })} />
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

    if (activeStep === "scoring") {
      const totalWeightedScore = editableScores.reduce((sum, score) => sum + score.score * (score.weight / 100), 0);
      return (
        <div className="space-y-3">
          <div className="flex items-center justify-between gap-3">
            <h3 className="text-[18px] font-black tracking-[-0.04em] text-[#1F2722]">Proposed KPI scoring</h3>
            <span className="rounded-full border border-[#BFE4CE] bg-[#EAF6EF] px-3 py-1 text-[12px] font-black text-[#238B57]">{totalWeightedScore.toFixed(1)}/5</span>
          </div>
          <div className="grid gap-2">
            {editableScores.map((score) => (
              <article key={score.id} className="rounded-2xl border border-[#E5DACD] bg-[#FFF9EF]/68 p-3">
                <div className="grid gap-2 lg:grid-cols-[minmax(0,1fr)_110px_90px]">
                  <div>
                    <p className="text-[13px] font-black text-[#25352E]">{score.name}</p>
                    <p className="mt-1 text-[11px] font-bold text-[#8A7A69]">Source: {score.source}</p>
                  </div>
                  <label className="space-y-1">
                    <span className="text-[11px] font-black text-[#8A7A69]">Score /5</span>
                    <input
                      type="number"
                      min="1"
                      max="5"
                      step="0.1"
                      value={score.score}
                      onChange={(event) => setEditableScores((scores) => scores.map((item) => item.id === score.id ? { ...item, score: Number(event.target.value) } : item))}
                      className="h-10 w-full rounded-xl border border-[#E1D7CA] bg-white/70 px-3 text-[13px] font-black text-[#25352E] outline-none focus:border-[#25352E]/45"
                    />
                  </label>
                  <div className="rounded-xl border border-[#E5DACD] bg-white/60 px-3 py-2">
                    <span className="text-[11px] font-black text-[#8A7A69]">Weight</span>
                    <p className="text-[14px] font-black text-[#25352E]">{score.weight}%</p>
                  </div>
                </div>
                <label className="mt-2 block">
                  <span className="text-[11px] font-black text-[#8A7A69]">Reasoning</span>
                  <textarea
                    value={score.why}
                    onChange={(event) => setEditableScores((scores) => scores.map((item) => item.id === score.id ? { ...item, why: event.target.value } : item))}
                    className="mt-1 min-h-28 w-full rounded-xl border border-[#E1D7CA] bg-white/70 p-3 text-[12px] font-bold leading-relaxed text-[#25352E] outline-none focus:border-[#25352E]/45"
                  />
                </label>
                <input
                  value={score.proposedTask}
                  onChange={(event) => setEditableScores((scores) => scores.map((item) => item.id === score.id ? { ...item, proposedTask: event.target.value } : item))}
                  placeholder="Proposed task if this score needs action"
                  className="mt-2 h-10 w-full rounded-xl border border-[#E1D7CA] bg-white/70 px-3 text-[12px] font-bold text-[#25352E] outline-none placeholder:text-[#A69A8B] focus:border-[#25352E]/45"
                />
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
                <select
                  value={normalizedJourneyRecurrence(item.recurrence)}
                  onChange={(event) => setEditableJourney((journey) => journey.map((journeyItem) => journeyItem.id === item.id ? { ...journeyItem, recurrence: event.target.value } : journeyItem))}
                  className="h-10 rounded-xl border border-[#E1D7CA] bg-white/70 px-3 text-[12px] font-bold text-[#25352E] outline-none focus:border-[#25352E]/45"
                >
                  {journeyRecurrenceOptions.map((option) => (
                    <option key={option} value={option}>{option}</option>
                  ))}
                </select>
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
              <div className="mb-3 rounded-3xl border border-[#E5DACD] bg-[#FFF9EF]/70 p-2">
                <div className="grid gap-2 md:grid-cols-5">
                {setupTabs.map((tab, index) => (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => setActiveStep(tab.id)}
                    className={`flex items-center gap-2 rounded-2xl px-3 py-2 text-left text-[12px] font-black transition-colors ${
                      activeStep === tab.id ? "bg-[#25352E] text-[#FFF9EF] shadow-[0_14px_28px_-22px_rgba(31,39,34,0.55)]" : "border border-[#D8CAB9] bg-white/64 text-[#6F6254] hover:text-[#25352E]"
                    }`}
                  >
                    <span className={`inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[11px] ${
                      activeStep === tab.id ? "bg-[#FFF9EF] text-[#25352E]" : "border border-[#D8CAB9] text-[#8A7A69]"
                    }`}>
                      {index + 1}
                    </span>
                    <span className="min-w-0 truncate">{tab.label}</span>
                  </button>
                ))}
                </div>
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
                    <p key={`${note}-${index}`} className="whitespace-pre-line rounded-2xl border border-[#E5DACD] bg-white/70 px-3 py-2 text-[13px] font-bold leading-relaxed text-[#25352E]">
                      {note}
                    </p>
                  ))}
                  {assistantLoading ? (
                    <div className="rounded-2xl border border-[#DEC997] bg-[#FFF7E4] px-3 py-2 text-[13px] font-bold text-[#8A5C16]">
                      Thinking through the review...
                    </div>
                  ) : null}
                  {assistantError ? (
                    <div className="rounded-2xl border border-[#F0C6BE] bg-[#FFF0ED] px-3 py-2 text-[13px] font-bold text-[#B33D32]">
                      {assistantError}
                    </div>
                  ) : null}
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
                            accept=".pdf,.doc,.docx,.pptx,.txt,.md,.xlsx,.xls"
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
                        disabled={assistantLoading || (!assistantMessage.trim() && !assistantDocumentDraft.fileName)}
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
                  <AccountDraftField field="name" label="Account name" value={draft.name} onChange={(value) => updateDraft({ ...draft, name: value })} />
                  <AccountDraftField field="industry" label="Industry" value={draft.industry} onChange={(value) => updateDraft({ ...draft, industry: value })} />
                  <AccountDraftField field="segment" label="Domain" value={draft.segment} onChange={(value) => updateDraft({ ...draft, segment: value })} />
                  <AccountDraftField field="arr" label="ARR" value={draft.arr} onChange={(value) => updateDraft({ ...draft, arr: value })} />
                  <AccountDraftField field="location" label="Location" value={draft.location} onChange={(value) => updateDraft({ ...draft, location: value })} />
                  <AccountDraftField field="contractRenewal" label="Contract renewal" value={draft.contractRenewal} onChange={(value) => updateDraft({ ...draft, contractRenewal: value })} />
                  <AccountDraftField field="kamOwner" label="KAM owner" value={draft.kamOwner} onChange={(value) => updateDraft({ ...draft, kamOwner: value })} />
                  <AccountDraftField field="associateOwner" label="Associate owner" value={draft.associateOwner} onChange={(value) => updateDraft({ ...draft, associateOwner: value })} />
                  <AccountDraftField field="primaryContact" label="Client POC" value={draft.primaryContact} onChange={(value) => updateDraft({ ...draft, primaryContact: value })} />
                  <AccountDraftField field="activeRisk" label="Active risk" value={draft.activeRisk} onChange={(value) => updateDraft({ ...draft, activeRisk: value })} />
                  <AccountDraftField field="openOpportunity" label="Open opportunity" value={draft.openOpportunity} onChange={(value) => updateDraft({ ...draft, openOpportunity: value })} />
                  <AccountDraftField field="nextTouchpoint" label="Next touchpoint" value={draft.nextTouchpoint} onChange={(value) => updateDraft({ ...draft, nextTouchpoint: value })} />
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
                    {editableJourney.map((item) => (
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
              <p key={`${note}-${index}`} className="whitespace-pre-line rounded-2xl border border-[#E5DACD] bg-white/70 px-3 py-2 text-[13px] font-bold leading-relaxed text-[#25352E]">
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
                      accept=".pdf,.doc,.docx,.pptx,.txt,.md,.xlsx,.xls"
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
  onKycSectionsChange,
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
  onAddDocument: (activeStep: AccountOnboardingStep) => void;
  onKycSectionsChange: (sections: KycDraftSection[]) => void;
  onJourneyChange: (itemId: string, field: keyof OnboardingJourneyDraftItem, value: string) => void;
  onAddJourneyItem: () => void;
  onDeleteJourneyItem: (itemId: string) => void;
  onRunJourneyAgent: (mode: "generate" | "enhance") => void;
  onGenerateKycDocument: () => void;
  onSubmitKycForKam: () => void;
  onApproveKycDocument: () => void;
  onPromptChange: (prompt: string) => void;
  onApplyPrompt: (activeStep: AccountOnboardingStep) => void;
  onSaveDraft: () => void;
  onFinalizeAccount: () => void | Promise<void>;
}) {
  const [activeStep, setActiveStep] = useState<AccountOnboardingStep>("profile");
  const [scoreDrafts, setScoreDrafts] = useState<OnboardingScoreDraft[]>(onboardingScoreDrafts);
  const [acceptedKycSections, setAcceptedKycSections] = useState<Set<string>>(() => new Set());
  const [dismissedKycSections, setDismissedKycSections] = useState<Set<string>>(() => new Set());
  const [assistantCollapsed, setAssistantCollapsed] = useState(false);
  const [finalizingAccount, setFinalizingAccount] = useState(false);
  const steps = onboardingSteps(sourceFileNames.length, draft, suggestions, documents, journey);
  const dismissedSuggestion = dismissalDraft ? suggestions.find((suggestion) => suggestion.id === dismissalDraft.suggestionId) : undefined;
  const isKam = role === "KAM";
  const acceptedSuggestions = suggestions.filter((suggestion) => suggestion.status === "Accepted");
  const pendingSuggestions = suggestions.filter((suggestion) => suggestion.status === "Pending");
  const draftValidationErrors = (Object.keys(accountDraftFieldLabels) as Array<keyof AccountDraft>)
    .map((field) => accountDraftValidationError(field, draft[field] ?? ""))
    .filter(Boolean);
  const canFinalizeAccount = draftValidationErrors.length === 0 && !finalizingAccount;
  const setupTabs: Array<{ id: AccountOnboardingStep; label: string }> = [
    { id: "profile", label: "Profile" },
    { id: "scoring", label: "Scoring" },
    { id: "kyc", label: "KYC draft" },
    { id: "journey", label: "Journey" },
    { id: "review", label: "Review" },
  ];

  async function handleFinalizeAccount() {
    if (finalizingAccount) return;
    setFinalizingAccount(true);
    try {
      await onFinalizeAccount();
    } finally {
      setFinalizingAccount(false);
    }
  }

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

  function updateKycDraft(sectionId: string, patch: Partial<KycDraftSection>) {
    onKycSectionsChange(kycSections.map((section) => (section.id === sectionId ? { ...section, ...patch } : section)));
  }

  function renderProfileStep() {
    return (
      <div className="space-y-4">
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          <AccountDraftField field="name" label="Account name" value={draft.name} onChange={(value) => onDraftChange({ ...draft, name: value })} />
          <AccountDraftField field="industry" label="Industry" value={draft.industry} onChange={(value) => onDraftChange({ ...draft, industry: value })} />
          <AccountDraftField field="segment" label="Domain" value={draft.segment} onChange={(value) => onDraftChange({ ...draft, segment: value })} />
          <AccountDraftField field="arr" label="ARR" value={draft.arr} onChange={(value) => onDraftChange({ ...draft, arr: value })} />
          <AccountDraftField field="location" label="Location" value={draft.location} onChange={(value) => onDraftChange({ ...draft, location: value })} />
          <AccountDraftField field="contractRenewal" label="Contract renewal" value={draft.contractRenewal} onChange={(value) => onDraftChange({ ...draft, contractRenewal: value })} />
          <AccountDraftField field="kamOwner" label="KAM owner" value={draft.kamOwner} onChange={(value) => onDraftChange({ ...draft, kamOwner: value })} />
          <AccountDraftField field="associateOwner" label="Associate owner" value={draft.associateOwner} onChange={(value) => onDraftChange({ ...draft, associateOwner: value })} />
          <AccountDraftField field="primaryContact" label="Client POC" value={draft.primaryContact} onChange={(value) => onDraftChange({ ...draft, primaryContact: value })} />
          <AccountDraftField field="activeRisk" label="Active risk" value={draft.activeRisk} onChange={(value) => onDraftChange({ ...draft, activeRisk: value })} />
          <AccountDraftField field="openOpportunity" label="Open opportunity" value={draft.openOpportunity} onChange={(value) => onDraftChange({ ...draft, openOpportunity: value })} />
          <AccountDraftField field="nextTouchpoint" label="Next touchpoint" value={draft.nextTouchpoint} onChange={(value) => onDraftChange({ ...draft, nextTouchpoint: value })} />
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
                  <div className="min-w-0 flex-1 space-y-2">
                    <input
                      value={section.title}
                      onChange={(event) => updateKycDraft(section.id, { title: event.target.value })}
                      className="h-9 w-full rounded-xl border border-[#E1D7CA] bg-[#FFF9EF]/80 px-3 text-[14px] font-black tracking-[-0.03em] text-[#1F2722] outline-none focus:border-[#25352E]/45"
                    />
                    <input
                      value={section.source}
                      onChange={(event) => updateKycDraft(section.id, { source: event.target.value })}
                      className="h-9 w-full rounded-xl border border-[#E1D7CA] bg-[#FFF9EF]/80 px-3 text-[12px] font-bold text-[#7D6E5F] outline-none focus:border-[#25352E]/45"
                    />
                  </div>
                  <span className={`rounded-full border px-3 py-1 text-[11px] font-bold ${
                    sectionStatus === "Accepted" ? "border-[#BFE4CE] bg-[#EAF6EF] text-[#238B57]" : sectionStatus === "Dismissed" ? "border-[#F0C6BE] bg-[#FFF0ED] text-[#B33D32]" : "border-[#DEC997] bg-[#FFF7E4] text-[#8A5C16]"
                  }`}>
                    {sectionStatus}
                  </span>
                </div>
                <textarea
                  value={section.draft}
                  onChange={(event) => updateKycDraft(section.id, { draft: event.target.value })}
                  className="mt-3 min-h-28 w-full rounded-xl border border-[#E1D7CA] bg-[#FFF9EF]/80 p-3 text-[13px] leading-relaxed text-[#25352E] outline-none focus:border-[#25352E]/45"
                />
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

  function renderScoringStep() {
    const totalWeightedScore = scoreDrafts.reduce((sum, score) => sum + score.score * (score.weight / 100), 0);
    return (
      <div className="space-y-3">
        <div className="flex items-center justify-between gap-3">
          <h3 className="text-[18px] font-black tracking-[-0.04em] text-[#1F2722]">Proposed KPI scoring</h3>
          <span className="rounded-full border border-[#BFE4CE] bg-[#EAF6EF] px-3 py-1 text-[12px] font-black text-[#238B57]">{totalWeightedScore.toFixed(1)}/5</span>
        </div>
        <div className="grid gap-2">
          {scoreDrafts.map((score) => (
            <article key={score.id} className="rounded-2xl border border-[#E5DACD] bg-white/62 p-3">
              <div className="grid gap-2 lg:grid-cols-[minmax(0,1fr)_110px_90px]">
                <div>
                  <p className="text-[13px] font-black text-[#25352E]">{score.name}</p>
                  <p className="mt-1 text-[11px] font-bold text-[#8A7A69]">Source: {score.source}</p>
                </div>
                <label className="space-y-1">
                  <span className="text-[11px] font-black text-[#8A7A69]">Score /5</span>
                  <input
                    type="number"
                    min="1"
                    max="5"
                    step="0.1"
                    value={score.score}
                    onChange={(event) => setScoreDrafts((scores) => scores.map((item) => item.id === score.id ? { ...item, score: Number(event.target.value) } : item))}
                    className="h-10 w-full rounded-xl border border-[#E1D7CA] bg-[#FFF9EF]/80 px-3 text-[13px] font-black text-[#25352E] outline-none focus:border-[#25352E]/45"
                  />
                </label>
                <div className="rounded-xl border border-[#E5DACD] bg-[#FFF9EF]/70 px-3 py-2">
                  <span className="text-[11px] font-black text-[#8A7A69]">Weight</span>
                  <p className="text-[14px] font-black text-[#25352E]">{score.weight}%</p>
                </div>
              </div>
              <label className="mt-2 block">
                <span className="text-[11px] font-black text-[#8A7A69]">Reasoning</span>
                <textarea
                  value={score.why}
                  onChange={(event) => setScoreDrafts((scores) => scores.map((item) => item.id === score.id ? { ...item, why: event.target.value } : item))}
                  className="mt-1 min-h-28 w-full rounded-xl border border-[#E1D7CA] bg-[#FFF9EF]/80 p-3 text-[12px] font-bold leading-relaxed text-[#25352E] outline-none focus:border-[#25352E]/45"
                />
              </label>
              <input
                value={score.proposedTask}
                onChange={(event) => setScoreDrafts((scores) => scores.map((item) => item.id === score.id ? { ...item, proposedTask: event.target.value } : item))}
                placeholder="Proposed task if this score needs action"
                className="mt-2 h-10 w-full rounded-xl border border-[#E1D7CA] bg-[#FFF9EF]/80 px-3 text-[12px] font-bold text-[#25352E] outline-none placeholder:text-[#A69A8B] focus:border-[#25352E]/45"
              />
            </article>
          ))}
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
          {journey.map((item) => {
            const isNewJourneyItem = item.id.startsWith("agent-journey-") || item.id.startsWith("review-journey-") || item.id.startsWith("journey-new-") || item.id.startsWith("journey-agent-");
            return (
            <div key={item.id} className={`grid gap-2 rounded-2xl border p-3 md:grid-cols-[130px_1fr_160px_130px_auto] ${isNewJourneyItem ? "border-[#9BCBA8] bg-[#F2FAF2] shadow-[0_16px_34px_-30px_rgba(31,39,34,0.58)]" : "border-[#E5DACD] bg-white/60"}`}>
              <select value={item.type} onChange={(event) => onJourneyChange(item.id, "type", event.target.value)} className="h-10 rounded-xl border border-[#E1D7CA] bg-[#FFF9EF]/80 px-3 text-[12px] font-bold text-[#25352E]">
                <option value="To-do">To-do</option>
                <option value="Meeting">Meeting</option>
                <option value="QBR">QBR</option>
              </select>
              <div className="relative">
                <input value={item.title} onChange={(event) => onJourneyChange(item.id, "title", event.target.value)} className="h-10 w-full rounded-xl border border-[#E1D7CA] bg-[#FFF9EF]/80 px-3 text-[13px] font-bold text-[#25352E]" />
                {isNewJourneyItem ? <span className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full border border-[#A9D4B2] bg-[#EAF8ED] px-2 py-0.5 text-[10px] font-black text-[#1F6C42]">New</span> : null}
              </div>
              <input type="date" value={item.dueDate} onChange={(event) => onJourneyChange(item.id, "dueDate", event.target.value)} className="h-10 rounded-xl border border-[#E1D7CA] bg-[#FFF9EF]/80 px-3 text-[12px] font-bold text-[#25352E]" />
              <select value={normalizedJourneyRecurrence(item.recurrence)} onChange={(event) => onJourneyChange(item.id, "recurrence", event.target.value)} className="h-10 rounded-xl border border-[#E1D7CA] bg-[#FFF9EF]/80 px-3 text-[12px] font-bold text-[#25352E]">
                {journeyRecurrenceOptions.map((option) => (
                  <option key={option} value={option}>{option}</option>
                ))}
              </select>
              <button type="button" onClick={() => onDeleteJourneyItem(item.id)} className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-[#D8CAB9] bg-white/70 text-[#6F6254] hover:text-[#B33D32]" aria-label={`Delete ${item.title}`}>
                <X className="h-4 w-4" />
              </button>
            </div>
            );
          })}
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
                  <a href={generatedKycDocument.fileUrl} target="_blank" rel="noreferrer" download={generatedKycDocument.fileName} className="text-[15px] font-black text-[#25352E] underline-offset-4 hover:underline">
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
    if (activeStep === "scoring") return renderScoringStep();
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
              <div className="mb-3 rounded-3xl border border-[#E5DACD] bg-[#FFF9EF]/70 p-2">
                <div className="grid gap-2 md:grid-cols-5">
                {setupTabs.map((tab, index) => (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => setActiveStep(tab.id)}
                    className={`flex items-center gap-2 rounded-2xl px-3 py-2 text-left text-[12px] font-black transition-colors ${
                      activeStep === tab.id ? "bg-[#25352E] text-[#FFF9EF] shadow-[0_14px_28px_-22px_rgba(31,39,34,0.55)]" : "border border-[#D8CAB9] bg-white/64 text-[#6F6254] hover:text-[#25352E]"
                    }`}
                  >
                    <span className={`inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[11px] ${
                      activeStep === tab.id ? "bg-[#FFF9EF] text-[#25352E]" : "border border-[#D8CAB9] text-[#8A7A69]"
                    }`}>
                      {index + 1}
                    </span>
                    <span className="min-w-0 truncate">{tab.label}</span>
                  </button>
                ))}
                </div>
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
                    <div key={`${message}-${index}`} className="whitespace-pre-line rounded-2xl border border-[#E5DACD] bg-white/70 px-3 py-2 text-[13px] font-bold leading-relaxed text-[#25352E]">
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
                            accept=".pdf,.doc,.docx,.pptx,.txt,.md,.xlsx,.xls"
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
                            onAddDocument(activeStep);
                            return;
                          }
                          onApplyPrompt(activeStep);
                        }}
                        disabled={assistantLoading || (!prompt.trim() && !documentDraft.fileName)}
                        className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-[#25352E] text-[#FFF9EF] disabled:cursor-not-allowed disabled:bg-[#25352E]/35"
                        aria-label="Send setup assistant message"
                      >
                        <Sparkles className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                  {draftValidationErrors[0] ? (
                    <p className="mt-2 rounded-xl border border-[#EAB3A9] bg-[#FFF0ED] px-3 py-2 text-[11px] font-bold text-[#B33D32]">
                      {draftValidationErrors[0]}
                    </p>
                  ) : null}
                  <div className="mt-3 flex gap-2">
                    <button type="button" onClick={onSaveDraft} className="flex-1 rounded-full border border-[#D8CAB9] bg-white/70 px-3 py-2 text-[12px] font-bold text-[#6F6254]">
                      Save draft
                    </button>
                    <button type="button" onClick={handleFinalizeAccount} disabled={!canFinalizeAccount} className="flex-1 rounded-full bg-[#25352E] px-3 py-2 text-[12px] font-bold text-[#FFF9EF] disabled:cursor-not-allowed disabled:bg-[#25352E]/35">
                      {finalizingAccount ? (isKam ? "Creating..." : "Submitting...") : isKam ? "Create account" : "Submit to KAM"}
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
              <div key={`${message}-${index}`} className="whitespace-pre-line rounded-2xl border border-[#E5DACD] bg-white/70 px-3 py-2 text-[13px] font-bold leading-relaxed text-[#25352E]">
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
                      accept=".pdf,.doc,.docx,.pptx,.txt,.md,.xlsx,.xls"
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
                      onAddDocument(activeStep);
                      return;
                    }
                    onApplyPrompt(activeStep);
                  }}
                  disabled={assistantLoading || (!prompt.trim() && !documentDraft.fileName)}
                  className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-[#25352E] text-[#FFF9EF] disabled:cursor-not-allowed disabled:bg-[#25352E]/35"
                  aria-label="Send setup assistant message"
                >
                  <Sparkles className="h-4 w-4" />
                </button>
              </div>
            </div>
            {draftValidationErrors[0] ? (
              <p className="mt-2 rounded-xl border border-[#EAB3A9] bg-[#FFF0ED] px-3 py-2 text-[11px] font-bold text-[#B33D32]">
                {draftValidationErrors[0]}
              </p>
            ) : null}
            <div className="mt-3 flex gap-2">
              <button type="button" onClick={onSaveDraft} className="flex-1 rounded-full border border-[#D8CAB9] bg-white/70 px-3 py-2 text-[12px] font-bold text-[#6F6254]">
                Save draft
              </button>
              <button type="button" onClick={handleFinalizeAccount} disabled={!canFinalizeAccount} className="flex-1 rounded-full bg-[#25352E] px-3 py-2 text-[12px] font-bold text-[#FFF9EF] disabled:cursor-not-allowed disabled:bg-[#25352E]/35">
                {finalizingAccount ? (isKam ? "Creating..." : "Submitting...") : isKam ? "Create account" : "Submit to KAM"}
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
    { role: "assistant", content: "Hey, T-Man here, what're we working on today?" },
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
        throw new Error(payload.error || "T-Man could not respond");
      }
      setThread((items) => [
        ...items,
        {
          role: "assistant",
          content: String(payload.reply || "I reviewed the current context."),
          artifact: payload.generatedDocument
            ? {
              title: String(payload.generatedDocument.title || "Generated document"),
                fileName: String(payload.generatedDocument.fileName || ""),
                fileUrl: String(payload.generatedDocument.fileUrl || ""),
                format: String(payload.generatedDocument.format || "Document"),
                summary: String(payload.generatedDocument.summary || ""),
              }
            : undefined,
        },
      ]);
    } catch (caught) {
      const messageText = caught instanceof Error ? caught.message : "T-Man could not respond";
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
                  <h3 className="text-[18px] font-black tracking-[-0.05em] text-[#1F2722]">T-Man</h3>
                  <p className="text-[12px] font-bold text-[#7D6E5F]">Portfolio and research assistant</p>
                </div>
              </div>
              <button type="button" onClick={() => setOpen(false)} className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-[#DED1C1] bg-white/70 text-[#6F6254]" aria-label="Close T-Man">
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
                        download={item.artifact.fileName || `${item.artifact.title.replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "").toLowerCase() || "generated-document"}.${item.artifact.format.toLowerCase().includes("ppt") ? "pptx" : item.artifact.format.toLowerCase().includes("pdf") ? "pdf" : item.artifact.format.toLowerCase().includes("markdown") ? "md" : "docx"}`}
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
              <button type="button" onClick={sendMessage} disabled={loading} className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#25352E] text-[#FFF9EF] disabled:cursor-not-allowed disabled:opacity-55" aria-label="Send T-Man message">
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
        aria-label="Open T-Man"
      >
        <span className="relative h-9 w-9 rounded-2xl bg-[#25352E]">
          <span className="absolute left-1.5 top-1.5 h-4 w-4 rounded-full bg-[#FFF9EF]" />
          <span className="absolute bottom-1.5 right-1.5 h-3.5 w-3.5 rounded-full bg-[#E8BE86]" />
          <span className="absolute left-3 top-3 h-3.5 w-3.5 rounded-full bg-[#A7C7B4]" />
        </span>
        <span className="text-[13px] font-black tracking-[-0.02em]">Ask T-Man</span>
      </button>
    </div>
  );
}

export function PortfolioPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { role, userId } = useRole();
  const { fireNotification } = useNotifications();
  const {
    accounts: apiAccountRecords,
    loading: accountHydrationPending,
    upsertAccount,
  } = useAccountCache();
	  const [query, setQuery] = useState("");
	  const [healthFilter, setHealthFilter] = useState<PortfolioHealth | "ALL">("ALL");
	  const [selectedAccount, setSelectedAccount] = useState<PortfolioAccount | null>(null);
	  const [selectedAccountTab, setSelectedAccountTab] = useState<AccountWorkspaceTab>("overview");
	  const [selectedAccountFocus, setSelectedAccountFocus] = useState<string | null>(null);
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
  const [onboardingJourney, setOnboardingJourney] = useState<OnboardingJourneyDraftItem[]>(() => buildStandardOnboardingJourney());
  const [onboardingPrompt, setOnboardingPrompt] = useState("");
  const [suggestionDismissalDraft, setSuggestionDismissalDraft] = useState<SuggestionDismissalDraft | null>(null);

  const isExecutive = role === "EXECUTIVE" || role === "ADMIN" || role === "MANAGER";
  const roleAccounts = useMemo(() => mapApiAccountsToPortfolioAccounts(apiAccountRecords), [apiAccountRecords]);
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
	  const sourceFileNames = sourceDocuments.map((document) => document.fileName);
	  const routeFocus = searchParams.get("focus");
	  const routeTab = normalizeWorkspaceTab(searchParams.get("tab"));
	  const routeTarget = searchParams.get("target") ?? searchParams.get("account");
  const visibleAccountCreationRequests = role === "ASSOCIATE"
    ? accountCreationRequests.filter((request) => request.creatorRole === "ASSOCIATE" || request.submittedBy === "Aisha Khan" || request.id.endsWith("-associate"))
    : accountCreationRequests;
  const pendingReviewDialogOpen = pendingAccountReviewOpen || routeFocus === "pending-account-draft";
  const selectedAccountCreationRequest =
    visibleAccountCreationRequests.find((request) => request.id === selectedAccountCreationRequestId) ??
    visibleAccountCreationRequests[0] ??
    null;

  function updatePortfolioAccount(updatedAccount: PortfolioAccount) {
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

  useEffect(() => {
    if (!selectedAccount) return;
    const refreshedAccount = roleAccounts.find((account) => account.id === selectedAccount.id);
    if (refreshedAccount && refreshedAccount !== selectedAccount) setSelectedAccount(refreshedAccount);
  }, [roleAccounts, selectedAccount]);

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
        associateOwnerName: request.draft.associateOwner.trim() || nextAccount.associateOwner,
        deliveryModel: nextAccount.deliveryModel,
        currentWork: nextAccount.currentWork,
        relationshipSignal: nextAccount.relationshipSignal,
        contractEnd: contractEnd.toISOString(),
      }),
    });
    const payload = await response.json();
    if (!response.ok) {
      throw new Error(payload.error || "Account approval failed");
    }
    upsertAccount(payload.data as CachedApiAccount);

    nextAccount = {
      ...nextAccount,
      ...mapApiAccountToPortfolioAccount(payload.data as Record<string, unknown>),
    };
    saveAccountRuntimeMetadata(nextAccount, {
      accountId: nextAccount.id,
      accountName: nextAccount.name,
      primaryContact: request.draft.primaryContact.trim() || nextAccount.contactName,
      sourceFiles: request.sourceFiles,
      kycSections: request.kycSections ?? [],
      journey: request.journey ?? [],
    });
    setAccountCreationRequests((requests) => requests.filter((item) => item.id !== request.id));
	    setSelectedAccountCreationRequestId(null);
	    setPendingAccountReviewOpen(false);
	    setSelectedAccountTab("overview");
	    setSelectedAccountFocus(null);
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
        targetRole: "KAM",
      });
    }

  }, [accountCreationRequests, fireNotification, role, roleAccounts]);

	  useEffect(() => {
	    if (routeFocus === "pending-account-draft") {
	      setSelectedAccount(null);
	      setSelectedAccountFocus(null);
	      setPendingAccountReviewOpen(true);
	      return;
	    }
	  }, [routeFocus]);

	  useEffect(() => {
	    if (!routeTarget || routeFocus === "pending-account-draft") return;
	    const account = roleAccounts.find((item) => accountMatchesRouteTarget(item, routeTarget));
	    if (account) {
	      setQuery("");
	      setHealthFilter("ALL");
	      setSelectedAccountCreationRequestId(null);
	      setPendingAccountReviewOpen(false);
	      setSelectedAccountTab(routeTab);
	      setSelectedAccountFocus(routeFocus);
	      setSelectedAccount(account);
	      return;
	    }

    let cancelled = false;
    async function loadRouteAccount() {
      try {
        const response = await fetch(`/api/accounts/${routeTarget}`, {
          headers: {
            "x-role": role,
            ...(userId ? { "x-user-id": userId } : {}),
          },
        });
        const payload = await response.json();
        if (!response.ok || cancelled) return;
        setQuery("");
	        setHealthFilter("ALL");
	        setSelectedAccountCreationRequestId(null);
	        setPendingAccountReviewOpen(false);
	        setSelectedAccountTab(routeTab);
	        setSelectedAccountFocus(routeFocus);
	        setSelectedAccount(mapApiAccountToPortfolioAccount(payload.data as Record<string, unknown>));
	      } catch {
	        // Route targets are optional deep links; leave the portfolio list intact on miss.
      }
    }
    void loadRouteAccount();
	    return () => {
	      cancelled = true;
	    };
	  }, [role, roleAccounts, routeFocus, routeTab, routeTarget, userId]);

  useEffect(() => {
    function openFromNotification(event: Event) {
      const href = (event as CustomEvent<{ href?: string }>).detail?.href;
      if (!href) return;
      const target = new URL(href, window.location.origin);
	      const focusTarget = target.searchParams.get("focus");
	      if (focusTarget === "pending-account-draft") {
	        setSelectedAccount(null);
	        setSelectedAccountFocus(null);
	        setPendingAccountReviewOpen(true);
	        return;
	      }

	      const accountTarget = target.searchParams.get("target") ?? target.searchParams.get("account");
	      if (!accountTarget) return;
	      const account = roleAccounts.find((item) => accountMatchesRouteTarget(item, accountTarget));
	      if (!account) return;
	      setSelectedAccountTab(normalizeWorkspaceTab(target.searchParams.get("tab")));
	      setSelectedAccountFocus(focusTarget);
	      setSelectedAccount(account);
	    }

    window.addEventListener("kam:notification-selected", openFromNotification);
    return () => window.removeEventListener("kam:notification-selected", openFromNotification);
  }, [roleAccounts]);

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
    setOnboardingJourney(buildStandardOnboardingJourney());
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
    void runOnboardingAssistant("Review the uploaded source files and propose the first account profile, KYC, and journey updates.", onboardingDocuments, uploadedSources, "profile");
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
    const dismissedSuggestion = onboardingSuggestions.find((suggestion) => suggestion.id === suggestionDismissalDraft.suggestionId);
    const correctedValue = correctionFromDismissalReason(reason);
    if (dismissedSuggestion && correctedValue) {
      const correctedSuggestion: OnboardingSuggestion = {
        ...dismissedSuggestion,
        id: `corrected-suggest-${Date.now()}`,
        proposedValue: correctedValue,
        source: "User correction from dismissal reason",
        status: "Pending",
      };
      setAccountDraft((draft) => ({ ...draft, [dismissedSuggestion.field]: correctedValue }));
      setOnboardingSuggestions((items) => [
        correctedSuggestion,
        ...items.map((item) =>
          item.id === suggestionDismissalDraft.suggestionId
            ? { ...item, status: "Dismissed" as OnboardingSuggestionStatus, dismissalReason: reason }
            : item,
        ),
      ]);
      setOnboardingAssistantMessages((messages) => [
        `Updated ${accountDraftFieldLabels[dismissedSuggestion.field]} from your correction: ${correctedValue}`,
        ...messages,
      ]);
      setSuggestionDismissalDraft(null);
      return;
    }
    setOnboardingSuggestions((items) =>
      items.map((item) =>
        item.id === suggestionDismissalDraft.suggestionId
          ? { ...item, status: "Dismissed", dismissalReason: reason }
          : item,
      ),
    );
    setSuggestionDismissalDraft(null);
  }

  async function runOnboardingAssistant(
    promptOverride?: string,
    documentsOverride?: OnboardingDocument[],
    sourceDocumentsOverride?: OnboardingDocument[],
    activeStepOverride: AccountOnboardingStep = "profile",
  ) {
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
          activeStep: activeStepOverride,
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
          kycSections: onboardingKycSections.map((section) => ({
            title: section.title,
            source: section.source,
            status: section.status,
            draft: section.draft,
          })),
        }),
      });

      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload.error || "Setup assistant failed");
      }

      if (payload.assistantReply) {
        setOnboardingAssistantMessages((messages) => [formatAssistantMessage(String(payload.assistantReply)), ...messages]);
      }
      const filteredMissingQuestions = Array.isArray(payload.missingQuestions)
        ? payload.missingQuestions.map(String).filter((question: string) => missingQuestionIsStillNeeded(question, accountDraft))
        : [];
      if (filteredMissingQuestions.length > 0) {
        setOnboardingAssistantMessages((messages) => [
          `Missing information\n${filteredMissingQuestions.map((question: string) => `- ${question}`).join("\n")}`,
          ...messages,
        ]);
      }
      if (Array.isArray(payload.suggestions) && payload.suggestions.length > 0) {
        const timestamp = Date.now();
        const incomingSuggestions = payload.suggestions
          .map((suggestion: Partial<OnboardingSuggestion>, index: number) => {
            const field = normalizeAccountDraftField(suggestion.field);
            return {
            id: `agent-suggest-${Date.now()}-${index}`,
              field,
              label: suggestion.label ?? accountDraftFieldLabels[field],
            proposedValue: suggestion.proposedValue ?? "",
            source: suggestion.source ?? "V2 setup assistant",
            status: "Pending" as OnboardingSuggestionStatus,
            };
          })
          .filter((suggestion: OnboardingSuggestion) => shouldKeepOnboardingSuggestion(suggestion, accountDraft, prompt));
        if (incomingSuggestions.length > 0) {
          setOnboardingSuggestions((items) => [
            ...incomingSuggestions.map((suggestion: OnboardingSuggestion, index: number) => ({
              ...suggestion,
              id: `agent-suggest-${timestamp}-${index}`,
            })),
            ...items,
          ]);
        }
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

  async function addOnboardingDocument(activeStepOverride: AccountOnboardingStep = "profile") {
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
    void runOnboardingAssistant(`Review the newly attached ${onboardingDocumentDraft.type}: ${documentName}. Propose only updates that are supported by this document metadata and current draft context.`, nextDocuments, undefined, activeStepOverride);
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
      targetRole: "KAM",
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

  function applyOnboardingPrompt(activeStepOverride: AccountOnboardingStep = "profile") {
    void runOnboardingAssistant(undefined, undefined, undefined, activeStepOverride);
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
    const [countryPart, regionPart] = draftInput.location.split(/\s*[·-]\s*/).map((part) => part.trim());
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
      contactName: draftInput.primaryContact.trim() || "Client POC not set",
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
            associateOwnerName: accountDraft.associateOwner.trim() || nextAccount.associateOwner,
            deliveryModel: nextAccount.deliveryModel,
            currentWork: nextAccount.currentWork,
            relationshipSignal: nextAccount.relationshipSignal,
            contractEnd: new Date(Date.now() + nextAccount.renewalDays * 24 * 60 * 60 * 1000).toISOString(),
          }),
        });
        const payload = await response.json();
        if (response.ok) {
          upsertAccount(payload.data as CachedApiAccount);
          nextAccount = {
            ...nextAccount,
            ...mapApiAccountToPortfolioAccount(payload.data as Record<string, unknown>),
          };
          saveAccountRuntimeMetadata(nextAccount, {
            accountId: nextAccount.id,
            accountName: nextAccount.name,
            primaryContact: accountDraft.primaryContact.trim() || nextAccount.contactName,
            sourceFiles: [...sourceDocuments, ...onboardingDocuments].map((document) => document.fileName),
            kycSections: onboardingKycSections,
            journey: onboardingJourney,
          });
        } else {
          throw new Error(payload.error || "Account creation failed");
        }
      } catch (error) {
        setOnboardingAssistantError(error instanceof Error ? error.message : "Account creation failed");
        return;
      }
      saveAccountRuntimeMetadata(nextAccount, {
        accountId: nextAccount.id,
        accountName: nextAccount.name,
        primaryContact: accountDraft.primaryContact.trim() || nextAccount.contactName,
        sourceFiles: [...sourceDocuments, ...onboardingDocuments].map((document) => document.fileName),
        kycSections: onboardingKycSections,
        journey: onboardingJourney,
      });
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
	    setSelectedAccountFocus(null);
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
      targetRole: "KAM",
    });
    setOnboardingOpen(false);
    setPendingAccountReviewOpen(true);
  }

  if (selectedAccount) {
    return (
      <AccountModal
        account={selectedAccount}
	        open={Boolean(selectedAccount)}
	        initialTab={selectedAccountTab}
	        initialFocus={selectedAccountFocus}
	        onAccountUpdate={updatePortfolioAccount}
	        onOpenChange={(open) => {
	          if (!open) {
	            setSelectedAccount(null);
	            setSelectedAccountFocus(null);
	            router.push("/portfolio");
	          }
	        }}
      />
    );
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

        {(role === "KAM" || role === "ASSOCIATE") && visibleAccountCreationRequests.length > 0 ? (
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
	                      setSelectedAccountFocus(null);
	                      setSelectedAccount(nextAccount);
	                    }}
                  />
                ))}
              </div>
            )}
          </div>
        </section>
      </section>
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
        onKycSectionsChange={setOnboardingKycSections}
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

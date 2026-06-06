"use client";

import * as Dialog from "@radix-ui/react-dialog";
import * as Tabs from "@radix-ui/react-tabs";
import { useEffect, useMemo, useState } from "react";
import { Bell, CalendarDays, Check, FileText, Mail, Pencil, Phone, Plus, Search, Settings, Sparkles, X } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { useRole } from "@/context/RoleContext";
import { associatePortfolio, portfolioAccounts, type PortfolioAccount, type PortfolioHealth } from "@/lib/v2/portfolioData";
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

interface DocumentUploadDraft {
  type: string;
  fileName: string;
  fileUrl: string;
}

type OnboardingStage = "source-upload" | "workspace";
type AccountOnboardingStep = "profile" | "kyc" | "journey" | "review";
type AccountWorkspaceTab = "overview" | "profile" | "documents";
type OnboardingSuggestionStatus = "Pending" | "Accepted" | "Dismissed";
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
}

interface OnboardingDocument {
  id: string;
  type: string;
  fileName: string;
  fileUrl: string;
  uploadedAt: string;
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

interface SuggestionDismissalDraft {
  suggestionId: string;
  reason: string;
}

interface PendingAccountCreationRequest {
  id: string;
  submittedBy: string;
  submittedAt: string;
  associateReason: string;
  draft: AccountDraft;
  sourceFiles: string[];
}

const kpiOverviewRows: KpiOverviewRow[] = [
  {
    id: "relationship",
    name: "Relationship Score",
    weight: "20%",
    rationale: "Core to account longevity and growth.",
    score: 86,
    trend: "up",
    subParameters: [
      { name: "Stakeholder depth", score: 88, rationale: "Measures how many meaningful contacts exist beyond one sponsor." },
      { name: "Stakeholder breadth", score: 82, rationale: "Checks whether coverage spans business, product, finance, and delivery owners." },
      { name: "Meeting cadence", score: 86, rationale: "Confirms the relationship has a reliable operating rhythm." },
      { name: "Executive access", score: 90, rationale: "Validates whether senior sponsors are reachable when decisions or escalations matter." },
    ],
  },
  {
    id: "csat",
    name: "CSAT Score",
    weight: "20%",
    rationale: "Direct client satisfaction signal.",
    score: 91,
    trend: "up",
    subParameters: [
      { name: "Feedback quality", score: 92, rationale: "Uses explicit client feedback where available instead of inferred sentiment alone." },
      { name: "Issue sentiment", score: 88, rationale: "Looks at tone and severity of recent escalations, tickets, and relationship notes." },
      { name: "Responsiveness", score: 94, rationale: "Measures whether Tkxel is responding quickly enough to client asks." },
      { name: "Sponsor confidence", score: 90, rationale: "Captures whether the client sponsor is still confident in the engagement." },
    ],
  },
  {
    id: "risk",
    name: "Risk Score",
    weight: "15%",
    rationale: "Early warning, high consequence if missed.",
    score: 64,
    trend: "down",
    subParameters: [
      { name: "Delivery risk", score: 58, rationale: "Flags missed commitments, slipped milestones, unresolved blockers, or quality concerns." },
      { name: "Commercial risk", score: 66, rationale: "Looks for renewal, payment, scope, pricing, or procurement exposure." },
      { name: "Relationship risk", score: 62, rationale: "Detects sponsor churn, weak access, low engagement, or unresolved dissatisfaction." },
      { name: "External risk", score: 70, rationale: "Accounts for client market pressure, funding changes, layoffs, or strategic shifts." },
    ],
    why: "Risk exposure is above the preferred band for the account journey stage.",
    task: "Review risk signals and confirm a mitigation owner.",
    taskType: "To-do",
    dueInDays: 3,
  },
  {
    id: "contract-health",
    name: "Contract Health Score",
    weight: "15%",
    rationale: "Commercial foundation of the engagement.",
    score: 88,
    trend: "flat",
    subParameters: [
      { name: "Renewal readiness", score: 90, rationale: "Checks whether renewal timeline, owner, and next commercial step are clear." },
      { name: "Scope coverage", score: 86, rationale: "Verifies that active work is covered by current agreements and SOWs." },
      { name: "Commercial protection", score: 88, rationale: "Looks at payment terms, rate structure, and contractual risk exposure." },
      { name: "Change control", score: 87, rationale: "Confirms scope changes are being captured and approved rather than absorbed informally." },
    ],
  },
  {
    id: "project-health",
    name: "Project Health Score",
    weight: "15%",
    rationale: "Delivery is Tkxel's core product.",
    score: 73,
    trend: "down",
    subParameters: [
      { name: "Milestone health", score: 72, rationale: "Measures whether delivery commitments are landing on time." },
      { name: "Sprint progress", score: 70, rationale: "Tracks current sprint execution, velocity, and unresolved carry-over." },
      { name: "Quality signal", score: 76, rationale: "Looks for defect trends, rework, QA concerns, and client acceptance friction." },
      { name: "Blocker resolution", score: 74, rationale: "Checks whether delivery blockers have clear owners and decision paths." },
    ],
    why: "Delivery confidence has softened against the current account journey checkpoint.",
    task: "Schedule a delivery health review with the pod lead.",
    taskType: "Meeting",
    dueInDays: 5,
  },
  {
    id: "financial",
    name: "Financial Score",
    weight: "10%",
    rationale: "Lagging indicator, important but reactive.",
    score: 82,
    trend: "up",
    subParameters: [
      { name: "Invoice hygiene", score: 85, rationale: "Checks whether invoices are clean, sent on time, and not disputed." },
      { name: "Payment timeliness", score: 80, rationale: "Measures whether payments are arriving within expected terms." },
      { name: "Revenue trend", score: 84, rationale: "Looks at whether account revenue is expanding, stable, or contracting." },
      { name: "Commercial leakage", score: 78, rationale: "Flags unbilled work, discount pressure, or scope absorbed without approval." },
    ],
  },
  {
    id: "whitespace",
    name: "Whitespace Analysis",
    weight: "5%",
    rationale: "Growth signal, not a health signal.",
    score: 69,
    trend: "up",
    subParameters: [
      { name: "Expansion fit", score: 72, rationale: "Checks whether Tkxel has a credible service fit for adjacent client needs." },
      { name: "Buyer appetite", score: 64, rationale: "Looks for sponsor interest, budget intent, and openness to a new conversation." },
      { name: "Timing", score: 70, rationale: "Assesses whether the account journey is at the right moment for expansion." },
      { name: "Competitive position", score: 68, rationale: "Considers whether Tkxel is well positioned against internal or external alternatives." },
    ],
    why: "Expansion whitespace exists but has not been converted into an active account motion.",
    task: "Create a whitespace validation task with the commercial sponsor.",
    taskType: "QBR",
    dueInDays: 10,
  },
  {
    id: "resource-health",
    name: "Resource Health Score",
    weight: "0% placeholder",
    rationale: "Parameters confirmed but excluded until Worksphere integration is live in v2.",
    score: 80,
    trend: "flat",
    subParameters: [
      { name: "Team stability", score: 82, rationale: "Tracks whether the delivery team has avoidable churn or continuity risk." },
      { name: "Role fit", score: 80, rationale: "Checks whether assigned resources match the skills the engagement requires." },
      { name: "Capacity coverage", score: 78, rationale: "Looks for over-allocation, under-allocation, or gaps in critical roles." },
      { name: "Continuity risk", score: 81, rationale: "Flags dependency on a single person or fragile knowledge transfer." },
    ],
  },
];

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
    extracts: "Relationship signals, CSAT sentiment, risk flags, whitespace intent signals, strategic direction clues",
    affects: "Relationship Score, CSAT, Risk Score, Whitespace Analysis, KYC Brief sections 4 and 8",
  },
  {
    type: "Contract document",
    extracts: "Auto-renewal clause, price hike clauses, non-terminable clauses, contract duration",
    affects: "Contract Health Score, KYC Brief section 3",
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
    affects: "Engagement History, Project Health Score",
  },
  {
    type: "Previous KYC brief",
    extracts: "Historical account intelligence, prior stakeholder maps, risk history",
    affects: "All KYC sections",
  },
  {
    type: "Project status report",
    extracts: "Delivery quality narrative, blockers, velocity commentary",
    affects: "Project Health Score",
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
    currentValue: "86",
    proposedValue: "89",
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
  { id: "journey-source-review", type: "To-do", title: "Confirm source file assumptions", dueDate: "2026-06-12", recurrence: "Once" },
  { id: "journey-kickoff", type: "Meeting", title: "Executive kickoff", dueDate: "2026-06-18", recurrence: "Once" },
  { id: "journey-stakeholder-map", type: "To-do", title: "Validate stakeholder map", dueDate: "2026-06-25", recurrence: "Monthly" },
  { id: "journey-delivery-check", type: "Meeting", title: "30-day delivery health check", dueDate: "2026-07-05", recurrence: "Monthly" },
  { id: "journey-first-qbr", type: "QBR", title: "First QBR", dueDate: "2026-08-10", recurrence: "Quarterly" },
  { id: "journey-renewal-readiness", type: "To-do", title: "Renewal readiness review", dueDate: "2026-12-15", recurrence: "Once" },
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
      ) : null}
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
  const tone = score >= 80 ? "text-[#238B57] bg-[#EAF6EF] border-[#BFE4CE]" : score >= 60 ? "text-[#B97813] bg-[#FFF4DF] border-[#EAC77B]" : "text-[#B33D32] bg-[#FDEBE8] border-[#F0BBB4]";

  return (
    <span className={`inline-flex h-7 min-w-12 items-center justify-center rounded-full border px-2 text-[12px] font-black ${tone}`}>
      {score}
    </span>
  );
}

function clampScore(value: string) {
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
          min={0}
          max={100}
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
          overrideRequest ? `Current request is ${overrideRequest.status.toLowerCase()} for ${overrideRequest.requestedScore}/100.` : "Submit a score change request for this sub-parameter.",
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
        {header(`Edit ${targetName}`, scoreOverride ? `Applied: ${scoreOverride.score}/100. ${scoreOverride.reason}` : "Save a direct score override for this sub-parameter.")}
        {overrideRequest?.status === "Pending" ? (
          <div className="mx-4 mt-4 rounded-xl border border-[#DEC997] bg-[#FFF7E4] px-3 py-2 text-[12px] text-[#6F6254]">
            <p className="font-bold text-[#25352E]">Associate request: {overrideRequest.requestedScore}/100</p>
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
  const healthy = row.score >= 80;
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
  const draftWeights = kpiOverviewRows.reduce<Record<string, number>>((weights, row) => {
    weights[row.id] = clampScore(weightDrafts[row.id]?.weight ?? String(kpiWeights[row.id] ?? parseWeightValue(row.weight)));
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
              {kpiOverviewRows.map((row) => {
                const currentWeight = kpiWeights[row.id] ?? parseWeightValue(row.weight);
                const draft = weightDrafts[row.id] ?? { weight: String(currentWeight) };

                return (
                  <div key={row.id} className="rounded-2xl border border-[#E5DACD] bg-white/58 p-3">
                    <div className="flex items-start justify-between gap-2">
                      <p className="text-[13px] font-black tracking-[-0.03em] text-[#25352E]">{row.name}</p>
                      <p className="shrink-0 text-[11px] font-semibold text-[#7D6E5F]">Current {formatWeight(currentWeight)}</p>
                    </div>

                    {isAssociate || canOverrideDirectly ? (
                      <div className="mt-3">
                        <input
                          type="number"
                          min={0}
                          max={100}
                          value={draft.weight}
                          onChange={(event) => onDraftChange(row.id, event.target.value)}
                          className="h-10 w-full rounded-xl border border-[#E1D7CA] bg-white/75 px-3 text-[14px] font-bold text-[#25352E] outline-none focus:border-[#25352E]/40"
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
  const sortedKpiRows = [...kpiOverviewRows].sort((a, b) => a.score - b.score);

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
            const healthy = currentScore >= 80;
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
                          {scoreOverrides[targetId] ? <p className="mt-1 text-[11px] font-bold text-[#6F6254]">Override applied from {parameter.score}/100</p> : null}
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
                  onDraftChange({ ...draft, fileName: file.name, fileUrl: URL.createObjectURL(file) });
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

function DocumentsTab({ account }: { account: PortfolioAccount }) {
  const { role } = useRole();
  const [uploadedDocuments, setUploadedDocuments] = useState<UploadedAccountDocument[]>(seededAccountDocuments);
  const [signalProposals, setSignalProposals] = useState<DocumentSignalProposal[]>(seededDocumentProposals);
  const [uploadOpen, setUploadOpen] = useState(false);
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

  function saveUploadedDocument() {
    if (!uploadDraft.fileName) return;
    const selectedType = documentTypes.find((documentType) => documentType.type === uploadDraft.type) ?? documentTypes[0];
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
    });
    setUploadOpen(false);
  }

  function startProposalResolution(proposalId: string, action: ProposalResolutionAction) {
    setProposalResolutionDraft({ proposalId, action, reason: "" });
  }

  function confirmProposalResolution() {
    const reason = proposalResolutionDraft?.reason.trim();
    if (!proposalResolutionDraft || !reason) return;
    const decidedAt = "Today";
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
        <button type="button" onClick={() => setUploadOpen(true)} className="rounded-full border border-[#D8CAB9] bg-white/70 px-4 py-2 text-[13px] font-bold text-[#25352E]">
          Upload
        </button>
        <button type="button" onClick={() => setQbrOpen(true)} className="rounded-full bg-[#25352E] px-4 py-2 text-[13px] font-bold text-[#FFF9EF]">
          Generate QBR
        </button>
      </div>
      <section className="rounded-3xl border border-[#E5DACD] bg-white/58 p-4">
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
  activeTasks,
  onResolveQueuedTask,
}: {
  activeTasks: ActiveTask[];
  onResolveQueuedTask: (taskId: string) => void;
}) {
  const { role } = useRole();
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
  const sortedContacts = [...accountContacts, ...customContacts]
    .filter((contact) => !deletedContactIds.has(contact.id))
    .sort((a, b) => a.hierarchyRank - b.hierarchyRank);
  const visibleResources = [...tkxelResources, ...customResources].filter((resource) => !deletedResourceIds.has(resource.id));
  const queuedJourneyItems: JourneyItem[] = activeTasks.map((task) => ({
    id: task.id,
    title: task.task,
    type: task.type,
    date: task.dueDate,
    detail: `Queued from ${task.kpiName}.`,
  }));
  const visibleUpcomingItems = [...upcomingJourneyItems, ...customJourneyItems, ...queuedJourneyItems]
    .filter((item) => resolvedJourneyItems[item.id]?.action !== "Dismiss")
    .sort((a, b) => journeyDateSortValue(a.date) - journeyDateSortValue(b.date));
  const visibleCompletedItems = [
    ...Object.entries(resolvedJourneyItems)
      .filter(([, resolution]) => resolution.action === "Done")
      .map(([itemId, resolution]) => {
        const item = [...upcomingJourneyItems, ...customJourneyItems, ...queuedJourneyItems].find((candidate) => candidate.id === itemId);
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
    ...completedJourneyItems,
  ];
  const resolutionItem = journeyResolutionDraft
    ? [...upcomingJourneyItems, ...customJourneyItems, ...queuedJourneyItems].find((item) => item.id === journeyResolutionDraft.taskId)
    : undefined;

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
        hierarchyRank: Number(contactDraft.hierarchyRank) || accountContacts.length + contacts.length + 1,
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
  onOpenChange,
}: {
  account: PortfolioAccount | null;
  open: boolean;
  initialTab: AccountWorkspaceTab;
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

  const acceptedTaskIds = useMemo(() => new Set(activeTasks.map((task) => task.id)), [activeTasks]);
  const isAssociate = role === "ASSOCIATE";
  const canOverrideDirectly = role === "KAM";

  useEffect(() => {
    if (open) setActiveTab(initialTab);
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
    for (const row of kpiOverviewRows) {
      for (const parameter of row.subParameters) {
        if (subParameterKey(row.id, parameter.name) === targetId) return parameter.score;
      }
    }
    return 0;
  }

  function submitOverrideRequest(targetId: string) {
    const draft = overrideDrafts[targetId] ?? { score: String(defaultScoreForOverrideTarget(targetId)), reason: "" };
    const reason = draft.reason.trim();
    if (!reason) return;
    setOverrideRequests((requests) => ({
      ...requests,
      [targetId]: {
        targetId,
        requestedScore: clampScore(draft.score),
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
        score: clampScore(draft.score),
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
    const row = kpiOverviewRows.find((item) => item.id === rowId);
    return row ? parseWeightValue(row.weight) : 0;
  }

  function draftKpiWeights() {
    return kpiOverviewRows.reduce<Record<string, number>>((weights, row) => {
      weights[row.id] = clampScore(weightDrafts[row.id]?.weight ?? String(kpiWeights[row.id] ?? defaultWeightForKpi(row.id)));
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
                <ProfileTab activeTasks={activeTasks} onResolveQueuedTask={resolveQueuedTask} />
              </Tabs.Content>
              <Tabs.Content value="documents" className="focus:outline-none">
                <DocumentsTab account={account} />
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
  fileNames,
  onOpenChange,
  onFilesChange,
  onContinue,
}: {
  open: boolean;
  fileNames: string[];
  onOpenChange: (open: boolean) => void;
  onFilesChange: (fileNames: string[]) => void;
  onContinue: () => void;
}) {
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
                const names = Array.from(event.target.files ?? []).map((file) => file.name);
                onFilesChange(names);
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
                        onFilesChange(fileNames.filter((name) => name !== fileName));
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

          <div className="mt-5 flex justify-end gap-2">
            <button type="button" onClick={() => onOpenChange(false)} className="rounded-full border border-[#D8CAB9] bg-white/70 px-4 py-2 text-[13px] font-bold text-[#6F6254]">
              Cancel
            </button>
            <button
              type="button"
              onClick={onContinue}
              disabled={fileNames.length === 0}
              className="rounded-full bg-[#25352E] px-4 py-2 text-[13px] font-bold text-[#FFF9EF] disabled:cursor-not-allowed disabled:bg-[#25352E]/35"
            >
              Continue
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
}: {
  open: boolean;
  request: PendingAccountCreationRequest | null;
  onOpenChange: (open: boolean) => void;
}) {
  const [draft, setDraft] = useState<AccountDraft>(request?.draft ?? emptyAccountDraft);
  const [decisionReason, setDecisionReason] = useState("");
  const [status, setStatus] = useState<"Pending" | "Edits saved" | "Approved" | "Denied">("Pending");
  const [sourceFiles, setSourceFiles] = useState<string[]>(request?.sourceFiles ?? []);
  const [assistantMessage, setAssistantMessage] = useState("");
  const [assistantDocumentDraft, setAssistantDocumentDraft] = useState<OnboardingDocumentDraft>({
    type: documentTypes[0].type,
    fileName: "",
    fileUrl: "",
  });
  const [assistantNotes, setAssistantNotes] = useState<string[]>([
    "I can help the KAM review this account draft, update fields, inspect sources, and refine KYC or journey items before approval.",
  ]);

  if (!request) return null;

  function updateDraft(nextDraft: AccountDraft) {
    setDraft(nextDraft);
    setStatus("Pending");
  }

  function approve() {
    setStatus("Approved");
    setDecisionReason("");
  }

  function deny() {
    if (!decisionReason.trim()) return;
    setStatus("Denied");
    setDecisionReason("");
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

  return (
    <Dialog.Root modal={false} open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="pointer-events-none fixed inset-0 z-[90] bg-[#1F2722]/32 backdrop-blur-[3px]" />
        <Dialog.Content
          onInteractOutside={(event) => event.preventDefault()}
          onPointerDownOutside={(event) => event.preventDefault()}
          onFocusOutside={(event) => event.preventDefault()}
          className="fixed left-[4vw] top-1/2 z-[100] flex max-h-[88vh] w-[min(1040px,68vw)] -translate-y-1/2 flex-col overflow-hidden rounded-[1.75rem] border border-[#D8CAB9] bg-[#FBF7EF] shadow-[0_34px_110px_-56px_rgba(43,32,19,0.78)] focus:outline-none"
        >
          <div className="flex shrink-0 items-center justify-between gap-3 border-b border-[#E5DACD] bg-[#F7F1E7] px-5 py-4">
            <div>
              <Dialog.Title className="text-[26px] font-black tracking-[-0.06em] text-[#1F2722]">Review account creation</Dialog.Title>
              <p className="mt-1 text-[13px] font-bold text-[#6F6254]">{request.submittedBy} · {request.submittedAt}</p>
            </div>
            <button
              type="button"
              onClick={() => onOpenChange(false)}
              className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-[#DED1C1] bg-[#FFF9EF]/80 text-[#6F6254] hover:text-[#25352E]"
              aria-label="Close account creation review"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto p-4">
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
        <div className="pointer-events-auto fixed bottom-8 right-8 z-[105] flex h-[min(660px,calc(100vh-5rem))] w-[min(420px,26vw)] min-w-[360px] flex-col overflow-hidden rounded-[1.75rem] border border-[#D8CAB9] bg-[#FFF9EF] shadow-[0_32px_110px_-42px_rgba(31,39,34,0.72)]">
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
  onPromptChange,
  onApplyPrompt,
}: {
  open: boolean;
  role: Role;
  sourceFileNames: string[];
  draft: AccountDraft;
  suggestions: OnboardingSuggestion[];
  documents: OnboardingDocument[];
  kycSections: KycDraftSection[];
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
  onPromptChange: (prompt: string) => void;
  onApplyPrompt: () => void;
}) {
  const [activeStep, setActiveStep] = useState<AccountOnboardingStep>("profile");
  const [acceptedKycSections, setAcceptedKycSections] = useState<Set<string>>(() => new Set());
  const [dismissedKycSections, setDismissedKycSections] = useState<Set<string>>(() => new Set());
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
        <div className="flex justify-end">
          <button type="button" onClick={onAddJourneyItem} className="rounded-full bg-[#25352E] px-3 py-1.5 text-[12px] font-bold text-[#FFF9EF]">
            Add item
          </button>
        </div>
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
          <p className="mt-2 text-[13px] font-bold leading-relaxed text-[#25352E]">
            When the V2 KYC agent is wired, the accepted draft sections will be generated into a KYC document and saved into the Documents tab as a draft awaiting associate/KAM approval.
          </p>
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

          <div className="relative min-h-0 flex-1 overflow-hidden p-4">
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

            <section className="absolute bottom-4 left-4 right-4 top-[4.25rem] overflow-y-auto rounded-3xl border border-[#E5DACD] bg-white/50 p-4">
              {renderActiveStep()}
            </section>
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
        <div className="pointer-events-auto fixed bottom-8 right-8 z-[95] flex h-[min(660px,calc(100vh-5rem))] w-[min(420px,92vw)] flex-col overflow-hidden rounded-[1.75rem] border border-[#D8CAB9] bg-[#FFF9EF] shadow-[0_32px_110px_-42px_rgba(31,39,34,0.72)]">
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
                <button type="button" onClick={() => onDocumentDraftChange({ ...documentDraft, fileName: "", fileUrl: "" })} className="text-[#9B9084] hover:text-[#25352E]" aria-label="Remove attached setup document">
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
                        if (file) onDocumentDraftChange({ ...documentDraft, fileName: file.name, fileUrl: URL.createObjectURL(file) });
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
              <button type="button" className="flex-1 rounded-full border border-[#D8CAB9] bg-white/70 px-3 py-2 text-[12px] font-bold text-[#6F6254]">
                Save draft
              </button>
              <button type="button" className="flex-1 rounded-full bg-[#25352E] px-3 py-2 text-[12px] font-bold text-[#FFF9EF]">
                {isKam ? "Create account" : "Submit to KAM"}
              </button>
            </div>
          </div>
        </div>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function NotificationsPanel({
  open,
  onOpenChange,
  onSelect,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSelect: (notificationId: string) => void;
}) {
  const notifications = [
    { id: "pending-account-creation", label: "Account creation draft needs KAM review" },
    { id: "maersk-risk-drop", label: "Risk score dropped on Maersk" },
    { id: "stripe-document-review", label: "Document proposal needs review on Stripe" },
  ];

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-[60] bg-transparent" />
        <Dialog.Content className="fixed right-5 top-16 z-[80] w-[min(92vw,380px)] rounded-3xl border border-[#D8CAB9] bg-[#FFF9EF] p-4 shadow-[0_28px_70px_-32px_rgba(31,39,34,0.56)] focus:outline-none">
          <div className="flex items-center justify-between gap-3">
            <Dialog.Title className="text-[20px] font-black tracking-[-0.05em] text-[#1F2722]">Notifications</Dialog.Title>
            <button type="button" onClick={() => onOpenChange(false)} className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-[#DED1C1] bg-white/70 text-[#6F6254]" aria-label="Close notifications">
              <X className="h-4 w-4" />
            </button>
          </div>
          <div className="mt-4 space-y-2">
            {notifications.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => onSelect(item.id)}
                className="flex w-full items-center gap-3 rounded-2xl border border-[#E5DACD] bg-white/58 p-3 text-left text-[13px] font-bold text-[#25352E] hover:bg-white"
              >
                <Bell className="h-4 w-4 shrink-0 text-[#8A7A69]" />
                {item.label}
              </button>
            ))}
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function CammiePanel() {
  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState("");
  const [thread, setThread] = useState<string[]>(["Cammie is ready for portfolio or account questions."]);

  function sendMessage() {
    const value = message.trim();
    if (!value) return;
    setThread((items) => [...items, value, "I will use the active portfolio/account context once the V2 agent endpoint is wired."]);
    setMessage("");
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
                  <p className="text-[12px] font-bold text-[#7D6E5F]">Portfolio assistant</p>
                </div>
              </div>
              <button type="button" onClick={() => setOpen(false)} className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-[#DED1C1] bg-white/70 text-[#6F6254]" aria-label="Close Cammie">
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>
          <div className="min-h-0 flex-1 space-y-2 overflow-y-auto p-4">
            {thread.map((item, index) => {
              const userMessage = index % 2 === 1;
              return (
                <div key={`${item}-${index}`} className={`flex ${userMessage ? "justify-end" : "justify-start"}`}>
                  <p className={`max-w-[82%] rounded-2xl px-3 py-2 text-[13px] font-bold leading-relaxed ${
                    userMessage ? "bg-[#25352E] text-[#FFF9EF]" : "border border-[#E5DACD] bg-white/70 text-[#25352E]"
                  }`}>
                    {item}
                  </p>
                </div>
              );
            })}
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
                placeholder="Ask about an account, portfolio, or document"
              />
              <button type="button" onClick={sendMessage} className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#25352E] text-[#FFF9EF]" aria-label="Send Cammie message">
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
  const { role } = useRole();
  const [query, setQuery] = useState("");
  const [healthFilter, setHealthFilter] = useState<PortfolioHealth | "ALL">("ALL");
  const [selectedAccount, setSelectedAccount] = useState<PortfolioAccount | null>(null);
  const [selectedAccountTab, setSelectedAccountTab] = useState<AccountWorkspaceTab>("overview");
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [pendingAccountReviewOpen, setPendingAccountReviewOpen] = useState(false);
  const [onboardingOpen, setOnboardingOpen] = useState(false);
  const [onboardingStage, setOnboardingStage] = useState<OnboardingStage>("source-upload");
  const [sourceFileNames, setSourceFileNames] = useState<string[]>([]);
  const [accountDraft, setAccountDraft] = useState<AccountDraft>(emptyAccountDraft);
  const [onboardingSuggestions, setOnboardingSuggestions] = useState<OnboardingSuggestion[]>(seededOnboardingSuggestions);
  const [onboardingDocuments, setOnboardingDocuments] = useState<OnboardingDocument[]>([]);
  const [onboardingKycSections, setOnboardingKycSections] = useState<KycDraftSection[]>(kycDraftSections);
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
  const roleAccounts = role === "ASSOCIATE" ? associatePortfolio : portfolioAccounts;
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

  function resetOnboardingState() {
    setOnboardingStage("source-upload");
    setSourceFileNames([]);
    setAccountDraft(emptyAccountDraft);
    setOnboardingSuggestions(seededOnboardingSuggestions);
    setOnboardingDocuments([]);
    setOnboardingKycSections(kycDraftSections);
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

  function continueFromSourceUpload() {
    if (sourceFileNames.length === 0) return;
    setOnboardingStage("workspace");
    setAccountDraft((draft) => ({
      ...draft,
      kamOwner: role === "KAM" ? "Sarah Chen" : "Assigned by KAM",
      associateOwner: role === "ASSOCIATE" ? "Current associate" : "Aisha Khan",
      nextTouchpoint: "Executive kickoff",
    }));
    void runOnboardingAssistant("Review the uploaded source files and propose the first account profile, KYC, and journey updates.");
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

  async function runOnboardingAssistant(promptOverride?: string, documentsOverride?: OnboardingDocument[]) {
    const prompt = (promptOverride ?? onboardingPrompt).trim();
    setOnboardingAssistantLoading(true);
    setOnboardingAssistantError("");
    try {
      const response = await fetch("/api/v2/onboarding/assistant", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          role,
          sourceFiles: sourceFileNames,
          prompt,
          draft: accountDraft,
          documents: (documentsOverride ?? onboardingDocuments).map((document) => ({
            fileName: document.fileName,
            type: document.type,
            uploadedAt: document.uploadedAt,
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
        setOnboardingKycSections(
          payload.kycSections.map((section: Partial<KycDraftSection>, index: number) => ({
            id: `agent-kyc-${Date.now()}-${index}`,
            title: section.title ?? "KYC section",
            source: section.source ?? "V2 setup assistant",
            status: section.status === "Ready" ? "Ready" : "Needs input",
            draft: section.draft ?? "",
          })),
        );
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

  function addOnboardingDocument() {
    if (!onboardingDocumentDraft.fileName) return;
    const documentName = onboardingDocumentDraft.fileName;
    const nextDocuments = [
      {
        id: `setup-doc-${Date.now()}`,
        type: onboardingDocumentDraft.type,
        fileName: documentName,
        fileUrl: onboardingDocumentDraft.fileUrl,
        uploadedAt: "Today",
      },
      ...onboardingDocuments,
    ];
    setOnboardingDocuments(nextDocuments);
    setOnboardingDocumentDraft({
      type: documentTypes[0].type,
      fileName: "",
      fileUrl: "",
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

  function applyOnboardingPrompt() {
    void runOnboardingAssistant();
  }

  function openAccountByName(accountName: string, tab: AccountWorkspaceTab = "overview") {
    const account = portfolioAccounts.find((item) => item.name === accountName) ?? associatePortfolio.find((item) => item.name === accountName);
    if (account) {
      setSelectedAccountTab(tab);
      setSelectedAccount(account);
    }
  }

  function selectNotification(notificationId: string) {
    setNotificationsOpen(false);
    if (notificationId === "pending-account-creation") {
      setPendingAccountReviewOpen(true);
      return;
    }
    if (notificationId === "maersk-risk-drop") {
      openAccountByName("Maersk");
      return;
    }
    if (notificationId === "stripe-document-review") {
      openAccountByName("Stripe", "documents");
    }
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
                <p className="mt-2 text-3xl font-black text-[#25352E]">{visibleAccounts.length}</p>
              </div>
              <div className="rounded-2xl border border-[#DED1C1] bg-[#FFF9EF]/58 p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.75)]">
                <p className="text-[13px] font-bold text-[#8A7A69]">ARR</p>
                <p className="mt-2 text-3xl font-black text-[#25352E]">{money(totalArr)}</p>
              </div>
              <div className="rounded-2xl border border-[#DED1C1] bg-[#FFF9EF]/58 p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.75)]">
                <p className="text-[13px] font-bold text-[#8A7A69]">Renewals &lt;90d</p>
                <p className="mt-2 text-3xl font-black text-[#25352E]">{upcomingRenewals}</p>
              </div>
            </div>
          </div>
        </div>

        {role === "KAM" ? (
          <section className="rounded-[1.5rem] border border-[#E5DACD] bg-[#FFF9EF]/78 p-4 shadow-[0_18px_46px_-34px_rgba(55,43,28,0.58)]">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 className="text-[18px] font-black tracking-[-0.04em] text-[#1F2722]">Pending account creations</h2>
              <span className="rounded-full border border-[#D8CAB9] bg-white/70 px-3 py-1 text-[12px] font-bold text-[#6F6254]">{pendingAccountCreationRequests.length} draft</span>
            </div>
            <div className="mt-3 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {pendingAccountCreationRequests.map((request) => (
                <button
                  key={request.id}
                  type="button"
                  onClick={() => setPendingAccountReviewOpen(true)}
                  className="rounded-3xl border border-[#E5DACD] bg-white/62 p-4 text-left transition-colors hover:bg-white"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-[16px] font-black tracking-[-0.04em] text-[#1F2722]">{request.draft.name}</p>
                      <p className="mt-1 text-[13px] font-bold text-[#6F6254]">{request.submittedBy} · {request.submittedAt}</p>
                    </div>
                    <span className="rounded-full border border-[#DEC997] bg-[#FFF7E4] px-3 py-1 text-[11px] font-bold text-[#8A5C16]">Review</span>
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
          </div>
        </section>
      </section>
      <button
        type="button"
        onClick={() => setNotificationsOpen(true)}
        className="fixed right-5 top-5 z-[44] inline-flex h-10 w-10 items-center justify-center rounded-full border border-[#D8CAB9] bg-[#FFF9EF]/90 text-[#25352E] shadow-[0_18px_38px_-28px_rgba(31,39,34,0.7)]"
        aria-label="Open notifications"
      >
        <Bell className="h-4 w-4" />
      </button>
      <NotificationsPanel open={notificationsOpen} onOpenChange={setNotificationsOpen} onSelect={selectNotification} />
      <CammiePanel />
      <PendingAccountCreationDialog
        open={pendingAccountReviewOpen}
        request={pendingAccountCreationRequests[0] ?? null}
        onOpenChange={setPendingAccountReviewOpen}
      />
      <AccountModal account={selectedAccount} open={Boolean(selectedAccount)} initialTab={selectedAccountTab} onOpenChange={(open) => !open && setSelectedAccount(null)} />
      <AccountSourceUploadDialog
        open={onboardingOpen && onboardingStage === "source-upload"}
        fileNames={sourceFileNames}
        onOpenChange={(open) => {
          setOnboardingOpen(open);
          if (!open) resetOnboardingState();
        }}
        onFilesChange={setSourceFileNames}
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
        onPromptChange={setOnboardingPrompt}
        onApplyPrompt={applyOnboardingPrompt}
      />
    </main>
  );
}

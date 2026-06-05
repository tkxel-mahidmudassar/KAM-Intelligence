"use client";

import { useEffect, useState, useCallback } from "react";
import dynamic from "next/dynamic";
import { useParams } from "next/navigation";
import { ArrowLeft, ChevronRight } from "lucide-react";
import Link from "next/link";
import { useRole } from "@/context/RoleContext";
import { Tabs, TabsBar, TabsBarTrigger, TabsContent } from "@/components/ui/Tabs";
import { AccountHeader } from "@/components/accounts/AccountHeader";
import { OverviewTab, type ScoreOverride } from "@/components/accounts/OverviewTab";
import { SignalsTab } from "@/components/accounts/SignalsTab";
import { ActionsTab } from "@/components/accounts/ActionsTab";
import { SkeletonCard } from "@/components/ui/Skeleton";

// ─── Type-only imports (no runtime cost) ─────────────────────────────────────
import type { KycVersion } from "@/components/accounts/KYCTab";
import type { Touchpoint } from "@/components/accounts/TouchpointsTab";
import type { Escalation } from "@/components/accounts/EscalationsTab";
import type { Opportunity } from "@/components/accounts/OpportunitiesTab";
import type { Contact } from "@/components/accounts/ContactsTab";

// ─── Dynamically loaded tab components (split bundle, avoids webpack SIGSEGV) ─
const KYCTab = dynamic(() => import("@/components/accounts/KYCTab").then(m => ({ default: m.KYCTab })), { ssr: false });
const DocumentsTab = dynamic(() => import("@/components/accounts/DocumentsTab").then(m => ({ default: m.DocumentsTab })), { ssr: false });
const QBRTab = dynamic(() => import("@/components/accounts/QBRTab").then(m => ({ default: m.QBRTab })), { ssr: false });
const TouchpointsTab = dynamic(() => import("@/components/accounts/TouchpointsTab").then(m => ({ default: m.TouchpointsTab })), { ssr: false });
const EscalationsTab = dynamic(() => import("@/components/accounts/EscalationsTab").then(m => ({ default: m.EscalationsTab })), { ssr: false });
const OpportunitiesTab = dynamic(() => import("@/components/accounts/OpportunitiesTab").then(m => ({ default: m.OpportunitiesTab })), { ssr: false });
const QuestionnaireTab = dynamic(() => import("@/components/accounts/QuestionnaireTab").then(m => ({ default: m.QuestionnaireTab })), { ssr: false });
const TimelineTab = dynamic(() => import("@/components/accounts/TimelineTab").then(m => ({ default: m.TimelineTab })), { ssr: false });
const ContactsTab = dynamic(() => import("@/components/accounts/ContactsTab").then(m => ({ default: m.ContactsTab })), { ssr: false });

// ─── Types ────────────────────────────────────────────────────────────────────

interface AccountDetail {
  id: string;
  name: string;
  industry: string | null;
  region: string | null;
  country: string | null;
  arr: number;
  health: "HEALTHY" | "AT_RISK" | "CRITICAL";
  contractEnd: string | null;
  kam: { id: string; name: string; email: string } | null;
  kamScores: Array<{
    id: string;
    overall: number;
    csat: number | null;
    relationship: number | null;
    risk: number | null;
    contractHealth: number | null;
    projectHealth: number | null;
    resourceHealth: number | null;
    financial: number | null;
    whitespace: number | null;
    aiNarrative: string | null;
    computedAt: string;
  }>;
  signals: Array<{
    id: string;
    type: string;
    title: string;
    description: string | null;
    severity: string;
    detectedAt: string;
    isResolved: boolean;
    resolvedAt: string | null;
    pendingReview: boolean;
  }>;
  actions: Array<{
    id: string;
    title: string;
    description: string | null;
    status: string;
    priority: string;
    source: string;
    dueDate: string | null;
    owner: { id: string; name: string } | null;
  }>;
  documents: Array<{
    id: string;
    name: string;
    type: string;
    fileUrl: string | null;
    fileSize: number | null;
    mimeType: string | null;
    uploadedBy: string | null;
    createdAt: string;
    extractedText: string | null;
    extractedSignals:    Array<{ id: string; type: string; severity: string; title: string; description: string }> | null;
    signalStatus:        string | null;
    affectedKycSections: string[] | null;
  }>;
  kycVersions: KycVersion[];
  qbrSessions: Array<{
    id: string;
    title: string;
    type: string;
    status: string;
    scheduledAt: string | null;
    conductedAt: string | null;
    attendees: string | null;
    aiSummary: string | null;
    notes: string | null;
    items: Array<{
      id: string;
      category: string | null;
      title: string;
      content: string | null;
      status: string | null;
    }>;
  }>;
  insights: Array<{
    id: string;
    type: string;
    title: string;
    summary: string;
    confidence: number;
    generatedAt: string;
  }>;
  kpiDimensions: Array<{
    id: string;
    name: string;
    category: string;
    value: number;
    target: number | null;
    unit: string | null;
  }>;
  adapters: {
    salesforce: Record<string, unknown>;
    jira: {
      openTickets: number;
      criticalTickets: number;
      avgResolutionDays: number;
      sprintVelocity: number;
    };
    worksphere: {
      activeUsers: number;
      totalUsers: number;
      utilizationPct: number;
      npsScore: number | null;
      lastMeetingDate: string | null;
    };
    finance: {
      revenueUtilizationPct: number;
      outstandingInvoices: number;
      overdueAmount: number;
    };
  };
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function AccountPage() {
  const params = useParams();
  const id     = params.id as string;
  const { role } = useRole();

  const [account, setAccount]         = useState<AccountDetail | null>(null);
  const [loading, setLoading]         = useState(true);
  const [error, setError]             = useState<string | null>(null);
  const [refreshingScore, setRefreshingScore]   = useState(false);
  const [scoreRefreshSuccess, setScoreRefreshSuccess] = useState(false);
  const [scoreRefreshError, setScoreRefreshError]     = useState<string | null>(null);
  const [scoreRefreshKey, setScoreRefreshKey]         = useState(0);
  const [scoreOverrides, setScoreOverrides]   = useState<ScoreOverride[]>([]);
  const [touchpoints,  setTouchpoints]  = useState<Touchpoint[]>([]);
  const [escalations,    setEscalations]    = useState<Escalation[]>([]);
  const [opportunities,   setOpportunities]  = useState<Opportunity[]>([]);
  const [contacts,        setContacts]       = useState<Contact[]>([]);
  const [oppAgentSources, setOppAgentSources] = useState<import("@/lib/ai/agents/types").AgentSource[]>([]);
  const [kycAgentSources, setKycAgentSources] = useState<import("@/lib/ai/agents/types").AgentSource[]>([]);
  const [kycAgentSteps,   setKycAgentSteps]   = useState<import("@/components/ui/AgentTracePanel").AgentStep[]>([]);
  const [kycAgentModel,   setKycAgentModel]   = useState<string | undefined>(undefined);
  const [qbrAgentSources, setQbrAgentSources] = useState<import("@/lib/ai/agents/types").AgentSource[]>([]);
  const [qbrAgentSteps,   setQbrAgentSteps]   = useState<import("@/components/ui/AgentTracePanel").AgentStep[]>([]);
  const [qbrAgentModel,   setQbrAgentModel]   = useState<string | undefined>(undefined);
  const [oppAgentSteps,   setOppAgentSteps]   = useState<import("@/components/ui/AgentTracePanel").AgentStep[]>([]);
  const [oppAgentModel,   setOppAgentModel]   = useState<string | undefined>(undefined);
  const [oppAgentLatency, setOppAgentLatency] = useState<number | undefined>(undefined);

  const fetchAccount = useCallback(async () => {
    try {
      const res  = await fetch(`/api/accounts/${id}`, { headers: { "x-role": role } });
      const json = await res.json();
      if (!res.ok) throw new Error(json.message ?? "Failed to load");
      setAccount(json.data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  }, [id, role]);

  useEffect(() => {
    setLoading(true);
    setError(null);
    fetchAccount();
    // Load score overrides for this account
    fetch(`/api/score-overrides?accountId=${id}`, { headers: { "x-role": role } })
      .then((r) => r.json())
      .then((j) => setScoreOverrides(j.data ?? []))
      .catch(() => {});
    // Load touchpoints for this account
    fetch(`/api/touchpoints?accountId=${id}`, { headers: { "x-role": role } })
      .then((r) => r.json())
      .then((j) => setTouchpoints(j.data ?? []))
      .catch(() => {});
    // Load escalations for this account
    fetch(`/api/escalations?accountId=${id}`, { headers: { "x-role": role } })
      .then((r) => r.json())
      .then((j) => setEscalations(j.data ?? []))
      .catch(() => {});
    // Load opportunities for this account
    fetch(`/api/opportunities?accountId=${id}`, { headers: { "x-role": role } })
      .then((r) => r.json())
      .then((j) => setOpportunities(j.data ?? []))
      .catch(() => {});
    // Load contacts for this account
    fetch(`/api/contacts?accountId=${id}`, { headers: { "x-role": role } })
      .then((r) => r.json())
      .then((j) => setContacts(j.data ?? []))
      .catch(() => {});
  }, [fetchAccount, id, role]);

  // ── Handlers ────────────────────────────────────────────────────────────────

  const handleRefreshScore = async () => {
    setRefreshingScore(true);
    setScoreRefreshError(null);
    setScoreRefreshSuccess(false);
    try {
      const res = await fetch("/api/ai/score", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-role": role },
        body: JSON.stringify({ accountId: id }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.message ?? "Score computation failed");
      }
      await fetchAccount();
      setScoreRefreshKey((k) => k + 1);
      setScoreRefreshSuccess(true);
      setTimeout(() => setScoreRefreshSuccess(false), 2500);
    } catch (e) {
      setScoreRefreshError(e instanceof Error ? e.message : "Failed to recompute");
      setTimeout(() => setScoreRefreshError(null), 4000);
    } finally {
      setRefreshingScore(false);
    }
  };

  const handleResolveSignal = async (signalId: string) => {
    await fetch(`/api/signals/${signalId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", "x-role": role },
      body: JSON.stringify({ isResolved: true }),
    });
    setAccount((prev) => prev ? {
      ...prev,
      signals: prev.signals.filter((s) => s.id !== signalId),
    } : prev);
  };

  // Acknowledge a pending-review signal (mark as reviewed, enters live feed)
  const handleAcknowledgeSignal = async (signalId: string) => {
    await fetch(`/api/signals/${signalId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", "x-role": role },
      body: JSON.stringify({ pendingReview: false }),
    });
    setAccount((prev) => prev ? {
      ...prev,
      signals: prev.signals.map((s) =>
        s.id === signalId ? { ...s, pendingReview: false } : s
      ),
    } : prev);
  };

  // Dismiss a pending-review signal (resolve without acknowledging)
  const handleDismissSignal = async (signalId: string) => {
    await fetch(`/api/signals/${signalId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", "x-role": role },
      body: JSON.stringify({ isResolved: true, pendingReview: false }),
    });
    setAccount((prev) => prev ? {
      ...prev,
      signals: prev.signals.filter((s) => s.id !== signalId),
    } : prev);
  };

  const handleCreateSignal = async (data: { type: string; severity: string; title: string; description: string | null }) => {
    const res  = await fetch("/api/signals", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-role": role },
      body: JSON.stringify({ ...data, accountId: id }),
    });
    const json = await res.json();
    if (json.data) {
      setAccount((prev) => prev ? {
        ...prev,
        signals: [json.data, ...prev.signals],
      } : prev);
    }
  };

  const handleActionStatusChange = async (actionId: string, status: string) => {
    await fetch(`/api/actions/${actionId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", "x-role": role },
      body: JSON.stringify({ status }),
    });
    setAccount((prev) => prev ? {
      ...prev,
      actions: prev.actions.map((a) => a.id === actionId ? { ...a, status } : a),
    } : prev);
  };

  const handleCreateAction = async (data: { title: string; priority: string; dueDate: string | null; description?: string }) => {
    const res  = await fetch("/api/actions", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-role": role },
      body: JSON.stringify({ ...data, accountId: id }),
    });
    const json = await res.json();
    if (json.data) {
      setAccount((prev) => prev ? {
        ...prev,
        actions: [json.data, ...prev.actions],
      } : prev);
    }
  };

  // ── KYC handlers ────────────────────────────────────────────────────────────

  const handleKycSubmit = async (kycId: string) => {
    await fetch(`/api/kyc/${kycId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", "x-role": role },
      body: JSON.stringify({ status: "SUBMITTED" }),
    });
    setAccount((prev) => prev ? {
      ...prev,
      kycVersions: prev.kycVersions.map((k) =>
        k.id === kycId ? { ...k, status: "SUBMITTED", submittedAt: new Date().toISOString() } : k
      ),
    } : prev);
  };

  const handleKycApprove = async (kycId: string) => {
    await fetch(`/api/kyc/${kycId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", "x-role": role },
      body: JSON.stringify({ status: "APPROVED" }),
    });
    setAccount((prev) => prev ? {
      ...prev,
      kycVersions: prev.kycVersions.map((k) =>
        k.id === kycId ? { ...k, status: "APPROVED", approvedAt: new Date().toISOString() } : k
      ),
    } : prev);
  };

  const handleKycReject = async (kycId: string, reason: string) => {
    await fetch(`/api/kyc/${kycId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", "x-role": role },
      body: JSON.stringify({ status: "REJECTED", rejectionReason: reason }),
    });
    setAccount((prev) => prev ? {
      ...prev,
      kycVersions: prev.kycVersions.map((k) =>
        k.id === kycId ? { ...k, status: "REJECTED" } : k
      ),
    } : prev);
  };

  const handleKycCreateNew = async (fields: Partial<KycVersion>) => {
    const res = await fetch("/api/kyc", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-role": role },
      body: JSON.stringify({ accountId: id, ...fields }),
    });
    const json = await res.json();
    if (json.data) {
      setAccount((prev) => prev ? {
        ...prev,
        kycVersions: [json.data, ...prev.kycVersions],
      } : prev);
    }
  };

  const handleKycUpdate = async (kycId: string, fields: Partial<KycVersion>) => {
    await fetch(`/api/kyc/${kycId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", "x-role": role },
      body: JSON.stringify(fields),
    });
    setAccount((prev) => prev ? {
      ...prev,
      kycVersions: prev.kycVersions.map((k) =>
        k.id === kycId ? { ...k, ...fields } : k
      ),
    } : prev);
  };

  // ── Document handlers ────────────────────────────────────────────────────────

  const handleDeleteDocument = async (docId: string) => {
    await fetch(`/api/documents/${docId}`, {
      method: "DELETE",
      headers: { "x-role": role },
    });
    setAccount((prev) => prev ? {
      ...prev,
      documents: prev.documents.filter((d) => d.id !== docId),
    } : prev);
  };

  const handleUploadDocument = async (file: File, type: string) => {
    const formData = new FormData();
    formData.append("file", file);
    formData.append("accountId", id);
    formData.append("type", type);
    const res  = await fetch("/api/documents/upload", {
      method: "POST",
      headers: { "x-role": role },
      body: formData,
    });
    const json = await res.json();
    if (json.data) {
      setAccount((prev) => prev ? {
        ...prev,
        documents: [json.data, ...prev.documents],
      } : prev);
    }
  };

  const handleDocumentAiExtract = async (docId: string, rawText: string) => {
    const res  = await fetch("/api/ai/extract", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-role": role },
      body: JSON.stringify({ documentId: docId, rawText }),
    });
    const json = await res.json();
    const data = json.data ?? {};
    // Update document state with signal results
    if (data.hasPendingSignals) {
      setAccount((prev) => prev ? {
        ...prev,
        documents: prev.documents.map((d) =>
          d.id === docId
            ? { ...d, extractedSignals: data.signals ?? [], signalStatus: "PENDING_REVIEW" }
            : d
        ),
      } : prev);
    }
    return {
      summary:             data.extracted?.summary       ?? null,
      keyTerms:            data.extracted?.keyTerms      ?? [],
      obligations:         data.extracted?.obligations   ?? [],
      renewalDate:         data.extracted?.renewalDate   ?? null,
      contractValue:       data.extracted?.contractValue ?? null,
      hasPendingSignals:   data.hasPendingSignals        ?? false,
      signals:             data.signals                  ?? [],
      affectedKycSections: data.affectedKycSections      ?? [],
    };
  };

  const handleCommitSignals = async (docId: string, selectedIds: string[]) => {
    await fetch(`/api/documents/${docId}/commit`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-role": role },
      body: JSON.stringify({ selectedIds }),
    });
    setAccount((prev) => prev ? {
      ...prev,
      documents: prev.documents.map((d) =>
        d.id === docId ? { ...d, signalStatus: "COMMITTED", extractedSignals: null } : d
      ),
    } : prev);
  };

  const handleDismissSignals = async (docId: string) => {
    await fetch(`/api/documents/${docId}/commit`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-role": role },
      body: JSON.stringify({ dismissAll: true }),
    });
    setAccount((prev) => prev ? {
      ...prev,
      documents: prev.documents.map((d) =>
        d.id === docId ? { ...d, signalStatus: "COMMITTED", extractedSignals: null } : d
      ),
    } : prev);
  };

  const handleKycAiDraft = async () => {
    const res  = await fetch("/api/ai/agents/kyc", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-role": role },
      body: JSON.stringify({ accountId: id }),
    });
    const json = await res.json();
    if (json.data) {
      const kyc = json.data.output ?? json.data.kyc;
      if (kyc) {
        setAccount((prev) => prev ? { ...prev, kycVersions: [kyc, ...prev.kycVersions] } : prev);
      }
      if (json.data.sources) setKycAgentSources(json.data.sources);
      if (json.data.steps)   setKycAgentSteps(json.data.steps);
      if (json.data.model)   setKycAgentModel(json.data.model);
    }
  };

  // ── Score override handlers ──────────────────────────────────────────────────

  const handleRequestOverride = async (kpiKey: string, requestedValue: number, reason: string) => {
    const res  = await fetch("/api/score-overrides", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-role": role },
      body: JSON.stringify({ accountId: id, kpiKey, requestedValue, reason }),
    });
    const json = await res.json();
    if (json.data) setScoreOverrides((prev) => [json.data, ...prev]);
  };

  const handleApproveOverride = async (overrideId: string) => {
    const res  = await fetch(`/api/score-overrides/${overrideId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", "x-role": role },
      body: JSON.stringify({ action: "APPROVE" }),
    });
    const json = await res.json();
    if (json.data) {
      setScoreOverrides((prev) => prev.map((o) => o.id === overrideId ? json.data : o));
    }
  };

  const handleDeclineOverride = async (overrideId: string, declineReason: string) => {
    const res  = await fetch(`/api/score-overrides/${overrideId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", "x-role": role },
      body: JSON.stringify({ action: "DECLINE", declineReason }),
    });
    const json = await res.json();
    if (json.data) {
      setScoreOverrides((prev) => prev.map((o) => o.id === overrideId ? json.data : o));
    }
  };

  const handleWithdrawOverride = async (overrideId: string) => {
    await fetch(`/api/score-overrides/${overrideId}`, {
      method: "DELETE",
      headers: { "x-role": role },
    });
    setScoreOverrides((prev) => prev.filter((o) => o.id !== overrideId));
  };

  // ── Opportunity handlers ─────────────────────────────────────────────────────

  const handleCreateOpportunity = async (data: {
    serviceLine: string; description: string;
    estimatedValue: number | null; effort: string | null;
    probability: number | null; nextAction: string | null;
  }) => {
    const res  = await fetch("/api/opportunities", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-role": role },
      body: JSON.stringify({ ...data, accountId: id }),
    });
    const json = await res.json();
    if (json.data) setOpportunities((prev) => [json.data, ...prev]);
  };

  const handleAdvanceOpportunity = async (oppId: string, newStatus: string) => {
    const res  = await fetch(`/api/opportunities/${oppId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", "x-role": role },
      body: JSON.stringify({ status: newStatus }),
    });
    const json = await res.json();
    if (json.data) setOpportunities((prev) => prev.map((o) => o.id === oppId ? json.data : o));
  };

  const handleEditOpportunity = async (oppId: string, patch: Partial<Opportunity>) => {
    const res  = await fetch(`/api/opportunities/${oppId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", "x-role": role },
      body: JSON.stringify(patch),
    });
    const json = await res.json();
    if (json.data) setOpportunities((prev) => prev.map((o) => o.id === oppId ? json.data : o));
  };

  const handleDeleteOpportunity = async (oppId: string) => {
    await fetch(`/api/opportunities/${oppId}`, { method: "DELETE", headers: { "x-role": role } });
    setOpportunities((prev) => prev.filter((o) => o.id !== oppId));
  };

  const handleAiGenerateOpportunities = async () => {
    const res  = await fetch("/api/ai/agents/opportunities", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-role": role },
      body: JSON.stringify({ accountId: id }),
    });
    const json = await res.json();
    if (json.data) {
      if (json.data.output?.length) setOpportunities((prev) => [...json.data.output, ...prev]);
      if (json.data.sources)  setOppAgentSources(json.data.sources);
      if (json.data.steps)    setOppAgentSteps(json.data.steps);
      if (json.data.model)    setOppAgentModel(json.data.model);
      if (json.data.totalLatencyMs) setOppAgentLatency(json.data.totalLatencyMs);
    }
  };

  const handleReviewOpportunity = async (oppId: string, action: "approve" | "decline", note?: string) => {
    const patch = action === "approve"
      ? { pendingReview: false }
      : { pendingReview: false, status: "LOST", reviewNote: note ?? "Declined by KAM" };
    const res  = await fetch(`/api/opportunities/${oppId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", "x-role": role },
      body: JSON.stringify(patch),
    });
    const json = await res.json();
    if (json.data) setOpportunities((prev) => prev.map((o) => o.id === oppId ? json.data : o));
  };

  // ── Contact handlers ────────────────────────────────────────────────────────

  const handleCreateContact = async (data: Omit<Contact, "id" | "accountId">) => {
    const res = await fetch("/api/contacts", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-role": role },
      body: JSON.stringify({ ...data, accountId: id }),
    });
    const json = await res.json();
    if (json.data) setContacts((prev) => [...prev, json.data]);
  };

  const handleUpdateContact = async (contactId: string, patch: Partial<Contact>) => {
    const res  = await fetch(`/api/contacts/${contactId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", "x-role": role },
      body: JSON.stringify(patch),
    });
    const json = await res.json();
    if (json.data) setContacts((prev) => prev.map((c) => c.id === contactId ? json.data : c));
  };

  const handleDeleteContact = async (contactId: string) => {
    await fetch(`/api/contacts/${contactId}`, { method: "DELETE", headers: { "x-role": role } });
    setContacts((prev) => prev.filter((c) => c.id !== contactId));
  };

  // ── Escalation handlers ──────────────────────────────────────────────────────

  const handleCreateEscalation = async (data: {
    type: string;
    severity: string;
    description: string;
    linkedProject: string | null;
  }) => {
    const res  = await fetch("/api/escalations", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-role": role },
      body: JSON.stringify({ ...data, accountId: id }),
    });
    const json = await res.json();
    if (json.data) {
      setEscalations((prev) => [json.data, ...prev]);
    }
  };

  const handleAdvanceEscalation = async (escId: string, newStatus: string, resolutionNotes?: string) => {
    const res  = await fetch(`/api/escalations/${escId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", "x-role": role },
      body: JSON.stringify({ status: newStatus, ...(resolutionNotes ? { resolutionNotes } : {}) }),
    });
    const json = await res.json();
    if (json.data) {
      setEscalations((prev) => prev.map((e) => e.id === escId ? json.data : e));
    }
  };

  // ── Touchpoint handlers ──────────────────────────────────────────────────────

  const handleLogTouchpoint = async (data: {
    type: string;
    date: string;
    notes: string | null;
    stakeholders: string | null;
    loggedBy: string | null;
  }) => {
    const res  = await fetch("/api/touchpoints", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-role": role },
      body: JSON.stringify({ ...data, accountId: id }),
    });
    const json = await res.json();
    if (json.data) {
      setTouchpoints((prev) => [json.data, ...prev]);
    }
  };

  const handleDeleteTouchpoint = async (tpId: string) => {
    await fetch(`/api/touchpoints/${tpId}`, {
      method: "DELETE",
      headers: { "x-role": role },
    });
    setTouchpoints((prev) => prev.filter((t) => t.id !== tpId));
  };

  // ── QBR handlers ─────────────────────────────────────────────────────────────

  const handleQbrAiSummary = async (sessionId: string): Promise<string> => {
    const res  = await fetch("/api/ai/qbr", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-role": role },
      body: JSON.stringify({ sessionId }),
    });
    const json = await res.json();
    const summary = json.data?.summary ?? "";
    setAccount((prev) => prev ? {
      ...prev,
      qbrSessions: prev.qbrSessions.map((s) =>
        s.id === sessionId ? { ...s, aiSummary: summary } : s
      ),
    } : prev);
    return summary;
  };

  const handleQbrGenerate = async (title: string, type: string): Promise<void> => {
    const res  = await fetch("/api/ai/agents/qbr", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-role": role },
      body: JSON.stringify({ accountId: id, sessionType: type, requestedTitle: title }),
    });
    const json = await res.json();
    if (json.data) {
      const session = json.data.output ?? json.data;
      if (session?.id) {
        setAccount((prev) => prev ? { ...prev, qbrSessions: [session, ...prev.qbrSessions] } : prev);
      }
      if (json.data.sources) setQbrAgentSources(json.data.sources);
      if (json.data.steps)   setQbrAgentSteps(json.data.steps);
      if (json.data.model)   setQbrAgentModel(json.data.model);
    }
  };

  // ── Render ──────────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="space-y-4">
        <SkeletonCard className="h-[110px]" />
        <div className="h-9 w-full rounded-lg bg-[var(--border-subtle)] animate-pulse" />
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <SkeletonCard className="h-[240px]" />
          <SkeletonCard className="h-[240px]" />
        </div>
      </div>
    );
  }

  if (error || !account) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <div className="text-4xl mb-3">⚠️</div>
        <p className="text-[14px] font-medium text-[var(--text-primary)]">
          {error ?? "Account not found"}
        </p>
        <Link href="/portfolio" className="mt-4 text-[13px] text-[#0755E9] hover:underline flex items-center gap-1">
          <ArrowLeft className="h-3.5 w-3.5" /> Back to Portfolio
        </Link>
      </div>
    );
  }

  const latestScore    = account.kamScores?.[0] ?? null;
  const pendingSignals = account.signals.filter((s) => !s.isResolved && s.pendingReview);
  const liveSignals    = account.signals.filter((s) => !s.isResolved && !s.pendingReview);
  const openSignals    = account.signals.filter((s) => !s.isResolved); // all open (for tab badge)
  const openActions    = account.actions.filter((a) => a.status !== "DONE");

  return (
    <div className="space-y-4">
      {/* Breadcrumb */}
      <nav className="flex items-center gap-1.5 text-[12px]">
        <Link
          href="/portfolio"
          className="flex items-center gap-1 text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors"
        >
          <ArrowLeft className="h-3 w-3" />
          Portfolio
        </Link>
        <ChevronRight className="h-3 w-3 text-[var(--text-disabled)] shrink-0" />
        <span
          className="text-[var(--text-primary)] font-medium truncate max-w-[240px]"
          title={account.name}
        >
          {account.name}
        </span>
      </nav>

      {/* Account header */}
      <AccountHeader
        name={account.name}
        industry={account.industry}
        region={account.region}
        country={account.country}
        arr={account.arr}
        health={account.health}
        contractEnd={account.contractEnd}
        kamName={account.kam?.name ?? null}
        latestScore={latestScore?.overall ?? null}
        onRefreshScore={role !== "EXECUTIVE" ? handleRefreshScore : undefined}
        refreshing={refreshingScore}
        refreshSuccess={scoreRefreshSuccess}
        refreshError={scoreRefreshError}
      />

      {/* Tabs */}
      <Tabs defaultValue="overview">
        <TabsBar>
          <TabsBarTrigger value="overview">Overview</TabsBarTrigger>
          <TabsBarTrigger value="signals">
            Signals
            {openSignals.length > 0 && (
              <span className="ml-1.5 text-[10px] bg-[#EF4444]/15 text-[#EF4444] rounded-full px-1.5 py-px font-semibold">
                {openSignals.length}
              </span>
            )}
          </TabsBarTrigger>
          <TabsBarTrigger value="actions">
            Actions
            {openActions.length > 0 && (
              <span className="ml-1.5 text-[10px] bg-[#0755E9]/15 text-[#0755E9] rounded-full px-1.5 py-px font-semibold">
                {openActions.length}
              </span>
            )}
          </TabsBarTrigger>
          <TabsBarTrigger value="kyc">KYC</TabsBarTrigger>
          <TabsBarTrigger value="documents">Documents</TabsBarTrigger>
          <TabsBarTrigger value="qbr">QBR / DBR</TabsBarTrigger>
          <TabsBarTrigger value="activity">
            Activity
            {touchpoints.length > 0 && (
              <span className="ml-1.5 text-[10px] bg-[var(--bg-surface-2)] text-[var(--text-muted)] rounded-full px-1.5 py-px font-semibold">
                {touchpoints.length}
              </span>
            )}
          </TabsBarTrigger>
          <TabsBarTrigger value="opportunities">
            Opportunities
            {opportunities.filter((o) => o.status !== "WON" && o.status !== "LOST").length > 0 && (
              <span className="ml-1.5 text-[10px] bg-[#A855F7]/15 text-[#A855F7] rounded-full px-1.5 py-px font-semibold">
                {opportunities.filter((o) => o.status !== "WON" && o.status !== "LOST").length}
              </span>
            )}
          </TabsBarTrigger>
          <TabsBarTrigger value="escalations">
            Escalations
            {escalations.filter((e) => e.status !== "RESOLVED").length > 0 && (
              <span className="ml-1.5 text-[10px] bg-[#EF4444]/15 text-[#EF4444] rounded-full px-1.5 py-px font-semibold">
                {escalations.filter((e) => e.status !== "RESOLVED").length}
              </span>
            )}
          </TabsBarTrigger>
          <TabsBarTrigger value="questionnaire">Questionnaire</TabsBarTrigger>
          <TabsBarTrigger value="contacts">
            Contacts
            {contacts.length > 0 && (
              <span className="ml-1.5 text-[10px] bg-[var(--bg-surface-2)] text-[var(--text-muted)] rounded-full px-1.5 py-px font-semibold">
                {contacts.length}
              </span>
            )}
          </TabsBarTrigger>
        </TabsBar>

        <div className="pt-4">
          <TabsContent value="overview">
            <OverviewTab
              signals={openSignals}
              actions={openActions}
              insights={account.insights}
              kpiDimensions={account.kpiDimensions}
              adapters={account.adapters}
              latestScore={latestScore}
              scoreHistory={account.kamScores ?? []}
              scoreRefreshKey={scoreRefreshKey}
              scoreOverrides={scoreOverrides}
              role={role}
              accountId={id}
              onRequestOverride={handleRequestOverride}
              onApproveOverride={handleApproveOverride}
              onDeclineOverride={handleDeclineOverride}
              onWithdrawOverride={handleWithdrawOverride}
            />
          </TabsContent>

          <TabsContent value="signals">
            <SignalsTab
              signals={liveSignals}
              pendingSignals={pendingSignals}
              accountId={id}
              onResolve={handleResolveSignal}
              onAcknowledge={handleAcknowledgeSignal}
              onDismiss={handleDismissSignal}
              onCreateSignal={handleCreateSignal}
            />
          </TabsContent>

          <TabsContent value="actions">
            <ActionsTab
              actions={account.actions}
              accountId={account.id}
              onStatusChange={handleActionStatusChange}
              onCreateAction={handleCreateAction}
            />
          </TabsContent>

          <TabsContent value="kyc">
            <KYCTab
              kycVersions={account.kycVersions}
              accountId={account.id}
              onSubmit={handleKycSubmit}
              onApprove={handleKycApprove}
              onReject={handleKycReject}
              onCreateNew={handleKycCreateNew}
              onUpdate={handleKycUpdate}
              onAiDraft={handleKycAiDraft}
              agentSources={kycAgentSources.length > 0 ? kycAgentSources : undefined}
              agentSteps={kycAgentSteps.length > 0 ? kycAgentSteps : undefined}
              agentModel={kycAgentModel}
            />
          </TabsContent>

          <TabsContent value="documents">
            <DocumentsTab
              documents={account.documents}
              onDelete={handleDeleteDocument}
              onUpload={handleUploadDocument}
              onAiExtract={handleDocumentAiExtract}
              onCommitSignals={handleCommitSignals}
              onDismissSignals={handleDismissSignals}
            />
          </TabsContent>

          <TabsContent value="qbr">
            <QBRTab
              sessions={account.qbrSessions}
              accountId={account.id}
              onGenerateSummary={handleQbrAiSummary}
              onGenerateSession={handleQbrGenerate}
              agentSources={qbrAgentSources.length > 0 ? qbrAgentSources : undefined}
              agentSteps={qbrAgentSteps.length > 0 ? qbrAgentSteps : undefined}
              agentModel={qbrAgentModel}
            />
          </TabsContent>

          <TabsContent value="activity">
            <TimelineTab
              accountId={account.id}
              touchpoints={touchpoints}
              signals={account.signals}
              documents={account.documents}
              kycVersions={account.kycVersions}
              qbrSessions={account.qbrSessions}
              kamScores={account.kamScores ?? []}
              escalations={escalations}
            />
          </TabsContent>

          <TabsContent value="opportunities">
            <OpportunitiesTab
              opportunities={opportunities}
              accountId={account.id}
              onCreate={handleCreateOpportunity}
              onAdvance={handleAdvanceOpportunity}
              onEdit={handleEditOpportunity}
              onDelete={handleDeleteOpportunity}
              onAiGenerate={handleAiGenerateOpportunities}
              onReview={handleReviewOpportunity}
              agentSources={oppAgentSources.length > 0 ? oppAgentSources : undefined}
              agentSteps={oppAgentSteps.length > 0 ? oppAgentSteps : undefined}
              agentModel={oppAgentModel}
              agentLatency={oppAgentLatency}
            />
          </TabsContent>

          <TabsContent value="escalations">
            <EscalationsTab
              escalations={escalations}
              accountId={account.id}
              onCreate={handleCreateEscalation}
              onAdvance={handleAdvanceEscalation}
            />
          </TabsContent>

          <TabsContent value="questionnaire">
            <QuestionnaireTab accountId={account.id} />
          </TabsContent>

          <TabsContent value="contacts">
            <ContactsTab
              contacts={contacts}
              accountId={account.id}
              onAdd={handleCreateContact}
              onUpdate={handleUpdateContact}
              onDelete={handleDeleteContact}
            />
          </TabsContent>
        </div>
      </Tabs>
    </div>
  );
}

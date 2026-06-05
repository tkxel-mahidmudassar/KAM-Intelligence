"use client";

import { useState, useEffect, useRef } from "react";
import { Brain, Zap, Check, RefreshCw, Server, SlidersHorizontal, AlertCircle, Save, Bell, Mail, Monitor, ChevronDown, ChevronUp, Users, Shield, Plus, BookOpen, Upload, Archive, Trash2, FileText, Table, FileCode, CheckCircle, XCircle, Clock, MoreVertical, Network, BarChart2, Loader2, Star, AlertTriangle } from "lucide-react";
import { useRole } from "@/context/RoleContext";
import { cn } from "@/lib/utils";
import { PlaybookLibrary } from "@/components/playbooks/PlaybookLibrary";

// ─── KPI weight metadata ──────────────────────────────────────────────────────

interface WeightDef {
  key: string;
  label: string;
  description: string;
  color: string;
}

const WEIGHT_DEFS: WeightDef[] = [
  { key: "csat",           label: "CSAT",             description: "Customer satisfaction, NPS, platform utilisation",   color: "#22C55E" },
  { key: "relationship",   label: "Relationship",      description: "Stakeholder engagement, exec sponsor coverage",      color: "#0755E9" },
  { key: "risk",           label: "Risk",              description: "Churn signals, open escalations, critical issues",   color: "#EF4444" },
  { key: "contractHealth", label: "Contract Health",   description: "ARR utilisation, invoicing, renewal proximity",      color: "#F59E0B" },
  { key: "projectHealth",  label: "Project Health",    description: "Delivery velocity, sprint health, Jira metrics",     color: "#8B5CF6" },
  { key: "resourceHealth", label: "Resource Health",   description: "Active users, platform adoption depth",              color: "#06B6D4" },
  { key: "financial",      label: "Financial",         description: "Revenue utilisation, overdue invoices",              color: "#10B981" },
  { key: "whitespace",     label: "Whitespace",        description: "Expansion and upsell opportunity indicator",         color: "#F97316" },
];

type WeightMap = Record<string, number>;

const DEFAULT_WEIGHTS: WeightMap = {
  csat: 20, relationship: 15, risk: 15, contractHealth: 15,
  projectHealth: 10, resourceHealth: 10, financial: 10, whitespace: 5,
};

// ─── Sub-components ───────────────────────────────────────────────────────────

function SettingSection({ title, icon: Icon, iconColor, children }: {
  title: string;
  icon: React.ElementType;
  iconColor: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-xl border border-[var(--glass-border)] bg-[var(--glass-bg)] [backdrop-filter:var(--glass-blur)] p-5">
      <div className="flex items-center gap-2.5 mb-4">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg" style={{ background: `${iconColor}18` }}>
          <Icon className="h-4 w-4" style={{ color: iconColor }} />
        </div>
        <h2 className="text-[14px] font-semibold text-[var(--text-primary)]">{title}</h2>
      </div>
      {children}
    </div>
  );
}

function SettingRow({ label, value, description, badge }: {
  label: string;
  value: string;
  description?: string;
  badge?: React.ReactNode;
}) {
  return (
    <div className="flex items-start justify-between py-3 border-b border-[var(--border-subtle)] last:border-0">
      <div className="min-w-0 flex-1">
        <p className="text-[13px] font-medium text-[var(--text-primary)]">{label}</p>
        {description && <p className="text-[11px] text-[var(--text-muted)] mt-0.5">{description}</p>}
      </div>
      <div className="flex items-center gap-2 shrink-0 ml-4">
        {badge}
        <span className="text-[12px] font-mono text-[var(--text-secondary)] bg-[var(--bg-surface-2)] px-2 py-0.5 rounded border border-[var(--border-subtle)]">
          {value}
        </span>
      </div>
    </div>
  );
}

// ─── Notification Preferences ─────────────────────────────────────────────────

interface NotifEventConfig {
  enabled: boolean;
  threshold?: number;
  daysBefore?: number;
}

interface NotificationPrefs {
  frequency: "immediate" | "daily_digest" | "weekly_digest";
  channels: { email: boolean; inApp: boolean };
  events: {
    scoreDropped:     NotifEventConfig;
    criticalSignal:   NotifEventConfig;
    warningSignal:    NotifEventConfig;
    actionOverdue:    NotifEventConfig;
    renewalUpcoming:  NotifEventConfig;
    qbrReminder:      NotifEventConfig;
  };
}

const DEFAULT_NOTIFICATION_PREFS: NotificationPrefs = {
  frequency: "immediate",
  channels: { email: true, inApp: true },
  events: {
    scoreDropped:     { enabled: true,  threshold: 5  },
    criticalSignal:   { enabled: true  },
    warningSignal:    { enabled: false },
    actionOverdue:    { enabled: true  },
    renewalUpcoming:  { enabled: true,  daysBefore: 60 },
    qbrReminder:      { enabled: true,  daysBefore: 14 },
  },
};

const EVENT_DEFS: Array<{
  key: keyof NotificationPrefs["events"];
  label: string;
  description: string;
  color: string;
  extra?: "threshold" | "daysBefore";
  extraLabel?: string;
}> = [
  { key: "scoreDropped",    label: "Score dropped",       description: "Alert when KAM score falls by more than the threshold",  color: "#EF4444", extra: "threshold",  extraLabel: "Min drop (pts)" },
  { key: "criticalSignal",  label: "Critical signal",     description: "New CRITICAL severity signal detected on an account",    color: "#EF4444" },
  { key: "warningSignal",   label: "Warning signal",      description: "New WARNING severity signal detected",                   color: "#F59E0B" },
  { key: "actionOverdue",   label: "Action overdue",      description: "A task / action item has passed its due date",           color: "#F97316" },
  { key: "renewalUpcoming", label: "Renewal upcoming",    description: "Contract renewal approaching within the day window",    color: "#0755E9", extra: "daysBefore", extraLabel: "Days before" },
  { key: "qbrReminder",     label: "QBR reminder",        description: "Upcoming QBR session within the day window",            color: "#8B5CF6", extra: "daysBefore", extraLabel: "Days before" },
];

function Toggle({ checked, onChange, disabled }: { checked: boolean; onChange: (v: boolean) => void; disabled?: boolean }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => !disabled && onChange(!checked)}
      className={cn(
        "relative inline-flex h-5 w-9 shrink-0 rounded-full transition-colors duration-200",
        checked ? "bg-[#0755E9]" : "bg-[var(--bg-surface-2)] border border-[var(--border-subtle)]",
        disabled ? "opacity-40 cursor-not-allowed" : "cursor-pointer"
      )}
    >
      <span className={cn(
        "pointer-events-none inline-block h-3.5 w-3.5 rounded-full bg-white shadow-sm transition-transform duration-200 absolute top-[3px]",
        checked ? "translate-x-[18px]" : "translate-x-[3px]"
      )} />
    </button>
  );
}

function NotificationPrefsPanel({ role, initialPrefs }: { role: string; initialPrefs: NotificationPrefs }) {
  const canEdit = role === "KAM" || role === "MANAGER" || role === "EXECUTIVE";
  const [prefs, setPrefs]   = useState<NotificationPrefs>({ ...initialPrefs });
  const [saving, setSaving] = useState(false);
  const [saved, setSaved]   = useState(false);
  const [error, setError]   = useState<string | null>(null);

  useEffect(() => { setPrefs({ ...initialPrefs }); }, [JSON.stringify(initialPrefs)]);

  const setEvent = (key: keyof NotificationPrefs["events"], patch: Partial<NotifEventConfig>) => {
    setPrefs((p) => ({ ...p, events: { ...p.events, [key]: { ...p.events[key], ...patch } } }));
    setSaved(false);
  };

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json", "x-role": role },
        body: JSON.stringify({ notificationPrefs: prefs }),
      });
      const json = await res.json();
      if (!res.ok) { setError(json.error ?? "Save failed"); return; }
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (e) {
      setError(String(e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div>
      {!canEdit && (
        <div className="flex items-center gap-2 mb-4 p-3 rounded-lg bg-[#F59E0B]/8 border border-[#F59E0B]/20">
          <AlertCircle className="h-3.5 w-3.5 text-[#F59E0B] shrink-0" />
          <p className="text-[12px] text-[var(--text-muted)]">View-only — Manager or Executive role required to edit preferences.</p>
        </div>
      )}

      {/* Channels */}
      <div className="mb-5">
        <p className="text-[11px] font-semibold text-[var(--text-muted)] uppercase tracking-wider mb-2">Channels</p>
        <div className="flex items-center gap-6">
          <div className="flex items-center gap-2">
            <Mail className="h-3.5 w-3.5 text-[var(--text-muted)]" />
            <span className="text-[12px] text-[var(--text-primary)]">Email</span>
            <Toggle checked={prefs.channels.email} onChange={(v) => { setPrefs((p) => ({ ...p, channels: { ...p.channels, email: v } })); setSaved(false); }} disabled={!canEdit} />
          </div>
          <div className="flex items-center gap-2">
            <Monitor className="h-3.5 w-3.5 text-[var(--text-muted)]" />
            <span className="text-[12px] text-[var(--text-primary)]">In-app</span>
            <Toggle checked={prefs.channels.inApp} onChange={(v) => { setPrefs((p) => ({ ...p, channels: { ...p.channels, inApp: v } })); setSaved(false); }} disabled={!canEdit} />
          </div>
        </div>
      </div>

      {/* Frequency */}
      <div className="mb-5">
        <p className="text-[11px] font-semibold text-[var(--text-muted)] uppercase tracking-wider mb-2">Delivery frequency</p>
        <div className="flex items-center gap-2 flex-wrap">
          {([
            { key: "immediate",     label: "Immediate"     },
            { key: "daily_digest",  label: "Daily digest"  },
            { key: "weekly_digest", label: "Weekly digest" },
          ] as const).map((f) => (
            <button
              key={f.key}
              disabled={!canEdit}
              onClick={() => { setPrefs((p) => ({ ...p, frequency: f.key })); setSaved(false); }}
              className={cn(
                "px-3 py-1.5 rounded-lg text-[12px] font-medium border transition-all",
                prefs.frequency === f.key
                  ? "bg-[#0755E9]/15 text-[#0755E9] border-[#0755E9]/30"
                  : "bg-transparent text-[var(--text-muted)] border-[var(--border-subtle)] hover:text-[var(--text-primary)]",
                !canEdit && "opacity-60 cursor-not-allowed"
              )}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {/* Per-event toggles */}
      <div>
        <p className="text-[11px] font-semibold text-[var(--text-muted)] uppercase tracking-wider mb-2">Event triggers</p>
        <div className="space-y-0">
          {EVENT_DEFS.map((def) => {
            const ev = prefs.events[def.key];
            return (
              <div key={def.key} className="flex items-center gap-3 py-2.5 border-b border-[var(--border-subtle)] last:border-0">
                {/* Color dot */}
                <div className="h-2 w-2 rounded-full shrink-0 mt-0.5" style={{ background: def.color }} />

                {/* Labels */}
                <div className="flex-1 min-w-0">
                  <p className="text-[12px] font-medium text-[var(--text-primary)] leading-tight">{def.label}</p>
                  <p className="text-[11px] text-[var(--text-muted)] leading-tight mt-0.5">{def.description}</p>
                </div>

                {/* Extra numeric input */}
                {def.extra && ev.enabled && (
                  <div className="flex items-center gap-1 shrink-0">
                    <span className="text-[10px] text-[var(--text-muted)] hidden sm:block">{def.extraLabel}</span>
                    <input
                      type="number"
                      min={1}
                      max={def.extra === "threshold" ? 100 : 365}
                      value={def.extra === "threshold" ? (ev.threshold ?? 5) : (ev.daysBefore ?? 30)}
                      onChange={(e) => {
                        const v = parseInt(e.target.value, 10);
                        if (!isNaN(v)) setEvent(def.key, { [def.extra!]: v });
                      }}
                      disabled={!canEdit}
                      className="w-14 text-center text-[12px] font-mono rounded-lg border border-[var(--border-subtle)] bg-[var(--modal-input-bg)] text-[var(--text-primary)] px-2 py-1 focus:outline-none focus:border-[#0755E9]/50 disabled:opacity-50 disabled:cursor-not-allowed"
                    />
                  </div>
                )}

                {/* Toggle */}
                <Toggle checked={ev.enabled} onChange={(v) => setEvent(def.key, { enabled: v })} disabled={!canEdit} />
              </div>
            );
          })}
        </div>
      </div>

      {/* Error */}
      {error && (
        <p className="mt-3 text-[12px] text-[#EF4444] flex items-center gap-1.5">
          <AlertCircle className="h-3.5 w-3.5 shrink-0" /> {error}
        </p>
      )}

      {/* Save */}
      {canEdit && (
        <div className="flex items-center gap-2 mt-4">
          <button
            onClick={handleSave}
            disabled={saving || saved}
            className={cn(
              "flex items-center gap-2 px-4 py-2 rounded-lg text-[13px] font-medium transition-all",
              saved
                ? "bg-[#22C55E]/15 text-[#22C55E] border border-[#22C55E]/30"
                : saving
                ? "bg-[var(--bg-surface-2)] text-[var(--text-disabled)] border border-[var(--border-subtle)] cursor-not-allowed"
                : "bg-[#0755E9]/15 text-[#0755E9] border border-[#0755E9]/30 hover:bg-[#0755E9]/25"
            )}
          >
            {saving ? <><RefreshCw className="h-4 w-4 animate-spin" /> Saving…</>
              : saved ? <><Check className="h-4 w-4" /> Saved</>
              : <><Save className="h-4 w-4" /> Save preferences</>}
          </button>
        </div>
      )}
    </div>
  );
}

// ─── Score Weights Panel ──────────────────────────────────────────────────────

function ScoreWeightsPanel({ role, initialWeights }: { role: string; initialWeights: WeightMap }) {
  const canEdit = role === "KAM" || role === "MANAGER" || role === "EXECUTIVE";
  const [weights, setWeights]   = useState<WeightMap>({ ...initialWeights });
  const [saving, setSaving]     = useState(false);
  const [saved, setSaved]       = useState(false);
  const [error, setError]       = useState<string | null>(null);

  // Keep in sync if parent re-fetches
  useEffect(() => { setWeights({ ...initialWeights }); }, [JSON.stringify(initialWeights)]);

  const total = WEIGHT_DEFS.reduce((s, d) => s + (Number(weights[d.key]) || 0), 0);
  const totalOk = total === 100;

  const handleChange = (key: string, raw: string) => {
    const v = raw === "" ? 0 : parseInt(raw, 10);
    if (isNaN(v)) return;
    setWeights((prev) => ({ ...prev, [key]: Math.max(0, Math.min(100, v)) }));
    setSaved(false);
    setError(null);
  };

  const handleReset = () => {
    setWeights({ ...DEFAULT_WEIGHTS });
    setSaved(false);
    setError(null);
  };

  const handleSave = async () => {
    if (!totalOk) { setError(`Weights must sum to 100 (currently ${total})`); return; }
    setSaving(true);
    setError(null);
    try {
      const res  = await fetch("/api/settings", {
        method:  "PUT",
        headers: { "Content-Type": "application/json", "x-role": role },
        body:    JSON.stringify({ scoreWeights: weights }),
      });
      const json = await res.json();
      if (!res.ok) { setError(json.error ?? "Save failed"); return; }
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (e) {
      setError(String(e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div>
      {/* Read-only notice for KAMs */}
      {!canEdit && (
        <div className="flex items-center gap-2 mb-4 p-3 rounded-lg bg-[#F59E0B]/8 border border-[#F59E0B]/20">
          <AlertCircle className="h-3.5 w-3.5 text-[#F59E0B] shrink-0" />
          <p className="text-[12px] text-[var(--text-muted)]">
            View-only — Manager or Executive role required to edit weights.
          </p>
        </div>
      )}

      {/* Weight rows */}
      <div className="space-y-2">
        {WEIGHT_DEFS.map((def) => {
          const val = weights[def.key] ?? 0;
          const barPct = Math.min(100, val);
          return (
            <div key={def.key} className="flex items-center gap-3 py-2 border-b border-[var(--border-subtle)] last:border-0">
              {/* Color dot + label */}
              <div className="flex items-center gap-2 w-[140px] shrink-0">
                <div className="h-2.5 w-2.5 rounded-full shrink-0" style={{ background: def.color }} />
                <div>
                  <p className="text-[12px] font-medium text-[var(--text-primary)] leading-tight">{def.label}</p>
                  <p className="text-[10px] text-[var(--text-muted)] leading-tight hidden sm:block">{def.description}</p>
                </div>
              </div>

              {/* Mini bar */}
              <div className="flex-1 hidden sm:block">
                <div className="h-1.5 rounded-full bg-[var(--bg-surface-2)]">
                  <div
                    className="h-1.5 rounded-full transition-all duration-200"
                    style={{ width: `${barPct}%`, background: def.color }}
                  />
                </div>
              </div>

              {/* Input */}
              {canEdit ? (
                <div className="flex items-center gap-1 shrink-0">
                  <input
                    type="number"
                    min={0}
                    max={100}
                    value={val}
                    onChange={(e) => handleChange(def.key, e.target.value)}
                    className="w-14 text-center text-[13px] font-mono font-semibold rounded-lg border border-[var(--border-subtle)] bg-[var(--modal-input-bg)] text-[var(--text-primary)] px-2 py-1.5 focus:outline-none focus:border-[#0755E9]/50 focus:ring-1 focus:ring-[#0755E9]/20"
                  />
                  <span className="text-[12px] text-[var(--text-muted)]">%</span>
                </div>
              ) : (
                <span className="w-14 text-right text-[13px] font-mono font-semibold text-[var(--text-primary)] shrink-0">
                  {val}%
                </span>
              )}
            </div>
          );
        })}
      </div>

      {/* Total bar */}
      <div className={cn(
        "flex items-center justify-between mt-4 pt-3 border-t",
        totalOk ? "border-[var(--border-subtle)]" : "border-[#EF4444]/30"
      )}>
        <p className="text-[12px] text-[var(--text-muted)] font-medium">Total</p>
        <span className={cn(
          "text-[14px] font-bold font-mono tabular-nums",
          totalOk ? "text-[#22C55E]" : total > 100 ? "text-[#EF4444]" : "text-[#F59E0B]"
        )}>
          {total}%
          {!totalOk && (
            <span className="text-[11px] font-normal ml-1">
              ({total > 100 ? `-${total - 100}` : `+${100 - total}`} to reach 100)
            </span>
          )}
        </span>
      </div>

      {/* Error */}
      {error && (
        <p className="mt-2 text-[12px] text-[#EF4444] flex items-center gap-1.5">
          <AlertCircle className="h-3.5 w-3.5 shrink-0" /> {error}
        </p>
      )}

      {/* Actions (editors only) */}
      {canEdit && (
        <div className="flex items-center gap-2 mt-4">
          <button
            onClick={handleSave}
            disabled={saving || saved || !totalOk}
            className={cn(
              "flex items-center gap-2 px-4 py-2 rounded-lg text-[13px] font-medium transition-all",
              saved
                ? "bg-[#22C55E]/15 text-[#22C55E] border border-[#22C55E]/30"
                : !totalOk || saving
                ? "bg-[var(--bg-surface-2)] text-[var(--text-disabled)] border border-[var(--border-subtle)] cursor-not-allowed"
                : "bg-[#0755E9]/15 text-[#0755E9] border border-[#0755E9]/30 hover:bg-[#0755E9]/25"
            )}
          >
            {saving ? (
              <><RefreshCw className="h-4 w-4 animate-spin" /> Saving…</>
            ) : saved ? (
              <><Check className="h-4 w-4" /> Saved</>
            ) : (
              <><Save className="h-4 w-4" /> Save weights</>
            )}
          </button>
          <button
            onClick={handleReset}
            className="flex items-center gap-2 px-4 py-2 rounded-lg text-[13px] font-medium text-[var(--text-muted)] border border-[var(--border-subtle)] hover:text-[var(--text-primary)] transition-colors"
          >
            Reset to defaults
          </button>
        </div>
      )}
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

interface AppSettings {
  aiProvider: string;
  adapterMode: string;
  appUrl: string;
  nodeEnv: string;
  dbConnected: boolean;
  scoreWeights?: WeightMap;
  notificationPrefs?: NotificationPrefs;
}

interface TeamUser {
  id: string;
  name: string;
  email: string;
  role: string;
  avatarUrl: string | null;
  _count: { managedAccounts: number };
}

const ROLE_COLORS: Record<string, string> = {
  KAM:       "#0755E9",
  MANAGER:   "#7C3AED",
  EXECUTIVE: "#0EA5E9",
  ADMIN:     "#F59E0B",
};

const ROLE_LABELS: Record<string, string> = {
  KAM: "Associate", MANAGER: "KAM", EXECUTIVE: "Exec", ADMIN: "Admin",
};

function avatarInitials(name: string) {
  return name.split(" ").map((n) => n[0]).join("").toUpperCase().slice(0, 2);
}

// ─── Playbooks section ────────────────────────────────────────────────────────

interface Playbook {
  id: string;
  title: string;
  fileType: string;
  fileName: string;
  fileSize: number;
  status: "PROCESSING" | "ACTIVE" | "FAILED" | "ARCHIVED";
  processedAt: string | null;
  errorMessage: string | null;
  ruleCount: number;
  exclusionCount: number;
  createdAt: string;
  uploadedBy: { name: string; role: string } | null;
}

const STATUS_META = {
  PROCESSING: { label: "Processing",  color: "#F59E0B", icon: Clock },
  ACTIVE:     { label: "Active",      color: "#22C55E", icon: CheckCircle },
  FAILED:     { label: "Failed",      color: "#EF4444", icon: XCircle },
  ARCHIVED:   { label: "Archived",    color: "#6B7280", icon: Archive },
};

const FILE_ICON: Record<string, React.ElementType> = {
  pdf: FileText, docx: FileText, doc: FileText,
  xlsx: Table, xls: Table,
  txt: FileCode, md: FileCode,
};

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function PlaybooksSection({ role }: { role: string }) {
  const [playbooks, setPlaybooks]   = useState<Playbook[]>([]);
  const [loading, setLoading]       = useState(true);
  const [uploading, setUploading]   = useState(false);
  const [dragging, setDragging]     = useState(false);
  const [openMenu, setOpenMenu]     = useState<string | null>(null);
  const fileInputRef                = useRef<HTMLInputElement>(null);

  const canUpload = role !== "EXECUTIVE";

  const fetchPlaybooks = () => {
    setLoading(true);
    fetch("/api/playbooks", { headers: { "x-role": role } })
      .then((r) => r.json())
      .then((res) => setPlaybooks(res.data ?? []))
      .catch(console.error)
      .finally(() => setLoading(false));
  };

  useEffect(() => { fetchPlaybooks(); }, [role]);

  const uploadFile = async (file: File) => {
    setUploading(true);
    try {
      const form = new FormData();
      form.append("file", file);
      form.append("title", file.name.replace(/\.[^.]+$/, ""));
      const res = await fetch("/api/playbooks/upload", {
        method: "POST",
        headers: { "x-role": role },
        body: form,
      });
      if (res.ok) {
        fetchPlaybooks();
        // Poll for processing completion
        const pollInterval = setInterval(() => {
          fetchPlaybooks();
        }, 3000);
        setTimeout(() => clearInterval(pollInterval), 30000);
      }
    } finally {
      setUploading(false);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) uploadFile(file);
    e.target.value = "";
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) uploadFile(file);
  };

  const handleStatusChange = async (id: string, status: "ACTIVE" | "ARCHIVED") => {
    setOpenMenu(null);
    await fetch(`/api/playbooks/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", "x-role": role },
      body: JSON.stringify({ status }),
    });
    fetchPlaybooks();
  };

  const handleDelete = async (id: string) => {
    setOpenMenu(null);
    if (!confirm("Permanently delete this playbook and all its rules?")) return;
    await fetch(`/api/playbooks/${id}`, { method: "DELETE", headers: { "x-role": role } });
    fetchPlaybooks();
  };

  return (
    <SettingSection title="Playbooks" icon={BookOpen} iconColor="#0755E9">
      <p className="text-[12px] text-[var(--text-muted)] mb-4">
        Upload trusted internal playbooks. Recommendations across all accounts will be grounded in
        these rules first, with AI fallback when no playbook guidance applies.
        {role === "EXECUTIVE" && " You have view-only access."}
      </p>

      {/* Upload dropzone */}
      {canUpload && (
        <div
          onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
          onDragLeave={() => setDragging(false)}
          onDrop={handleDrop}
          onClick={() => fileInputRef.current?.click()}
          className={cn(
            "mb-4 flex flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed p-6 cursor-pointer transition-all",
            dragging
              ? "border-[#0755E9] bg-[#0755E9]/5"
              : "border-[var(--border-subtle)] hover:border-[#0755E9]/50 hover:bg-[var(--bg-surface-2)]"
          )}
        >
          <input
            ref={fileInputRef}
            type="file"
            accept=".pdf,.doc,.docx,.xls,.xlsx,.txt,.md"
            className="hidden"
            onChange={handleFileChange}
          />
          {uploading ? (
            <>
              <RefreshCw className="h-5 w-5 text-[#0755E9] animate-spin" />
              <p className="text-[13px] font-medium text-[var(--text-primary)]">Uploading…</p>
            </>
          ) : (
            <>
              <Upload className="h-5 w-5 text-[var(--text-muted)]" />
              <p className="text-[13px] font-medium text-[var(--text-primary)]">
                Drop a file or click to upload
              </p>
              <p className="text-[11px] text-[var(--text-muted)]">PDF, DOCX, XLSX, TXT, MD — max 25 MB</p>
            </>
          )}
        </div>
      )}

      {/* Playbook list */}
      {loading ? (
        <div className="space-y-2">
          {[...Array(2)].map((_, i) => (
            <div key={i} className="h-14 rounded-lg bg-[var(--bg-surface-2)] animate-pulse" />
          ))}
        </div>
      ) : playbooks.length === 0 ? (
        <p className="text-[12px] text-[var(--text-muted)] text-center py-4">
          No playbooks yet. Upload one to get started.
        </p>
      ) : (
        <div className="space-y-2">
          {playbooks.map((pb) => {
            const statusMeta = STATUS_META[pb.status];
            const StatusIcon = statusMeta.icon;
            const FileIcon = FILE_ICON[pb.fileType] ?? FileText;
            return (
              <div
                key={pb.id}
                className={cn(
                  "flex items-center gap-3 rounded-xl border p-3 transition-opacity",
                  pb.status === "ARCHIVED"
                    ? "opacity-50 border-[var(--border-subtle)] bg-transparent"
                    : "border-[var(--border-subtle)] bg-[var(--bg-surface-1)]"
                )}
              >
                {/* File type icon */}
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[#0755E9]/10">
                  <FileIcon className="h-4 w-4 text-[#0755E9]" />
                </div>

                {/* Info */}
                <div className="flex-1 min-w-0">
                  <p className="text-[13px] font-semibold text-[var(--text-primary)] truncate">{pb.title}</p>
                  <p className="text-[11px] text-[var(--text-muted)] truncate">
                    {pb.fileType.toUpperCase()} &middot; {formatBytes(pb.fileSize)}
                    {pb.uploadedBy && ` &middot; ${pb.uploadedBy.name}`}
                    {pb.status === "ACTIVE" && ` &middot; ${pb.ruleCount} rule${pb.ruleCount !== 1 ? "s" : ""}`}
                    {pb.status === "ACTIVE" && pb.exclusionCount > 0 && ` &middot; off for ${pb.exclusionCount} account${pb.exclusionCount !== 1 ? "s" : ""}`}
                  </p>
                </div>

                {/* Status chip */}
                <div
                  className="flex items-center gap-1 shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold border"
                  style={{ color: statusMeta.color, borderColor: `${statusMeta.color}40`, background: `${statusMeta.color}12` }}
                >
                  <StatusIcon className="h-3 w-3" />
                  {statusMeta.label}
                </div>

                {/* Actions menu */}
                {canUpload && pb.status !== "PROCESSING" && (
                  <div className="relative shrink-0">
                    <button
                      onClick={() => setOpenMenu(openMenu === pb.id ? null : pb.id)}
                      className="flex h-7 w-7 items-center justify-center rounded-lg hover:bg-[var(--bg-surface-2)] text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors"
                    >
                      <MoreVertical className="h-4 w-4" />
                    </button>
                    {openMenu === pb.id && (
                      <div className="absolute right-0 top-8 z-50 w-40 rounded-xl border border-[var(--glass-border)] bg-[var(--bg-surface-1)] shadow-lg py-1">
                        {pb.status === "ACTIVE" && (
                          <button
                            onClick={() => handleStatusChange(pb.id, "ARCHIVED")}
                            className="flex w-full items-center gap-2 px-3 py-2 text-[12px] text-[var(--text-secondary)] hover:bg-[var(--bg-surface-2)] transition-colors"
                          >
                            <Archive className="h-3.5 w-3.5" /> Archive
                          </button>
                        )}
                        {pb.status === "ARCHIVED" && (
                          <button
                            onClick={() => handleStatusChange(pb.id, "ACTIVE")}
                            className="flex w-full items-center gap-2 px-3 py-2 text-[12px] text-[var(--text-secondary)] hover:bg-[var(--bg-surface-2)] transition-colors"
                          >
                            <CheckCircle className="h-3.5 w-3.5" /> Restore
                          </button>
                        )}
                        <button
                          onClick={() => handleDelete(pb.id)}
                          className="flex w-full items-center gap-2 px-3 py-2 text-[12px] text-[#EF4444] hover:bg-[#EF4444]/10 transition-colors"
                        >
                          <Trash2 className="h-3.5 w-3.5" /> Delete
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      <p className="mt-3 text-[11px] text-[var(--text-muted)]">
        Active playbooks apply to all accounts automatically. Archived playbooks no longer influence recommendations.
      </p>

      {/* Rule Performance tab — MANAGER/ADMIN only */}
      {(role === "KAM" || role === "MANAGER" || role === "ADMIN") && (
        <div className="mt-5 pt-4 border-t border-[var(--border-subtle)]">
          <div className="flex items-center gap-2 mb-3">
            <BarChart2 className="h-3.5 w-3.5 text-[#0755E9]" />
            <h4 className="text-[13px] font-semibold text-[var(--text-primary)]">Rule Performance & Candidates</h4>
          </div>
          <RulePerformanceTab role={role} />
        </div>
      )}
    </SettingSection>
  );
}

// ─── Agent Orchestrator Section ──────────────────────────────────────────────

interface OrchestratorRun {
  trigger: string;
  status: string;
  totalLatencyMs: number;
  agentCount: number;
  failedAgents?: string[];
  failureReason?: string;
  createdAt: string;
}

type OrchestratorTrigger = "manual_full_refresh" | "daily_batch";

const TRIGGER_META: Record<OrchestratorTrigger, { label: string; description: string; color: string }> = {
  manual_full_refresh: { label: "Full Refresh", description: "Re-run recommendations for all accounts + quality scoring + crystallize patterns", color: "#0755E9" },
  daily_batch:         { label: "Daily Batch",  description: "Same as daily cron: rec orchestrator + rule quality scoring + fallback crystallizer", color: "#8B5CF6" },
};

function AgentOrchestratorSection({ role }: { role: string }) {
  const [runningTrigger, setRunningTrigger] = useState<OrchestratorTrigger | null>(null);
  const [lastRuns, setLastRuns] = useState<OrchestratorRun[]>([]);
  const [runsLoading, setRunsLoading] = useState(true);
  const [lastResult, setLastResult] = useState<{ trigger: string; status: string; agentCount: number } | null>(null);

  useEffect(() => {
    fetch("/api/activity-logs?action=orchestrator.run&limit=10", { headers: { "x-role": role } })
      .then((r) => r.json())
      .then((res) => {
        const logs = (res.data ?? []).map((l: { metadata?: OrchestratorRun; createdAt: string }) => ({
          ...((l.metadata as OrchestratorRun) ?? {}),
          createdAt: l.createdAt,
        }));
        setLastRuns(logs);
      })
      .catch(console.error)
      .finally(() => setRunsLoading(false));
  }, [role]);

  const handleTrigger = async (trigger: OrchestratorTrigger) => {
    setRunningTrigger(trigger);
    setLastResult(null);
    try {
      const res = await fetch("/api/ai/orchestrate", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-role": role },
        body: JSON.stringify({ trigger, context: {} }),
      });
      const json = await res.json();
      if (json.data) {
        setLastResult({
          trigger: json.data.trigger,
          status: json.data.status,
          agentCount: json.data.agentsRun?.length ?? 0,
        });
        setLastRuns((prev) => [{ ...json.data, agentCount: json.data.agentsRun?.length ?? 0, createdAt: new Date().toISOString() }, ...prev.slice(0, 9)]);
      }
    } catch (err) {
      console.error("[orchestrator] manual trigger failed:", err);
    } finally {
      setRunningTrigger(null);
    }
  };

  const canTrigger = role === "KAM" || role === "MANAGER" || role === "ADMIN";

  return (
    <div className="rounded-xl border border-[var(--glass-border)] bg-[var(--glass-bg)] [backdrop-filter:var(--glass-blur)] shadow-[var(--glass-shadow)] p-5 space-y-5">
      <div className="flex items-center gap-2.5">
        <Network className="h-4 w-4 text-[#0755E9]" />
        <h2 className="text-[14px] font-bold text-[var(--text-primary)]">Agent Orchestrator</h2>
        <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-[#0755E9]/10 text-[#0755E9]">MANAGER / ADMIN</span>
      </div>

      <p className="text-[12px] text-[var(--text-muted)]">
        The master orchestrator coordinates all agents in sequence. Trigger manually for on-demand runs, or let the daily cron handle it automatically.
      </p>

      {/* Manual trigger buttons */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {(Object.entries(TRIGGER_META) as [OrchestratorTrigger, typeof TRIGGER_META[OrchestratorTrigger]][]).map(([trigger, meta]) => (
          <button
            key={trigger}
            onClick={() => handleTrigger(trigger)}
            disabled={!canTrigger || !!runningTrigger}
            className={cn(
              "flex flex-col items-start gap-1 rounded-xl border p-3.5 text-left transition-all disabled:opacity-50",
              "hover:border-[var(--border-default)] hover:bg-[var(--bg-surface-2)]",
              "border-[var(--border-subtle)] bg-[var(--bg-surface-2)]",
            )}
          >
            <div className="flex items-center gap-2 w-full">
              <div className="h-7 w-7 rounded-lg flex items-center justify-center shrink-0" style={{ background: `${meta.color}18` }}>
                {runningTrigger === trigger
                  ? <Loader2 className="h-3.5 w-3.5 animate-spin" style={{ color: meta.color }} />
                  : <Zap className="h-3.5 w-3.5" style={{ color: meta.color }} />
                }
              </div>
              <span className="text-[13px] font-semibold text-[var(--text-primary)]">{meta.label}</span>
            </div>
            <p className="text-[11px] text-[var(--text-muted)] pl-9">{meta.description}</p>
          </button>
        ))}
      </div>

      {!canTrigger && (
        <p className="text-[11px] text-[var(--text-muted)] italic">Read-only: only Manager or Admin can trigger orchestrator runs.</p>
      )}

      {lastResult && (
        <div className={cn(
          "flex items-center gap-2 rounded-lg px-3 py-2 text-[12px] font-medium border",
          lastResult.status === "completed"
            ? "bg-[#22C55E]/08 border-[#22C55E]/30 text-[#22C55E]"
            : lastResult.status === "partial"
            ? "bg-[#F59E0B]/08 border-[#F59E0B]/30 text-[#F59E0B]"
            : "bg-[#EF4444]/08 border-[#EF4444]/30 text-[#EF4444]",
        )} style={lastResult.status === "completed" ? { background: "rgba(34,197,94,0.08)" } : lastResult.status === "partial" ? { background: "rgba(245,158,11,0.08)" } : { background: "rgba(239,68,68,0.08)" }}>
          {lastResult.status === "completed" ? <CheckCircle className="h-4 w-4 shrink-0" /> : <AlertTriangle className="h-4 w-4 shrink-0" />}
          {TRIGGER_META[lastResult.trigger as OrchestratorTrigger]?.label ?? lastResult.trigger} completed ({lastResult.status}) &middot; {lastResult.agentCount} agent{lastResult.agentCount !== 1 ? "s" : ""} run
        </div>
      )}

      {/* Recent run history */}
      {!runsLoading && lastRuns.length > 0 && (
        <div>
          <p className="text-[11px] font-semibold text-[var(--text-muted)] uppercase tracking-wider mb-2">Recent Runs</p>
          <div className="space-y-1">
            {lastRuns.slice(0, 5).map((run, i) => (
              <div key={i} className="flex items-center gap-3 rounded-lg bg-[var(--bg-surface-2)] px-3 py-2">
                <div className={cn(
                  "h-2 w-2 rounded-full shrink-0",
                  run.status === "completed" ? "bg-[#22C55E]" : run.status === "partial" ? "bg-[#F59E0B]" : "bg-[#EF4444]",
                )} />
                <span className="text-[12px] text-[var(--text-secondary)] flex-1 truncate">
                  {run.trigger ?? "unknown"} &middot; {run.agentCount ?? "?"} agents
                </span>
                <span className="text-[10px] text-[var(--text-muted)] shrink-0">
                  {run.totalLatencyMs ? `${(run.totalLatencyMs / 1000).toFixed(1)}s` : "—"}
                </span>
                <span className="text-[10px] text-[var(--text-muted)] shrink-0">
                  {run.createdAt ? new Date(run.createdAt).toLocaleTimeString() : ""}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Rule Performance Section (inside Playbooks) ──────────────────────────────

interface RulePerf {
  id: string;
  category: string;
  condition: string;
  qualityScore: number | null;
  dismissCount: number;
  actionCount: number;
  qualityNote: { summary?: string; suggestions?: string[]; flag?: string } | null;
  playbook: { title: string };
}

interface RuleCandidate {
  id: string;
  title: string;
  category: string;
  condition: string;
  recommendation: string;
  sourceCount: number;
  confidence: number | null;
  status: string;
}

function RulePerformanceTab({ role }: { role: string }) {
  const [rules, setRules] = useState<RulePerf[]>([]);
  const [candidates, setCandidates] = useState<RuleCandidate[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedRule, setExpandedRule] = useState<string | null>(null);
  const [promoting, setPromoting] = useState<string | null>(null);
  const [dismissingCand, setDismissingCand] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([
      fetch("/api/playbooks/rules-performance", { headers: { "x-role": role } }).then((r) => r.json()),
      fetch("/api/rule-candidates?status=PENDING", { headers: { "x-role": role } }).then((r) => r.json()),
    ]).then(([rulesRes, candRes]) => {
      setRules(rulesRes.data ?? []);
      setCandidates(candRes.data ?? []);
    }).catch(console.error).finally(() => setLoading(false));
  }, [role]);

  const handlePromote = async (candidateId: string) => {
    setPromoting(candidateId);
    try {
      await fetch(`/api/rule-candidates/${candidateId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", "x-role": role },
        body: JSON.stringify({ action: "promote" }),
      });
      setCandidates((prev) => prev.filter((c) => c.id !== candidateId));
    } catch { /* noop */ } finally {
      setPromoting(null);
    }
  };

  const handleDismissCandidate = async (candidateId: string) => {
    setDismissingCand(candidateId);
    try {
      await fetch(`/api/rule-candidates/${candidateId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", "x-role": role },
        body: JSON.stringify({ action: "dismiss" }),
      });
      setCandidates((prev) => prev.filter((c) => c.id !== candidateId));
    } catch { /* noop */ } finally {
      setDismissingCand(null);
    }
  };

  if (loading) return <div className="h-20 rounded-lg bg-[var(--bg-surface-2)] animate-pulse" />;

  return (
    <div className="space-y-5">
      {/* Rule Candidates */}
      {candidates.length > 0 && (
        <div>
          <div className="flex items-center gap-2 mb-3">
            <Star className="h-3.5 w-3.5 text-[#F59E0B]" />
            <h4 className="text-[13px] font-semibold text-[var(--text-primary)]">Rule Candidates</h4>
            <span className="text-[10px] bg-[#F59E0B]/15 text-[#F59E0B] px-1.5 py-0.5 rounded-full font-semibold">{candidates.length} pending</span>
          </div>
          <p className="text-[11px] text-[var(--text-muted)] mb-3">
            These patterns were discovered from AI fallback recommendations actioned across 3+ accounts. Promote them to add as real playbook rules.
          </p>
          <div className="space-y-2">
            {candidates.map((c) => (
              <div key={c.id} className="rounded-lg border border-[#F59E0B]/30 bg-[#F59E0B]/04 p-3" style={{ background: "rgba(245,158,11,0.04)" }}>
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <p className="text-[12px] font-semibold text-[var(--text-primary)]">{c.title}</p>
                    <div className="flex items-center gap-2 mt-1">
                      <span className="text-[10px] bg-[#F59E0B]/15 text-[#F59E0B] px-1.5 py-0.5 rounded-full font-medium">{c.category}</span>
                      <span className="text-[10px] text-[var(--text-muted)]">{c.sourceCount} accounts</span>
                      {c.confidence && <span className="text-[10px] text-[var(--text-muted)]">{(c.confidence * 100).toFixed(0)}% confidence</span>}
                    </div>
                    <p className="text-[11px] text-[var(--text-muted)] mt-1.5 line-clamp-2">{c.condition}</p>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <button
                      onClick={() => handlePromote(c.id)}
                      disabled={!!promoting}
                      className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[11px] font-semibold text-white bg-[#22C55E] hover:bg-[#16A34A] transition-colors disabled:opacity-50"
                    >
                      {promoting === c.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <CheckCircle className="h-3 w-3" />}
                      Promote
                    </button>
                    <button
                      onClick={() => handleDismissCandidate(c.id)}
                      disabled={!!dismissingCand}
                      className="p-1.5 rounded-lg text-[var(--text-muted)] hover:text-[#EF4444] hover:bg-[#EF4444]/08 transition-colors"
                    >
                      <XCircle className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Rule Quality Scores */}
      <div>
        <div className="flex items-center gap-2 mb-3">
          <BarChart2 className="h-3.5 w-3.5 text-[#0755E9]" />
          <h4 className="text-[13px] font-semibold text-[var(--text-primary)]">Rule Performance</h4>
        </div>
        {rules.length === 0 ? (
          <p className="text-[12px] text-[var(--text-muted)] italic">No rules have enough feedback data yet (minimum 5 signals per rule).</p>
        ) : (
          <div className="space-y-2">
            {rules.map((rule) => {
              const total = rule.actionCount + rule.dismissCount;
              const rate = total > 0 ? rule.actionCount / total : null;
              const isLowQuality = rule.qualityNote?.flag === "LOW_QUALITY";
              const isExpanded = expandedRule === rule.id;

              return (
                <div key={rule.id} className={cn("rounded-lg border overflow-hidden", isLowQuality ? "border-[#F59E0B]/40" : "border-[var(--border-subtle)]")}>
                  <button
                    onClick={() => setExpandedRule(isExpanded ? null : rule.id)}
                    className="w-full flex items-center gap-3 px-3 py-2.5 text-left hover:bg-[var(--bg-surface-2)] transition-colors"
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] font-semibold text-[var(--text-muted)] uppercase">{rule.category}</span>
                        <span className="text-[10px] text-[var(--text-muted)] truncate">{rule.playbook.title}</span>
                        {isLowQuality && (
                          <span className="flex items-center gap-0.5 text-[10px] font-semibold text-[#F59E0B]">
                            <AlertTriangle className="h-2.5 w-2.5" /> Review recommended
                          </span>
                        )}
                      </div>
                      <p className="text-[12px] text-[var(--text-primary)] truncate mt-0.5">{rule.condition.slice(0, 80)}...</p>
                    </div>
                    {/* Success bar */}
                    <div className="flex items-center gap-2 shrink-0">
                      {rule.qualityScore !== null ? (
                        <div className="flex items-center gap-1.5">
                          <div className="w-16 h-1.5 rounded-full bg-[var(--bg-surface-3)] overflow-hidden">
                            <div
                              className="h-full rounded-full"
                              style={{
                                width: `${rule.qualityScore}%`,
                                background: rule.qualityScore >= 60 ? "#22C55E" : rule.qualityScore >= 30 ? "#F59E0B" : "#EF4444",
                              }}
                            />
                          </div>
                          <span className="text-[11px] font-semibold text-[var(--text-primary)]">{rule.qualityScore}%</span>
                        </div>
                      ) : (
                        <span className="text-[10px] text-[var(--text-muted)]">no data</span>
                      )}
                      <span className="text-[10px] text-[var(--text-muted)]">{total} signals</span>
                      {isExpanded ? <ChevronUp className="h-3.5 w-3.5 text-[var(--text-muted)]" /> : <ChevronDown className="h-3.5 w-3.5 text-[var(--text-muted)]" />}
                    </div>
                  </button>

                  {isExpanded && rule.qualityNote && (
                    <div className="px-3 pb-3 pt-2 border-t border-[var(--border-subtle)] space-y-2.5">
                      <div className="grid grid-cols-3 gap-2 text-center">
                        <div className="rounded-lg bg-[var(--bg-surface-2)] p-2">
                          <p className="text-[16px] font-bold text-[#22C55E]">{rule.actionCount}</p>
                          <p className="text-[10px] text-[var(--text-muted)]">Actioned</p>
                        </div>
                        <div className="rounded-lg bg-[var(--bg-surface-2)] p-2">
                          <p className="text-[16px] font-bold text-[#EF4444]">{rule.dismissCount}</p>
                          <p className="text-[10px] text-[var(--text-muted)]">Dismissed</p>
                        </div>
                        <div className="rounded-lg bg-[var(--bg-surface-2)] p-2">
                          <p className="text-[16px] font-bold text-[var(--text-primary)]">
                            {rate !== null ? `${(rate * 100).toFixed(0)}%` : "—"}
                          </p>
                          <p className="text-[10px] text-[var(--text-muted)]">Success</p>
                        </div>
                      </div>
                      {rule.qualityNote.summary && (
                        <p className="text-[12px] text-[var(--text-secondary)]">{rule.qualityNote.summary}</p>
                      )}
                      {rule.qualityNote.suggestions && rule.qualityNote.suggestions.length > 0 && (
                        <div>
                          <p className="text-[11px] font-semibold text-[var(--text-muted)] mb-1">Improvement Suggestions</p>
                          <ul className="space-y-1">
                            {rule.qualityNote.suggestions.map((s, i) => (
                              <li key={i} className="text-[11px] text-[var(--text-secondary)] flex items-start gap-1.5">
                                <span className="text-[#0755E9] mt-0.5 shrink-0">•</span>{s}
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

export default function SettingsPage() {
  const { role, userId } = useRole();
  const [settings, setSettings]   = useState<AppSettings | null>(null);
  const [loading, setLoading]     = useState(true);
  const [resetting, setResetting] = useState(false);
  const [resetDone, setResetDone] = useState(false);
  const [team, setTeam]           = useState<TeamUser[]>([]);
  const [teamLoading, setTeamLoading] = useState(false);
  const [editingRole, setEditingRole] = useState<string | null>(null);

  const canViewTeam = role === "KAM" || role === "MANAGER" || role === "ADMIN";

  useEffect(() => {
    fetch("/api/settings", { headers: { "x-role": role } })
      .then((r) => r.json())
      .then((res) => setSettings(res.data))
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [role]);

  useEffect(() => {
    if (!canViewTeam) return;
    setTeamLoading(true);
    fetch("/api/users", { headers: { "x-role": role } })
      .then((r) => r.json())
      .then((j) => setTeam(j.data?.users ?? []))
      .catch(console.error)
      .finally(() => setTeamLoading(false));
  }, [role, canViewTeam]);

  const handleRoleChange = async (userId: string, newRole: string) => {
    setEditingRole(userId);
    try {
      const res = await fetch(`/api/users/${userId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", "x-role": role },
        body: JSON.stringify({ role: newRole }),
      });
      const json = await res.json();
      if (json.data) {
        setTeam((prev) => prev.map((u) => u.id === userId ? { ...u, role: json.data.role } : u));
      }
    } finally {
      setEditingRole(null);
    }
  };

  const handleReset = async () => {
    if (!confirm("Reset demo data? This will re-seed all accounts, signals, and actions.")) return;
    setResetting(true);
    try {
      const res = await fetch("/api/admin", { method: "POST", headers: { "x-role": role } });
      if (res.ok) {
        setResetDone(true);
        setTimeout(() => setResetDone(false), 3000);
      }
    } finally {
      setResetting(false);
    }
  };

  const AI_PROVIDERS = [
    { key: "gemini", label: "Google Gemini",    model: "gemini-2.0-flash",     note: "Active (POC)" },
    { key: "openai", label: "OpenAI GPT-4o",    model: "gpt-4o",               note: "Production ready" },
    { key: "claude", label: "Anthropic Claude", model: "claude-3-5-sonnet",    note: "Production ready" },
  ];

  return (
    <div className="space-y-5 max-w-3xl">
      {/* Header */}
      <div>
        <h1 className="text-[20px] font-bold text-[var(--text-primary)] tracking-[-0.02em]">Settings</h1>
        <p className="text-[13px] text-[var(--text-muted)] mt-0.5">
          AI provider, adapter configuration, score weights, and demo controls
        </p>
      </div>

      {/* Score Weights */}
      <SettingSection title="KAM Score Weights" icon={SlidersHorizontal} iconColor="#0755E9">
        <p className="text-[12px] text-[var(--text-muted)] mb-4">
          Configure how much each of the 8 KPI dimensions contributes to the overall KAM Score.
          Weights must sum to exactly 100%. Changes take effect on the next score computation.
        </p>
        {loading ? (
          <p className="text-[12px] text-[var(--text-muted)]">Loading…</p>
        ) : (
          <ScoreWeightsPanel
            role={role}
            initialWeights={settings?.scoreWeights ?? DEFAULT_WEIGHTS}
          />
        )}
      </SettingSection>

      {/* Playbooks */}
      <SettingSection title="Playbooks" icon={BookOpen} iconColor="#0755E9">
        <PlaybookLibrary role={role} userId={userId} />
      </SettingSection>

      {/* Notification Preferences */}
      <SettingSection title="Notification Preferences" icon={Bell} iconColor="#0755E9">
        <p className="text-[12px] text-[var(--text-muted)] mb-4">
          Control which events trigger alerts, delivery channels, and how frequently notifications are batched.
        </p>
        {loading ? (
          <p className="text-[12px] text-[var(--text-muted)]">Loading…</p>
        ) : (
          <NotificationPrefsPanel
            role={role}
            initialPrefs={settings?.notificationPrefs ?? DEFAULT_NOTIFICATION_PREFS}
          />
        )}
      </SettingSection>

      {/* AI Configuration */}
      <SettingSection title="AI Provider" icon={Brain} iconColor="#8B5CF6">
        <div className="space-y-1">
          {AI_PROVIDERS.map((p) => {
            const isActive = settings?.aiProvider === p.key;
            return (
              <div
                key={p.key}
                className={cn(
                  "flex items-center justify-between p-3 rounded-lg border transition-all",
                  isActive
                    ? "border-[#8B5CF6]/30 bg-[#8B5CF6]/5"
                    : "border-[var(--border-subtle)] bg-transparent opacity-60"
                )}
              >
                <div>
                  <div className="flex items-center gap-2">
                    <p className="text-[13px] font-medium text-[var(--text-primary)]">{p.label}</p>
                    {isActive && (
                      <span className="flex items-center gap-0.5 text-[10px] text-[#8B5CF6] font-semibold">
                        <Check className="h-3 w-3" /> Active
                      </span>
                    )}
                  </div>
                  <p className="text-[11px] text-[var(--text-muted)]">{p.model} · {p.note}</p>
                </div>
                <span className="text-[11px] font-mono text-[var(--text-muted)] bg-[var(--bg-surface-2)] px-2 py-0.5 rounded border border-[var(--border-subtle)]">
                  {p.key}
                </span>
              </div>
            );
          })}
        </div>
        <p className="text-[11px] text-[var(--text-muted)] mt-3">
          Set <code className="text-[#8B5CF6] bg-[#8B5CF6]/8 px-1 rounded">AI_PROVIDER</code> in{" "}
          <code className="text-[#8B5CF6] bg-[#8B5CF6]/8 px-1 rounded">.env</code> to switch providers.
          API keys for the active provider must be configured.
        </p>
      </SettingSection>

      {/* Adapters */}
      <SettingSection title="Data Adapters" icon={Zap} iconColor="#F59E0B">
        {loading ? (
          <p className="text-[12px] text-[var(--text-muted)]">Loading…</p>
        ) : (
          <div>
            {[
              { name: "Salesforce CRM",      key: "SALESFORCE", mode: settings?.adapterMode ?? "mock" },
              { name: "Jira / ServiceDesk",  key: "JIRA",       mode: settings?.adapterMode ?? "mock" },
              { name: "Worksphere (MAU/NPS)",key: "WORKSPHERE", mode: settings?.adapterMode ?? "mock" },
              { name: "Finance / Billing",   key: "FINANCE",    mode: settings?.adapterMode ?? "mock" },
            ].map((adapter) => (
              <div key={adapter.key} className="flex items-center justify-between py-2.5 border-b border-[var(--border-subtle)] last:border-0">
                <div>
                  <p className="text-[13px] font-medium text-[var(--text-primary)]">{adapter.name}</p>
                  <p className="text-[11px] text-[var(--text-muted)]">
                    Set <code className="text-[#F59E0B] bg-[#F59E0B]/8 px-1 rounded">{adapter.key}_MODE=live</code> for real data
                  </p>
                </div>
                <span className={cn(
                  "text-[11px] font-semibold px-2 py-0.5 rounded border",
                  adapter.mode === "mock"
                    ? "text-[#F59E0B] bg-[#F59E0B]/10 border-[#F59E0B]/30"
                    : "text-[#22C55E] bg-[#22C55E]/10 border-[#22C55E]/30"
                )}>
                  {adapter.mode === "mock" ? "Mock" : "Live"}
                </span>
              </div>
            ))}
          </div>
        )}
      </SettingSection>

      {/* System info */}
      <SettingSection title="System" icon={Server} iconColor="#6B7280">
        {loading ? (
          <p className="text-[12px] text-[var(--text-muted)]">Loading…</p>
        ) : settings ? (
          <>
            <SettingRow
              label="Database"
              value={settings.dbConnected ? "Connected" : "Disconnected"}
              description="MySQL 8 via Prisma ORM"
              badge={
                <div className={cn(
                  "h-2 w-2 rounded-full",
                  settings.dbConnected ? "bg-[#22C55E]" : "bg-[#EF4444]"
                )} />
              }
            />
            <SettingRow
              label="Environment"
              value={settings.nodeEnv}
              description="NODE_ENV"
            />
            <SettingRow
              label="App URL"
              value={settings.appUrl}
              description="NEXT_PUBLIC_APP_URL"
            />
          </>
        ) : (
          <p className="text-[12px] text-[var(--text-muted)]">Could not load settings</p>
        )}
      </SettingSection>

      {/* Team */}
      {canViewTeam && (
        <SettingSection title="Team" icon={Users} iconColor="#0755E9">
          <p className="text-[12px] text-[var(--text-muted)] mb-4">
            View and manage team members. Admins can change product role labels and access.
          </p>
          {teamLoading ? (
            <div className="space-y-2">
              {[...Array(4)].map((_, i) => (
                <div key={i} className="h-10 rounded-lg bg-[var(--bg-surface-2)] animate-pulse" />
              ))}
            </div>
          ) : team.length === 0 ? (
            <p className="text-[12px] text-[var(--text-muted)]">No team members found.</p>
          ) : (
            <div className="space-y-2">
              {team.map((user) => {
                const color = ROLE_COLORS[user.role] ?? "#6B7280";
                return (
                  <div
                    key={user.id}
                    className="flex items-center gap-3 rounded-xl border border-[var(--border-subtle)] p-3 bg-[var(--bg-surface-1)]"
                  >
                    {/* Avatar */}
                    <div
                      className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[11px] font-bold text-white"
                      style={{ background: color }}
                    >
                      {avatarInitials(user.name)}
                    </div>
                    {/* Info */}
                    <div className="flex-1 min-w-0">
                      <p className="text-[13px] font-semibold text-[var(--text-primary)] truncate">{user.name}</p>
                      <p className="text-[11px] text-[var(--text-muted)] truncate">{user.email}</p>
                    </div>
                    {/* Account count */}
                    <span className="hidden sm:block text-[11px] text-[var(--text-muted)] shrink-0">
                      {user._count.managedAccounts} account{user._count.managedAccounts !== 1 ? "s" : ""}
                    </span>
                    {/* Role badge / changer */}
                    {role === "ADMIN" ? (
                      <div className="relative shrink-0">
                        <select
                          value={user.role}
                          disabled={editingRole === user.id}
                          onChange={(e) => handleRoleChange(user.id, e.target.value)}
                          className="appearance-none pl-3 pr-7 py-1 text-[11px] font-semibold rounded-full border outline-none cursor-pointer"
                          style={{ color, borderColor: `${color}40`, background: `${color}10` }}
                        >
                          {["KAM", "MANAGER", "EXECUTIVE", "ADMIN"].map((r) => (
                            <option key={r} value={r}>{ROLE_LABELS[r]}</option>
                          ))}
                        </select>
                        <ChevronDown className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 h-3 w-3" style={{ color }} />
                      </div>
                    ) : (
                      <span
                        className="shrink-0 rounded-full px-2.5 py-0.5 text-[10px] font-semibold border"
                        style={{ color, borderColor: `${color}40`, background: `${color}10` }}
                      >
                        {ROLE_LABELS[user.role] ?? user.role}
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          )}
          <div className="mt-3 p-3 rounded-lg bg-[var(--bg-surface-2)] border border-[var(--border-subtle)]">
            <div className="flex items-center gap-2">
              <Shield className="h-3.5 w-3.5 text-[var(--text-muted)]" />
              <p className="text-[11px] text-[var(--text-muted)]">
                Full user creation and deletion requires Admin access. Contact your system administrator.
              </p>
            </div>
          </div>
        </SettingSection>
      )}

      {/* Playbooks */}
      <PlaybooksSection role={role} />

      {/* Agent Orchestrator — MANAGER / ADMIN */}
      {(role === "KAM" || role === "MANAGER" || role === "ADMIN") && (
        <AgentOrchestratorSection role={role} />
      )}

      {/* Demo Controls */}
      <SettingSection title="Demo Controls" icon={RefreshCw} iconColor="#8B5CF6">
        <p className="text-[12px] text-[var(--text-muted)] mb-4">
          Reset all demo data to the original seed state. This is non-destructive for the schema —
          only row data is affected.
        </p>
        <button
          onClick={handleReset}
          disabled={resetting || resetDone}
          className={cn(
            "flex items-center gap-2 px-4 py-2 rounded-lg text-[13px] font-medium transition-all",
            resetDone
              ? "bg-[#22C55E]/15 text-[#22C55E] border border-[#22C55E]/30"
              : "bg-[#8B5CF6]/15 text-[#8B5CF6] border border-[#8B5CF6]/30 hover:bg-[#8B5CF6]/25"
          )}
        >
          {resetting ? (
            <><RefreshCw className="h-4 w-4 animate-spin" /> Resetting…</>
          ) : resetDone ? (
            <><Check className="h-4 w-4" /> Reset complete</>
          ) : (
            <><RefreshCw className="h-4 w-4" /> Reset Demo Data</>
          )}
        </button>
      </SettingSection>
    </div>
  );
}

"use client";

import { useState, useEffect } from "react";
import { Brain, Zap, Check, RefreshCw, Server, SlidersHorizontal, AlertCircle, Save, Bell, Mail, Monitor, ChevronDown, Users, Shield, Plus } from "lucide-react";
import { useRole } from "@/context/RoleContext";
import { cn } from "@/lib/utils";

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
  const canEdit = role === "MANAGER" || role === "EXECUTIVE";
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
  const canEdit = role === "MANAGER" || role === "EXECUTIVE";
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

export default function SettingsPage() {
  const { role } = useRole();
  const [settings, setSettings]   = useState<AppSettings | null>(null);
  const [loading, setLoading]     = useState(true);
  const [resetting, setResetting] = useState(false);
  const [resetDone, setResetDone] = useState(false);
  const [team, setTeam]           = useState<TeamUser[]>([]);
  const [teamLoading, setTeamLoading] = useState(false);
  const [editingRole, setEditingRole] = useState<string | null>(null);

  const canViewTeam = role === "MANAGER" || role === "ADMIN";

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

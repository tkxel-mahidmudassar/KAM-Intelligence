"use client";

import { useEffect, useMemo, useState } from "react";
import { Archive, Bell, FileText, Link2, Music2, ShieldAlert, Trash2, Upload, UserPlus } from "lucide-react";
import { defaultKpiWeights, integrationMocks } from "@/lib/v2/workspaceData";
import { useAccountCache } from "@/context/AccountCacheContext";
import { useNotifications } from "@/context/NotificationContext";
import { useRole } from "@/context/RoleContext";
import type { Role } from "@/types";
import { isAmbientMusicMuted, setAmbientMusicMuted } from "@/lib/client/ambientMusic";

type SettingsWeight = { id: string; name: string; weight: number };
type TeamUser = {
  id: string;
  name: string;
  email: string;
  role: Role;
  managerId?: string | null;
  _count?: { managedAccounts?: number };
};
type PlaybookRow = {
  id: string;
  title: string;
  fileType: string;
  uploadedAt: string;
  uploadedBy: string;
  status: string;
  ruleCount: number;
  processingError?: string | null;
};

const scoreKeyBySettingId: Record<string, string> = {
  relationship: "relationship",
  "contract-health": "contractHealth",
  "customer-success": "csat",
  risk: "risk",
  "resource-health": "resourceHealth",
  "project-health": "projectHealth",
  "financial-health": "financial",
  whitespace: "whitespace",
};

const settingIdByScoreKey = Object.fromEntries(Object.entries(scoreKeyBySettingId).map(([id, key]) => [key, id]));

function userHeaders(role: Role, userId: string | null) {
  return {
    "x-role": role,
    ...(userId ? { "x-user-id": userId } : {}),
  };
}

function toSettingsWeights(scoreWeights: Record<string, number>): SettingsWeight[] {
  return defaultKpiWeights.map((item) => ({
    ...item,
    weight: scoreWeights[scoreKeyBySettingId[item.id]] ?? item.weight,
  }));
}

function toScoreWeights(weights: SettingsWeight[]) {
  return weights.reduce<Record<string, number>>((acc, item) => {
    acc[scoreKeyBySettingId[item.id] ?? item.id] = item.weight;
    return acc;
  }, {});
}

function accountName(account: Record<string, unknown>) {
  return String(account.name ?? "Account");
}

const auditEvents = [
  { actor: "Sarah Chen", action: "Default KPI weights saved", when: "Today, 10:12 AM", source: "Settings" },
  { actor: "Aisha Khan", action: "NovaGrid account creation submitted", when: "Today, 9:44 AM", source: "Portfolio" },
  { actor: "T Man", action: "Project Health Score playbook parsed", when: "Yesterday, 4:18 PM", source: "Playbooks" },
  { actor: "Omar Farooq", action: "Maersk recovery plan task dismissed with reason", when: "Jun 7, 2:02 PM", source: "Account journey" },
];

export function SettingsPage() {
  const { role, userId, userName } = useRole();
  const { accounts, refreshAccounts, upsertAccount } = useAccountCache();
  const { fireNotification } = useNotifications();
  const [weights, setWeights] = useState<SettingsWeight[]>(defaultKpiWeights);
  const [team, setTeam] = useState<TeamUser[]>([]);
  const [newUser, setNewUser] = useState({ name: "", email: "", role: "ASSOCIATE" as Role, initialPassword: "" });
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [savingWeights, setSavingWeights] = useState(false);
  const [allocationSaving, setAllocationSaving] = useState<Record<string, boolean>>({});
  const [integrationStatuses, setIntegrationStatuses] = useState<Record<string, "connected" | "needs setup">>(
    Object.fromEntries(integrationMocks.map((name, index) => [name, index < 2 ? "connected" : "needs setup"])),
  );
  const [playbooks, setPlaybooks] = useState<PlaybookRow[]>([]);
  const [showArchived, setShowArchived] = useState(false);
  const [playbookUploading, setPlaybookUploading] = useState(false);
  const [jingleMuted, setJingleMuted] = useState(false);
  const [ambientMusicMuted, setAmbientMusicMutedState] = useState(false);

  const canAccessSettings = role === "KAM" || role === "EXECUTIVE" || role === "ADMIN";
  const associates = useMemo(() => team.filter((user) => user.role === "ASSOCIATE"), [team]);
  const kams = useMemo(() => team.filter((user) => user.role === "KAM"), [team]);
  const totalWeight = useMemo(() => weights.reduce((sum, item) => sum + item.weight, 0), [weights]);
  const allocatedCount = useMemo(() => accounts.filter((account) => {
    const associateOwner = account.associateOwner as { id?: string } | undefined;
    return Boolean(associateOwner?.id);
  }).length, [accounts]);
  const connectedIntegrations = useMemo(() => Object.values(integrationStatuses).filter((item) => item === "connected").length, [integrationStatuses]);
  const canSaveWeights = totalWeight === 100 && !savingWeights;
  const inviteRoleOptions = role === "EXECUTIVE" ? ["KAM"] : ["ASSOCIATE", "KAM", "EXECUTIVE", "ADMIN"];

  useEffect(() => {
    if (!canAccessSettings || !userId) return;
    let cancelled = false;

    async function loadSettings() {
      setLoading(true);
      setError("");
      try {
        const headers = userHeaders(role, userId);
        const [settingsResponse, usersResponse, playbooksResponse] = await Promise.all([
          fetch("/api/settings", { headers }),
          fetch("/api/users", { headers }),
          fetch(`/api/playbooks?includeArchived=${showArchived ? "true" : "false"}`, { headers }),
        ]);
        const settingsPayload = await settingsResponse.json();
        const usersPayload = await usersResponse.json();
        const playbooksPayload = await playbooksResponse.json();
        if (!settingsResponse.ok) throw new Error(settingsPayload.error || "Settings could not be loaded");
        if (!usersResponse.ok) throw new Error(usersPayload.error || "Users could not be loaded");
        if (!playbooksResponse.ok) throw new Error(playbooksPayload.error || "Playbooks could not be loaded");
        if (cancelled) return;
        setWeights(toSettingsWeights(settingsPayload.data.scoreWeights ?? {}));
        if (settingsPayload.data.integrationSettings && typeof settingsPayload.data.integrationSettings === "object") {
          setIntegrationStatuses(settingsPayload.data.integrationSettings as Record<string, "connected" | "needs setup">);
        }
        setTeam((usersPayload.data?.users ?? []) as TeamUser[]);
        setPlaybooks((playbooksPayload.data ?? []) as PlaybookRow[]);
      } catch (loadError) {
        if (!cancelled) setError(loadError instanceof Error ? loadError.message : "Settings could not be loaded");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void loadSettings();
    void refreshAccounts();
    return () => {
      cancelled = true;
    };
  }, [canAccessSettings, refreshAccounts, role, showArchived, userId]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    setJingleMuted((window.localStorage.getItem("kamazing:login-jingle-muted") ?? window.localStorage.getItem("dotkam:login-jingle-muted")) === "true");
    setAmbientMusicMutedState(isAmbientMusicMuted());
  }, []);

  if (!canAccessSettings) {
    return (
      <main className="min-h-screen px-5 py-5">
        <section className="mx-auto flex min-h-[calc(100vh-7rem)] max-w-[1500px] items-center justify-center">
          <div className="w-full max-w-xl rounded-[30px] border border-[#E4D5C4] bg-[#FFF9EF] p-6 text-center shadow-[0_24px_70px_-58px_rgba(32,38,32,0.58)]">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl border border-[#EAB3A9] bg-[#FFF1EE] text-[#A63F33]">
              <ShieldAlert className="h-6 w-6" />
            </div>
            <p className="mt-4 text-sm font-black uppercase tracking-[0.18em] text-[#A63F33]">403 Access denied</p>
            <h1 className="mt-2 text-3xl font-black tracking-[-0.05em] text-[#25352E]">Settings are restricted</h1>
            <p className="mt-3 text-[14px] font-bold leading-relaxed text-[#75685A]">
              Settings are available only to KAM, C-Level, and Admin users. Your current role is {role}.
            </p>
          </div>
        </section>
      </main>
    );
  }

  function updateWeight(id: string, value: number) {
    setWeights((current) => current.map((item) => (item.id === id ? { ...item, weight: value } : item)));
  }

  async function saveWeights() {
    if (!canSaveWeights) return;
    setSavingWeights(true);
    setError("");
    setStatus("");
    try {
      const response = await fetch("/api/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json", ...userHeaders(role, userId) },
        body: JSON.stringify({ scoreWeights: toScoreWeights(weights) }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Weights could not be saved");
      setWeights(toSettingsWeights(payload.data.scoreWeights ?? {}));
      setStatus("Default KPI weights saved to the database.");
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Weights could not be saved");
    } finally {
      setSavingWeights(false);
    }
  }

  async function createUser() {
    const name = newUser.name.trim() || newUser.email.split("@")[0]?.replace(/[._-]+/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase()).trim();
    if (!name || !newUser.email.trim() || !newUser.initialPassword.trim()) {
      setError("Name, email, and initial password are required.");
      return;
    }
    setError("");
    setStatus("");
    try {
      const response = await fetch("/api/users", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...userHeaders(role, userId) },
        body: JSON.stringify({
          name,
          email: newUser.email,
          role: newUser.role,
          initialPassword: newUser.initialPassword,
          managerId: newUser.role === "ASSOCIATE" ? userId : null,
        }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "User could not be created");
      setTeam((current) => [payload.data as TeamUser, ...current]);
      setNewUser({ name: "", email: "", role: "ASSOCIATE", initialPassword: "" });
      setStatus(`${name} was added with an initial password.`);
      fireNotification({
        id: `user-created-${payload.data.id}`,
        title: "User added",
        detail: `${name} can now sign in and be assigned accounts.`,
        href: "/settings",
        source: "settings",
        severity: "info",
      });
    } catch (createError) {
      setError(createError instanceof Error ? createError.message : "User could not be created");
    }
  }

  async function deleteUser(user: TeamUser) {
    setError("");
    setStatus("");
    try {
      const response = await fetch(`/api/users/${user.id}`, {
        method: "DELETE",
        headers: userHeaders(role, userId),
      });
      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        throw new Error(payload.error || "User could not be removed");
      }
      setTeam((current) => current.filter((item) => item.id !== user.id));
      setStatus(`${user.name} was removed from the database.`);
      void refreshAccounts();
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : "User could not be removed");
    }
  }

  async function updateAllocation(account: Record<string, unknown>, associateOwnerId: string) {
    const accountId = String(account.id ?? "");
    if (!accountId) return;
    setAllocationSaving((current) => ({ ...current, [accountId]: true }));
    setError("");
    setStatus("");
    try {
      const response = await fetch(`/api/accounts/${accountId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", ...userHeaders(role, userId) },
        body: JSON.stringify({ associateOwnerId: associateOwnerId || null }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Allocation could not be saved");
      upsertAccount(payload.data as Record<string, unknown>);
      const associate = associates.find((item) => item.id === associateOwnerId);
      setStatus(`${accountName(account)} is now ${associate ? `allocated to ${associate.name}` : "unallocated"}.`);
    } catch (allocationError) {
      setError(allocationError instanceof Error ? allocationError.message : "Allocation could not be saved");
    } finally {
      setAllocationSaving((current) => ({ ...current, [accountId]: false }));
    }
  }

  async function toggleIntegration(name: string) {
    const nextStatuses = {
      ...integrationStatuses,
      [name]: integrationStatuses[name] === "connected" ? "needs setup" as const : "connected" as const,
    };
    setIntegrationStatuses(nextStatuses);
    setError("");
    setStatus("");
    try {
      const response = await fetch("/api/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json", ...userHeaders(role, userId) },
        body: JSON.stringify({ integrationSettings: nextStatuses }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Integration settings could not be saved");
      setIntegrationStatuses(payload.data.integrationSettings as Record<string, "connected" | "needs setup">);
      setStatus(`${name} marked as ${nextStatuses[name]}.`);
    } catch (toggleError) {
      setError(toggleError instanceof Error ? toggleError.message : "Integration settings could not be saved");
    }
  }

  async function uploadPlaybook(file: File) {
    setPlaybookUploading(true);
    setError("");
    setStatus("");
    try {
      const form = new FormData();
      form.append("file", file);
      const response = await fetch("/api/playbooks/upload", {
        method: "POST",
        headers: userHeaders(role, userId),
        body: form,
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Playbook could not be uploaded");
      setStatus(`${file.name} uploaded and parsed.`);
      const next = await fetch(`/api/playbooks?includeArchived=${showArchived ? "true" : "false"}`, { headers: userHeaders(role, userId) });
      const nextPayload = await next.json();
      if (next.ok) setPlaybooks((nextPayload.data ?? []) as PlaybookRow[]);
    } catch (uploadError) {
      setError(uploadError instanceof Error ? uploadError.message : "Playbook could not be uploaded");
    } finally {
      setPlaybookUploading(false);
    }
  }

  async function archivePlaybook(playbook: PlaybookRow) {
    setError("");
    setStatus("");
    try {
      const response = await fetch(`/api/playbooks/${playbook.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", ...userHeaders(role, userId) },
        body: JSON.stringify({ status: "ARCHIVED" }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Playbook could not be archived");
      setPlaybooks((current) => current.filter((item) => item.id !== playbook.id));
      setStatus(`${playbook.title} archived.`);
    } catch (archiveError) {
      setError(archiveError instanceof Error ? archiveError.message : "Playbook could not be archived");
    }
  }

  function toggleLoginJingle() {
    const nextMuted = !jingleMuted;
    setJingleMuted(nextMuted);
    if (typeof window !== "undefined") {
      window.localStorage.setItem("kamazing:login-jingle-muted", String(nextMuted));
    }
    setStatus(nextMuted ? "Login jingle turned off." : "Login jingle turned on.");
  }

  function toggleAmbientMusic() {
    const nextMuted = !ambientMusicMuted;
    setAmbientMusicMutedState(nextMuted);
    setAmbientMusicMuted(nextMuted);
    setStatus(nextMuted ? "Background music turned off." : "Background music turned on.");
  }

  return (
    <main className="min-h-screen px-5 py-5">
      <section className="mx-auto max-w-[1500px] space-y-4">
        <div className="rounded-[30px] border border-[#E4D5C4] bg-[#FFF9EF] p-5 shadow-[0_24px_70px_-58px_rgba(32,38,32,0.58)]">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <h1 className="text-[clamp(36px,4vw,56px)] font-black leading-none tracking-[-0.05em] text-[#1F2722]">Settings</h1>
              <p className="mt-2 text-[13px] font-bold text-[#75685A]">DB-backed configuration for users, account ownership, scoring, and global playbooks.</p>
            </div>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              <Stat label="Weights" value={`${totalWeight}%`} />
              <Stat label="Users" value={String(team.length)} />
              <Stat label="Allocated" value={String(allocatedCount)} />
              <Stat label="Signed in" value={userName || "KAM"} />
            </div>
          </div>
          {loading ? <Status tone="neutral">Loading settings from database...</Status> : null}
          {status ? <Status tone="success">{status}</Status> : null}
          {error ? <Status tone="error">{error}</Status> : null}
        </div>

        <section className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_420px]">
          <Panel title="Default KPI weights" aside={`Total ${totalWeight}%`}>
            <div className="flex justify-end">
              <button
                type="button"
                disabled={!canSaveWeights}
                onClick={saveWeights}
                className="rounded-full bg-[#25352E] px-4 py-2 text-[12px] font-black text-[#FFF9EF] disabled:cursor-not-allowed disabled:bg-[#AFA79C]"
              >
                {savingWeights ? "Saving..." : "Save weights"}
              </button>
            </div>
            <div className="mt-3 grid gap-2 sm:grid-cols-2 2xl:grid-cols-4">
              {weights.map((item) => (
                <label key={item.id} className="rounded-2xl border border-[#E1D3C2] bg-[#FFF8ED] px-3 py-2.5">
                  <div className="flex items-center justify-between gap-2">
                    <span className="truncate text-[13px] font-black text-[#25352E]">{item.name}</span>
                    <span className="rounded-full border border-[#D7C6B4] bg-[#FFFCF6] px-2.5 py-1 text-[11px] font-black text-[#25352E]">{item.weight}%</span>
                  </div>
                  <input type="range" min="0" max="40" value={item.weight} onChange={(event) => updateWeight(item.id, Number(event.target.value))} className="mt-2 h-2 w-full accent-[#25352E]" />
                </label>
              ))}
            </div>
          </Panel>

          <Panel title="Integrations" aside={`${connectedIntegrations}/${integrationMocks.length} connected`}>
            <div className="grid gap-2">
              {integrationMocks.map((name) => (
                <button
                  key={name}
                  type="button"
                  onClick={() => void toggleIntegration(name)}
                  className="flex min-h-11 items-center justify-between gap-3 rounded-2xl border border-[#E1D3C2] bg-[#FFF8ED] px-3 py-2 text-left transition hover:border-[#25352E]/45"
                >
                  <span className="truncate text-[13px] font-black text-[#25352E]">{name}</span>
                  <span className={`inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-1 text-[11px] font-black ${integrationStatuses[name] === "connected" ? "bg-[#EDF8EE] text-[#1F6C42]" : "bg-[#F2E8D8] text-[#6E5F4F]"}`}>
                    <Link2 className="h-3.5 w-3.5" />
                    {integrationStatuses[name]}
                  </span>
                </button>
              ))}
            </div>
          </Panel>

          <Panel title="Sound controls">
            <div className="grid gap-3">
              <div className="flex items-center justify-between gap-3 rounded-2xl border border-[#E8DCCE] bg-[#FFF8ED] px-3 py-3">
                <div className="flex items-center gap-2">
                  <Bell className="h-5 w-5 text-[#25352E]" />
                  <h2 className="text-[16px] font-black text-[#25352E]">Login sound</h2>
                </div>
                <button
                  type="button"
                  onClick={toggleLoginJingle}
                  className={`rounded-full px-4 py-2 text-[12px] font-black ${jingleMuted ? "border border-[#D8C7B4] bg-[#FFF8ED] text-[#6F6254]" : "bg-[#25352E] text-[#FFF9EF]"}`}
                >
                  {jingleMuted ? "Off" : "On"}
                </button>
              </div>
              <div className="flex items-center justify-between gap-3 rounded-2xl border border-[#E8DCCE] bg-[#FFF8ED] px-3 py-3">
                <div className="flex items-center gap-2">
                  <Music2 className="h-5 w-5 text-[#25352E]" />
                  <h2 className="text-[16px] font-black text-[#25352E]">Background music</h2>
                </div>
                <button
                  type="button"
                  onClick={toggleAmbientMusic}
                  className={`rounded-full px-4 py-2 text-[12px] font-black ${ambientMusicMuted ? "border border-[#D8C7B4] bg-[#FFF8ED] text-[#6F6254]" : "bg-[#25352E] text-[#FFF9EF]"}`}
                >
                  {ambientMusicMuted ? "Off" : "On"}
                </button>
              </div>
            </div>
          </Panel>
        </section>

        <section className="grid gap-4 xl:grid-cols-[minmax(0,1.1fr)_minmax(420px,0.9fr)]">
          <Panel title="Users and account allocation" aside={`${associates.length} associates`}>
            <div className="grid gap-2 rounded-2xl border border-[#E1D3C2] bg-[#FFF8ED] p-3 lg:grid-cols-[1fr_1fr_150px_160px_auto]">
              <input value={newUser.name} onChange={(event) => setNewUser((current) => ({ ...current, name: event.target.value }))} placeholder="Full name" className="h-10 rounded-full border border-[#D7C6B4] bg-[#FFFCF6] px-3 text-[12px] font-bold outline-none" />
              <input value={newUser.email} onChange={(event) => setNewUser((current) => ({ ...current, email: event.target.value }))} placeholder="Email" className="h-10 rounded-full border border-[#D7C6B4] bg-[#FFFCF6] px-3 text-[12px] font-bold outline-none" />
              <select value={newUser.role} onChange={(event) => setNewUser((current) => ({ ...current, role: event.target.value as Role }))} className="h-10 rounded-full border border-[#D7C6B4] bg-[#FFFCF6] px-3 text-[12px] font-black outline-none">
                {inviteRoleOptions.map((option) => (
                  <option key={option} value={option}>{option === "KAM" ? "KAM" : option.charAt(0) + option.slice(1).toLowerCase()}</option>
                ))}
              </select>
              <input value={newUser.initialPassword} onChange={(event) => setNewUser((current) => ({ ...current, initialPassword: event.target.value }))} placeholder="Initial password" className="h-10 rounded-full border border-[#D7C6B4] bg-[#FFFCF6] px-3 text-[12px] font-bold outline-none" />
              <button type="button" onClick={createUser} className="inline-flex h-10 items-center justify-center gap-2 rounded-full bg-[#25352E] px-4 text-[12px] font-black text-[#FFF9EF]">
                <UserPlus className="h-3.5 w-3.5" />
                Add
              </button>
            </div>
            <div className="mt-4 grid gap-3 lg:grid-cols-[280px_minmax(0,1fr)]">
              <div className="max-h-[470px] space-y-2 overflow-y-auto pr-1">
                {team.map((person) => (
                  <div key={person.id} className="rounded-2xl border border-[#E1D3C2] bg-[#FFF8ED] p-3">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="truncate text-[14px] font-black text-[#25352E]">{person.name}</p>
                        <p className="truncate text-[12px] font-bold text-[#75685A]">{person.email}</p>
                        <p className="mt-1 text-[11px] font-black text-[#8A7563]">{person.role}</p>
                      </div>
                      {person.id !== userId ? (
                        <button type="button" onClick={() => deleteUser(person)} className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-[#DECFC0] text-[#A04436]">
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      ) : null}
                    </div>
                  </div>
                ))}
              </div>

              <div className="rounded-2xl border border-[#E1D3C2] bg-[#FFF8ED] p-3">
                <div className="flex items-center justify-between gap-3">
                  <h3 className="text-[16px] font-black text-[#25352E]">Account allocation</h3>
                  <span className="rounded-full border border-[#D8C7B4] bg-[#FFFCF6] px-3 py-1 text-[12px] font-black text-[#6F6254]">{accounts.length} accounts</span>
                </div>
                <div className="mt-3 max-h-[415px] space-y-2 overflow-y-auto pr-1">
                  {accounts.map((account) => {
                    const associateOwner = account.associateOwner as { id?: string } | undefined;
                    const accountId = String(account.id ?? "");
                    return (
                      <div key={accountId} className="grid gap-2 rounded-xl border border-[#E1D3C2] bg-[#FFFCF6] px-3 py-2 sm:grid-cols-[1fr_190px] sm:items-center">
                        <div className="min-w-0">
                          <p className="truncate text-[13px] font-black text-[#25352E]">{accountName(account)}</p>
                          <p className="truncate text-[12px] font-bold text-[#75685A]">{String(account.industry ?? "Industry not set")}</p>
                        </div>
                        <select
                          value={associateOwner?.id ?? ""}
                          disabled={Boolean(allocationSaving[accountId])}
                          onChange={(event) => updateAllocation(account, event.target.value)}
                          className="h-9 rounded-full border border-[#D7C6B4] bg-[#FFF8ED] px-3 text-[12px] font-black text-[#25352E] outline-none disabled:opacity-60"
                        >
                          <option value="">Unallocated</option>
                          {associates.map((associate) => (
                            <option key={associate.id} value={associate.id}>{associate.name}</option>
                          ))}
                        </select>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          </Panel>

          <Panel title="Global playbooks" aside={`${playbooks.length} shown`}>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <label className="inline-flex cursor-pointer items-center gap-2 rounded-full border border-[#D8C7B4] bg-[#FFF8ED] px-3 py-2 text-[12px] font-black text-[#25352E]">
                <Upload className="h-3.5 w-3.5" />
                {playbookUploading ? "Uploading..." : "Upload playbook"}
                <input type="file" className="hidden" accept=".pdf,.doc,.docx,.txt,.md,.xls,.xlsx" onChange={(event) => {
                  const file = event.target.files?.[0];
                  event.currentTarget.value = "";
                  if (file) void uploadPlaybook(file);
                }} />
              </label>
              <label className="inline-flex items-center gap-2 text-[12px] font-black text-[#6F6254]">
                <input type="checkbox" checked={showArchived} onChange={(event) => setShowArchived(event.target.checked)} className="accent-[#25352E]" />
                Show archived
              </label>
            </div>
            <div className="mt-3 max-h-[520px] space-y-2 overflow-y-auto pr-1">
              {playbooks.length === 0 ? (
                <div className="rounded-2xl border border-[#E1D3C2] bg-[#FFF8ED] p-3 text-[13px] font-bold text-[#75685A]">
                  Upload PDF, DOCX, TXT, Markdown, XLS, or XLSX playbooks. Global playbooks apply to all accounts automatically.
                </div>
              ) : null}
              {playbooks.map((playbook) => (
                <div key={playbook.id} className="rounded-2xl border border-[#E1D3C2] bg-[#FFF8ED] p-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-[13px] font-black text-[#25352E]">{playbook.title}</p>
                      <p className="mt-1 text-[11px] font-bold text-[#75685A]">{playbook.fileType} - {playbook.ruleCount} rules - {playbook.uploadedBy}</p>
                      {playbook.processingError ? <p className="mt-1 text-[11px] font-bold text-[#A63F33]">{playbook.processingError}</p> : null}
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      <span className="rounded-full border border-[#D8C7B4] bg-[#FFFCF6] px-2 py-1 text-[10px] font-black text-[#6F6254]">{playbook.status}</span>
                      {playbook.status !== "ARCHIVED" ? (
                        <button type="button" onClick={() => archivePlaybook(playbook)} className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-[#DECFC0] text-[#6F6254]">
                          <Archive className="h-3.5 w-3.5" />
                        </button>
                      ) : null}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </Panel>
        </section>

        <section className="rounded-[28px] border border-[#E1D3C2] bg-[#FFFCF6] p-4 shadow-[0_20px_55px_-48px_rgba(32,38,32,0.55)]">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-[20px] font-black text-[#25352E]">Audit trail</h2>
            <span className="rounded-full border border-[#D8C7B4] bg-[#FFF8ED] px-3 py-1 text-[12px] font-black text-[#6F6254]">{auditEvents.length} events</span>
          </div>
          <div className="mt-3 grid gap-2 md:grid-cols-2">
            {auditEvents.map((event) => (
              <article key={`${event.actor}-${event.action}`} className="rounded-2xl border border-[#E1D3C2] bg-[#FFF8ED] p-3">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-[13px] font-black text-[#25352E]">{event.action}</p>
                    <p className="mt-1 text-[12px] font-bold text-[#75685A]">{event.actor} · {event.source}</p>
                  </div>
                  <span className="shrink-0 rounded-full border border-[#D8C7B4] bg-[#FFFCF6] px-2 py-1 text-[11px] font-black text-[#6F6254]">{event.when}</span>
                </div>
              </article>
            ))}
          </div>
        </section>
      </section>
    </main>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-[#D8C7B4] bg-[#FFFCF6]/75 px-4 py-3">
      <p className="text-[12px] font-bold text-[#75685A]">{label}</p>
      <p className="max-w-28 truncate text-2xl font-black text-[#25352E]">{value}</p>
    </div>
  );
}

function Panel({ title, aside, children }: { title: string; aside?: string; children: React.ReactNode }) {
  return (
    <div className="rounded-[28px] border border-[#E1D3C2] bg-[#FFFCF6] p-4 shadow-[0_20px_55px_-48px_rgba(32,38,32,0.55)]">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <FileText className="h-5 w-5 text-[#25352E]" />
          <h2 className="text-[20px] font-black text-[#25352E]">{title}</h2>
        </div>
        {aside ? <span className="rounded-full border border-[#D8C7B4] bg-[#FFF8ED] px-3 py-1 text-[12px] font-black text-[#6F6254]">{aside}</span> : null}
      </div>
      {children}
    </div>
  );
}

function Status({ tone, children }: { tone: "success" | "error" | "neutral"; children: React.ReactNode }) {
  const styles = tone === "error"
    ? "border-[#E8B8B0] bg-[#FFF0ED] text-[#B33D32]"
    : tone === "success"
      ? "border-[#CFE2D3] bg-[#F3FAF1] text-[#245D3A]"
      : "border-[#E1D3C2] bg-[#FFF8ED] text-[#75685A]";
  return <div className={`mt-4 rounded-2xl border px-4 py-3 text-[13px] font-black ${styles}`}>{children}</div>;
}

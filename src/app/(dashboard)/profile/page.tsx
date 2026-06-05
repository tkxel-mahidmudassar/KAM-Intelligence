"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import {
  User, Phone, Mail, Shield, Camera, Save, Loader2,
  Bell, BellOff, ChevronDown, ChevronUp, Users, Building2,
  CheckCircle2, AlertTriangle, Clock, Crown, Briefcase,
} from "lucide-react";
import { useRole } from "@/context/RoleContext";
import { cn } from "@/lib/utils";
import Image from "next/image";
import type { Role } from "@/types";

// ─── Types ────────────────────────────────────────────────────────────────────

interface TeamMember {
  id: string;
  name: string;
  role: Role;
  avatarUrl: string | null;
  phone?: string | null;
}

interface TeamManager extends TeamMember {
  _count?: { managedAccounts: number };
}

interface UserProfile {
  id: string;
  name: string;
  email: string;
  role: Role;
  avatarUrl: string | null;
  phone: string | null;
  notificationPrefs: {
    healthDrops: boolean;
    newSignals: boolean;
    actionReminders: boolean;
  } | null;
  manager: { id: string; name: string; role: Role } | null;
  reports: TeamMember[];
}

interface TeamData {
  view: "full" | "scoped";
  currentUserId?: string | null;
  // Full view
  tiers?: {
    managers: (TeamMember & { _count: { managedAccounts: number }; reports: TeamMember[] })[];
    kams:     (TeamMember & { _count: { managedAccounts: number }; reports: TeamMember[] })[];
    associates: TeamMember[];
    executives: TeamMember[];
  };
  // Scoped view
  currentUser?: UserProfile | null;
  manager?: TeamManager | null;
  reports?: (TeamMember & { _count: { managedAccounts: number } })[];
  peers?: TeamMember[];
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const ROLE_LABEL: Record<string, string> = {
  ASSOCIATE: "Associate",
  KAM:       "KAM",
  MANAGER:   "Manager",
  EXECUTIVE: "Executive",
  ADMIN:     "Admin",
};

const ROLE_COLOR: Record<string, string> = {
  ASSOCIATE: "#14B8A6",
  KAM:       "#0755E9",
  MANAGER:   "#A855F7",
  EXECUTIVE: "#F59E0B",
  ADMIN:     "#EF4444",
};

const ROLE_ICON: Record<string, React.ElementType> = {
  ASSOCIATE: Briefcase,
  KAM:       User,
  MANAGER:   Crown,
  EXECUTIVE: Shield,
  ADMIN:     Shield,
};

function avatarInitials(name: string): string {
  return name.split(" ").map((n) => n[0]).join("").toUpperCase().slice(0, 2);
}

function AvatarCircle({ user, size = 48 }: { user: { name: string; avatarUrl?: string | null }; size?: number }) {
  if (user.avatarUrl) {
    return (
      <div className="relative shrink-0" style={{ width: size, height: size }}>
        <Image src={user.avatarUrl} alt={user.name} fill className="rounded-full object-cover" />
      </div>
    );
  }
  return (
    <div
      className="rounded-full flex items-center justify-center shrink-0 text-white font-bold select-none"
      style={{ width: size, height: size, background: "#0755E9", fontSize: size * 0.35 }}
    >
      {avatarInitials(user.name)}
    </div>
  );
}

// ─── Notification Prefs Section ───────────────────────────────────────────────

function NotifToggle({
  label, description, enabled, onChange, icon: Icon, color,
}: {
  label: string; description: string; enabled: boolean; onChange: (v: boolean) => void;
  icon: React.ElementType; color: string;
}) {
  return (
    <div className="flex items-center gap-3 p-3 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface-2)]">
      <div
        className="h-8 w-8 rounded-lg flex items-center justify-center shrink-0"
        style={{ background: `${color}18` }}
      >
        <Icon className="h-4 w-4" style={{ color }} />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-[13px] font-semibold text-[var(--text-primary)]">{label}</p>
        <p className="text-[11px] text-[var(--text-muted)]">{description}</p>
      </div>
      <button
        onClick={() => onChange(!enabled)}
        className={cn(
          "relative h-5 w-9 rounded-full transition-colors shrink-0",
          enabled ? "bg-[#22C55E]" : "bg-[var(--border-default)]",
        )}
        role="switch"
        aria-checked={enabled}
      >
        <span
          className={cn(
            "absolute top-0.5 h-4 w-4 rounded-full bg-white shadow-sm transition-transform",
            enabled ? "translate-x-4" : "translate-x-0.5",
          )}
        />
      </button>
    </div>
  );
}

// ─── Team Hierarchy Panel ─────────────────────────────────────────────────────

function MemberCard({ member, accountCount }: { member: TeamMember & { _count?: { managedAccounts: number } }; accountCount?: number }) {
  const RoleIcon = ROLE_ICON[member.role] ?? User;
  const color = ROLE_COLOR[member.role] ?? "#6B7280";
  return (
    <div className="flex items-center gap-3 p-3 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface-2)]">
      <AvatarCircle user={member} size={36} />
      <div className="flex-1 min-w-0">
        <p className="text-[13px] font-semibold text-[var(--text-primary)] truncate">{member.name}</p>
        <div className="flex items-center gap-1 mt-0.5">
          <span
            className="inline-flex items-center gap-1 text-[10px] font-semibold px-1.5 py-0.5 rounded-full"
            style={{ color, background: `${color}15` }}
          >
            <RoleIcon className="h-2.5 w-2.5" />
            {ROLE_LABEL[member.role] ?? member.role}
          </span>
          {member.phone && (
            <span className="text-[10px] text-[var(--text-muted)] truncate">{member.phone}</span>
          )}
        </div>
      </div>
      {accountCount !== undefined && (
        <span className="text-[11px] text-[var(--text-muted)] shrink-0">{accountCount} account{accountCount !== 1 ? "s" : ""}</span>
      )}
    </div>
  );
}

function TeamHierarchyPanel({ team, currentRole }: { team: TeamData; currentRole: Role }) {
  const [expanded, setExpanded] = useState(true);

  if (!team) return null;

  const isManagement = currentRole === "MANAGER" || currentRole === "EXECUTIVE" || currentRole === "ADMIN";

  return (
    <div className="rounded-xl border border-[var(--glass-border)] bg-[var(--glass-bg)] [backdrop-filter:var(--glass-blur)] shadow-[var(--glass-shadow)]">
      <button
        onClick={() => setExpanded((e) => !e)}
        className="w-full flex items-center justify-between px-5 py-4"
      >
        <div className="flex items-center gap-2.5">
          <Users className="h-4 w-4 text-[#0755E9]" />
          <h2 className="text-[14px] font-bold text-[var(--text-primary)]">Team Hierarchy</h2>
        </div>
        {expanded ? <ChevronUp className="h-4 w-4 text-[var(--text-muted)]" /> : <ChevronDown className="h-4 w-4 text-[var(--text-muted)]" />}
      </button>

      {expanded && (
        <div className="px-5 pb-5 space-y-5">
          {isManagement && team.tiers ? (
            <>
              {/* Full org view for management */}
              {team.tiers.managers.length > 0 && (
                <div>
                  <p className="text-[11px] font-semibold text-[var(--text-muted)] uppercase tracking-wider mb-2">Managers</p>
                  <div className="space-y-2">
                    {team.tiers.managers.map((m) => (
                      <div key={m.id}>
                        <MemberCard member={m} accountCount={m._count.managedAccounts} />
                        {m.reports.length > 0 && (
                          <div className="ml-6 mt-1 space-y-1 border-l border-[var(--border-subtle)] pl-3">
                            {m.reports.map((r) => (
                              <MemberCard key={r.id} member={r} />
                            ))}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {team.tiers.kams.length > 0 && (
                <div>
                  <p className="text-[11px] font-semibold text-[var(--text-muted)] uppercase tracking-wider mb-2">KAMs</p>
                  <div className="space-y-2">
                    {team.tiers.kams.map((k) => (
                      <div key={k.id}>
                        <MemberCard member={k} accountCount={k._count.managedAccounts} />
                        {k.reports.length > 0 && (
                          <div className="ml-6 mt-1 space-y-1 border-l border-[var(--border-subtle)] pl-3">
                            {k.reports.map((r) => (
                              <MemberCard key={r.id} member={r} />
                            ))}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {team.tiers.executives.length > 0 && (
                <div>
                  <p className="text-[11px] font-semibold text-[var(--text-muted)] uppercase tracking-wider mb-2">Executives</p>
                  <div className="space-y-2">
                    {team.tiers.executives.map((e) => (
                      <MemberCard key={e.id} member={e} />
                    ))}
                  </div>
                </div>
              )}
            </>
          ) : (
            <>
              {/* Scoped view for KAM / Associate */}
              {team.manager && (
                <div>
                  <p className="text-[11px] font-semibold text-[var(--text-muted)] uppercase tracking-wider mb-2">Reports To</p>
                  <MemberCard member={team.manager} accountCount={team.manager._count?.managedAccounts} />
                </div>
              )}
              {team.reports && team.reports.length > 0 && (
                <div>
                  <p className="text-[11px] font-semibold text-[var(--text-muted)] uppercase tracking-wider mb-2">Direct Reports</p>
                  <div className="space-y-2">
                    {team.reports.map((r) => (
                      <MemberCard key={r.id} member={r} accountCount={r._count?.managedAccounts} />
                    ))}
                  </div>
                </div>
              )}
              {team.peers && team.peers.length > 0 && (
                <div>
                  <p className="text-[11px] font-semibold text-[var(--text-muted)] uppercase tracking-wider mb-2">Colleagues</p>
                  <div className="space-y-2">
                    {team.peers.map((p) => (
                      <MemberCard key={p.id} member={p} />
                    ))}
                  </div>
                </div>
              )}
              {!team.manager && (!team.reports || team.reports.length === 0) && (!team.peers || team.peers.length === 0) && (
                <p className="text-[12px] text-[var(--text-muted)] text-center py-4">No team members linked yet</p>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function ProfilePage() {
  const { role, setUser } = useRole();

  const [profile, setProfile]       = useState<UserProfile | null>(null);
  const [team, setTeam]             = useState<TeamData | null>(null);
  const [loading, setLoading]       = useState(true);
  const [saving, setSaving]         = useState(false);
  const [saveError, setSaveError]   = useState<string | null>(null);
  const [saveSuccess, setSaveSuccess] = useState(false);

  // Form state
  const [name, setName]   = useState("");
  const [phone, setPhone] = useState("");
  const [notifPrefs, setNotifPrefs] = useState({
    healthDrops:    true,
    newSignals:     true,
    actionReminders: true,
  });

  // Avatar upload
  const [avatarUploading, setAvatarUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const headers = { "x-role": role };

  const fetchProfile = useCallback(async () => {
    setLoading(true);
    try {
      const [profileRes, teamRes] = await Promise.all([
        fetch("/api/users/me", { headers }).then((r) => r.json()),
        fetch("/api/users/team", { headers }).then((r) => r.json()),
      ]);

      if (profileRes.data) {
        const p: UserProfile = profileRes.data;
        setProfile(p);
        setName(p.name ?? "");
        setPhone(p.phone ?? "");
        setNotifPrefs({
          healthDrops:     p.notificationPrefs?.healthDrops     ?? true,
          newSignals:      p.notificationPrefs?.newSignals      ?? true,
          actionReminders: p.notificationPrefs?.actionReminders ?? true,
        });
      }
      if (teamRes.data) setTeam(teamRes.data);
    } catch (err) {
      console.error("[Profile] fetch failed:", err);
    } finally {
      setLoading(false);
    }
  }, [role]);

  useEffect(() => { fetchProfile(); }, [fetchProfile]);

  const handleSave = async () => {
    if (!profile) return;
    setSaving(true);
    setSaveError(null);
    setSaveSuccess(false);
    try {
      const res = await fetch("/api/users/me", {
        method: "PATCH",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim(), phone: phone.trim(), notificationPrefs: notifPrefs }),
      });
      const json = await res.json();
      if (!res.ok) {
        setSaveError(json.error ?? "Save failed");
      } else {
        setProfile(json.data);
        // Update RoleContext so topbar name reflects the change
        if (profile) setUser(profile.id, name.trim(), profile.email, profile.role);
        setSaveSuccess(true);
        setTimeout(() => setSaveSuccess(false), 3000);
      }
    } catch {
      setSaveError("Network error — please try again");
    } finally {
      setSaving(false);
    }
  };

  const handleAvatarChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setAvatarUploading(true);
    try {
      const form = new FormData();
      form.append("avatar", file);
      const res = await fetch("/api/users/me/avatar", {
        method: "POST",
        headers,
        body: form,
      });
      const json = await res.json();
      if (res.ok && profile) {
        setProfile({ ...profile, avatarUrl: json.data.avatarUrl });
      }
    } catch (err) {
      console.error("[Profile] avatar upload failed:", err);
    } finally {
      setAvatarUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const RoleIcon = profile ? (ROLE_ICON[profile.role] ?? User) : User;
  const roleColor = profile ? (ROLE_COLOR[profile.role] ?? "#0755E9") : "#0755E9";

  if (loading) {
    return (
      <div className="p-6 space-y-4">
        {[...Array(3)].map((_, i) => (
          <div key={i} className="h-24 rounded-xl bg-[var(--bg-surface-2)] animate-pulse" />
        ))}
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6 max-w-4xl mx-auto">
      {/* ── Header ──────────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-[20px] font-bold text-[var(--text-primary)]">My Profile</h1>
          <p className="text-[13px] text-[var(--text-muted)] mt-0.5">Manage your profile and preferences</p>
        </div>
        <button
          onClick={handleSave}
          disabled={saving}
          className={cn(
            "flex items-center gap-2 px-4 py-2 rounded-xl text-[13px] font-semibold text-white transition-all",
            saving ? "bg-[#0755E9]/60 cursor-not-allowed" : "bg-[#0755E9] hover:bg-[#0755E9]/90",
          )}
        >
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          {saving ? "Saving..." : "Save Changes"}
        </button>
      </div>

      {saveSuccess && (
        <div className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-[#22C55E]/12 border border-[#22C55E]/30 text-[#22C55E] text-[13px] font-medium">
          <CheckCircle2 className="h-4 w-4 shrink-0" /> Profile saved successfully
        </div>
      )}
      {saveError && (
        <div className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-[#EF4444]/12 border border-[#EF4444]/30 text-[#EF4444] text-[13px] font-medium">
          <AlertTriangle className="h-4 w-4 shrink-0" /> {saveError}
        </div>
      )}

      {/* ── Identity card ────────────────────────────────────────────────────── */}
      <div className="rounded-xl border border-[var(--glass-border)] bg-[var(--glass-bg)] [backdrop-filter:var(--glass-blur)] shadow-[var(--glass-shadow)] p-5">
        <div className="flex items-start gap-5">
          {/* Avatar */}
          <div className="relative group shrink-0">
            {profile?.avatarUrl ? (
              <div className="relative h-20 w-20 rounded-full overflow-hidden">
                <Image src={profile.avatarUrl} alt={profile.name} fill className="object-cover" />
              </div>
            ) : (
              <div
                className="h-20 w-20 rounded-full flex items-center justify-center text-white text-[26px] font-bold select-none"
                style={{ background: "#0755E9" }}
              >
                {profile ? avatarInitials(profile.name) : "?"}
              </div>
            )}
            {/* Upload overlay */}
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={avatarUploading}
              className="absolute inset-0 rounded-full flex items-center justify-center bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity"
              title="Change photo"
            >
              {avatarUploading
                ? <Loader2 className="h-5 w-5 text-white animate-spin" />
                : <Camera className="h-5 w-5 text-white" />}
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp,image/gif"
              className="hidden"
              onChange={handleAvatarChange}
            />
          </div>

          {/* Name + role */}
          <div className="flex-1 min-w-0">
            <div className="mb-3">
              <label className="block text-[11px] font-semibold text-[var(--text-muted)] uppercase tracking-wider mb-1">
                Display Name
              </label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-surface-1)] px-3 py-2 text-[14px] font-semibold text-[var(--text-primary)] focus:outline-none focus:border-[#0755E9] transition-colors"
                placeholder="Your name"
              />
            </div>
            <div className="flex items-center gap-3 flex-wrap">
              <div
                className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold"
                style={{ color: roleColor, background: `${roleColor}15` }}
              >
                <RoleIcon className="h-3 w-3" />
                {profile ? ROLE_LABEL[profile.role] : role}
              </div>
              <div className="flex items-center gap-1.5 text-[12px] text-[var(--text-muted)]">
                <Mail className="h-3.5 w-3.5" />
                <span className="truncate">{profile?.email ?? "—"}</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ── Contact info ─────────────────────────────────────────────────────── */}
      <div className="rounded-xl border border-[var(--glass-border)] bg-[var(--glass-bg)] [backdrop-filter:var(--glass-blur)] shadow-[var(--glass-shadow)] p-5">
        <h2 className="text-[14px] font-bold text-[var(--text-primary)] mb-4">Contact Information</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-[11px] font-semibold text-[var(--text-muted)] uppercase tracking-wider mb-1.5">
              Email Address
            </label>
            <div className="flex items-center gap-2 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-surface-2)] px-3 py-2">
              <Mail className="h-3.5 w-3.5 text-[var(--text-muted)] shrink-0" />
              <span className="text-[13px] text-[var(--text-secondary)] truncate">{profile?.email ?? "—"}</span>
            </div>
            <p className="text-[10px] text-[var(--text-muted)] mt-1">Contact your admin to change email</p>
          </div>
          <div>
            <label className="block text-[11px] font-semibold text-[var(--text-muted)] uppercase tracking-wider mb-1.5">
              Phone Number
            </label>
            <div className="flex items-center gap-2 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-surface-1)] focus-within:border-[#0755E9] transition-colors px-3 py-2">
              <Phone className="h-3.5 w-3.5 text-[var(--text-muted)] shrink-0" />
              <input
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="+1 (555) 000-0000"
                className="flex-1 bg-transparent text-[13px] text-[var(--text-primary)] focus:outline-none placeholder:text-[var(--text-disabled)]"
              />
            </div>
          </div>
        </div>
      </div>

      {/* ── Notification preferences ──────────────────────────────────────────── */}
      <div className="rounded-xl border border-[var(--glass-border)] bg-[var(--glass-bg)] [backdrop-filter:var(--glass-blur)] shadow-[var(--glass-shadow)] p-5">
        <div className="flex items-center gap-2.5 mb-4">
          <Bell className="h-4 w-4 text-[#0755E9]" />
          <h2 className="text-[14px] font-bold text-[var(--text-primary)]">Notification Preferences</h2>
        </div>
        <p className="text-[12px] text-[var(--text-muted)] mb-4">
          Choose which events you want to be notified about. These preferences are saved per user.
        </p>
        <div className="space-y-2.5">
          <NotifToggle
            label="Health Score Drops"
            description="Alert when an account drops to AT_RISK or CRITICAL"
            enabled={notifPrefs.healthDrops}
            onChange={(v) => setNotifPrefs((p) => ({ ...p, healthDrops: v }))}
            icon={AlertTriangle}
            color="#EF4444"
          />
          <NotifToggle
            label="New Signals"
            description="Alert on new WARNING or CRITICAL signals"
            enabled={notifPrefs.newSignals}
            onChange={(v) => setNotifPrefs((p) => ({ ...p, newSignals: v }))}
            icon={BellOff}
            color="#F59E0B"
          />
          <NotifToggle
            label="Action Due Reminders"
            description="Reminder when an action is due soon or overdue"
            enabled={notifPrefs.actionReminders}
            onChange={(v) => setNotifPrefs((p) => ({ ...p, actionReminders: v }))}
            icon={Clock}
            color="#0755E9"
          />
        </div>
      </div>

      {/* ── Team Hierarchy ────────────────────────────────────────────────────── */}
      {team && <TeamHierarchyPanel team={team} currentRole={role} />}
    </div>
  );
}

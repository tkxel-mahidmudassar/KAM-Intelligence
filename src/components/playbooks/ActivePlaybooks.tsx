"use client";

import { useState, useEffect, useCallback } from "react";
import { BookOpen, CheckCircle, Clock, XCircle, PowerOff, Power, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import Link from "next/link";
import { useRole } from "@/context/RoleContext";

interface ActivePlaybook {
  id: string;
  title: string;
  fileType: string;
  status: "PROCESSING" | "ACTIVE" | "FAILED" | "ARCHIVED";
  processedAt: string | null;
  ruleCount: number;
}

const STATUS_META = {
  PROCESSING: { label: "Processing", color: "#F59E0B", icon: Clock },
  ACTIVE:     { label: "Active",     color: "#22C55E", icon: CheckCircle },
  FAILED:     { label: "Failed",     color: "#EF4444", icon: XCircle },
  ARCHIVED:   { label: "Archived",   color: "#6B7280", icon: null },
};

interface ActivePlaybooksProps {
  accountId: string;
}

export function ActivePlaybooks({ accountId }: ActivePlaybooksProps) {
  const { role } = useRole();
  const [playbooks, setPlaybooks]       = useState<ActivePlaybook[]>([]);
  const [excluded, setExcluded]         = useState<Set<string>>(new Set());
  const [loading, setLoading]           = useState(true);
  const [toggling, setToggling]         = useState<string | null>(null);

  const headers = { "x-role": role };

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [pbRes, exRes] = await Promise.all([
        fetch("/api/playbooks", { headers }).then((r) => r.json()),
        fetch(`/api/accounts/${accountId}/playbook-exclusions`, { headers }).then((r) => r.json()),
      ]);

      const active = (pbRes.data ?? []).filter(
        (p: ActivePlaybook) => p.status === "ACTIVE" || p.status === "PROCESSING"
      );
      setPlaybooks(active);
      setExcluded(new Set(exRes.data ?? []));
    } catch (err) {
      console.error("[ActivePlaybooks] fetch failed:", err);
    } finally {
      setLoading(false);
    }
  }, [accountId, role]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const toggleExclusion = async (playbookId: string) => {
    setToggling(playbookId);
    try {
      const isExcluded = excluded.has(playbookId);
      if (isExcluded) {
        // Re-enable
        await fetch(
          `/api/accounts/${accountId}/playbook-exclusions?playbookId=${playbookId}`,
          { method: "DELETE", headers },
        );
        setExcluded((prev) => { const s = new Set(prev); s.delete(playbookId); return s; });
      } else {
        // Exclude
        await fetch(`/api/accounts/${accountId}/playbook-exclusions`, {
          method: "POST",
          headers: { ...headers, "Content-Type": "application/json" },
          body: JSON.stringify({ playbookId }),
        });
        setExcluded((prev) => new Set([...prev, playbookId]));
      }
    } catch (err) {
      console.error("[ActivePlaybooks] toggle failed:", err);
    } finally {
      setToggling(null);
    }
  };

  const canToggle = role === "KAM" || role === "MANAGER" || role === "ADMIN";

  if (!loading && playbooks.length === 0) return null;

  return (
    <div className="rounded-xl border border-[var(--glass-border)] bg-[var(--glass-bg)] [backdrop-filter:var(--glass-blur)] p-4">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <BookOpen className="h-3.5 w-3.5 text-[#0755E9]" />
          <h3 className="text-[12px] font-semibold text-[var(--text-primary)]">Active Playbooks</h3>
        </div>
        <Link
          href="/settings"
          className="text-[11px] text-[#0755E9] hover:underline"
        >
          Manage
        </Link>
      </div>

      {loading ? (
        <div className="space-y-1.5">
          {[...Array(2)].map((_, i) => (
            <div key={i} className="h-8 rounded-lg bg-[var(--bg-surface-2)] animate-pulse" />
          ))}
        </div>
      ) : (
        <div className="space-y-1.5">
          {playbooks.map((pb) => {
            const meta        = STATUS_META[pb.status];
            const isExcluded  = excluded.has(pb.id);
            const isToggling  = toggling === pb.id;
            return (
              <div
                key={pb.id}
                className={cn(
                  "flex items-center gap-2 rounded-lg px-2.5 py-1.5 bg-[var(--bg-surface-2)]",
                  isExcluded && "opacity-50",
                )}
              >
                <div
                  className="h-1.5 w-1.5 rounded-full shrink-0"
                  style={{ background: isExcluded ? "#6B7280" : meta.color }}
                />
                <span className="flex-1 text-[12px] text-[var(--text-primary)] truncate">{pb.title}</span>

                {pb.status === "ACTIVE" && (
                  <span className="text-[10px] text-[var(--text-muted)] shrink-0">
                    {isExcluded ? "Off for account" : `${pb.ruleCount} rule${pb.ruleCount !== 1 ? "s" : ""}`}
                  </span>
                )}
                {pb.status !== "ACTIVE" && (
                  <span className="text-[11px] text-[var(--text-muted)] shrink-0">{meta.label}</span>
                )}

                {/* Per-account deactivate toggle — only for ACTIVE playbooks and KAM/MANAGER */}
                {pb.status === "ACTIVE" && canToggle && (
                  <button
                    onClick={() => toggleExclusion(pb.id)}
                    disabled={isToggling}
                    title={isExcluded ? "Re-enable playbook for this account" : "Deactivate playbook for this account only"}
                    className={cn(
                      "shrink-0 p-1 rounded transition-colors",
                      isExcluded
                        ? "text-[#22C55E] hover:bg-[#22C55E]/10"
                        : "text-[var(--text-muted)] hover:text-[#EF4444] hover:bg-[#EF4444]/10",
                    )}
                  >
                    {isToggling ? (
                      <Loader2 className="h-3 w-3 animate-spin" />
                    ) : isExcluded ? (
                      <Power className="h-3 w-3" />
                    ) : (
                      <PowerOff className="h-3 w-3" />
                    )}
                  </button>
                )}
              </div>
            );
          })}
          <p className="text-[10px] text-[var(--text-muted)] pt-0.5">
            Global playbooks influencing this account
          </p>
        </div>
      )}
    </div>
  );
}

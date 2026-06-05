"use client";

import { AlertTriangle, CheckCircle2, XCircle, Calendar, DollarSign, User, Building2, Globe, RefreshCw } from "lucide-react";
import { Badge } from "@/components/ui/Badge";
import { cn } from "@/lib/utils";

interface AccountHeaderProps {
  name: string;
  industry: string | null;
  region: string | null;
  country: string | null;
  arr: number;
  health: "HEALTHY" | "AT_RISK" | "CRITICAL";
  contractEnd: string | null;
  kamName: string | null;
  latestScore: number | null;
  onRefreshScore?: () => void;
  refreshing?: boolean;
  refreshSuccess?: boolean;
  refreshError?: string | null;
}

const HEALTH_CONFIG = {
  HEALTHY:  { variant: "healthy"  as const, icon: CheckCircle2,  color: "#22C55E", label: "Healthy"  },
  AT_RISK:  { variant: "at-risk"  as const, icon: AlertTriangle, color: "#F59E0B", label: "At Risk"  },
  CRITICAL: { variant: "critical" as const, icon: XCircle,       color: "#EF4444", label: "Critical" },
};

function formatARR(arr: number) {
  if (arr >= 1_000_000) return `$${(arr / 1_000_000).toFixed(1)}M`;
  if (arr >= 1_000)     return `$${(arr / 1_000).toFixed(0)}K`;
  return `$${arr}`;
}

function daysUntil(isoDate: string | null): number | null {
  if (!isoDate) return null;
  return Math.ceil((new Date(isoDate).getTime() - Date.now()) / 864e5);
}

export function AccountHeader({
  name, industry, region, country, arr, health,
  contractEnd, kamName, latestScore, onRefreshScore, refreshing, refreshSuccess, refreshError,
}: AccountHeaderProps) {
  const cfg      = HEALTH_CONFIG[health];
  const HealthIcon = cfg.icon;
  const days     = daysUntil(contractEnd);
  const renewalUrgent = days !== null && days <= 90;

  return (
    <div
      className={cn(
        "rounded-xl border p-5",
        "bg-[var(--glass-bg)] [backdrop-filter:var(--glass-blur)]",
        "shadow-[var(--glass-shadow)]",
        health === "CRITICAL" ? "border-l-4 border-l-[#EF4444] border-[var(--glass-border)]" :
        health === "AT_RISK"  ? "border-l-4 border-l-[#F59E0B] border-[var(--glass-border)]" :
                                "border-[var(--glass-border)]"
      )}
    >
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
        {/* Left — name + meta */}
        <div className="min-w-0">
          <div className="flex items-center gap-2.5 flex-wrap mb-1">
            <h1 className="text-[22px] font-bold text-[var(--text-primary)] tracking-[-0.02em] leading-tight">
              {name}
            </h1>
            <Badge variant={cfg.variant} className="flex items-center gap-1">
              <HealthIcon className="h-3 w-3" />
              {cfg.label}
            </Badge>
          </div>
          <div className="flex items-center flex-wrap gap-3 text-[12px] text-[var(--text-muted)]">
            {industry && (
              <span className="flex items-center gap-1">
                <Building2 className="h-3.5 w-3.5" /> {industry}
              </span>
            )}
            {(region || country) && (
              <span className="flex items-center gap-1">
                <Globe className="h-3.5 w-3.5" /> {[region, country].filter(Boolean).join(", ")}
              </span>
            )}
            {kamName && (
              <span className="flex items-center gap-1">
                <User className="h-3.5 w-3.5" />
                <span>KAM: {kamName}</span>
              </span>
            )}
          </div>
        </div>

        {/* Right — KPIs */}
        <div className="flex items-center gap-4 shrink-0">
          {/* ARR */}
          <div className="text-right">
            <p className="text-[10px] text-[var(--text-muted)] uppercase tracking-wider mb-0.5 flex items-center gap-1 justify-end">
              <DollarSign className="h-3 w-3" /> ARR
            </p>
            <p className="text-[24px] font-bold text-[var(--text-primary)] tabular-nums leading-none">
              {formatARR(arr)}
            </p>
          </div>

          {/* Divider */}
          <div className="w-px h-10 bg-[var(--border-subtle)]" />

          {/* Score */}
          <div className="text-right">
            <p className="text-[10px] text-[var(--text-muted)] uppercase tracking-wider mb-0.5">Health Score</p>
            <div className="flex items-center gap-1.5 justify-end">
              {latestScore !== null ? (
                <p
                  className="text-[24px] font-bold tabular-nums leading-none"
                  style={{
                    color: latestScore >= 70 ? "#22C55E" : latestScore >= 45 ? "#F59E0B" : "#EF4444",
                  }}
                >
                  {latestScore}
                  <span className="text-[14px] text-[var(--text-muted)]">/100</span>
                </p>
              ) : (
                <span className="text-[13px] text-[var(--text-disabled)]">—</span>
              )}
              {onRefreshScore && (
                <button
                  onClick={onRefreshScore}
                  disabled={refreshing}
                  title={refreshError ?? "Recompute score"}
                  className={cn(
                    "p-1 rounded-md transition-all",
                    refreshSuccess
                      ? "text-[#22C55E] bg-[#22C55E]/10"
                      : refreshError
                        ? "text-[#EF4444] bg-[#EF4444]/10"
                        : "text-[var(--text-disabled)] hover:text-[#0755E9] hover:bg-[#0755E9]/10"
                  )}
                >
                  {refreshSuccess ? (
                    <CheckCircle2 className="h-3.5 w-3.5" />
                  ) : (
                    <RefreshCw className={cn("h-3.5 w-3.5", refreshing && "animate-spin")} />
                  )}
                </button>
              )}
            </div>
            {refreshError && (
              <p className="text-[10px] text-[#EF4444] mt-0.5 text-right max-w-[140px]">{refreshError}</p>
            )}
          </div>

          {/* Renewal */}
          {days !== null && (
            <>
              <div className="w-px h-10 bg-[var(--border-subtle)]" />
              <div className="text-right">
                <p className="text-[10px] text-[var(--text-muted)] uppercase tracking-wider mb-0.5 flex items-center gap-1 justify-end">
                  <Calendar className="h-3 w-3" /> Renewal
                </p>
                <p
                  className={cn(
                    "text-[15px] font-semibold tabular-nums leading-none",
                    days <= 0 ? "text-[#EF4444]" :
                    renewalUrgent ? (days <= 60 ? "text-[#EF4444]" : "text-[#F59E0B]") :
                    "text-[var(--text-primary)]"
                  )}
                >
                  {days <= 0 ? "Overdue" : `${days}d`}
                </p>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

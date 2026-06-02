"use client";

import Link from "next/link";
import { AlertTriangle, CheckCircle2, XCircle, Calendar, Zap, ListTodo, User } from "lucide-react";
import { Badge } from "@/components/ui/Badge";
import { cn } from "@/lib/utils";

interface Signal {
  id: string;
  severity: string;
  title: string;
}

interface AccountCardProps {
  id: string;
  name: string;
  industry: string | null;
  arr: number;
  health: "HEALTHY" | "AT_RISK" | "CRITICAL";
  contractEnd: string | null;
  score: number | null;
  scoreHistory: number[];
  kamName: string | null;
  openSignals: Signal[];
  openActionCount: number;
}

const HEALTH_CONFIG = {
  HEALTHY:  { variant: "healthy"  as const, icon: CheckCircle2,  color: "#22C55E", label: "Healthy"  },
  AT_RISK:  { variant: "at-risk"  as const, icon: AlertTriangle, color: "#F59E0B", label: "At Risk"  },
  CRITICAL: { variant: "critical" as const, icon: XCircle,       color: "#EF4444", label: "Critical" },
};

function daysUntil(isoDate: string | null): number | null {
  if (!isoDate) return null;
  return Math.ceil((new Date(isoDate).getTime() - Date.now()) / 864e5);
}

function formatARR(arr: number) {
  if (arr >= 1_000_000) return `$${(arr / 1_000_000).toFixed(1)}M`;
  if (arr >= 1_000)     return `$${(arr / 1_000).toFixed(0)}K`;
  return `$${arr}`;
}

function ScoreArc({ score }: { score: number }) {
  const size   = 52;
  const stroke = 5;
  const r      = (size - stroke) / 2;
  const circ   = 2 * Math.PI * r;
  const arc    = circ * 0.75; // 270° arc
  const filled = arc * (score / 100);
  const offset = circ * 0.125; // rotate -135° (start top-left)

  const color =
    score >= 70 ? "#22C55E" :
    score >= 45 ? "#F59E0B" :
                  "#EF4444";

  return (
    <div className="relative flex items-center justify-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} style={{ transform: "rotate(-225deg)" }}>
        {/* Track */}
        <circle
          cx={size / 2} cy={size / 2} r={r}
          fill="none"
          stroke="var(--border-subtle)"
          strokeWidth={stroke}
          strokeDasharray={`${arc} ${circ - arc}`}
          strokeDashoffset={-offset}
          strokeLinecap="round"
        />
        {/* Fill */}
        <circle
          cx={size / 2} cy={size / 2} r={r}
          fill="none"
          stroke={color}
          strokeWidth={stroke}
          strokeDasharray={`${filled} ${circ - filled}`}
          strokeDashoffset={-offset}
          strokeLinecap="round"
          style={{ transition: "stroke-dasharray 0.6s ease" }}
        />
      </svg>
      <span
        className="absolute text-[13px] font-bold tabular-nums"
        style={{ color }}
      >
        {score}
      </span>
    </div>
  );
}

function Sparkline({ data, color }: { data: number[]; color: string }) {
  if (data.length < 2) return null;
  const W = 64, H = 24, PAD = 2;
  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;
  const xs = data.map((_, i) => PAD + (i / (data.length - 1)) * (W - PAD * 2));
  const ys = data.map((v) => PAD + ((max - v) / range) * (H - PAD * 2));

  // Smooth polyline using bezier control points
  const pts = xs.map((x, i) => ({ x, y: ys[i] }));
  let d = `M ${pts[0].x},${pts[0].y}`;
  for (let i = 1; i < pts.length; i++) {
    const cp1x = (pts[i - 1].x + pts[i].x) / 2;
    const cp1y = pts[i - 1].y;
    const cp2x = (pts[i - 1].x + pts[i].x) / 2;
    const cp2y = pts[i].y;
    d += ` C ${cp1x},${cp1y} ${cp2x},${cp2y} ${pts[i].x},${pts[i].y}`;
  }

  const trend = data[data.length - 1] - data[0];
  const TrendIcon = trend > 2 ? "↑" : trend < -2 ? "↓" : "→";
  const trendColor = trend > 2 ? "#22C55E" : trend < -2 ? "#EF4444" : "#F59E0B";

  return (
    <div className="flex items-end gap-1.5">
      <svg width={W} height={H} className="overflow-visible">
        <defs>
          <linearGradient id={`sg-${color.replace("#","")}`} x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity="0.25" />
            <stop offset="100%" stopColor={color} stopOpacity="0" />
          </linearGradient>
        </defs>
        {/* Fill */}
        <path
          d={`${d} L ${pts[pts.length-1].x},${H} L ${pts[0].x},${H} Z`}
          fill={`url(#sg-${color.replace("#","")})`}
        />
        {/* Line */}
        <path d={d} fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        {/* End dot */}
        <circle cx={pts[pts.length-1].x} cy={pts[pts.length-1].y} r="2" fill={color} />
      </svg>
      <span className="text-[10px] font-semibold leading-none mb-0.5" style={{ color: trendColor }}>
        {TrendIcon}
      </span>
    </div>
  );
}

export function AccountCard({
  id, name, industry, arr, health, contractEnd,
  score, scoreHistory, kamName, openSignals, openActionCount,
}: AccountCardProps) {
  const cfg      = HEALTH_CONFIG[health];
  const HealthIcon = cfg.icon;
  const days     = daysUntil(contractEnd);
  const renewalUrgent = days !== null && days <= 90;

  const topSignal = openSignals.find((s) => s.severity === "CRITICAL") ?? openSignals[0];

  return (
    <Link href={`/accounts/${id}`} className="block group">
      <div
        className={cn(
          "rounded-xl border transition-all duration-200 cursor-pointer",
          "bg-[var(--glass-bg)] [backdrop-filter:var(--glass-blur)]",
          "shadow-[var(--glass-shadow)] hover:shadow-lg",
          "border-[var(--glass-border)] hover:border-[var(--border-default)]",
          "group-hover:-translate-y-0.5",
          health === "CRITICAL" && "border-l-4 border-l-[#EF4444]",
          health === "AT_RISK"  && "border-l-4 border-l-[#F59E0B]",
        )}
      >
        {/* Header */}
        <div className="p-4 pb-3">
          <div className="flex items-start justify-between gap-2 mb-2">
            <div className="min-w-0">
              <h3
                className="text-[14px] font-semibold text-[var(--text-primary)] truncate leading-tight"
                title={name}
              >
                {name}
              </h3>
              {industry && (
                <span className="text-[11px] text-[var(--text-muted)] truncate">{industry}</span>
              )}
            </div>
            <Badge variant={cfg.variant} className="shrink-0 flex items-center gap-1">
              <HealthIcon className="h-3 w-3" />
              {cfg.label}
            </Badge>
          </div>

          {/* ARR + Score row */}
          <div className="flex items-center justify-between mt-3">
            <div>
              <p className="text-[11px] text-[var(--text-muted)] uppercase tracking-wider mb-0.5">ARR</p>
              <p className="text-[22px] font-bold text-[var(--text-primary)] leading-none tabular-nums">
                {formatARR(arr)}
              </p>
            </div>
            {score !== null ? (
              <ScoreArc score={score} />
            ) : (
              <div className="flex flex-col items-center justify-center w-[52px] h-[52px]">
                <span className="text-[10px] text-[var(--text-disabled)] text-center leading-tight">No score</span>
              </div>
            )}
          </div>

          {/* Score sparkline */}
          {scoreHistory.length >= 2 && (
            <div className="mt-3 flex items-center justify-between">
              <span className="text-[10px] text-[var(--text-disabled)] uppercase tracking-wider">Score trend</span>
              <Sparkline data={scoreHistory} color={cfg.color} />
            </div>
          )}
        </div>

        {/* Divider */}
        <div className="h-px bg-[var(--border-subtle)] mx-4" />

        {/* Footer meta */}
        <div className="px-4 py-3 space-y-2">
          {/* Renewal */}
          {days !== null && (
            <div className="flex items-center gap-1.5">
              <Calendar className="h-3.5 w-3.5 shrink-0 text-[var(--text-disabled)]" />
              <span
                className={cn(
                  "text-[11px]",
                  renewalUrgent
                    ? days <= 60 ? "text-[#EF4444] font-semibold" : "text-[#F59E0B] font-medium"
                    : "text-[var(--text-muted)]"
                )}
              >
                {days <= 0
                  ? "Renewal overdue"
                  : `Renewal in ${days}d`}
              </span>
            </div>
          )}

          {/* Top signal */}
          {topSignal && (
            <div className="flex items-start gap-1.5">
              <Zap
                className="h-3.5 w-3.5 shrink-0 mt-px"
                style={{ color: topSignal.severity === "CRITICAL" ? "#EF4444" : "#F59E0B" }}
              />
              <span className="text-[11px] text-[var(--text-secondary)] line-clamp-1 leading-tight">
                {topSignal.title}
              </span>
            </div>
          )}

          {/* Bottom row: actions + KAM */}
          <div className="flex items-center justify-between pt-0.5">
            <div className="flex items-center gap-1.5">
              <ListTodo className="h-3.5 w-3.5 text-[var(--text-disabled)]" />
              <span className="text-[11px] text-[var(--text-muted)]">
                {openActionCount} action{openActionCount !== 1 ? "s" : ""}
              </span>
            </div>
            {kamName && (
              <div className="flex items-center gap-1">
                <div className="h-4 w-4 rounded-full bg-[#0755E9] flex items-center justify-center">
                  <span className="text-[8px] font-bold text-white">
                    {kamName.split(" ").map((n) => n[0]).join("").slice(0, 2)}
                  </span>
                </div>
                <span className="text-[11px] text-[var(--text-muted)]">{kamName.split(" ")[0]}</span>
              </div>
            )}
          </div>
        </div>
      </div>
    </Link>
  );
}

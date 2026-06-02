"use client";

import { useState } from "react";
import { ChevronDown, ChevronRight, Database, TrendingUp, Zap, FileText, Link2, Activity, Users, Target, BarChart2 } from "lucide-react";
import { cn } from "@/lib/utils";
import type { AgentSource } from "@/lib/ai/agents/types";

const TYPE_CONFIG: Record<string, { icon: React.ElementType; color: string; label: string }> = {
  kpi:         { icon: BarChart2,   color: "#0755E9", label: "KPI"       },
  signal:      { icon: Zap,         color: "#EF4444", label: "Signal"    },
  score:       { icon: TrendingUp,  color: "#22C55E", label: "Score"     },
  kyc:         { icon: FileText,    color: "#8B5CF6", label: "KYC"       },
  document:    { icon: FileText,    color: "#F59E0B", label: "Document"  },
  adapter:     { icon: Link2,       color: "#06B6D4", label: "Adapter"   },
  action:      { icon: Activity,    color: "#7C3AED", label: "Action"    },
  touchpoint:  { icon: Users,       color: "#14B8A6", label: "Touchpoint"},
  contact:     { icon: Users,       color: "#0EA5E9", label: "Contact"   },
  opportunity: { icon: Target,      color: "#F97316", label: "Opportunity"},
};

function SourceItem({ source }: { source: AgentSource }) {
  const cfg = TYPE_CONFIG[source.type] ?? { icon: Database, color: "#6B7280", label: source.type };
  const Icon = cfg.icon;

  return (
    <div className="flex items-start gap-2.5 py-1.5">
      <div
        className="flex h-5 w-5 shrink-0 items-center justify-center rounded mt-0.5"
        style={{ background: `${cfg.color}15` }}
      >
        <Icon className="h-3 w-3" style={{ color: cfg.color }} />
      </div>
      <div className="min-w-0 flex-1">
        <span className="text-[11px] font-medium text-[var(--text-primary)]">{source.label}</span>
        {source.value && (
          <span className="text-[11px] text-[var(--text-muted)] ml-1.5 truncate">
            — {source.value}
          </span>
        )}
      </div>
      <span
        className="shrink-0 text-[9px] font-semibold rounded px-1.5 py-px"
        style={{ color: cfg.color, background: `${cfg.color}15` }}
      >
        {cfg.label}
      </span>
    </div>
  );
}

interface SourcesPanelProps {
  sources: AgentSource[];
  className?: string;
  label?: string;
}

export function SourcesPanel({ sources, className, label = "AI Data Sources" }: SourcesPanelProps) {
  const [expanded, setExpanded] = useState(false);

  if (!sources?.length) return null;

  // Group by type for the summary chip
  const typeCounts = sources.reduce<Record<string, number>>((acc, s) => {
    acc[s.type] = (acc[s.type] ?? 0) + 1;
    return acc;
  }, {});

  const summaryChips = Object.entries(typeCounts)
    .slice(0, 3)
    .map(([type, count]) => {
      const cfg = TYPE_CONFIG[type];
      return { type, count, color: cfg?.color ?? "#6B7280", label: cfg?.label ?? type };
    });

  return (
    <div className={cn("rounded-xl border border-[#14B8A6]/20 bg-[#14B8A6]/5", className)}>
      <button
        onClick={() => setExpanded((x) => !x)}
        className="w-full flex items-center gap-2.5 px-4 py-2.5 text-left hover:bg-[#14B8A6]/5 transition-colors rounded-xl"
      >
        <Database className="h-3.5 w-3.5 text-[#14B8A6] shrink-0" />
        <span className="text-[12px] font-semibold text-[#14B8A6] flex-1">{label}</span>

        {/* Summary chips */}
        <div className="hidden sm:flex items-center gap-1 mr-1">
          {summaryChips.map(({ type, count, color, label: chipLabel }) => (
            <span
              key={type}
              className="text-[9px] font-semibold rounded-full px-1.5 py-px"
              style={{ color, background: `${color}15` }}
            >
              {count} {chipLabel}{count !== 1 ? "s" : ""}
            </span>
          ))}
        </div>

        <span className="text-[10px] text-[var(--text-muted)] shrink-0 mr-1">
          {sources.length} data point{sources.length !== 1 ? "s" : ""}
        </span>
        {expanded
          ? <ChevronDown className="h-3.5 w-3.5 text-[#14B8A6] shrink-0" />
          : <ChevronRight className="h-3.5 w-3.5 text-[#14B8A6] shrink-0" />
        }
      </button>

      {expanded && (
        <div className="px-4 pb-3 border-t border-[#14B8A6]/15 divide-y divide-[var(--border-subtle)]">
          {sources.map((source, i) => (
            <SourceItem key={i} source={source} />
          ))}
        </div>
      )}
    </div>
  );
}

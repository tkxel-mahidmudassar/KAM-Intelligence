"use client";

import { useState } from "react";
import { ChevronDown, ChevronRight, Cpu, Clock } from "lucide-react";
import { cn } from "@/lib/utils";
import { useRole } from "@/context/RoleContext";

export interface AgentStep {
  name: string;
  input: string;
  output: string;
  latencyMs: number;
}

interface AgentTracePanelProps {
  steps: AgentStep[];
  model?: string;
  totalLatencyMs?: number;
  className?: string;
}

function StepRow({ step, index }: { step: AgentStep; index: number }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="border border-[var(--border-subtle)] rounded-lg overflow-hidden">
      <button
        onClick={() => setOpen((x) => !x)}
        className="w-full flex items-center gap-2.5 px-3 py-2 text-left hover:bg-[var(--bg-surface-2)] transition-colors"
      >
        <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded bg-[#A855F7]/15 text-[10px] font-bold text-[#A855F7]">
          {index + 1}
        </span>
        <span className="flex-1 text-[12px] font-medium text-[var(--text-primary)] truncate">
          {step.name}
        </span>
        <span className="flex items-center gap-1 text-[10px] text-[var(--text-muted)] shrink-0">
          <Clock className="h-3 w-3" />
          {step.latencyMs < 1000 ? `${step.latencyMs}ms` : `${(step.latencyMs / 1000).toFixed(1)}s`}
        </span>
        {open
          ? <ChevronDown className="h-3.5 w-3.5 text-[var(--text-muted)] shrink-0" />
          : <ChevronRight className="h-3.5 w-3.5 text-[var(--text-muted)] shrink-0" />
        }
      </button>

      {open && (
        <div className="border-t border-[var(--border-subtle)] divide-y divide-[var(--border-subtle)]">
          <div className="px-3 py-2 space-y-1">
            <p className="text-[10px] font-semibold text-[var(--text-muted)] uppercase tracking-wider">Prompt (truncated)</p>
            <pre className="text-[11px] text-[var(--text-secondary)] whitespace-pre-wrap break-words font-mono leading-relaxed max-h-32 overflow-y-auto">
              {step.input || "(empty)"}
            </pre>
          </div>
          <div className="px-3 py-2 space-y-1">
            <p className="text-[10px] font-semibold text-[var(--text-muted)] uppercase tracking-wider">Response (truncated)</p>
            <pre className="text-[11px] text-[var(--text-secondary)] whitespace-pre-wrap break-words font-mono leading-relaxed max-h-32 overflow-y-auto">
              {step.output || "(empty)"}
            </pre>
          </div>
        </div>
      )}
    </div>
  );
}

export function AgentTracePanel({ steps, model, totalLatencyMs, className }: AgentTracePanelProps) {
  const { role } = useRole();
  const [expanded, setExpanded] = useState(false);

  if (role === "EXECUTIVE" || !steps?.length) return null;

  const totalMs = totalLatencyMs ?? steps.reduce((s, st) => s + st.latencyMs, 0);

  return (
    <div className={cn("rounded-xl border border-[#A855F7]/20 bg-[#A855F7]/5", className)}>
      <button
        onClick={() => setExpanded((x) => !x)}
        className="w-full flex items-center gap-2.5 px-4 py-2.5 text-left"
      >
        <Cpu className="h-3.5 w-3.5 text-[#A855F7] shrink-0" />
        <span className="text-[12px] font-semibold text-[#A855F7] flex-1">
          AI Reasoning Steps
        </span>
        <span className="text-[10px] text-[var(--text-muted)] shrink-0">
          {steps.length} step{steps.length !== 1 ? "s" : ""} &middot; {model ?? "gemini"} &middot; {totalMs < 1000 ? `${totalMs}ms` : `${(totalMs / 1000).toFixed(1)}s`}
        </span>
        {expanded
          ? <ChevronDown className="h-3.5 w-3.5 text-[#A855F7] shrink-0" />
          : <ChevronRight className="h-3.5 w-3.5 text-[#A855F7] shrink-0" />
        }
      </button>

      {expanded && (
        <div className="px-4 pb-3 space-y-2">
          {steps.map((step, i) => (
            <StepRow key={i} step={step} index={i} />
          ))}
        </div>
      )}
    </div>
  );
}

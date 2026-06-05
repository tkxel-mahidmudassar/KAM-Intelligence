"use client";

import { useEffect, useState } from "react";
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ReferenceLine, ResponsiveContainer, ReferenceArea,
} from "recharts";

interface ScorePoint {
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
  health: string;
  computedAt: string;
}

interface ScoreHistoryChartProps {
  accountId: string;
  refreshKey?: number;
}

function fmt(iso: string) {
  return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}

function healthColor(overall: number) {
  return overall >= 70 ? "#22C55E" : overall >= 45 ? "#F59E0B" : "#EF4444";
}

function CustomTooltip({ active, payload, label }: { active?: boolean; payload?: { payload: ScorePoint }[]; label?: string }) {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload;
  const dims = [
    { key: "csat",           label: "CSAT" },
    { key: "relationship",   label: "Relationship" },
    { key: "risk",           label: "Risk" },
    { key: "contractHealth", label: "Contract" },
    { key: "projectHealth",  label: "Project" },
    { key: "resourceHealth", label: "Resource" },
    { key: "financial",      label: "Financial" },
    { key: "whitespace",     label: "Whitespace" },
  ] as const;

  return (
    <div className="rounded-lg border border-[var(--glass-elevated-border)] bg-[var(--glass-elevated-bg)] px-3 py-2.5 text-[11px] shadow-xl min-w-[160px]">
      <p className="font-semibold text-[var(--text-muted)] mb-1.5">{label}</p>
      <p className="text-[14px] font-bold mb-2" style={{ color: healthColor(d.overall) }}>
        {Math.round(d.overall)}<span className="text-[11px] font-normal text-[var(--text-muted)]">/100</span>
      </p>
      <div className="grid grid-cols-2 gap-x-3 gap-y-0.5">
        {dims.map(({ key, label: lbl }) => {
          const v = d[key];
          return (
            <div key={key} className="flex items-center justify-between gap-2">
              <span className="text-[var(--text-disabled)]">{lbl}</span>
              <span className="font-semibold" style={{ color: v != null ? healthColor(v) : "#6B7280" }}>
                {v != null ? Math.round(v) : "-"}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function ScoreHistoryChart({ accountId, refreshKey = 0 }: ScoreHistoryChartProps) {
  const [scores, setScores] = useState<ScorePoint[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    fetch(`/api/accounts/${accountId}/scores?limit=10`)
      .then((r) => r.json())
      .then((d) => setScores(Array.isArray(d.data) ? d.data : []))
      .catch(() => setScores([]))
      .finally(() => setLoading(false));
  }, [accountId, refreshKey]);

  if (loading) {
    return (
      <div className="rounded-xl border border-[var(--glass-border)] bg-[var(--glass-bg)] [backdrop-filter:var(--glass-blur)] p-4 h-[200px] flex items-center justify-center">
        <div className="h-4 w-4 rounded-full border-2 border-[#0755E9] border-t-transparent animate-spin" />
      </div>
    );
  }

  if (scores.length < 2) return null;

  const data = scores.map((s) => ({
    ...s,
    label: fmt(s.computedAt),
    overall: Math.round(s.overall),
  }));

  return (
    <div className="rounded-xl border border-[var(--glass-border)] bg-[var(--glass-bg)] [backdrop-filter:var(--glass-blur)] p-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-[12px] font-semibold text-[var(--text-primary)] uppercase tracking-wider">
          Score History
        </h3>
        <div className="flex items-center gap-3 text-[10px] text-[var(--text-disabled)]">
          <span className="flex items-center gap-1">
            <span className="inline-block h-2 w-2 rounded-sm" style={{ background: "#22C55E33", border: "1px solid #22C55E66" }} />
            Healthy
          </span>
          <span className="flex items-center gap-1">
            <span className="inline-block h-2 w-2 rounded-sm" style={{ background: "#F59E0B33", border: "1px solid #F59E0B66" }} />
            At Risk
          </span>
          <span className="flex items-center gap-1">
            <span className="inline-block h-2 w-2 rounded-sm" style={{ background: "#EF444433", border: "1px solid #EF444466" }} />
            Critical
          </span>
        </div>
      </div>

      <ResponsiveContainer width="100%" height={180}>
        <LineChart data={data} margin={{ top: 4, right: 8, bottom: 0, left: -12 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--border-subtle)" vertical={false} />

          {/* Health band backgrounds */}
          <ReferenceArea y1={70} y2={100} fill="#22C55E" fillOpacity={0.06} />
          <ReferenceArea y1={45} y2={70}  fill="#F59E0B" fillOpacity={0.06} />
          <ReferenceArea y1={0}  y2={45}  fill="#EF4444" fillOpacity={0.06} />

          {/* Threshold lines */}
          <ReferenceLine y={70} stroke="#22C55E" strokeOpacity={0.4} strokeDasharray="4 3" strokeWidth={1} />
          <ReferenceLine y={45} stroke="#F59E0B" strokeOpacity={0.4} strokeDasharray="4 3" strokeWidth={1} />

          <XAxis
            dataKey="label"
            tick={{ fontSize: 10, fill: "var(--text-disabled)" }}
            axisLine={false}
            tickLine={false}
            interval="preserveStartEnd"
          />
          <YAxis
            domain={[0, 100]}
            tick={{ fontSize: 10, fill: "var(--text-disabled)" }}
            axisLine={false}
            tickLine={false}
            ticks={[0, 45, 70, 100]}
          />

          <Tooltip content={<CustomTooltip />} />

          <Line
            type="monotone"
            dataKey="overall"
            stroke="#0755E9"
            strokeWidth={2}
            dot={(props: { cx: number; cy: number; payload: ScorePoint }) => {
              const { cx, cy, payload } = props;
              return (
                <circle
                  key={payload.id}
                  cx={cx}
                  cy={cy}
                  r={3.5}
                  fill={healthColor(payload.overall)}
                  stroke="var(--glass-bg)"
                  strokeWidth={1.5}
                />
              );
            }}
            activeDot={{ r: 5, fill: "#0755E9" }}
            isAnimationActive={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

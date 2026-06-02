"use client";

import { useState, useEffect } from "react";
import {
  Sparkles, Loader2, Save, CheckCircle2, Info, ChevronRight,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useRole } from "@/context/RoleContext";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface QuestionnaireResponse {
  id:          string;
  questionId:  string;
  section:     string;
  response:    string;
  inputType:   string;
  prepopulated: boolean;
  confidence:  number | null;
  confirmedBy: string | null;
  updatedAt:   string;
}

interface Suggestion {
  response:   string;
  confidence: number;
  rationale:  string;
}

interface QuestionnaireTabProps {
  accountId: string;
}

// ─── Question definitions ─────────────────────────────────────────────────────

type InputType = "SCALE" | "BOOLEAN" | "SELECT";

interface Question {
  id:       string;
  label:    string;
  hint?:    string;
  inputType: InputType;
  options?: string[];
}

interface SectionDef {
  id:      string;
  label:   string;
  kpiKey:  string;
  color:   string;
  bg:      string;
  questions: Question[];
  computeScore: (r: Record<string, string>) => number;
}

const SECTIONS: SectionDef[] = [
  {
    id: "csat", label: "CSAT", kpiKey: "csat",
    color: "#0755E9", bg: "#0755E9",
    questions: [
      { id: "csat_score",         label: "CSAT score from last survey",        hint: "1 = very dissatisfied, 10 = very satisfied",   inputType: "SCALE",   options: ["1","2","3","4","5","6","7","8","9","10"] },
      { id: "nps_score",          label: "Net Promoter Score (NPS)",            hint: "0 = detractor, 10 = strong promoter",          inputType: "SCALE",   options: ["0","1","2","3","4","5","6","7","8","9","10"] },
      { id: "survey_recency",     label: "Survey conducted within last 90 days?",                                                      inputType: "BOOLEAN" },
      { id: "satisfaction_trend", label: "Satisfaction trend (last 2 periods)",                                                       inputType: "SELECT",  options: ["IMPROVING","STABLE","DECLINING"] },
    ],
    computeScore(r) {
      const csat  = Number(r.csat_score ?? 5) / 10 * 50;
      const nps   = Number(r.nps_score  ?? 5) / 10 * 30;
      const rec   = r.survey_recency === "true"        ?  10 : 0;
      const trend = r.satisfaction_trend === "IMPROVING" ? 10 : r.satisfaction_trend === "STABLE" ? 5 : 0;
      return Math.round(Math.min(100, csat + nps + rec + trend));
    },
  },
  {
    id: "relationship", label: "Relationship", kpiKey: "relationship",
    color: "#8B5CF6", bg: "#8B5CF6",
    questions: [
      { id: "exec_sponsor_engaged", label: "Executive sponsor actively engaged?",   inputType: "BOOLEAN" },
      { id: "stakeholder_breadth",  label: "Number of stakeholder contacts (1–5)",  hint: "1 = single contact, 5 = 5+ contacts",      inputType: "SCALE",   options: ["1","2","3","4","5"] },
      { id: "meeting_cadence",      label: "Regular meeting cadence maintained?",   inputType: "BOOLEAN" },
      { id: "champion_strength",    label: "Internal champion strength",            inputType: "SELECT",  options: ["STRONG","MODERATE","WEAK","NONE"] },
    ],
    computeScore(r) {
      const exec    = r.exec_sponsor_engaged === "true"     ? 25 :  0;
      const breadth = (Number(r.stakeholder_breadth ?? 2)) / 5 * 25;
      const cadence = r.meeting_cadence === "true"          ? 20 :  0;
      const champ   = r.champion_strength === "STRONG" ? 30 : r.champion_strength === "MODERATE" ? 20 : r.champion_strength === "WEAK" ? 10 : 0;
      return Math.round(Math.min(100, exec + breadth + cadence + champ));
    },
  },
  {
    id: "risk", label: "Risk", kpiKey: "risk",
    color: "#EF4444", bg: "#EF4444",
    questions: [
      { id: "competitive_threat",  label: "Competitive threat level",          inputType: "SELECT",  options: ["LOW","MEDIUM","HIGH","CRITICAL"] },
      { id: "budget_risk",         label: "Budget / renewal risk",             inputType: "SELECT",  options: ["LOW","MEDIUM","HIGH"] },
      { id: "key_person_risk",     label: "Key person dependency risk",        inputType: "SELECT",  options: ["LOW","MEDIUM","HIGH"] },
      { id: "strategic_alignment", label: "Strategic alignment score (1–5)",   hint: "1 = misaligned, 5 = fully aligned",  inputType: "SCALE",   options: ["1","2","3","4","5"] },
    ],
    computeScore(r) {
      const threat = r.competitive_threat === "LOW" ? 25 : r.competitive_threat === "MEDIUM" ? 15 : r.competitive_threat === "HIGH" ? 5 : 0;
      const budget = r.budget_risk === "LOW"        ? 25 : r.budget_risk === "MEDIUM"        ? 15 : 5;
      const person = r.key_person_risk === "LOW"    ? 25 : r.key_person_risk === "MEDIUM"    ? 15 : 5;
      const align  = Number(r.strategic_alignment ?? 3) / 5 * 25;
      return Math.round(Math.min(100, threat + budget + person + align));
    },
  },
  {
    id: "contract", label: "Contract", kpiKey: "contractHealth",
    color: "#F59E0B", bg: "#F59E0B",
    questions: [
      { id: "renewal_probability",   label: "Renewal probability %",                  hint: "Your estimate of the likelihood of renewal",  inputType: "SCALE",   options: ["0","10","20","30","40","50","60","70","80","90","100"] },
      { id: "payment_timeliness",    label: "Payment timeliness",                     inputType: "SELECT",  options: ["ALWAYS","USUALLY","SOMETIMES","RARELY"] },
      { id: "contract_satisfaction", label: "Contract terms satisfaction (1–5)",      hint: "Client satisfaction with contract terms",     inputType: "SCALE",   options: ["1","2","3","4","5"] },
      { id: "expansion_interest",    label: "Client expansion interest",              inputType: "SELECT",  options: ["HIGH","MEDIUM","LOW","NONE"] },
    ],
    computeScore(r) {
      const renewal  = Number(r.renewal_probability ?? 50) * 0.4;
      const payment  = r.payment_timeliness === "ALWAYS" ? 25 : r.payment_timeliness === "USUALLY" ? 18 : r.payment_timeliness === "SOMETIMES" ? 10 : 0;
      const satisf   = Number(r.contract_satisfaction ?? 3) / 5 * 25;
      const expand   = r.expansion_interest === "HIGH" ? 10 : r.expansion_interest === "MEDIUM" ? 7 : r.expansion_interest === "LOW" ? 3 : 0;
      return Math.round(Math.min(100, renewal + payment + satisf + expand));
    },
  },
  {
    id: "whitespace", label: "Whitespace", kpiKey: "whitespace",
    color: "#22C55E", bg: "#22C55E",
    questions: [
      { id: "untapped_products",    label: "Untapped product / service lines (0–5)",  hint: "Number of additional offerings the client could adopt",  inputType: "SCALE",   options: ["0","1","2","3","4","5"] },
      { id: "upsell_potential",     label: "Upsell potential score (1–5)",            hint: "1 = low, 5 = high",                                      inputType: "SCALE",   options: ["1","2","3","4","5"] },
      { id: "cross_sell_potential", label: "Cross-sell potential score (1–5)",        hint: "1 = low, 5 = high",                                      inputType: "SCALE",   options: ["1","2","3","4","5"] },
      { id: "solution_utilization", label: "Current solution utilization %",          hint: "How much of the purchased solution is being actively used", inputType: "SCALE", options: ["0","10","20","30","40","50","60","70","80","90","100"] },
    ],
    computeScore(r) {
      const untapped = Number(r.untapped_products    ?? 2) / 5 * 30;
      const upsell   = Number(r.upsell_potential     ?? 3) / 5 * 35;
      const cross    = Number(r.cross_sell_potential ?? 3) / 5 * 35;
      return Math.round(Math.min(100, untapped + upsell + cross));
    },
  },
];

// ─── Single question input ────────────────────────────────────────────────────

function QuestionInput({
  question,
  value,
  onChange,
  suggestion,
  disabled,
}: {
  question:   Question;
  value:      string;
  onChange:   (v: string) => void;
  suggestion: Suggestion | null;
  disabled:   boolean;
}) {
  const hasSuggestion = !!suggestion;

  return (
    <div className="space-y-1.5">
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1">
          <label className="text-[12px] font-medium text-[var(--text-primary)]">{question.label}</label>
          {question.hint && (
            <p className="text-[11px] text-[var(--text-muted)] mt-0.5">{question.hint}</p>
          )}
        </div>
        {hasSuggestion && (
          <div
            className="flex items-center gap-1 shrink-0 mt-0.5"
            title={suggestion.rationale}
          >
            <Sparkles className="h-3 w-3 text-[#0755E9]" />
            <span className="text-[10px] text-[#0755E9] font-medium">
              {Math.round(suggestion.confidence * 100)}%
            </span>
          </div>
        )}
      </div>

      {question.inputType === "BOOLEAN" && (
        <div className="flex gap-2">
          {["true", "false"].map((v) => (
            <button
              key={v}
              disabled={disabled}
              onClick={() => onChange(v)}
              className={cn(
                "flex-1 py-1.5 rounded-lg text-[12px] font-medium border transition-all disabled:opacity-50",
                value === v
                  ? "bg-[#0755E9] border-[#0755E9] text-white"
                  : "border-[var(--border-subtle)] text-[var(--text-muted)] hover:border-[#0755E9]/50 hover:text-[var(--text-primary)]"
              )}
            >
              {v === "true" ? "Yes" : "No"}
            </button>
          ))}
        </div>
      )}

      {question.inputType === "SELECT" && question.options && (
        <div className="flex flex-wrap gap-1.5">
          {question.options.map((opt) => (
            <button
              key={opt}
              disabled={disabled}
              onClick={() => onChange(opt)}
              className={cn(
                "px-2.5 py-1 rounded-lg text-[11px] font-semibold border transition-all disabled:opacity-50",
                value === opt
                  ? "bg-[#0755E9] border-[#0755E9] text-white"
                  : "border-[var(--border-subtle)] text-[var(--text-muted)] hover:border-[#0755E9]/50 hover:text-[var(--text-primary)]"
              )}
            >
              {opt}
            </button>
          ))}
        </div>
      )}

      {question.inputType === "SCALE" && question.options && (
        <div className="flex gap-1 flex-wrap">
          {question.options.map((opt) => (
            <button
              key={opt}
              disabled={disabled}
              onClick={() => onChange(opt)}
              className={cn(
                "h-8 min-w-[32px] px-1.5 rounded-lg text-[12px] font-semibold border transition-all disabled:opacity-50",
                value === opt
                  ? "bg-[#0755E9] border-[#0755E9] text-white"
                  : "border-[var(--border-subtle)] text-[var(--text-muted)] hover:border-[#0755E9]/50 hover:text-[var(--text-primary)]"
              )}
            >
              {opt}
            </button>
          ))}
        </div>
      )}

      {/* AI suggestion apply button */}
      {hasSuggestion && suggestion.response !== value && (
        <button
          disabled={disabled}
          onClick={() => onChange(suggestion.response)}
          className="flex items-center gap-1 text-[11px] text-[#0755E9] hover:text-[#0644C0] disabled:opacity-50 transition-colors"
        >
          <Sparkles className="h-3 w-3" />
          Apply suggestion: <span className="font-semibold">{suggestion.response === "true" ? "Yes" : suggestion.response === "false" ? "No" : suggestion.response}</span>
        </button>
      )}
    </div>
  );
}

// ─── Score preview badge ──────────────────────────────────────────────────────

function ScorePreview({ score }: { score: number | null }) {
  if (score === null) return null;
  const color = score >= 70 ? "#22C55E" : score >= 45 ? "#F59E0B" : "#EF4444";
  return (
    <div
      className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-white text-[12px] font-semibold"
      style={{ background: color }}
    >
      <ChevronRight className="h-3.5 w-3.5" />
      Score: {score}/100
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export function QuestionnaireTab({ accountId }: QuestionnaireTabProps) {
  const { role } = useRole();
  const canEdit = role === "KAM" || role === "MANAGER";

  const [activeSection, setActiveSection] = useState<string>(SECTIONS[0].id);

  // responses[sectionId][questionId] = value
  const [responses, setResponses] = useState<Record<string, Record<string, string>>>({});

  // suggestions[sectionId][questionId] = Suggestion
  const [suggestions, setSuggestions] = useState<Record<string, Record<string, Suggestion>>>({});

  // per-section loading states
  const [loadingAi, setLoadingAi]     = useState<Record<string, boolean>>({});
  const [saving, setSaving]           = useState<Record<string, boolean>>({});
  const [saved, setSaved]             = useState<Record<string, boolean>>({});
  const [loadingData, setLoadingData] = useState(true);

  const section = SECTIONS.find((s) => s.id === activeSection)!;

  // ── Load existing responses ───────────────────────────────────────────────

  useEffect(() => {
    setLoadingData(true);
    fetch(`/api/questionnaire?accountId=${accountId}`, {
      headers: { "x-role": role },
    })
      .then((r) => r.json())
      .then((json) => {
        if (!json.data?.bySection) return;
        const loaded: Record<string, Record<string, string>> = {};
        for (const [sec, qMap] of Object.entries(json.data.bySection as Record<string, Record<string, { response: string }>>)) {
          loaded[sec] = {};
          for (const [qId, q] of Object.entries(qMap)) {
            loaded[sec][qId] = q.response;
          }
        }
        setResponses(loaded);
      })
      .catch(() => {})
      .finally(() => setLoadingData(false));
  }, [accountId, role]);

  // ── Handlers ─────────────────────────────────────────────────────────────

  const setResponse = (secId: string, qId: string, value: string) => {
    setResponses((prev) => ({
      ...prev,
      [secId]: { ...(prev[secId] ?? {}), [qId]: value },
    }));
    setSaved((prev) => ({ ...prev, [secId]: false }));
  };

  const handleAiPrefill = async (secId: string) => {
    setLoadingAi((prev) => ({ ...prev, [secId]: true }));
    try {
      const res  = await fetch("/api/ai/questionnaire", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-role": role },
        body: JSON.stringify({ accountId, section: secId }),
      });
      const json = await res.json();
      if (!json.data?.suggestions) return;

      const secs = SECTIONS.find((s) => s.id === secId);
      if (!secs) return;

      setSuggestions((prev) => ({ ...prev, [secId]: json.data.suggestions }));

      // Auto-apply to empty fields only
      const newResponses = { ...(responses[secId] ?? {}) };
      for (const q of secs.questions) {
        if (!newResponses[q.id] && json.data.suggestions[q.id]) {
          newResponses[q.id] = json.data.suggestions[q.id].response;
        }
      }
      setResponses((prev) => ({ ...prev, [secId]: newResponses }));
      setSaved((prev) => ({ ...prev, [secId]: false }));
    } catch {
      // silently fail
    } finally {
      setLoadingAi((prev) => ({ ...prev, [secId]: false }));
    }
  };

  const handleSave = async (secDef: SectionDef) => {
    const secResponses = responses[secDef.id] ?? {};
    setSaving((prev) => ({ ...prev, [secDef.id]: true }));
    try {
      const payload = secDef.questions.map((q) => ({
        questionId:   q.id,
        response:     secResponses[q.id] ?? "",
        inputType:    q.inputType,
        prepopulated: !!(suggestions[secDef.id]?.[q.id]),
        confidence:   suggestions[secDef.id]?.[q.id]?.confidence ?? null,
        confirmedBy:  role,
      }));

      await fetch("/api/questionnaire", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-role": role },
        body: JSON.stringify({ accountId, section: secDef.id, responses: payload }),
      });

      // Compute score and push to KPI scoring
      const score = secDef.computeScore(secResponses);
      await fetch("/api/ai/score", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-role": role },
        body: JSON.stringify({
          accountId,
          kpi:    secDef.kpiKey,
          value:  score,
          source: "questionnaire",
        }),
      });

      setSaved((prev) => ({ ...prev, [secDef.id]: true }));
      setTimeout(() => setSaved((prev) => ({ ...prev, [secDef.id]: false })), 3000);
    } catch {
      // silently fail
    } finally {
      setSaving((prev) => ({ ...prev, [secDef.id]: false }));
    }
  };

  // ── Derived state ─────────────────────────────────────────────────────────

  const computedScore = (secDef: SectionDef): number | null => {
    const r = responses[secDef.id] ?? {};
    const answered = secDef.questions.filter((q) => r[q.id]).length;
    if (answered === 0) return null;
    return secDef.computeScore(r);
  };

  const completionPct = (secDef: SectionDef): number => {
    const r = responses[secDef.id] ?? {};
    const answered = secDef.questions.filter((q) => r[q.id]).length;
    return Math.round((answered / secDef.questions.length) * 100);
  };

  // ── Render ────────────────────────────────────────────────────────────────

  if (loadingData) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="h-6 w-6 animate-spin text-[var(--text-disabled)]" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Score engine info banner */}
      <div className="flex items-start gap-2.5 rounded-xl border border-[#0755E9]/20 bg-[#0755E9]/6 px-3.5 py-3">
        <Info className="h-4 w-4 text-[#0755E9] shrink-0 mt-px" />
        <p className="text-[12px] text-[var(--text-secondary)] leading-relaxed">
          <span className="font-semibold text-[var(--text-primary)]">Confirmed responses feed into the KAM Score.</span>
          {" "}AI-suggested answers (shown with a sparkle icon) are excluded from scoring until you confirm them. Confirmed answers contribute 30% weight alongside live adapter data.
        </p>
      </div>

      {/* Section pills */}
      <div className="flex gap-2 flex-wrap">
        {SECTIONS.map((sec) => {
          const pct = completionPct(sec);
          const score = computedScore(sec);
          return (
            <button
              key={sec.id}
              onClick={() => setActiveSection(sec.id)}
              className={cn(
                "flex items-center gap-2 px-3 py-2 rounded-xl border text-[12px] font-semibold transition-all",
                activeSection === sec.id
                  ? "border-transparent text-white shadow-sm"
                  : "border-[var(--glass-border)] bg-[var(--glass-bg)] text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:border-[var(--border-default)]"
              )}
              style={activeSection === sec.id ? { background: sec.color } : {}}
            >
              {sec.label}
              {pct > 0 && (
                <span
                  className={cn(
                    "text-[10px] font-bold px-1.5 py-0.5 rounded-full",
                    activeSection === sec.id
                      ? "bg-white/20 text-white"
                      : "bg-[var(--bg-surface-3)] text-[var(--text-muted)]"
                  )}
                >
                  {score !== null ? `${score}` : `${pct}%`}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Section card */}
      <div className="rounded-xl border border-[var(--glass-border)] bg-[var(--glass-bg)] [backdrop-filter:var(--glass-blur)] overflow-hidden">
        {/* Section header */}
        <div
          className="flex items-center justify-between px-5 py-3 border-b border-[var(--border-subtle)]"
          style={{ borderLeft: `3px solid ${section.color}` }}
        >
          <div className="flex items-center gap-3">
            <div>
              <p className="text-[13px] font-semibold text-[var(--text-primary)]">{section.label} Assessment</p>
              <p className="text-[11px] text-[var(--text-muted)]">
                {completionPct(section)}% complete · {section.questions.filter((q) => responses[section.id]?.[q.id]).length}/{section.questions.length} answered
              </p>
            </div>
            <ScorePreview score={computedScore(section)} />
          </div>

          {canEdit && (
            <div className="flex items-center gap-2">
              <button
                onClick={() => handleAiPrefill(section.id)}
                disabled={loadingAi[section.id]}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12px] font-medium text-[#0755E9] border border-[#0755E9]/30 bg-[#0755E9]/5 hover:bg-[#0755E9]/10 disabled:opacity-50 transition-all"
              >
                {loadingAi[section.id]
                  ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  : <Sparkles className="h-3.5 w-3.5" />}
                {loadingAi[section.id] ? "Analysing…" : "AI Pre-fill"}
              </button>

              <button
                onClick={() => handleSave(section)}
                disabled={saving[section.id] || completionPct(section) === 0}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12px] font-semibold text-white disabled:opacity-50 transition-all"
                style={{ background: section.color }}
              >
                {saving[section.id] ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : saved[section.id] ? (
                  <CheckCircle2 className="h-3.5 w-3.5" />
                ) : (
                  <Save className="h-3.5 w-3.5" />
                )}
                {saving[section.id] ? "Saving…" : saved[section.id] ? "Saved!" : "Save & Score"}
              </button>
            </div>
          )}
        </div>

        {/* Questions */}
        <div className="p-5 space-y-5">
          {suggestions[section.id] && (
            <div className="flex items-start gap-2 p-3 rounded-lg bg-[#0755E9]/5 border border-[#0755E9]/15">
              <Info className="h-3.5 w-3.5 text-[#0755E9] mt-0.5 shrink-0" />
              <p className="text-[11px] text-[var(--text-secondary)]">
                AI suggestions shown in <span className="text-[#0755E9] font-semibold">blue</span>. Confidence % indicates how certain the AI is based on available account data. Empty fields have been auto-filled — review and adjust as needed.
              </p>
            </div>
          )}

          {section.questions.map((q, i) => (
            <div key={q.id}>
              {i > 0 && <div className="border-t border-[var(--border-subtle)] mb-5" />}
              <QuestionInput
                question={q}
                value={responses[section.id]?.[q.id] ?? ""}
                onChange={(v) => setResponse(section.id, q.id, v)}
                suggestion={suggestions[section.id]?.[q.id] ?? null}
                disabled={!canEdit}
              />
            </div>
          ))}

          {/* Score preview at bottom */}
          {computedScore(section) !== null && (
            <div
              className="mt-2 flex items-center justify-between p-3 rounded-lg border"
              style={{ borderColor: `${section.color}30`, background: `${section.color}08` }}
            >
              <span className="text-[12px] font-medium text-[var(--text-primary)]">
                Computed <span style={{ color: section.color }}>{section.label}</span> score
              </span>
              <div className="flex items-center gap-2">
                <div className="h-1.5 w-24 rounded-full bg-[var(--bg-surface-3)] overflow-hidden">
                  <div
                    className="h-full rounded-full transition-all"
                    style={{ width: `${computedScore(section)}%`, background: section.color }}
                  />
                </div>
                <span className="text-[13px] font-bold" style={{ color: section.color }}>
                  {computedScore(section)}/100
                </span>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* All-sections summary row */}
      <div className="rounded-xl border border-[var(--glass-border)] bg-[var(--glass-bg)] [backdrop-filter:var(--glass-blur)] p-4">
        <p className="text-[11px] font-semibold text-[var(--text-muted)] uppercase tracking-wider mb-3">Section Overview</p>
        <div className="grid grid-cols-5 gap-3">
          {SECTIONS.map((sec) => {
            const score = computedScore(sec);
            const pct   = completionPct(sec);
            const col   = score !== null ? (score >= 70 ? "#22C55E" : score >= 45 ? "#F59E0B" : "#EF4444") : sec.color;
            return (
              <button
                key={sec.id}
                onClick={() => setActiveSection(sec.id)}
                className="flex flex-col items-center gap-1 p-2 rounded-lg hover:bg-[var(--bg-surface-2)] transition-colors"
              >
                <span className="text-[11px] font-semibold text-[var(--text-muted)]">{sec.label}</span>
                {score !== null ? (
                  <span className="text-[18px] font-bold" style={{ color: col }}>{score}</span>
                ) : (
                  <span className="text-[12px] text-[var(--text-disabled)]">{pct}%</span>
                )}
                <div className="h-1 w-full rounded-full bg-[var(--bg-surface-3)] overflow-hidden">
                  <div
                    className="h-full rounded-full transition-all"
                    style={{ width: `${pct}%`, background: col }}
                  />
                </div>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

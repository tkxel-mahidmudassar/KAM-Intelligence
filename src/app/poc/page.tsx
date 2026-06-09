"use client";

import { useMemo, useState } from "react";
import type { ComponentType } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  BrainCircuit,
  CheckCircle2,
  FileSearch,
  FileText,
  Gauge,
  MessageSquareText,
  RotateCcw,
  ShieldCheck,
  Sparkles,
  UploadCloud,
} from "lucide-react";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Textarea } from "@/components/ui/Textarea";
import {
  POC_KYC_KEYS,
  POC_KYC_LABELS,
  calculateWeightedPocScore,
  classifyPocScore,
  normalizeFivePointScore,
  type PocAccountFields,
  type PocExtractionResult,
  type PocKycSections,
  type PocScoringDimension,
} from "@/lib/poc/scoringFramework";

type PocView = "account" | "kyc" | "score" | "signals";
type PocCorrectionResponse = PocExtractionResult & { changeLog?: string[] };
type PocCorrectionPayload = PocCorrectionResponse & { error?: string };

const SAMPLE_BRIEF = `Account: Orion Retail Group
Industry: Retail technology and digital commerce
Region: North America
ARR: $1.8M
Contract start: 2025-01-15
Contract end / renewal: 2026-09-30
Executive sponsor: Dana Walsh, Chief Digital Officer
Primary contact: Marcus Reed, VP Ecommerce Platforms

Relationship context:
Tkxel has monthly steering calls with the VP Ecommerce Platforms and quarterly executive reviews with the CDO. The relationship is broader than one stakeholder, but procurement is not yet mapped and the CIO has not attended the last two reviews.

Delivery context:
The mobile checkout modernization project is mostly on track. Two sprint commitments slipped in May because of payment gateway defects. The client said communication has improved after the new delivery lead joined.

Contract context:
The SOW has a 60-day notice period, annual price review language, and a manual renewal path. There is no auto-renewal clause.

CSAT and risk:
Latest CSAT is 4.1 out of 5. The customer is satisfied with roadmap alignment but has warned that unresolved checkout defects must close before renewal. A competing digital commerce vendor is running a discovery workshop with the client.

Financial and whitespace:
Invoices are current. The client is exploring loyalty analytics, personalization, and managed QA automation. Expansion readiness is moderate because renewal confidence depends on defect closure.`;

const views: Array<{ id: PocView; label: string; icon: ComponentType<{ className?: string }> }> = [
  { id: "account", label: "Extraction", icon: FileText },
  { id: "kyc", label: "KYC", icon: ShieldCheck },
  { id: "score", label: "Scoring", icon: Gauge },
  { id: "signals", label: "Signals", icon: BrainCircuit },
];

function recalculateResult(result: PocExtractionResult): PocExtractionResult {
  const overallScore = calculateWeightedPocScore(result.scoring.dimensions);
  const classification = classifyPocScore(overallScore);
  return {
    ...result,
    scoring: {
      ...result.scoring,
      overallScore,
      status: classification.status,
      portfolioClassification: classification.portfolioClassification,
      recommendedAction: classification.recommendedAction,
    },
  };
}

function statusVariant(status: string): "critical" | "at-risk" | "healthy" | "neutral" | "brand" {
  const normalized = status.toLowerCase();
  if (normalized.includes("critical") || normalized.includes("risk")) return "critical";
  if (normalized.includes("watch") || normalized.includes("attention")) return "at-risk";
  if (normalized.includes("excellent") || normalized.includes("healthy")) return "healthy";
  return "neutral";
}

function ScoreBar({ value }: { value: number }) {
  const percent = Math.max(0, Math.min(100, (value / 5) * 100));
  return (
    <div className="h-2 w-full rounded-full bg-[var(--bg-surface-3)]">
      <div className="h-full rounded-full bg-[#0755E9]" style={{ width: `${percent}%` }} />
    </div>
  );
}

export default function PocPage() {
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [result, setResult] = useState<PocExtractionResult | null>(null);
  const [activeView, setActiveView] = useState<PocView>("account");
  const [loading, setLoading] = useState(false);
  const [correcting, setCorrecting] = useState(false);
  const [error, setError] = useState("");
  const [correctionPrompt, setCorrectionPrompt] = useState("");
  const [changeLog, setChangeLog] = useState<string[]>([]);
  const [recalculationNote, setRecalculationNote] = useState("");

  const lowestDimensions = useMemo(() => {
    if (!result) return [];
    return [...result.scoring.dimensions].sort((a, b) => a.score - b.score).slice(0, 3);
  }, [result]);

  async function runExtraction(useDemo = false) {
    setLoading(true);
    setError("");
    setChangeLog([]);
    setRecalculationNote("");

    try {
      const formData = new FormData();
      if (useDemo) {
        formData.append("text", SAMPLE_BRIEF);
        formData.append("fileName", "Orion Retail Group demo brief.txt");
      } else if (selectedFiles.length > 0) {
        selectedFiles.forEach((file) => formData.append("files", file));
      } else {
        setError("Select one or more documents or use the demo brief.");
        return;
      }

      const response = await fetch("/api/poc/extract", {
        method: "POST",
        body: formData,
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Extraction failed");
      setResult(payload);
      setActiveView("account");
    } catch (extractError) {
      setError(extractError instanceof Error ? extractError.message : "Extraction failed");
    } finally {
      setLoading(false);
    }
  }

  async function runCorrection() {
    if (!result || !correctionPrompt.trim()) return;
    setCorrecting(true);
    setError("");

    try {
      const response = await fetch("/api/poc/correct", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ instruction: correctionPrompt, current: result }),
      });
      const payload: PocCorrectionPayload = await response.json();
      if (!response.ok || payload.error) throw new Error(payload.error || "Correction failed");
      setResult(payload);
      setChangeLog(payload.changeLog ?? []);
      setRecalculationNote("");
      setCorrectionPrompt("");
    } catch (correctionError) {
      setError(correctionError instanceof Error ? correctionError.message : "Correction failed");
    } finally {
      setCorrecting(false);
    }
  }

  function updateAccountField(field: keyof PocAccountFields, value: string) {
    setResult((current) => current ? { ...current, account: { ...current.account, [field]: value } } : current);
  }

  function updateKycField(field: keyof PocKycSections, value: string) {
    setResult((current) => current ? { ...current, kyc: { ...current.kyc, [field]: value } } : current);
  }

  function updateDimension(key: PocScoringDimension["key"], patch: Partial<PocScoringDimension>) {
    setResult((current) => {
      if (!current) return current;
      const next = {
        ...current,
        scoring: {
          ...current.scoring,
          dimensions: current.scoring.dimensions.map((dimension) =>
            dimension.key === key ? { ...dimension, ...patch } : dimension,
          ),
        },
      };
      return recalculateResult(next);
    });
    setRecalculationNote("");
  }

  function runManualRecalculation() {
    if (!result) return;
    const previousScore = result.scoring.overallScore;
    const next = recalculateResult(result);
    setResult(next);
    setRecalculationNote(`Weighted score recalculated from ${previousScore.toFixed(2)} to ${next.scoring.overallScore.toFixed(2)} using the current dimension scores.`);
  }

  return (
    <main className="min-h-screen bg-[var(--bg-gradient)] px-4 py-5 text-[var(--text-primary)] sm:px-5">
      <section className="mx-auto flex max-w-[1500px] flex-col gap-5">
        <header className="flex flex-col gap-3 rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-surface-1)]/82 p-4 shadow-[0_18px_46px_-38px_rgba(15,23,42,0.45)] sm:flex-row sm:items-center sm:justify-between">
          <div className="flex min-w-0 items-center gap-3">
            <Link href="/portfolio" className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-surface-2)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]" aria-label="Back to portfolio">
              <ArrowLeft className="h-4 w-4" />
            </Link>
            <div className="min-w-0">
              <p className="command-section-label">Proof of concept</p>
              <h1 className="truncate text-2xl font-black tracking-[-0.03em] sm:text-3xl">AI Account Scoring POC</h1>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {result ? <Badge variant={statusVariant(result.scoring.status)}>{result.scoring.status}</Badge> : <Badge variant="neutral">Ready</Badge>}
            {result ? <Badge variant="brand">{result.model}</Badge> : null}
          </div>
        </header>

        <section className="grid gap-5 xl:grid-cols-[360px_minmax(0,1fr)]">
          <aside className="space-y-4">
            <section className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-surface-1)]/86 p-4 shadow-[0_18px_46px_-38px_rgba(15,23,42,0.45)]">
              <div className="flex items-center justify-between gap-3">
                <h2 className="text-[15px] font-black tracking-[-0.02em]">Source document</h2>
                <UploadCloud className="h-4 w-4 text-[#0755E9]" />
              </div>
              <label className="mt-4 flex min-h-28 cursor-pointer flex-col items-center justify-center rounded-xl border border-dashed border-[var(--border-default)] bg-[var(--bg-surface-2)] px-4 py-5 text-center hover:border-[#0755E9]">
                <input
                  type="file"
                  multiple
                  accept=".pdf,.doc,.docx,.txt,.md,.xlsx,.xls"
                  className="sr-only"
                  onChange={(event) => setSelectedFiles(Array.from(event.target.files ?? []))}
                />
                <FileSearch className="h-7 w-7 text-[var(--text-muted)]" />
                <span className="mt-3 max-w-full truncate text-sm font-bold">
                  {selectedFiles.length === 0
                    ? "Select account files"
                    : selectedFiles.length === 1
                      ? selectedFiles[0].name
                      : `${selectedFiles.length} files selected`}
                </span>
                <span className="mt-1 text-[11px] font-medium text-[var(--text-muted)]">PDF, DOCX, TXT, XLSX. Up to 8 files.</span>
              </label>
              {selectedFiles.length > 1 ? (
                <div className="mt-3 max-h-24 space-y-1 overflow-auto rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-surface-2)] px-3 py-2">
                  {selectedFiles.map((file) => (
                    <div key={`${file.name}-${file.size}`} className="truncate text-[11px] font-semibold text-[var(--text-secondary)]">
                      {file.name}
                    </div>
                  ))}
                </div>
              ) : null}
              <div className="mt-4 grid grid-cols-2 gap-2">
                <Button onClick={() => void runExtraction(false)} loading={loading} disabled={selectedFiles.length === 0 || loading}>
                  <Sparkles className="h-4 w-4" />
                  Extract
                </Button>
                <Button variant="outline" onClick={() => void runExtraction(true)} disabled={loading}>
                  <FileText className="h-4 w-4" />
                  Demo
                </Button>
              </div>
              {error ? <p className="mt-3 rounded-lg border border-[#FECACA] bg-[#FEF2F2] px-3 py-2 text-xs font-semibold text-[#B91C1C]">{error}</p> : null}
            </section>

            {result ? (
              <>
                <section className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-surface-1)]/86 p-2 shadow-[0_18px_46px_-38px_rgba(15,23,42,0.45)]">
                  <div className="grid grid-cols-2 gap-1">
                    {views.map((view) => {
                      const Icon = view.icon;
                      const active = activeView === view.id;
                      return (
                        <button
                          key={view.id}
                          type="button"
                          onClick={() => setActiveView(view.id)}
                          className={`inline-flex h-10 items-center justify-center gap-2 rounded-xl px-3 text-[12px] font-bold transition-colors ${
                            active ? "bg-[#071225] text-white" : "text-[var(--text-secondary)] hover:bg-[var(--bg-surface-2)]"
                          }`}
                        >
                          <Icon className="h-4 w-4" />
                          {view.label}
                        </button>
                      );
                    })}
                  </div>
                </section>

                <section className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-surface-1)]/86 p-4 shadow-[0_18px_46px_-38px_rgba(15,23,42,0.45)]">
                  <div className="flex items-center justify-between gap-3">
                    <h2 className="text-[15px] font-black tracking-[-0.02em]">Correction</h2>
                    <MessageSquareText className="h-4 w-4 text-[#0755E9]" />
                  </div>
                  <Textarea
                    className="mt-4 min-h-28"
                    value={correctionPrompt}
                    onChange={(event) => setCorrectionPrompt(event.target.value)}
                    placeholder="ARR should be $2.1M and renewal date is 2026-10-15"
                  />
                  <Button className="mt-3 w-full" onClick={() => void runCorrection()} loading={correcting} disabled={!correctionPrompt.trim() || correcting}>
                    <Sparkles className="h-4 w-4" />
                    Apply correction
                  </Button>
                  {changeLog.length > 0 ? (
                    <div className="mt-3 space-y-2">
                      {changeLog.map((item) => (
                        <div key={item} className="flex gap-2 rounded-lg bg-[var(--bg-surface-2)] px-3 py-2 text-xs font-semibold text-[var(--text-secondary)]">
                          <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[#15803D]" />
                          <span>{item}</span>
                        </div>
                      ))}
                    </div>
                  ) : null}
                </section>
              </>
            ) : null}
          </aside>

          <section className="min-h-[680px] rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-surface-1)]/88 p-4 shadow-[0_22px_58px_-42px_rgba(15,23,42,0.55)] sm:p-5">
            {!result ? (
              <div className="grid min-h-[630px] place-items-center rounded-xl border border-dashed border-[var(--border-default)] bg-[var(--bg-surface-2)]">
                <div className="max-w-sm px-6 text-center">
                  <BrainCircuit className="mx-auto h-10 w-10 text-[#0755E9]" />
                  <p className="mt-4 text-lg font-black tracking-[-0.02em]">Account intelligence workspace</p>
                  <p className="mt-2 text-sm font-medium text-[var(--text-muted)]">No extraction loaded.</p>
                </div>
              </div>
            ) : (
              <>
                {activeView === "account" ? (
                  <div className="space-y-5">
                    <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                      <Input label="Account name" value={result.account.accountName} onChange={(event) => updateAccountField("accountName", event.target.value)} />
                      <Input label="Industry" value={result.account.industry} onChange={(event) => updateAccountField("industry", event.target.value)} />
                      <Input label="Region" value={result.account.region} onChange={(event) => updateAccountField("region", event.target.value)} />
                      <Input label="ARR" value={result.account.arr} onChange={(event) => updateAccountField("arr", event.target.value)} />
                      <Input label="Contract start" value={result.account.contractStart} onChange={(event) => updateAccountField("contractStart", event.target.value)} />
                      <Input label="Contract end" value={result.account.contractEnd} onChange={(event) => updateAccountField("contractEnd", event.target.value)} />
                      <Input label="Executive sponsor" value={result.account.executiveSponsor} onChange={(event) => updateAccountField("executiveSponsor", event.target.value)} />
                      <Input label="Primary contact" value={result.account.primaryContact} onChange={(event) => updateAccountField("primaryContact", event.target.value)} />
                      <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface-2)] px-4 py-3">
                        <p className="text-[11px] font-black uppercase tracking-[0.12em] text-[var(--text-muted)]">Overall</p>
                        <p className="mt-1 text-2xl font-black">{result.scoring.overallScore.toFixed(2)} / 5</p>
                      </div>
                    </div>
                    <Textarea label="Engagement summary" className="min-h-32" value={result.account.engagementSummary} onChange={(event) => updateAccountField("engagementSummary", event.target.value)} />
                    <div className="grid gap-3 lg:grid-cols-[1.2fr_0.8fr]">
                      <section className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface-2)] p-4">
                        <p className="text-[11px] font-black uppercase tracking-[0.12em] text-[var(--text-muted)]">AI summary</p>
                        <p className="mt-2 text-sm font-medium text-[var(--text-secondary)]">{result.assistantSummary}</p>
                      </section>
                      <section className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface-2)] p-4">
                        <p className="text-[11px] font-black uppercase tracking-[0.12em] text-[var(--text-muted)]">Lowest dimensions</p>
                        <div className="mt-3 space-y-2">
                          {lowestDimensions.map((dimension) => (
                            <div key={dimension.key} className="flex items-center justify-between gap-3 text-sm">
                              <span className="font-bold">{dimension.label}</span>
                              <span className="num-mono font-black">{dimension.score.toFixed(1)}</span>
                            </div>
                          ))}
                        </div>
                      </section>
                    </div>
                  </div>
                ) : null}

                {activeView === "kyc" ? (
                  <div className="grid gap-3 lg:grid-cols-2">
                    {POC_KYC_KEYS.map((key) => (
                      <Textarea
                        key={key}
                        label={POC_KYC_LABELS[key]}
                        className="min-h-36"
                        value={result.kyc[key]}
                        onChange={(event) => updateKycField(key, event.target.value)}
                      />
                    ))}
                  </div>
                ) : null}

                {activeView === "score" ? (
                  <div className="space-y-4">
                    <section className="grid gap-3 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface-2)] p-4 md:grid-cols-[220px_minmax(0,1fr)_240px]">
                      <div>
                        <p className="text-[11px] font-black uppercase tracking-[0.12em] text-[var(--text-muted)]">Weighted score</p>
                        <p className="mt-1 text-4xl font-black tracking-[-0.04em]">{result.scoring.overallScore.toFixed(2)}</p>
                      </div>
                      <div>
                        <Badge variant={statusVariant(result.scoring.status)}>{result.scoring.portfolioClassification}</Badge>
                        <p className="mt-3 text-sm font-semibold text-[var(--text-secondary)]">{result.scoring.recommendedAction}</p>
                      </div>
                      <Button variant="outline" onClick={runManualRecalculation}>
                        <RotateCcw className="h-4 w-4" />
                        Recalculate
                      </Button>
                    </section>
                    {recalculationNote ? (
                      <div className="rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-surface-2)] px-3 py-2 text-xs font-semibold text-[var(--text-secondary)]">
                        {recalculationNote}
                      </div>
                    ) : null}

                    <div className="grid gap-3">
                      {result.scoring.dimensions.map((dimension) => (
                        <article key={dimension.key} className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface-2)] p-4">
                          <div className="grid gap-4 lg:grid-cols-[minmax(180px,260px)_minmax(0,1fr)_110px] lg:items-center">
                            <div>
                              <p className="text-[15px] font-black tracking-[-0.02em]">{dimension.label}</p>
                              <p className="mt-1 text-xs font-semibold text-[var(--text-muted)]">{dimension.weight}% weight</p>
                            </div>
                            <div className="space-y-2">
                              <ScoreBar value={dimension.score} />
                              <input
                                aria-label={`${dimension.label} score`}
                                type="range"
                                min={1}
                                max={5}
                                step={0.1}
                                value={dimension.score}
                                onChange={(event) => updateDimension(dimension.key, { score: normalizeFivePointScore(event.target.value) })}
                                className="w-full accent-[#0755E9]"
                              />
                            </div>
                            <input
                              aria-label={`${dimension.label} numeric score`}
                              type="number"
                              min={1}
                              max={5}
                              step={0.1}
                              value={dimension.score}
                              onChange={(event) => updateDimension(dimension.key, { score: normalizeFivePointScore(event.target.value) })}
                              className="h-10 w-full rounded-lg border border-[var(--border-default)] bg-[var(--bg-surface)] px-3 text-center text-sm font-black outline-none focus:border-[#0755E9]"
                            />
                          </div>
                          <div className="mt-4 grid gap-3 lg:grid-cols-3">
                            <div>
                              <p className="text-[11px] font-black uppercase tracking-[0.12em] text-[var(--text-muted)]">Evidence</p>
                              <p className="mt-1 text-sm font-medium text-[var(--text-secondary)]">{dimension.evidence}</p>
                            </div>
                            <div>
                              <p className="text-[11px] font-black uppercase tracking-[0.12em] text-[var(--text-muted)]">Risk</p>
                              <p className="mt-1 text-sm font-medium text-[var(--text-secondary)]">{dimension.risk}</p>
                            </div>
                            <div>
                              <p className="text-[11px] font-black uppercase tracking-[0.12em] text-[var(--text-muted)]">Action</p>
                              <p className="mt-1 text-sm font-medium text-[var(--text-secondary)]">{dimension.recommendedAction}</p>
                            </div>
                          </div>
                        </article>
                      ))}
                    </div>
                  </div>
                ) : null}

                {activeView === "signals" ? (
                  <div className="grid gap-4 lg:grid-cols-[1fr_360px]">
                    <section className="space-y-3">
                      {result.signals.length > 0 ? result.signals.map((signal) => (
                        <article key={`${signal.type}-${signal.title}`} className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface-2)] p-4">
                          <div className="flex flex-wrap items-start justify-between gap-3">
                            <div>
                              <p className="text-[15px] font-black tracking-[-0.02em]">{signal.title}</p>
                              <p className="mt-1 text-xs font-semibold text-[var(--text-muted)]">{signal.type}</p>
                            </div>
                            <Badge variant={signal.severity === "CRITICAL" ? "critical" : signal.severity === "INFO" ? "brand" : "at-risk"}>{signal.severity}</Badge>
                          </div>
                          <p className="mt-3 text-sm font-medium text-[var(--text-secondary)]">{signal.evidence}</p>
                        </article>
                      )) : (
                        <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface-2)] p-5 text-sm font-semibold text-[var(--text-muted)]">No extracted signals.</div>
                      )}
                    </section>
                    <section className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface-2)] p-4">
                      <p className="text-[11px] font-black uppercase tracking-[0.12em] text-[var(--text-muted)]">Missing fields</p>
                      <div className="mt-3 space-y-2">
                        {result.missingFields.length > 0 ? result.missingFields.map((field) => (
                          <div key={field} className="rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-surface-1)] px-3 py-2 text-sm font-semibold text-[var(--text-secondary)]">{field}</div>
                        )) : (
                          <div className="rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-surface-1)] px-3 py-2 text-sm font-semibold text-[var(--text-secondary)]">None reported.</div>
                        )}
                      </div>
                    </section>
                  </div>
                ) : null}
              </>
            )}
          </section>
        </section>
      </section>
    </main>
  );
}

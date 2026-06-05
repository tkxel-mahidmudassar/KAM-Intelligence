"use client";

import { useRef, useState } from "react";
import {
  FileText, File, FileImage, Download, Trash2,
  Upload, Calendar, Sparkles, Loader2, ChevronDown, ChevronUp,
  AlertTriangle, CheckCircle2, XCircle,
} from "lucide-react";
import { Badge } from "@/components/ui/Badge";
import { cn } from "@/lib/utils";
import { useRole } from "@/context/RoleContext";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ExtractedSignal {
  id:          string;
  type:        string;
  severity:    string;
  title:       string;
  description: string;
}

export interface Document {
  id: string;
  name: string;
  type: string;
  fileUrl: string | null;
  fileSize: number | null;
  mimeType: string | null;
  uploadedBy: string | null;
  createdAt: string;
  extractedText: string | null;
  extractedSignals:    ExtractedSignal[] | null;
  signalStatus:        string | null;
  affectedKycSections: string[] | null;
}

interface ExtractResult {
  summary:          string | null;
  keyTerms:         string[];
  obligations:      string[];
  renewalDate:      string | null;
  contractValue:    number | null;
  hasPendingSignals: boolean;
  signals:          ExtractedSignal[];
  affectedKycSections: string[];
}

interface DocumentsTabProps {
  documents: Document[];
  onDelete:         (id: string) => Promise<void>;
  onUpload:         (file: File, type: string) => Promise<void>;
  onAiExtract:      (docId: string, rawText: string) => Promise<ExtractResult>;
  onCommitSignals:  (docId: string, selectedIds: string[]) => Promise<void>;
  onDismissSignals: (docId: string) => Promise<void>;
}

// ─── Config ───────────────────────────────────────────────────────────────────

const TYPE_CONFIG: Record<string, { label: string; variant: "neutral" | "brand" | "healthy" | "at-risk" }> = {
  CONTRACT: { label: "Contract", variant: "brand"   },
  PROPOSAL: { label: "Proposal", variant: "neutral" },
  SOW:      { label: "SOW",      variant: "brand"   },
  MSA:      { label: "MSA",      variant: "brand"   },
  NDA:      { label: "NDA",      variant: "neutral" },
  QBR_DECK: { label: "QBR Deck", variant: "neutral" },
  OTHER:    { label: "Other",    variant: "neutral" },
};

const DOC_TYPES = Object.entries(TYPE_CONFIG).map(([value, { label }]) => ({ value, label }));

function fileIcon(mimeType: string | null) {
  if (!mimeType) return File;
  if (mimeType.includes("image")) return FileImage;
  if (mimeType.includes("pdf"))   return FileText;
  return File;
}

function formatSize(bytes: number | null) {
  if (!bytes) return null;
  if (bytes >= 1_048_576) return `${(bytes / 1_048_576).toFixed(1)} MB`;
  if (bytes >= 1_024)     return `${(bytes / 1_024).toFixed(0)} KB`;
  return `${bytes} B`;
}

// ─── Severity badge helper ────────────────────────────────────────────────────

const SEV_STYLE: Record<string, string> = {
  CRITICAL: "bg-[#EF4444]/10 text-[#EF4444] border-[#EF4444]/20",
  WARNING:  "bg-[#F59E0B]/10 text-[#F59E0B] border-[#F59E0B]/20",
  INFO:     "bg-[#3B82F6]/10 text-[#3B82F6] border-[#3B82F6]/20",
};

// ─── Signal Review Panel ──────────────────────────────────────────────────────

function SignalReviewPanel({
  signals,
  onCommit,
  onDismiss,
}: {
  signals:   ExtractedSignal[];
  onCommit:  (selectedIds: string[]) => Promise<void>;
  onDismiss: () => Promise<void>;
}) {
  const [selected, setSelected]     = useState<Set<string>>(() => new Set(signals.map((s) => s.id)));
  const [committing, setCommitting] = useState(false);
  const [dismissing, setDismissing] = useState(false);

  const toggleAll = () => {
    if (selected.size === signals.length) setSelected(new Set());
    else setSelected(new Set(signals.map((s) => s.id)));
  };

  const toggle = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const handleCommit = async () => {
    setCommitting(true);
    try { await onCommit([...selected]); } finally { setCommitting(false); }
  };

  const handleDismiss = async () => {
    setDismissing(true);
    try { await onDismiss(); } finally { setDismissing(false); }
  };

  return (
    <div className="border-t border-[#F59E0B]/30 bg-[#F59E0B]/5 p-4 space-y-3">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <AlertTriangle className="h-4 w-4 text-[#F59E0B]" />
          <span className="text-[12px] font-semibold text-[#F59E0B] uppercase tracking-wider">
            {signals.length} Signal{signals.length !== 1 ? "s" : ""} Detected
          </span>
        </div>
        <div className="flex items-center gap-1.5">
          <button
            onClick={toggleAll}
            className="text-[11px] text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors"
          >
            {selected.size === signals.length ? "Deselect all" : "Select all"}
          </button>
        </div>
      </div>

      {/* Signal list */}
      <div className="space-y-2">
        {signals.map((s) => (
          <label
            key={s.id}
            className={cn(
              "flex items-start gap-3 p-2.5 rounded-lg border cursor-pointer transition-all",
              selected.has(s.id)
                ? "border-[#F59E0B]/30 bg-[#F59E0B]/5"
                : "border-[var(--border-subtle)] bg-[var(--glass-bg)] opacity-60"
            )}
          >
            <input
              type="checkbox"
              checked={selected.has(s.id)}
              onChange={() => toggle(s.id)}
              className="mt-0.5 h-3.5 w-3.5 accent-[#F59E0B] shrink-0"
            />
            <div className="min-w-0 flex-1 space-y-0.5">
              <div className="flex items-center gap-2 flex-wrap">
                <span className={cn(
                  "inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold border",
                  SEV_STYLE[s.severity] ?? SEV_STYLE.INFO,
                )}>
                  {s.severity}
                </span>
                <span className="text-[12px] font-medium text-[var(--text-primary)] leading-tight">{s.title}</span>
              </div>
              {s.description && (
                <p className="text-[11px] text-[var(--text-muted)] leading-relaxed">{s.description}</p>
              )}
            </div>
          </label>
        ))}
      </div>

      {/* Actions */}
      <div className="flex items-center gap-2 pt-1">
        <button
          onClick={handleCommit}
          disabled={selected.size === 0 || committing || dismissing}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12px] font-semibold text-white bg-[#22C55E] hover:bg-[#16A34A] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {committing
            ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
            : <CheckCircle2 className="h-3.5 w-3.5" />}
          {committing ? "Committing…" : `Commit ${selected.size} Signal${selected.size !== 1 ? "s" : ""}`}
        </button>
        <button
          onClick={handleDismiss}
          disabled={committing || dismissing}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12px] font-semibold text-[var(--text-muted)] border border-[var(--border-subtle)] hover:text-[var(--text-primary)] hover:border-[var(--border-default)] disabled:opacity-50 transition-colors"
        >
          {dismissing
            ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
            : <XCircle className="h-3.5 w-3.5" />}
          {dismissing ? "Dismissing…" : "Dismiss All"}
        </button>
      </div>
    </div>
  );
}

// ─── Single Document Row ──────────────────────────────────────────────────────

function DocumentRow({
  doc,
  canDelete,
  onDelete,
  onAiExtract,
  onCommitSignals,
  onDismissSignals,
}: {
  doc: Document;
  canDelete: boolean;
  onDelete:         (id: string) => Promise<void>;
  onAiExtract:      (docId: string, rawText: string) => Promise<ExtractResult>;
  onCommitSignals:  (docId: string, selectedIds: string[]) => Promise<void>;
  onDismissSignals: (docId: string) => Promise<void>;
}) {
  const [parsing, setParsing]             = useState(false);
  const [extracting, setExtracting]       = useState(false);
  const [parsedText, setParsedText]       = useState<string | null>(doc.extractedText ?? null);
  const [showRaw, setShowRaw]             = useState(false);
  const [aiResult, setAiResult]           = useState<ExtractResult | null>(null);
  const [showAiResult, setShowAiResult]   = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState(false);
  const [signalStatus, setSignalStatus]   = useState<string | null>(doc.signalStatus ?? null);
  const [pendingSignals, setPendingSignals] = useState<ExtractedSignal[]>(doc.extractedSignals ?? []);

  const Icon = fileIcon(doc.mimeType);
  const cfg  = TYPE_CONFIG[doc.type] ?? TYPE_CONFIG.OTHER;
  const size = formatSize(doc.fileSize);

  const canParse = doc.fileUrl && (
    doc.mimeType === "application/pdf" ||
    doc.mimeType === "application/msword" ||
    doc.mimeType === "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
    doc.mimeType === "text/plain"
  );

  // AI extract is available once the doc has been parsed (either previously or just now)
  const hasText = !!parsedText;

  const handleParse = async () => {
    setParsing(true);
    try {
      const res  = await fetch(`/api/documents/${doc.id}/parse`, {
        method: "POST",
        headers: { "x-role": "KAM" },
      });
      const json = await res.json();
      const text = json.data?.extractedText ?? "No text extracted";
      setParsedText(text);
      setShowRaw(true);
    } catch {
      setParsedText("Failed to parse document.");
      setShowRaw(true);
    } finally {
      setParsing(false);
    }
  };

  const handleAiExtract = async () => {
    if (!parsedText) return;
    setExtracting(true);
    try {
      const result = await onAiExtract(doc.id, parsedText);
      setAiResult(result);
      setShowAiResult(true);
      setShowRaw(false);
      if (result.hasPendingSignals && result.signals.length > 0) {
        setPendingSignals(result.signals);
        setSignalStatus("PENDING_REVIEW");
      }
    } finally {
      setExtracting(false);
    }
  };

  const handleCommit = async (selectedIds: string[]) => {
    await onCommitSignals(doc.id, selectedIds);
    setSignalStatus("COMMITTED");
    setPendingSignals([]);
  };

  const handleDismiss = async () => {
    await onDismissSignals(doc.id);
    setSignalStatus("COMMITTED");
    setPendingSignals([]);
  };

  return (
    <div className="rounded-xl border border-[var(--glass-border)] bg-[var(--glass-bg)] [backdrop-filter:var(--glass-blur)] overflow-hidden">
      <div className="flex items-center gap-3 p-4">
        {/* Icon */}
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-[#0755E9]/10">
          <Icon className="h-5 w-5 text-[#0755E9]" />
        </div>

        {/* Meta */}
        <div className="min-w-0 flex-1">
          <p className="text-[13px] font-semibold text-[var(--text-primary)] truncate">{doc.name}</p>
          <div className="flex items-center gap-2 mt-0.5 flex-wrap">
            <Badge variant={cfg.variant}>{cfg.label}</Badge>
            {size && <span className="text-[11px] text-[var(--text-disabled)]">{size}</span>}
            <span className="text-[11px] text-[var(--text-disabled)] flex items-center gap-0.5">
              <Calendar className="h-3 w-3" />
              {new Date(doc.createdAt).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}
            </span>
            {hasText && (
              <span className="text-[11px] text-[#22C55E] font-medium">Parsed</span>
            )}
            {signalStatus === "PENDING_REVIEW" && (
              <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-[#F59E0B]">
                <AlertTriangle className="h-3 w-3" />
                Signals pending
              </span>
            )}
            {signalStatus === "COMMITTED" && (
              <span className="inline-flex items-center gap-1 text-[11px] font-medium text-[#22C55E]">
                <CheckCircle2 className="h-3 w-3" />
                Signals committed
              </span>
            )}
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-1 shrink-0 flex-wrap justify-end">
          {/* Parse */}
          {canParse && (
            <button
              onClick={handleParse}
              disabled={parsing || extracting}
              className="flex items-center gap-1 px-2 py-1.5 rounded-lg text-[11px] font-medium text-[var(--text-muted)] hover:text-[#0755E9] hover:bg-[#0755E9]/8 disabled:opacity-50 transition-all"
              title="Extract raw text"
            >
              {parsing
                ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                : <FileText className="h-3.5 w-3.5" />}
              <span className="hidden sm:inline">{parsing ? "Parsing…" : (hasText ? "Re-parse" : "Parse")}</span>
            </button>
          )}

          {/* AI Extract — only when parsed text exists */}
          {hasText && (
            <button
              onClick={handleAiExtract}
              disabled={extracting || parsing}
              className="flex items-center gap-1 px-2 py-1.5 rounded-lg text-[11px] font-medium text-[var(--text-muted)] hover:text-[#0755E9] hover:bg-[#0755E9]/8 disabled:opacity-50 transition-all"
              title="AI structured extraction"
            >
              {extracting
                ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                : <Sparkles className="h-3.5 w-3.5" />}
              <span className="hidden sm:inline">{extracting ? "Extracting…" : "AI Extract"}</span>
            </button>
          )}

          {/* Toggle raw text */}
          {hasText && (
            <button
              onClick={() => { setShowRaw((v) => !v); setShowAiResult(false); }}
              className="p-1.5 rounded-lg text-[var(--text-muted)] hover:text-[#0755E9] hover:bg-[#0755E9]/8 transition-all"
              title="Toggle raw text"
            >
              {showRaw ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
            </button>
          )}

          {/* Download */}
          {doc.fileUrl && (
            <a
              href={doc.fileUrl}
              download
              className="p-2 rounded-lg text-[var(--text-muted)] hover:text-[#0755E9] hover:bg-[#0755E9]/8 transition-all"
              title="Download"
            >
              <Download className="h-4 w-4" />
            </a>
          )}

          {/* Delete */}
          {canDelete && (
            deleteConfirm ? (
              <div className="flex items-center gap-1">
                <button
                  onClick={() => onDelete(doc.id)}
                  className="px-2 py-1 text-[11px] font-medium text-white bg-[#EF4444] rounded-lg hover:bg-[#DC2626] transition-colors"
                >
                  Confirm
                </button>
                <button
                  onClick={() => setDeleteConfirm(false)}
                  className="px-2 py-1 text-[11px] font-medium text-[var(--text-muted)] border border-[var(--border-subtle)] rounded-lg transition-colors"
                >
                  Cancel
                </button>
              </div>
            ) : (
              <button
                onClick={() => setDeleteConfirm(true)}
                className="p-2 rounded-lg text-[var(--text-muted)] hover:text-[#EF4444] hover:bg-[#EF4444]/8 transition-all"
                title="Delete"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            )
          )}
        </div>
      </div>

      {/* ── AI structured extraction result ── */}
      {showAiResult && aiResult && (
        <div className="border-t border-[var(--border-subtle)] p-4 space-y-3">
          <div className="flex items-center gap-1.5">
            <Sparkles className="h-3.5 w-3.5 text-[#0755E9]" />
            <span className="text-[11px] font-semibold text-[#0755E9] uppercase tracking-wider">AI Extraction</span>
            <button
              onClick={() => setShowAiResult(false)}
              className="ml-auto p-0.5 text-[var(--text-muted)] hover:text-[var(--text-primary)]"
            >
              <ChevronUp className="h-3.5 w-3.5" />
            </button>
          </div>

          {aiResult.summary && (
            <div className="rounded-lg border border-[#0755E9]/20 bg-[#0755E9]/5 p-3">
              <p className="text-[11px] font-semibold text-[#0755E9] uppercase tracking-wider mb-1">Summary</p>
              <p className="text-[12px] text-[var(--text-secondary)] leading-relaxed">{aiResult.summary}</p>
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {aiResult.keyTerms.length > 0 && (
              <div>
                <p className="text-[11px] font-semibold text-[var(--text-muted)] uppercase tracking-wider mb-1.5">Key Terms</p>
                <div className="flex flex-wrap gap-1">
                  {aiResult.keyTerms.map((t) => (
                    <span key={t} className="px-2 py-0.5 rounded-full text-[11px] bg-[var(--bg-surface-3)] text-[var(--text-secondary)] border border-[var(--border-subtle)]">
                      {t}
                    </span>
                  ))}
                </div>
              </div>
            )}
            <div className="space-y-1.5">
              {aiResult.renewalDate && (
                <div className="flex items-center justify-between">
                  <span className="text-[11px] text-[var(--text-muted)]">Renewal Date</span>
                  <span className="text-[12px] font-medium text-[var(--text-primary)]">{aiResult.renewalDate}</span>
                </div>
              )}
              {aiResult.contractValue != null && (
                <div className="flex items-center justify-between">
                  <span className="text-[11px] text-[var(--text-muted)]">Contract Value</span>
                  <span className="text-[12px] font-medium text-[var(--text-primary)]">
                    ${aiResult.contractValue.toLocaleString()}
                  </span>
                </div>
              )}
            </div>
          </div>

          {aiResult.obligations.length > 0 && (
            <div>
              <p className="text-[11px] font-semibold text-[var(--text-muted)] uppercase tracking-wider mb-1.5">Obligations</p>
              <ul className="space-y-1">
                {aiResult.obligations.map((o, i) => (
                  <li key={i} className="flex items-start gap-1.5 text-[12px] text-[var(--text-secondary)]">
                    <span className="mt-1 h-1.5 w-1.5 rounded-full bg-[#0755E9]/50 shrink-0" />
                    {o}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      {/* ── Signal review panel ── */}
      {signalStatus === "PENDING_REVIEW" && pendingSignals.length > 0 && (
        <SignalReviewPanel
          signals={pendingSignals}
          onCommit={handleCommit}
          onDismiss={handleDismiss}
        />
      )}

      {/* ── Raw extracted text ── */}
      {showRaw && parsedText && !showAiResult && (
        <div className="border-t border-[var(--border-subtle)] p-4">
          <div className="flex items-center gap-1.5 mb-2">
            <FileText className="h-3.5 w-3.5 text-[var(--text-muted)]" />
            <span className="text-[11px] font-semibold text-[var(--text-muted)] uppercase tracking-wider">Raw Text</span>
            <button
              onClick={() => setShowRaw(false)}
              className="ml-auto p-0.5 text-[var(--text-muted)] hover:text-[var(--text-primary)]"
            >
              <ChevronUp className="h-3.5 w-3.5" />
            </button>
          </div>
          <pre className="text-[11px] text-[var(--text-secondary)] leading-relaxed whitespace-pre-wrap font-mono max-h-48 overflow-y-auto">
            {parsedText.slice(0, 3000)}{parsedText.length > 3000 ? "\n\n[…truncated]" : ""}
          </pre>
        </div>
      )}
    </div>
  );
}

// ─── Upload Panel ─────────────────────────────────────────────────────────────

function UploadPanel({ onUpload }: { onUpload: (file: File, type: string) => Promise<void> }) {
  const fileRef    = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [docType, setDocType]   = useState("OTHER");
  const [uploading, setUploading] = useState(false);
  const [error, setError]         = useState<string | null>(null);

  const handleFiles = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    const file = files[0];
    setError(null);
    setUploading(true);
    try {
      await onUpload(file, docType);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  return (
    <div className="rounded-xl border border-[var(--glass-border)] bg-[var(--glass-bg)] [backdrop-filter:var(--glass-blur)] p-4 space-y-3">
      <p className="text-[12px] font-semibold text-[var(--text-primary)] uppercase tracking-wider">Upload Document</p>

      {/* Type selector */}
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-[12px] text-[var(--text-muted)]">Type:</span>
        <select
          value={docType}
          onChange={(e) => setDocType(e.target.value)}
          className="rounded-lg border border-[var(--border-default)] bg-[var(--bg-surface-2)] px-2 py-1 text-[12px] text-[var(--text-primary)] focus:outline-none focus:border-[#0755E9] transition-colors"
        >
          {DOC_TYPES.map(({ value, label }) => (
            <option key={value} value={value}>{label}</option>
          ))}
        </select>
      </div>

      {/* Drop zone */}
      <div
        className={cn(
          "relative flex flex-col items-center justify-center rounded-xl border-2 border-dashed py-8 px-4 text-center transition-all cursor-pointer",
          dragging
            ? "border-[#0755E9] bg-[#0755E9]/5"
            : "border-[var(--border-subtle)] hover:border-[#0755E9]/50 hover:bg-[#0755E9]/3"
        )}
        onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => { e.preventDefault(); setDragging(false); handleFiles(e.dataTransfer.files); }}
        onClick={() => fileRef.current?.click()}
      >
        <input
          ref={fileRef}
          type="file"
          className="hidden"
          accept=".pdf,.doc,.docx,.txt,.png,.jpg,.jpeg"
          onChange={(e) => handleFiles(e.target.files)}
        />
        {uploading ? (
          <div className="flex flex-col items-center gap-2">
            <Loader2 className="h-8 w-8 text-[#0755E9] animate-spin" />
            <p className="text-[12px] text-[var(--text-muted)]">Uploading…</p>
          </div>
        ) : (
          <>
            <Upload className="h-8 w-8 text-[var(--text-disabled)] mb-2" />
            <p className="text-[13px] font-medium text-[var(--text-primary)]">
              {dragging ? "Drop to upload" : "Click or drag file here"}
            </p>
            <p className="text-[11px] text-[var(--text-muted)] mt-1">PDF, Word, TXT, images up to 20 MB</p>
          </>
        )}
      </div>

      {error && (
        <p className="text-[12px] text-[#EF4444] bg-[#EF4444]/8 border border-[#EF4444]/20 rounded-lg px-3 py-2">
          {error}
        </p>
      )}
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export function DocumentsTab({ documents, onDelete, onUpload, onAiExtract, onCommitSignals, onDismissSignals }: DocumentsTabProps) {
  const { role } = useRole();
  const canDelete = role === "KAM" || role === "MANAGER";
  const canUpload = role === "KAM" || role === "MANAGER";

  return (
    <div className="space-y-4">
      {canUpload && <UploadPanel onUpload={onUpload} />}

      {documents.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16">
          <div className="h-14 w-14 rounded-xl bg-[var(--bg-surface-2)] border border-[var(--border-subtle)] flex items-center justify-center mb-3">
            <FileText className="h-6 w-6 text-[var(--text-disabled)]" />
          </div>
          <p className="text-[14px] font-medium text-[var(--text-primary)]">No documents yet</p>
          <p className="text-[12px] text-[var(--text-muted)] mt-1">Upload a document using the panel above</p>
        </div>
      ) : (
        <div className="space-y-2">
          {documents.map((doc) => (
            <DocumentRow
              key={doc.id}
              doc={doc}
              canDelete={canDelete}
              onDelete={onDelete}
              onAiExtract={onAiExtract}
              onCommitSignals={onCommitSignals}
              onDismissSignals={onDismissSignals}
            />
          ))}
        </div>
      )}
    </div>
  );
}

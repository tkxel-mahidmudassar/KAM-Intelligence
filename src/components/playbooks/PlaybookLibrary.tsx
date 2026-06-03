"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Archive, BookOpen, FileUp, MoreHorizontal, RefreshCw, Replace, ShieldCheck, UploadCloud, XCircle } from "lucide-react";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { cn } from "@/lib/utils";

type PlaybookStatus = "PROCESSING" | "ACTIVE" | "FAILED" | "ARCHIVED";

interface Playbook {
  id: string;
  title: string;
  fileName: string;
  fileType: string;
  fileSize: number;
  status: PlaybookStatus;
  processingError: string | null;
  processedAt: string | null;
  createdAt: string;
  updatedAt: string;
  uploadedBy: { id: string; name: string; email: string; role: string } | null;
  _count: { rules: number };
}

interface PlaybookLibraryProps {
  role: string;
  userId?: string | null;
}

const ACCEPTED_TYPES = ".pdf,.doc,.docx,.txt,.md,.markdown,.xls,.xlsx";

const STATUS_META: Record<PlaybookStatus, { label: string; variant: "neutral" | "healthy" | "critical" | "at-risk" }> = {
  PROCESSING: { label: "Processing", variant: "at-risk" },
  ACTIVE: { label: "Active", variant: "healthy" },
  FAILED: { label: "Failed", variant: "critical" },
  ARCHIVED: { label: "Archived", variant: "neutral" },
};

function formatBytes(bytes: number) {
  if (bytes >= 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  if (bytes >= 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${bytes} B`;
}

function formatDate(iso: string | null | undefined) {
  if (!iso) return "-";
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function statusBadge(status: PlaybookStatus) {
  const meta = STATUS_META[status] ?? STATUS_META.PROCESSING;
  return <Badge variant={meta.variant}>{meta.label}</Badge>;
}

export function PlaybookLibrary({ role, userId }: PlaybookLibraryProps) {
  const [playbooks, setPlaybooks] = useState<Playbook[]>([]);
  const [loading, setLoading] = useState(true);
  const [showArchived, setShowArchived] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [menuId, setMenuId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const uploadInputRef = useRef<HTMLInputElement | null>(null);
  const replaceInputRef = useRef<HTMLInputElement | null>(null);
  const replaceTargetRef = useRef<string | null>(null);

  const canWrite = role === "KAM" || role === "MANAGER" || role === "ADMIN";

  const authHeaders = useCallback(() => {
    const headers: Record<string, string> = { "x-role": role };
    if (userId) headers["x-user-id"] = userId;
    return headers;
  }, [role, userId]);

  const fetchPlaybooks = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/playbooks?includeArchived=${showArchived ? "true" : "false"}`, {
        headers: authHeaders(),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Failed to load playbooks");
      setPlaybooks(json.data ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load playbooks");
    } finally {
      setLoading(false);
    }
  }, [authHeaders, showArchived]);

  useEffect(() => {
    fetchPlaybooks();
  }, [fetchPlaybooks]);

  const sendFile = async (file: File, endpoint: string, playbookId?: string) => {
    const formData = new FormData();
    formData.append("file", file);
    formData.append("title", file.name.replace(/\.[^.]+$/, ""));

    const res = await fetch(endpoint, {
      method: "POST",
      headers: authHeaders(),
      body: formData,
    });
    const json = await res.json();
    if (!res.ok) throw new Error(json.error ?? "Upload failed");

    if (playbookId) {
      setPlaybooks((prev) => prev.map((pb) => (pb.id === playbookId ? json.data : pb)));
    } else {
      setPlaybooks((prev) => [json.data, ...prev]);
    }
  };

  const handleUpload = async (file: File | null | undefined) => {
    if (!file) return;
    setUploading(true);
    setError(null);
    try {
      await sendFile(file, "/api/playbooks/upload");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploading(false);
      if (uploadInputRef.current) uploadInputRef.current.value = "";
    }
  };

  const handleReplace = async (file: File | null | undefined) => {
    const playbookId = replaceTargetRef.current;
    if (!file || !playbookId) return;
    setBusyId(playbookId);
    setError(null);
    try {
      await sendFile(file, `/api/playbooks/${playbookId}/replace`, playbookId);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Replace failed");
    } finally {
      setBusyId(null);
      replaceTargetRef.current = null;
      if (replaceInputRef.current) replaceInputRef.current.value = "";
    }
  };

  const archivePlaybook = async (playbook: Playbook) => {
    setBusyId(playbook.id);
    setMenuId(null);
    setError(null);
    try {
      const res = await fetch(`/api/playbooks/${playbook.id}`, {
        method: "PATCH",
        headers: { ...authHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify({ status: "ARCHIVED" }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Archive failed");
      setPlaybooks((prev) => showArchived ? prev.map((pb) => (pb.id === playbook.id ? json.data : pb)) : prev.filter((pb) => pb.id !== playbook.id));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Archive failed");
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="space-y-4">
      <input
        ref={uploadInputRef}
        type="file"
        accept={ACCEPTED_TYPES}
        className="hidden"
        onChange={(e) => handleUpload(e.target.files?.[0])}
      />
      <input
        ref={replaceInputRef}
        type="file"
        accept={ACCEPTED_TYPES}
        className="hidden"
        onChange={(e) => handleReplace(e.target.files?.[0])}
      />

      <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface-1)] p-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[#0755E9]/10">
              <ShieldCheck className="h-4 w-4 text-[#0755E9]" />
            </div>
            <div>
              <p className="text-[13px] font-semibold text-[var(--text-primary)]">Global trusted guidance</p>
              <p className="text-[12px] leading-relaxed text-[var(--text-muted)]">
                Active global playbooks apply to all accounts automatically.
              </p>
              <p className="mt-1 text-[11px] text-[var(--text-disabled)]">
                PDF, DOCX, TXT, Markdown, XLS, and XLSX. Max 20 MB.
              </p>
            </div>
          </div>
          {canWrite ? (
            <Button
              type="button"
              size="sm"
              onClick={() => uploadInputRef.current?.click()}
              loading={uploading}
              className="shrink-0"
            >
              {uploading ? <RefreshCw className="h-4 w-4 animate-spin" /> : <UploadCloud className="h-4 w-4" />}
              {uploading ? "Processing" : "Upload"}
            </Button>
          ) : (
            <Badge variant="neutral">View only</Badge>
          )}
        </div>
      </div>

      <div className="flex items-center justify-between gap-3">
        <label className="flex items-center gap-2 text-[12px] text-[var(--text-muted)]">
          <input
            type="checkbox"
            checked={showArchived}
            disabled={role === "EXECUTIVE"}
            onChange={(e) => setShowArchived(e.target.checked)}
            className="h-3.5 w-3.5 rounded border-[var(--border-subtle)]"
          />
          Show archived
        </label>
        <Button type="button" size="xs" variant="ghost" onClick={fetchPlaybooks} loading={loading}>
          <RefreshCw className="h-3.5 w-3.5" />
          Refresh
        </Button>
      </div>

      {error && (
        <div className="flex items-center gap-2 rounded-lg border border-[#EF4444]/20 bg-[#EF4444]/8 px-3 py-2 text-[12px] text-[#EF4444]">
          <XCircle className="h-3.5 w-3.5 shrink-0" />
          {error}
        </div>
      )}

      <div className="overflow-hidden rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface-1)]">
        <div className="grid grid-cols-[minmax(0,1fr)_82px_110px_120px_90px_44px] gap-3 border-b border-[var(--border-subtle)] px-3 py-2 text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--text-muted)] max-lg:hidden">
          <span>Playbook</span>
          <span>Type</span>
          <span>Status</span>
          <span>Uploaded</span>
          <span>Rules</span>
          <span />
        </div>

        {loading ? (
          <div className="space-y-2 p-3">
            {[0, 1, 2].map((i) => (
              <div key={i} className="h-12 rounded-lg bg-[var(--bg-surface-2)] animate-pulse" />
            ))}
          </div>
        ) : playbooks.length === 0 ? (
          <div className="flex flex-col items-center justify-center px-4 py-10 text-center">
            <BookOpen className="h-8 w-8 text-[var(--text-disabled)]" />
            <p className="mt-2 text-[13px] font-medium text-[var(--text-primary)]">No playbooks uploaded</p>
            <p className="mt-1 max-w-sm text-[12px] text-[var(--text-muted)]">
              Upload a trusted internal playbook to start grounding recommendations.
            </p>
          </div>
        ) : (
          <div className="divide-y divide-[var(--border-subtle)]">
            {playbooks.map((playbook) => (
              <div
                key={playbook.id}
                className="grid grid-cols-1 gap-2 px-3 py-3 lg:grid-cols-[minmax(0,1fr)_82px_110px_120px_90px_44px] lg:items-center lg:gap-3"
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <FileUp className="h-3.5 w-3.5 shrink-0 text-[var(--text-muted)]" />
                    <p className="truncate text-[13px] font-semibold text-[var(--text-primary)]">{playbook.title}</p>
                  </div>
                  <p className="mt-0.5 truncate text-[11px] text-[var(--text-muted)]">
                    {playbook.fileName} - {formatBytes(playbook.fileSize)}
                    {playbook.uploadedBy?.name ? ` - ${playbook.uploadedBy.name}` : ""}
                  </p>
                  {playbook.status === "FAILED" && playbook.processingError && (
                    <p className="mt-1 text-[11px] text-[#EF4444]">{playbook.processingError}</p>
                  )}
                </div>
                <div className="text-[12px] font-semibold text-[var(--text-secondary)]">{playbook.fileType}</div>
                <div>{statusBadge(playbook.status)}</div>
                <div className="text-[12px] text-[var(--text-muted)]">{formatDate(playbook.processedAt ?? playbook.updatedAt)}</div>
                <div className="text-[12px] text-[var(--text-muted)]">{playbook._count.rules}</div>
                <div className="relative flex justify-end">
                  {canWrite && (
                    <>
                      <Button
                        type="button"
                        size="icon-sm"
                        variant="ghost"
                        loading={busyId === playbook.id}
                        onClick={() => setMenuId((prev) => (prev === playbook.id ? null : playbook.id))}
                        aria-label={`Actions for ${playbook.title}`}
                      >
                        <MoreHorizontal className="h-4 w-4" />
                      </Button>
                      {menuId === playbook.id && (
                        <div className="absolute right-0 top-8 z-10 w-36 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-surface-1)] p-1 shadow-lg">
                          <button
                            type="button"
                            className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-[12px] text-[var(--text-primary)] hover:bg-[var(--bg-surface-2)]"
                            onClick={() => {
                              replaceTargetRef.current = playbook.id;
                              setMenuId(null);
                              replaceInputRef.current?.click();
                            }}
                          >
                            <Replace className="h-3.5 w-3.5" />
                            Replace
                          </button>
                          {playbook.status !== "ARCHIVED" && (
                            <button
                              type="button"
                              className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-[12px] text-[#EF4444] hover:bg-[#EF4444]/8"
                              onClick={() => archivePlaybook(playbook)}
                            >
                              <Archive className="h-3.5 w-3.5" />
                              Archive
                            </button>
                          )}
                        </div>
                      )}
                    </>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <p className={cn("text-[11px] text-[var(--text-disabled)]", !canWrite && "text-[var(--text-muted)]")}>
        Playbooks are trusted internal files. Extracted text is used by the next rule-generation module.
      </p>
    </div>
  );
}

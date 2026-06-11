"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import Image from "next/image";
import { FileText, Loader2, Maximize2, Minimize2, Paperclip, Sparkles, X } from "lucide-react";
import { useAccountCache } from "@/context/AccountCacheContext";
import { useRole } from "@/context/RoleContext";
import type { CachedApiAccount } from "@/lib/v2/accountCache";

interface CammieMessage {
  role: "assistant" | "user";
  content: string;
  artifact?: {
    title: string;
    fileName?: string;
    fileUrl: string;
    format: string;
    summary: string;
  };
}

interface CammieAttachment {
  fileName: string;
  type: string;
  preview?: string;
  extractedText?: string;
  parseError?: string;
}

interface PendingDocumentRequest {
  type: string;
  targetAccount?: string;
  missingInputs: string[];
}

declare global {
  interface Window {
    __kamazingAssistantAudio?: AudioContext;
  }
}

type TManMood = "laptop" | "greeting" | "thinking" | "answering" | "eager";
const T_MAN_POSES: Record<TManMood, { src: string; label: string }> = {
  laptop: { src: "/tman/laptop-clean-v2.png", label: "T-Man with laptop" },
  greeting: { src: "/tman/greeting-clean-v2.png", label: "T-Man greeting" },
  thinking: { src: "/tman/thinking-clean-v2.png", label: "T-Man thinking" },
  answering: { src: "/tman/answering-clean-v2.png", label: "T-Man answering" },
  eager: { src: "/tman/eager-clean-v2.png", label: "T-Man eager" },
};

function money(value: number) {
  if (value >= 1_000_000) return `$${(value / 1_000_000).toFixed(1)}M`;
  return `$${Math.round(value / 1_000)}K`;
}

function daysUntil(dateValue?: string | null) {
  if (!dateValue) return 180;
  const time = new Date(dateValue).getTime();
  if (Number.isNaN(time)) return 180;
  return Math.max(0, Math.ceil((time - Date.now()) / (1000 * 60 * 60 * 24)));
}

function accountScore(account: CachedApiAccount) {
  const scores = Array.isArray(account.kamScores) ? account.kamScores as Array<Record<string, unknown>> : [];
  const latestScore = Number(scores[0]?.overall);
  if (Number.isFinite(latestScore)) return Math.round(latestScore);
  const health = String(account.health ?? "HEALTHY");
  if (health === "CRITICAL") return 35;
  if (health === "AT_RISK") return 58;
  return 82;
}

function accountPayload(account: CachedApiAccount) {
  const kam = account.kam as { name?: string } | undefined;
  const associateOwner = account.associateOwner as { name?: string } | undefined;
  const contacts = Array.isArray(account.contacts) ? account.contacts as Array<Record<string, unknown>> : [];
  return {
    id: String(account.id ?? ""),
    name: String(account.name ?? "Unnamed account"),
    industry: String(account.industry ?? "Industry not set"),
    region: String(account.region ?? "Region not set"),
    country: String(account.country ?? "Country not set"),
    arr: money(Number(account.arr ?? 0)),
    healthScore: accountScore(account),
    health: String(account.health ?? "HEALTHY").replace("_", " "),
    renewalDays: daysUntil(account.contractEnd as string | null | undefined),
    kamOwner: kam?.name ?? "KAM not set",
    associateOwner: associateOwner?.name ?? "Account owner not set",
    contactName: String(contacts.find((contact) => contact.isPrimary)?.name ?? contacts[0]?.name ?? "Client POC not set"),
  };
}

function fileNameForArtifact(title: string, format?: string) {
  const normalizedFormat = String(format || "docx").toLowerCase();
  const extension = normalizedFormat.includes("ppt") ? "pptx" : normalizedFormat.includes("xls") || normalizedFormat.includes("excel") ? "xlsx" : normalizedFormat.includes("pdf") ? "pdf" : normalizedFormat.includes("markdown") ? "md" : "docx";
  return `${title.replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "").toLowerCase() || "generated-document"}.${extension}`;
}

function storedDocumentTemplates() {
  if (typeof window === "undefined") return [];
  try {
    const parsed = JSON.parse(window.localStorage.getItem("kamazing:document-templates") || window.localStorage.getItem("dotkam:document-templates") || "[]");
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function cleanMarkdownText(text: string) {
  return text
    .replace(/\\\*/g, "*")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/\*\*\s*$/gm, "")
    .replace(/^\s*\*\*/gm, "");
}

function renderInlineFormatted(text: string) {
  const parts: Array<string | { type: "bold" | "link"; text: string; href?: string }> = [];
  const normalizedText = cleanMarkdownText(text);
  const pattern = /(\*\*([\s\S]+?)\*\*)|(\[([^\]]+)\]\((https?:\/\/[^)]+)\))|(https?:\/\/[^\s)]+)/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(normalizedText)) !== null) {
    if (match.index > lastIndex) parts.push(normalizedText.slice(lastIndex, match.index));
    if (match[2]) {
      parts.push({ type: "bold", text: match[2].replace(/\*\*/g, "") });
    } else if (match[4] && match[5]) {
      parts.push({ type: "link", text: match[4], href: match[5] });
    } else if (match[6]) {
      parts.push({ type: "link", text: match[6], href: match[6] });
    }
    lastIndex = pattern.lastIndex;
  }

  if (lastIndex < normalizedText.length) parts.push(normalizedText.slice(lastIndex));

  return parts.map((part, index) => {
    if (typeof part === "string") return <span key={`${part}-${index}`} className="break-words">{part.replace(/\*\*/g, "")}</span>;
    if (part.type === "bold") return <strong key={`${part.text}-${index}`} className="break-words font-black">{part.text}</strong>;
    return (
      <a key={`${part.href}-${index}`} href={part.href} target="_blank" rel="noreferrer" className="break-all underline underline-offset-2">
        {part.text}
      </a>
    );
  });
}

function renderFormattedMessage(content: string) {
  const lines = cleanMarkdownText(content).split("\n");
  return lines.map((line, index) => {
    const trimmed = line.trim().replace(/^\*\*/, "").replace(/\*\*$/, "");
    if (!trimmed) return <div key={`space-${index}`} className="h-2" />;
    if (trimmed.startsWith("### ")) {
      return <p key={`${trimmed}-${index}`} className="mt-2 break-words text-[12px] font-black text-[#1F2722] first:mt-0">{renderInlineFormatted(trimmed.replace(/^###\s+/, ""))}</p>;
    }
    if (/^[-*]\s+/.test(trimmed)) {
      return (
        <p key={`${trimmed}-${index}`} className="relative break-words pl-4 text-[12px] font-bold leading-relaxed text-inherit">
          <span className="absolute left-0 top-[0.55em] h-1.5 w-1.5 rounded-full bg-current opacity-55" />
          {renderInlineFormatted(trimmed.replace(/^[-*]\s+/, ""))}
        </p>
      );
    }
    return <p key={`${trimmed}-${index}`} className="max-w-full break-words text-[12px] font-bold leading-relaxed text-inherit">{renderInlineFormatted(trimmed)}</p>;
  });
}

function assistantAudioContext() {
  if (typeof window === "undefined") return;
  try {
    const AudioContextClass = window.AudioContext || (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioContextClass) return;
    const context = window.__kamazingAssistantAudio ?? new AudioContextClass();
    window.__kamazingAssistantAudio = context;
    void context.resume().catch(() => undefined);
    return context;
  } catch {
    return;
  }
}

function primeAssistantAudio() {
  const context = assistantAudioContext();
  if (!context) return;
  try {
    const now = context.currentTime;
    const gain = context.createGain();
    const oscillator = context.createOscillator();
    gain.gain.setValueAtTime(0.0001, now);
    oscillator.frequency.setValueAtTime(880, now);
    oscillator.connect(gain);
    gain.connect(context.destination);
    oscillator.start(now);
    oscillator.stop(now + 0.015);
  } catch {
    // Browsers can still decline audio until another user gesture.
  }
}

function playAssistantSuccessTone() {
  const context = assistantAudioContext();
  if (!context) return;
  try {
    const master = context.createGain();
    const now = context.currentTime;
    const notes = [523.25, 659.25, 783.99, 1046.5, 1318.51];

    master.gain.setValueAtTime(0.0001, now);
    master.gain.exponentialRampToValueAtTime(0.34, now + 0.025);
    master.gain.exponentialRampToValueAtTime(0.0001, now + 0.86);
    master.connect(context.destination);

    notes.forEach((frequency, index) => {
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      const start = now + index * 0.052;
      oscillator.type = index === notes.length - 1 ? "triangle" : index % 2 === 0 ? "sine" : "square";
      oscillator.frequency.setValueAtTime(frequency, start);
      gain.gain.setValueAtTime(0.0001, start);
      gain.gain.exponentialRampToValueAtTime(0.34, start + 0.018);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.42);
      oscillator.connect(gain);
      gain.connect(master);
      oscillator.start(start);
      oscillator.stop(start + 0.42);
    });
  } catch {
    // Best-effort UI flourish.
  }
}

function TManAvatar({ mood, size = "md" }: { mood: TManMood; size?: "sm" | "md" | "lg" }) {
  const sizeClass = size === "lg" ? "h-[18.5rem] w-[13.5rem]" : size === "sm" ? "h-16 w-12" : "h-24 w-[4.75rem]";
  const pose = T_MAN_POSES[mood];
  const motion = {
    laptop: "animate-[tman-eager_4.8s_ease-in-out_infinite]",
    greeting: "animate-[tman-stage-in_620ms_cubic-bezier(0.2,0.8,0.2,1)_both]",
    thinking: "animate-[tman-thinking_1.05s_ease-in-out_infinite]",
    answering: "animate-[tman-answering_820ms_cubic-bezier(0.2,0.8,0.2,1)_both]",
    eager: "animate-[tman-eager_1.8s_ease-in-out_infinite]",
  }[mood];

  return (
    <div key={mood} aria-label={pose.label} className={`pointer-events-none relative shrink-0 overflow-visible ${sizeClass} ${motion}`} role="img">
      <Image
        src={pose.src}
        alt=""
        aria-hidden="true"
        width={216}
        height={296}
        className="h-full w-full object-contain object-bottom"
        draggable={false}
        priority={size === "lg"}
      />
    </div>
  );
}

export function CammiePanel() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { role } = useRole();
  const { accounts, loading } = useAccountCache();
  const [open, setOpen] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [message, setMessage] = useState("");
  const [thread, setThread] = useState<CammieMessage[]>([
    { role: "assistant", content: "Hey, T-Man here, what're we working on today?" },
  ]);
  const [avatarMood, setAvatarMood] = useState<TManMood>("greeting");
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [attachments, setAttachments] = useState<CammieAttachment[]>([]);
  const [pendingDocumentRequest, setPendingDocumentRequest] = useState<PendingDocumentRequest | null>(null);
  const [uploadingAttachment, setUploadingAttachment] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");

  const activeAccount = useMemo(() => {
    const target = searchParams.get("target") || searchParams.get("account");
    if (!target) return null;
    return accounts.find((account) => String(account.id ?? "") === target || String(account.sourceKey ?? "") === target) ?? null;
  }, [accounts, searchParams]);

  const visibleAccounts = loading ? [] : accounts;

  useEffect(() => {
    if (avatarMood !== "answering") return;
    const timer = window.setTimeout(() => setAvatarMood("eager"), 1400);
    return () => window.clearTimeout(timer);
  }, [avatarMood]);

  async function attachFiles(files: FileList | null) {
    const selectedFiles = Array.from(files ?? []);
    if (selectedFiles.length === 0) return;
    setUploadingAttachment(true);
    setError("");
    try {
      const formData = new FormData();
      selectedFiles.forEach((file) => formData.append("files", file));
      formData.append("type", "T-Man attachment");
      const response = await fetch("/api/v2/onboarding/documents/upload", {
        method: "POST",
        body: formData,
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Attachment upload failed");
      const parsedAttachments = Array.isArray(payload.documents)
        ? payload.documents.map((document: Record<string, unknown>) => ({
            fileName: String(document.fileName || "Attached document"),
            type: String(document.type || "Document"),
            preview: document.preview ? String(document.preview) : undefined,
            extractedText: document.extractedText ? String(document.extractedText) : undefined,
            parseError: document.parseError ? String(document.parseError) : undefined,
          }))
        : [];
      setAttachments((current) => [...current, ...parsedAttachments]);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Attachment upload failed");
    } finally {
      setUploadingAttachment(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  async function sendMessage() {
    primeAssistantAudio();
    const rawValue = message.trim() || (attachments.length > 0 ? "Review the attached document(s)." : "");
    const value = pendingDocumentRequest && rawValue
      ? `For the pending ${pendingDocumentRequest.type}${pendingDocumentRequest.targetAccount ? ` for ${pendingDocumentRequest.targetAccount}` : ""}, here are the missing details: ${rawValue}. Generate the document now if these details answer the open questions.`
      : rawValue;
    if (!value || sending || uploadingAttachment) return;
    const messageAttachments = attachments;
    const attachmentNote = messageAttachments.length > 0
      ? `\n\nAttached: ${messageAttachments.map((attachment) => attachment.fileName).join(", ")}`
      : "";
    const visibleUserContent = rawValue || value;
    const nextThread: CammieMessage[] = [...thread, { role: "user", content: `${visibleUserContent}${attachmentNote}` }];
    setThread(nextThread);
    setMessage("");
    setAttachments([]);
    setPendingDocumentRequest(null);
    setAvatarMood("thinking");
    setSending(true);
    setError("");
    try {
      const response = await fetch("/api/v2/cammie", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          role,
          message: value,
          activeAccount: activeAccount ? accountPayload(activeAccount) : null,
          accounts: visibleAccounts.map(accountPayload),
          attachments: messageAttachments,
          templates: storedDocumentTemplates(),
          conversation: nextThread.slice(-8),
          page: pathname,
        }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "T-Man could not respond");
      if (
        payload.intent === "document_request" &&
        payload.documentRequest &&
        Array.isArray(payload.documentRequest.missingInputs) &&
        payload.documentRequest.missingInputs.length > 0
      ) {
        setPendingDocumentRequest({
          type: String(payload.documentRequest.type || "document"),
          targetAccount: payload.documentRequest.targetAccount ? String(payload.documentRequest.targetAccount) : undefined,
          missingInputs: payload.documentRequest.missingInputs.map(String),
        });
      }
      setThread((items) => [
        ...items,
        {
          role: "assistant",
          content: String(payload.reply || "I reviewed the current context."),
          artifact: payload.generatedDocument
            ? {
                title: String(payload.generatedDocument.title || "Generated document"),
                fileName: String(payload.generatedDocument.fileName || ""),
                fileUrl: String(payload.generatedDocument.fileUrl || ""),
                format: String(payload.generatedDocument.format || "Document"),
                summary: String(payload.generatedDocument.summary || ""),
              }
            : undefined,
        },
      ]);
      playAssistantSuccessTone();
      setAvatarMood("answering");
    } catch (caught) {
      const messageText = caught instanceof Error ? caught.message : "T-Man could not respond";
      setError(messageText);
      setThread((items) => [...items, { role: "assistant", content: "I could not reach the V2 assistant route. Try again after the server is ready." }]);
      setAvatarMood("eager");
    } finally {
      setSending(false);
    }
  }

  const launcherMood: TManMood = open ? (sending ? "thinking" : avatarMood) : "laptop";

  return (
    <div className="fixed bottom-5 right-5 z-[45] flex items-end gap-3">
      {open ? (
        <div className={`flex flex-col overflow-hidden rounded-[1.75rem] border border-[#D8CAB9] bg-[#FFF9EF] shadow-[0_30px_90px_-42px_rgba(31,39,34,0.72)] ${
          expanded ? "h-[min(820px,calc(100vh-5.5rem))] w-[min(calc(100vw-11rem),980px)]" : "h-[min(620px,calc(100vh-7rem))] w-[min(calc(100vw-10rem),390px)]"
        }`}>
          <div className="relative overflow-hidden border-b border-[#E5DACD] bg-[#F7F1E7] px-4 py-4">
            <div className="pointer-events-none absolute right-[-4rem] top-[-5rem] h-36 w-36 rounded-full bg-[#A7C7B4]/45 blur-2xl" />
            <div className="relative z-10 flex items-center justify-between gap-3">
              <div>
                <h3 className="text-[18px] font-black tracking-[-0.05em] text-[#1F2722]">T-Man</h3>
                <p className="text-[12px] font-bold text-[#7D6E5F]">DotKAM assistant</p>
              </div>
              <div className="flex items-center gap-2">
                <button type="button" onClick={() => setExpanded((current) => !current)} className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-[#DED1C1] bg-white/70 text-[#6F6254] hover:text-[#25352E]" aria-label={expanded ? "Restore T-Man" : "Expand T-Man"}>
                  {expanded ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
                </button>
                <button type="button" onClick={() => setOpen(false)} className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-[#DED1C1] bg-white/70 text-[#6F6254] hover:text-[#25352E]" aria-label="Close T-Man">
                  <X className="h-4 w-4" />
                </button>
              </div>
            </div>
          </div>
          <div className="min-h-0 flex-1 space-y-2 overflow-y-auto p-4">
            {thread.map((item, index) => {
              const userMessage = item.role === "user";
              return (
                <div key={`${item.role}-${item.content}-${index}`} className={`flex ${userMessage ? "justify-end" : "justify-start"}`}>
                  <div className={`min-w-0 max-w-[82%] overflow-hidden rounded-2xl px-3 py-2 text-[13px] font-bold leading-relaxed [overflow-wrap:anywhere] ${
                    userMessage ? "bg-[#25352E] text-[#FFF9EF]" : "border border-[#E5DACD] bg-white/70 text-[#25352E]"
                  }`}>
                    <div className="space-y-1">{renderFormattedMessage(item.content)}</div>
                    {item.artifact?.fileUrl ? (
                      <a
                        href={item.artifact.fileUrl}
                        target="_blank"
                        rel="noreferrer"
                        download={item.artifact.fileName || fileNameForArtifact(item.artifact.title, item.artifact.format)}
                        className="mt-3 block rounded-xl border border-[#D8CAB9] bg-[#FFF9EF] px-3 py-2 text-[#25352E] hover:bg-white"
                      >
                        <span className="block text-[12px] font-black">{item.artifact.title}</span>
                        <span className="mt-1 block text-[11px] font-bold text-[#7D6E5F]">{item.artifact.format}</span>
                        {item.artifact.summary ? <span className="mt-1 block text-[11px] font-bold text-[#6F6254]">{item.artifact.summary}</span> : null}
                      </a>
                    ) : null}
                  </div>
                </div>
              );
            })}
            {sending ? (
              <div className="flex justify-start">
                <p className="max-w-[82%] rounded-2xl border border-[#E5DACD] bg-white/70 px-3 py-2 text-[13px] font-bold leading-relaxed text-[#6F6254]">
                  Thinking...
                </p>
              </div>
            ) : null}
            {error ? (
              <p className="rounded-2xl border border-[#EAB8B0] bg-[#FDEBE8] px-3 py-2 text-[12px] font-bold text-[#B33D32]">{error}</p>
            ) : null}
          </div>
          <div className="border-t border-[#E5DACD] bg-[#FFF9EF]/92 p-3">
            {pendingDocumentRequest ? (
              <div className="mb-2 rounded-2xl border border-[#DEC997] bg-[#FFF7E4] px-3 py-2 text-[11px] font-bold leading-relaxed text-[#7A5A18]">
                Answering questions for: {pendingDocumentRequest.type}
              </div>
            ) : null}
            {attachments.length > 0 ? (
              <div className="mb-2 flex flex-wrap gap-2">
                {attachments.map((attachment) => (
                  <span key={attachment.fileName} className="inline-flex max-w-full items-center gap-2 rounded-full border border-[#D8CAB9] bg-white/72 px-3 py-1 text-[11px] font-bold text-[#6F6254]">
                    <FileText className="h-3.5 w-3.5 shrink-0" />
                    <span className="max-w-[220px] truncate">{attachment.fileName}</span>
                    <button
                      type="button"
                      onClick={() => setAttachments((current) => current.filter((item) => item.fileName !== attachment.fileName))}
                      className="text-[#9B9084] hover:text-[#25352E]"
                      aria-label={`Remove ${attachment.fileName}`}
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </span>
                ))}
              </div>
            ) : null}
            <div className="flex gap-2 rounded-2xl border border-[#E1D7CA] bg-white/72 p-1">
              <input
                ref={fileInputRef}
                type="file"
                multiple
                className="hidden"
                accept=".pdf,.doc,.docx,.txt,.md,.xlsx,.xls"
                onChange={(event) => void attachFiles(event.target.files)}
              />
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                onPointerDown={primeAssistantAudio}
                disabled={sending || uploadingAttachment}
                className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-[#6F6254] hover:bg-[#F7F1E7] disabled:cursor-not-allowed disabled:opacity-55"
                aria-label="Attach file for T-Man"
              >
                {uploadingAttachment ? <Loader2 className="h-4 w-4 animate-spin" /> : <Paperclip className="h-4 w-4" />}
              </button>
              <input
                value={message}
                onChange={(event) => setMessage(event.target.value)}
                onPointerDown={primeAssistantAudio}
                onFocus={primeAssistantAudio}
                onKeyDown={(event) => {
                  if (event.key === "Enter") sendMessage();
                }}
                className="h-10 min-w-0 flex-1 bg-transparent px-3 text-[13px] font-bold text-[#25352E] outline-none placeholder:text-[#A69A8B]"
                placeholder="Ask about accounts, documents, or the web"
              />
              <button type="button" onPointerDown={primeAssistantAudio} onClick={sendMessage} disabled={sending || uploadingAttachment || (!message.trim() && attachments.length === 0)} className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#25352E] text-[#FFF9EF] disabled:cursor-not-allowed disabled:opacity-55" aria-label="Send T-Man message">
                <Sparkles className="h-4 w-4" />
              </button>
            </div>
          </div>
        </div>
      ) : null}
      <button
        type="button"
        onPointerDown={primeAssistantAudio}
        onClick={() => {
          primeAssistantAudio();
          setOpen((current) => {
            if (!current) setAvatarMood("greeting");
            return !current;
          });
        }}
        className="group flex flex-col items-center gap-0 px-2 py-1 text-[#25352E] transition-transform hover:-translate-y-1"
        aria-label="Open T-Man"
      >
        <TManAvatar mood={launcherMood} size="lg" />
        <span className="-mt-3 rounded-full border border-[#D8CAB9] bg-[#FFF9EF]/95 px-3 py-1 text-[12px] font-black tracking-[-0.02em] shadow-[0_14px_30px_-24px_rgba(31,39,34,0.7)] backdrop-blur">
          Ask T-Man
        </span>
      </button>
    </div>
  );
}

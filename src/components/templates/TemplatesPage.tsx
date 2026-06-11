"use client";

import { useEffect, useMemo, useState } from "react";
import { FileText, FolderOpen, Loader2, Upload, X } from "lucide-react";
import { documentGenerationTypes, documentOutputFormats } from "@/lib/v2/configuration";

interface TemplateRecord {
  id: string;
  name: string;
  tag: string;
  format: string;
  uploadedAt: string;
  fileUrl: string;
}

const storageKey = "kamazing:document-templates";
const legacyStorageKey = "dotkam:document-templates";

function loadTemplates() {
  if (typeof window === "undefined") return [];
  try {
    const parsed = JSON.parse(window.localStorage.getItem(storageKey) || window.localStorage.getItem(legacyStorageKey) || "[]");
    return Array.isArray(parsed) ? (parsed as TemplateRecord[]) : [];
  } catch {
    return [];
  }
}

function readTemplateFile(file: File) {
  return new Promise<string>((resolve) => {
    const reader = new FileReader();
    reader.onload = () => resolve(typeof reader.result === "string" ? reader.result : "");
    reader.onerror = () => resolve(URL.createObjectURL(file));
    reader.readAsDataURL(file);
  });
}

export function TemplatesPage() {
  const [templates, setTemplates] = useState<TemplateRecord[]>([]);
  const [tag, setTag] = useState(documentGenerationTypes[0]);
  const [uploadOpen, setUploadOpen] = useState(false);
  const [status, setStatus] = useState("");
  const [templateUploading, setTemplateUploading] = useState(false);
  const [removingTemplateId, setRemovingTemplateId] = useState("");

  useEffect(() => {
    setTemplates(loadTemplates());
  }, []);

  useEffect(() => {
    if (typeof window !== "undefined") {
      window.localStorage.setItem(storageKey, JSON.stringify(templates));
    }
  }, [templates]);

  const groupedTemplates = useMemo(() => {
    return documentGenerationTypes
      .map((type) => ({
        type,
        templates: templates.filter((template) => template.tag === type),
      }))
      .filter((group) => group.templates.length > 0);
  }, [templates]);

  const totalTemplates = templates.length;
  const selectedTagCount = templates.filter((template) => template.tag === tag).length;

  async function addTemplate(file: File | undefined) {
    if (!file || templateUploading) return;
    setTemplateUploading(true);
    try {
      const extension = file.name.split(".").pop()?.toLowerCase() || "file";
      const fileUrl = await readTemplateFile(file);
      const nextTemplate: TemplateRecord = {
        id: `template-${Date.now()}-${file.name}`,
        name: file.name,
        tag,
        format: extension,
        uploadedAt: new Date().toLocaleDateString("en-US", { month: "short", day: "numeric" }),
        fileUrl,
      };
      setTemplates((current) => [nextTemplate, ...current]);
      setStatus(`${file.name} is now available as a ${tag} template.`);
      setUploadOpen(false);
    } finally {
      setTemplateUploading(false);
    }
  }

  async function removeTemplate(id: string) {
    if (removingTemplateId) return;
    setRemovingTemplateId(id);
    try {
      setTemplates((current) => current.filter((template) => template.id !== id));
      await new Promise((resolve) => window.setTimeout(resolve, 150));
    } finally {
      setRemovingTemplateId("");
    }
  }

  return (
    <main className="min-h-screen px-5 py-5">
      <section className="mx-auto max-w-[1500px] space-y-5">
        <section className="overflow-hidden rounded-[36px] border border-[#E2D8CC] bg-[#FFF9EF] shadow-[0_24px_70px_-58px_rgba(32,38,32,0.58)]">
          <div className="relative p-6 md:p-8">
            <div className="pointer-events-none absolute inset-0 opacity-70 [background-image:radial-gradient(#D8CAB9_1px,transparent_1px)] [background-size:18px_18px]" />
            <div className="relative flex flex-wrap items-start justify-between gap-5">
              <div>
                <h1 className="text-[clamp(44px,6vw,82px)] font-black leading-none tracking-[-0.08em] text-[#1F2722]">Templates</h1>
                {totalTemplates > 0 ? (
                  <div className="mt-6 flex flex-wrap gap-2">
                    {documentOutputFormats.map((format) => (
                      <span key={format} className="rounded-full border border-[#D8CAB9] bg-white/70 px-3 py-1.5 text-[12px] font-black text-[#25352E]">
                        {format}
                      </span>
                    ))}
                  </div>
                ) : null}
              </div>
              <button type="button" onClick={() => setUploadOpen(true)} className="inline-flex items-center gap-2 rounded-full bg-[#25352E] px-5 py-3 text-[13px] font-black text-[#FFF9EF] shadow-[0_18px_38px_-28px_rgba(37,53,46,0.95)]">
                <Upload className="h-4 w-4" />
                Upload template
              </button>
            </div>
          </div>
          {status ? <p className="mt-4 rounded-2xl border border-[#B7D8C3] bg-[#EEF8F1] px-4 py-3 text-[13px] font-black text-[#23633E]">{status}</p> : null}
        </section>

        {groupedTemplates.length > 0 ? (
          <section className="grid gap-4 xl:grid-cols-2">
            {groupedTemplates.map((group) => (
              <article key={group.type} className="rounded-[28px] border border-[#E2D8CC] bg-[#FFF9EF] p-4 shadow-[0_18px_54px_-46px_rgba(32,38,32,0.45)]">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <span className="flex h-10 w-10 items-center justify-center rounded-2xl border border-[#D8CAB9] bg-white/70 text-[#25352E]">
                      <FolderOpen className="h-5 w-5" />
                    </span>
                    <h2 className="text-[22px] font-black tracking-[-0.04em] text-[#1F2722]">{group.type}</h2>
                  </div>
                  <span className="rounded-full border border-[#D8CAB9] bg-white/60 px-3 py-1 text-[12px] font-black text-[#6F6254]">
                    {group.templates.length} {group.templates.length === 1 ? "template" : "templates"}
                  </span>
                </div>
                <div className="mt-4 overflow-hidden rounded-2xl border border-[#E5DACD] bg-white/55">
                  {group.templates.map((template, index) => (
                    <div key={template.id} className={`flex items-center gap-3 p-3 ${index > 0 ? "border-t border-[#E5DACD]" : ""}`}>
                      <FileText className="h-4 w-4 shrink-0 text-[#25352E]" />
                      <a href={template.fileUrl} target="_blank" rel="noreferrer" className="min-w-0 flex-1 truncate text-[13px] font-black text-[#25352E] underline-offset-4 hover:underline">
                        {template.name}
                      </a>
                      <span className="rounded-full bg-[#F2E8DA] px-2 py-1 text-[11px] font-black text-[#6F6254]">{template.format}</span>
                      <span className="hidden text-[12px] font-bold text-[#8A7B6D] sm:inline">{template.uploadedAt}</span>
                      <button type="button" disabled={removingTemplateId === template.id} onClick={() => void removeTemplate(template.id)} className="rounded-full p-1 text-[#9B9084] hover:bg-[#F7E5E0] hover:text-[#B33D32] disabled:cursor-not-allowed disabled:opacity-50" aria-label={`Remove ${template.name}`}>
                        {removingTemplateId === template.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <X className="h-4 w-4" />}
                      </button>
                    </div>
                  ))}
                </div>
              </article>
            ))}
          </section>
        ) : (
          <section className="rounded-[32px] border border-[#E2D8CC] bg-[#FFF9EF] p-8 text-center shadow-[0_18px_54px_-46px_rgba(32,38,32,0.45)]">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-3xl bg-[#EEF4E9] text-[#25352E]">
              <FileText className="h-7 w-7" />
            </div>
            <h2 className="mt-4 text-[28px] font-black tracking-[-0.05em] text-[#1F2722]">No templates yet</h2>
            <button type="button" onClick={() => setUploadOpen(true)} className="mx-auto mt-5 inline-flex items-center gap-2 rounded-full bg-[#25352E] px-5 py-3 text-[13px] font-black text-[#FFF9EF]">
              <Upload className="h-4 w-4" />
              Upload first template
            </button>
          </section>
        )}
      </section>
      {uploadOpen ? (
        <div className="fixed inset-0 z-[80] flex items-center justify-center bg-[#1F2722]/34 px-5 backdrop-blur-sm">
          <div className="w-full max-w-xl rounded-[30px] border border-[#D8CAB9] bg-[#FFF9EF] p-5 shadow-[0_34px_110px_-56px_rgba(43,32,19,0.78)]">
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-[28px] font-black tracking-[-0.06em] text-[#1F2722]">Upload template</h2>
              <button type="button" disabled={templateUploading} onClick={() => setUploadOpen(false)} className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-[#D8CAB9] text-[#6F6254] disabled:cursor-not-allowed disabled:opacity-50" aria-label="Close template upload">
                <X className="h-4 w-4" />
              </button>
            </div>
            <label className="mt-5 block">
              <span className="text-[13px] font-black text-[#25352E]">Document tag</span>
              <select
                value={tag}
                disabled={templateUploading}
                onChange={(event) => setTag(event.target.value)}
                className="mt-2 h-12 w-full rounded-2xl border border-[#D8CAB9] bg-white/70 px-4 text-[14px] font-black text-[#25352E] outline-none disabled:opacity-60"
              >
                {documentGenerationTypes.map((type) => (
                  <option key={type} value={type}>{type}</option>
                ))}
              </select>
            </label>
            <label className="mt-4 flex min-h-40 cursor-pointer flex-col items-center justify-center rounded-3xl border border-dashed border-[#CDBEAE] bg-white/55 px-5 py-6 text-center transition hover:border-[#25352E] hover:bg-white">
              <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[#25352E] text-[#FFF9EF]">
                {templateUploading ? <Loader2 className="h-5 w-5 animate-spin" /> : <Upload className="h-5 w-5" />}
              </span>
              <span className="mt-3 text-[16px] font-black text-[#1F2722]">{templateUploading ? "Uploading template..." : "Choose any template file"}</span>
              <span className="mt-1 text-[12px] font-bold text-[#7D6E5F]">{selectedTagCount} currently saved for {tag}</span>
              <input className="sr-only" type="file" disabled={templateUploading} onChange={(event) => void addTemplate(event.target.files?.[0])} />
            </label>
          </div>
        </div>
      ) : null}
    </main>
  );
}

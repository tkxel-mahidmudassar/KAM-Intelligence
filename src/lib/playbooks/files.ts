import { randomUUID } from "crypto";
import { mkdir, writeFile } from "fs/promises";
import { extname, join } from "path";

export const PLAYBOOK_MAX_BYTES = 20 * 1024 * 1024;

const ALLOWED_EXTENSIONS = new Set([".pdf", ".doc", ".docx", ".txt", ".md", ".markdown", ".xls", ".xlsx"]);

const ALLOWED_MIMES = new Set([
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "text/plain",
  "text/markdown",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
]);

export function validatePlaybookFile(file: File): string | null {
  const ext = extname(file.name).toLowerCase();
  const mimeAllowed = file.type ? ALLOWED_MIMES.has(file.type) : false;
  const extAllowed = ALLOWED_EXTENSIONS.has(ext);

  if (!mimeAllowed && !extAllowed) {
    return "Unsupported file type. Upload PDF, DOCX, TXT, Markdown, XLS, or XLSX.";
  }

  if (file.size > PLAYBOOK_MAX_BYTES) {
    return "File too large. Maximum size is 20 MB.";
  }

  return null;
}

export function fileTypeLabel(fileName: string, mimeType?: string | null) {
  const ext = extname(fileName).toLowerCase().replace(".", "");
  if (ext) return ext.toUpperCase();
  if (mimeType?.includes("pdf")) return "PDF";
  if (mimeType?.includes("word")) return "DOCX";
  if (mimeType?.includes("sheet") || mimeType?.includes("excel")) return "XLSX";
  if (mimeType?.includes("markdown")) return "MD";
  if (mimeType?.includes("text")) return "TXT";
  return "FILE";
}

export async function storePlaybookFile(file: File) {
  const ext = extname(file.name).toLowerCase() || ".bin";
  const filename = `${randomUUID()}${ext}`;
  const uploadsDir = join(process.cwd(), "public", "uploads", "playbooks");
  await mkdir(uploadsDir, { recursive: true });

  const bytes = Buffer.from(await file.arrayBuffer());
  await writeFile(join(uploadsDir, filename), bytes);

  const isText = [".txt", ".md", ".markdown"].includes(ext) || file.type === "text/plain" || file.type === "text/markdown";

  return {
    storagePath: `/uploads/playbooks/${filename}`,
    extractedText: isText ? bytes.toString("utf-8").replace(/\r\n/g, "\n").trim() : null,
  };
}

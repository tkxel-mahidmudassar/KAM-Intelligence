import { NextRequest } from "next/server";
import { writeFile, mkdir } from "fs/promises";
import { join, extname } from "path";
import { randomUUID } from "crypto";
import { prisma } from "@/lib/prisma";
import { getRoleFromRequest, created, badRequest, serverError, guard } from "@/lib/api";
import { parsePlaybookFile } from "@/lib/playbooks/parser";
import { runMasterOrchestrator } from "@/lib/ai/agents/masterOrchestrator";
import { logAudit } from "@/lib/audit";

export const config = { api: { bodyParser: false } };

const ALLOWED_MIMES = [
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "text/plain",
  "text/markdown",
];

const ALLOWED_EXTS = ["pdf", "doc", "docx", "pptx", "xls", "xlsx", "txt", "md"];

const FILE_TYPE_LABEL: Record<string, string> = {
  pdf: "pdf", doc: "docx", docx: "docx", pptx: "pptx",
  xls: "xlsx", xlsx: "xlsx", txt: "txt", md: "md",
};

// POST /api/playbooks/upload  (multipart/form-data)
// Fields: file (binary), title (optional — defaults to filename)
export async function POST(req: NextRequest) {
  try {
    const role = getRoleFromRequest(req);
    const denied = guard(role, "playbook:create");
    if (denied) return denied;

    const formData = await req.formData();
    const file = formData.get("file") as File | null;
    const title = (formData.get("title") as string | null) ?? "";

    if (!file) return badRequest("file is required");

    const ext = extname(file.name).replace(".", "").toLowerCase();
    if (!ALLOWED_EXTS.includes(ext) && !ALLOWED_MIMES.includes(file.type)) {
      return badRequest(`Unsupported file type. Allowed: PDF, DOCX, PPTX, TXT, MD, XLSX.`);
    }
    if (file.size > 25 * 1024 * 1024) {
      return badRequest("File too large. Maximum size is 25 MB.");
    }

    // Resolve uploader user (POC: first KAM user)
    const uploaderUser = await prisma.user.findFirst({
      where: { role: role as never },
      orderBy: { createdAt: "asc" },
    });

    // Write file to disk
    const filename = `${randomUUID()}.${ext}`;
    const uploadsDir = join(process.cwd(), "public", "uploads", "playbooks");
    await mkdir(uploadsDir, { recursive: true });
    const destPath = join(uploadsDir, filename);
    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);
    await writeFile(destPath, buffer);

    const storagePath = `/uploads/playbooks/${filename}`;
    const playbookTitle = title.trim() || file.name.replace(/\.[^.]+$/, "");

    // Create playbook record (PROCESSING)
    const playbook = await prisma.playbook.create({
      data: {
        title: playbookTitle,
        fileName: file.name,
        fileType: FILE_TYPE_LABEL[ext] ?? ext,
        mimeType: file.type || "application/octet-stream",
        fileSize: file.size,
        storagePath,
        uploadedById: uploaderUser?.id ?? null,
        status: "PROCESSING",
      },
    });

    logAudit({
      role,
      action: "playbook_uploaded",
      entity: "Playbook",
      entityId: playbook.id,
      metadata: { title: playbookTitle, fileName: file.name, fileType: FILE_TYPE_LABEL[ext] },
    });

    // Parse + extract via master orchestrator (non-blocking response)
    setImmediate(async () => {
      try {
        const parseResult = await parsePlaybookFile(buffer, file.type, file.name);
        if (parseResult.error || parseResult.chunks.length === 0) {
          await prisma.playbook.update({
            where: { id: playbook.id },
            data: { status: "FAILED", errorMessage: parseResult.error ?? "No content extracted" },
          });
          return;
        }
        await runMasterOrchestrator("playbook_uploaded", {
          role,
          playbookId: playbook.id,
          playbookTitle,
          parsedChunks: parseResult.chunks,
        });
      } catch (err) {
        console.error("[playbook-upload] orchestrator failed:", err);
      }
    });

    return created({ ...playbook, message: "Playbook uploaded. Processing started." });
  } catch (err) {
    return serverError(err);
  }
}

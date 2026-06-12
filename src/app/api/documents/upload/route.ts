import { NextRequest } from "next/server";
import { writeFile, mkdir } from "fs/promises";
import { join, extname } from "path";
import { randomUUID } from "crypto";
import { prisma } from "@/lib/prisma";
import { getRoleFromRequest, created, badRequest, serverError, guard } from "@/lib/api";

export const config = { api: { bodyParser: false } };

// POST /api/documents/upload  (multipart/form-data)
// Fields: file (binary), accountId, type (optional DocumentType)
export async function POST(req: NextRequest) {
  try {
    const role = getRoleFromRequest(req);
    const denied = guard(role, "document:create");
    if (denied) return denied;

    const formData = await req.formData();
    const file      = formData.get("file") as File | null;
    const accountId = formData.get("accountId") as string | null;
    const docType   = (formData.get("type") as string | null) ?? "OTHER";

    if (!file)      return badRequest("file is required");
    if (!accountId) return badRequest("accountId is required");

    // Validate file type
    const allowedMimes = [
      "application/pdf",
      "application/msword",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "application/vnd.openxmlformats-officedocument.presentationml.presentation",
      "application/vnd.ms-excel",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "text/plain",
      "text/csv",
      "image/png",
      "image/jpeg",
    ];
    const allowedExtensions = [
      ".pdf",
      ".doc",
      ".docx",
      ".pptx",
      ".xls",
      ".xlsx",
      ".txt",
      ".csv",
      ".png",
      ".jpg",
      ".jpeg",
    ];
    const ext = extname(file.name).toLowerCase();
    if (!allowedMimes.includes(file.type) && !allowedExtensions.includes(ext)) {
      return badRequest(`Unsupported file type: ${file.type}. Allowed: PDF, Word, PowerPoint, Excel, TXT, CSV, images.`);
    }

    // Max 20 MB
    if (file.size > 20 * 1024 * 1024) {
      return badRequest("File too large. Maximum size is 20 MB.");
    }

    // Write to public/uploads/<uuid><ext>
    const filename = `${randomUUID()}${ext || ".bin"}`;
    const uploadsDir = join(process.cwd(), "public", "uploads");
    await mkdir(uploadsDir, { recursive: true });
    const destPath = join(uploadsDir, filename);

    const bytes  = await file.arrayBuffer();
    await writeFile(destPath, Buffer.from(bytes));

    const fileUrl = `/uploads/${filename}`;

    const doc = await prisma.document.create({
      data: {
        accountId,
        name:     file.name,
        type:     docType as never,   // cast — Prisma enum
        fileUrl,
        fileSize: file.size,
        mimeType: file.type,
      },
    });

    return created(doc);
  } catch (err) {
    return serverError(err);
  }
}

import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { getRoleFromRequest, getUserIdFromRequest, created, badRequest, serverError, guard } from "@/lib/api";
import { logAudit } from "@/lib/audit";
import { fileTypeLabel, storePlaybookFile, validatePlaybookFile } from "@/lib/playbooks/files";

export const config = { api: { bodyParser: false } };

async function resolveUploaderId(req: NextRequest) {
  const userId = getUserIdFromRequest(req);
  if (!userId) return null;
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { id: true } }).catch(() => null);
  return user?.id ?? null;
}

// POST /api/playbooks/upload
export async function POST(req: NextRequest) {
  try {
    const role = getRoleFromRequest(req);
    const denied = guard(role, "playbook:create");
    if (denied) return denied;

    const formData = await req.formData();
    const file = formData.get("file") as File | null;
    const title = ((formData.get("title") as string | null) ?? file?.name ?? "").trim();

    if (!file) return badRequest("file is required");
    if (!title) return badRequest("title is required");

    const validationError = validatePlaybookFile(file);
    if (validationError) return badRequest(validationError);

    const uploadedById = await resolveUploaderId(req);
    const stored = await storePlaybookFile(file);

    const playbook = await prisma.playbook.create({
      data: {
        title,
        fileName: file.name,
        fileType: fileTypeLabel(file.name, file.type),
        mimeType: file.type || null,
        fileSize: file.size,
        storagePath: stored.storagePath,
        uploadedById,
        status: "ACTIVE",
        extractedText: stored.extractedText,
        processedAt: new Date(),
      },
      include: {
        uploadedBy: { select: { id: true, name: true, email: true, role: true } },
        _count: { select: { rules: true } },
      },
    });

    await logAudit({
      role,
      action: "playbook.uploaded",
      entity: "Playbook",
      entityId: playbook.id,
      metadata: { title: playbook.title, fileType: playbook.fileType, fileSize: playbook.fileSize },
    });

    return created(playbook);
  } catch (err) {
    return serverError(err);
  }
}

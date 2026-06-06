import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { getRoleFromRequest, getUserIdFromRequest, ok, badRequest, notFound, serverError, guard } from "@/lib/api";
import { logAudit } from "@/lib/audit";
import { extractPlaybookText, parsingErrorMessage } from "@/lib/playbooks/extract";
import { fileTypeLabel, storePlaybookFile, validatePlaybookFile } from "@/lib/playbooks/files";

type Params = { params: Promise<{ id: string }> };

async function resolveUploaderId(req: NextRequest) {
  const userId = getUserIdFromRequest(req);
  if (!userId) return null;
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { id: true } }).catch(() => null);
  return user?.id ?? null;
}

// POST /api/playbooks/[id]/replace
export async function POST(req: NextRequest, { params }: Params) {
  try {
    const role = getRoleFromRequest(req);
    const denied = guard(role, "playbook:update");
    if (denied) return denied;

    const { id } = await params;
    const existing = await prisma.playbook.findUnique({ where: { id } });
    if (!existing) return notFound("Playbook");

    const formData = await req.formData();
    const file = formData.get("file") as File | null;
    const title = ((formData.get("title") as string | null) ?? existing.title).trim();

    if (!file) return badRequest("file is required");
    if (!title) return badRequest("title is required");

    const validationError = validatePlaybookFile(file);
    if (validationError) return badRequest(validationError);

    const uploadedById = await resolveUploaderId(req);
    const stored = await storePlaybookFile(file);
    const fileType = fileTypeLabel(file.name, file.type);

    await prisma.playbookRule.deleteMany({ where: { playbookId: id } });

    await prisma.playbook.update({
      where: { id },
      data: {
        title,
        fileName: file.name,
        fileType,
        mimeType: file.type || "",
        fileSize: file.size,
        storagePath: stored.storagePath,
        uploadedById,
        status: "PROCESSING",
        extractedText: null,
        processingError: null,
        processedAt: null,
        archivedAt: null,
      },
    });

    let playbook;
    try {
      const extraction = await extractPlaybookText({
        storagePath: stored.storagePath,
        fileName: file.name,
        mimeType: file.type || null,
        fileType,
      });

      playbook = await prisma.playbook.update({
        where: { id },
        data: {
          status: "ACTIVE",
          extractedText: extraction.text,
          processingError: null,
          processedAt: new Date(),
        },
        include: {
          uploadedBy: { select: { id: true, name: true, email: true, role: true } },
          _count: { select: { rules: true } },
        },
      });
    } catch (error) {
      playbook = await prisma.playbook.update({
        where: { id },
        data: {
          status: "FAILED",
          extractedText: null,
          processingError: parsingErrorMessage(error),
          processedAt: null,
        },
        include: {
          uploadedBy: { select: { id: true, name: true, email: true, role: true } },
          _count: { select: { rules: true } },
        },
      });
    }

    await logAudit({
      role,
      action: "playbook.replaced",
      entity: "Playbook",
      entityId: playbook.id,
      metadata: { title: playbook.title, fileType: playbook.fileType, fileSize: playbook.fileSize, status: playbook.status },
    });

    return ok(playbook);
  } catch (err) {
    return serverError(err);
  }
}

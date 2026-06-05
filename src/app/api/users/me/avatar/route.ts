import { NextRequest } from "next/server";
import { writeFile, mkdir } from "fs/promises";
import { join, extname } from "path";
import { randomUUID } from "crypto";
import { prisma } from "@/lib/prisma";
import { getRoleFromRequest, getUserIdFromRequest, ok, notFound, badRequest, serverError, guard } from "@/lib/api";
import { logAudit } from "@/lib/audit";

const MAX_AVATAR_SIZE = 5 * 1024 * 1024; // 5 MB
const ALLOWED_MIME = ["image/jpeg", "image/png", "image/webp", "image/gif"];

export async function POST(req: NextRequest) {
  try {
    const role = getRoleFromRequest(req);
    const denied = guard(role, "account:view");
    if (denied) return denied;

    const headerUserId = getUserIdFromRequest(req);
    const prismaRole = role as import("@prisma/client").Role;
    const user = headerUserId
      ? await prisma.user.findUnique({ where: { id: headerUserId } })
      : await prisma.user.findFirst({ where: { role: prismaRole }, orderBy: { createdAt: "asc" } });

    if (!user) return notFound("User");

    const formData = await req.formData();
    const file = formData.get("avatar") as File | null;
    if (!file) return badRequest("avatar file is required");

    if (!ALLOWED_MIME.includes(file.type)) {
      return badRequest("Only JPEG, PNG, WebP, or GIF images are allowed");
    }
    if (file.size > MAX_AVATAR_SIZE) {
      return badRequest("Avatar must be smaller than 5 MB");
    }

    const ext = extname(file.name) || ".jpg";
    const fileName = `${randomUUID()}${ext}`;
    const avatarDir = join(process.cwd(), "public", "uploads", "avatars");
    await mkdir(avatarDir, { recursive: true });
    const filePath = join(avatarDir, fileName);

    const buffer = Buffer.from(await file.arrayBuffer());
    await writeFile(filePath, buffer);

    const avatarUrl = `/uploads/avatars/${fileName}`;
    await prisma.user.update({
      where: { id: user.id },
      data: { avatarUrl },
    });

    await logAudit({
      role,
      action: "user.avatar_updated",
      entity: "User",
      entityId: user.id,
      metadata: { role, avatarUrl },
    });

    return ok({ avatarUrl });
  } catch (err) {
    return serverError(err);
  }
}

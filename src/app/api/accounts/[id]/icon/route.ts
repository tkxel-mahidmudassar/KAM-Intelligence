import { randomUUID } from "crypto";
import { mkdir, writeFile } from "fs/promises";
import { extname, join } from "path";
import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { badRequest, guard, notFound, ok, serverError, getRoleFromRequest } from "@/lib/api";
import { logAudit } from "@/lib/audit";
import { findAccountForResponse } from "@/lib/accounts/accountApi";

type Params = { params: Promise<{ id: string }> };

const ALLOWED_MIMES = new Set(["image/png", "image/jpeg", "image/webp"]);

export async function POST(req: NextRequest, { params }: Params) {
  try {
    const role = getRoleFromRequest(req);
    const denied = guard(role, "account:update");
    if (denied) return denied;

    const { id } = await params;
    const account = await prisma.account.findUnique({ where: { id } });
    if (!account) return notFound("Account");

    const formData = await req.formData();
    const file = formData.get("file") as File | null;
    if (!file) return badRequest("file is required");
    if (!ALLOWED_MIMES.has(file.type)) return badRequest("Unsupported icon type. Use PNG, JPG, or WebP.");
    if (file.size > 5 * 1024 * 1024) return badRequest("Icon file too large. Maximum size is 5 MB.");

    const extension = extname(file.name) || (file.type === "image/png" ? ".png" : file.type === "image/webp" ? ".webp" : ".jpg");
    const filename = `${randomUUID()}${extension}`;
    const uploadsDir = join(process.cwd(), "public", "uploads", "account-icons");
    await mkdir(uploadsDir, { recursive: true });
    await writeFile(join(uploadsDir, filename), Buffer.from(await file.arrayBuffer()));

    const logoUrl = `/uploads/account-icons/${filename}`;
    await prisma.account.update({
      where: { id },
      data: { logoUrl },
    });

    await logAudit({
      role,
      accountId: id,
      action: "account.icon_uploaded",
      entity: "Account",
      entityId: id,
      metadata: { role, fileName: file.name, fileSize: file.size, mimeType: file.type },
    });

    return ok(await findAccountForResponse(id));
  } catch (err) {
    return serverError(err);
  }
}

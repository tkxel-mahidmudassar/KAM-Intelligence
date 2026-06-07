import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { badRequest, getRoleFromRequest, guard, notFound, ok, serverError } from "@/lib/api";
import { extractStoredDocumentText } from "@/lib/documents/extractText";

type Params = { params: Promise<{ id: string }> };

export async function POST(req: NextRequest, { params }: Params) {
  try {
    const role = getRoleFromRequest(req);
    const denied = guard(role, "document:view");
    if (denied) return denied;

    const { id } = await params;
    const doc = await prisma.document.findUnique({ where: { id } });
    if (!doc) return notFound("Document");
    if (!doc.fileUrl) return badRequest("Document has no associated file");

    const extractedText = await extractStoredDocumentText(doc);
    await prisma.document.update({
      where: { id },
      data: { extractedText },
    });

    return ok({
      id,
      charCount: extractedText.length,
      preview: extractedText.slice(0, 2000),
      extractedText,
    });
  } catch (err) {
    return serverError(err);
  }
}

import { NextRequest } from "next/server";
import { readFile } from "fs/promises";
import { join } from "path";
import { pathToFileURL } from "url";
import { prisma } from "@/lib/prisma";
import { getRoleFromRequest, ok, badRequest, notFound, serverError, guard } from "@/lib/api";

type Params = { params: Promise<{ id: string }> };

// POST /api/documents/[id]/parse
// Reads the stored file and extracts plain text using pdf-parse (PDF) or mammoth (Word).
// Stores result in Document.extractedText and returns the first 2000 chars as preview.
export async function POST(req: NextRequest, { params }: Params) {
  try {
    const role = getRoleFromRequest(req);
    const denied = guard(role, "document:view");
    if (denied) return denied;

    const { id } = await params;
    const doc = await prisma.document.findUnique({ where: { id } });
    if (!doc) return notFound("Document");
    if (!doc.fileUrl) return badRequest("Document has no associated file");

    // Resolve disk path from public URL (fileUrl = /uploads/<filename>)
    const filePath = join(process.cwd(), "public", doc.fileUrl);

    let extractedText = "";

    if (doc.mimeType === "application/pdf") {
      // Use pdfjs-dist legacy build — compatible with Node.js server routes
      const { getDocument, GlobalWorkerOptions } = await import(
        /* webpackIgnore: true */ "pdfjs-dist/legacy/build/pdf.mjs"
      );
      // Point to the worker file on disk so pdfjs doesn't try to fetch a URL
      const workerPath = join(process.cwd(), "node_modules/pdfjs-dist/legacy/build/pdf.worker.mjs");
      GlobalWorkerOptions.workerSrc = pathToFileURL(workerPath).toString();
      const fileBuffer = await readFile(filePath);
      const pdfDoc = await getDocument({ data: new Uint8Array(fileBuffer) }).promise;
      const pages: string[] = [];
      for (let i = 1; i <= pdfDoc.numPages; i++) {
        const page    = await pdfDoc.getPage(i);
        const content = await page.getTextContent();
        const pageText = (content.items as Array<{ str?: string }>)
          .map((item) => item.str ?? "")
          .join(" ");
        pages.push(pageText);
      }
      extractedText = pages.join("\n\n");
    } else if (
      doc.mimeType === "application/msword" ||
      doc.mimeType === "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
    ) {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const mammoth = require("mammoth");
      const result  = await mammoth.extractRawText({ path: filePath });
      extractedText = result.value ?? "";
    } else if (doc.mimeType === "text/plain") {
      const buffer  = await readFile(filePath);
      extractedText = buffer.toString("utf-8");
    } else {
      return badRequest(`Parsing not supported for MIME type: ${doc.mimeType}`);
    }

    // Normalise whitespace
    extractedText = extractedText.replace(/\r\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();

    await prisma.document.update({
      where: { id },
      data: { extractedText },
    });

    return ok({
      id,
      charCount:   extractedText.length,
      preview:     extractedText.slice(0, 2000),
      extractedText,
    });
  } catch (err) {
    return serverError(err);
  }
}

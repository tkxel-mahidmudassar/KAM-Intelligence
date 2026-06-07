import { readFile } from "fs/promises";
import { join } from "path";
import { pathToFileURL } from "url";

export interface StoredDocumentForExtraction {
  fileUrl: string | null;
  mimeType: string | null;
}

export async function extractStoredDocumentText(document: StoredDocumentForExtraction): Promise<string> {
  if (!document.fileUrl) {
    throw new Error("Document has no associated file");
  }

  const filePath = join(process.cwd(), "public", document.fileUrl);
  let extractedText = "";

  if (document.mimeType === "application/pdf") {
    const { getDocument, GlobalWorkerOptions } = await import(
      /* webpackIgnore: true */ "pdfjs-dist/legacy/build/pdf.mjs"
    );
    const workerPath = join(process.cwd(), "node_modules/pdfjs-dist/legacy/build/pdf.worker.mjs");
    GlobalWorkerOptions.workerSrc = pathToFileURL(workerPath).toString();
    const fileBuffer = await readFile(filePath);
    const pdfDoc = await getDocument({ data: new Uint8Array(fileBuffer) }).promise;
    const pages: string[] = [];
    for (let pageNumber = 1; pageNumber <= pdfDoc.numPages; pageNumber++) {
      const page = await pdfDoc.getPage(pageNumber);
      const content = await page.getTextContent();
      const pageText = (content.items as Array<{ str?: string }>)
        .map((item) => item.str ?? "")
        .join(" ");
      pages.push(`[Page ${pageNumber}] ${pageText}`);
    }
    extractedText = pages.join("\n\n");
  } else if (
    document.mimeType === "application/msword" ||
    document.mimeType === "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
  ) {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const mammoth = require("mammoth");
    const result = await mammoth.extractRawText({ path: filePath });
    extractedText = result.value ?? "";
  } else if (document.mimeType === "text/plain" || document.mimeType === "text/markdown") {
    const buffer = await readFile(filePath);
    extractedText = buffer.toString("utf-8");
  } else {
    throw new Error(`Parsing not supported for MIME type: ${document.mimeType}`);
  }

  return normalizeExtractedText(extractedText);
}

export function normalizeExtractedText(text: string): string {
  return text.replace(/\r\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
}

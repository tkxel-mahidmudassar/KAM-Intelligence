import { join } from "path";
import { pathToFileURL } from "url";

type PdfTextRun = {
  T?: string;
};

type PdfTextItem = {
  x?: number;
  y?: number;
  R?: PdfTextRun[];
};

type PdfPage = {
  Texts?: PdfTextItem[];
};

type PdfData = {
  Pages?: PdfPage[];
};

function decodePdfText(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function pageToText(page: PdfPage): string {
  const rows = new Map<number, Array<{ x: number; text: string }>>();

  for (const item of page.Texts ?? []) {
    const text = (item.R ?? []).map((run) => decodePdfText(run.T ?? "")).join("").trim();
    if (!text) continue;

    const y = Number.isFinite(item.y) ? Math.round(Number(item.y) * 10) / 10 : 0;
    const x = Number.isFinite(item.x) ? Number(item.x) : 0;
    const row = rows.get(y) ?? [];
    row.push({ x, text });
    rows.set(y, row);
  }

  return Array.from(rows.entries())
    .sort(([leftY], [rightY]) => leftY - rightY)
    .map(([, row]) => row.sort((left, right) => left.x - right.x).map((item) => item.text).join(" "))
    .join("\n")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function compactPdfText(text: string): string {
  return text
    .replace(/[ \t]+/g, " ")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function describeError(error: unknown): string {
  if (error instanceof Error && error.message) return error.message;
  return String(error);
}

function ensurePdfGeometryPolyfills(): void {
  const globalScope = globalThis as typeof globalThis & {
    DOMMatrix?: unknown;
    ImageData?: unknown;
    Path2D?: unknown;
  };

  if (globalScope.DOMMatrix && globalScope.ImageData && globalScope.Path2D) return;

  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const canvas = require("@napi-rs/canvas");
    globalScope.DOMMatrix ??= canvas.DOMMatrix;
    globalScope.ImageData ??= canvas.ImageData;
    globalScope.Path2D ??= canvas.Path2D;
  } catch {
    // PDF.js can still parse many text-only PDFs without these geometry classes.
  }
}

async function extractPdfPagesWithPdf2Json(buffer: Buffer): Promise<string[]> {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const PDFParser = require("pdf2json");

  return new Promise((resolve, reject) => {
    const parser = new PDFParser(null, 1);
    let settled = false;

    parser.on("pdfParser_dataError", (error: { parserError?: unknown }) => {
      if (settled) return;
      settled = true;
      reject(error?.parserError instanceof Error ? error.parserError : new Error(String(error?.parserError ?? error)));
    });

    parser.on("pdfParser_dataReady", (data: PdfData) => {
      if (settled) return;
      settled = true;
      const pages = (data.Pages ?? []).map(pageToText).filter(Boolean);
      resolve(pages);
    });

    parser.parseBuffer(buffer);
  });
}

async function extractPdfPagesWithPdfJs(buffer: Buffer): Promise<string[]> {
  ensurePdfGeometryPolyfills();

  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const pdfjsDistPath = join(process.cwd(), "node_modules", "pdfjs-dist");
  const workerPath = join(pdfjsDistPath, "legacy", "build", "pdf.worker.mjs");
  const standardFontPath = join(pdfjsDistPath, "standard_fonts");
  pdfjs.GlobalWorkerOptions.workerSrc = pathToFileURL(workerPath).toString();

  const loadingTask = pdfjs.getDocument({
    data: new Uint8Array(buffer),
    isEvalSupported: false,
    standardFontDataUrl: `${pathToFileURL(standardFontPath).toString()}/`,
    useWorkerFetch: false,
  } as any);
  const pdf = await loadingTask.promise;
  const pages: string[] = [];

  try {
    for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
      const page = await pdf.getPage(pageNumber);
      const content = await page.getTextContent();
      const text = compactPdfText(
        content.items
          .map((item: unknown) => {
            const maybeText = item as { str?: unknown };
            return typeof maybeText.str === "string" ? maybeText.str : "";
          })
          .join(" ")
      );

      if (text) pages.push(text);
      page.cleanup();
    }
  } finally {
    await pdf.destroy();
  }

  return pages;
}

export async function extractPdfPages(buffer: Buffer): Promise<string[]> {
  const errors: string[] = [];

  try {
    const pages = await extractPdfPagesWithPdfJs(buffer);
    if (pages.length > 0) return pages;
    errors.push("pdfjs returned no readable text");
  } catch (error) {
    errors.push(`pdfjs: ${describeError(error)}`);
  }

  try {
    const pages = await extractPdfPagesWithPdf2Json(buffer);
    if (pages.length > 0) return pages;
    errors.push("pdf2json returned no readable text");
  } catch (error) {
    errors.push(`pdf2json: ${describeError(error)}`);
  }

  throw new Error(`PDF text extraction failed (${errors.join("; ")})`);
}

export async function extractPdfText(buffer: Buffer): Promise<string> {
  return (await extractPdfPages(buffer)).join("\n\n").trim();
}

import { readFile } from "fs/promises";
import { join } from "path";
import { extractPdfPages } from "../pdfText";

export type PlaybookChunkLocator = {
  page?: number;
  section?: string;
  sheet?: string;
  rowStart?: number;
  rowEnd?: number;
  lineStart?: number;
  lineEnd?: number;
};

export type PlaybookExtractedChunk = {
  text: string;
  locator: PlaybookChunkLocator;
};

export type PlaybookExtractionResult = {
  text: string;
  chunks: PlaybookExtractedChunk[];
};

const MIN_EXTRACTED_CHARS = 20;

function normalizeText(text: string) {
  return text
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function compactLine(line: string) {
  return line.replace(/\s+/g, " ").trim();
}

function sourceMarker(locator: PlaybookChunkLocator) {
  if (locator.page) return `[Page ${locator.page}]`;
  if (locator.sheet) {
    const rows = locator.rowStart && locator.rowEnd
      ? ` rows ${locator.rowStart}-${locator.rowEnd}`
      : "";
    return `[Sheet ${locator.sheet}${rows}]`;
  }
  if (locator.section) return `[Section ${locator.section}]`;
  if (locator.lineStart && locator.lineEnd) return `[Lines ${locator.lineStart}-${locator.lineEnd}]`;
  return "[Source]";
}

function flattenChunks(chunks: PlaybookExtractedChunk[]) {
  return normalizeText(
    chunks
      .map((chunk) => {
        const text = normalizeText(chunk.text);
        return text ? `${sourceMarker(chunk.locator)}\n${text}` : "";
      })
      .filter(Boolean)
      .join("\n\n")
  );
}

function assertExtractedText(text: string) {
  if (text.length < MIN_EXTRACTED_CHARS) {
    throw new Error("No readable playbook text could be extracted from this file.");
  }
}

function resolvePublicStoragePath(storagePath: string) {
  return join(process.cwd(), "public", storagePath.replace(/^\/+/, ""));
}

function headingFromLine(line: string) {
  const markdownHeading = line.match(/^#{1,6}\s+(.+)$/);
  if (markdownHeading) return compactLine(markdownHeading[1]);

  const trimmed = compactLine(line);
  if (!trimmed || trimmed.length > 80) return null;
  if (/[:.!?]$/.test(trimmed)) return null;
  if (/^\d+(\.\d+)*\.?\s+\S/.test(trimmed)) return trimmed.replace(/^\d+(\.\d+)*\.?\s+/, "");
  if (/^[A-Z][A-Za-z0-9 /&()'-]{3,}$/.test(trimmed) && trimmed.split(" ").length <= 8) return trimmed;
  return null;
}

function chunkTextBySections(rawText: string, fallbackSection: string): PlaybookExtractedChunk[] {
  const lines = normalizeText(rawText).split("\n");
  const chunks: PlaybookExtractedChunk[] = [];
  let currentSection = fallbackSection;
  let currentLines: string[] = [];
  let startLine = 1;

  const flush = (endLine: number) => {
    const text = normalizeText(currentLines.join("\n"));
    if (text) {
      chunks.push({
        text,
        locator: { section: currentSection, lineStart: startLine, lineEnd: Math.max(startLine, endLine) },
      });
    }
    currentLines = [];
  };

  lines.forEach((line, index) => {
    const heading = headingFromLine(line);
    if (heading && currentLines.length > 0) {
      flush(index);
      currentSection = heading;
      startLine = index + 1;
      return;
    }

    if (heading && currentLines.length === 0) {
      currentSection = heading;
      startLine = index + 1;
      return;
    }

    currentLines.push(line);
  });

  flush(lines.length);
  return chunks.length > 0 ? chunks : [{ text: normalizeText(rawText), locator: { section: fallbackSection } }];
}

async function extractPdf(filePath: string): Promise<PlaybookExtractedChunk[]> {
  const fileBuffer = await readFile(filePath);
  const pages = (await extractPdfPages(fileBuffer)).map(normalizeText).filter(Boolean);

  return pages.map((pageText, index) => ({
    text: pageText,
    locator: { page: index + 1 },
  }));
}

async function extractWord(filePath: string): Promise<PlaybookExtractedChunk[]> {
  const mammoth = await import("mammoth");
  const result = await mammoth.extractRawText({ path: filePath });
  return chunkTextBySections(result.value ?? "", "Document");
}

async function extractPlainText(filePath: string, fallbackSection: string): Promise<PlaybookExtractedChunk[]> {
  const buffer = await readFile(filePath);
  return chunkTextBySections(buffer.toString("utf-8"), fallbackSection);
}

function rowToText(row: unknown[]) {
  return row
    .map((cell) => {
      if (cell instanceof Date) return cell.toISOString().slice(0, 10);
      return cell == null ? "" : String(cell);
    })
    .map(compactLine)
    .filter(Boolean)
    .join(" | ");
}

async function extractExcel(filePath: string): Promise<PlaybookExtractedChunk[]> {
  const XLSX = await import("xlsx");
  const workbook = XLSX.readFile(filePath, { cellDates: true });
  const chunks: PlaybookExtractedChunk[] = [];

  workbook.SheetNames.forEach((sheetName) => {
    const worksheet = workbook.Sheets[sheetName];
    if (!worksheet) return;

    const rows = XLSX.utils.sheet_to_json<unknown[]>(worksheet, {
      header: 1,
      blankrows: false,
      raw: false,
      defval: "",
    });

    const textRows = rows
      .map((row, index) => ({ text: rowToText(row), rowNumber: index + 1 }))
      .filter((row) => row.text);

    if (textRows.length === 0) return;

    const rowStart = textRows[0].rowNumber;
    const rowEnd = textRows[textRows.length - 1].rowNumber;
    chunks.push({
      text: textRows.map((row) => row.text).join("\n"),
      locator: { sheet: sheetName, rowStart, rowEnd },
    });
  });

  return chunks;
}

export async function extractPlaybookText(input: {
  storagePath: string;
  fileName: string;
  mimeType?: string | null;
  fileType?: string | null;
}): Promise<PlaybookExtractionResult> {
  const filePath = resolvePublicStoragePath(input.storagePath);
  const fileType = (input.fileType ?? "").toUpperCase();
  const mimeType = input.mimeType ?? "";
  const fileName = input.fileName.toLowerCase();

  let chunks: PlaybookExtractedChunk[];

  if (fileType === "PDF" || mimeType === "application/pdf" || fileName.endsWith(".pdf")) {
    chunks = await extractPdf(filePath);
  } else if (
    ["DOC", "DOCX"].includes(fileType) ||
    mimeType === "application/msword" ||
    mimeType === "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
    fileName.endsWith(".doc") ||
    fileName.endsWith(".docx")
  ) {
    chunks = await extractWord(filePath);
  } else if (
    ["TXT", "MD", "MARKDOWN"].includes(fileType) ||
    mimeType === "text/plain" ||
    mimeType === "text/markdown" ||
    fileName.endsWith(".txt") ||
    fileName.endsWith(".md") ||
    fileName.endsWith(".markdown")
  ) {
    chunks = await extractPlainText(filePath, fileType === "MD" || fileName.endsWith(".md") ? "Markdown" : "Text");
  } else if (
    ["XLS", "XLSX"].includes(fileType) ||
    mimeType === "application/vnd.ms-excel" ||
    mimeType === "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" ||
    fileName.endsWith(".xls") ||
    fileName.endsWith(".xlsx")
  ) {
    chunks = await extractExcel(filePath);
  } else {
    throw new Error("Parsing is not supported for this playbook file type.");
  }

  const text = flattenChunks(chunks);
  assertExtractedText(text);

  return { text, chunks };
}

export function parsingErrorMessage(error: unknown) {
  if (error instanceof Error && error.message) {
    return error.message.length > 180 ? `${error.message.slice(0, 177)}...` : error.message;
  }
  return "Playbook parsing failed. Replace the file and try again.";
}

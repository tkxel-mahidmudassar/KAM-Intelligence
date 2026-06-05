/**
 * Playbook file parser.
 *
 * Extracts text chunks from PDF, DOCX, TXT, Markdown, and Excel files.
 * Each chunk carries source locator metadata (page, section, sheet) for
 * citation purposes in extracted rules and recommendations.
 *
 * Server-only — never import in client components.
 */

export interface ParsedChunk {
  text: string;
  sourcePage?: number;
  sourceSection?: string;
  sourceSheet?: string;
}

export interface ParseResult {
  chunks: ParsedChunk[];
  totalChunks: number;
  error?: string;
}

// ─── PDF ──────────────────────────────────────────────────────────────────────

async function parsePdf(buffer: Buffer): Promise<ParseResult> {
  const pdfParse = require("pdf-parse");
  const data = await pdfParse(buffer);

  // Split by form-feed characters (page breaks) where available
  const rawPages: string[] = data.text
    .split(/\f/)
    .map((p: string) => p.trim())
    .filter((p: string) => p.length > 0);

  const chunks: ParsedChunk[] = rawPages.map((text, i) => ({
    text,
    sourcePage: i + 1,
  }));

  // If no page breaks, fall back to splitting by blank lines into ~500 char chunks
  if (chunks.length === 0) {
    return splitIntoChunks(data.text);
  }

  return { chunks, totalChunks: chunks.length };
}

// ─── DOCX ─────────────────────────────────────────────────────────────────────

async function parseDocx(buffer: Buffer): Promise<ParseResult> {
  const mammoth = require("mammoth");
  const result = await mammoth.extractRawText({ buffer });
  const text: string = result.value ?? "";

  // Split on heading-like lines (ALL CAPS line or lines ending with \n\n)
  const sections = text
    .split(/\n{2,}/)
    .map((s) => s.trim())
    .filter((s) => s.length > 20);

  const chunks: ParsedChunk[] = sections.map((sectionText, i) => {
    // Treat the first line of the section as a heading if it's short
    const lines = sectionText.split("\n");
    const heading = lines[0].length < 80 ? lines[0].trim() : undefined;
    return {
      text: sectionText,
      sourceSection: heading,
    };
  });

  return { chunks, totalChunks: chunks.length };
}

// ─── Excel ────────────────────────────────────────────────────────────────────

async function parseXlsx(buffer: Buffer): Promise<ParseResult> {
  const XLSX = require("xlsx");
  const workbook = XLSX.read(buffer, { type: "buffer" });

  const chunks: ParsedChunk[] = [];

  for (const sheetName of workbook.SheetNames) {
    const sheet = workbook.Sheets[sheetName];
    const rows: string[][] = XLSX.utils.sheet_to_json(sheet, {
      header: 1,
      defval: "",
    });

    // Group rows into meaningful text blocks (skip fully empty rows)
    const lines = rows
      .map((row: string[]) => row.filter((cell) => String(cell).trim() !== "").join(" | "))
      .filter((line: string) => line.trim().length > 0);

    if (lines.length === 0) continue;

    // Chunk every 20 rows to keep context manageable
    for (let i = 0; i < lines.length; i += 20) {
      const slice = lines.slice(i, i + 20).join("\n");
      chunks.push({
        text: slice,
        sourceSheet: sheetName,
        sourcePage: Math.floor(i / 20) + 1,
      });
    }
  }

  return { chunks, totalChunks: chunks.length };
}

// ─── TXT / Markdown ───────────────────────────────────────────────────────────

function parseText(text: string): ParseResult {
  // Split on Markdown headings (# / ## / ###) or blank-line-separated blocks
  const sections = text
    .split(/(?=^#{1,3} )/m)
    .flatMap((block) => block.split(/\n{3,}/))
    .map((s) => s.trim())
    .filter((s) => s.length > 20);

  const chunks: ParsedChunk[] = sections.map((sectionText) => {
    const headingMatch = sectionText.match(/^#{1,3} (.+)/);
    return {
      text: sectionText,
      sourceSection: headingMatch ? headingMatch[1].trim() : undefined,
    };
  });

  return { chunks, totalChunks: chunks.length };
}

// ─── Fallback chunker ─────────────────────────────────────────────────────────

function splitIntoChunks(text: string, chunkSize = 500): ParseResult {
  const words = text.split(/\s+/);
  const chunks: ParsedChunk[] = [];
  let current: string[] = [];

  for (const word of words) {
    current.push(word);
    if (current.join(" ").length >= chunkSize) {
      chunks.push({ text: current.join(" ") });
      current = [];
    }
  }
  if (current.length > 0) chunks.push({ text: current.join(" ") });

  return { chunks, totalChunks: chunks.length };
}

// ─── Public API ───────────────────────────────────────────────────────────────

export async function parsePlaybookFile(
  buffer: Buffer,
  mimeType: string,
  fileName: string
): Promise<ParseResult> {
  try {
    const ext = fileName.split(".").pop()?.toLowerCase() ?? "";

    if (mimeType === "application/pdf" || ext === "pdf") {
      return await parsePdf(buffer);
    }

    if (
      mimeType === "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
      mimeType === "application/msword" ||
      ext === "docx" ||
      ext === "doc"
    ) {
      return await parseDocx(buffer);
    }

    if (
      mimeType === "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" ||
      mimeType === "application/vnd.ms-excel" ||
      ext === "xlsx" ||
      ext === "xls"
    ) {
      return await parseXlsx(buffer);
    }

    if (
      mimeType === "text/plain" ||
      mimeType === "text/markdown" ||
      ext === "txt" ||
      ext === "md"
    ) {
      return parseText(buffer.toString("utf-8"));
    }

    return {
      chunks: [],
      totalChunks: 0,
      error: `Unsupported file type: ${mimeType}`,
    };
  } catch (err) {
    return {
      chunks: [],
      totalChunks: 0,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

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

export async function extractPdfPages(buffer: Buffer): Promise<string[]> {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const PDFParser = require("pdf2json");

  return new Promise((resolve, reject) => {
    const parser = new PDFParser(null, 1);

    parser.on("pdfParser_dataError", (error: { parserError?: unknown }) => {
      reject(error?.parserError instanceof Error ? error.parserError : new Error(String(error?.parserError ?? error)));
    });

    parser.on("pdfParser_dataReady", (data: PdfData) => {
      const pages = (data.Pages ?? []).map(pageToText).filter(Boolean);
      resolve(pages);
    });

    parser.parseBuffer(buffer);
  });
}

export async function extractPdfText(buffer: Buffer): Promise<string> {
  return (await extractPdfPages(buffer)).join("\n\n").trim();
}

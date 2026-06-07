import { randomUUID } from "crypto";
import { extname } from "path";
import { NextRequest, NextResponse } from "next/server";
import { parseV2AccountDocument } from "@/lib/v2/documentParser";

export const runtime = "nodejs";

const MAX_FILE_SIZE = 20 * 1024 * 1024;
const ALLOWED_EXTENSIONS = new Set([".pdf", ".doc", ".docx", ".txt", ".md", ".xlsx", ".xls"]);

function compactText(value: string) {
  return value.replace(/\r\n/g, "\n").replace(/[ \t]+/g, " ").replace(/\n{3,}/g, "\n\n").trim();
}

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const files = formData.getAll("files").filter((item): item is File => item instanceof File);
    const documentType = String(formData.get("type") || "Account source");

    if (files.length === 0) {
      return NextResponse.json({ error: "At least one file is required" }, { status: 400 });
    }

    const documents = await Promise.all(
      files.map(async (file) => {
        const ext = extname(file.name).toLowerCase();
        if (!ALLOWED_EXTENSIONS.has(ext)) {
          throw new Error(`${file.name} is not a supported onboarding source file`);
        }
        if (file.size > MAX_FILE_SIZE) {
          throw new Error(`${file.name} exceeds the 20 MB upload limit`);
        }

        const bytes = Buffer.from(await file.arrayBuffer());
        const parsed = await parseV2AccountDocument(bytes, file.type, file.name);
        const extractedText = compactText(parsed.chunks.map((chunk) => chunk.text).join("\n\n"));

        return {
          id: `source-${randomUUID()}`,
          type: documentType,
          fileName: file.name,
          fileUrl: "",
          uploadedAt: "Today",
          mimeType: file.type,
          size: file.size,
          charCount: extractedText.length,
          extractedText,
          preview: extractedText.slice(0, 1600),
          parseError: parsed.error,
        };
      }),
    );

    return NextResponse.json({ documents });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Onboarding document upload failed" },
      { status: 500 },
    );
  }
}

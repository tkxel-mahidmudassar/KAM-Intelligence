import { NextRequest, NextResponse } from "next/server";
import { generateV2KycDocument, type V2KycDocumentInput } from "@/lib/v2/kycDocumentAgent";

export const runtime = "nodejs";

function isObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    if (!isObject(body)) {
      return NextResponse.json({ error: "Invalid KYC generation payload" }, { status: 400 });
    }

    const input: V2KycDocumentInput = {
      role: String(body.role || "ASSOCIATE"),
      draft: isObject(body.draft)
        ? Object.fromEntries(Object.entries(body.draft).map(([key, value]) => [key, String(value ?? "")]))
        : {},
      kycSections: Array.isArray(body.kycSections)
        ? body.kycSections.map((section) => ({
            title: String(section?.title || ""),
            source: String(section?.source || ""),
            status: String(section?.status || ""),
            draft: String(section?.draft || ""),
          }))
        : [],
      sourceFiles: Array.isArray(body.sourceFiles) ? body.sourceFiles.map(String) : [],
      documents: Array.isArray(body.documents)
        ? body.documents.map((document) => ({
            fileName: String(document?.fileName || ""),
            type: String(document?.type || ""),
            preview: String(document?.preview || ""),
            extractedText: String(document?.extractedText || ""),
          }))
        : [],
      journey: Array.isArray(body.journey)
        ? body.journey.map((item) => ({
            type: String(item?.type || ""),
            title: String(item?.title || ""),
            dueDate: String(item?.dueDate || ""),
            recurrence: String(item?.recurrence || ""),
          }))
        : [],
    };

    const result = await generateV2KycDocument(input);
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "KYC generation failed" },
      { status: 500 },
    );
  }
}

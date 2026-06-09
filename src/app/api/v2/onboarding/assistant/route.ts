import { NextRequest, NextResponse } from "next/server";
import { runV2OnboardingAssistant, type V2OnboardingAgentInput } from "@/lib/v2/onboardingAgent";

export const runtime = "nodejs";

function isObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    if (!isObject(body)) {
      return NextResponse.json({ error: "Invalid onboarding assistant payload" }, { status: 400 });
    }

    const input: V2OnboardingAgentInput = {
      role: String(body.role || "ASSOCIATE"),
      sourceFiles: Array.isArray(body.sourceFiles) ? body.sourceFiles.map(String) : [],
      prompt: String(body.prompt || ""),
      draft: isObject(body.draft)
        ? Object.fromEntries(Object.entries(body.draft).map(([key, value]) => [key, String(value ?? "")]))
        : {},
      documents: Array.isArray(body.documents)
        ? body.documents.map((document) => ({
            fileName: String(document?.fileName || ""),
            type: String(document?.type || ""),
            uploadedAt: String(document?.uploadedAt || ""),
            extractedText: String(document?.extractedText || ""),
            preview: String(document?.preview || ""),
            charCount: Number(document?.charCount || 0),
          }))
        : [],
      journey: Array.isArray(body.journey)
        ? body.journey.map((item) => ({
            type: item?.type === "Meeting" || item?.type === "QBR" ? item.type : "To-do",
            title: String(item?.title || ""),
            dueDate: String(item?.dueDate || ""),
            recurrence: String(item?.recurrence || ""),
          }))
        : [],
      kycSections: Array.isArray(body.kycSections)
        ? body.kycSections.map((section) => ({
            title: String(section?.title || ""),
            source: String(section?.source || ""),
            status: section?.status === "Ready" ? "Ready" : "Needs input",
            draft: String(section?.draft || ""),
          }))
        : [],
    };

    const result = await runV2OnboardingAssistant(input);
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Onboarding assistant failed",
      },
      { status: 500 },
    );
  }
}

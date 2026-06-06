import { NextRequest, NextResponse } from "next/server";
import { runV2JourneyAgent, type V2JourneyAgentInput } from "@/lib/v2/journeyAgent";

export const runtime = "nodejs";

function isObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    if (!isObject(body)) {
      return NextResponse.json({ error: "Invalid journey payload" }, { status: 400 });
    }

    const input: V2JourneyAgentInput = {
      role: String(body.role || "ASSOCIATE"),
      mode: body.mode === "enhance" ? "enhance" : "generate",
      prompt: String(body.prompt || ""),
      draft: isObject(body.draft)
        ? Object.fromEntries(Object.entries(body.draft).map(([key, value]) => [key, String(value ?? "")]))
        : {},
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
            type: item?.type === "Meeting" || item?.type === "QBR" ? item.type : "To-do",
            title: String(item?.title || ""),
            dueDate: String(item?.dueDate || ""),
            recurrence: String(item?.recurrence || ""),
          }))
        : [],
    };

    const result = await runV2JourneyAgent(input);
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Journey agent failed" },
      { status: 500 },
    );
  }
}

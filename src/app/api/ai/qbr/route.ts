import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { complete } from "@/lib/ai";
import { getRoleFromRequest, ok, badRequest, notFound, serverError, guard } from "@/lib/api";

// POST /api/ai/qbr  { sessionId }
export async function POST(req: NextRequest) {
  try {
    const role = getRoleFromRequest(req);
    const denied = guard(role, "qbr:view");
    if (denied) return denied;

    const { sessionId } = await req.json();
    if (!sessionId) return badRequest("sessionId is required");

    const session = await prisma.qbrSession.findUnique({
      where: { id: sessionId },
      include: {
        account: {
          include: {
            kamScores:    { orderBy: { computedAt: "desc" }, take: 1 },
            kpiDimensions:{ orderBy: { recordedAt: "desc" } },
          },
        },
        items: { orderBy: { order: "asc" } },
      },
    });
    if (!session) return notFound("QBR session");

    const prompt = `You are a DotKAM engine. Write a concise executive summary for the QBR/DBR session below.
The summary should: recap key outcomes, highlight risks discussed, list committed actions, and note any expansion opportunities.
Write 3-4 sentences in a professional, executive tone.

Session: ${session.title} (${session.type})
Account: ${session.account.name} | Health: ${session.account.health} | Score: ${session.account.kamScores[0]?.overall ?? "N/A"}/100
Conducted: ${session.conductedAt?.toISOString().split("T")[0] ?? "In progress"}
Attendees: ${session.attendees ? JSON.parse(session.attendees as string).join(", ") : "N/A"}

Agenda items:
${session.items.map((i) => `  [${i.category}] ${i.title}: ${i.content ?? ""} (status: ${i.status ?? "pending"})`).join("\n")}

Notes: ${session.notes ?? "None"}`;

    const aiResponse = await complete({
      accountId: session.accountId,
      task: "qbr-summary",
      messages: [{ role: "user", content: prompt }],
      maxTokens: 2048,
      temperature: 0.5, // prose — client-facing, professional
    });

    // Persist summary back to session
    await prisma.qbrSession.update({
      where: { id: sessionId },
      data: { aiSummary: aiResponse.content },
    });

    return ok({ summary: aiResponse.content, model: aiResponse.model, latencyMs: aiResponse.latencyMs });
  } catch (err) {
    return serverError(err);
  }
}

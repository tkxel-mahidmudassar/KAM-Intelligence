import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { complete } from "@/lib/ai";
import { getRoleFromRequest, ok, badRequest, notFound, serverError, guard } from "@/lib/api";

// POST /api/ai/qbr/generate  { accountId, title?, type? }
// Uses the configured AI provider to generate a full QBR/DBR session with agenda items, saves to DB, returns session.
export async function POST(req: NextRequest) {
  try {
    const role = getRoleFromRequest(req);
    const denied = guard(role, "qbr:view");
    if (denied) return denied;

    const body = await req.json();
    const { accountId, title: requestedTitle, type: requestedType } = body;
    if (!accountId) return badRequest("accountId is required");

    const account = await prisma.account.findUnique({
      where: { id: accountId },
      include: {
        kamScores:    { orderBy: { computedAt: "desc" }, take: 1 },
        kpiDimensions:{ orderBy: { recordedAt: "desc" } },
        signals:      { where: { isResolved: false }, take: 10 },
        actions:      { where: { status: { in: ["OPEN", "IN_PROGRESS"] } }, take: 10 },
        qbrSessions:  { orderBy: { createdAt: "desc" }, take: 1, include: { items: { orderBy: { order: "asc" } } } },
      },
    });
    if (!account) return notFound("Account");

    const sessionType = requestedType ?? "QBR";
    const now         = new Date();
    const monthYear   = now.toLocaleDateString("en-US", { month: "long", year: "numeric" });
    const sessionTitle = requestedTitle || `${account.name} ${sessionType} — ${monthYear}`;

    const lastSession = account.qbrSessions[0];

    const prompt = `You are a Kamazing engine. Generate a structured ${sessionType} (${sessionType === "QBR" ? "Quarterly Business Review" : sessionType === "DBR" ? "Daily Business Review" : "Executive Business Review"}) agenda for the account below.

Account: ${account.name} | Industry: ${account.industry ?? "N/A"} | ARR: $${account.arr.toLocaleString()}
Health: ${account.health} | Score: ${account.kamScores[0]?.overall ?? "N/A"}/100
Contract ends: ${account.contractEnd?.toISOString().split("T")[0] ?? "N/A"}
Open news: ${account.signals.map((s) => `${s.type}: ${s.title}`).join("; ") || "none"}
Open actions: ${account.actions.map((a) => a.title).join("; ") || "none"}
KPIs: ${account.kpiDimensions.map((k) => `${k.name}: ${k.value}${k.unit ?? ""} vs target ${k.target ?? "N/A"}${k.unit ?? ""}`).join("; ") || "none"}
${lastSession ? `Last session: "${lastSession.title}" (${lastSession.status}) with ${lastSession.items.length} items` : "No previous sessions"}

IMPORTANT: respond with ONLY a raw JSON object — no markdown code fences, no backticks, no explanation. Start your response with { and end with }.

{
  "items": [
    {
      "order": 1,
      "category": "REVIEW",
      "title": "agenda item title under 80 chars",
      "content": "2-3 sentence description with specific data points and talking notes",
      "status": "OPEN"
    }
  ],
  "suggestedAttendees": ["Role 1", "Role 2"],
  "executiveSummary": "1 sentence framing for the session"
}

Use one of these category values: REVIEW, RISK, ACTION, EXPANSION, WRAP_UP.
Generate 5-8 agenda items relevant to this account's health status and open issues.`;

    const aiResponse = await complete({
      accountId,
      task: "qbr-generate",
      messages: [{ role: "user", content: prompt }],
      maxTokens: 8192,
      temperature: 0.4,
    });

    // Parse AI response
    let parsed: {
      items: Array<{ order: number; category: string; title: string; content: string; status: string }>;
      suggestedAttendees: string[];
      executiveSummary: string;
    };

    const rawContent = aiResponse.content;
    console.log("[qbr/generate] raw AI response length:", rawContent?.length, "preview:", rawContent?.slice(0, 120));

    try {
      // Strip markdown code fences if present, then extract outermost JSON object
      const stripped = rawContent
        .replace(/^```(?:json)?\s*/i, "")
        .replace(/\s*```\s*$/i, "")
        .trim();

      const firstBrace = stripped.indexOf("{");
      const lastBrace  = stripped.lastIndexOf("}");
      if (firstBrace === -1 || lastBrace === -1 || lastBrace <= firstBrace) {
        throw new Error(`No JSON object found in response. First 200 chars: ${stripped.slice(0, 200)}`);
      }
      const jsonStr = stripped.slice(firstBrace, lastBrace + 1);
      console.log("[qbr/generate] extracted JSON length:", jsonStr.length, "starts:", jsonStr.slice(0, 80));
      parsed = JSON.parse(jsonStr);
      if (!Array.isArray(parsed.items) || parsed.items.length === 0) {
        throw new Error(`No items array in parsed response. Keys: ${Object.keys(parsed).join(", ")}`);
      }
      console.log("[qbr/generate] parsed OK — items:", parsed.items.length, "summary:", parsed.executiveSummary?.slice(0, 60));
    } catch (parseErr) {
      console.error("[qbr/generate] JSON parse failed:", parseErr instanceof Error ? parseErr.message : parseErr);
      // Fallback: create a minimal skeleton if the AI response is unparseable
      parsed = {
        items: [
          { order: 1, category: "REVIEW",     title: "Account Health & Score Review",   content: `Review of ${account.name}'s current health status and KAM score trends.`, status: "OPEN" },
          { order: 2, category: "RISK",        title: "Open News & Risk Discussion",     content: `Address ${account.signals.length} unresolved news item(s) affecting the account.`, status: "OPEN" },
          { order: 3, category: "ACTION",      title: "Action Items Review",             content: `Review and update status on ${account.actions.length} open action(s).`, status: "OPEN" },
          { order: 4, category: "EXPANSION",   title: "Growth & Expansion Opportunities",content: "Identify upsell and cross-sell opportunities aligned with strategic goals.", status: "OPEN" },
          { order: 5, category: "WRAP_UP",     title: "Next Steps & Commitments",        content: "Agree on action items, owners, and dates before close of session.", status: "OPEN" },
        ],
        suggestedAttendees: ["Account Executive", "KAM", "Customer Success Manager", "Executive Sponsor"],
        executiveSummary: `AI-generated ${sessionType} for ${account.name}`,
      };
    }

    // Persist session + items in a transaction
    const session = await prisma.$transaction(async (tx) => {
      const newSession = await tx.qbrSession.create({
        data: {
          accountId,
          type:       sessionType as never,
          status:     "DRAFT",
          title:      sessionTitle,
          scheduledAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 1 week out by default
          attendees:  JSON.stringify(parsed.suggestedAttendees ?? []),
          notes:      parsed.executiveSummary ?? null,
        },
      });

      await tx.qbrItem.createMany({
        data: parsed.items.map((item) => ({
          sessionId: newSession.id,
          order:     item.order,
          category:  item.category,
          title:     item.title,
          content:   item.content,
          status:    item.status ?? "OPEN",
        })),
      });

      // Reload with items
      return tx.qbrSession.findUnique({
        where: { id: newSession.id },
        include: { items: { orderBy: { order: "asc" } } },
      });
    });

    return ok({ ...session, model: aiResponse.model, latencyMs: aiResponse.latencyMs });
  } catch (err) {
    return serverError(err);
  }
}

import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { complete } from "@/lib/ai";
import { getRoleFromRequest, ok, badRequest, notFound, serverError, guard } from "@/lib/api";

const VALID_SECTIONS = ["csat", "relationship", "risk", "contract", "whitespace"] as const;

// POST /api/ai/questionnaire  { accountId, section }
export async function POST(req: NextRequest) {
  try {
    const role = getRoleFromRequest(req);
    const denied = guard(role, "questionnaire:create");
    if (denied) return denied;

    const { accountId, section } = await req.json();
    if (!accountId) return badRequest("accountId is required");
    if (!section || !VALID_SECTIONS.includes(section as typeof VALID_SECTIONS[number]))
      return badRequest(`section must be one of: ${VALID_SECTIONS.join(", ")}`);

    // Fetch account context
    const account = await prisma.account.findUnique({
      where: { id: accountId },
      include: {
        signals: { where: { isResolved: false }, orderBy: { detectedAt: "desc" }, take: 10 },
        kamScores: { orderBy: { createdAt: "desc" }, take: 1 },
        kycVersions: { where: { status: "APPROVED" }, orderBy: { createdAt: "desc" }, take: 1 },
      },
    });
    if (!account) return notFound("Account");

    const latestKyc   = account.kycVersions[0];
    const latestScore = account.kamScores[0];
    const scoreDisplay = latestScore ? `${latestScore.overall}/100` : "unknown";
    const signals = account.signals.map((s) => `${s.type} [${s.severity}]: ${s.title}`).join("\n");

    // Section-specific question definitions
    const SECTION_QUESTIONS: Record<string, Array<{ id: string; label: string; inputType: string; options?: string[] }>> = {
      csat: [
        { id: "csat_score",         label: "CSAT score from last survey (1–10)",    inputType: "SCALE",   options: ["1","2","3","4","5","6","7","8","9","10"] },
        { id: "client_sentiment",   label: "Client sentiment score (1–5)",            inputType: "SCALE",   options: ["1","2","3","4","5"] },
        { id: "survey_recency",     label: "Survey conducted within last 90 days?",   inputType: "BOOLEAN" },
        { id: "satisfaction_trend", label: "Satisfaction trend",                       inputType: "SELECT",  options: ["IMPROVING","STABLE","DECLINING"] },
      ],
      relationship: [
        { id: "exec_sponsor_engaged", label: "Executive sponsor actively engaged?",    inputType: "BOOLEAN" },
        { id: "stakeholder_breadth",  label: "Contacts engaged at client (1=1, 5=5+)", inputType: "SCALE",   options: ["1","2","3","4","5"] },
        { id: "meeting_cadence",      label: "Regular meeting cadence maintained?",    inputType: "BOOLEAN" },
        { id: "champion_strength",    label: "Internal champion strength",             inputType: "SELECT",  options: ["STRONG","MODERATE","WEAK","NONE"] },
      ],
      risk: [
        { id: "competitive_threat", label: "Competitive threat level",             inputType: "SELECT",  options: ["LOW","MEDIUM","HIGH","CRITICAL"] },
        { id: "budget_risk",        label: "Budget / renewal risk",                inputType: "SELECT",  options: ["LOW","MEDIUM","HIGH"] },
        { id: "key_person_risk",    label: "Key person dependency risk",           inputType: "SELECT",  options: ["LOW","MEDIUM","HIGH"] },
        { id: "strategic_alignment",label: "Strategic alignment score (1–5)",      inputType: "SCALE",   options: ["1","2","3","4","5"] },
      ],
      contract: [
        { id: "renewal_probability",  label: "Renewal probability %",                  inputType: "SCALE",   options: ["0","10","20","30","40","50","60","70","80","90","100"] },
        { id: "payment_timeliness",   label: "Payment timeliness",                     inputType: "SELECT",  options: ["ALWAYS","USUALLY","SOMETIMES","RARELY"] },
        { id: "contract_satisfaction",label: "Satisfaction with contract terms (1–5)", inputType: "SCALE",   options: ["1","2","3","4","5"] },
        { id: "expansion_interest",   label: "Client expansion interest",              inputType: "SELECT",  options: ["HIGH","MEDIUM","LOW","NONE"] },
      ],
      whitespace: [
        { id: "untapped_products",    label: "Untapped product/service lines (0–5)",  inputType: "SCALE",   options: ["0","1","2","3","4","5"] },
        { id: "upsell_potential",     label: "Upsell potential score (1–5)",           inputType: "SCALE",   options: ["1","2","3","4","5"] },
        { id: "cross_sell_potential", label: "Cross-sell potential score (1–5)",       inputType: "SCALE",   options: ["1","2","3","4","5"] },
        { id: "solution_utilization", label: "Current engagement adoption %",          inputType: "SCALE",   options: ["0","10","20","30","40","50","60","70","80","90","100"] },
      ],
    };

    const questions = SECTION_QUESTIONS[section];

    const prompt = `You are a Kamazing engine. Based on the account context below, pre-populate a questionnaire section with your best estimates.

Account: ${account.name}
Health: ${account.health}
ARR: ${account.arr != null ? `$${account.arr.toLocaleString()}` : "unknown"}
Contract end: ${account.contractEnd ? new Date(account.contractEnd).toLocaleDateString() : "unknown"}
Industry: ${account.industry ?? "unknown"}
Latest KAM score: ${latestScore ? `${latestScore.overall}/100` : "unknown"}

Active signals:
${signals || "None"}

KYC summary:
${latestKyc?.executiveSummary ?? "Not available"}

Section to fill: ${section.toUpperCase()}

Questions:
${questions.map((q, i) => `${i + 1}. [${q.id}] ${q.label} — type: ${q.inputType}${q.options ? `, options: ${q.options.join("|")}` : ""}`).join("\n")}

Return ONLY a JSON object mapping questionId → { response: string, confidence: number (0.0–1.0), rationale: string }

Rules:
- For BOOLEAN, respond with "true" or "false"
- For SCALE, respond with one of the listed option values as a string (e.g. "7")
- For SELECT, respond with exactly one of the listed option strings (e.g. "MEDIUM")
- confidence: 0.0 = pure guess, 1.0 = high certainty from data
- Be conservative — if no data supports a high value, use neutral/moderate estimates
- Do NOT include markdown, only raw JSON`;

    const aiResponse = await complete({
      accountId,
      task: "questionnaire-prefill",
      messages: [{ role: "user", content: prompt }],
      maxTokens: 1024,
      jsonMode: true, // temperature enforced to 0.0 at provider level
    });

    let suggestions: Record<string, { response: string; confidence: number; rationale: string }> = {};
    try {
      const match = aiResponse.content.match(/\{[\s\S]*\}/);
      suggestions = JSON.parse(match?.[0] ?? aiResponse.content);
    } catch {
      // Return empty suggestions on parse failure
    }

    // Validate and sanitize
    const validated: typeof suggestions = {};
    for (const q of questions) {
      const s = suggestions[q.id];
      if (!s || typeof s.response !== "string") continue;
      validated[q.id] = {
        response:   s.response,
        confidence: typeof s.confidence === "number" ? Math.min(1, Math.max(0, s.confidence)) : 0.5,
        rationale:  typeof s.rationale === "string" ? s.rationale : "",
      };
    }

    return ok({
      suggestions: validated,
      model: aiResponse.model,
      latencyMs: aiResponse.latencyMs,
    });
  } catch (err) {
    return serverError(err);
  }
}

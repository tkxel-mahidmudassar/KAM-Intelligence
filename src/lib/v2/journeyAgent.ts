import { complete } from "@/lib/ai";

export interface V2JourneyAgentInput {
  role: string;
  mode: "generate" | "enhance";
  prompt: string;
  draft: Record<string, string>;
  documents: Array<{
    fileName: string;
    type: string;
    preview?: string;
    extractedText?: string;
  }>;
  journey: Array<{
    type: "Meeting" | "QBR" | "To-do";
    title: string;
    dueDate: string;
    recurrence: string;
  }>;
}

export interface V2JourneyAgentOutput {
  assistantReply: string;
  journeyItems: Array<{
    type: "Meeting" | "QBR" | "To-do";
    title: string;
    dueDate: string;
    recurrence: string;
  }>;
}

function parseJson(content: string): V2JourneyAgentOutput {
  const raw = content.replace(/```json|```/g, "").trim();
  return JSON.parse(raw);
}

function normalizeOutput(output: Partial<V2JourneyAgentOutput>): V2JourneyAgentOutput {
  return {
    assistantReply: String(output.assistantReply || "I updated the account journey.").slice(0, 300),
    journeyItems: Array.isArray(output.journeyItems)
      ? output.journeyItems
          .filter((item) => item.title && item.dueDate)
          .slice(0, 12)
          .map((item) => ({
            type: item.type === "Meeting" || item.type === "QBR" ? item.type : "To-do",
            title: String(item.title).slice(0, 140),
            dueDate: String(item.dueDate).slice(0, 30),
            recurrence: String(item.recurrence || "Once").slice(0, 40),
          }))
      : [],
  };
}

export async function runV2JourneyAgent(input: V2JourneyAgentInput): Promise<V2JourneyAgentOutput> {
  const response = await complete({
    task: "v2-account-journey-agent",
    jsonMode: true,
    temperature: 0.16,
    maxTokens: 2200,
    messages: [
      {
        role: "system",
        content:
          "You are the V2 Tkxel account journey generation and editing agent. Build practical account journey items using account profile, uploaded evidence, existing journey items, and the user's instruction. Return valid JSON only.",
      },
      {
        role: "user",
        content: `Update the account journey.

Mode:
${input.mode}

Role:
${input.role}

Account draft:
${JSON.stringify(input.draft, null, 2)}

Uploaded evidence:
${JSON.stringify(input.documents, null, 2)}

Current journey:
${JSON.stringify(input.journey, null, 2)}

User instruction:
${input.prompt || "Create or improve the default journey."}

Return JSON:
{
  "assistantReply": "short summary of what changed",
  "journeyItems": [
    {
      "type": "Meeting, QBR, or To-do",
      "title": "item title",
      "dueDate": "YYYY-MM-DD",
      "recurrence": "Once, Weekly, Monthly, Quarterly, etc."
    }
  ]
}

Rules:
- If mode is generate, return a complete recommended journey.
- If mode is enhance, preserve useful existing cadence but improve gaps, dates, recurrence, and titles based on the instruction.
- Use only Meeting, QBR, and To-do item types.
- Use the standard account journey as the baseline: Day 0 account assignment and sales handover; Day 7 discovery and KYC review; Day 14 stakeholder mapping and relationship planning; Day 30 initial account health review; Day 45 executive alignment review; Day 60 delivery governance review; Day 90 first QBR; monthly account review; quarterly QBR; semi-annual strategic review; T-180 renewal readiness; T-120 renewal planning; T-90 renewal execution; T-30 renewal finalization; continuous AI monitoring and exception management.
- Journey items should influence or inspect the relevant KPI dimensions from the scoring framework: Relationship Health, Contract Health, Customer Success, Risk Score, Resource Health, Project Health, Financial Health, and Whitespace Analysis.
- Do not invent client commitments or dates that conflict with provided data; choose reasonable future dates when needed.
- Keep the journey ordered and operational for a KAM/Associate to follow.`,
      },
    ],
  });

  return normalizeOutput(parseJson(response.content));
}

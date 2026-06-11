import { complete } from "@/lib/ai";
import { approvalStateForRole, v2AgentBehaviorPrompt, type V2ApprovalState } from "@/lib/v2/agentBehavior";

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
    offsetDays?: number;
    dueDate: string;
    recurrence: string;
  }>;
}

export interface V2JourneyAgentOutput {
  assistantReply: string;
  journeyItems: Array<{
    type: "Meeting" | "QBR" | "To-do";
    title: string;
    offsetDays?: number;
    dueDate: string;
    recurrence: string;
    proposedValue?: string;
    source?: string;
    confidence?: number;
    reasoningSummary?: string;
    approvalState?: V2ApprovalState;
  }>;
}

function parseJson(content: string): V2JourneyAgentOutput {
  const raw = content.replace(/```json|```/g, "").trim();
  return JSON.parse(raw);
}

function normalizeOutput(output: Partial<V2JourneyAgentOutput>, role: string): V2JourneyAgentOutput {
  return {
    assistantReply: String(output.assistantReply || "I updated the account journey.").slice(0, 300),
    journeyItems: Array.isArray(output.journeyItems)
      ? output.journeyItems
          .filter((item) => item.title && (typeof item.offsetDays === "number" || item.dueDate))
          .slice(0, 12)
          .map((item) => {
            const title = String(item.title).slice(0, 140);
            const dueDate = String(item.dueDate).slice(0, 30);
            const offsetDays = typeof item.offsetDays === "number" ? Math.max(0, Math.round(item.offsetDays)) : undefined;
            const confidence = typeof item.confidence === "number" ? Math.max(0, Math.min(1, item.confidence)) : 0.7;
            return {
              type: item.type === "Meeting" || item.type === "QBR" ? item.type : "To-do",
              title,
              offsetDays,
              dueDate,
              recurrence: String(item.recurrence || "Once").slice(0, 40),
              proposedValue: String(item.proposedValue || `${title} starts at ${offsetDays ?? dueDate}`).slice(0, 220),
              source: String(item.source || "V2 journey agent").slice(0, 140),
              confidence,
              reasoningSummary: String(item.reasoningSummary || "Suggested from the account journey context.").slice(0, 220),
              approvalState: item.approvalState || approvalStateForRole(role, confidence),
            };
          })
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
      "offsetDays": 30,
      "dueDate": "optional YYYY-MM-DD only for account-specific journeys; use offsetDays for templates",
      "recurrence": "Once, Weekly, Monthly, Quarterly, etc.",
      "proposedValue": "specific journey item change being proposed",
      "source": "uploaded evidence, prior account journey, current draft, or user instruction",
      "confidence": 0.85,
      "reasoningSummary": "short explanation for the journey change",
      "approvalState": "draft | proposed | needs_user_confirmation | associate_requested | kam_review | approved | denied | dismissed"
    }
  ]
}

Rules:
${v2AgentBehaviorPrompt}

Journey-specific rules:
- If mode is generate, return a complete recommended journey.
- If mode is enhance, preserve useful existing cadence but improve gaps, dates, recurrence, and titles based on the instruction.
- Use only supplied account context, uploaded evidence, current journey items, and user instructions. Do not rely on Salesforce mock data or implied CRM records.
- If uploaded files only include file names and no extracted text, treat those names as directional evidence only and ask for missing proof instead of fabricating journey facts.
- For configuration-style requests, suggest diffs first unless the user explicitly instructs you to apply the change.
- For default journey configuration, use offsetDays as days after account creation. Do not collapse new items to Day 0 unless the user explicitly asks for account creation day.
- Use only Meeting, QBR, and To-do item types.
- Use the standard account journey as the baseline: Day 0 account assignment and sales handover; Day 7 discovery and KYC review; Day 14 stakeholder mapping and relationship planning; Day 30 initial account health review; Day 45 executive alignment review; Day 60 delivery governance review; Day 90 first QBR; monthly account review; quarterly QBR; semi-annual strategic review; T-180 renewal readiness; T-120 renewal planning; T-90 renewal execution; T-30 renewal finalization; continuous AI monitoring and exception management.
- Journey items should influence or inspect the relevant KPI dimensions from the scoring framework: Relationship Health, Contract Health, Customer Success, Risk Score, Resource Health, Project Health, Financial Health, and Whitespace Analysis.
- Do not invent client commitments or dates that conflict with provided data; choose reasonable future dates when needed.
- Keep the journey ordered and operational for a KAM/Associate to follow.`,
      },
    ],
  });

  return normalizeOutput(parseJson(response.content), input.role);
}

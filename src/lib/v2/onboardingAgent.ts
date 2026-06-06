import { complete } from "@/lib/ai";

export type V2OnboardingField =
  | "name"
  | "industry"
  | "segment"
  | "arr"
  | "location"
  | "contractRenewal"
  | "kamOwner"
  | "associateOwner"
  | "primaryContact"
  | "activeRisk"
  | "openOpportunity"
  | "nextTouchpoint";

export type V2OnboardingTaskType = "Meeting" | "QBR" | "To-do";

export interface V2OnboardingAgentInput {
  role: string;
  sourceFiles: string[];
  prompt: string;
  draft: Record<string, string>;
  documents: Array<{
    fileName: string;
    type: string;
    uploadedAt?: string;
    extractedText?: string;
    preview?: string;
    charCount?: number;
  }>;
  journey: Array<{
    type: V2OnboardingTaskType;
    title: string;
    dueDate: string;
    recurrence: string;
  }>;
}

export interface V2OnboardingAgentOutput {
  assistantReply: string;
  missingQuestions: string[];
  suggestions: Array<{
    field: V2OnboardingField;
    label: string;
    proposedValue: string;
    source: string;
  }>;
  kycSections: Array<{
    title: string;
    source: string;
    status: "Ready" | "Needs input";
    draft: string;
  }>;
  journeyItems: Array<{
    type: V2OnboardingTaskType;
    title: string;
    dueDate: string;
    recurrence: string;
  }>;
}

function parseJson(content: string): V2OnboardingAgentOutput {
  const raw = content.replace(/```json|```/g, "").trim();
  return JSON.parse(raw);
}

function normalizeOutput(output: V2OnboardingAgentOutput): V2OnboardingAgentOutput {
  return {
    assistantReply: String(output.assistantReply || "I reviewed the account setup context and prepared the next suggested updates."),
    missingQuestions: Array.isArray(output.missingQuestions) ? output.missingQuestions.map(String).slice(0, 6) : [],
    suggestions: Array.isArray(output.suggestions)
      ? output.suggestions
          .filter((suggestion) => suggestion.field && suggestion.proposedValue)
          .slice(0, 8)
          .map((suggestion) => ({
            field: suggestion.field,
            label: String(suggestion.label || suggestion.field),
            proposedValue: String(suggestion.proposedValue).slice(0, 260),
            source: String(suggestion.source || "V2 setup assistant"),
          }))
      : [],
    kycSections: Array.isArray(output.kycSections)
      ? output.kycSections
          .filter((section) => section.title && section.draft)
          .slice(0, 9)
          .map((section) => ({
            title: String(section.title).slice(0, 80),
            source: String(section.source || "V2 setup assistant").slice(0, 120),
            status: section.status === "Ready" ? "Ready" : "Needs input",
            draft: String(section.draft).slice(0, 700),
          }))
      : [],
    journeyItems: Array.isArray(output.journeyItems)
      ? output.journeyItems
          .filter((item) => item.title && item.dueDate)
          .slice(0, 6)
          .map((item) => ({
            type: item.type === "Meeting" || item.type === "QBR" ? item.type : "To-do",
            title: String(item.title).slice(0, 120),
            dueDate: String(item.dueDate).slice(0, 30),
            recurrence: String(item.recurrence || "Once").slice(0, 40),
          }))
      : [],
  };
}

export async function runV2OnboardingAssistant(input: V2OnboardingAgentInput): Promise<V2OnboardingAgentOutput> {
  const response = await complete({
    task: "v2-onboarding-assistant",
    jsonMode: true,
    temperature: 0.15,
    maxTokens: 2600,
    messages: [
      {
        role: "system",
        content:
          "You are the V2 Tkxel KAM account onboarding setup assistant. You help create a new account from uploaded source-file metadata, Salesforce-mock context, user prompts, and current draft fields. Use only the supplied context. Do not claim that you read file body text unless body text is explicitly provided. Return valid JSON only.",
      },
      {
        role: "user",
        content: `Build the next onboarding assistant response for this draft account setup.

Role:
${input.role}

Initial source files:
${JSON.stringify(input.sourceFiles, null, 2)}

Support documents:
${JSON.stringify(input.documents, null, 2)}

Current account draft:
${JSON.stringify(input.draft, null, 2)}

Current journey:
${JSON.stringify(input.journey, null, 2)}

User message:
${input.prompt || "(No additional message; infer missing items from the current setup state.)"}

Return JSON:
{
  "assistantReply": "short conversational response explaining what you changed or what is still missing",
  "missingQuestions": ["questions the user should answer next, only if truly needed"],
  "suggestions": [
    {
      "field": "one of: name, industry, segment, arr, location, contractRenewal, kamOwner, associateOwner, primaryContact, activeRisk, openOpportunity, nextTouchpoint",
      "label": "human label",
      "proposedValue": "specific value to place into the account profile",
      "source": "source file, support document, Salesforce mock, or user message"
    }
  ],
  "kycSections": [
    {
      "title": "Executive summary or another KYC section",
      "source": "specific input source used",
      "status": "Ready or Needs input",
      "draft": "draft text for the KYC section; mention missing data plainly instead of inventing it"
    }
  ],
  "journeyItems": [
    {
      "type": "Meeting, QBR, or To-do",
      "title": "journey item title",
      "dueDate": "YYYY-MM-DD",
      "recurrence": "Once, Monthly, Quarterly, etc."
    }
  ]
}

Rules:
- Do not use old KYC/playbook-agent assumptions.
- Use extracted document text when provided.
- If a document only has filename metadata, use it as directional evidence only.
- Do not fabricate ARR, renewal dates, contacts, or scores if the current draft does not support them.
- Keep suggestions directly actionable and suitable for accept/dismiss UI.
- Ask missing questions instead of inventing critical account facts.
- Journey items should be realistic onboarding follow-ups for a Tkxel KAM account.`,
      },
    ],
  });

  return normalizeOutput(parseJson(response.content));
}

import { complete } from "@/lib/ai";
import { approvalStateForRole, v2AgentBehaviorPrompt, type V2ApprovalState } from "@/lib/v2/agentBehavior";

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
  activeStep?: string;
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
  kycSections?: Array<{
    title: string;
    source: string;
    status: "Ready" | "Needs input";
    draft: string;
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
    confidence?: number;
    reasoningSummary?: string;
    approvalState?: V2ApprovalState;
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

const fieldAliases: Record<V2OnboardingField, string[]> = {
  name: ["name", "account name", "company"],
  industry: ["industry", "vertical"],
  segment: ["segment", "domain"],
  arr: ["arr", "revenue", "annual recurring revenue"],
  location: ["location", "country", "region"],
  contractRenewal: ["contract renewal", "renewal", "contract end", "renewal date"],
  kamOwner: ["kam", "kam owner", "account owner"],
  associateOwner: ["associate", "associate owner"],
  primaryContact: ["primary contact", "client poc", "poc", "main contact"],
  activeRisk: ["risk", "active risk"],
  openOpportunity: ["opportunity", "open opportunity"],
  nextTouchpoint: ["touchpoint", "next touchpoint"],
};

function draftHasValue(input: V2OnboardingAgentInput, field: V2OnboardingField) {
  const value = input.draft?.[field];
  return typeof value === "string" ? value.trim().length > 0 : Boolean(value);
}

function promptTargetsField(input: V2OnboardingAgentInput, field: V2OnboardingField) {
  const prompt = input.prompt.toLowerCase();
  const changeIntent = /\b(change|correct|replace|update|edit|revise|fix|set|make)\b/i.test(input.prompt);
  return changeIntent && fieldAliases[field].some((alias) => prompt.includes(alias));
}

function textTargetsFilledField(text: string, input: V2OnboardingAgentInput) {
  const lower = text.toLowerCase();
  return (Object.keys(fieldAliases) as V2OnboardingField[]).some((field) =>
    draftHasValue(input, field) &&
    !promptTargetsField(input, field) &&
    fieldAliases[field].some((alias) => lower.includes(alias)),
  );
}

function activeStepAllowsKyc(input: V2OnboardingAgentInput) {
  return input.activeStep === "kyc" ||
    input.activeStep === "review" ||
    /\bkyc|profile brief|company history|stakeholder|financial|competitor|executive summary\b/i.test(input.prompt);
}

function activeStepAllowsJourney(input: V2OnboardingAgentInput) {
  return input.activeStep === "journey" ||
    input.activeStep === "review" ||
    /\bjourney|timeline|task|meeting|qbr|todo|to-do|follow[- ]?up|checkpoint\b/i.test(input.prompt);
}

function shouldKeepSuggestion(suggestion: V2OnboardingAgentOutput["suggestions"][number], input: V2OnboardingAgentInput) {
  if (!suggestion.field || !suggestion.proposedValue) return false;
  if (!draftHasValue(input, suggestion.field)) return true;
  return promptTargetsField(input, suggestion.field);
}

function normalizeOutput(output: V2OnboardingAgentOutput, role: string, input: V2OnboardingAgentInput): V2OnboardingAgentOutput {
  return {
    assistantReply: String(output.assistantReply || "I reviewed the account setup context and prepared the next suggested updates."),
    missingQuestions: Array.isArray(output.missingQuestions)
      ? output.missingQuestions
          .map(String)
          .filter((question) => !textTargetsFilledField(question, input))
          .slice(0, 6)
      : [],
    suggestions: Array.isArray(output.suggestions)
      ? output.suggestions
          .filter((suggestion) => shouldKeepSuggestion(suggestion, input))
          .slice(0, 8)
          .map((suggestion) => {
            const confidence = typeof suggestion.confidence === "number" ? Math.max(0, Math.min(1, suggestion.confidence)) : 0.7;
            return {
              field: suggestion.field,
              label: String(suggestion.label || suggestion.field),
              proposedValue: String(suggestion.proposedValue).slice(0, 260),
              source: String(suggestion.source || "V2 setup assistant"),
              confidence,
              reasoningSummary: String(suggestion.reasoningSummary || "Suggested from the current onboarding context.").slice(0, 520),
              approvalState: suggestion.approvalState || approvalStateForRole(role, confidence),
            };
          })
      : [],
    kycSections: Array.isArray(output.kycSections)
      ? (activeStepAllowsKyc(input) ? output.kycSections : [])
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
      ? (activeStepAllowsJourney(input) ? output.journeyItems : [])
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
          "You are the V2 Tkxel KAM account onboarding setup assistant. You help create a new account from uploaded source-file metadata, user prompts, and current draft fields. Use only the supplied context. Do not claim that you read file body text unless body text is explicitly provided. Return valid JSON only.",
      },
      {
        role: "user",
        content: `Build the next onboarding assistant response for this draft account setup.

Role:
${input.role}

Active setup step:
${input.activeStep || "profile"}

Initial source files:
${JSON.stringify(input.sourceFiles, null, 2)}

Support documents:
${JSON.stringify(input.documents, null, 2)}

Current account draft:
${JSON.stringify(input.draft, null, 2)}

Current KYC sections:
${JSON.stringify(input.kycSections ?? [], null, 2)}

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
      "source": "source file, support document, user message, or current draft",
      "confidence": 0.0,
      "reasoningSummary": "2-4 sentence explanation covering source evidence, why the value/score fits, what is still uncertain, and what confirmation would change it",
      "approvalState": "draft | proposed | needs_user_confirmation | associate_requested | kam_review | approved | denied | dismissed"
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
${v2AgentBehaviorPrompt}

Onboarding-specific rules:
- Do not use old KYC/playbook-agent assumptions.
- Never use Salesforce mock data, Salesforce exports, Salesforce assumptions, or implied CRM records in this flow. If a source file name mentions Salesforce, treat it only as an uploaded file name unless extracted text is provided.
- Use POC-style extraction discipline: only propose values, KYC sections, scores, risks, opportunities, and journey items that are directly supported by extracted text, accepted user input, or current draft data. Return empty arrays or missing questions instead of guesses.
- If evidence is directional but not conclusive, set confidence below 0.85, mark the item as needing confirmation, and explain the missing proof in reasoningSummary.
- Scope every response to the active setup step. Profile step answers should focus on account fields. Scoring step answers should focus on KPI/sub-parameter evidence and scoring logic. KYC step answers should focus on KYC sections. Journey step answers should focus on journey items. Review step answers should summarize readiness and approval blockers.
- Use extracted document text when provided.
- Treat non-empty current account draft fields as already supplied; do not ask missing questions for those fields.
- Do not propose account field suggestions for non-empty fields unless the user explicitly asks to change, correct, replace, update, or improve that field.
- Display field labels as "Domain" for segment and "Client POC" for primaryContact.
- If a user dismisses a suggestion and says a correction in the prompt, return the corrected value for the same field only, and explain it as a correction from user-provided information.
- Missing questions must be only for empty, invalid, or ambiguous fields relevant to the active step.
- Preserve current KYC section titles and draft text unless the user explicitly asks to change them or a new document provides a clearly better supported replacement.
- If the user asks to enhance one KYC section, return only that updated section and do not erase or replace unrelated KYC sections.
- Format assistantReply as concise bullets when listing multiple changes.
- If a document only has filename metadata, use it as directional evidence only.
- Do not fabricate ARR, renewal dates, contacts, or scores if the current draft does not support them.
- Account KPI scoring uses a 1-5 scale, not a 0-100 scale.
- The standard KPI dimensions are Relationship Health (20%), Contract Health (15%), Customer Success (15%), Risk Score (15%), Resource Health (10%), Project Health (10%), Financial Health (10%), and Whitespace Analysis (5%).
- KPI sub-parameters must follow the scoring framework: relationship uses Executive Engagement, Stakeholder Coverage, Relationship Penetration, Champion Strength, Engagement Cadence; contract uses Contract Duration, Notice Period Protection, Renewability, Price Uplift Protection, Termination Protection; customer success uses Customer Feedback, Customer Confidence, Delivery Satisfaction, Communication Satisfaction, Issue Resolution; risk uses Industry Risk, Competitive Threat, Vendor Displacement Risk, Delivery Risk, Commercial Risk; resource uses Resource Dependency Risk, Critical Resource Coverage, Team Stability, Skill Alignment, Backup Readiness; project uses Delivery Performance, Backlog Readiness, Roadmap Visibility, Escalation Status, Client Confidence; financial uses Payment Timeliness, Outstanding Exposure, Client Financial Stability, Revenue Trend, Contract vs Billing Alignment; whitespace uses Service Penetration, Cross-Sell Potential, Upsell Potential, Growth Signals, Expansion Readiness.
- Any score-related reasoning must be explanatory, not a label. Explain which evidence was used, which KPI/sub-parameters drove the score, what evidence is missing, and what would raise or lower the score.
- If score evidence is weak, say that the score is provisional and ask for the exact missing proof instead of sounding certain.
- When recommending tasks, tie them to weak KPI/sub-parameter scores and the standard account journey stage instead of generic playbook assumptions.
- The default account journey starts with Day 0 account assignment, Day 7 discovery/KYC review, Day 14 stakeholder mapping, Day 30 health review, Day 45 executive alignment, Day 60 delivery governance, Day 90 first QBR, then monthly, quarterly, semi-annual, renewal, and continuous AI monitoring checkpoints.
- Keep suggestions directly actionable and suitable for accept/dismiss UI.
- Ask missing questions instead of inventing critical account facts.
- Journey items should be realistic onboarding follow-ups for a Tkxel KAM account.`,
      },
    ],
  });

  return normalizeOutput(parseJson(response.content), input.role, input);
}

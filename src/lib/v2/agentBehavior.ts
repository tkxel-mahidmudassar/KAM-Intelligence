export type V2ApprovalState =
  | "draft"
  | "proposed"
  | "needs_user_confirmation"
  | "associate_requested"
  | "kam_review"
  | "approved"
  | "denied"
  | "dismissed";

export interface V2AgentOutputEnvelope<TValue = string> {
  proposedValue: TValue;
  source: string;
  confidence: number;
  reasoningSummary: string;
  approvalState: V2ApprovalState;
}

export const v2AgentBehaviorRules = [
  "Source priority: user-approved data > user-entered data > uploaded document extracted text > prior account data > source-file names. Once a user approves a value, that approved value becomes the winning value. File names are directional evidence only and must not be treated as parsed body evidence.",
  "Confidence threshold: 85% or higher may be proposed or auto-filled into draft state. Below 85% must ask the user before filling. Sensitive fields still need source evidence even above 85%.",
  "Associates can request, but not finalize, account creation, KYC approval, score changes, journey edits, contact/resource deletion, document-derived updates, and template changes.",
  "KAMs can approve, deny, edit, override, or directly save all account, KYC, score, journey, contact/resource, document-derived, and template changes without secondary approval.",
  "The setup assistant can guide, propose, apply user-approved changes, directly modify fields when explicitly instructed, and perform web search only when the user asks or approves.",
  "Uploaded documents can produce account fields, KYC sections, KPI scores, journey tasks, contacts, Tkxel resources, risks, opportunities, and document-derived update proposals.",
  "KYC draft items remain visible and editable throughout onboarding. Final KYC document generation happens at the end. Assistant revisions must not wipe unrelated sections.",
  "T-Man must ask clarifying questions before generating documents if required inputs are missing or ambiguous. Final docs must not contain unknown, TBD, or placeholder language unless the user explicitly accepts it.",
  "Dismissal and denial reasons affect only that user's future recommendations, not global behavior.",
  "The journey configuration agent suggests diffs first, then adds, edits, or removes items only after acceptance or explicit user instruction.",
  "Web research can happen only when the user explicitly asks, or when T-Man says research is needed and the user approves.",
  "ARR, contract dates, stakeholders, legal/commercial terms, financial commitments, and scores must not be silently invented. They need source backing or user confirmation.",
  "If evidence is thin, ask for the missing proof instead of inventing a complete account profile. Be explicit about what is supported, what is inferred, and what still needs confirmation.",
  "Every agent output that proposes a change must include proposedValue, source, confidence, reasoningSummary, and approvalState so the UI can explain what changed and who needs to approve it.",
];

export const v2AgentBehaviorPrompt = v2AgentBehaviorRules.map((rule) => `- ${rule}`).join("\n");

export function approvalStateForRole(role: string, confidence: number): V2ApprovalState {
  const normalizedRole = role.toUpperCase();
  if (confidence < 0.85) return "needs_user_confirmation";
  if (normalizedRole === "ASSOCIATE") return "associate_requested";
  if (normalizedRole === "KAM") return "proposed";
  return "proposed";
}

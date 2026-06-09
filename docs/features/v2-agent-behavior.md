# V2 agent behavior rules

## Source of truth

The canonical implementation lives in:

- `src/lib/v2/agentBehavior.ts`

All V2 assistant, onboarding, journey, KYC, document-generation, and web-research prompts should include these rules instead of redefining behavior independently.

## Agent rules

1. Source priority is `Salesforce mock data > prior account data > uploaded documents > user-entered data`.
2. Once a user approves a value, that approved value becomes the winning value.
3. Values at 85% confidence or higher may be proposed or auto-filled into draft state.
4. Values below 85% confidence must ask the user before filling.
5. Sensitive fields still need source evidence even above 85% confidence.
6. Associates can request, but not finalize, account creation, KYC approval, score changes, journey edits, contact/resource deletion, document-derived updates, and template changes.
7. KAMs can approve, deny, edit, override, or directly save those changes without secondary approval.
8. The setup assistant can guide, propose, apply user-approved changes, directly modify fields when explicitly instructed, and perform web search only when the user asks or approves.
9. Uploaded documents can produce account fields, KYC sections, KPI scores, journey tasks, contacts, Tkxel resources, risks, opportunities, and document-derived update proposals.
10. KYC draft items remain visible and editable throughout onboarding.
11. Final KYC document generation happens at the end of onboarding.
12. Assistant revisions to KYC sections must not wipe unrelated sections.
13. Kammie must ask clarifying questions before generating documents if required inputs are missing or ambiguous.
14. Final documents must not contain unknown, TBD, or placeholder language unless the user explicitly accepts it.
15. Dismissal and denial reasons affect only that user's future recommendations, not global behavior.
16. The journey configuration agent suggests diffs first, then adds, edits, or removes items only after acceptance or explicit user instruction.
17. Web research can happen only when the user explicitly asks, or when Kammie says research is needed and the user approves.
18. ARR, contract dates, stakeholders, legal/commercial terms, financial commitments, and scores must not be silently invented.

## Required proposal envelope

Every agent output that proposes a change must include:

- `proposedValue`
- `source`
- `confidence`
- `reasoningSummary`
- `approvalState`

This lets the UI consistently show what changed, why it changed, where it came from, and who needs to approve it.

## Approval states

Supported approval states:

- `draft`
- `proposed`
- `needs_user_confirmation`
- `associate_requested`
- `kam_review`
- `approved`
- `denied`
- `dismissed`

## Current wiring

The shared prompt is wired into:

- `src/lib/v2/cammieAgent.ts`
- `src/lib/v2/cammieWebResearch.ts`
- `src/lib/v2/documentGenerator.ts`
- `src/lib/v2/journeyAgent.ts`
- `src/lib/v2/kycDocumentAgent.ts`
- `src/lib/v2/onboardingAgent.ts`

## Implementation notes

- The onboarding and journey agents now normalize role-aware approval states.
- KYC generation no longer defaults to `To be confirmed` placeholder text.
- Document generation and Kammie document requests continue to reject placeholder language before final artifacts are returned.
- Web-research output still cites web sources separately from supplied account/document context.

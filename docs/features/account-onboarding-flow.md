# Account onboarding flow

## Current scope

The portfolio `+ Account` button opens a V2 onboarding flow instead of creating an account immediately.

## Flow

1. User clicks `+ Account`.
2. A source-file upload modal opens.
3. The first upload allows multiple files at once so the setup assistant can start from charters, statements of work, kickoff notes, sales notes, or other available context.
4. Selected source files can be removed from the upload list before continuing.
5. Once at least one source file is selected, `Continue` opens the account setup workspace.
6. The setup workspace is step-based instead of showing every setup task at once.
7. The setup workspace stages are:
   - Profile
   - KYC draft
   - Journey
   - Review
8. A setup assistant chat opens as a separate floating window, not as an integrated panel inside the setup workspace.
9. The setup assistant shows progress, parsed field suggestions, agent replies, prompt input, and save/submit actions.
10. Accepting a parsed suggestion writes the proposed value into the draft account form.
11. Dismissing a parsed suggestion opens a floating reason modal. The suggestion cannot be dismissed without a reason.
12. Support document uploads happen inside the chat composer through the attachment control and trigger the V2 onboarding assistant to propose supported updates.
13. The account journey is pre-populated with standard items and is editable before submission.

## KYC draft stage

The KYC draft stage now has its own visible setup screen instead of being implied.

The KYC draft is structured around these sections:

- Executive summary
- Industry overview
- Company history
- Account history with Tkxel
- Account stakeholders
- Company financials
- Engagement history
- Tkxel team on account
- Competitors

Each KYC section shows:

- Section name
- Evidence source
- Current draft status
- Draft text placeholder
- Accept, dismiss, and enhance-with-assistant actions

The review stage shows the KYC handoff state. The V2 onboarding assistant can now return updated KYC draft sections during setup. The final generated KYC document artifact and approval persistence still need to be wired in a later slice.

## Role behavior

- Associate users submit the draft to the KAM.
- KAM users can create the account directly.
- KAM users see pending associate-created account drafts in a `Pending account creations` section on the portfolio page.
- KAM users can open a pending account creation draft, edit the proposed account fields, view the associate's submitted reason, inspect previewable source files, review the drafted KYC sections, review the account journey, save edits, approve the creation, or deny it with a reason.
- The KAM account-creation review page also has its own floating setup assistant chat. The assistant can accept review instructions and attach additional source files through the chat composer.
- Executive/read-only users cannot open the onboarding flow from the disabled `+ Account` button.

## Agent status

This slice implements the onboarding shell, staged setup UI, visible KYC draft structure, and a V2-specific setup assistant route at `POST /api/v2/onboarding/assistant`.

The assistant route:

- uses the configured OpenAI provider through `src/lib/ai`
- does not use old KYC or playbook agents
- accepts source filenames, current draft fields, support-document metadata, journey items, role, and the user's assistant message
- returns assistant replies, missing-information questions, profile suggestions, KYC section drafts, and suggested journey items

Current limitation: browser-selected files are still represented as metadata/object URLs in this UI. The route does not yet receive or parse PDF/DOCX body text. A later slice should add multipart upload, file text extraction, and persisted proposal/approval records.

## Related surfaces

- The notifications panel routes selected notifications into the relevant surface. Current routes include pending account creation review and account workspace opening for account-specific notifications.
- Cammie is available as a bottom-right chat widget. The launcher remains anchored while the chat window opens above it. The backend agent endpoint is not wired yet.
- Cammie should be able to generate documents when the user asks for them by routing the request to the appropriate document-generation agent. Cammie should not generate complex documents ad hoc inside the chat layer; it should identify the requested document type, collect missing inputs, call the relevant agent, and return the generated artifact or status.

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
13. The account journey is pre-populated from the Standard Account Journey
    Template and is editable before submission.

The default journey now includes:

- Day 0 account assignment and sales handover
- Day 7 discovery and KYC review
- Day 14 stakeholder mapping and relationship planning
- Day 30 initial account health review
- Day 45 executive alignment review
- Day 60 delivery governance review
- Day 90 first QBR
- Monthly account review
- Quarterly QBR package
- Semi-annual strategic review
- T-180 renewal readiness
- T-120 renewal planning
- T-90 renewal execution
- T-30 renewal finalization
- Continuous AI monitoring and exception management

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

The review stage shows the KYC handoff state. The V2 onboarding assistant can return updated KYC draft sections during setup, and the final KYC document can now be generated into an openable Markdown artifact.

Generated KYC behavior:

- `POST /api/v2/onboarding/kyc/generate` uses the V2 KYC document generation agent.
- The generated KYC artifact is saved under `public/generated-documents/v2-kyc`.
- Associate users can submit the generated KYC to the KAM.
- KAM users can approve the generated KYC directly.
- Current approval state is local UI state; database persistence is still a follow-up.

## Role behavior

- Associate users submit the draft to the KAM.
- KAM users can create the account directly.
- KAM users see pending associate-created account drafts in a `Pending account creations` section on the portfolio page.
- KAM users can open a pending account creation draft, edit the proposed account fields, view the associate's submitted reason, inspect previewable source files, review the drafted KYC sections, review the account journey, save edits, approve the creation, or deny it with a reason.
- The KAM account-creation review page also has its own floating setup assistant chat. The assistant can accept review instructions and attach additional source files through the chat composer.
- Executive/read-only users cannot open the onboarding flow from the disabled `+ Account` button.

## Agent status

This slice implements the onboarding shell, staged setup UI, visible KYC draft structure, final KYC artifact generation, dedicated account journey generation/editing, a V2-specific setup assistant route at `POST /api/v2/onboarding/assistant`, and multipart onboarding document upload at `POST /api/v2/onboarding/documents/upload`.

The assistant route:

- uses the configured OpenAI provider through `src/lib/ai`
- does not use old KYC or playbook agents
- accepts source filenames, extracted document text, current draft fields, support-document metadata, journey items, role, and the user's assistant message
- returns assistant replies, missing-information questions, profile suggestions, KYC section drafts, and suggested journey items
- is instructed to use the new 1-5 account scoring framework and the eight KPI
  dimensions: Relationship Health, Contract Health, Customer Success, Risk
  Score, Resource Health, Project Health, Financial Health, and Whitespace
  Analysis
- is instructed to avoid fabricating KPI scores, ARR, renewal dates, contacts,
  or other critical facts when source evidence is missing

The document upload route:

- stores uploaded files under `public/uploads/v2-onboarding`
- supports PDF, DOC, DOCX, TXT, Markdown, XLS, and XLSX files
- extracts text through the V2 document parser wrapper
- returns extracted text, a preview, character count, and a previewable file URL
- feeds extracted source text into the setup assistant so suggestions and KYC draft sections are grounded in uploaded material

Current limitation: proposal/approval records for onboarding documents are still in local UI state. A later slice should persist them to the database.

## Account journey agent

The Journey stage has a dedicated V2 journey agent at `POST /api/v2/onboarding/journey`.

The journey agent:

- can generate a complete recommended account journey
- can enhance the current journey using the setup prompt
- returns Meeting, QBR, and To-do items with due dates and recurrence
- replaces the editable journey list with the generated/enhanced output
- writes an assistant note after successful updates
- uses the Standard Account Journey Template as the baseline before applying
  account-specific evidence or user instructions

## Related surfaces

- The notifications panel routes selected notifications into the relevant surface. Current routes include pending account creation review and account workspace opening for account-specific notifications.
- Cammie is available as a bottom-right chat widget. The launcher remains anchored while the chat window opens above it.
- Cammie is wired to `POST /api/v2/cammie`, which uses the configured OpenAI provider through `src/lib/ai`.
- Cammie receives role, visible portfolio account context, active account context when available, and recent conversation turns.
- Cammie can generate general business documents through the V2 document-generation agent when the request is clear enough.
- Cammie can also run web-backed account or market research through the V2 Cammie web-research route when the user asks to search, verify, research, or look up current external context.
- Supported Cammie document requests are intentionally open-ended: QBR outlines, KYC drafts, account briefs, renewal plans, risk memos, meeting briefs, escalation notes, action plans, stakeholder summaries, onboarding notes, and email drafts can all be generated from supplied portfolio/account context.
- Generated Cammie documents are saved as Markdown artifacts under `public/generated-documents/v2-cammie` and returned as openable links in the chat.
- If Cammie cannot generate because a required account or core input is missing, it returns the missing input instead of fabricating.

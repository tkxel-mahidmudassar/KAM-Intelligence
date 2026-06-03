# KAM Intelligence Team Implementation Plan

Last updated: June 3, 2026

This document captures the implementation decisions discussed so far and breaks the work into modules that can be distributed across the team. Do not commit credentials, database URLs, API keys, tokens, or private customer data into this file or the repo.

## Product Direction

KAM Intelligence is moving toward an account command center where daily KAM work is driven by account health, calendar context, action workflows, AI Pulse, and playbook-grounded recommendations.

The product should feel operational and useful from the first screen. Avoid marketing-style pages. Prioritize dense but clean workflows that help KAMs scan accounts, risks, calendar items, recommendations, and actions quickly.

## Role Model

The current role structure is correct:

- Associate: front-line KAM user.
- KAM: manager over associates.
- Exec: executive view.

KAMs can have associates under them. Existing role labels in the UI should use Associate, KAM, and Exec.

## Completed Or In Progress

### Phase 1: Homepage Command Center

Status: implemented in the local working tree.

Scope:

- All homepage summary cards are clickable.
- Clicking a card opens a modal, not a drawer.
- Modal breakdowns show relevant accounts and items behind the card.
- Account rows include account links that navigate to the account page.
- Trend indicators are included where useful.
- Due dates are included for action-oriented cards.
- ARR is informational, not the primary action driver.
- Modals include details, corrective measures, and suggested actions.
- Suggested actions follow the approval workflow.
- Homepage includes a smaller activity log/timeline for recent account activity.
- Calendar supports day-level detail and criticality visibility.

Primary files touched:

- `src/app/(dashboard)/home/page.tsx`
- `src/components/ui/Modal.tsx`
- `src/app/api/actions/route.ts`
- `src/app/api/audit/route.ts`

### Phase 2: Corrected Scoring, Navigation Cleanup, AI Pulse Calendar

Status: implemented in the local working tree.

Scope:

- Corrected KPI subscore definitions and weights.
- Added KPI scoring explanations to account pages.
- Removed the separate AI Assistant sidebar entry.
- Kept the floating KAM Assistant available.
- Added AI Pulse as a daily workflow signal in the calendar.
- Calendar day detail can render AI Pulse items with summary/source context.
- Account adapter data was normalized so account overview metrics have cleaner inputs.

Primary files touched:

- `src/lib/scoring/kpi.ts`
- `src/app/api/ai/score/route.ts`
- `src/components/accounts/OverviewTab.tsx`
- `src/components/layout/Sidebar.tsx`
- `src/app/api/calendar/route.ts`
- `src/components/home/CalendarView.tsx`
- `src/components/home/DayDetailPanel.tsx`
- `src/app/api/accounts/[id]/route.ts`

Verification completed:

- TypeScript check passed with `tsc --noEmit`.
- `git diff --check` passed.
- Browser smoke test confirmed sidebar cleanup, KPI explanation panel, homepage activity timeline, and AI Pulse calendar legend.
- Lint did not complete because Next SWC loading/cache access was blocked by the local environment.

## Correct KPI Subscores

The health score must use these KPI subscores and weights.

| KPI | Weight | Rationale |
| --- | ---: | --- |
| CSAT Score | 20% | Direct client satisfaction and most important relationship-quality signal. |
| Relationship Score | 15% | Depth and breadth of stakeholder penetration and executive access. |
| Risk Score | 15% | Early warning across delivery, commercial, relationship, and market risk. |
| Contract Health Score | 15% | Renewal risk, contractual protection, and commercial foundation. |
| Project Health Score | 10% | Delivery execution quality and backlog/velocity health. |
| Resource Health Score | 10% | Team stability, fit, turnover, and bench risk; mock in MVP, live Worksphere later. |
| Financial Score | 10% | Payment timeliness, outstanding invoices, and revenue trend. |
| Whitespace Analysis | 5% | Growth opportunity signal; intentionally lower in health score but high in opportunity ranking. |

Implementation notes:

- Resource Health is mocked/proxied in MVP until live Worksphere resource data exists.
- Whitespace should be lower in the health score, but it can still be important in opportunity ranking.
- Questionnaire responses and approved overrides can influence final scores, but the base engine must start from the corrected KPI definitions.

## Phase 3: Global Playbook-Grounded Recommendations

Status: in progress.

### Product Goal

KAMs should be able to upload trusted internal playbooks. Recommendations and corrective measures should come from playbooks first. AI fallback guidance is only used when no relevant playbook guidance exists.

### Confirmed Decisions

- Supported MVP file types: PDF, DOCX, TXT, Markdown, and Excel.
- Playbooks are uploaded globally from Settings.
- Global playbooks apply to all accounts automatically.
- Account pages should show a compact Active Playbooks section so users know which playbooks influence that account.
- Associate and KAM can upload or replace playbooks.
- Exec can view playbooks, but cannot upload or replace them.
- Multiple active playbooks are allowed.
- Uploaded playbooks are trusted files.
- Extracted rules become usable immediately after processing.
- No human review queue for extracted rules in MVP.
- Playbooks are upload/replace only in MVP. No in-app editing yet.
- Playbooks can be archived/deactivated.
- Archived playbooks no longer influence recommendations.
- Recommendations must cite the source playbook and page/section/sheet when available.
- Citations must stay subtle and aesthetic, such as compact source pills.
- Playbook guidance wins over AI fallback by default.
- Recommendation details should subtly label source type, such as Playbook-guided or AI fallback.
- Playbook-generated recommendations should create action items in a pre-approved state.
- Playbook-generated actions should populate the calendar immediately without an approval badge/state.
- Recommendations should be generated on playbook upload, account score/KPI change, and daily AI Pulse refresh.
- Recommendations should appear across the board: account page, homepage card modals, AI Pulse, calendar day details, and Action Board.
- Replacement behavior: replacing a playbook overwrites the existing playbook row rather than creating visible version history.
- Upload limit: 20 MB per playbook file.
- Archived playbooks are hidden by default in Settings and visible only when users with write access enable `Show archived`.

### Pending Decisions

- Whether a global playbook can be deactivated for a single account, or whether global means all accounts until archived globally.
- Whether Excel parsing should process all sheets by default or only selected sheets.
- Whether older playbook versions should be visible in the UI.
- Whether global playbooks should later support portfolio-specific scoping.

## Phase 3 Module Breakdown

### Module 1: Settings Global Playbook Library

Owner: TBD

Status: implemented and QA validated.

Responsibilities:

- Added a Playbooks area to Settings.
- Added upload UI for PDF, DOCX, TXT, Markdown, and Excel.
- Shows playbook list with title, file type, upload date, uploader, processing status, active/archive state, and extracted rule count.
- Allows Associate and KAM users to upload/replace/archive playbooks.
- Allows Exec users to view only.
- Makes it clear that global playbooks apply to all accounts automatically.

Implemented UI:

- Clean Settings section named Playbooks.
- Upload panel plus compact playbook table.
- Status chips: Processing, Active, Failed, Archived.
- Row action menu with Replace and Archive.
- Optional `Show archived` toggle, off by default.

Primary files touched:

- `src/app/(dashboard)/settings/page.tsx`
- `src/lib/permissions/*`
- `src/components/playbooks/PlaybookLibrary.tsx`
- `src/app/api/playbooks/*`

Verification completed:

- Railway MySQL migration applied successfully.
- `GET /api/playbooks` returns active playbooks and hides archived rows by default.
- `POST /api/playbooks/upload` supports global upload and enforces 20 MB/type validation.
- `POST /api/playbooks/[id]/replace` overwrites the existing playbook row.
- `PATCH /api/playbooks/[id]` archives a playbook.
- API QA passed for KAM list, Exec upload denial, unsupported type rejection, oversized file rejection, valid upload, replace, archive, hidden archived rows, KAM archived reveal, and Exec archived restriction.
- Browser QA passed for Associate/KAM upload and row action visibility, Exec view-only behavior, and row menu Replace/Archive controls.

### Module 2: Playbook Storage And Data Model

Owner: TBD

Status: partially implemented.

Responsibilities:

- Added database models for playbooks and extracted rules.
- Store file metadata, storage path, status, extracted text, processing error, processed/archive timestamps, and uploader.
- Track active/archive/processing/failed status.
- Preserve source locator fields on `PlaybookRule`.
- Recommendation provenance model is still pending for Module 5/7 integration.

Implemented entities:

- `Playbook`
  - `id`
  - `title`
  - `scope` with MVP value `GLOBAL`
  - `fileName`
  - `fileType`
  - `mimeType`
  - `fileSize`
  - `storagePath` or equivalent
  - `uploadedById`
  - `status`: `PROCESSING`, `ACTIVE`, `FAILED`, `ARCHIVED`
  - `processedAt`
  - `createdAt`
  - `updatedAt`
  - `extractedText`
  - `processingError`
  - `archivedAt`

- `PlaybookRule`
  - `id`
  - `playbookId`
  - `category`: `CSAT`, `RELATIONSHIP`, `RISK`, `CONTRACT`, `PROJECT`, `RESOURCE`, `FINANCIAL`, `WHITESPACE`, `RENEWAL`, `DELIVERY`, `GROWTH`
  - `condition`
  - `recommendation`
  - `correctiveMeasure`
  - `priority`
  - `sourceTitle`
  - `sourcePage`
  - `sourceSection`
  - `sourceSheet`
  - `sourceExcerpt`
  - `createdAt`

Pending entities:

- `Recommendation`
  - `id`
  - `accountId`
  - `sourceType`: `PLAYBOOK` or `AI_FALLBACK`
  - `playbookRuleId`
  - `title`
  - `summary`
  - `recommendedAction`
  - `priority`
  - `dueDate`
  - `status`
  - `confidence`
  - `createdAt`

Notes:

- Module 1 accepts PDF, DOCX, TXT, Markdown, and Excel uploads now.
- TXT and Markdown text is captured immediately.
- Full PDF/DOCX/Excel extraction and structured rule generation remain Module 3 and Module 4 work.
- Uploaded playbook files are currently stored under `public/uploads/playbooks/` following the existing document upload pattern; production storage hardening remains future security work.

### Module 3: File Parsing And Text Extraction

Owner: TBD

Status: pending, with TXT/Markdown MVP text capture already available from Module 1.

Responsibilities:

- Extract text from PDF, DOCX, TXT, Markdown, and Excel.
- Preserve page/section/sheet metadata where possible.
- Normalize extracted text into chunks suitable for rule extraction.
- Mark processing failed with useful error messages when extraction fails.

Implementation notes:

- Use structured parsers where possible.
- Excel should preserve workbook name, sheet name, row context, and table-like text.
- PDF should preserve page number for citations.
- DOCX should preserve headings where possible.
- TXT and Markdown can use heading/line offsets as source locators.

### Module 4: Rule Extraction Engine

Owner: TBD

Status: pending.

Responsibilities:

- Convert parsed playbook chunks into structured rules.
- Classify rules into the KPI/recommendation categories.
- Preserve source citations.
- Avoid duplicating the same rule repeatedly.
- Store extracted rules as trusted and immediately active once processing completes.

Rule categories:

- Renewal
- Risk
- Relationship
- Delivery
- Financial
- Growth/Whitespace
- CSAT
- Contract Health
- Project Health
- Resource Health

Output quality expectations:

- Rules should be concise and action-oriented.
- Every rule should include a source playbook reference when available.
- If a citation cannot be located, label the source as the playbook name only.

### Module 5: Recommendation Orchestrator

Owner: TBD

Status: pending.

Responsibilities:

- Create a simple orchestration flow for recommendations.
- Prefer playbook rules over AI fallback.
- Generate account-specific recommendations from account data, KPI scores, risks, actions, calendar context, and playbook rules.
- Create pre-approved action items from playbook-generated recommendations.
- Trigger recommendation generation on upload, score/KPI change, and daily AI Pulse refresh.

Recommended orchestration:

1. Account signal detected.
2. Retrieve active global playbook rules.
3. Match rules to account state and KPI context.
4. Compose recommendation with source citation.
5. If no relevant playbook rule exists, use AI fallback.
6. Create or update pre-approved action item.
7. Surface recommendation across relevant UI areas.

Agent stance:

- Use an orchestrator.
- Do not overclaim autonomous learning in the UI.
- MVP agents should be described as grounded recommendation agents.
- Later learning can come from approved/rejected actions, user edits, and recurring outcomes.

### Module 6: Account Page Active Playbooks

Owner: TBD

Status: pending.

Responsibilities:

- Add compact Active Playbooks section to each account page.
- Show global playbooks influencing the account.
- Show source/status without taking over the page.
- Link to Settings Playbooks when the user has permission.

Recommended UI:

- Small section in account overview or a compact tab/panel.
- Show playbook name, active status, last processed date, and rule count.
- Keep this visually quiet.

Primary likely files:

- `src/app/(dashboard)/accounts/[id]/*`
- `src/components/accounts/OverviewTab.tsx`
- New `src/components/playbooks/ActivePlaybooks.tsx`

### Module 7: Recommendation Surfaces

Owner: TBD

Status: pending.

Responsibilities:

- Show playbook-guided recommendations in account page.
- Show relevant recommendations in homepage card modals.
- Show recommendations in AI Pulse where relevant.
- Show recommendation-backed actions in Action Board.
- Show recommendation-backed due dates on the calendar.
- Show source type and citation subtly.

Required source labels:

- Playbook-guided
- AI fallback

Citation UI:

- Compact pill, for example `Renewal Playbook - p. 4`.
- Full detail can appear on hover, expand, or detail modal.
- Do not make the recommendation cards congested.

Primary likely files:

- `src/app/(dashboard)/home/page.tsx`
- `src/components/accounts/OverviewTab.tsx`
- `src/components/home/DayDetailPanel.tsx`
- `src/components/home/CalendarView.tsx`
- `src/components/actions/*`
- `src/components/ai-pulse/*`

### Module 8: Action Board And Calendar Integration

Owner: TBD

Status: pending.

Responsibilities:

- Add or reuse an action source/status for playbook-generated pre-approved actions.
- Show these actions in Action Board.
- Populate calendar immediately.
- Calendar should not show an approval badge/state for these playbook-generated actions.
- Preserve internal source/status for auditability.

Implementation notes:

- Avoid duplicate actions if the same playbook rule fires repeatedly.
- Use stable dedupe keys based on account, playbook rule, and recommendation category.
- Calendar should remain clean and workflow-oriented.

Primary likely files:

- `src/app/api/actions/route.ts`
- `src/app/api/calendar/route.ts`
- `src/components/actions/*`
- `src/components/home/DayDetailPanel.tsx`

### Module 9: AI Pulse Integration

Owner: TBD

Status: pending.

Responsibilities:

- AI Pulse is for daily workflows.
- AI Pulse should include playbook-grounded recommendations where relevant.
- For MVP, use internal account and playbook data.
- AI Pulse should avoid external news dependency unless later approved.
- AI Pulse items should appear in the calendar.

Primary likely files:

- `src/components/ai-pulse/*`
- `src/app/api/ai-pulse/*`
- `src/app/api/calendar/route.ts`

### Module 10: Profile And Org Settings

Owner: TBD

Status: pending, recommended Phase 4 unless prioritized earlier.

Responsibilities:

- Add My Profile so users can manage their own profile settings.
- Confirm which fields users can edit.
- Continue using Associate, KAM, and Exec role labels.
- Represent KAM-to-associate relationships where needed for scoping.

Notes:

- This was requested by the lead but has not yet been scoped in detail.
- Recommended as Phase 4 unless the team wants it parallelized.

### Module 11: Testing And QA

Owner: TBD

Status: partially completed for Module 1 only.

Responsibilities:

- Add focused tests for playbook upload permissions.
- Add tests for parsing success/failure by file type.
- Add tests for playbook-first recommendation priority.
- Add tests for archived playbooks not influencing recommendations.
- Add tests for action/calendar creation behavior.
- Browser-test Settings upload flow, account Active Playbooks section, homepage modals, calendar day detail, AI Pulse, and Action Board.

Minimum acceptance checklist:

- Associate can upload global playbook from Settings. Completed for Module 1.
- KAM can upload global playbook from Settings. Completed for Module 1.
- Exec can view but cannot upload/replace. Completed for Module 1.
- Uploaded playbook enters Processing then Active or Failed. Partially complete: Module 1 stores and marks uploads Active after metadata/text capture; deeper async processing states remain Module 3/4.
- Active playbook applies to all accounts automatically.
- Account page shows Active Playbooks.
- Recommendation includes subtle Playbook-guided label.
- Recommendation includes a compact citation where available.
- Playbook guidance beats AI fallback.
- If no playbook rule applies, AI fallback can appear with AI fallback label.
- Playbook recommendation creates a pre-approved action item.
- Playbook action appears on calendar without approval badge/state.
- Archived playbook no longer generates recommendations.

## Later Phases

### Phase 4: My Profile And Team Hierarchy

Add user profile management and a clearer team hierarchy experience for associates under KAMs.

Open questions:

- Editable profile fields.
- Notification preferences.
- Whether users can upload avatar/profile photo.
- Whether KAMs can manage associate assignments.

### Phase 5: Agent Feedback Loops

Make agents improve from internal feedback.

Potential signals:

- Approved recommendations.
- Rejected recommendations.
- Edited recommendation text.
- Completed actions.
- Missed due dates.
- Account health movement after actions.

Important product language:

- Do not describe agents as autonomous learning agents until the feedback loop exists.
- For MVP, use "playbook-grounded recommendations" and "approval-aware action suggestions."

## Security And Repo Hygiene

- Never commit GitHub tokens, database URLs, API keys, or private credentials.
- Keep secrets in environment variables only.
- If any secret was shared in chat, rotate it before production use.
- Avoid storing raw private customer docs in git.
- Uploaded playbook files should go to configured storage, not the source repo.
- Store only metadata and extracted rules in the database unless product/security approves raw text storage.

## Immediate Next Steps

1. Implement Module 3 full extraction for PDF, DOCX, TXT, Markdown, and Excel, including page/section/sheet locators.
2. Implement Module 4 rule extraction with category classification, dedupe, and source citations.
3. Add the `Recommendation` provenance model and Module 5 playbook-first recommendation orchestrator.
4. Wire Active Playbooks into account overview.
5. Surface playbook-guided recommendations in account page, homepage modals, AI Pulse, calendar day details, and Action Board.
6. Add focused automated tests for upload permissions, parsing success/failure, archive behavior, playbook-first priority, and action/calendar creation.

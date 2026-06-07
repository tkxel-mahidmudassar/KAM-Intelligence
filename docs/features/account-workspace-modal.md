# Account Workspace Modal

## Status

Built as the first account-detail structure for V2.

## Trigger

Clicking any account card on the Portfolio page opens the account workspace
modal. The card is keyboard-accessible and can also be opened with Enter or
Space when focused.

## Layout

- The modal is centered horizontally and vertically.
- It covers well over 70% of the viewport height. The current shell uses a
  fixed `92vh` internal height.
- It uses a wide account-workspace shell: `min(1360px, 94vw)`.
- The header and tab bar remain fixed inside the modal shell while tab content
  scrolls underneath them.
- The modal does not show subtitle/helper copy below the account name. A
  screen-reader-only dialog description is kept for accessibility.
- The account name is vertically centered with the account logo in the header.
- The account summary cards are treated as top-level account facts with larger
  labels and values for readability.

## Persistent Account Summary

The top summary remains visible inside the modal shell and currently includes:

- account name
- logo
- score
- ARR
- contract renewal date
- industry
- location
- account owner

The next renewal date is currently computed from the V2 demo account
`renewalDays` value.

## Tabs

The modal has three tabs:

- Overview
- Profile
- Documents

## Overview Tab

The Overview tab now contains the first pass of the account score decision
structure.

It shows eight KPI rows from the new AI Account Scoring Framework. KPI and
sub-parameter scores use the framework's 1-5 scale inside the account
workspace:

- Relationship Health
- Contract Health
- Customer Success
- Risk Score
- Resource Health
- Project Health
- Financial Health
- Whitespace Analysis

The default weights are:

- Relationship Health: 20%
- Contract Health: 15%
- Customer Success: 15%
- Risk Score: 15%
- Resource Health: 10%
- Project Health: 10%
- Financial Health: 10%
- Whitespace Analysis: 5%

The sub-parameters are also sourced from the framework:

- Relationship Health: Executive Engagement, Stakeholder Coverage,
  Relationship Penetration, Champion Strength, Engagement Cadence
- Contract Health: Contract Duration, Notice Period Protection, Renewability,
  Price Uplift Protection, Termination Protection
- Customer Success: Customer Feedback, Customer Confidence, Delivery
  Satisfaction, Communication Satisfaction, Issue Resolution
- Risk Score: Industry Risk, Competitive Threat, Vendor Displacement Risk,
  Delivery Risk, Commercial Risk
- Resource Health: Resource Dependency Risk, Critical Resource Coverage, Team
  Stability, Skill Alignment, Backup Readiness
- Project Health: Delivery Performance, Backlog Readiness, Roadmap Visibility,
  Escalation Status, Client Confidence
- Financial Health: Payment Timeliness, Outstanding Exposure, Client Financial
  Stability, Revenue Trend, Contract vs Billing Alignment
- Whitespace Analysis: Service Penetration, Cross-Sell Potential, Upsell
  Potential, Growth Signals, Expansion Readiness

The KPI rows are always sorted by score in ascending order, with the lowest
score at the top and the highest score at the bottom.

The KPI framework is shared across accounts, but the row scores, falling
sub-parameter diagnoses, proposed tasks, and due dates are generated per
account. The current prototype derives those account-specific rows from the
selected account's health state, health score, industry, ARR, renewal window,
current workstream, and relationship signal. Named high-risk demo accounts
such as Maersk, BP, FedEx, Emirates, Adidas, regulated finance accounts, and
healthcare accounts also receive tailored weak dimensions and proposed next
steps so account workspaces do not reuse the same Stripe-style or
Maersk-style data.

Each row includes:

- KPI name
- score
- weight
- spark indicator showing whether the score is up, down, or flat
- Why?
- Task
- Accept / Deny controls

KPI rows are expandable accordions. The collapsed row shows the KPI name,
score, weight, trend, and proposed next step without extra descriptive copy.
Collapsed KPI rows use a consistent row height so the table reads cleanly even
when only some KPIs have proposed tasks.
Expanding the row shows:

- KPI sub-parameters
- each sub-parameter score
- falling sub-parameter diagnosis when a sub-parameter is declining
- Why?
- proposed task
- proposed due date
- Accept / Deny controls
- score edit trigger on individual sub-parameters

Healthy rows do not show Why?, Task, or Accept / Deny panels unless there is a
specific proposed action. Their expanded state uses compact equal-width
sub-parameter score tiles and keeps the focus on score editing.

Falling sub-parameters now show a compact diagnosis inside the sub-parameter
tile. Each diagnosis includes:

- likely cause
- playbook source
- account history source
- AI rules learning-log source

This is the UI surface where playbook analysis, account journey/history, and
the system-maintained learning playbook explain why a specific sub-parameter is
falling.

The KPI table has a settings cog in the top-right corner. Opening it shows a
small KPI weight settings modal. The weight settings modal uses sliders for KPI
weights in a compact two-column grid, followed by one overall reason textarea.

KPI weight changes are role-aware:

- Associates can submit one batch KPI weight change request.
- KAM users can save KPI weight changes directly as one batch.
- KAM users can approve or deny a pending associate batch weight change request.
- C-Level/read-only views can see weights but cannot change them.

Requests and direct saves are disabled until the proposed weights total 100%
and a single overall reason is entered. Approved or directly saved weights
immediately update the KPI table display. This is currently in-session UI state
only. It does not yet persist to the database and does not yet create audit-log
records.

## Score Overrides

Scores are editable at the sub-parameter level inside each KPI accordion. KPI
aggregate scores are shown as read-only rollups in this prototype.

Score overrides now use the framework's 1-5 scale. The legacy 0-100 portfolio
health score is still used on account cards and top-level account summaries,
but KPI/sub-parameter editing inside this modal is 1-5.

The current behavior is role-aware:

- Associates can submit a sub-parameter score override request with a requested
  score and a reason.
- KAM users can save a direct sub-parameter score override without approval.
- KAM users can also approve or deny pending associate sub-parameter override
  requests.
- C-Level/read-only views can see that overrides exist but cannot submit or
  apply them.

The score editor opens as a compact second modal over the account workspace,
not as an inline panel inside the KPI table. It only opens for the
sub-parameter whose edit icon was clicked. Sub-parameter edit icons are hidden
until the sub-parameter card is hovered or focused, keeping the table quieter
by default. The editor uses a top-right cross icon for closing, matching the
modal design language.
The request/save action is disabled until a reason is entered.

This is currently in-session UI state only. It does not yet persist to the
database and does not yet create audit-log records.

When a score override is applied, the sub-parameter displays the overridden
score and notes that it was changed from the original value.

## Recommendation Actions

Accepting a recommendation adds it to the Account journey checklist in the
Profile tab. The same recommendation cannot be accepted twice.

Denying a recommendation opens a reason field. A denial reason is required
before the row can be dismissed. Once saved, the row shows a denied marker and
the captured reason.

## Profile Tab

The Profile tab contains three account relationship sections:

- Contacts
- Tkxel resources
- Account journey

Contacts are rendered as hierarchy-ordered cards, with senior contacts shown
first. Each card displays:

- contact name
- designation
- location
- time zone
- phone action
- email action
- calendar action

The phone action opens a small dropdown with the mobile number and an option to
set up a Google Meet. The email action opens a Gmail compose URL with the
contact email populated in the recipient field. The calendar action opens a
Google Calendar event URL with the contact as an invitee. Gmail, Calendar, and
Google Meet actions explicitly open in a separate browser tab so the account
workspace is not replaced.

The Contacts section includes an Add contact button. Clicking it opens a
centered secondary modal with fields for:

- name
- designation
- email
- mobile number
- location
- time zone
- seniority order

The contact save action is disabled until name, designation, and email are
entered. Saved contacts are added to the current modal session and sorted by
seniority order. This does not yet persist to the database.

Contact cards expose a delete action only on hover/focus. Associate users can
request deletion. KAM users can approve a pending deletion request or delete a
contact directly. This is currently in-session UI state only.

The Tkxel resources section shows the internal Tkxel team staffed on the
account. Each resource card currently shows:

- resource name
- role
- pod
- location
- start date

The Tkxel resources section includes an Add resource button. Clicking it opens
a centered secondary modal with fields for:

- name
- role
- pod
- location
- start date

The resource save action is disabled until name, role, and pod are entered.
Saved resources are added to the current modal session.

Resource cards expose a delete action only on hover/focus. Associate users can
request deletion. KAM users can approve a pending deletion request or delete a
resource directly. This is currently in-session UI state only.

This is currently static V2 demo data. It should eventually come from the
account staffing/resource source once that data model is wired.

The account journey section combines:

- upcoming checklist items in a horizontal timeline
- completed historical items in a vertical timeline

The Account journey section includes an Add item button. Clicking it opens a
centered secondary modal with fields for:

- tag/type: Meeting, QBR, or To-do
- title
- due date
- details

The journey item save action is disabled until title, due date, and details are
entered. Saved journey items are added to the current modal session and appear
in the upcoming checklist timeline. Upcoming checklist cards are sorted by due
date.

Accepted tasks from the Overview tab appear in the upcoming checklist as queued
tasks. Journey checklist items can be marked Done or Dismissed, and both
actions require a reason. Done items are added to the completed journey
timeline. Dismissed items are removed from the upcoming checklist. Queued tasks
resolved from the Profile tab are also removed from the active task queue.
Upcoming checklist cards use a consistent card height and bottom-aligned action
buttons so Done/Dismiss controls stay in the same place across cards.
Clicking Done or Dismiss opens a centered floating resolution modal instead of
expanding the reason field inside the task card.

Tasks are typed as one of:

- Meeting
- QBR
- To-do

The current task type is assigned from static placeholder data. Future agent
output should explicitly return the task type rather than leaving the UI to
infer it from the task copy.

## Documents Tab

The Documents tab contains:

- Upload button
- uploaded documents list
- Generate QBR action

The Upload and Generate QBR buttons sit in a separate right-aligned action row
above the document list.

Clicking Upload opens a centered upload modal. The document type selector and
file picker live inside this modal. The document type selector uses the seven
PRD document types:

- Meeting minutes
- Contract document
- Statement of Work (SOW)
- Proposal
- Project documentation
- Previous KYC brief
- Project status report

Supported upload extensions in the UI are:

- PDF
- DOCX
- TXT

Uploading a document adds it to the current modal session and creates a
placeholder proposed account update for review. The uploaded documents list
shows:

- filename
- document type
- upload date
- uploaded by
- review status derived from the document's proposed account updates
- affected scores or account sections

Uploaded document names are clickable. Clicking a document opens it in a
separate browser tab. Seeded documents open a generated preview tab; uploaded
documents open through their browser object URL.
The uploaded document list is sorted by recency, with the newest document at
the top.

Proposed account updates appear beside the document they came from. Each
proposal shows:

- account field
- current value
- proposed value
- review status

Proposal review is role-aware:

- KAM users approve proposed updates directly after entering a reason.
- Associate users route proposed updates to the KAM after entering a reason.
- Denying a proposal also requires a reason.
- KAM users reviewing a proposal routed by an Associate can see the Associate
  reason before making their own approval or denial decision.
- The latest proposal decision reason is shown against the proposal after it is
  confirmed.

The Generate QBR button opens a centered modal that collects:

- audience
- QBR period
- primary goals
- risks to address
- client asks

Generating calls `POST /api/qbr/generate`. That route uses the OpenAI provider
to generate structured QBR slide content from:

- account summary data
- uploaded document metadata
- document-derived proposed updates
- proposal review reasons
- user-provided QBR prompts

The route packages the OpenAI slide output into a real PPTX file with speaker
notes per slide. The Documents tab receives the PPTX as a blob and exposes an
Open deck action.

## AI Involvement

The QBR builder uses a live OpenAI call through the existing AI provider.

Reasoning:

- Opening an account workspace, rendering account summary data, and switching
  tabs are deterministic UI behaviors.
- The current KPI why/task recommendations are static placeholders.
- The current score override flow is deterministic role-based UI. It is not an
  AI action.
- The current document extraction surface is still a UI scaffold. It does not
  yet parse uploaded file content or persist approval decisions.
- Proposal approval and denial reasons are captured in modal state for the
  current session. They are not yet persisted to a durable reason log because
  the final storage location has not been defined.
- QBR generation now calls OpenAI and returns a real PPTX artifact with speaker
  notes.
- A future playbook-matching AI agent can populate the Why?, Task, and task
  type fields, but that agent has not been implemented yet.
- The future document parser agent should extract account updates from uploaded
  documents and route proposals through Associate/KAM approval rules.
- The future document parser agent should parse uploaded file content rather
  than only using document metadata.

## Files

- `src/components/portfolio/PortfolioPage.tsx`
- `src/lib/v2/portfolioData.ts`

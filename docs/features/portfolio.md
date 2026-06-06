# Portfolio Page

## Status

Built as the first V2 module.

## Route

- `/portfolio`
- `/` redirects to `/portfolio`

## Purpose

The Portfolio page gives the current user a role-aware view of accounts under
their coverage.

## Role Behavior

- Associate: sees accounts assigned to the associate by the KAM.
- KAM: sees the full portfolio owned by that KAM.
- C-Level: sees the same full portfolio in read-only mode for now.

## Current Implementation

The page uses a V2-local data file:

- `src/lib/v2/portfolioData.ts`

This was intentional for the first module so we can show a realistic KAM
portfolio size immediately without mutating the shared V1 database. The dataset
contains 28 real-world company names, with 14 assigned to the associate view and
28 visible to KAM / C-Level.

## UI Features

- Warm paperlike hero with pastel washes, account count, ARR, and a count of
  accounts renewing in the next 90 days.
- Hero metric labels use a readable small-label size rather than tiny captions.
- Hero avoids saturated AI-dashboard colors; current visual direction is human,
  tactile, and editorial rather than neon/command-center coded.
- Hero does not use an eyebrow/pill label; it starts directly with the
  `Portfolio` title.
- Hero does not use descriptive intro copy; the title, `+ Account` action, and
  portfolio metrics carry the section.
- Labels use natural case. No label is styled into all caps.
- Uses the global persistent role bar for Associate, KAM, and C-Level switching.
- `+ Account` button lives in the hero card as the page-level primary action,
  aligned to the right of the title on wider screens.
- `+ Account` button is enabled on Associate/KAM views.
- `+ Account` button is disabled in C-Level read-only mode.
- KAM view includes a `Pending account creations` queue for associate-submitted new-account drafts.
- Pending account creation cards open a KAM review modal where the KAM can edit proposed account fields, see the associate submission reason, preview source files, review the KYC draft, review the account journey, save edits, approve, or deny with a reason.
- The KAM account creation review modal includes a separate floating setup assistant chat, including an attachment control for adding more source files during review.
- Notification items route into the relevant work surface instead of acting as inert list items.
- Current notification routes open either the pending account creation review modal or the relevant account workspace. Document-review notifications open the account workspace directly on the Documents tab.
- Cammie is a bottom-right chat widget. The launcher stays anchored in the lower-right corner and the conversation window opens above it like a standard support/assistant chat surface.
- Cammie is backed by `POST /api/v2/cammie` and receives the active role, visible portfolio account context, active account context when available, and recent conversation turns.
- Cammie can answer grounded portfolio/account questions and generate general business documents as openable Markdown artifacts when the request is clear enough.
- Cammie document generation is intentionally generic rather than QBR-only. It can create first drafts for QBR outlines, KYC drafts, account briefs, renewal plans, risk memos, meeting briefs, escalation notes, action plans, stakeholder summaries, onboarding notes, email drafts, and similar KAM documents.
- Cammie can run web-backed research through the OpenAI Responses API web search tool when the user asks to search, look up, verify, research, or find recent/current external context.
- Web research responses receive the same role, visible portfolio, active account, and recent conversation context so external findings can be tied back to KAM implications.
- If the live AI provider fails, Cammie returns a degraded but grounded response using the visible portfolio/account context instead of showing an inert "endpoint not wired" style fallback.
- Search/filter controls and account cards live inside one scrollable portfolio
  panel.
- The search/filter rail is sticky at the top of that panel, so it remains
  available while the account grid scrolls.
- Control panel has no section heading or helper copy; it starts directly with
  the search input.
- Search only across account name, industry, and client contact name.
- Health filter for All, Healthy, At Risk, and Critical.
- Account grid begins immediately after the controls without an extra list
  heading.
- Removed the redundant lower summary strip that repeated scope, ownership, and
  at-risk counts because it did not support a real user decision.
- Account cards showing:
  - company logo sourced from the company domain favicon endpoint
  - company name
  - industry and region
  - numeric health score
  - ARR
  - renewal countdown
  - country
  - owner / KAM depending on mode
- Account cards do not include a `View account` button in the current module.
- Account cards do not use a colored top stripe. They are visually distinguished
  with a quieter health-colored left border, warm paper surface, and soft depth.
- Account cards show a numeric health score instead of a health-status pill.
- Clicking an account card opens the account workspace modal.

## Search Behavior

The search input intentionally only matches:

- account name
- industry
- client contact name

It does not search region, country, owner, current workstream, or relationship
signal.

## AI Involvement

Cammie is the AI-enabled element in this module. Portfolio filtering, account
cards, account workspace layout, and account creation UI remain deterministic
application UI.

Reasoning:

- Portfolio filtering, role scope, status display, and summary stats are
  deterministic.
- Cammie handles ad hoc portfolio-level synthesis, account questions, workflow
  guidance, web-backed research, and document generation through dedicated V2
  routes.

## Data Model Follow-Up

The current shared database has `Account.kamId`, but it does not yet have a
first-class account assignment table for associates. For the final V2 database
model, we should add something like:

- `AccountAssignment`
- fields: `accountId`, `userId`, `assignedById`, `roleOnAccount`,
  `assignedAt`, `status`

That would allow:

- associates to receive explicit account assignments from KAMs
- KAMs to retain portfolio ownership through `Account.kamId`
- C-Level users to query all accounts read-only

## Files

- `src/app/page.tsx`
- `src/app/portfolio/page.tsx`
- `src/components/layout/RoleBar.tsx`
- `src/components/portfolio/PortfolioPage.tsx`
- `src/lib/v2/portfolioData.ts`

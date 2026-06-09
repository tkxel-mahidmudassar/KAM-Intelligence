# App shell, home, settings, and auth

## App shell

The V2 app now uses a persistent shell around authenticated screens.

Built in:

- Left sidebar navigation for Home, Portfolio, Templates, Account Journey
  Configuration, and Settings.
- Settings navigation is available to KAM, C-Level/Executive, and Admin users.
- Compact role switcher in the top bar.
- Top-right notification bell with route-aware notifications.
- Avatar dropdown with My profile and Log out. My profile routes to a dedicated `/profile` page, not the general Settings page.
- Kammie is available from the authenticated shell, including Home, Portfolio,
  Templates, Journey Configuration, Settings, and Profile.
- Login and forgot-password screens render without the dashboard shell.

Notifications currently route to the relevant module using client navigation:

- Pending account creation review routes to Portfolio.
- Score drop review routes to Portfolio with account/tab query context.
- Playbook parsing routes to Settings.

## Home

The Home page is a portfolio operating view.

Built in:

- Four expandable topline cards: healthy accounts, at risk accounts, critical accounts, and renewals under 90 days.
- Topline cards stay compact by default. Expanding one opens a focused popover-style account list and dims the rest of the page behind it.
- Accounts inside expanded topline cards are clickable and route to the relevant Portfolio account workspace overview.
- Month calendar with action counts per day.
- Day detail panel after selecting a calendar date.
- Timeline view for the next three operating days. The timeline uses a horizontal rail with checkpoint nodes and checklist cards attached to each day.
- Done and dismiss actions for calendar items.
- Done and dismiss both require a reason in a floating modal before status changes locally.

Current persistence:

- Home action status is local UI state only.
- The next backend pass should save action completion, dismissal, and reason metadata to the shared activity/reason log.

## Settings

The Settings page is the configuration surface for the V2 prototype.
The page uses a compact control-surface layout instead of oversized empty
cards:

- A small top summary strip shows weight total, allocation count, playbook
  upload progress, and signed-in user.
- KPI weights and integrations sit in the first row.
- Associates, allocations, playbooks, and AI rules use scrollable regions so
  long lists do not stretch the entire page.

Built in:

- Default KPI weights with sliders.
- KPI weights follow the AI Account Scoring Framework: Relationship Health
  20%, Contract Health 15%, Customer Success 15%, Risk Score 15%, Resource
  Health 10%, Project Health 10%, Financial Health 10%, and Whitespace
  Analysis 5%.
- Weight total validation. Save/request is disabled unless weights equal 100%.
- Weight save/request updates local UI state and fires a settings notification.
- KAM users can invite and remove Associates.
- C-Level/Executive and Admin users can invite and remove KAM users.
- Account allocation and unallocation controls across the full V2 portfolio account list.
- Account allocation list is scrollable inside the settings card.
- Playbook upload controls per KPI.
- AI rules playbook display and local add-rule flow for learned denial/dismissal behavior.
- Mock integrations: Salesforce, Gmail, Jira, Worksphere, Finance Invoice Tracking, LLM, and AI Note Taker. Integration pills can be toggled locally between connected and needs setup.

Current persistence:

- Settings changes are local UI state only.
- Playbook uploads capture filenames for UI state; parser/storage wiring should connect these controls to the playbook ingestion agent.

## Auth

The prototype includes basic auth screens.

Built in:

- Login page with email and password fields.
- Login branding uses Kamazing with the Tkxel logo.
- Demo account type shortcuts for Associate, KAM, and C-Level set the active demo user and route into Home.
- Login sets the active demo user in role context and routes to Home.
- Forgot password flow collects an email and shows non-revealing success copy.

## Profile

The profile page is a dedicated user settings surface at `/profile`.

Built in:

- Editable name and email fields.
- Current role display.
- Password change form with current password, new password, and confirmation fields.
- Save profile updates the active demo user context.
- Password changes are validated locally for this prototype.

Current persistence:

- Login is demo-local and does not yet call a real session provider.
- Forgot password is UI-only until the backend mail/reset token flow is wired.

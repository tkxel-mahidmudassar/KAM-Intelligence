# KAM Intelligence POC — Full Codebase Context

**Project**: KAM Intelligence — AI-powered Key Account Management dashboard  
**Client**: Tkxel  
**Stack**: Next.js 15 (App Router), TypeScript, Prisma 5, MySQL 8, Tailwind CSS v4, Google Gemini 2.5 Flash  
**Deployment**: Vercel (prod) + Railway MySQL (cloud DB)  
**Repo**: https://github.com/tkxel-mahidmudassar/KAM-Intelligence  

---

## 1. Purpose

A POC dashboard for Key Account Managers to monitor client health, track signals and actions, generate AI-assisted QBR decks and KYC documents, and surface upsell opportunities. The app is data-driven (all content from MySQL), AI-augmented (Gemini for scoring narratives, agent workflows, pulse insights), and role-gated.

---

## 2. Tech Stack & Versions

| Layer | Technology |
|---|---|
| Framework | Next.js 15.3.2, App Router |
| Language | TypeScript 5 (strict mode; `ignoreBuildErrors: true` on this machine) |
| ORM | Prisma 5.22, MySQL 8 |
| AI | Google Gemini 2.5 Flash via `@google/generative-ai` |
| Styling | Tailwind CSS v4, glassmorphism design language |
| Charts | Recharts |
| Runtime | Node 26 (local dev) / Node 20 (Vercel) |
| Package manager | npm |

---

## 3. Repository Layout

```
/
├── prisma/
│   ├── schema.prisma            # Full DB schema (18 models)
│   ├── seed/index.ts            # Demo data seeder
│   └── migrations/              # 5 applied migrations
├── src/
│   ├── app/
│   │   ├── layout.tsx           # Root layout — wraps RoleProvider + ThemeProvider
│   │   ├── page.tsx             # Redirects / → /home
│   │   ├── login/page.tsx       # Login page (email + password form)
│   │   ├── (dashboard)/         # Route group — all authenticated pages
│   │   │   ├── layout.tsx       # Auth guard + shared Sidebar/Topbar/FloatingAssistant
│   │   │   ├── home/page.tsx    # Homepage — stats + calendar hero
│   │   │   ├── portfolio/page.tsx
│   │   │   ├── accounts/[id]/page.tsx  # Account detail (10 tabs)
│   │   │   ├── actions/page.tsx        # Global Kanban action board
│   │   │   ├── ai-pulse/page.tsx       # AI insight feed
│   │   │   ├── assistant/page.tsx      # Chat assistant
│   │   │   ├── analytics/page.tsx      # Charts + metrics
│   │   │   ├── qbr/page.tsx            # QBR / DBR listing
│   │   │   ├── manager/page.tsx        # Manager command centre
│   │   │   ├── audit/page.tsx          # Audit log (MANAGER+)
│   │   │   └── settings/page.tsx       # App settings + Team tab
│   │   └── api/                 # All API routes (see Section 7)
│   ├── components/
│   │   ├── accounts/            # Per-tab components for account detail
│   │   ├── home/                # CalendarView, DayDetailPanel, ActionDetailModal, SignalReviewModal
│   │   ├── layout/              # Sidebar, Topbar, NotificationDrawer
│   │   ├── portfolio/           # AccountCard, PortfolioStats
│   │   ├── assistant/           # FloatingAssistant
│   │   └── ui/                  # Shared primitives: Badge, Button, Card, Modal, AgentTracePanel, SourcesPanel
│   ├── context/
│   │   └── RoleContext.tsx      # Auth + role state (localStorage-persisted)
│   ├── lib/
│   │   ├── api.ts               # Shared route helpers
│   │   ├── audit.ts             # logAudit() fire-and-forget
│   │   ├── prisma.ts            # Singleton Prisma client
│   │   ├── utils.ts             # cn(), formatters
│   │   ├── ai/
│   │   │   ├── index.ts         # complete() — single entry point for all LLM calls
│   │   │   ├── logger.ts        # logLLMCall() → AIPulseInsight
│   │   │   ├── provider.interface.ts
│   │   │   ├── providers/
│   │   │   │   ├── gemini.ts    # Gemini 2.5 Flash (default)
│   │   │   │   ├── openai.ts
│   │   │   │   └── claude.ts
│   │   │   └── agents/
│   │   │       ├── types.ts     # AgentStep, AgentSource, AgentResult<T>
│   │   │       ├── scoreActions.ts
│   │   │       ├── opportunityAnalysis.ts
│   │   │       ├── signalTriage.ts
│   │   │       ├── qbrPrep.ts
│   │   │       └── kycDraft.ts
│   │   ├── adapters/            # Jira, WorkSphere, Finance, Salesforce (all mock mode)
│   │   ├── scoring/
│   │   │   ├── weights.ts       # DEFAULT_WEIGHTS (8 KPIs)
│   │   │   └── triggers.ts      # runTriggerEngine()
│   │   └── permissions/
│   │       └── policy.ts        # can(), guard(), kamWhere()
│   ├── styles/globals.css       # CSS custom properties (light/dark, glassmorphism tokens)
│   └── types/index.ts           # Shared TypeScript types (Role, etc.)
```

---

## 4. Authentication & Role System

### Login Flow
- `src/app/login/page.tsx` — email + password form with demo credentials panel (click-to-autofill)
- `POST /api/auth/login` — validates email against DB; password = first name in lowercase (e.g. `sarah` for "Sarah Chen"). Falls back to hardcoded demo users if DB is unavailable.
- On success: calls `setUser(id, name, email, role)` → writes to `RoleContext` + localStorage → redirects to `/home`

### Demo Credentials
| Email | Password | Role |
|---|---|---|
| sarah.chen@tkxel.com | sarah | KAM |
| marcus.okafor@tkxel.com | marcus | KAM |
| priya.nair@tkxel.com | priya | MANAGER |
| daniel.west@tkxel.com | daniel | EXECUTIVE |

### RoleContext (`src/context/RoleContext.tsx`)
Client-side auth state. Persists to localStorage under keys:
- `kam_user_id`, `kam_user_name`, `kam_user_email`, `kam_role`

Provides: `role`, `userId`, `userName`, `userEmail`, `hydrated`, `setUser()`, `clearUser()`, `setRole()`

The `hydrated` flag prevents SSR flash — dashboard layout shows a loading screen until it resolves.

### Auth Guard (dashboard layout)
```tsx
// src/app/(dashboard)/layout.tsx
const { userId, hydrated } = useRole();
useEffect(() => {
  if (hydrated && !userId) router.replace("/login");
}, [hydrated, userId, router]);
if (!hydrated || !userId) return <LoadingScreen />;
```

### Role Model
Four roles: `KAM`, `MANAGER`, `EXECUTIVE`, `ADMIN`

| Capability | KAM | MANAGER | EXECUTIVE | ADMIN |
|---|---|---|---|---|
| View own accounts | Y | Y (all) | Y (all) | Y (all) |
| Create accounts | N | Y | N | Y |
| Approve KYC | N | Y | N | Y |
| Approve score overrides | N | Y | N | Y |
| Manage users | N | Y (update only) | N | Y (full) |
| Delete anything | N | N | N | Y |
| Command Centre / Audit Log | N | Y | Y | Y |

### Server-side Role Passing
Since there is no JWT/session, the client sends two headers on every API call:
- `x-role: KAM` — resolved by `getRoleFromRequest(req)` in `src/lib/api.ts`
- `x-user-id: <uuid>` — resolved by `getUserIdFromRequest(req)` in `src/lib/api.ts`

The Topbar role-switcher is a POC convenience that allows switching role without logging out.

### KAM Scope Hack (POC)
`kamWhere(role, kamId)` adds `{ kamId }` to Prisma queries when role is KAM. Several routes resolve the "current KAM" via:
```ts
prisma.user.findFirst({ where: { role: "KAM" }, orderBy: { createdAt: "asc" } })
```
This always returns Sarah Chen (first seeded KAM). The `x-user-id` header is available but not yet fully wired for scope filtering everywhere.

---

## 5. Database Schema

MySQL 8 via Prisma 5. Single-row config table `AppConfig` (id = "global").

### Models Summary

| Model | Key Fields | Notes |
|---|---|---|
| `User` | id, email, name, role | 4 roles |
| `Account` | id, name, arr, health, kamId, contractEnd | health: HEALTHY/AT_RISK/CRITICAL |
| `AccountContact` | accountId, name, title, email, isPrimary | |
| `KpiDimension` | accountId, name, category, value, target | Raw KPI data points |
| `KamScore` | accountId, overall, csat, relationship, risk, contractHealth, projectHealth, resourceHealth, financial, whitespace, health, aiNarrative | 8-KPI model |
| `Action` | accountId, title, status, priority, source, dueDate | status: OPEN/IN_PROGRESS/DONE/DISMISSED |
| `Signal` | accountId, type, severity, pendingReview, isResolved, resolvedNote | pendingReview=true for AI-raised signals |
| `Document` | accountId, type, fileUrl, extractedText | Uploaded files |
| `KycVersion` | accountId, status, 9 text sections | DRAFT/SUBMITTED/APPROVED/REJECTED |
| `QbrSession` | accountId, type, status, items | QBR/DBR/EBR |
| `QbrItem` | sessionId, title, content, category | Agenda items |
| `Opportunity` | accountId, serviceLine, status, pendingReview | pendingReview=true for AI-generated |
| `AIPulseInsight` | accountId, type, title, summary, isDismissed | LLM call log + real insights |
| `ScoreOverride` | accountId, kpiKey, requestedValue, status | PENDING/APPROVED/DECLINED |
| `QuestionnaireResponse` | accountId, section, questionId, response | |
| `Touchpoint` | accountId, type, date, notes | Meetings, calls, emails |
| `Escalation` | accountId, type, severity, status | OPEN/CLOSED |
| `AppConfig` | scoreWeights (JSON), notificationPrefs (JSON) | Single row |
| `ActivityLog` | userId, accountId, action, entity | Audit trail |
| `ActionComment` | actionId, content | |

### Key Enums
- `ActionStatus`: `OPEN` | `IN_PROGRESS` | `DONE` | `DISMISSED` — **never use TODO/WAITING**
- `SignalSeverity`: `INFO` | `WARNING` | `CRITICAL`
- `OpportunityStatus`: `IDENTIFIED` → `QUALIFYING` → `PROPOSAL` → `WON` | `LOST`
- `AccountHealth`: `HEALTHY` (>=70) | `AT_RISK` (>=45) | `CRITICAL` (<45)

---

## 6. Scoring Engine

Entry point: `POST /api/ai/score`

**Flow:**
1. Load `AppConfig.scoreWeights` (falls back to `DEFAULT_WEIGHTS`)
2. Fetch adapter data in parallel (Jira, WorkSphere, Finance — all mock mode in POC)
3. Compute 8 dimension scores from `KpiDimension` rows + adapter data
4. Blend in confirmed `QuestionnaireResponse` values (70% adapter / 30% questionnaire)
5. Apply approved `ScoreOverride` values on top
6. Call Gemini for `aiNarrative` (2-3 sentences, temperature 0.2) — wrapped in try/catch, falls back to template string
7. Persist `KamScore` row + update `Account.health`
8. Fire `runTriggerEngine()` non-blocking (errors swallowed)
9. Fire `runScoreActionsAgent()` non-blocking

**Default weights** (`src/lib/scoring/weights.ts`):
```ts
{ csat: 20, relationship: 15, risk: 15, contractHealth: 15,
  projectHealth: 10, resourceHealth: 10, financial: 10, whitespace: 5 }
```

**Health thresholds**: `>=70 → HEALTHY`, `>=45 → AT_RISK`, `<45 → CRITICAL`

---

## 7. Trigger Engine (`src/lib/scoring/triggers.ts`)

Runs after every score via `runTriggerEngine(accountId, scores)`. Three parallel sub-triggers:

1. **Negative triggers** — 8 rules mapping KPI keys to signal types with WARNING/CRITICAL thresholds. Creates, escalates, or resolves `Signal` records idempotently. New AI-raised signals get `pendingReview: true`.

2. **Upsell trigger** — creates `UPSELL_OPPORTUNITY` INFO signal when `whitespace >= 70 && csat >= 65`

3. **Drift trigger** — compares last 2 `KamScore.overall` values. Drop >=15pts → CRITICAL `HEALTH_ALERT`; drop >=8pts → WARNING. Auto-resolves on recovery.

After creating a new signal, calls `runSignalTriageAgent()` non-blocking.

---

## 8. AI Layer

### Single Entry Point
Always use `complete()` from `src/lib/ai/index.ts`. Never import a provider directly.
```ts
import { complete } from "@/lib/ai";
const result = await complete({ prompt: "...", options: { jsonMode: true } });
```

Provider is resolved from `AI_PROVIDER` env var (`gemini` | `openai` | `claude`). Default: `gemini`.

Every call is fire-and-forget logged to `AIPulseInsight` (with `isDismissed: true`) via `logLLMCall()`.

### JSON Mode
Pass `jsonMode: true` in options to use `responseMimeType: "application/json"` in Gemini config. Use for all new structured-output code.

### Demo Fallback
`POST /api/ai/assistant` catches Gemini 429/quota errors and returns rule-based contextual answers from `demoFallback()`.

---

## 9. AI Agents

All agents live in `src/lib/ai/agents/`. Each is a plain async function returning `AgentResult<T>`.

```ts
export interface AgentResult<T> {
  output: T;
  sources: AgentSource[];  // data points the AI used
  steps: AgentStep[];      // reasoning trace (name, input, output, latencyMs)
  model: string;
  totalLatencyMs: number;
}
```

### The 5 Agents

| Agent | File | Route | Trigger |
|---|---|---|---|
| Score Actions | `scoreActions.ts` | `POST /api/ai/agents/score-actions` | Non-blocking after score |
| Opportunity Analysis | `opportunityAnalysis.ts` | `POST /api/ai/agents/opportunities` | Manual from OpportunitiesTab |
| Signal Triage | `signalTriage.ts` | `POST /api/ai/agents/signal-triage` | Non-blocking after trigger engine |
| QBR Prep | `qbrPrep.ts` | `POST /api/ai/agents/qbr` | Manual from QBRTab |
| KYC Draft | `kycDraft.ts` | `POST /api/ai/agents/kyc` | Manual from KYCTab |

**ScoreActions**: Takes 8 KPI scores + signals → generates 2-4 targeted action recommendations → persists as `Action` with `source: "AI_PROPOSED"`.

**OpportunityAnalysis**: Multi-step — identifies expansion vectors, scores each for feasibility, deduplicates against existing opportunities → persists with `pendingReview: true, source: "AI"`.

**SignalTriage**: Rates signal confidence (0-1), drafts a recommended action if confidence > 0.5, updates signal `pendingReview: false`.

**QbrPrep**: Two-step — summarises account state, then generates structured agenda → persists `QbrSession` + `QbrItem` rows.

**KycDraft**: Two-step — extracts key facts from all sources, then drafts full 9-section KYC → persists `KycVersion` as DRAFT.

### Agent Trace Panel
`src/components/ui/AgentTracePanel.tsx` — collapsible accordion showing reasoning steps. Visible to MANAGER+ only. Used in OpportunitiesTab, KYCTab, QBRTab.

### Sources Panel
`src/components/ui/SourcesPanel.tsx` — collapsible panel showing data sources the AI referenced (KPI values, signals, scores, etc.). Wired into OpportunitiesTab, KYCTab, QBRTab.

---

## 10. All API Routes

### Response Format
All `ok()` / `created()` responses wrap data: `{ data: T }`. Clients must access `res.data`.

### Auth Routes
| Method | Route | Permission | Notes |
|---|---|---|---|
| POST | `/api/auth/login` | none | Email + password; falls back to demo users if DB unavailable |

### Account Routes
| Method | Route | Permission | Notes |
|---|---|---|---|
| GET | `/api/accounts` | `account:view` | KAM-scoped; resolves KAM from first seeded KAM user |
| POST | `/api/accounts` | `account:create` | MANAGER+ |
| GET | `/api/accounts/[id]` | `account:view` | |
| PATCH | `/api/accounts/[id]` | `account:update` | |
| GET | `/api/accounts/[id]/scores` | `score:view` | Score history |

### Actions
| Method | Route | Permission |
|---|---|---|
| GET | `/api/actions` | `action:view` |
| POST | `/api/actions` | `action:create` |
| PATCH | `/api/actions/[id]` | `action:update` |
| DELETE | `/api/actions/[id]` | `action:delete` |

### Signals
| Method | Route | Permission | Notes |
|---|---|---|---|
| GET | `/api/signals` | `signal:view` | Filter by `?accountId=` |
| POST | `/api/signals` | `signal:create` | |
| PATCH | `/api/signals/[id]` | `signal:resolve` | Supports `pendingReview`, `resolvedNote` |

### Opportunities
| Method | Route | Permission | Notes |
|---|---|---|---|
| GET | `/api/opportunities` | `opportunity:view` | Filter by `?accountId=` |
| POST | `/api/opportunities` | `opportunity:create` | |
| PATCH | `/api/opportunities/[id]` | `opportunity:update` | Supports `pendingReview`, `reviewNote`, `reviewedAt` |

### Contacts
| Method | Route | Permission |
|---|---|---|
| GET | `/api/contacts?accountId=` | `contact:view` |
| POST | `/api/contacts` | `contact:create` |
| PATCH | `/api/contacts/[id]` | `contact:update` |
| DELETE | `/api/contacts/[id]` | `contact:delete` |

### Users
| Method | Route | Permission | Notes |
|---|---|---|---|
| GET | `/api/users` | `user:view` (MANAGER+) | |
| POST | `/api/users` | `user:create` (ADMIN) | |
| PATCH | `/api/users/[id]` | `user:update` (MANAGER+) | |
| DELETE | `/api/users/[id]` | `user:delete` (ADMIN) | |

### KYC
| Method | Route | Permission |
|---|---|---|
| GET | `/api/kyc?accountId=` | `kyc:view` |
| POST | `/api/kyc` | `kyc:create` |
| PATCH | `/api/kyc/[id]` | `kyc:update` |

### QBR
| Method | Route | Permission |
|---|---|---|
| GET | `/api/qbr?accountId=` | `qbr:view` |
| POST | `/api/qbr` | `qbr:create` |
| PATCH | `/api/qbr/[id]` | `qbr:update` |

### Score Overrides
| Method | Route | Permission |
|---|---|---|
| GET | `/api/score-overrides` | `score:view` |
| POST | `/api/score-overrides` | `score:view` |
| PATCH | `/api/score-overrides/[id]` | `score:approve` (MANAGER+) |

### Documents
| Method | Route | Notes |
|---|---|---|
| POST | `/api/documents/upload` | Writes to `public/uploads/<uuid><ext>` |
| POST | `/api/documents/[id]/parse` | Extracts text via pdf-parse / mammoth |
| POST | `/api/documents/[id]/commit` | Runs AI extraction on document text |

### AI Routes
| Method | Route | Task | Pattern |
|---|---|---|---|
| POST | `/api/ai/score` | `score-narrative` | simple |
| POST | `/api/ai/pulse` | `pulse-insight` | simple |
| POST | `/api/ai/assistant` | `assistant` | simple + demo fallback |
| POST | `/api/ai/kyc` | `kyc-draft` | delegates to kycDraft agent |
| POST | `/api/ai/qbr/generate` | `qbr-generate` | delegates to qbrPrep agent |
| POST | `/api/ai/qbr` | `qbr-summary` | simple |
| POST | `/api/ai/opportunities` | `opportunity-analysis` | delegates to opportunityAnalysis agent |
| POST | `/api/ai/extract` | `doc-extract` | simple |
| POST | `/api/ai/questionnaire` | `questionnaire-prefill` | simple |
| POST | `/api/ai/agents/kyc` | agent | kycDraft agent route |
| POST | `/api/ai/agents/qbr` | agent | qbrPrep agent route |
| POST | `/api/ai/agents/opportunities` | agent | opportunityAnalysis agent route |

### Other
| Method | Route | Notes |
|---|---|---|
| GET | `/api/calendar` | `?from=ISO&to=ISO` — aggregates actions, QBRs, touchpoints, renewals, signals by date |
| GET | `/api/notifications` | Returns pending signals, score overrides, opportunities, upcoming QBRs |
| GET | `/api/admin` | MANAGER+ — list all users |
| GET | `/api/audit` | MANAGER+ — activity log |
| GET/PATCH | `/api/settings` | Read/write `AppConfig` including `scoreWeights` |

---

## 11. UI Pages & Components

### Pages

**`/home`** — Stats bar (ARR, healthy/at-risk/critical counts, open actions) + full-width `CalendarView` + Account Watchlist + Live Signals sidebar.

**`/portfolio`** — Account card grid. MANAGER+ see all accounts; KAM sees only their assigned accounts. "+ New Account" button (MANAGER+) opens `AccountFormModal`.

**`/accounts/[id]`** — 10-tab account detail page:
1. Overview — KPI scores, health gauge, score override requests
2. Signals — Pending Review section (AI-raised, amber styling) + Live Signals feed
3. Actions — Kanban board (OPEN / IN_PROGRESS / DONE)
4. Opportunities — Pending Review section + pipeline by status
5. Contacts — Contact list with inline edit
6. Documents — File upload + AI extraction
7. KYC — Draft editor + AI draft button (runs kycDraft agent)
8. QBR / DBR — Session list + generate button (runs qbrPrep agent)
9. Questionnaire — KAM self-assessment form
10. Timeline — Touchpoints + activity history

**`/actions`** — Global action Kanban across all accounts. "+ New Action" button.

**`/ai-pulse`** — AI insight feed from `AIPulseInsight` table.

**`/assistant`** — Chat interface backed by `POST /api/ai/assistant`.

**`/manager`** — Command Centre (MANAGER+): pending KYC approvals, pending score overrides, escalations, team performance.

**`/settings`** — Score weight sliders (persist to `AppConfig`), notification prefs, Team tab (user list + role management).

### Key Shared Components

**`Topbar`** — Role switcher chips, notification bell (badge count = pending signals + opps + overrides + unread insights), theme toggle, `UserMenu` (logged-in user avatar + name, logout button).

**`Sidebar`** — Navigation. Management section (Command Centre, Audit Log) visible to MANAGER+ only.

**`FloatingAssistant`** — Bottom-right chat bubble, available on all dashboard pages.

**`CalendarView`** — Custom month grid (no library). Shows coloured dot-chips per day (action=blue, qbr=purple, renewal=amber, signal=red, touchpoint=teal). Click a day → `DayDetailPanel` slides in from the right. Items link to `ActionDetailModal` or `SignalReviewModal`.

**`AgentTracePanel`** — Collapsible accordion showing AI reasoning steps. MANAGER+ only.

**`SourcesPanel`** — Collapsible panel showing data sources referenced by the AI. Teal accent.

**`NotificationDrawer`** — Slide-in panel from the right. Grouped by: pending signals, pending opportunities, pending overrides, upcoming QBRs.

---

## 12. Approval / Review Flows

### Signal Review
Trigger engine creates signals with `pendingReview: true`. In `SignalsTab`, these appear in an "AI-Raised Signals — Needs Review" section with amber styling.
- **Acknowledge** → `PATCH /api/signals/[id]` with `{ pendingReview: false }` → signal enters the live feed
- **Dismiss** → `{ isResolved: true, pendingReview: false }` → signal closes

### Opportunity Review
AI agent creates opportunities with `pendingReview: true`. In `OpportunitiesTab`, these appear in a "Pending AI Review" section.
- **Approve** → `PATCH /api/opportunities/[id]` with `{ pendingReview: false }` → enters pipeline
- **Decline** → `{ pendingReview: false, status: "LOST", reviewNote: "Declined" }`

### Score Override Flow
KAM requests override from OverviewTab → creates `ScoreOverride` with `status: "PENDING"`. MANAGER sees pending overrides in Command Centre and Settings → approves/declines via `PATCH /api/score-overrides/[id]`.

### KYC Approval
KAM submits KYC draft (`status: "SUBMITTED"`). MANAGER approves/rejects from Command Centre. Rejection requires a `rejectionReason` stored on the `KycVersion`.

---

## 13. Styling

**Design language**: Glassmorphism — frosted-glass cards with blur + border.

**Standard card surface:**
```css
rounded-xl border border-[var(--glass-border)] bg-[var(--glass-bg)]
[backdrop-filter:var(--glass-blur)] shadow-[var(--glass-shadow)]
```

**Modal / elevated surfaces** (solid, no transparency bleed):
```css
bg-[var(--bg-surface-1)]
```

**Brand colours:**
- Blue: `#0755E9`
- Healthy: `#22C55E`
- At-Risk: `#F59E0B`
- Critical: `#EF4444`
- AI / Teal: `#14B8A6`
- Manager purple: `#7C3AED`
- Executive sky: `#0EA5E9`

**Approval/review UI pattern**: bordered amber panel (`#F59E0B`), approve = green (`#22C55E`), decline = red (`#EF4444`). See `manager/page.tsx` for canonical example.

**Font**: Plus Jakarta Sans (loaded via `next/font`).

CSS tokens are defined in `src/styles/globals.css` for both light and dark modes. Dark mode is toggled via a class on `<html>`.

**Node 26 quirk**: Never use Unicode chars (en-dash `–`, minus `−`) inside JSX template literals — SWC emits invalid JS. Use plain ASCII `-`.

---

## 14. Environment Variables

### Required
```
DATABASE_URL=mysql://user:pass@host:port/dbname
GOOGLE_AI_API_KEY=...
NEXT_PUBLIC_APP_URL=https://your-vercel-url.vercel.app
```

### Optional
```
AI_PROVIDER=gemini          # gemini (default) | openai | claude
ADAPTER_MODE=mock           # mock (default) | live
JIRA_MODE=mock
WORKSPHERE_MODE=mock
FINANCE_MODE=mock
SALESFORCE_MODE=mock
```

### Current deployments
- **Local dev**: `DATABASE_URL` pointing to local MySQL 8, `AI_PROVIDER=gemini`
- **Vercel (prod)**: `DATABASE_URL` pointing to Railway MySQL, `GOOGLE_AI_API_KEY` required for AI features

---

## 15. Database Setup Commands

```bash
npm run db:migrate   # Run pending migrations (dev)
npm run db:generate  # Regenerate Prisma client after schema changes
npm run db:seed      # Seed demo data (6 accounts, all related data)
npm run db:reset     # migrate reset --force + seed (DESTROYS DATA)
npm run db:studio    # Prisma Studio GUI on :5555

# Against a specific DB (e.g. Railway):
DATABASE_URL="mysql://..." npx prisma migrate deploy
DATABASE_URL="mysql://..." npm run db:seed
```

---

## 16. Seeded Demo Data

6 accounts with full data depth:
| Account | Health | ARR | KAM |
|---|---|---|---|
| Helix Payments | CRITICAL | $1.75M | Sarah Chen |
| ClearBridge Health | AT_RISK | $870K | Sarah Chen |
| Ironclad Logistics | HEALTHY | $720K | Marcus Okafor |
| Beacon Analytics | HEALTHY | $510K | Marcus Okafor |
| Crestline Capital | AT_RISK | $1.2M | Sarah Chen |
| NexaCloud Ltd | HEALTHY | $510K | Marcus Okafor |

Each account has: 6+ KAM scores (historical trend), signals, actions (OPEN/IN_PROGRESS/DONE), contacts, documents, QBR sessions, KYC draft, touchpoints, escalations (AT_RISK/CRITICAL), opportunities, questionnaire responses, score overrides (PENDING/APPROVED/DECLINED).

---

## 17. Known Quirks & Constraints

| # | Issue | Notes |
|---|---|---|
| 1 | No real auth | Password is first-name-lowercase, no JWTs, role sent via header |
| 2 | KAM identity hack | `findFirst({ where: { role: "KAM" }, orderBy: { createdAt: "asc" } })` always returns Sarah Chen for scope filtering |
| 3 | `typescript.ignoreBuildErrors: true` | SWC TS worker SIGSEGVs during `next build` on Node 26; TS checked via IDE only |
| 4 | `devIndicators: false` | Next.js dev overlay causes `SyntaxError` on Node 26; disabled permanently |
| 5 | `/accounts/[id]` compilation | Many dynamic imports; navigate to it once and let it compile before expecting fast loads |
| 6 | No test suite | Dev server is the primary verification surface |
| 7 | Adapters always mock | `ADAPTER_MODE=mock`; live adapters exist as stubs |
| 8 | `pdfjs-dist`, `pdf-parse`, `mammoth` | `serverExternalPackages` — never import in client components |
| 9 | File uploads | Written to `public/uploads/<uuid><ext>` — not persisted across Vercel deployments (use S3/R2 for production) |
| 10 | `ok()` wraps data | All API responses are `{ data: T }` — always access `res.data` on the client |

---

## 18. Adding New Features — Checklist

When adding a new entity or feature:

1. **Schema**: Add model to `prisma/schema.prisma`, create migration with `npx prisma migrate dev --name <name>`, regenerate client with `npm run db:generate`
2. **API route**: Create under `src/app/api/<resource>/route.ts`. Use `ok()`, `created()`, `notFound()`, `guard()`, `getRoleFromRequest()`, `kamWhere()`. Call `logAudit()` after every write.
3. **Permissions**: Add new permission strings to `src/lib/permissions/policy.ts` under the appropriate role arrays
4. **Types**: Update `src/types/index.ts` if adding new shared types
5. **UI**: Use the glassmorphism card class. Use `useRole()` and `usePermissions()` to gate UI elements. Fetch from API with `x-role` and `x-user-id` headers.
6. **Seed data**: Add to `prisma/seed/index.ts` for demo coverage

### API Response Pattern
```ts
// Route handler template
export async function GET(req: NextRequest) {
  const role   = getRoleFromRequest(req);
  const denied = guard(role, "resource:view");
  if (denied) return denied;
  
  try {
    const data = await prisma.model.findMany({ ... });
    return ok(data);
  } catch (err) {
    return serverError(err);
  }
}
```

### Client Fetch Pattern
```ts
const res  = await fetch("/api/resource", {
  headers: {
    "x-role":    role,
    "x-user-id": userId ?? "",
  },
});
const json = await res.json();
const data = json.data; // always .data — never use json directly
```

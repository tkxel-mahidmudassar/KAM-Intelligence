# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev          # Start dev server on :3000
npm run build        # Production build (TS errors are skipped — see next.config.ts)
npm run lint         # ESLint via next lint

npm run db:migrate   # Run pending Prisma migrations (dev)
npm run db:generate  # Regenerate Prisma client after schema changes
npm run db:seed      # Seed demo data (6 accounts, KPIs, signals, scores, actions, QBR sessions)
npm run db:reset     # migrate reset --force + seed
npm run db:studio    # Prisma Studio GUI on :5555
```

No test suite exists. The dev server is the primary verification surface.

## Node / Build Quirks (this machine only)

- **Node 26.0.0** — use `/usr/local/Cellar/node/26.0.0/bin/node` explicitly when running scripts.
- **`typescript.ignoreBuildErrors: true`** — the SWC TS worker SIGSEGVs during `next build` on this machine. TS is checked via IDE LSP only.
- **`devIndicators: false`** — Next.js dev tools overlay causes `SyntaxError: Unexpected token 'throw'` on Node 26. Disabled permanently.
- **`/accounts/[id]` compilation** — this page has many dynamic imports and can SIGSEGV webpack during first compilation. Navigate to it once in the browser and let it compile; it will work afterwards.
- **SWC template literals** — never use Unicode characters (e.g. `−` U+2212, `–` em-dash) inside JSX template literals. SWC on Node 26 emits invalid JS for them. Use plain ASCII `-`.

## Architecture

### Routing

All UI pages live under `src/app/(dashboard)/` and share a layout with `Sidebar` + `Topbar` + `FloatingAssistant`. The root `page.tsx` redirects to `/home`.

API routes live under `src/app/api/`. Every handler imports helpers from `src/lib/api.ts` — use `ok()`, `created()`, `notFound()`, `guard()`, `getRoleFromRequest()`, and `kamWhere()` rather than constructing `NextResponse` directly.

All `ok()` / `created()` responses wrap data in `{ data: T }`. Client code must access `res.data`, not `res` directly.

### Auth / Role model (POC)

There is no real auth. The active role is:
- **Client-side**: stored in `RoleContext` (`src/context/RoleContext.tsx`), read via `useRole()` hook. The Topbar switcher sets it.
- **Server-side**: read from the `x-role` HTTP header via `getRoleFromRequest()`. Defaults to `"KAM"` if absent or invalid. Valid values: `KAM`, `MANAGER`, `EXECUTIVE`.

Permission checking uses the same `src/lib/permissions/policy.ts` module on both sides:
- API: `guard(role, "resource:action")` at the top of every handler — returns a 403 response or `null`.
- UI: `usePermissions()` hook wraps `can()`, `canAll()`, `canAny()` bound to the current role.

`kamWhere(role, kamId)` — adds a `{ kamId }` filter to Prisma queries for KAM role; returns `{}` for MANAGER/EXECUTIVE.

**POC KAM identity hack**: `GET /api/accounts` (and several other routes) resolve the "current KAM" by calling `prisma.user.findFirst({ where: { role: "KAM" }, orderBy: { createdAt: "asc" } })` — this always returns the first KAM seeded (Sarah Chen). There is no real session. All `kamWhere()` calls use this resolved `kamUser.id`.

### Database

MySQL 8 via Prisma 5.22. Schema at `prisma/schema.prisma`. Singleton client at `src/lib/prisma.ts` (globalThis pattern for Next.js hot-reload safety).

Key models: `Account` → `KamScore`, `KpiDimension`, `Signal`, `Action`, `Document`, `KycVersion`, `QbrSession`, `Touchpoint`, `Escalation`, `Opportunity`, `ScoreOverride`, `QuestionnaireResponse`, `AIPulseInsight`, `ActivityLog`. Global settings live in `AppConfig` (single row, id `"global"`).

**Action status enum** (DB/API): `OPEN`, `IN_PROGRESS`, `DONE`, `DISMISSED`. Do not use `TODO` or `WAITING` — those strings exist only inside `ActionsTab.tsx` as a local display bug and do not map to any DB values.

**Opportunity status progression**: `IDENTIFIED` → `QUALIFYING` → `PROPOSAL` → `WON` | `LOST`.

### Scoring engine

`POST /api/ai/score` is the entry point. It:
1. Loads configurable weights from `AppConfig.scoreWeights` (falls back to `DEFAULT_WEIGHTS` in `src/lib/scoring/weights.ts`: CSAT 20%, Relationship 15%, Risk 15%, ContractHealth 15%, ProjectHealth 10%, ResourceHealth 10%, Financial 10%, Whitespace 5%).
2. Fetches Jira, WorkSphere, and Finance adapter data in parallel.
3. Computes 8 dimension scores from `KpiDimension` rows + adapter data, then the weighted overall.
4. Blends in confirmed `QuestionnaireResponse` values (70% adapter / 30% questionnaire).
5. Applies approved `ScoreOverride` values on top of the blended scores.
6. Calls Gemini (temperature 0.2) for a 2-3 sentence `aiNarrative`.
7. Persists a `KamScore` row and updates `Account.health`.
8. Fires `runTriggerEngine()` from `src/lib/scoring/triggers.ts` (non-blocking, errors swallowed).

Health thresholds: `≥70 → HEALTHY`, `≥45 → AT_RISK`, `<45 → CRITICAL`.

### Trigger engine (`src/lib/scoring/triggers.ts`)

Runs after every score computation. Three sub-triggers all fire in `Promise.all`:
- **Negative triggers** — rules mapping KPI keys to `SignalType` with WARNING/CRITICAL thresholds. Creates, escalates (WARNING→CRITICAL), or resolves `Signal` records idempotently.
- **Upsell trigger** — creates `UPSELL_OPPORTUNITY` INFO signal when `whitespace ≥ 70` and `csat ≥ 65`.
- **Drift trigger** — compares last 2 `KamScore.overall` values. Drop ≥15 pts → CRITICAL `HEALTH_ALERT`; drop ≥8 pts → WARNING. Auto-resolves on recovery.

### AI layer

`src/lib/ai/index.ts` exports `complete()` — always use this, never import a provider directly. Provider is resolved once and cached from `AI_PROVIDER` env var (`gemini` | `openai` | `claude`). Every call is fire-and-forget logged to `AIPulseInsight` (with `isDismissed: true` so logs don't pollute the insight feed) via `logLLMCall()` in `src/lib/ai/logger.ts`.

**Two call patterns in this codebase:**

1. **Simple call** — single `complete()` invocation, one prompt, one response. Used by assistant, pulse, score-narrative.
2. **Agent pattern** — multi-step orchestration in `src/lib/ai/agents/`. An agent function fetches DB context, runs one or more `complete()` calls (possibly in sequence, with intermediate parsing), then persists results and optionally fires side-effects (signals, actions, notifications). Agent routes live under `src/app/api/ai/agents/`. Agents are triggered via POST and return a structured result + a `steps[]` trace array.

**Structured JSON output convention**: All routes that expect JSON back from the LLM must use `responseMimeType: "application/json"` in the Gemini generation config (passed via `complete()` options). Do not rely on the `firstBrace`/`lastBrace` heuristic extraction for new code — use JSON mode instead. Legacy routes that still use the heuristic are: `pulse`, `kyc`, `qbr/generate`, `opportunities`.

AI endpoints and their task names:
| Route | Task label | Pattern | Key params |
|---|---|---|---|
| `POST /api/ai/score` | `score-narrative` | simple | `accountId` |
| `POST /api/ai/pulse` | `pulse-insight` | simple | optional `accountId` |
| `POST /api/ai/kyc` | `kyc-draft` | simple | `accountId` |
| `POST /api/ai/extract` | `doc-extract` | simple | `documentId`, `rawText` |
| `POST /api/ai/qbr/generate` | `qbr-generate` | simple | `accountId`, `sessionType` |
| `POST /api/ai/qbr` | `qbr-summary` | simple | `sessionId` |
| `POST /api/ai/assistant` | `assistant` | simple + demo-fallback | `messages[]`, optional `accountId` |
| `POST /api/ai/questionnaire` | `questionnaire-prefill` | simple | `accountId`, `section` |
| `POST /api/ai/opportunities` | `opportunity-analysis` | simple | `accountId` |
| `POST /api/ai/agents/*` | varies | agent (multi-step) | varies |

**Demo fallback**: `POST /api/ai/assistant` catches Gemini 429/quota errors and calls `demoFallback()`, which parses the system context string and returns a rule-based contextual answer. This keeps the POC working without a valid API key.

### Agent pattern (new — `src/lib/ai/agents/`)

Each agent is a plain async function exported from `src/lib/ai/agents/<name>.ts`. Signature:

```ts
export async function runXyzAgent(input: XyzInput): Promise<XyzResult> {
  // 1. Fetch all needed DB context in parallel
  // 2. Build prompt(s)
  // 3. Call complete() one or more times, parsing intermediate results
  // 4. Persist results to DB
  // 5. Fire side-effects (signals, actions, notifications) non-blocking
  // 6. Return { result, steps: AgentStep[], model, totalLatencyMs }
}
```

`AgentStep` is `{ name: string; input: string; output: string; latencyMs: number }` — used for the trace panel in the UI. The route handler at `src/app/api/ai/agents/<name>/route.ts` calls the agent function, handles errors, and returns `ok({ ...result })`.

### Adapter pattern

`src/lib/adapters/` — four adapters (Jira, WorkSphere, Finance, Salesforce). All run in `"mock"` mode in the POC. Switch via `ADAPTER_MODE` env var globally or `JIRA_MODE`, `WORKSPHERE_MODE`, `FINANCE_MODE`, `SALESFORCE_MODE` per-adapter. Each adapter exports a `get*Adapter()` factory that returns the mock or live implementation based on the resolved mode.

### Audit logging

`logAudit()` from `src/lib/audit.ts` — fire-and-forget, never throws. Call it after any write operation. Writes to `ActivityLog`. `userId` is not captured in the POC; role is stored in `metadata` instead.

### UI styling

Tailwind CSS v4 with glassmorphism design language. All card surfaces use:
```
rounded-xl border border-[var(--glass-border)] bg-[var(--glass-bg)] [backdrop-filter:var(--glass-blur)] shadow-[var(--glass-shadow)]
```
CSS custom properties are defined in `src/styles/globals.css` for light and dark modes. Brand blue: `#0755E9`. Status colors: HEALTHY `#22C55E`, AT_RISK `#F59E0B`, CRITICAL `#EF4444`. Font: Plus Jakarta Sans.

Modal/elevated surfaces must use `bg-[var(--bg-surface-1)]` (solid white/dark) to avoid transparency bleed.

**Approval/review UI pattern** (score overrides, KYC, AI-proposed items): use a bordered panel with amber `#F59E0B` accent, approve button in `#22C55E`, decline/reject button in `#EF4444`. See the pending-overrides panel in `src/app/(dashboard)/manager/page.tsx` as the canonical example.

### Document processing

`pdfjs-dist`, `pdf-parse`, and `mammoth` are in `serverExternalPackages` — they must never be imported in client components. Upload writes files to `public/uploads/<uuid><ext>`. Parse endpoint reads back from disk and updates `Document.extractedText`.

### Calendar data model

`GET /api/calendar?from=ISO&to=ISO` aggregates items across multiple models by date:
- `Action.dueDate` → type `"action"`
- `QbrSession.scheduledAt` → type `"qbr"`
- `Touchpoint.date` → type `"touchpoint"`
- `Account.contractEnd` → type `"renewal"` (accounts with renewals in the window)
- Unresolved `Signal.detectedAt` → type `"signal"` (for signals detected in the window)

Each item in the response carries `{ id, type, title, accountId, accountName, severity?, status?, date }`. The calendar UI groups items by `date` (YYYY-MM-DD).

## Environment Variables

Required for dev:
```
DATABASE_URL=mysql://user:pass@localhost:3306/kam_intelligence
GOOGLE_AI_API_KEY=...
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

Optional:
```
AI_PROVIDER=gemini          # gemini | openai | claude
ADAPTER_MODE=mock           # mock | live
```

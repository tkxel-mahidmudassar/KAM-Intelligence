# components/accounts

Components for the Account Workspace (tabbed per-account view).

| File | What it is |
|------|-----------|
| `AccountHeader.tsx` | Account name, mode, RAG badge, KAM Score, contract end, MRR summary |
| `AccountTabs.tsx` | Tab bar: Overview / KPIs / KYC / Actions / Documents / Signals / QBR |
| `OverviewTab.tsx` | High-level account health summary |
| `KpiTab.tsx` | KPI score cards grid with AI-proposed scores, sources, confidence |
| `KpiScoreCard.tsx` | Single KPI with score, trend, sources, confidence, missing-data state |
| `SignalsTab.tsx` | Account-scoped live signals and alert history |

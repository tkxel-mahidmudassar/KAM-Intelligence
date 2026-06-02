# components/charts

Recharts wrappers — typed, themed, reusable across all pages.

| File | What it is |
|------|-----------|
| `KamScoreTrend.tsx` | Line chart of KAM Score over time |
| `MrrBar.tsx` | Bar chart for MRR by account or period |
| `RagDistribution.tsx` | Pie/donut showing Healthy / At Risk / Critical split |
| `KpiRadar.tsx` | Radar chart for multi-KPI health snapshot |
| `RenewalTimeline.tsx` | Gantt-style timeline of upcoming contract renewals |

Rule: all charts accept plain data props and never fetch their own data.

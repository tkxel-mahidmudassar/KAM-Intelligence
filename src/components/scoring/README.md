# components/scoring

UI for the AI-proposed + human-review scoring workflow.

| File | What it is |
|------|-----------|
| `ScoreProposal.tsx` | Displays LLM-proposed score with sources, confidence, missing-data notes |
| `ScoreReviewPanel.tsx` | Accept / Override / Reject panel with mandatory reason on override |
| `ScoreBadge.tsx` | Visual score indicator showing AI-proposed vs human-accepted vs overridden state |
| `GuardrailWarning.tsx` | Alert shown when a deterministic guardrail fires (e.g. renewal < 90 days) |
| `ScoreHistory.tsx` | Timeline of past score states and who changed them |
| `ConfidenceBar.tsx` | Visual confidence level indicator |
| `SourceList.tsx` | Collapsible list of evidence sources with type, date, confidence |
| `MissingDataNote.tsx` | Yellow callout for missing evidence that affects score confidence |

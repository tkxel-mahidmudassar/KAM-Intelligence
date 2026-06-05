# lib/scoring

Deterministic scoring guardrails. Runs after every LLM score proposal to flag conflicts before human review.

## Structure

```
lib/scoring/
├── guardrails.ts     # applyGuardrails(proposal) → GuardrailResult[]
└── transitions.ts    # Valid score state machine transitions
```

## Guardrail examples

- Renewal within 90 days → Contract Health cannot be "Healthy" without strong evidence
- Open escalation present → Project Health must flag risk
- No source evidence → confidence drops, requires mandatory review
- Proposal changes RAG state → always requires human approval

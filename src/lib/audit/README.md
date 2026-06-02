# lib/audit

Audit event helpers. All mutations that require governance trail call these functions.

## Structure

```
lib/audit/
└── events.ts    # createAuditEvent(type, actor, resource, metadata) → AuditEvent
```

## Event types that must create an audit record

- ACTION_CREATED / ACTION_STATUS_CHANGED
- SCORE_PROPOSED / SCORE_ACCEPTED / SCORE_OVERRIDDEN / SCORE_REJECTED
- KYC_DRAFT_CREATED / KYC_APPROVED / KYC_RETURNED
- DOCUMENT_SIGNAL_COMMITTED
- PLAN_LAUNCHED
- SETTINGS_CHANGED
- ESCALATION_OPENED / ESCALATION_CLOSED

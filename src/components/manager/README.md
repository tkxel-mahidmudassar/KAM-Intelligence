# components/manager

Manager governance — action traceability, approvals, audit trail.

| File | What it is |
|------|-----------|
| `ManagerDashboard.tsx` | Overview of pending approvals and escalations across all accounts |
| `PendingApprovalList.tsx` | Queue of KYC drafts, score overrides, and plans awaiting approval |
| `ApprovalCard.tsx` | Single approval item with Approve / Return-with-notes actions |
| `AuditLog.tsx` | Filtered, searchable log of all audit events |
| `AuditEvent.tsx` | Single audit event row (actor, action, timestamp, account) |
| `EscalationList.tsx` | Open escalations with status and owner |

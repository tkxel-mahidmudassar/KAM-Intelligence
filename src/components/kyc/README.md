# components/kyc

KYC intelligence panel — versioned drafts, review, and approval.

| File | What it is |
|------|-----------|
| `KycTab.tsx` | KYC tab container showing current approved version + draft banner |
| `KycVersionBadge.tsx` | Shows version state: Draft / In Review / Approved |
| `KycContent.tsx` | Renders the structured KYC narrative with source citations |
| `KycDraftBanner.tsx` | Banner shown when a draft refresh is pending review |
| `KycApprovalPanel.tsx` | Manager approve / return-with-notes panel |
| `KycVersionHistory.tsx` | List of past approved versions with timestamps |
| `KycGenerateButton.tsx` | Triggers LLM KYC refresh draft (KAM-only) |

# components/documents

Document ingestion — paste text or upload file, then extract signals via LLM.

| File | What it is |
|------|-----------|
| `DocumentsTab.tsx` | Documents tab container with ingested document list + upload area |
| `DocumentUploadArea.tsx` | Drag-and-drop + browse upload for PDF/DOCX/TXT |
| `DocumentPasteModal.tsx` | Paste raw text pathway (faster for demo) |
| `DocumentCard.tsx` | Ingested document with status, extracted signal count, source type |
| `ExtractionResultPanel.tsx` | Displays extracted signals with confidence + commit-to-account CTA |
| `DocumentStatusBadge.tsx` | Processing / Extracted / Committed / Failed |

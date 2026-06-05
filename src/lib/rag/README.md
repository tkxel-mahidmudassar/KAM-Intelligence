# lib/rag

RAG pipeline — source capture, chunking, embedding, retrieval, grounded generation.

## Structure

```
lib/rag/
├── chroma.ts        # Chroma client singleton
├── ingest.ts        # chunk() + embed() + upsert() pipeline
├── retrieve.ts      # retrieve(query, accountId, topK) → SourceDocument[]
└── providers/       # External source provider plugins (normalise to SourceDocument)
```

## Source provider plugin contract

Each provider exports:
```ts
fetch(accountId: string): Promise<SourceDocument[]>
```

All providers normalise output to `SourceDocument`:
- sourceType, url, sourceDate, priority, confidence, rawText

# lib/ai

Configurable LLM provider abstraction. App code calls this layer only — never imports OpenAI/Claude/Gemini SDKs directly.

## Structure

```
lib/ai/
├── provider.interface.ts   # LLMProvider interface all providers implement
├── index.ts                # getProvider() factory — reads AI_PROVIDER env var
├── logger.ts               # Persists every AI call (prompt, model, latency, tokens, status) to DB
└── providers/
    ├── openai.ts           # OpenAI implementation
    ├── claude.ts           # Anthropic Claude implementation
    └── gemini.ts           # Google Gemini implementation
```

## Contract

Every AI output returned by this layer must include:
- `content` — the generated text
- `sources` — array of source references used
- `confidence` — 0–1 float
- `missingData` — string[] of evidence gaps noted by the model
- `model` — model ID used
- `provider` — provider name
- `latencyMs` — generation time

# lib/adapters

Integration adapter contracts. App logic never imports a concrete adapter directly — it uses the interface. POC ships with mock implementations; swap for live without touching app code.

## Structure

```
lib/adapters/
├── adapter.interface.ts    # Base AdapterClient interface
├── salesforce/
│   ├── interface.ts        # Salesforce-specific contract
│   └── mock.ts             # Mock implementation (seeded data)
├── jira/
│   ├── interface.ts
│   └── mock.ts
├── worksphere/
│   ├── interface.ts
│   └── mock.ts
└── finance/
    ├── interface.ts
    └── mock.ts
```

## Normalised Source Document shape (all adapters return this)

```ts
{
  sourceType: string;
  url: string | null;
  sourceDate: Date;
  priority: number;        // 1 = highest
  confidence: number;      // 0–1
  rawText: string;
}
```

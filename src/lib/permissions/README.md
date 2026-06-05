# lib/permissions

Central permission policy. Both UI components and API route handlers import from here — single source of truth.

## Structure

```
lib/permissions/
├── policy.ts       # can(role, action, resource?) → boolean
└── roles.ts        # Role enum: KAM | MANAGER | EXECUTIVE
```

## Rules (from PRD)

| Role      | Account visibility | Can approve KYC | Can approve scores | Can see audit log |
|-----------|-------------------|-----------------|-------------------|-------------------|
| KAM       | Assigned only      | No              | No                | Own accounts      |
| Manager   | All               | Yes             | Yes               | All               |
| Executive | All (read-only)   | No              | No                | All               |

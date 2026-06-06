# KAM Intelligence V2 Enhanced

Fresh rebuild workspace for the enhanced KAM Intelligence product.

## Foundation copied from V1

- Next.js / React / TypeScript configuration
- Prisma schema, migrations, and seed files
- Existing `.env` and `.env.example` shape for the shared DB and OpenAI provider
- API routes for current data access and AI provider calls
- Shared `src/lib`, `src/context`, `src/hooks`, `src/types`
- UI primitives and global design tokens

## Intent

This folder is intentionally a clean product shell, not a full V1 page clone.
We will add the actual modules one at a time based on dictated requirements,
then QA each slice before moving to the next.

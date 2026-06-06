# Global Role Bar

## Status

Built after the Portfolio page so role switching is persistent across V2 screens.

## Purpose

The global role bar lets us test the three target product personas without
duplicating role controls inside every page.

## Behavior

- Sticks to the top of the viewport.
- Available on all routes because it is mounted from `src/app/layout.tsx`.
- Uses a compact segmented/timeline-style switch bar rather than large role
  cards, so it stays persistent without dominating the page.
- Provides role switches for:
  - Associate
  - KAM
  - C-Level
- Uses `RoleContext`, so changing the role updates all pages that read the
  current role.
- Shows a subtle `Read-only view` indicator for C-Level style roles on wider
  screens.

## Current Implementation

- Component: `src/components/layout/RoleBar.tsx`
- Mounted inside `RoleProvider` in `src/app/layout.tsx`
- Persists role choice through the existing localStorage behavior in
  `src/context/RoleContext.tsx`
- Visual language is intentionally quiet: warm paper background, small node
  markers, pill-shaped active state, and natural-case labels.

## AI Involvement

No AI is used.

Reasoning:

- Role switching is deterministic UI state.
- No agent, LLM call, or model reasoning is needed.

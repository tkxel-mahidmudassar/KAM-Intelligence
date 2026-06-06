# Design Language

## Status

Active V2 design rule.

## Typography Rule

Do not use all-caps text as a styling pattern anywhere in the V2 interface.

Allowed exceptions:

- true acronyms such as KAM, ARR, API, LLM, or KPI
- company names or source data that are officially written in all caps

Implementation guidance:

- Do not use Tailwind `uppercase` for labels, section headings, table headers,
  badges, helper text, or metric captions.
- Prefer natural sentence case or title case.
- Avoid extreme letter spacing for small labels unless it is supporting a
  specific brand treatment and does not create an all-caps feel.

## Rationale

The V2 interface should feel human, calm, and editorial. All-caps labels make
the product feel generic and dashboard-coded, so the default style should be
natural language.

## Persistent Controls

Persistent controls should be compact and quiet. Use slim switch bars, segmented
controls, or timeline-like rails instead of oversized cards when the control is
global and repeated across screens.

# components/ui

Base design-system primitives with no business logic.

| File | What it is |
|------|-----------|
| `Button.tsx` | Primary, secondary, ghost, destructive variants |
| `Card.tsx` | Surface container with optional header/footer slots |
| `Badge.tsx` | Status labels (healthy / at-risk / critical / neutral) |
| `StatusDot.tsx` | Coloured dot for inline RAG status |
| `Spinner.tsx` | Loading indicator |
| `Skeleton.tsx` | Loading skeleton blocks |
| `Modal.tsx` | Accessible dialog wrapper |
| `Tooltip.tsx` | Hover tooltip |
| `Tabs.tsx` | Tab bar + panel primitives |
| `Table.tsx` | Sortable, typed data table |
| `Input.tsx` | Text/number input with label + error |
| `Select.tsx` | Dropdown select |
| `Textarea.tsx` | Multi-line text input |
| `Divider.tsx` | Horizontal rule |

Rule: nothing in this folder imports from `/lib`, `/hooks`, or feature components.

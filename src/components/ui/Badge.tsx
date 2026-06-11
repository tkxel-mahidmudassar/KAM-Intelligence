import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[11px] font-semibold tracking-[0.01em] transition-colors whitespace-nowrap",
  {
    variants: {
      variant: {
        /* ── RAG status ── */
        healthy:  "bg-[#14532D] text-white border border-[#166534] shadow-[0_0_0_1px_rgba(20,83,45,0.08),0_6px_14px_-10px_rgba(20,83,45,0.85)] dark:bg-[#166534] dark:text-[#ECFDF5] dark:border-[#22C55E]",
        "at-risk": "bg-[#DC2626] text-white border border-[#B91C1C] shadow-[0_0_0_1px_rgba(185,28,28,0.12),0_6px_14px_-10px_rgba(185,28,28,0.90)] dark:bg-[#DC2626] dark:text-white dark:border-[#FCA5A5]",
        critical: "bg-[#7F1D1D] text-white border border-[#991B1B] shadow-[0_0_0_1px_rgba(127,29,29,0.10),0_6px_14px_-10px_rgba(127,29,29,0.95)] dark:bg-[#991B1B] dark:text-[#FEF2F2] dark:border-[#F87171]",

        /* ── Neutral / brand ── */
        neutral: "bg-[var(--bg-surface-2)] text-[var(--text-secondary)] border border-[var(--border-subtle)]",
        brand:   "bg-[#EEF4FE] text-[#0755E9] border border-[#B3CFFD] dark:bg-[#0D1E42] dark:text-[#4D8BFF] dark:border-[#1A3060]",
        info:    "bg-[#15803D] text-white border border-[#166534] shadow-[0_0_0_1px_rgba(21,128,61,0.10),0_6px_14px_-10px_rgba(21,128,61,0.80)] dark:bg-[#15803D] dark:text-white dark:border-[#86EFAC]",
        outline: "border border-[var(--border-default)] bg-transparent text-[var(--text-secondary)]",

        /* ── Score states ── */
        "ai-proposed":      "bg-[#EEF4FE] text-[#0647C7] border border-[#B3CFFD] dark:bg-[#0D1E42] dark:text-[#7AAEFF] dark:border-[#1A3060]",
        "human-accepted":   "bg-[#15803D] text-white border border-[#166534] dark:bg-[#15803D] dark:text-white dark:border-[#86EFAC]",
        "human-overridden": "bg-[#F5F3FF] text-[#6D28D9] border border-[#DDD6FE] dark:bg-[rgba(109,40,217,0.15)] dark:text-[#A78BFA] dark:border-[rgba(109,40,217,0.3)]",

        /* ── Action priorities — visually distinct from each other ── */
        "priority-critical": "bg-[#FEF2F2] text-[#B91C1C] border border-[#FECACA] dark:bg-[rgba(239,68,68,0.15)] dark:text-[#F87171] dark:border-[rgba(239,68,68,0.35)]",
        "priority-high":     "bg-[#FFF7ED] text-[#C2410C] border border-[#FED7AA] dark:bg-[rgba(234,88,12,0.15)] dark:text-[#FB923C] dark:border-[rgba(234,88,12,0.35)]",
        "priority-medium":   "bg-[#FFFBEB] text-[#92400E] border border-[#FDE68A] dark:bg-[rgba(245,158,11,0.15)] dark:text-[#FCD34D] dark:border-[rgba(245,158,11,0.35)]",
        "priority-low":      "bg-[#EFF6FF] text-[#1D4ED8] border border-[#BFDBFE] dark:bg-[rgba(59,130,246,0.12)] dark:text-[#60A5FA] dark:border-[rgba(59,130,246,0.25)]",

        /* ── Tkxel accent (orange, use sparingly) ── */
        accent: "bg-[#FFF0E5] text-[#D95800] border border-[#FFC999] dark:bg-[#2A1500] dark:text-[#FF8533] dark:border-[rgba(255,105,0,0.3)]",
      },
    },
    defaultVariants: { variant: "neutral" },
  }
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return <span className={cn(badgeVariants({ variant }), className)} {...props} />;
}

export { Badge, badgeVariants };

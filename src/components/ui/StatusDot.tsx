import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";
import type { RagStatus } from "@/types";

const dotVariants = cva("rounded-full shrink-0", {
  variants: {
    status: {
      HEALTHY:  "bg-green-500",
      AT_RISK:  "bg-amber-500",
      CRITICAL: "bg-red-500",
      neutral:  "bg-slate-400",
    },
    size: {
      xs: "h-1.5 w-1.5",
      sm: "h-2 w-2",
      md: "h-2.5 w-2.5",
      lg: "h-3 w-3",
    },
    pulse: {
      true:  "animate-pulse",
      false: "",
    },
  },
  defaultVariants: {
    status: "neutral",
    size: "sm",
    pulse: false,
  },
});

interface StatusDotProps
  extends React.HTMLAttributes<HTMLSpanElement>,
    Omit<VariantProps<typeof dotVariants>, "status"> {
  status: RagStatus | "neutral";
}

function StatusDot({ className, status, size, pulse, ...props }: StatusDotProps) {
  return (
    <span
      className={cn(dotVariants({ status, size, pulse }), className)}
      {...props}
    />
  );
}

export { StatusDot };

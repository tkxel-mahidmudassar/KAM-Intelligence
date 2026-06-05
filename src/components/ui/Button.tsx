"use client";

import { forwardRef } from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  [
    "inline-flex items-center justify-center gap-2 font-semibold tracking-[-0.01em] transition-all",
    "focus-visible:outline-none focus-visible:ring-[var(--ring-brand)]",
    "disabled:pointer-events-none disabled:opacity-40 select-none",
    "active:scale-[0.98]",
  ].join(" "),
  {
    variants: {
      variant: {
        primary: [
          "bg-[#0755E9] text-white rounded-lg",
          "shadow-[0_1px_2px_0_rgb(7_85_233/0.30),inset_0_1px_0_0_rgb(255_255_255/0.12)]",
          "hover:bg-[#0647C7] hover:shadow-[0_4px_12px_0_rgb(7_85_233/0.35)]",
        ].join(" "),
        secondary: [
          "bg-[var(--bg-surface-2)] text-[var(--text-primary)] rounded-lg border border-[var(--border-subtle)]",
          "hover:bg-[var(--bg-surface-3)] hover:border-[var(--border-default)]",
          "shadow-[var(--shadow-xs)]",
        ].join(" "),
        outline: [
          "border border-[var(--border-default)] bg-transparent text-[var(--text-primary)] rounded-lg",
          "hover:bg-[var(--bg-surface-2)] hover:border-[var(--border-strong)]",
        ].join(" "),
        ghost:
          "text-[var(--text-secondary)] rounded-lg hover:bg-[var(--bg-surface-2)] hover:text-[var(--text-primary)]",
        destructive: [
          "bg-[#DC2626] text-white rounded-lg",
          "shadow-[0_1px_2px_0_rgb(220_38_38/0.25)]",
          "hover:bg-[#B91C1C] hover:shadow-[0_4px_12px_0_rgb(220_38_38/0.30)]",
        ].join(" "),
        success: [
          "bg-[#16A34A] text-white rounded-lg",
          "hover:bg-[#15803D]",
        ].join(" "),
        warning: [
          "bg-[#D97706] text-white rounded-lg",
          "hover:bg-[#B45309]",
        ].join(" "),
        accent: [
          "bg-[#FF6900] text-white rounded-lg",
          "shadow-[0_1px_2px_0_rgb(255_105_0/0.30)]",
          "hover:bg-[#D95800] hover:shadow-[0_4px_12px_0_rgb(255_105_0/0.30)]",
        ].join(" "),
        link: "text-[#0755E9] underline-offset-4 hover:underline p-0 h-auto font-medium dark:text-[#4D8BFF]",
      },
      size: {
        xs:      "h-7 px-2.5 text-xs rounded-md",
        sm:      "h-8 px-3 text-[13px]",
        md:      "h-9 px-4 text-sm",
        lg:      "h-10 px-5 text-sm",
        xl:      "h-11 px-6 text-base",
        icon:    "h-9 w-9 p-0 rounded-lg",
        "icon-sm": "h-7 w-7 p-0 rounded-md",
        "icon-lg": "h-10 w-10 p-0 rounded-lg",
      },
    },
    defaultVariants: { variant: "primary", size: "md" },
  }
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
  loading?: boolean;
}

const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, loading, children, disabled, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";
    return (
      <Comp
        ref={ref}
        className={cn(buttonVariants({ variant, size }), className)}
        disabled={disabled || loading}
        {...props}
      >
        {loading ? (
          <>
            <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-current border-t-transparent opacity-70" />
            {children}
          </>
        ) : children}
      </Comp>
    );
  }
);
Button.displayName = "Button";

export { Button, buttonVariants };

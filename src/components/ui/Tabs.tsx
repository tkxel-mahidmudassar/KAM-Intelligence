"use client";

import * as TabsPrimitive from "@radix-ui/react-tabs";
import { cn } from "@/lib/utils";

const Tabs = TabsPrimitive.Root;

/* ── Pill variant — compact, for filter/toggle groups ── */
const TabsList = ({ className, ...props }: React.ComponentPropsWithoutRef<typeof TabsPrimitive.List>) => (
  <TabsPrimitive.List
    className={cn(
      "inline-flex h-8 items-center gap-0.5 rounded-lg bg-[var(--bg-surface-2)] border border-[var(--border-subtle)] p-0.5",
      className
    )}
    {...props}
  />
);

const TabsTrigger = ({ className, ...props }: React.ComponentPropsWithoutRef<typeof TabsPrimitive.Trigger>) => (
  <TabsPrimitive.Trigger
    className={cn(
      "inline-flex items-center justify-center whitespace-nowrap rounded-md px-3 py-1.5",
      "text-[13px] font-medium tracking-[-0.01em] transition-all duration-150",
      "text-[var(--text-muted)] hover:text-[var(--text-secondary)]",
      "data-[state=active]:bg-[var(--bg-surface)] data-[state=active]:text-[var(--text-primary)]",
      "data-[state=active]:shadow-[var(--shadow-xs)]",
      "focus-visible:outline-none",
      "disabled:pointer-events-none disabled:opacity-40",
      className
    )}
    {...props}
  />
);

/* ── Underline variant — for account workspace full-width tab bars ── */
const TabsBar = ({ className, ...props }: React.ComponentPropsWithoutRef<typeof TabsPrimitive.List>) => (
  <TabsPrimitive.List
    className={cn("flex items-center gap-0 border-b border-[var(--border-subtle)] overflow-x-auto scrollbar-none", className)}
    {...props}
  />
);

const TabsBarTrigger = ({ className, ...props }: React.ComponentPropsWithoutRef<typeof TabsPrimitive.Trigger>) => (
  <TabsPrimitive.Trigger
    className={cn(
      "px-4 py-2.5 text-[13px] font-medium tracking-[-0.01em]",
      "border-b-2 border-transparent -mb-px transition-all duration-150",
      "text-[var(--text-muted)] hover:text-[var(--text-secondary)] hover:border-[var(--border-default)]",
      "data-[state=active]:text-[#0755E9] data-[state=active]:border-[#0755E9]",
      "focus-visible:outline-none",
      "disabled:pointer-events-none disabled:opacity-40",
      className
    )}
    {...props}
  />
);

const TabsContent = ({ className, ...props }: React.ComponentPropsWithoutRef<typeof TabsPrimitive.Content>) => (
  <TabsPrimitive.Content className={cn("focus-visible:outline-none", className)} {...props} />
);

export { Tabs, TabsList, TabsTrigger, TabsBar, TabsBarTrigger, TabsContent };

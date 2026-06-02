"use client";

import * as TooltipPrimitive from "@radix-ui/react-tooltip";
import { cn } from "@/lib/utils";

function TooltipProvider({ children }: { children: React.ReactNode }) {
  return (
    <TooltipPrimitive.Provider delayDuration={250}>{children}</TooltipPrimitive.Provider>
  );
}

interface TooltipProps {
  content: React.ReactNode;
  children: React.ReactNode;
  side?: "top" | "bottom" | "left" | "right";
  align?: "start" | "center" | "end";
  className?: string;
}

function Tooltip({ content, children, side = "top", align = "center", className }: TooltipProps) {
  return (
    <TooltipPrimitive.Root>
      <TooltipPrimitive.Trigger asChild>{children}</TooltipPrimitive.Trigger>
      <TooltipPrimitive.Portal>
        <TooltipPrimitive.Content
          side={side}
          align={align}
          sideOffset={7}
          className={cn(
            "z-50 max-w-[240px] rounded-lg px-3 py-1.5",
            "bg-[#1B232E] text-[#EEF0F4] text-[12px] font-medium leading-snug",
            "shadow-[var(--shadow-lg)] border border-white/10",
            "animate-in fade-in-0 zoom-in-95 duration-100",
            "data-[side=bottom]:slide-in-from-top-1",
            "data-[side=top]:slide-in-from-bottom-1",
            "data-[side=left]:slide-in-from-right-1",
            "data-[side=right]:slide-in-from-left-1",
            className
          )}
        >
          {content}
          <TooltipPrimitive.Arrow className="fill-[#1B232E]" />
        </TooltipPrimitive.Content>
      </TooltipPrimitive.Portal>
    </TooltipPrimitive.Root>
  );
}

export { Tooltip, TooltipProvider };

import * as Separator from "@radix-ui/react-separator";
import { cn } from "@/lib/utils";

interface DividerProps {
  orientation?: "horizontal" | "vertical";
  className?: string;
  label?: string;
}

function Divider({ orientation = "horizontal", className, label }: DividerProps) {
  if (label) {
    return (
      <div className="flex items-center gap-3">
        <Separator.Root
          orientation="horizontal"
          className="flex-1 h-px bg-slate-200"
        />
        <span className="text-xs text-slate-400 whitespace-nowrap">{label}</span>
        <Separator.Root
          orientation="horizontal"
          className="flex-1 h-px bg-slate-200"
        />
      </div>
    );
  }

  return (
    <Separator.Root
      orientation={orientation}
      className={cn(
        orientation === "horizontal" ? "h-px w-full bg-slate-200" : "h-full w-px bg-slate-200",
        className
      )}
    />
  );
}

export { Divider };

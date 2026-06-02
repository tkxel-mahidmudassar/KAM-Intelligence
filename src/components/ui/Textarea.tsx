import { forwardRef } from "react";
import { cn } from "@/lib/utils";

export interface TextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string;
  error?: string;
  hint?: string;
}

const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ className, label, error, hint, id, ...props }, ref) => {
    const textareaId = id ?? label?.toLowerCase().replace(/\s+/g, "-");
    return (
      <div className="flex flex-col gap-1.5">
        {label && (
          <label htmlFor={textareaId} className="text-[13px] font-medium text-[var(--text-primary)]">
            {label}
          </label>
        )}
        <textarea
          id={textareaId}
          ref={ref}
          className={cn(
            "w-full rounded-lg border border-[var(--border-default)] bg-[var(--bg-surface)]",
            "px-3 py-2 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-muted)]",
            "min-h-[80px] resize-y",
            "transition-all duration-150",
            "hover:border-[var(--border-strong)]",
            "focus:border-[#0755E9] focus:outline-none focus:shadow-[var(--ring-brand)]",
            "disabled:cursor-not-allowed disabled:bg-[var(--bg-surface-2)] disabled:text-[var(--text-disabled)]",
            error && "border-[#DC2626] focus:border-[#DC2626] focus:shadow-[0_0_0_3px_rgb(220_38_38/0.18)]",
            className
          )}
          {...props}
        />
        {error && <p className="text-[11px] font-medium text-[#DC2626]">{error}</p>}
        {hint && !error && <p className="text-[11px] text-[var(--text-muted)]">{hint}</p>}
      </div>
    );
  }
);
Textarea.displayName = "Textarea";

export { Textarea };

import { forwardRef } from "react";
import { cn } from "@/lib/utils";

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  hint?: string;
  leftIcon?: React.ReactNode;
  rightIcon?: React.ReactNode;
}

const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ className, label, error, hint, leftIcon, rightIcon, id, ...props }, ref) => {
    const inputId = id ?? label?.toLowerCase().replace(/\s+/g, "-");
    return (
      <div className="flex flex-col gap-1.5">
        {label && (
          <label htmlFor={inputId} className="text-[13px] font-medium text-[var(--text-primary)]">
            {label}
          </label>
        )}
        <div className="relative flex items-center">
          {leftIcon && (
            <span className="pointer-events-none absolute left-3 text-[var(--text-muted)]">
              {leftIcon}
            </span>
          )}
          <input
            id={inputId}
            ref={ref}
            className={cn(
              "w-full rounded-lg border border-[var(--border-default)] bg-[var(--bg-surface)]",
              "py-2 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-muted)]",
              "transition-all duration-150",
              "hover:border-[var(--border-strong)]",
              "focus:border-[#0755E9] focus:outline-none focus:shadow-[var(--ring-brand)]",
              "disabled:cursor-not-allowed disabled:bg-[var(--bg-surface-2)] disabled:text-[var(--text-disabled)]",
              error && "border-[#DC2626] focus:border-[#DC2626] focus:shadow-[0_0_0_3px_rgb(220_38_38/0.18)]",
              leftIcon  ? "pl-9 pr-3" : "px-3",
              rightIcon ? "pr-9"      : "",
              className
            )}
            {...props}
          />
          {rightIcon && (
            <span className="pointer-events-none absolute right-3 text-[var(--text-muted)]">
              {rightIcon}
            </span>
          )}
        </div>
        {error && <p className="text-[11px] font-medium text-[#DC2626]">{error}</p>}
        {hint && !error && <p className="text-[11px] text-[var(--text-muted)]">{hint}</p>}
      </div>
    );
  }
);
Input.displayName = "Input";

export { Input };

"use client";

import { forwardRef } from "react";
import { Loader2 } from "lucide-react";
import clsx from "clsx";

type Variant = "primary" | "ghost" | "danger" | "teal-ghost";
type Size = "sm" | "md";

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  loading?: boolean;
}

const variantClasses: Record<Variant, string> = {
  primary: "bg-gold text-gold-ink font-bold hover:brightness-110 disabled:hover:brightness-100",
  ghost: "bg-surface-2 text-text font-semibold border border-border hover:bg-border/60",
  danger: "bg-coral text-[#2a0e0d] font-bold hover:brightness-110",
  "teal-ghost": "bg-transparent text-teal font-semibold border border-teal/40 hover:bg-teal/10",
};

const sizeClasses: Record<Size, string> = {
  sm: "px-3 py-1.5 text-xs",
  md: "px-4 py-2.5 text-[13.5px]",
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = "primary", size = "md", loading, disabled, className, children, ...props },
  ref
) {
  return (
    <button
      ref={ref}
      disabled={disabled || loading}
      className={clsx(
        "inline-flex items-center justify-center gap-2 rounded-[9px] transition-[filter,background-color] cursor-pointer",
        "disabled:cursor-not-allowed disabled:opacity-60",
        variantClasses[variant],
        sizeClasses[size],
        className
      )}
      {...props}
    >
      {loading && <Loader2 size={15} className="animate-spin-slow" />}
      {children}
    </button>
  );
});

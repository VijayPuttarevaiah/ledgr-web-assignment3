"use client";

import { forwardRef, useId } from "react";
import clsx from "clsx";

interface FieldLabelProps {
  children: React.ReactNode;
  htmlFor?: string;
  required?: boolean;
}

export function FieldLabel({ children, htmlFor, required }: FieldLabelProps) {
  return (
    <label htmlFor={htmlFor} className="mb-1.5 block text-[11px] font-semibold tracking-wide text-text-faint uppercase">
      {children}
      {required && (
        <span className="ml-0.5 text-coral" aria-hidden="true">
          *
        </span>
      )}
    </label>
  );
}

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  error?: string;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { error, className, id, ...props },
  ref
) {
  const generatedId = useId();
  const inputId = id ?? generatedId;
  return (
    <>
      <input
        ref={ref}
        id={inputId}
        aria-invalid={Boolean(error)}
        aria-describedby={error ? `${inputId}-error` : undefined}
        className={clsx(
          "w-full rounded-[9px] border bg-surface-2 px-3.5 py-2.5 text-sm text-text outline-none",
          "placeholder:text-text-faint focus-visible:border-gold",
          error ? "border-coral" : "border-border",
          className
        )}
        {...props}
      />
      {error && (
        <div id={`${inputId}-error`} className="mt-1.5 text-xs text-coral">
          {error}
        </div>
      )}
    </>
  );
});

interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  error?: string;
}

export const Select = forwardRef<HTMLSelectElement, SelectProps>(function Select(
  { error, className, children, ...props },
  ref
) {
  return (
    <select
      ref={ref}
      aria-invalid={Boolean(error)}
      className={clsx(
        "w-full rounded-[9px] border bg-surface-2 px-3.5 py-2.5 text-sm text-text outline-none",
        "focus-visible:border-gold",
        error ? "border-coral" : "border-border",
        className
      )}
      {...props}
    >
      {children}
    </select>
  );
});

export function Toggle({
  checked,
  onChange,
  label,
  id,
}: {
  checked: boolean;
  onChange: (value: boolean) => void;
  label: string;
  id?: string;
}) {
  const generatedId = useId();
  const toggleId = id ?? generatedId;
  return (
    <label htmlFor={toggleId} className="flex cursor-pointer items-center justify-between gap-3">
      <span className="text-sm text-text">{label}</span>
      <button
        id={toggleId}
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={clsx(
          "relative inline-block h-[18px] w-[34px] shrink-0 rounded-full border transition-colors",
          checked ? "border-teal bg-teal" : "border-border bg-surface-2"
        )}
      >
        <span
          className={clsx(
            "absolute top-0.5 h-3.5 w-3.5 rounded-full bg-white transition-[left]",
            checked ? "left-[17px]" : "left-0.5"
          )}
        />
      </button>
    </label>
  );
}

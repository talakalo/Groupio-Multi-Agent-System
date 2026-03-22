"use client";

import clsx from "clsx";
import { Loader2 } from "lucide-react";
import { type ButtonHTMLAttributes, type ReactNode, forwardRef } from "react";

type ButtonVariant = "primary" | "secondary" | "accent" | "ghost" | "danger" | "outline";
type ButtonSize = "sm" | "md" | "lg";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  children: ReactNode;
}

const variantStyles: Record<ButtonVariant, string> = {
  primary:
    "bg-primary-500 hover:bg-primary-600 text-white focus:ring-primary-500/20 active:bg-primary-700",
  secondary:
    "bg-white hover:bg-gray-50 text-gray-700 border border-gray-200 focus:ring-primary-500/20",
  accent:
    "bg-accent-500 hover:bg-accent-600 text-white focus:ring-accent-500/20 active:bg-accent-700",
  ghost:
    "bg-transparent hover:bg-gray-100 text-gray-600 focus:ring-gray-500/20",
  danger:
    "bg-error-500 hover:bg-error-600 text-white focus:ring-error-500/20 active:bg-error-700",
  outline:
    "bg-transparent hover:bg-primary-50 text-primary-600 border border-primary-200 focus:ring-primary-500/20",
};

const sizeStyles: Record<ButtonSize, string> = {
  sm: "px-3 py-1.5 text-sm",
  md: "px-5 py-2.5 text-sm",
  lg: "px-6 py-3 text-base",
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ variant = "primary", size = "md", loading, children, className, disabled, ...props }, ref) => {
    return (
      <button
        ref={ref}
        disabled={disabled || loading}
        className={clsx(
          "inline-flex items-center justify-center gap-2 rounded-md font-medium",
          "transition-all duration-200 active:scale-[0.98]",
          "focus:outline-none focus:ring-2 focus:ring-offset-2",
          "disabled:opacity-50 disabled:cursor-not-allowed disabled:active:scale-100",
          variantStyles[variant],
          sizeStyles[size],
          className
        )}
        {...props}
      >
        {loading && <Loader2 className="h-4 w-4 animate-spin" />}
        {children}
      </button>
    );
  }
);

Button.displayName = "Button";

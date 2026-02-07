"use client";

import React from "react";
import { cva, type VariantProps } from "class-variance-authority";

const textareaVariants = cva(
  `
    w-full px-3 py-2 rounded-lg border transition-colors
    focus:outline-none focus:ring-2 focus:ring-offset-0
    disabled:opacity-50 disabled:cursor-not-allowed
    resize-none
  `,
  {
    variants: {
      variant: {
        default:
          "border-gray-300 bg-white focus:border-blue-500 focus:ring-blue-500",
        filled:
          "border-transparent bg-gray-100 focus:bg-white focus:border-blue-500 focus:ring-blue-500",
        outlined:
          "border-gray-300 bg-transparent focus:border-blue-500 focus:ring-blue-500",
      },
      size: {
        sm: "text-sm min-h-[80px]",
        md: "text-base min-h-[120px]",
        lg: "text-lg min-h-[160px]",
      },
      error: {
        true: "border-red-500 focus:border-red-500 focus:ring-red-500",
        false: "",
      },
      resize: {
        none: "resize-none",
        vertical: "resize-y",
        horizontal: "resize-x",
        both: "resize",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "md",
      error: false,
      resize: "vertical",
    },
  }
);

export interface TextareaProps
  extends Omit<React.TextareaHTMLAttributes<HTMLTextAreaElement>, "size">,
    VariantProps<typeof textareaVariants> {
  label?: string;
  helperText?: string;
  errorMessage?: string;
  maxLength?: number;
  showCount?: boolean;
  dir?: "ltr" | "rtl";
}

export const Textarea = React.forwardRef<HTMLTextAreaElement, TextareaProps>(
  (
    {
      className,
      variant,
      size,
      error,
      resize,
      label,
      helperText,
      errorMessage,
      maxLength,
      showCount = false,
      dir = "ltr",
      value,
      onChange,
      ...props
    },
    ref
  ) => {
    const [charCount, setCharCount] = React.useState(
      typeof value === "string" ? value.length : 0
    );

    const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      setCharCount(e.target.value.length);
      onChange?.(e);
    };

    const hasError = error || !!errorMessage;

    return (
      <div className="w-full" dir={dir}>
        {label && (
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
            {label}
            {props.required && <span className="text-red-500 ml-1">*</span>}
          </label>
        )}

        <div className="relative">
          <textarea
            ref={ref}
            value={value}
            onChange={handleChange}
            maxLength={maxLength}
            className={textareaVariants({
              variant,
              size,
              error: hasError,
              resize,
              className,
            })}
            aria-invalid={hasError}
            aria-describedby={
              errorMessage
                ? `${props.id}-error`
                : helperText
                ? `${props.id}-helper`
                : undefined
            }
            {...props}
          />
        </div>

        <div className="flex justify-between items-center mt-1">
          <div>
            {errorMessage && (
              <p
                id={`${props.id}-error`}
                className="text-sm text-red-500"
                role="alert"
              >
                {errorMessage}
              </p>
            )}
            {!errorMessage && helperText && (
              <p
                id={`${props.id}-helper`}
                className="text-sm text-gray-500 dark:text-gray-400"
              >
                {helperText}
              </p>
            )}
          </div>

          {showCount && (
            <span
              className={`text-xs ${
                maxLength && charCount >= maxLength
                  ? "text-red-500"
                  : "text-gray-500"
              }`}
            >
              {charCount}
              {maxLength && ` / ${maxLength}`}
            </span>
          )}
        </div>
      </div>
    );
  }
);

Textarea.displayName = "Textarea";

export { textareaVariants };

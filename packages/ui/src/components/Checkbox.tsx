"use client";

import React from "react";

export interface CheckboxProps
  extends Omit<React.InputHTMLAttributes<HTMLInputElement>, "type" | "size"> {
  label?: string;
  description?: string;
  error?: boolean;
  errorMessage?: string;
  size?: "sm" | "md" | "lg";
  indeterminate?: boolean;
  dir?: "ltr" | "rtl";
}

export const Checkbox = React.forwardRef<HTMLInputElement, CheckboxProps>(
  (
    {
      className,
      label,
      description,
      error,
      errorMessage,
      size = "md",
      indeterminate = false,
      disabled,
      dir = "ltr",
      ...props
    },
    ref
  ) => {
    const checkboxRef = React.useRef<HTMLInputElement>(null);

    React.useImperativeHandle(ref, () => checkboxRef.current!);

    React.useEffect(() => {
      if (checkboxRef.current) {
        checkboxRef.current.indeterminate = indeterminate;
      }
    }, [indeterminate]);

    const sizes = {
      sm: "w-4 h-4",
      md: "w-5 h-5",
      lg: "w-6 h-6",
    };

    const labelSizes = {
      sm: "text-sm",
      md: "text-base",
      lg: "text-lg",
    };

    const hasError = error || !!errorMessage;

    return (
      <div className={`flex flex-col ${className || ""}`} dir={dir}>
        <label
          className={`
            flex items-start gap-3 cursor-pointer
            ${disabled ? "opacity-50 cursor-not-allowed" : ""}
          `}
        >
          <div className="relative flex items-center justify-center">
            <input
              ref={checkboxRef}
              type="checkbox"
              disabled={disabled}
              className={`
                ${sizes[size]}
                rounded border-2 transition-colors cursor-pointer
                ${
                  hasError
                    ? "border-red-500 text-red-600 focus:ring-red-500"
                    : "border-gray-300 text-blue-600 focus:ring-blue-500"
                }
                focus:ring-2 focus:ring-offset-2
                disabled:cursor-not-allowed
              `}
              aria-invalid={hasError}
              aria-describedby={
                errorMessage ? `${props.id}-error` : description ? `${props.id}-desc` : undefined
              }
              {...props}
            />
          </div>

          {(label || description) && (
            <div className="flex flex-col">
              {label && (
                <span
                  className={`
                    font-medium text-gray-900 dark:text-gray-100
                    ${labelSizes[size]}
                  `}
                >
                  {label}
                  {props.required && <span className="text-red-500 ml-1">*</span>}
                </span>
              )}
              {description && (
                <span
                  id={`${props.id}-desc`}
                  className="text-sm text-gray-500 dark:text-gray-400 mt-0.5"
                >
                  {description}
                </span>
              )}
            </div>
          )}
        </label>

        {errorMessage && (
          <p
            id={`${props.id}-error`}
            className="text-sm text-red-500 mt-1 ml-8"
            role="alert"
          >
            {errorMessage}
          </p>
        )}
      </div>
    );
  }
);

Checkbox.displayName = "Checkbox";

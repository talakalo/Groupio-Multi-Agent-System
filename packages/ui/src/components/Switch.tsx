"use client";

import React from "react";

export interface SwitchProps
  extends Omit<React.InputHTMLAttributes<HTMLInputElement>, "type" | "size"> {
  label?: string;
  description?: string;
  error?: boolean;
  errorMessage?: string;
  size?: "sm" | "md" | "lg";
  labelPosition?: "left" | "right";
  dir?: "ltr" | "rtl";
}

export const Switch = React.forwardRef<HTMLInputElement, SwitchProps>(
  (
    {
      className,
      label,
      description,
      error,
      errorMessage,
      size = "md",
      labelPosition = "right",
      disabled,
      checked,
      defaultChecked,
      onChange,
      dir = "ltr",
      ...props
    },
    ref
  ) => {
    const [isChecked, setIsChecked] = React.useState(
      checked ?? defaultChecked ?? false
    );

    React.useEffect(() => {
      if (checked !== undefined) {
        setIsChecked(checked);
      }
    }, [checked]);

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      const newChecked = e.target.checked;
      if (checked === undefined) {
        setIsChecked(newChecked);
      }
      onChange?.(e);
    };

    const sizes = {
      sm: {
        track: "w-8 h-4",
        thumb: "w-3 h-3",
        translate: "translate-x-4",
      },
      md: {
        track: "w-11 h-6",
        thumb: "w-5 h-5",
        translate: "translate-x-5",
      },
      lg: {
        track: "w-14 h-7",
        thumb: "w-6 h-6",
        translate: "translate-x-7",
      },
    };

    const labelSizes = {
      sm: "text-sm",
      md: "text-base",
      lg: "text-lg",
    };

    const hasError = error || !!errorMessage;
    const sizeConfig = sizes[size];

    const switchElement = (
      <button
        type="button"
        role="switch"
        aria-checked={isChecked}
        disabled={disabled}
        onClick={() => {
          const event = {
            target: { checked: !isChecked },
          } as React.ChangeEvent<HTMLInputElement>;
          handleChange(event);
        }}
        className={`
          relative inline-flex shrink-0 cursor-pointer rounded-full
          transition-colors duration-200 ease-in-out
          focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2
          ${sizeConfig.track}
          ${
            isChecked
              ? hasError
                ? "bg-red-500 focus-visible:ring-red-500"
                : "bg-blue-600 focus-visible:ring-blue-500"
              : "bg-gray-200 dark:bg-gray-700"
          }
          ${disabled ? "opacity-50 cursor-not-allowed" : ""}
        `}
      >
        <span className="sr-only">{label}</span>
        <span
          aria-hidden="true"
          className={`
            pointer-events-none inline-block rounded-full
            bg-white shadow-lg ring-0 transition duration-200 ease-in-out
            ${sizeConfig.thumb}
            ${isChecked ? sizeConfig.translate : "translate-x-0.5"}
            ${size === "sm" ? "mt-0.5" : "mt-0.5"}
          `}
        />
      </button>
    );

    const labelElement = (label || description) && (
      <div className="flex flex-col">
        {label && (
          <span
            className={`
              font-medium text-gray-900 dark:text-gray-100
              ${labelSizes[size]}
              ${disabled ? "opacity-50" : ""}
            `}
          >
            {label}
            {props.required && <span className="text-red-500 ml-1">*</span>}
          </span>
        )}
        {description && (
          <span
            className={`
              text-sm text-gray-500 dark:text-gray-400 mt-0.5
              ${disabled ? "opacity-50" : ""}
            `}
          >
            {description}
          </span>
        )}
      </div>
    );

    return (
      <div className={`flex flex-col ${className || ""}`} dir={dir}>
        {/* Hidden input for form submission */}
        <input
          ref={ref}
          type="checkbox"
          checked={isChecked}
          onChange={handleChange}
          disabled={disabled}
          className="sr-only"
          aria-hidden="true"
          {...props}
        />

        <div
          className={`
            flex items-center gap-3 cursor-pointer
            ${disabled ? "cursor-not-allowed" : ""}
          `}
        >
          {labelPosition === "left" && labelElement}
          {switchElement}
          {labelPosition === "right" && labelElement}
        </div>

        {errorMessage && (
          <p className="text-sm text-red-500 mt-1" role="alert">
            {errorMessage}
          </p>
        )}
      </div>
    );
  }
);

Switch.displayName = "Switch";

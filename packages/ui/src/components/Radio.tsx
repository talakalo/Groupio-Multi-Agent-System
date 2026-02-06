"use client";

import React from "react";

export interface RadioOption {
  value: string;
  label: string;
  description?: string;
  disabled?: boolean;
}

export interface RadioProps
  extends Omit<React.InputHTMLAttributes<HTMLInputElement>, "type" | "size"> {
  label?: string;
  description?: string;
  error?: boolean;
  size?: "sm" | "md" | "lg";
  dir?: "ltr" | "rtl";
}

export const Radio = React.forwardRef<HTMLInputElement, RadioProps>(
  (
    {
      className,
      label,
      description,
      error,
      size = "md",
      disabled,
      dir = "ltr",
      ...props
    },
    ref
  ) => {
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

    return (
      <label
        className={`
          flex items-start gap-3 cursor-pointer
          ${disabled ? "opacity-50 cursor-not-allowed" : ""}
          ${className || ""}
        `}
        dir={dir}
      >
        <div className="relative flex items-center justify-center mt-0.5">
          <input
            ref={ref}
            type="radio"
            disabled={disabled}
            className={`
              ${sizes[size]}
              rounded-full border-2 transition-colors cursor-pointer
              ${
                error
                  ? "border-red-500 text-red-600 focus:ring-red-500"
                  : "border-gray-300 text-blue-600 focus:ring-blue-500"
              }
              focus:ring-2 focus:ring-offset-2
              disabled:cursor-not-allowed
            `}
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
              </span>
            )}
            {description && (
              <span className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
                {description}
              </span>
            )}
          </div>
        )}
      </label>
    );
  }
);

Radio.displayName = "Radio";

export interface RadioGroupProps {
  name: string;
  value?: string;
  defaultValue?: string;
  options: RadioOption[];
  onChange?: (value: string) => void;
  error?: boolean;
  errorMessage?: string;
  label?: string;
  helperText?: string;
  orientation?: "horizontal" | "vertical";
  size?: "sm" | "md" | "lg";
  required?: boolean;
  disabled?: boolean;
  dir?: "ltr" | "rtl";
  className?: string;
}

export const RadioGroup: React.FC<RadioGroupProps> = ({
  name,
  value,
  defaultValue,
  options,
  onChange,
  error,
  errorMessage,
  label,
  helperText,
  orientation = "vertical",
  size = "md",
  required,
  disabled,
  dir = "ltr",
  className,
}) => {
  const [selectedValue, setSelectedValue] = React.useState(
    value ?? defaultValue ?? ""
  );

  React.useEffect(() => {
    if (value !== undefined) {
      setSelectedValue(value);
    }
  }, [value]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newValue = e.target.value;
    setSelectedValue(newValue);
    onChange?.(newValue);
  };

  const hasError = error || !!errorMessage;

  return (
    <fieldset className={className} dir={dir}>
      {label && (
        <legend className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
          {label}
          {required && <span className="text-red-500 ml-1">*</span>}
        </legend>
      )}

      <div
        className={`
          flex gap-4
          ${orientation === "vertical" ? "flex-col" : "flex-row flex-wrap"}
        `}
        role="radiogroup"
        aria-required={required}
        aria-invalid={hasError}
      >
        {options.map((option) => (
          <Radio
            key={option.value}
            name={name}
            value={option.value}
            label={option.label}
            description={option.description}
            checked={selectedValue === option.value}
            onChange={handleChange}
            disabled={disabled || option.disabled}
            error={hasError}
            size={size}
            dir={dir}
          />
        ))}
      </div>

      {errorMessage && (
        <p className="text-sm text-red-500 mt-2" role="alert">
          {errorMessage}
        </p>
      )}
      {!errorMessage && helperText && (
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-2">
          {helperText}
        </p>
      )}
    </fieldset>
  );
};

import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';

const inputVariants = cva(
  'flex w-full rounded-[10px] border-[1.5px] bg-white px-4 py-2.5 text-[0.9rem] text-[#0f1f1a] shadow-[inset_0_2px_4px_rgba(10,51,41,0.04)] transition-all duration-200 file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-[#9aadaa] focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-offset-0 disabled:cursor-not-allowed disabled:opacity-50 disabled:bg-[#f0f2ef]',
  {
    variants: {
      variant: {
        default:
          'border-[rgba(10,51,41,0.14)] hover:border-[rgba(26,154,118,0.3)] focus-visible:border-primary-500 focus-visible:ring-[rgba(26,154,118,0.12)]',
        error:
          'border-red-400 bg-red-50/30 focus-visible:border-red-500 focus-visible:ring-[rgba(239,68,68,0.12)]',
        success:
          'border-emerald-400 bg-emerald-50/20 focus-visible:border-emerald-500 focus-visible:ring-[rgba(34,197,94,0.12)]',
      },
      inputSize: {
        default: 'h-11',
        sm: 'h-8 text-sm px-3 rounded-[8px]',
        lg: 'h-13 text-base',
      },
    },
    defaultVariants: {
      variant: 'default',
      inputSize: 'default',
    },
  }
);

export interface InputProps
  extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'size'>,
    VariantProps<typeof inputVariants> {
  label?: string;
  error?: string;
  hint?: string;
  leftIcon?: React.ReactNode;
  rightIcon?: React.ReactNode;
}

const Input = React.forwardRef<HTMLInputElement, InputProps>(
  (
    {
      className,
      variant,
      inputSize,
      type,
      label,
      error,
      hint,
      leftIcon,
      rightIcon,
      id,
      ...props
    },
    ref
  ) => {
    const inputId = id || React.useId();
    const errorId = `${inputId}-error`;
    const hintId = `${inputId}-hint`;

    return (
      <div className="w-full">
        {label && (
          <label
            htmlFor={inputId}
            className="mb-1.5 block text-sm font-semibold"
            style={{ color: '#2d4a40' }}
          >
            {label}
          </label>
        )}
        <div className="relative">
          {leftIcon && (
            <div className="pointer-events-none absolute inset-y-0 start-0 flex items-center ps-3.5" style={{ color: '#9aadaa' }}>
              {leftIcon}
            </div>
          )}
          <input
            type={type}
            id={inputId}
            className={inputVariants({
              variant: error ? 'error' : variant,
              inputSize,
              className: `${leftIcon ? 'ps-10' : ''} ${rightIcon ? 'pe-10' : ''} ${className || ''}`,
            })}
            ref={ref}
            aria-invalid={error ? 'true' : 'false'}
            aria-describedby={error ? errorId : hint ? hintId : undefined}
            {...props}
          />
          {rightIcon && (
            <div className="pointer-events-none absolute inset-y-0 end-0 flex items-center pe-3.5" style={{ color: '#9aadaa' }}>
              {rightIcon}
            </div>
          )}
        </div>
        {error && (
          <p id={errorId} className="mt-1.5 text-sm font-medium" style={{ color: '#dc2626' }}>
            {error}
          </p>
        )}
        {hint && !error && (
          <p id={hintId} className="mt-1.5 text-sm" style={{ color: '#9aadaa' }}>
            {hint}
          </p>
        )}
      </div>
    );
  }
);
Input.displayName = 'Input';

export { Input, inputVariants };

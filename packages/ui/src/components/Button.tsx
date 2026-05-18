import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';

const buttonVariants = cva(
  'inline-flex items-center justify-center gap-2 rounded-[10px] font-semibold text-[0.9rem] transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 active:scale-[0.98]',
  {
    variants: {
      variant: {
        default:
          'bg-gradient-to-br from-primary-500 to-primary-700 text-white shadow-[0_2px_8px_rgba(26,154,118,0.28)] hover:shadow-[0_4px_16px_rgba(26,154,118,0.38)] hover:-translate-y-px focus-visible:ring-primary-500',
        destructive:
          'bg-gradient-to-br from-red-500 to-red-700 text-white shadow-[0_2px_8px_rgba(239,68,68,0.25)] hover:shadow-[0_4px_16px_rgba(239,68,68,0.35)] hover:-translate-y-px focus-visible:ring-red-500',
        outline:
          'border-[1.5px] border-primary-200 bg-transparent text-primary-600 hover:bg-primary-50 hover:border-primary-400 focus-visible:ring-primary-500',
        secondary:
          'bg-white border border-[rgba(10,51,41,0.15)] text-[#1f2d27] shadow-[0_1px_2px_rgba(10,51,41,0.06)] hover:border-[rgba(26,154,118,0.3)] hover:text-primary-600 hover:shadow-[0_2px_8px_rgba(10,51,41,0.08)] focus-visible:ring-primary-500',
        ghost:
          'bg-transparent text-[#4a6154] hover:bg-[rgba(10,51,41,0.06)] hover:text-[#0f1f1a] focus-visible:ring-gray-400',
        link:
          'text-primary-600 underline-offset-4 hover:underline hover:text-primary-700 focus-visible:ring-primary-500',
      },
      size: {
        default: 'h-10 px-5 py-2.5',
        sm: 'h-8 px-3.5 text-sm rounded-[8px]',
        lg: 'h-12 px-6 text-base',
        icon: 'h-10 w-10',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'default',
    },
  }
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  isLoading?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, isLoading, children, disabled, ...props }, ref) => {
    return (
      <button
        className={buttonVariants({ variant, size, className })}
        ref={ref}
        disabled={disabled || isLoading}
        {...props}
      >
        {isLoading && (
          <svg
            className="h-4 w-4 animate-spin"
            xmlns="http://www.w3.org/2000/svg"
            fill="none"
            viewBox="0 0 24 24"
          >
            <circle
              className="opacity-25"
              cx="12"
              cy="12"
              r="10"
              stroke="currentColor"
              strokeWidth="4"
            />
            <path
              className="opacity-75"
              fill="currentColor"
              d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
            />
          </svg>
        )}
        {children}
      </button>
    );
  }
);
Button.displayName = 'Button';

export { Button, buttonVariants };

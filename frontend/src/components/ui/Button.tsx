import React from 'react';

// Omit props that conflict with framer-motion
type ButtonHTMLProps = Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, 'onDrag' | 'onDragStart' | 'onDragEnd' | 'onAnimationStart'>;

export type ButtonVariant = 'primary' | 'secondary' | 'success' | 'danger' | 'warning' | 'outline' | 'ghost' | 'icon';
export type ButtonSize = 'sm' | 'md' | 'lg';

interface ButtonProps extends ButtonHTMLProps {
  variant?: ButtonVariant;
  size?: ButtonSize;
  isLoading?: boolean;
}

const baseStyles = 'inline-flex items-center justify-center gap-2 rounded-lg border font-semibold leading-none transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2 focus-visible:ring-offset-white dark:focus-visible:ring-offset-slate-900 disabled:opacity-50 disabled:pointer-events-none disabled:cursor-not-allowed cursor-pointer select-none';

const variants: Record<ButtonVariant, string> = {
  primary: 'border-indigo-600 bg-indigo-600 text-white hover:bg-indigo-700 dark:border-indigo-500 dark:bg-indigo-600 dark:hover:bg-indigo-500',
  secondary: 'border-slate-300 bg-white text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700',
  success: 'border-emerald-600 bg-emerald-600 text-white hover:bg-emerald-700 dark:border-emerald-500 dark:bg-emerald-600 dark:hover:bg-emerald-500',
  danger: 'border-rose-600 bg-rose-600 text-white hover:bg-rose-700 dark:border-rose-500 dark:bg-rose-600 dark:hover:bg-rose-500',
  warning: 'border-amber-500 bg-amber-500 text-amber-950 hover:bg-amber-600 dark:border-amber-400 dark:bg-amber-500 dark:text-amber-950 dark:hover:bg-amber-400',
  outline: 'border-slate-300 bg-transparent text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800',
  ghost: 'border-transparent bg-transparent text-slate-700 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800',
  icon: 'h-10 w-10 rounded-full border-slate-300 bg-white p-0 text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700',
};

const sizes: Record<ButtonSize, string> = {
  sm: 'h-9 px-3 py-2 text-xs',
  md: 'h-10 px-4 py-2 text-sm',
  lg: 'h-11 px-6 py-3 text-base',
};

export const getButtonVariantClasses = (variant: ButtonVariant = 'primary', size: ButtonSize = 'md', extraClassName = '') => {
  return [baseStyles, variants[variant], sizes[size], extraClassName].filter(Boolean).join(' ');
};

export const Button: React.FC<ButtonProps> = ({
  children,
  variant = 'primary',
  size = 'md',
  isLoading,
  className = '',
  type,
  ...props
}) => {
  const computedClassName = getButtonVariantClasses(variant, size, className);

  return (
    <button
      type={type ?? 'button'}
      className={computedClassName}
      disabled={isLoading || props.disabled}
      aria-busy={isLoading || undefined}
      {...props}
    >
      {isLoading ? (
        <svg
          className="h-4 w-4 animate-spin"
          fill="none"
          viewBox="0 0 24 24"
          aria-hidden="true"
        >
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
        </svg>
      ) : null}
      <span className="inline-flex items-center justify-center gap-2">{children}</span>
    </button>
  );
};
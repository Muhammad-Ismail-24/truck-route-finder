'use client';

/**
 * @file Button.jsx
 * Themed button component supporting pill shapes, loading sweep animations,
 * and accessible focus rings.
 *
 * References:
 * ARCHITECTURE.md Section 17.7, 25.4, 25.5.
 */

import Spinner from './Spinner';

/**
 * @param {Object} props
 * @param {'primary' | 'secondary' | 'outline' | 'ghost'} [props.variant='primary']
 * @param {'sm' | 'md' | 'lg'} [props.size='md']
 * @param {boolean} [props.loading=false]
 * @param {string} [props.loadingText]
 * @param {boolean} [props.disabled=false]
 * @param {string} [props.className='']
 * @param {React.ReactNode} props.children
 * @param {'button' | 'submit' | 'reset'} [props.type='button']
 */
export default function Button({
  variant = 'primary',
  size = 'md',
  loading = false,
  loadingText,
  disabled = false,
  className = '',
  children,
  type = 'button',
  ...props
}) {
  const isDisabled = disabled || loading;

  const baseStyles =
    'relative overflow-hidden inline-flex items-center justify-center font-body font-semibold rounded-full select-none transition-all duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cobalt focus-visible:ring-offset-2 focus-visible:ring-offset-ink active:scale-[0.98] disabled:active:scale-100 disabled:cursor-not-allowed';

  const sizeStyles = {
    sm: 'text-xs px-4 py-2 gap-1.5',
    md: 'text-sm px-6 py-3 gap-2',
    lg: 'text-base px-8 py-4 gap-2.5',
  }[size] || 'text-sm px-6 py-3 gap-2';

  const variantStyles = {
    primary:
      'bg-white text-ink hover:bg-cobalt hover:text-white disabled:bg-white/40 disabled:text-ink/60 shadow-sm',
    secondary:
      'bg-surface-2 text-white border border-border-strong hover:border-cobalt hover:bg-surface-3 disabled:opacity-40',
    outline:
      'bg-transparent text-white border border-border-subtle hover:border-cobalt hover:text-white disabled:opacity-40',
    ghost:
      'bg-transparent text-text-muted hover:text-white hover:bg-surface-2 disabled:opacity-40',
  }[variant] || '';

  return (
    <button
      type={type}
      disabled={isDisabled}
      aria-busy={loading}
      className={`${baseStyles} ${sizeStyles} ${variantStyles} ${className}`}
      {...props}
    >
      {/* Loading cobalt sweep bar for primary buttons */}
      {loading && variant === 'primary' && (
        <span
          className="absolute inset-0 bg-cobalt pointer-events-none overflow-hidden"
          aria-hidden="true"
        >
          <span className="absolute inset-0 w-full h-full bg-gradient-to-r from-cobalt via-white/40 to-cobalt animate-sweep" />
        </span>
      )}

      {/* Content */}
      <span className="relative z-10 flex items-center justify-center gap-2">
        {loading ? (
          <>
            <Spinner className="w-4 h-4 text-current" />
            <span>{loadingText || 'Planning…'}</span>
          </>
        ) : (
          children
        )}
      </span>
    </button>
  );
}

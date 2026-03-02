import type { ButtonHTMLAttributes, PropsWithChildren } from 'react';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  /** 
   * primary   — Spectral Purple gradient + glow (default)
   * secondary — subtle glass fill, muted text
   * danger    — Signal Red tint for destructive actions
   * ghost     — transparent, border only
   */
  variant?: 'primary' | 'secondary' | 'danger' | 'ghost';
}

export function Button({
  children,
  variant = 'primary',
  className = '',
  ...rest
}: PropsWithChildren<ButtonProps>) {
  // Map to CSS classes defined in globals.css; 'danger' and 'ghost' added here.
  const variantClass =
    variant === 'secondary' ? 'secondary'
    : variant === 'danger'    ? 'danger'
    : variant === 'ghost'     ? 'ghost-btn'
    : '';

  return (
    <button className={`button ${variantClass} ${className}`.trim()} {...rest}>
      {children}
    </button>
  );
}

import type { ButtonHTMLAttributes, PropsWithChildren } from 'react';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary';
}

export function Button({ children, variant = 'primary', className = '', ...rest }: PropsWithChildren<ButtonProps>) {
  const base = 'button';
  const variantClass = variant === 'secondary' ? 'secondary' : '';
  return (
    <button className={`${base} ${variantClass} ${className}`.trim()} {...rest}>
      {children}
    </button>
  );
}

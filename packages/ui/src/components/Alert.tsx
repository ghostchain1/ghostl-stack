import type { PropsWithChildren, ReactNode } from 'react';

interface AlertProps extends PropsWithChildren {
  variant?: 'info' | 'success' | 'warning' | 'danger';
  title?: string;
  icon?: ReactNode;
  onDismiss?: () => void;
  className?: string;
}

const variantMap = {
  info:    { cls: 'alert-info',    symbol: 'ℹ' },
  success: { cls: 'alert-success', symbol: '✓' },
  warning: { cls: 'alert-warning', symbol: '⚠' },
  danger:  { cls: 'alert-danger',  symbol: '✕' },
} as const;

export function Alert({
  variant = 'info',
  title,
  icon,
  onDismiss,
  className = '',
  children,
}: AlertProps) {
  const { cls, symbol } = variantMap[variant];
  return (
    <div
      className={`alert ${cls} ${className}`.trim()}
      role="alert"
      aria-live={variant === 'danger' ? 'assertive' : 'polite'}
    >
      <span className="alert-icon" aria-hidden="true">
        {icon ?? symbol}
      </span>
      <div className="alert-body">
        {title && <strong className="alert-title">{title}</strong>}
        {children && <div className="alert-content">{children}</div>}
      </div>
      {onDismiss && (
        <button
          type="button"
          className="alert-dismiss"
          aria-label="Dismiss alert"
          onClick={onDismiss}
        >
          ×
        </button>
      )}
    </div>
  );
}

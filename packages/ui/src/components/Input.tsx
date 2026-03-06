import type { InputHTMLAttributes, ReactNode } from 'react';

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  hint?: string;
  error?: string;
  prefix?: ReactNode;
  suffix?: ReactNode;
}

export function Input({
  label,
  hint,
  error,
  prefix,
  suffix,
  className = '',
  id,
  ...rest
}: InputProps) {
  const inputId = id ?? (label ? label.toLowerCase().replace(/\s+/g, '-') : undefined);
  const hasError = Boolean(error);

  return (
    <div className="ghost-field">
      {label && (
        <label htmlFor={inputId} className="ghost-label">
          {label}
        </label>
      )}
      <div className={`ghost-input-wrap${hasError ? ' error' : ''}`}>
        {prefix && <span className="ghost-input-adorn">{prefix}</span>}
        <input
          id={inputId}
          aria-invalid={hasError}
          aria-describedby={error ? `${inputId}-error` : hint ? `${inputId}-hint` : undefined}
          className={`ghost-input ${className}`.trim()}
          {...rest}
        />
        {suffix && <span className="ghost-input-adorn right">{suffix}</span>}
      </div>
      {error && (
        <p id={`${inputId}-error`} className="ghost-field-error" role="alert">
          {error}
        </p>
      )}
      {hint && !error && (
        <p id={`${inputId}-hint`} className="ghost-field-hint">
          {hint}
        </p>
      )}
    </div>
  );
}

'use client';

import { useEffect, useRef, type PropsWithChildren, type ReactNode } from 'react';

interface ModalProps extends PropsWithChildren {
  open: boolean;
  onClose: () => void;
  title?: ReactNode;
  footer?: ReactNode;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  className?: string;
}

const sizeMap = {
  sm:  '400px',
  md:  '560px',
  lg:  '720px',
  xl:  '960px',
} as const;

export function Modal({
  open,
  onClose,
  title,
  footer,
  size = 'md',
  className = '',
  children,
}: ModalProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const el = dialogRef.current;
    if (!el) return;
    if (open && !el.open) {
      el.showModal();
    } else if (!open && el.open) {
      el.close();
    }
  }, [open]);

  // Close on backdrop click
  const handleBackdrop = (e: React.MouseEvent<HTMLDialogElement>) => {
    if (e.target === dialogRef.current) onClose();
  };

  // Close on Escape (natively handled by <dialog> but we also call onClose so
  // controlled state stays in sync)
  const handleCancel = (e: React.SyntheticEvent) => {
    e.preventDefault();
    onClose();
  };

  return (
    <dialog
      ref={dialogRef}
      className={`ghost-modal ${className}`.trim()}
      style={{ maxWidth: sizeMap[size] }}
      onCancel={handleCancel}
      onClick={handleBackdrop}
      aria-modal="true"
      aria-labelledby={title ? 'ghost-modal-title' : undefined}
    >
      <div className="ghost-modal-inner" onClick={(e) => e.stopPropagation()}>
        {(title != null) && (
          <div className="ghost-modal-header">
            <h2 id="ghost-modal-title" className="ghost-modal-title">
              {title}
            </h2>
            <button
              type="button"
              className="ghost-modal-close"
              aria-label="Close modal"
              onClick={onClose}
            >
              ×
            </button>
          </div>
        )}
        <div className="ghost-modal-body">{children}</div>
        {footer && <div className="ghost-modal-footer">{footer}</div>}
      </div>
    </dialog>
  );
}

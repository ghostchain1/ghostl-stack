'use client';

import { useState } from 'react';

type CopyButtonProps = {
  value: string;
  label?: string;
  className?: string;
  title?: string;
};

export function CopyButton({ value, label = 'Copy', className = 'button secondary', title }: CopyButtonProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1200);
    } catch {
      const el = document.createElement('textarea');
      el.value = value;
      el.style.position = 'fixed';
      el.style.left = '-9999px';
      document.body.appendChild(el);
      el.focus();
      el.select();
      try {
        document.execCommand('copy');
        setCopied(true);
        window.setTimeout(() => setCopied(false), 1200);
      } finally {
        document.body.removeChild(el);
      }
    }
  };

  return (
    <button
      type="button"
      className={className}
      style={{ padding: '2px 8px' }}
      onClick={handleCopy}
      title={title || 'Copy address'}
    >
      {copied ? 'Copied' : label}
    </button>
  );
}

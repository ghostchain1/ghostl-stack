'use client';

import Link from 'next/link';
import { useState } from 'react';
import type { Realm } from '@/lib/realms';

type PortalDef = {
  realm: Realm;
  label: string;
  description: string;
  color: string;
  borderColor: string;
  bgColor: string;
  layerTag: string;
};

type Props = {
  portals: PortalDef[];
  returnTo: string | null;
};

const buildRealmLoginHref = (realm: Realm, returnTo: string | null) => {
  const params = new URLSearchParams({ realm });
  if (returnTo) params.set('returnTo', returnTo);
  return `/api/auth/realm-login?${params.toString()}`;
};

export function PortalCards({ portals, returnTo }: Props) {
  const [hovered, setHovered] = useState<Realm | null>(null);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {portals.map((portal) => {
        const isHovered = hovered === portal.realm;
        return (
          <Link
            key={portal.realm}
            href={buildRealmLoginHref(portal.realm, returnTo)}
            style={{
              display: 'block',
              padding: '14px 16px',
              borderRadius: 'var(--radius-md)',
              border: `1px solid ${portal.borderColor}`,
              background: portal.bgColor,
              textDecoration: 'none',
              transition: 'transform 0.15s ease, box-shadow 0.15s ease',
              transform: isHovered ? 'translateY(-2px)' : 'none',
              boxShadow: isHovered
                ? `0 8px 32px ${portal.bgColor.replace('0.08', '0.35')}`
                : 'none',
            }}
            onMouseEnter={() => setHovered(portal.realm)}
            onMouseLeave={() => setHovered(null)}
          >
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                marginBottom: 4,
              }}
            >
              <span
                style={{
                  fontFamily: 'var(--font-heading)',
                  fontSize: '0.92rem',
                  fontWeight: 700,
                  color: portal.color,
                }}
              >
                {portal.label}
              </span>
              <span
                style={{
                  fontFamily: 'var(--font-body)',
                  fontSize: '0.64rem',
                  fontWeight: 600,
                  letterSpacing: '0.14em',
                  textTransform: 'uppercase',
                  color: portal.color,
                  opacity: 0.75,
                  border: `1px solid ${portal.borderColor}`,
                  borderRadius: 999,
                  padding: '2px 8px',
                }}
              >
                {portal.layerTag}
              </span>
            </div>
            <p
              style={{
                fontFamily: 'var(--font-body)',
                fontSize: '0.8rem',
                color: 'var(--muted)',
                margin: 0,
                lineHeight: 1.45,
              }}
            >
              {portal.description}
            </p>
          </Link>
        );
      })}
    </div>
  );
}

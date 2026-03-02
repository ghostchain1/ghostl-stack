/**
 * GhostStack — Canonical Brand Tokens
 *
 * This file is the single source of truth for brand colors used across all
 * Node.js services, CLI output, logging, and any runtime that cannot use CSS.
 *
 * Matches BRAND_IDENTITY.md v1.0 exactly.
 */

export const BRAND = {
  name: 'GhostStack',
  tagline: 'Autonomy Secured.',
  positioning: 'AI-Governed Sovereign Multichain Infrastructure',

  colors: {
    phantomBlack:   '#0B0F14',
    spectralPurple: '#7A5CFF',
    ghostBlue:      '#00C2FF',
    neuralTeal:     '#00F0B5',
    sovereignGold:  '#C9A227',
    signalRed:      '#FF3B3B',
    ghostWhite:     '#E8EDF5',
    phantomMist:    '#8A9BB5',
  },

  layers: {
    l1: { name: 'GhostChain', role: 'Sovereign Settlement & Treasury',       color: '#C9A227' },
    l2: { name: 'GhostL2',    role: 'Liquidity & Exchange Layer',            color: '#7A5CFF' },
    l3: { name: 'GhostL3',    role: 'Utility & Application Layer',           color: '#00C2FF' },
    ai: { name: 'Hyper Ghost AI', role: 'Autonomous Governance & Orchestration', color: '#00F0B5' },
  },

  /** Routing law: L3 → L2 → L1. L3 → L1 direct is FORBIDDEN. */
  routingLaw: 'L3 → L2 → L1',

  taglines: {
    primary:    'Autonomy Secured.',
    secondary1: 'Intelligence at Consensus.',
    secondary2: 'Sovereign by Architecture.',
    secondary3: 'Governed by Code.',
    secondary4: 'The Chain That Thinks.',
    secondary5: 'Infrastructure for the Long Horizon.',
  },

  fonts: {
    display:  'Orbitron',
    heading:  'Sora',
    body:     'Inter',
    mono:     'JetBrains Mono',
  },
} as const;

export type LayerKey = keyof typeof BRAND.layers;
export type BrandColor = keyof typeof BRAND.colors;

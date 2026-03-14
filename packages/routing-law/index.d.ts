export type Layer = 'L1' | 'L2' | 'L3';

export declare const MAINCHAIN_IDS: Readonly<{ L1: 14000101; L2: 901; L3: 903 }>;
export declare const MAINCHAIN_NAMES: Readonly<{
  14000101: 'GhostChain';
  901: 'GhostL2';
  903: 'GhostL3';
}>;
export declare const MAINCHAIN_LAYERS: Readonly<{
  GhostChain: 'L1';
  GhostL2: 'L2';
  GhostL3: 'L3';
}>;

export declare const assertMainchain: (
  chainId: number | string
) => { ok: true; chainId: number; name: 'GhostChain' | 'GhostL2' | 'GhostL3'; layer: Layer };

export declare const normalizeLayer: (value: string | number) => Layer;

export declare const assertRoutingLaw: (input: {
  sourceLayer: string | number;
  targetLayer?: string | number | null;
  externalEgress?: boolean;
  intent?: string;
}) => { ok: true; source: Layer; target: string; transition: string };

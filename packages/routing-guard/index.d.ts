export type Layer = 'L1' | 'L2' | 'L3';
export type MainchainName = 'GhostChain' | 'GhostL2' | 'GhostL3';

export declare const layerFromNumeric: (value: string | number) => Layer;

export declare const assertRoutingTransition: (
  sourceLayer: string | number,
  targetLayer: string | number,
  opts?: { intent?: string }
) => { ok: true; source: Layer; target: Layer; transition: string };

export declare const assertExternalEgress: (
  sourceLayer: string | number
) => { ok: true; source: Layer; transition: string };

export declare const assertEndpointAllowlisted: (
  endpointUrl: string,
  allowlist?: string[]
) => { ok: true; endpoint: string; mode: 'open' | 'allowlist' };

export declare const assertMainchainId: (
  chainId: number | string
) => { ok: true; chainId: number; name: MainchainName };


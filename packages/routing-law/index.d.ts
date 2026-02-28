export type Layer = 'L1' | 'L2' | 'L3';

export declare const normalizeLayer: (value: string | number) => Layer;

export declare const assertRoutingLaw: (input: {
  sourceLayer: string | number;
  targetLayer?: string | number | null;
  externalEgress?: boolean;
  intent?: string;
}) => { ok: true; source: Layer; target: string; transition: string };

export type GhostSiteKey =
  | "main"
  | "investor"
  | "dev"
  | "apps"
  | "explorer"
  | "governance"
  | "nodes"
  | "exchange"
  | "company"
  | "status"
  | "portal"
  | "wallet"
  | "bridge"
  | "docs"
  | "live"
  | "ai"
  | "rpc";

export type GhostServiceKey =
  | "api"
  | "compliance"
  | "aiCore"
  | "pil"
  | "dnsIndexer"
  | "dnsResolver"
  | "prometheus"
  | "devops"
  | "ghostxApi"
  | "ghostxWs";

export type GhostDnsStatus = "healthy" | "degraded" | "offline";

export interface GhostSiteConfig {
  key: GhostSiteKey;
  label: string;
  siteName: string;
  domain: string;
  url: string;
  description: string;
  gnsEnabled: boolean;
}

export interface GhostRpcEndpointConfig {
  layer: "L1" | "L2" | "L3";
  chainId: number;
  publicUrl: string;
  localUrl: string;
  port: number;
  explorerUrl: string;
}

export interface GhostServiceConfig {
  publicUrl?: string;
  localUrl: string;
  internalUrl?: string;
}

export interface GhostDnsZone {
  domain: string;
  status: GhostDnsStatus;
  gnsEnabled: boolean;
  recordCount?: number;
  ttl?: number;
  lastChecked?: string;
}

export interface GhostFooterColumn {
  title: string;
  links: ReadonlyArray<{ label: string; href: string }>;
}

export interface GhostGnsConfig {
  label: string;
  shortLabel: string;
  registryPath: string;
  supportedLayers: ReadonlyArray<string>;
  tlds: ReadonlyArray<string>;
}

export declare const GHOST_SITES: Readonly<Record<GhostSiteKey, GhostSiteConfig>>;
export declare const GHOST_SITE_DIRECTORY: ReadonlyArray<GhostSiteConfig>;
export declare const GHOST_PUBLIC_NAV_LINKS: ReadonlyArray<{ label: string; href: string }>;
export declare const GHOST_PUBLIC_FOOTER_COLUMNS: ReadonlyArray<GhostFooterColumn>;
export declare const GHOST_RPC_ENDPOINTS: Readonly<{
  l1: GhostRpcEndpointConfig;
  l2: GhostRpcEndpointConfig;
  l3: GhostRpcEndpointConfig;
}>;
export declare const GHOST_SERVICES: Readonly<Record<GhostServiceKey, GhostServiceConfig>>;
export declare const GHOST_GNS: Readonly<GhostGnsConfig>;
export declare const GHOST_OWNED_DOMAINS: ReadonlyArray<GhostDnsZone>;
export declare const GHOST_DNS_ZONES: ReadonlyArray<GhostDnsZone>;

export declare function getGhostSite(siteKey: GhostSiteKey): GhostSiteConfig;
export declare function getGhostSiteUrl(siteKey: GhostSiteKey): string;
export declare function getGhostService(serviceKey: GhostServiceKey): GhostServiceConfig;
export declare function createPublicSiteEnv(
  siteKey: GhostSiteKey,
  env?: Record<string, string | undefined>,
  overrides?: Record<string, string | undefined>
): Record<string, string | undefined>;
export declare function createPublicSiteNextConfig(
  siteKey: GhostSiteKey,
  options?: Record<string, unknown> & { env?: Record<string, string | undefined> }
): Record<string, unknown>;

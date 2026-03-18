const GHOST_SITES = Object.freeze({
  main: Object.freeze({
    key: "main",
    label: "Main Site",
    siteName: "GhostChain",
    domain: "ghostchain.cloud",
    url: "https://ghostchain.cloud",
    description: "Network overview, architecture, and ecosystem entry point.",
    gnsEnabled: true,
  }),
  investor: Object.freeze({
    key: "investor",
    label: "Investor Portal",
    siteName: "GhostChain Investors",
    domain: "investor.ghostchain.cloud",
    url: "https://investor.ghostchain.cloud",
    description: "Treasury, tokenomics, and financial reporting.",
    gnsEnabled: true,
  }),
  dev: Object.freeze({
    key: "dev",
    label: "Developer Portal",
    siteName: "GhostChain Developers",
    domain: "dev.ghostchain.cloud",
    url: "https://dev.ghostchain.cloud",
    description: "SDKs, docs, RPC onboarding, and grants.",
    gnsEnabled: true,
  }),
  apps: Object.freeze({
    key: "apps",
    label: "Ecosystem Apps",
    siteName: "GhostChain Apps",
    domain: "apps.ghostchain.cloud",
    url: "https://apps.ghostchain.cloud",
    description: "Ghost-native app directory and launch surfaces.",
    gnsEnabled: true,
  }),
  explorer: Object.freeze({
    key: "explorer",
    label: "GhostScan",
    siteName: "GhostChain Explorer",
    domain: "explorer.ghostchain.cloud",
    url: "https://explorer.ghostchain.cloud",
    description: "L1, L2, and L3 transaction and contract exploration.",
    gnsEnabled: true,
  }),
  governance: Object.freeze({
    key: "governance",
    label: "Governance",
    siteName: "GhostChain Governance",
    domain: "governance.ghostchain.cloud",
    url: "https://governance.ghostchain.cloud",
    description: "DAO proposals, constitutional policy, and voting.",
    gnsEnabled: true,
  }),
  nodes: Object.freeze({
    key: "nodes",
    label: "Node Operators",
    siteName: "GhostChain Nodes",
    domain: "nodes.ghostchain.cloud",
    url: "https://nodes.ghostchain.cloud",
    description: "Validator setup, rewards, and network operations.",
    gnsEnabled: true,
  }),
  exchange: Object.freeze({
    key: "exchange",
    label: "GhostXchange",
    siteName: "GhostChain Exchange",
    domain: "exchange.ghostchain.cloud",
    url: "https://exchange.ghostchain.cloud",
    description: "Institutional OTC and exchange workflows.",
    gnsEnabled: true,
  }),
  company: Object.freeze({
    key: "company",
    label: "Company",
    siteName: "GhostChain Company",
    domain: "company.ghostchain.cloud",
    url: "https://company.ghostchain.cloud",
    description: "Press, careers, and company information.",
    gnsEnabled: true,
  }),
  status: Object.freeze({
    key: "status",
    label: "Status",
    siteName: "GhostChain Status",
    domain: "status.ghostchain.cloud",
    url: "https://status.ghostchain.cloud",
    description: "Network health, incidents, and uptime status.",
    gnsEnabled: true,
  }),
  portal: Object.freeze({
    key: "portal",
    label: "Portal",
    siteName: "GhostStack Portal",
    domain: "portal.ghostchain.cloud",
    url: "https://portal.ghostchain.cloud",
    description: "Unified GhostChain operations and service mesh portal.",
    gnsEnabled: true,
  }),
  wallet: Object.freeze({
    key: "wallet",
    label: "GhostWallet",
    siteName: "GhostWallet",
    domain: "wallet.ghostchain.cloud",
    url: "https://wallet.ghostchain.cloud",
    description: "Multi-layer GST wallet and GNS identity hub.",
    gnsEnabled: true,
  }),
  bridge: Object.freeze({
    key: "bridge",
    label: "Bridge",
    siteName: "GhostChain Bridge",
    domain: "bridge.ghostchain.cloud",
    url: "https://bridge.ghostchain.cloud",
    description: "Canonical L1 to L2 to L3 asset and message routing.",
    gnsEnabled: true,
  }),
  docs: Object.freeze({
    key: "docs",
    label: "Docs",
    siteName: "GhostChain Docs",
    domain: "docs.ghostchain.cloud",
    url: "https://docs.ghostchain.cloud",
    description: "Structured GhostChain documentation and guides.",
    gnsEnabled: true,
  }),
  live: Object.freeze({
    key: "live",
    label: "LitVyb Live",
    siteName: "LitVyb Live",
    domain: "apps.ghostchain.cloud",
    url: "https://apps.ghostchain.cloud/vyb",
    description: "Creator economy and live social surfaces for LitVyb Live.",
    gnsEnabled: true,
  }),
  ai: Object.freeze({
    key: "ai",
    label: "GhostBrain",
    siteName: "GhostBrain",
    domain: "ai.ghostchain.cloud",
    url: "https://ai.ghostchain.cloud",
    description: "AI monitoring, automation, and incident intelligence.",
    gnsEnabled: true,
  }),
  rpc: Object.freeze({
    key: "rpc",
    label: "RPC Portal",
    siteName: "GhostChain RPC Portal",
    domain: "rpc.ghostchain.cloud",
    url: "https://rpc.ghostchain.cloud",
    description: "Managed GhostChain RPC access and key management.",
    gnsEnabled: true,
  }),
});

const GHOST_SITE_DIRECTORY = Object.freeze([
  GHOST_SITES.main,
  GHOST_SITES.investor,
  GHOST_SITES.dev,
  GHOST_SITES.apps,
  GHOST_SITES.explorer,
  GHOST_SITES.governance,
  GHOST_SITES.nodes,
  GHOST_SITES.exchange,
  GHOST_SITES.company,
  GHOST_SITES.status,
  GHOST_SITES.portal,
  GHOST_SITES.wallet,
  GHOST_SITES.bridge,
  GHOST_SITES.docs,
  GHOST_SITES.live,
  GHOST_SITES.ai,
  GHOST_SITES.rpc,
]);

const GHOST_PUBLIC_NAV_LINKS = Object.freeze([
  Object.freeze({ label: "Technology", href: `${GHOST_SITES.main.url}/technology` }),
  Object.freeze({ label: "Ecosystem", href: `${GHOST_SITES.main.url}/ecosystem` }),
  Object.freeze({ label: "Developers", href: GHOST_SITES.dev.url }),
  Object.freeze({ label: "Investors", href: GHOST_SITES.investor.url }),
  Object.freeze({ label: "Portal", href: GHOST_SITES.portal.url }),
]);

const GHOST_PUBLIC_FOOTER_COLUMNS = Object.freeze([
  Object.freeze({
    title: "Platform",
    links: Object.freeze([
      Object.freeze({ label: "GhostChain L1", href: `${GHOST_SITES.main.url}/technology` }),
      Object.freeze({ label: "GhostL2", href: `${GHOST_SITES.main.url}/technology#l2` }),
      Object.freeze({ label: "GhostL3", href: `${GHOST_SITES.main.url}/technology#l3` }),
      Object.freeze({ label: "Tokenomics", href: `${GHOST_SITES.investor.url}/tokenomics` }),
    ]),
  }),
  Object.freeze({
    title: "Developers",
    links: Object.freeze([
      Object.freeze({ label: "Documentation", href: GHOST_SITES.docs.url }),
      Object.freeze({ label: "SDK", href: `${GHOST_SITES.dev.url}/docs/quickstart` }),
      Object.freeze({ label: "RPC Endpoints", href: GHOST_SITES.rpc.url }),
      Object.freeze({ label: "Grants", href: `${GHOST_SITES.dev.url}/grants` }),
    ]),
  }),
  Object.freeze({
    title: "Ecosystem",
    links: Object.freeze([
      Object.freeze({ label: "App Directory", href: GHOST_SITES.apps.url }),
      Object.freeze({ label: "GhostScan", href: GHOST_SITES.explorer.url }),
      Object.freeze({ label: "Governance", href: GHOST_SITES.governance.url }),
      Object.freeze({ label: "Node Operators", href: GHOST_SITES.nodes.url }),
    ]),
  }),
  Object.freeze({
    title: "Company",
    links: Object.freeze([
      Object.freeze({ label: "About", href: GHOST_SITES.company.url }),
      Object.freeze({ label: "Careers", href: `${GHOST_SITES.company.url}/careers` }),
      Object.freeze({ label: "Press", href: `${GHOST_SITES.company.url}/press` }),
      Object.freeze({ label: "Contact", href: `${GHOST_SITES.company.url}/contact` }),
    ]),
  }),
]);

const GHOST_RPC_ENDPOINTS = Object.freeze({
  l1: Object.freeze({
    layer: "L1",
    chainId: 14000101,
    publicUrl: "https://rpc.ghostchain.cloud",
    localUrl: "http://localhost:18545",
    port: 18545,
    explorerUrl: GHOST_SITES.explorer.url,
  }),
  l2: Object.freeze({
    layer: "L2",
    chainId: 901,
    publicUrl: "https://l2rpc.ghostchain.cloud",
    localUrl: "http://localhost:29547",
    port: 29547,
    explorerUrl: `${GHOST_SITES.explorer.url}?layer=2`,
  }),
  l3: Object.freeze({
    layer: "L3",
    chainId: 903,
    publicUrl: "https://l3rpc.ghostchain.cloud",
    localUrl: "http://localhost:39545",
    port: 39545,
    explorerUrl: `${GHOST_SITES.explorer.url}?layer=3`,
  }),
});

const GHOST_SERVICES = Object.freeze({
  api: Object.freeze({
    publicUrl: "https://api.ghostchain.cloud",
    localUrl: "http://localhost:4000",
    internalUrl: "http://ghostl-api:4000",
  }),
  compliance: Object.freeze({
    localUrl: "http://localhost:8090",
    internalUrl: "http://ghost-compliance:8090",
  }),
  aiCore: Object.freeze({
    localUrl: "http://localhost:3210",
    internalUrl: "http://ghost-gas-engine:3210",
  }),
  pil: Object.freeze({
    localUrl: "http://localhost:3220",
    internalUrl: "http://ghost-pil:3220",
  }),
  dnsIndexer: Object.freeze({
    localUrl: "http://localhost:7811",
    internalUrl: "http://ghostdns-indexer:7811",
  }),
  dnsResolver: Object.freeze({
    localUrl: "http://localhost:7812",
    internalUrl: "http://ghostdns-resolver:7812",
  }),
  prometheus: Object.freeze({
    localUrl: "http://localhost:9090",
  }),
  devops: Object.freeze({
    localUrl: "http://localhost:7623",
  }),
  ghostxApi: Object.freeze({
    localUrl: "http://localhost:4100",
    internalUrl: "http://ghostx-api:4100",
  }),
  ghostxWs: Object.freeze({
    localUrl: "ws://localhost:4100",
    internalUrl: "ws://ghostx-api:4100",
  }),
});

const GHOST_GNS = Object.freeze({
  label: "Ghost Name System",
  shortLabel: "GNS",
  registryPath: "contracts/src/gns/",
  supportedLayers: Object.freeze(["GhostChain L1", "GhostL2"]),
  tlds: Object.freeze([".ghost", ".ghostchain"]),
});

const GHOST_OWNED_DOMAINS = Object.freeze([
  Object.freeze({
    domain: "ghostchain.cloud",
    gnsEnabled: true,
    status: "healthy",
    label: "Canonical network",
    surface: "web-main",
    canonicalUrl: "https://ghostchain.cloud",
    description: "Primary GhostChain landing, ecosystem entry, and network overview.",
  }),
  Object.freeze({
    domain: "ghostchain.info",
    gnsEnabled: true,
    status: "healthy",
    label: "Knowledge base",
    surface: "web-docs",
    canonicalUrl: "https://docs.ghostchain.cloud",
    description: "Documentation, architecture briefs, and public network references.",
  }),
  Object.freeze({
    domain: "ghostchain.life",
    gnsEnabled: true,
    status: "healthy",
    label: "Creator economy",
    surface: "web-live",
    canonicalUrl: "https://ghostchain.live",
    description: "LitVyb Live social layer and GhostL3 creator monetization entry point.",
  }),
  Object.freeze({
    domain: "ghostchain.live",
    gnsEnabled: true,
    status: "healthy",
    label: "Broadcast network",
    surface: "web-live",
    canonicalUrl: "https://ghostchain.live",
    description: "Live streaming, events, and LitVyb-powered audience surfaces.",
  }),
  Object.freeze({
    domain: "ghostchain.online",
    gnsEnabled: true,
    status: "healthy",
    label: "Service manual",
    surface: "web-docs",
    canonicalUrl: "https://docs.ghostchain.cloud",
    description: "Operational docs, public service entry points, and online references.",
  }),
  Object.freeze({
    domain: "ghostchain.space",
    gnsEnabled: true,
    status: "healthy",
    label: "GhostBrain access",
    surface: "web-ai",
    canonicalUrl: "https://ai.ghostchain.cloud",
    description: "GhostBrain network intelligence, monitoring, and AI control surfaces.",
  }),
  Object.freeze({
    domain: "ghostchain.store",
    gnsEnabled: true,
    status: "healthy",
    label: "GST markets",
    surface: "web-exchange",
    canonicalUrl: "https://exchange.ghostchain.cloud",
    description: "GhostXchange market access, GST acquisition, and settlement workflows.",
  }),
  Object.freeze({
    domain: "ghostchain.world",
    gnsEnabled: true,
    status: "healthy",
    label: "Global network",
    surface: "web-main",
    canonicalUrl: "https://ghostchain.world",
    description: "Global validator footprint, regional routing, and world-scale GhostChain story.",
  }),
  Object.freeze({
    domain: "ghostchainlink.com",
    gnsEnabled: false,
    status: "healthy",
    label: "Bridge alias",
    surface: "web-bridge",
    canonicalUrl: "https://bridge.ghostchain.cloud",
    description: "Bridge and link layer for canonical GhostChain L1, L2, and L3 routing.",
  }),
  Object.freeze({
    domain: "ghostchainsolutions.com",
    gnsEnabled: false,
    status: "healthy",
    label: "Enterprise solutions",
    surface: "web-company",
    canonicalUrl: "https://company.ghostchain.cloud",
    description: "Enterprise services, sovereign rollout support, and branded infrastructure delivery.",
  }),
  Object.freeze({
    domain: "ghostschain.com",
    gnsEnabled: false,
    status: "healthy",
    label: "Defensive alias",
    surface: "web-bridge",
    canonicalUrl: "https://bridge.ghostchain.cloud",
    description: "GhostChain defensive alias that lands on the canonical bridge and link surface.",
  }),
]);

const GHOST_DNS_ZONES = Object.freeze(
  Array.from(
    [
      GHOST_SITES.main,
      GHOST_SITES.apps,
      GHOST_SITES.portal,
      GHOST_SITES.dev,
      GHOST_SITES.explorer,
      GHOST_SITES.governance,
      GHOST_SITES.nodes,
      GHOST_SITES.exchange,
      GHOST_SITES.company,
      GHOST_SITES.status,
      GHOST_SITES.wallet,
      GHOST_SITES.bridge,
      GHOST_SITES.docs,
      GHOST_SITES.live,
      GHOST_SITES.ai,
      GHOST_SITES.rpc,
      Object.freeze({ domain: "app.ghostchain.cloud", gnsEnabled: true, status: "healthy" }),
      Object.freeze({ domain: "admin.ghostchain.cloud", gnsEnabled: true, status: "healthy" }),
      Object.freeze({ domain: "validator.ghostchain.cloud", gnsEnabled: true, status: "healthy" }),
      Object.freeze({ domain: "l2rpc.ghostchain.cloud", gnsEnabled: true, status: "healthy" }),
      Object.freeze({ domain: "l3rpc.ghostchain.cloud", gnsEnabled: true, status: "healthy" }),
      ...GHOST_OWNED_DOMAINS,
    ].reduce((zones, site) => {
      const current =
        zones.get(site.domain) ||
        Object.freeze({
          domain: site.domain,
          status: site.status || "healthy",
          gnsEnabled: Boolean(site.gnsEnabled),
          recordCount: 0,
          ttl: 300,
        });
      zones.set(
        site.domain,
        Object.freeze({
          domain: site.domain,
          status: site.status || current.status || "healthy",
          gnsEnabled: current.gnsEnabled || Boolean(site.gnsEnabled),
          recordCount: current.recordCount + 1,
          ttl: 300,
        })
      );
      return zones;
    }, new Map()).values()
  ).sort((left, right) => left.domain.localeCompare(right.domain))
);

function getGhostSite(siteKey) {
  const site = GHOST_SITES[siteKey];
  if (!site) {
    throw new Error(`unknown_ghost_site:${String(siteKey)}`);
  }
  return site;
}

function getGhostSiteUrl(siteKey) {
  return getGhostSite(siteKey).url;
}

function getGhostService(serviceKey) {
  const service = GHOST_SERVICES[serviceKey];
  if (!service) {
    throw new Error(`unknown_ghost_service:${String(serviceKey)}`);
  }
  return service;
}

function createPublicSiteEnv(siteKey, env = process.env, overrides = {}) {
  const site = getGhostSite(siteKey);
  return {
    NEXT_PUBLIC_SITE_NAME: env.NEXT_PUBLIC_SITE_NAME || site.siteName,
    NEXT_PUBLIC_DOMAIN: env.NEXT_PUBLIC_DOMAIN || site.domain,
    NEXT_PUBLIC_API_URL: env.NEXT_PUBLIC_API_URL || GHOST_SERVICES.api.publicUrl,
    NEXT_PUBLIC_RPC_L1: env.NEXT_PUBLIC_RPC_L1 || GHOST_RPC_ENDPOINTS.l1.publicUrl,
    NEXT_PUBLIC_RPC_L2: env.NEXT_PUBLIC_RPC_L2 || GHOST_RPC_ENDPOINTS.l2.publicUrl,
    NEXT_PUBLIC_RPC_L3: env.NEXT_PUBLIC_RPC_L3 || GHOST_RPC_ENDPOINTS.l3.publicUrl,
    NEXT_PUBLIC_GHOSTSCAN_URL: env.NEXT_PUBLIC_GHOSTSCAN_URL || GHOST_SITES.explorer.url,
    NEXT_PUBLIC_GHOSTWALLET_URL: env.NEXT_PUBLIC_GHOSTWALLET_URL || GHOST_SITES.wallet.url,
    NEXT_PUBLIC_GHOSTBRIDGE_URL: env.NEXT_PUBLIC_GHOSTBRIDGE_URL || GHOST_SITES.bridge.url,
    NEXT_PUBLIC_GHOSTPORTAL_URL: env.NEXT_PUBLIC_GHOSTPORTAL_URL || GHOST_SITES.portal.url,
    NEXT_PUBLIC_GHOSTDOCS_URL: env.NEXT_PUBLIC_GHOSTDOCS_URL || GHOST_SITES.docs.url,
    NEXT_PUBLIC_GHOSTDNS_INDEXER_URL:
      env.NEXT_PUBLIC_GHOSTDNS_INDEXER_URL || GHOST_SERVICES.dnsIndexer.localUrl,
    NEXT_PUBLIC_GNS_TLDS: env.NEXT_PUBLIC_GNS_TLDS || GHOST_GNS.tlds.join(","),
    ...overrides,
  };
}

function createPublicSiteNextConfig(siteKey, options = {}) {
  const { env = {}, ...rest } = options;
  return {
    typescript: { ignoreBuildErrors: true },
    reactStrictMode: true,
    output: "standalone",
    ...rest,
    env: {
      ...createPublicSiteEnv(siteKey, process.env, env),
    },
  };
}

module.exports = {
  GHOST_SITES,
  GHOST_SITE_DIRECTORY,
  GHOST_PUBLIC_NAV_LINKS,
  GHOST_PUBLIC_FOOTER_COLUMNS,
  GHOST_RPC_ENDPOINTS,
  GHOST_SERVICES,
  GHOST_GNS,
  GHOST_OWNED_DOMAINS,
  GHOST_DNS_ZONES,
  getGhostSite,
  getGhostSiteUrl,
  getGhostService,
  createPublicSiteEnv,
  createPublicSiteNextConfig,
};

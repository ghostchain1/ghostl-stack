import config = require("./index.js");

export const GHOST_SITES = config.GHOST_SITES;
export const GHOST_SITE_DIRECTORY = config.GHOST_SITE_DIRECTORY;
export const GHOST_PUBLIC_NAV_LINKS = config.GHOST_PUBLIC_NAV_LINKS;
export const GHOST_PUBLIC_FOOTER_COLUMNS = config.GHOST_PUBLIC_FOOTER_COLUMNS;
export const GHOST_RPC_ENDPOINTS = config.GHOST_RPC_ENDPOINTS;
export const GHOST_SERVICES = config.GHOST_SERVICES;
export const GHOST_GNS = config.GHOST_GNS;
export const GHOST_OWNED_DOMAINS = config.GHOST_OWNED_DOMAINS;
export const GHOST_DNS_ZONES = config.GHOST_DNS_ZONES;
export const getGhostSite = config.getGhostSite;
export const getGhostSiteUrl = config.getGhostSiteUrl;
export const getGhostService = config.getGhostService;
export const createPublicSiteEnv = config.createPublicSiteEnv;
export const createPublicSiteNextConfig = config.createPublicSiteNextConfig;

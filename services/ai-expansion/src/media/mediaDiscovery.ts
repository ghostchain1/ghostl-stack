/**
 * MediaDiscovery — identifies crypto media outlets for press outreach.
 */

import logger from "../utils/logger";

export interface MediaOutlet {
  id:         string;
  name:       string;
  type:       "news" | "magazine" | "podcast" | "youtube" | "newsletter";
  audience:   number;
  cryptoFocus: number; // 0-100
  status:     "identified" | "pitched" | "published";
}

const MEDIA: MediaOutlet[] = [
  { id: "med-001", name: "CoinDesk",         type: "news",       audience: 8_000_000,  cryptoFocus: 100, status: "pitched" },
  { id: "med-002", name: "CoinTelegraph",     type: "news",       audience: 6_500_000,  cryptoFocus: 100, status: "pitched" },
  { id: "med-003", name: "Decrypt",           type: "news",       audience: 3_000_000,  cryptoFocus: 95,  status: "identified" },
  { id: "med-004", name: "The Block",         type: "news",       audience: 2_500_000,  cryptoFocus: 98,  status: "identified" },
  { id: "med-005", name: "Bankless",          type: "podcast",    audience: 800_000,    cryptoFocus: 100, status: "published" },
  { id: "med-006", name: "Unchained Podcast", type: "podcast",    audience: 600_000,    cryptoFocus: 95,  status: "pitched" },
  { id: "med-007", name: "TechCrunch",        type: "magazine",   audience: 12_000_000, cryptoFocus: 30,  status: "identified" },
  { id: "med-008", name: "Forbes Crypto",     type: "magazine",   audience: 15_000_000, cryptoFocus: 50,  status: "identified" },
];

export async function discoverMedia(): Promise<MediaOutlet[]> {
  logger.info("MediaDiscovery: scanning media landscape");
  return [...MEDIA].sort((a, b) => (b.audience * b.cryptoFocus) - (a.audience * a.cryptoFocus));
}

export function getAllMedia(): MediaOutlet[] {
  return MEDIA;
}

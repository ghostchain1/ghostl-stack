/**
 * ProjectDiscovery — finds Web3 projects candidate for GhostChain migration.
 */

import logger from "../utils/logger";

export interface Web3Project {
  id:            string;
  name:          string;
  category:      string;
  currentChain:  string;
  tvl:           number;  // USD
  users:         number;
  githubStars:   number;
  innovScore:    number; // 0-100
  migrationFit:  number; // 0-100
  status:        "discovered" | "contacted" | "onboarding" | "live";
}

const PROJECTS: Web3Project[] = [
  { id: "proj-001", name: "SwiftSwap",    category: "DEX",      currentChain: "GhostL2",    tvl: 8_500_000,  users: 12000, githubStars: 340,  innovScore: 72, migrationFit: 88, status: "discovered" },
  { id: "proj-002", name: "VaultDAO",     category: "Yield",    currentChain: "GhostL3",    tvl: 24_000_000, users: 5500,  githubStars: 820,  innovScore: 85, migrationFit: 91, status: "discovered" },
  { id: "proj-003", name: "NftLaunch",    category: "NFT",      currentChain: "GhostChain", tvl: 1_200_000,  users: 38000, githubStars: 1100, innovScore: 68, migrationFit: 75, status: "discovered" },
  { id: "proj-004", name: "ChainPay",     category: "Payments", currentChain: "GhostL2",    tvl: 6_000_000,  users: 22000, githubStars: 290,  innovScore: 80, migrationFit: 85, status: "contacted" },
  { id: "proj-005", name: "GammaFi",      category: "GameFi",   currentChain: "GhostL3",    tvl: 3_400_000,  users: 45000, githubStars: 560,  innovScore: 90, migrationFit: 92, status: "contacted" },
  { id: "proj-006", name: "SocialMint",   category: "SocialFi", currentChain: "GhostChain", tvl: 800_000,    users: 9000,  githubStars: 210,  innovScore: 88, migrationFit: 80, status: "onboarding" },
];

export async function findProjects(minTvl = 500_000): Promise<Web3Project[]> {
  logger.info("ProjectDiscovery: scanning Web3 project landscape");
  return PROJECTS
    .filter(p => p.tvl >= minTvl)
    .sort((a, b) => (b.migrationFit * b.innovScore) - (a.migrationFit * a.innovScore));
}

export function getAllProjects(): Web3Project[] {
  return PROJECTS;
}

export function updateProjectStatus(id: string, status: Web3Project["status"]): void {
  const p = PROJECTS.find(p => p.id === id);
  if (p) p.status = status;
}

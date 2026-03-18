/**
 * DevScanner — finds developers on GitHub building with Solidity/EVM.
 * In production queries GitHub REST API. Simulates results when token absent.
 */

import axios from "axios";
import logger from "../utils/logger";

export interface Developer {
  id:        string;
  username:  string;
  name:      string;
  email?:    string;
  chain:     string; // current chain focus
  followers: number;
  stars:     number;
  repos:     number;
  languages: string[];
  score:     number;
  contacted: boolean;
}

const SYNTHETIC_DEVS: Developer[] = [
  { id: "dev-001", username: "ghostDexter", name: "Dexter Hayes",   chain: "GhostChain", followers: 520, stars: 1200, repos: 34, languages: ["Solidity", "TypeScript"], score: 0, contacted: false },
  { id: "dev-002", username: "ghostMesh",   name: "Maya Cortez",    chain: "GhostL2",    followers: 340, stars: 890,  repos: 28, languages: ["Solidity", "Rust"],       score: 0, contacted: false },
  { id: "dev-003", username: "ghostRollup", name: "Tom Krishnamur", chain: "GhostL3",    followers: 780, stars: 2100, repos: 51, languages: ["Solidity", "Go"],         score: 0, contacted: false },
  { id: "dev-004", username: "ghostFlow",   name: "Nina Park",      chain: "GhostChain", followers: 210, stars: 450,  repos: 19, languages: ["Rust", "TypeScript"],     score: 0, contacted: false },
  { id: "dev-005", username: "ghostScale",  name: "Jake Brennan",   chain: "GhostL2",    followers: 630, stars: 3400, repos: 67, languages: ["Solidity", "Python"],     score: 0, contacted: false },
  { id: "dev-006", username: "ghostProof",  name: "Asel Nurlan",    chain: "GhostL3",    followers: 920, stars: 5100, repos: 82, languages: ["Cairo", "Solidity"],      score: 0, contacted: false },
  { id: "dev-007", username: "ghostBuilder",name: "Liam O'Brien",   chain: "GhostChain", followers: 440, stars: 1600, repos: 44, languages: ["Solidity", "TypeScript"], score: 0, contacted: false },
];

function scoredev(d: Developer): number {
  return Math.round((d.followers * 0.5) + (d.stars * 0.3) + (d.repos * 2));
}

export async function scanDevelopers(language = "solidity", minFollowers = 100): Promise<Developer[]> {
  logger.info(`DevScanner: scanning GitHub for ${language} devs`);

  // In production: GET https://api.github.com/search/users?q=language:${language}&followers:>${minFollowers}
  const githubToken = process.env.GITHUB_TOKEN;
  if (githubToken) {
    try {
      const { data } = await axios.get(`https://api.github.com/search/users`, {
        params: { q: `language:${language} followers:>${minFollowers}`, per_page: 30 },
        headers: { Authorization: `Bearer ${githubToken}`, "User-Agent": "GhostChain-Adoption-AI" },
        timeout: 8_000,
      });
      return (data.items ?? []).slice(0, 20).map((u: any, i: number) => ({
        id:        `gh-${u.id}`,
        username:  u.login,
        name:      u.login,
        chain:     "EVM",
        followers: u.followers ?? 0,
        stars:     0,
        repos:     u.public_repos ?? 0,
        languages: [language],
        score:     0,
        contacted: false,
      }));
    } catch (err: any) {
      logger.warn("DevScanner: GitHub API error, using synthetic data", { err: err?.message });
    }
  }

  return SYNTHETIC_DEVS
    .filter(d => d.followers >= minFollowers)
    .map(d => ({ ...d, score: scoredev(d) }))
    .sort((a, b) => b.score - a.score);
}

export function getAllDevs(): Developer[] {
  return SYNTHETIC_DEVS.map(d => ({ ...d, score: scoredev(d) }));
}

export function markContacted(id: string): void {
  const dev = SYNTHETIC_DEVS.find(d => d.id === id);
  if (dev) dev.contacted = true;
}

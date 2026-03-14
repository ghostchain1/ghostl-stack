/**
 * Strategist Agent — drives ecosystem growth strategy, partnership formation,
 * market expansion decisions, and long-horizon planning across all GhostChain layers.
 */

import logger from "../utils/logger";
import { updateAgentStatus, recordDecision } from "../registry/agentRegistry";
import { sendMessage } from "../communication/agentBus";

const ID   = "strategist-agent";
const pick = <T>(arr: T[]): T => arr[Math.floor(Math.random() * arr.length)]!;
const rand = (a: number, b: number) => Math.floor(Math.random() * (b - a + 1)) + a;

type StrategyFocus = "partnerships" | "market-expansion" | "developer-ecosystem" | "treasury" | "community";

type StratDecision = {
  action:    string;
  reasoning: string;
  impact:    "low" | "medium" | "high" | "critical";
  outcome:   string;
  notify?:   { to: string; subject: string; content: string };
};

let partnershipsFormed  = 8;
let marketsEntered      = 3;
let incentivePools      = 2;
let communityActivities = 22;

function chooseFocus(): StrategyFocus {
  const options: StrategyFocus[] = [
    "partnerships", "partnerships",
    "market-expansion",
    "developer-ecosystem", "developer-ecosystem",
    "treasury",
    "community",
  ];
  return pick(options);
}

function decide(focus: StrategyFocus): StratDecision {
  if (focus === "partnerships") {
    partnershipsFormed++;
    const partner = pick([
      "Chainlink", "The Graph", "LayerZero", "Axelar", "Wormhole",
      "Uniswap Foundation", "Aave DAO", "Synthetix", "Curve Finance",
    ]);
    return {
      action:    `Partnership initiative: ${partner}`,
      reasoning: pick([
        `${partner} integration would add oracle/data access to GhostDeFi suite`,
        `Strategic alignment with ${partner} expands cross-chain liquidity by est. ${rand(15, 45)}%`,
        `${partner} community overlap ~${rand(20, 60)}K wallets; co-marketing opportunity`,
        `${partner} grant program open; GhostChain qualifies — applying for $${rand(50, 200)}K`,
      ]),
      impact:    "high",
      outcome:   `Partnership #{partnershipsFormed} initiated with ${partner}; MOU drafted; joint announcement in ${rand(7, 21)} days`,
      notify: {
        to:      "marketing-agent",
        subject: `New partnership: ${partner} — prepare announcement`,
        content: `Strategist has initiated a partnership with ${partner}. Marketing: please prepare co-branded announcement assets and coordinate with ${partner}'s comms team for joint release.`,
      },
    };
  }

  if (focus === "market-expansion") {
    marketsEntered++;
    const market = pick(["Southeast Asia", "Latin America", "Eastern Europe", "Sub-Saharan Africa", "South Korea", "Japan", "Middle East"]);
    return {
      action:    `Market expansion: ${market}`,
      reasoning: pick([
        `${market} crypto adoption growing ${rand(28, 65)}% YoY; low GhostChain brand presence`,
        `Regulatory clarity emerging in ${market}; first-mover opportunity`,
        `${market} developer community active in Solidity; low migration cost`,
        `${market} stablecoin demand high; GhostDeFi suite directly addressable`,
      ]),
      impact:    "high",
      outcome:   `${market} expansion plan #${marketsEntered} approved; localisation budget $${rand(20, 80)}K allocated; launch target Q${rand(2, 4)}`,
    };
  }

  if (focus === "developer-ecosystem") {
    incentivePools++;
    const amount = rand(100, 500);
    return {
      action:    pick([
        "Launch developer incentive program",
        "Expand grants programme",
        "Create hackathon series",
        "Developer retention initiative",
      ]),
      reasoning: pick([
        `Active developer count stagnant for ${rand(2, 6)} weeks; incentive needed`,
        `Competitor chain offering $${rand(300, 800)}K grants; matching required to retain talent`,
        "Hackathon ROI: past event generated ${rand(4, 12)} production dApps",
        "Monthly active devs (MAD) metric below 90-day target",
      ]),
      impact:    "high",
      outcome:   `$${amount}K developer incentive pool #${incentivePools} created; estimated +${rand(20, 80)} new projects`,
      notify: {
        to:      "growth-agent",
        subject: `New developer incentive pool — $${amount}K`,
        content: `Strategist approved a $${amount}K developer incentive pool. Growth agent: please activate recruitment campaigns targeting Solidity + Rust developers and route applicants to the grants portal.`,
      },
    };
  }

  if (focus === "treasury") {
    const allocation = rand(50, 400);
    return {
      action:    pick([
        "Strategic treasury allocation",
        "Revenue diversification decision",
        "Long-term reserve strategy",
        "Ecosystem fund reallocation",
      ]),
      reasoning: pick([
        "Treasury concentration in native token >90%; diversification required",
        "Protocol revenue sufficient to fund ${rand(6, 18)} months of operations without emission",
        "Strategic reserve ratio below industry benchmark (8% vs 15% target)",
        "Yield opportunity on idle treasury: ${rand(4, 9)}% APY in low-risk instruments",
      ]),
      impact:    "medium",
      outcome:   `$${allocation}K reallocated per strategy brief; treasury health score improved by ${rand(3, 12)}%`,
    };
  }

  // community
  communityActivities++;
  return {
    action:    pick([
      "Community engagement initiative",
      "Ambassador programme expansion",
      "Governance participation drive",
      "Community feedback synthesis",
    ]),
    reasoning: pick([
      "Community sentiment score dipped to ${rand(60, 75)}%; engagement needed",
      "Ambassador programme ROI: ${rand(3, 8)}× reach vs. paid marketing at same budget",
      "Governance participation rate ${rand(12, 28)}%; below 35% target",
      "Quarterly community survey: ${rand(800, 2400)} responses analysed; 3 priority themes identified",
    ]),
    impact:    "medium",
    outcome:   `Initiative #${communityActivities} launched; estimated reach ${rand(5, 25)}K community members; sentiment target ${rand(80, 90)}%`,
  };
}

export function runStrategistAgent(): void {
  updateAgentStatus(ID, "running", "Evaluating strategic opportunities and ecosystem growth vectors");
  try {
    const focus    = chooseFocus();
    const decision = decide(focus);

    recordDecision(ID, decision.action, decision.reasoning, decision.impact, decision.outcome);

    if (decision.notify) {
      sendMessage(ID, decision.notify.to, "command", decision.notify.subject, decision.notify.content);
    }

    logger.info(`[StrategistAgent] ${decision.action} [focus=${focus}] (${decision.impact})`);
  } catch (err) {
    logger.error(`[StrategistAgent] Error: ${err}`);
    updateAgentStatus(ID, "error");
    return;
  }
  updateAgentStatus(ID, "idle");
}

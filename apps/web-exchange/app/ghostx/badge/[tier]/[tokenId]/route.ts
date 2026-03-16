import { NextResponse } from "next/server";

const TIER_STYLES = {
  bronze: {
    label: "Bronze",
    accent: "#b98150",
    glow: "#f6c698",
    benefit: "10% trading fee discount",
  },
  silver: {
    label: "Silver",
    accent: "#aeb8c3",
    glow: "#eef2f7",
    benefit: "20% trading fee discount",
  },
  gold: {
    label: "Gold",
    accent: "#eab308",
    glow: "#fde68a",
    benefit: "35% trading fee discount",
  },
  diamond: {
    label: "Diamond",
    accent: "#60a5fa",
    glow: "#bfdbfe",
    benefit: "50% trading fee discount",
  },
} as const;

function buildBadgeSvg(tier: keyof typeof TIER_STYLES, tokenId: string) {
  const style = TIER_STYLES[tier];
  return `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1200 1200" role="img" aria-label="GhostXchange ${style.label} badge">
  <defs>
    <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#020617" />
      <stop offset="100%" stop-color="#111827" />
    </linearGradient>
    <radialGradient id="halo" cx="50%" cy="35%" r="50%">
      <stop offset="0%" stop-color="${style.glow}" stop-opacity="0.92" />
      <stop offset="100%" stop-color="${style.glow}" stop-opacity="0" />
    </radialGradient>
  </defs>
  <rect width="1200" height="1200" rx="64" fill="url(#bg)" />
  <circle cx="600" cy="420" r="280" fill="url(#halo)" />
  <rect x="150" y="150" width="900" height="900" rx="48" fill="none" stroke="${style.accent}" stroke-width="10" />
  <rect x="250" y="220" width="700" height="700" rx="36" fill="#0f172a" stroke="${style.accent}" stroke-width="4" />
  <text x="600" y="360" text-anchor="middle" fill="#94a3b8" font-size="42" font-family="Arial, sans-serif" letter-spacing="10">GHOSTXCHANGE</text>
  <text x="600" y="510" text-anchor="middle" fill="${style.accent}" font-size="132" font-weight="700" font-family="Arial, sans-serif">${style.label.toUpperCase()}</text>
  <text x="600" y="610" text-anchor="middle" fill="#e2e8f0" font-size="48" font-family="Arial, sans-serif">Soulbound Liquidity Badge</text>
  <text x="600" y="740" text-anchor="middle" fill="#cbd5e1" font-size="38" font-family="Arial, sans-serif">${style.benefit}</text>
  <text x="600" y="860" text-anchor="middle" fill="#64748b" font-size="34" font-family="Arial, sans-serif">Token #${tokenId}</text>
</svg>`.trim();
}

function asDataUri(svg: string) {
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

export async function GET(
  _req: Request,
  context: { params: Promise<{ tier: string; tokenId: string }> }
) {
  const { tier, tokenId } = await context.params;
  const normalizedTier = tier.toLowerCase() as keyof typeof TIER_STYLES;
  const style = TIER_STYLES[normalizedTier];

  if (!style || !/^\d+$/.test(tokenId)) {
    return NextResponse.json({ error: "badge_not_found" }, { status: 404 });
  }

  const svg = buildBadgeSvg(normalizedTier, tokenId);

  return NextResponse.json(
    {
      name: `GhostXchange ${style.label} Badge #${tokenId}`,
      description:
        "GhostXchange soulbound membership badge for GST staking and exchange fee discounts on GhostChain.",
      external_url: "https://exchange.ghostchain.cloud",
      image: asDataUri(svg),
      image_data: svg,
      attributes: [
        { trait_type: "Protocol", value: "GhostXchange" },
        { trait_type: "Tier", value: style.label },
        { trait_type: "Utility", value: style.benefit },
        { trait_type: "Transferability", value: "Soulbound" },
        { trait_type: "Gas Token", value: "GST" },
      ],
    },
    {
      headers: {
        "Cache-Control": "public, max-age=300, s-maxage=300, stale-while-revalidate=86400",
      },
    }
  );
}

# GhostChain Brand Guidelines

This directory is the single source of truth for all GhostStack visual and
verbal identity assets.  Any project that surfaces UI to an end-user **must**
reference these assets rather than embedding its own copies.

---

## 1. Name & Terminology

| Context | Correct usage |
|---|---|
| Protocol / stack | **GhostChain** |
| Native token (full) | **Ghost** |
| Native token (ticker) | **GST** |
| Fungible token standard | **GRC-20** (wire-compatible with ERC-20) |
| NFT standard | **GRC-721** (wire-compatible with ERC-721) |
| Multi-token standard | **GRC-1155** |
| Interface detection | **GST-165** (selector identical to ERC-165) |
| L1 deposit portal | **GhostPortal** (contract: `L1GhostPortal`) |
| L2 sequencer | **GhostSequencer** |
| Name service | **GNS** (Ghost Name Service) |
| DEX / exchange | **GhostX** |

### Forbidden terms in user-facing strings
- `ETH`, `Ether`, `Ethereum` — use **GST** / **Ghost** / **GhostChain**
- `Optimism`, `OP Stack` — use **GhostChain L2** or **GhostStack**
- `ERC-20`, `ERC-721`, `ERC-1155` — use the **GRC-** equivalents
- `WETH` — use **WGST** (Wrapped Ghost)
- `MetaMask` — use **GhostWallet**

> **Bridge / interop exception**: When describing cross-chain transfers to or
> from external EVM networks (chain ID 1, 10, 137, …) it is acceptable to use
> the external network's canonical name in parentheses for clarity, e.g.
> "Bridge from Ethereum (chain 1)".

---

## 2. Colors

```css
/* Primary palette */
--ghost-violet:      #7B2FBE;   /* primary CTA, headings */
--ghost-violet-dark: #4A1880;   /* hover, active states  */
--ghost-teal:        #00D2FF;   /* accent, highlights    */
--ghost-teal-dark:   #008EAB;   /* secondary accent      */

/* Neutrals */
--ghost-bg:          #0A0B0F;   /* page background       */
--ghost-surface:     #13141A;   /* card / panel surface  */
--ghost-border:      #252733;   /* borders, dividers     */
--ghost-text:        #E8E9F0;   /* primary text          */
--ghost-muted:       #7A7D95;   /* secondary / caption   */

/* Semantic */
--ghost-success:     #22C55E;
--ghost-warning:     #F59E0B;
--ghost-error:       #EF4444;
```

---

## 3. Typography

| Role | Typeface | Weight |
|---|---|---|
| Display / headings | **Syne** | 700, 800 |
| Body / UI text | **Inter** | 400, 500 |
| Monospace / code | **JetBrains Mono** | 400 |

Font files should be self-hosted under `branding/fonts/` once licensed copies
are obtained.  Use `@font-face` with `font-display: swap`.

---

## 4. Logo Files

> **TODO**: Drop final SVG/PNG exports here.

| File | Description |
|---|---|
| `logos/ghost-wordmark.svg` | Full wordmark (name + icon), dark background |
| `logos/ghost-wordmark-light.svg` | Full wordmark, light background |
| `logos/ghost-icon.svg` | Icon-only mark (favicons, app icons) |
| `logos/ghost-icon-mono.svg` | Monochrome variant for embossing |

Logo clear-space: minimum `0.5×` icon-height on all sides.

---

## 5. CSS Variables — Usage in Apps

Import the theme via the `theme-service` package:

```ts
import "@ghostchain/theme-service/dist/tokens.css";
```

Then in Tailwind / CSS-in-JS:

```css
color: var(--ghost-violet);
background: var(--ghost-bg);
```

---

## 6. Automated Brand Enforcement

The `packages/brand-enforcer` package provides CI-ready linting:

```bash
# Run in a pre-commit hook or CI step
pnpm --filter brand-enforcer brand-check ./src
```

Rules enforced:
- No forbidden token names in metadata surfaces
- No raw `chainId === 1` without `// ghost-chainid-ignore`
- No `MetaMask` strings in UI components
- No `window.ethereum` reference without GhostWallet wrapper

---

## 7. TODO

- [ ] Finalise and export SVG logo files
- [ ] Obtain licensed font files (Syne, Inter, JetBrains Mono) and add to `fonts/`
- [ ] Publish `@ghostchain/theme-service` CSS token file as versioned npm package
- [ ] Add brand-check step to root CI pipeline (`.github/workflows/ci.yml`)
- [ ] Add Figma library link once design assets are published

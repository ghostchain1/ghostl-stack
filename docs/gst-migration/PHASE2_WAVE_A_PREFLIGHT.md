# Phase 2 Wave A Preflight (Docs/UI)

Captured at: `2026-02-06T09:35:31Z`
Branch: `brand/gst-native`
Base SHA: `c91580b89769b1e2e2cd1d65300c51671bbc769f`

## Scope

Wave A targets **docs + UI strings** (plus small tracked report artifacts) to remove ETH/Ethereum/Ether branding.

## Preflight scan commands

```bash
# Docs-only (excluding docs/gst-migration)
git grep -n -P "\\bETH\\b|Ethereum|\\bEther\\b|Ξ|\\bethereum\\b|\\bether\\b" c91580b8 -- docs | rg -v '^c91580b8:docs/gst-migration/' | wc -l
git grep -n -P "\\.eth\\b" c91580b8 -- docs | rg -v '^c91580b8:docs/gst-migration/' | wc -l

# Whole repo (tracked; filtered exclusions)
git grep -n -P "\\bETH\\b|Ethereum|\\bEther\\b|Ξ|\\bethereum\\b|\\bether\\b" c91580b8 -- . | rg -v '^c91580b8:(docs/gst-migration/|contracts/lib/|infra/opstack/optimism-upstream/|infra/opstack/op-geth/)' | wc -l
```

## Preflight results (before this wave)

- Docs forbidden-token matches (excluding `docs/gst-migration/**`): `37`
- Docs `.eth` matches (excluding `docs/gst-migration/**`): `58`
- Repo forbidden-token matches (tracked; filtered exclusions): `238`

## Postflight results

- Docs forbidden-token matches (excluding `docs/gst-migration/**`): `0`
- Docs `.eth` matches (excluding `docs/gst-migration/**`): `58`
- Repo forbidden-token matches (tracked; filtered exclusions): `179`

// Package types defines constants and types for the x/aiconsensus module.
//
// GhostChain runs a two-layer consensus:
//
//  1. CometBFT BFT consensus — the standard 2/3 + 1 validator agreement.
//  2. AI Consensus layer — each validator extends their CometBFT vote with a
//     Brain AI confidence score for the proposed block.  Proposals that fail
//     to accumulate sufficient AI confidence are rejected during
//     ProcessProposal, acting as an additional safety gate.
//
// Vote extensions carry a signed AIVoteExtension proto blob.  The aggregated
// scores are written into the first transaction of every block (injected by
// the proposer) so that on-chain logic can query the AI consensus history.
package types

const (
	ModuleName = "aiconsensus"
	StoreKey   = ModuleName

	// DefaultMinAIScore is the minimum weighted-average AI score (0–100) that
	// a block must achieve before it is finalised.  Configurable via params.
	DefaultMinAIScore = uint32(60)

	// DefaultBrainURL is the fallback URL for the Brain AI service.  Override
	// via the app.toml [aiconsensus] section or GHOST_BRAIN_URL env var.
	DefaultBrainURL = "http://localhost:3000"

	// VoteExtensionKey is the store key prefix for persisted vote extensions.
	VoteExtensionKey = "vext/"
	// ParamsKey is the store key for module params.
	ParamsKey = "p"
)

// AIScore is the 0–100 confidence score returned by the Brain AI for a block.
// 0 = certain rejection; 100 = certain acceptance.
type AIScore = uint32

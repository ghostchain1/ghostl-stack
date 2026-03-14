// Package types — AIVoteExtension is the payload validators attach to their
// CometBFT extended pre-commit votes.  It is JSON-encoded so that the Brain
// AI service can also consume it for correlation.
package types

import "fmt"

// AIVoteExtension is carried in every validator's CometBFT vote extension.
// The proposer aggregates extensions from the previous height and embeds the
// result in the first "injected" transaction of the new block.
type AIVoteExtension struct {
	// Height of the block being scored.
	Height int64 `json:"height"`
	// Score is the Brain AI confidence score (0–100) for this block.
	Score AIScore `json:"score"`
	// Reason is a short human-readable justification from the AI (optional).
	Reason string `json:"reason,omitempty"`
}

// AIBlockResult is written to state by the proposer for each finalised block.
type AIBlockResult struct {
	// Height of the block.
	Height int64 `json:"height"`
	// WeightedScore is the validator-power-weighted average AI score.
	WeightedScore AIScore `json:"weighted_score"`
	// NumVotes is the number of vote extensions that were included.
	NumVotes int `json:"num_votes"`
	// Accepted reports whether the block cleared the minimum AI threshold.
	Accepted bool `json:"accepted"`
}

func (r AIBlockResult) String() string {
	return fmt.Sprintf("height=%d score=%d votes=%d accepted=%v",
		r.Height, r.WeightedScore, r.NumVotes, r.Accepted)
}

// Params holds module-level configuration.
type Params struct {
	// MinAIScore is the minimum weighted-average score (0–100) required to
	// accept a block.  Defaults to DefaultMinAIScore.
	MinAIScore AIScore `json:"min_ai_score"`
	// BrainURL is the HTTP base URL of the Brain AI service.
	BrainURL string `json:"brain_url"`
	// Enabled controls whether AI consensus scoring is enforced.  When false
	// the module records scores but never rejects a block.
	Enabled bool `json:"enabled"`
}

func DefaultParams() Params {
	return Params{
		MinAIScore: DefaultMinAIScore,
		BrainURL:   DefaultBrainURL,
		Enabled:    true,
	}
}

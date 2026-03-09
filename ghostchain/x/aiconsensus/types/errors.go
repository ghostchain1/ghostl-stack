package types

import errorsmod "cosmossdk.io/errors"

var (
	ErrBrainUnavailable = errorsmod.Register(ModuleName, 1, "Brain AI service is unavailable")
	ErrScoreTooLow      = errorsmod.Register(ModuleName, 2, "aggregated AI score is below the minimum threshold")
	ErrInvalidExtension = errorsmod.Register(ModuleName, 3, "AI vote extension is malformed")
)

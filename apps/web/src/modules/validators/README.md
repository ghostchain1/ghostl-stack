# Validator & Consensus Module

Pages
- Validators (active/jailed/slashed)
- Validator Detail (missed blocks, rewards)
- Voting Power Distribution
- Finality & Participation

Services
- ValidatorService
- StakingService
- RewardsService
- ParticipationService

Data models
- Validator { id, address, status, stake, commission, power }
- SlashEvent { validatorId, reason, amount, time }

Components
- ValidatorsTable
- ValidatorDetailCard
- VotingPowerChart
- ParticipationPanel

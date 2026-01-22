# Governance & DAO Module

Pages
- Proposals
- Vote Tracking / Quorum
- Execution Queue
- Delegation

Services
- GovernanceService
- VotingAnalyticsService
- ExecutionQueueService

Data models
- Proposal { id, title, status, quorum, votesFor, votesAgainst }
- Vote { proposalId, voter, weight, choice }

Components
- ProposalsList
- VoteTracking
- ExecutionQueue
- DelegationPanel

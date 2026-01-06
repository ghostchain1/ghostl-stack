# Tokenomics & Treasury Module

Pages
- Supply Dashboard
- Fee Market & Gas Settings (admin)
- Treasury Overview
- Payouts & Distributions
- Revenue (bridge fees, protocol income)

Services
- SupplyService
- FeeModelService
- TreasuryService
- PayoutService

Data models
- SupplySnapshot { total, circulating, burned, minted, time }
- TreasuryTx { id, to, amount, purpose, approvals[] }

Components
- SupplyDashboard
- FeeMarketCard
- TreasuryOverview
- PayoutsPanel
- RevenuePanel

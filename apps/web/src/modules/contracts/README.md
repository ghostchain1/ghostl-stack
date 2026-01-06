# Smart Contracts & VM Module

Pages
- Contracts Registry
- Contract Detail (ABI, source, proxy)
- Admin Controls (pause/roles)
- Execution Analytics (gas, failures)

Services
- ContractRegistryService
- VerificationService
- ProxyInspectorService
- ContractRiskService

Data models
- Contract { address, name, abi, verified, proxyType, owner }
- ContractCallStats { calls, avgGas, reverts, timeRange }

Components
- ContractsRegistry
- ContractDetailCard
- AdminControls
- ExecutionAnalytics

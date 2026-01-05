# App Shell Module

Pages / Components
- AppLayout (sidebar, topbar, network switcher)
- GlobalSearch (tx/hash/address/contract)
- CommandPalette (quick actions)
- NotificationsCenter

Services
- FeatureFlagsService (feature gating + overrides)
- NetworkContextService (current chain/env + persistence)
- ThemeService (light/dark toggle + persistence)
- AppShellProvider (wraps layout with the above providers)

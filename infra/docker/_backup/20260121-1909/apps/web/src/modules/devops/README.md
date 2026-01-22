# DevOps & Upgrades Module

Pages
- Release Planner
- Hard Fork Scheduler
- Feature Flags
- Upgrade Jobs
- Rollback History

Services
- ReleaseService
- ForkSchedulerService
- UpgradeJobService
- RollbackService

Data models
- Release { version, components[], status, startedAt }
- ForkEvent { name, activationHeight, checklist[] }

Components
- ReleasePlanner
- ForkScheduler
- FeatureFlagsPanel
- UpgradeJobs
- RollbackHistory

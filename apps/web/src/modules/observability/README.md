# Monitoring, Logs & Alerts Module

Pages
- Metrics (Prometheus)
- Dashboards (Grafana embed)
- Logs (searchable)
- Alerts & Routing (Slack/Discord/Webhooks)

Services
- MetricsService
- LogsService
- AlertRulesService
- NotificationRouterService

Data models
- Alert { id, severity, source, state, firedAt, resolvedAt }
- LogEvent { source, level, message, time, labels }

Components
- MetricsPanel
- DashboardsPanel
- LogsViewer
- AlertsPanel
- NotificationRouter

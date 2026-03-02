# GhostStack Production Startup — Master TODO

## Status: IN PROGRESS

---

## Phase 1: Dependency Installation & Environment Setup
- [ ] 1. Install all npm workspace dependencies
- [ ] 2. Create `.env.local` for API with required env vars
- [ ] 3. Fix `apps/api/scripts/start-prod.cjs` entry path bug
- [ ] 4. Create `apps/web/.env.local` with required Next.js env vars

## Phase 2: Build
- [ ] 5. Build API (TypeScript → dist/)
- [ ] 6. Build Web (Next.js → .next-ghost/)
- [ ] 7. Build Worker (TypeScript → dist/)

## Phase 3: Infrastructure (Docker)
- [ ] 8. Start compliance infrastructure (postgres + redis) via docker-compose.yml
- [ ] 9. Verify docker services healthy

## Phase 4: Start Production Stack
- [ ] 10. Start API server (port 4000)
- [ ] 11. Start Worker (port 4100)
- [ ] 12. Start Web (port 3200)
- [ ] 13. Smoke test all endpoints

## Phase 5: Verification
- [ ] 14. Verify /health endpoint
- [ ] 15. Verify web app loads
- [ ] 16. Verify worker heartbeat

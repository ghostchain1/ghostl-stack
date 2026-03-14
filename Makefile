# GhostStack Makefile — convenience shortcuts

DOCKER_DIR     := infrastructure/docker
MONITORING_DIR := infrastructure/monitoring
SCRIPTS_DIR    := scripts

DEPLOY_DIR     := deployment

.PHONY: up down ghostbrain-up ghostbrain-down \
        monitoring-up monitoring-down validators-up \
        health logs clean bootstrap ps \
        deploy stop status deploy-logs \
        deploy-only-data-mesh deploy-only-ghostbrain deploy-only-validators \
        deploy-only-monitoring deploy-only-ai-engines deploy-only-web

## ── Full stack ─────────────────────────────────────────────────

up:
	docker compose -f $(DOCKER_DIR)/ghostbrain-stack.yml up -d
	docker compose -f $(DOCKER_DIR)/validator-stack.yml  up -d
	docker compose -f $(DOCKER_DIR)/data-mesh-stack.yml  up -d
	docker compose -f $(DOCKER_DIR)/monitoring-stack.yml up -d
	@echo "GhostStack started"

down:
	docker compose -f $(DOCKER_DIR)/monitoring-stack.yml down
	docker compose -f $(DOCKER_DIR)/data-mesh-stack.yml  down
	docker compose -f $(DOCKER_DIR)/validator-stack.yml  down
	docker compose -f $(DOCKER_DIR)/ghostbrain-stack.yml down
	@echo "GhostStack stopped"

## ── GhostBrain only ────────────────────────────────────────────

ghostbrain-up:
	docker compose -f $(DOCKER_DIR)/ghostbrain-stack.yml up -d

ghostbrain-down:
	docker compose -f $(DOCKER_DIR)/ghostbrain-stack.yml down

ghostbrain-restart:
	docker compose -f $(DOCKER_DIR)/ghostbrain-stack.yml restart

ghostbrain-logs:
	docker compose -f $(DOCKER_DIR)/ghostbrain-stack.yml logs -f --tail=50

## ── Monitoring ─────────────────────────────────────────────────

monitoring-up:
	docker compose -f $(DOCKER_DIR)/monitoring-stack.yml up -d

monitoring-down:
	docker compose -f $(DOCKER_DIR)/monitoring-stack.yml down

## ── Validators ─────────────────────────────────────────────────

validators-up:
	docker compose -f $(DOCKER_DIR)/validator-stack.yml up -d

validators-down:
	docker compose -f $(DOCKER_DIR)/validator-stack.yml down

## ── Operations ─────────────────────────────────────────────────

health:
	@$(SCRIPTS_DIR)/maintenance/health-check.sh

ps:
	docker compose -f $(DOCKER_DIR)/ghostbrain-stack.yml ps
	docker compose -f $(DOCKER_DIR)/validator-stack.yml  ps
	docker compose -f $(DOCKER_DIR)/monitoring-stack.yml ps

logs:
	docker compose -f $(DOCKER_DIR)/ghostbrain-stack.yml logs -f --tail=30

clean:
	docker compose -f $(DOCKER_DIR)/ghostbrain-stack.yml down -v --remove-orphans
	docker compose -f $(DOCKER_DIR)/validator-stack.yml  down -v --remove-orphans
	docker compose -f $(DOCKER_DIR)/monitoring-stack.yml down -v --remove-orphans
	@echo "All volumes removed"

## ── Bootstrap ──────────────────────────────────────────────────

bootstrap:
	@$(SCRIPTS_DIR)/deploy/bootstrap.sh

build-images:
	docker compose -f $(DOCKER_DIR)/ghostbrain-stack.yml build --parallel

pull:
	docker compose -f $(DOCKER_DIR)/ghostbrain-stack.yml pull
	docker compose -f $(DOCKER_DIR)/monitoring-stack.yml pull

## ── Dashboard ──────────────────────────────────────────────────

web-dev:
	cd apps/web && npm run dev

web-build:
	cd apps/web && npm run build

web-start:
	cd apps/web && npm run start
## ── AI Marketing Ecosystem ─────────────────────────────────────

ai-marketing-up:
        docker compose -f $(DOCKER_DIR)/ai-marketing-stack.yml up -d --build
        @echo "AI Marketing Ecosystem started (ports 9970-9974)"

ai-marketing-down:
        docker compose -f $(DOCKER_DIR)/ai-marketing-stack.yml down

ai-marketing-logs:
        docker compose -f $(DOCKER_DIR)/ai-marketing-stack.yml logs -f --tail=50

ai-marketing-build:
        docker compose -f $(DOCKER_DIR)/ai-marketing-stack.yml build --parallel

ai-marketing-restart:
        docker compose -f $(DOCKER_DIR)/ai-marketing-stack.yml restart

## ── AI Services dev (no Docker) ────────────────────────────────

aims-dev:
        cd services/ai-marketing && npm run dev

vge-dev:
        cd services/ai-growth && npm run dev

aae-dev:
        cd services/ai-adoption && npm run dev

gee-dev:
        cd services/ai-expansion && npm run dev

aee-dev:
        cd services/ai-economy && npm run dev

aie-dev:
        cd services/ai-infrastructure && npm run dev

ase-dev:
	cd services/ai-security && npm run dev

gie-dev:
	cd services/ai-intelligence && npm run dev

age-dev:
	cd services/ai-governance && npm run dev

giex-dev:
	cd services/ai-interchain && npm run dev

gaan-dev:
	cd services/ai-agents && npm run dev

ade-dev:
	cd services/ai-development && npm run dev

evo-dev:
	cd services/ai-evolution && npm run dev

pne-dev:
	cd services/ai-planetary && npm run dev

ine-dev:
	cd services/ai-interplanetary && npm run dev

hcl-dev:
	cd services/ai-hypervisor && npm run dev

are-dev:
	cd services/ai-revenue && npm run dev

aiops-dev:
	cd services/ai-operations && npm run dev

aiops-install:
	cd services/ai-operations && npm install

aiops-build:
	cd services/ai-operations && npm run build

cognitive-dev:
	cd services/ai-cognitive && npm run dev

cognitive-install:
	cd services/ai-cognitive && npm install

cognitive-build:
	cd services/ai-cognitive && npm run build

c3-dev:
	cd apps/control-center && npm run dev

c3-install:
	cd apps/control-center && npm install

c3-build:
	cd apps/control-center && npm run build

ai-install:
	cd services/ai-marketing      && npm install
	cd services/ai-growth         && npm install
	cd services/ai-adoption       && npm install
	cd services/ai-expansion      && npm install
	cd services/ai-economy        && npm install
	cd services/ai-infrastructure && npm install
	cd services/ai-security       && npm install
	cd services/ai-intelligence   && npm install
	cd services/ai-governance     && npm install
	cd services/ai-interchain     && npm install
	cd services/ai-agents         && npm install
	cd services/ai-development    && npm install
	cd services/ai-evolution      && npm install
	cd services/ai-planetary      && npm install
	cd services/ai-interplanetary && npm install
	cd services/ai-hypervisor  && npm install
	cd services/ai-revenue     && npm install
	cd services/ai-operations  && npm install
	cd services/ai-cognitive   && npm install
	cd apps/control-center     && npm install

ai-build:
	cd services/ai-marketing      && npm run build
	cd services/ai-growth         && npm run build
	cd services/ai-adoption       && npm run build
	cd services/ai-expansion      && npm run build
	cd services/ai-economy        && npm run build
	cd services/ai-infrastructure && npm run build
	cd services/ai-security       && npm run build
	cd services/ai-intelligence   && npm run build
	cd services/ai-governance     && npm run build
	cd services/ai-interchain     && npm run build
	cd services/ai-agents         && npm run build
	cd services/ai-development    && npm run build
	cd services/ai-evolution      && npm run build
	cd services/ai-planetary      && npm run build
	cd services/ai-interplanetary && npm run build
	cd services/ai-hypervisor  && npm run build
	cd services/ai-revenue     && npm run build
	cd services/ai-operations  && npm run build
	cd services/ai-cognitive   && npm run build
	cd apps/control-center     && npm run build

## ── Master Deployment Blueprint (MDB) ─────────────────────────

deploy:
	@bash $(DEPLOY_DIR)/deploy.sh

deploy-fast:
	@bash $(DEPLOY_DIR)/deploy.sh --skip-preflight --skip-build

stop:
	@bash $(DEPLOY_DIR)/scripts/stop-all.sh

stop-clean:
	@bash $(DEPLOY_DIR)/scripts/stop-all.sh --volumes

status:
	@bash $(DEPLOY_DIR)/scripts/status.sh

deploy-logs:
	@bash $(DEPLOY_DIR)/scripts/logs.sh

deploy-only-data-mesh:
	@bash $(DEPLOY_DIR)/deploy.sh --skip-preflight --only data-mesh

deploy-only-ghostbrain:
	@bash $(DEPLOY_DIR)/deploy.sh --skip-preflight --only ghostbrain

deploy-only-validators:
	@bash $(DEPLOY_DIR)/deploy.sh --skip-preflight --only validators

deploy-only-monitoring:
	@bash $(DEPLOY_DIR)/deploy.sh --skip-preflight --only monitoring

deploy-only-ai-engines:
	@bash $(DEPLOY_DIR)/deploy.sh --skip-preflight --only ai-engines

deploy-only-web:
	@bash $(DEPLOY_DIR)/deploy.sh --skip-preflight --only web
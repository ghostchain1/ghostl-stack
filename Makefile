# GhostStack Makefile — convenience shortcuts

DOCKER_DIR     := infrastructure/docker
MONITORING_DIR := infrastructure/monitoring
SCRIPTS_DIR    := scripts

.PHONY: up down ghostbrain-up ghostbrain-down \
        monitoring-up monitoring-down validators-up \
        health logs clean bootstrap ps

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

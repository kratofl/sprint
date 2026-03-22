# Sprint — Sim Racing Telemetry Platform
# ──────────────────────────────────────────────────────────────────────────────
# Usage: make <target>
# Run `make help` to list all available targets.

.PHONY: help dev-api dev-web build-api build-web build-app build \
        test test-api test-pkg lint fmt \
        docker-build docker-up docker-down docker-logs \
        clean

BINARY_DIR := bin
API_BINARY := $(BINARY_DIR)/sprint-api
APP_DIR    := app

# ─── Help ─────────────────────────────────────────────────────────────────────

help: ## Show this help message
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | \
		awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[36m%-18s\033[0m %s\n", $$1, $$2}' | \
		sort
	@echo ""

# ─── Development ──────────────────────────────────────────────────────────────

dev-api: ## Run the API server locally (hot-reload with go run)
	go run ./api

dev-web: ## Run the Next.js web app in dev mode
	pnpm --filter @sprint/web dev

# ─── Build ────────────────────────────────────────────────────────────────────

$(BINARY_DIR):
	mkdir -p $(BINARY_DIR)

build-api: $(BINARY_DIR) ## Build the API server binary → bin/sprint-api
	go build -trimpath -ldflags="-s -w" -o $(API_BINARY) ./api

build-web: ## Build the Next.js web app (production)
	pnpm --filter @sprint/web build

build-app: ## Build the Wails desktop app (requires Wails CLI)
	cd $(APP_DIR) && wails build -clean

build: build-api build-web ## Build all (API + web)

# ─── Test ─────────────────────────────────────────────────────────────────────

test: test-api test-pkg ## Run all Go tests

test-api: ## Run API server tests
	go test ./api/...

test-pkg: ## Run shared package tests
	go test ./pkg/...

# ─── Lint & Format ────────────────────────────────────────────────────────────

lint: ## Run Go vet on api/pkg and pnpm lint
	go vet ./api/... ./pkg/...
	pnpm lint

lint-app: ## Run Go vet on the Wails app (requires built frontend: make build-web first)
	cd app && go vet ./...

fmt: ## Format Go code and TS/JS code
	gofmt -w ./api ./pkg ./app
	pnpm format

# ─── Docker ───────────────────────────────────────────────────────────────────

docker-build: ## Build all Docker images
	docker compose build

docker-up: ## Start all services in the background
	docker compose up -d

docker-down: ## Stop and remove containers
	docker compose down

docker-logs: ## Tail logs from all running services
	docker compose logs -f

# ─── Clean ────────────────────────────────────────────────────────────────────

clean: ## Remove build artifacts
	rm -rf $(BINARY_DIR)/
	rm -rf web/.next/
	rm -rf app/build/
	rm -rf app/frontend/dist/

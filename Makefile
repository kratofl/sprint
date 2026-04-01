# Sprint — Sim Racing Telemetry Platform
# Usage: make <target>
# Run `make help` to list all available targets.

.PHONY: help setup dev-app dev-api dev-web build-api build-web build-app build \
        test test-api test-pkg lint fmt \
        docker-build docker-up docker-down docker-logs \
        clean

BINARY_DIR := bin
API_BINARY := $(BINARY_DIR)/sprint-api
APP_DIR    := app

# Version: read from the most recent git tag (strips leading "v").
# Override with: make build-app VERSION=1.2.3
# Extract version from the most recent git tag, stripping the leading "v".
# Uses Make's built-in patsubst for cross-platform compatibility (no sed/tr).
# Override with: make build-api VERSION=1.2.3
_RAW_VERSION := $(shell git describe --tags --abbrev=0 2>/dev/null || echo "dev")
VERSION ?= $(patsubst v%,%,$(_RAW_VERSION))

# Prevent Go from hitting sum.golang.org for private modules in this workspace.
# Can also be set permanently: go env -w GONOSUMDB=github.com/kratofl/*
export GONOSUMDB := github.com/kratofl/*
export GONOPROXY := github.com/kratofl/*

# ─── Help ─────────────────────────────────────────────────────────────────────

help: ## Show this help message
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | \
		awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[36m%-18s\033[0m %s\n", $$1, $$2}' | \
		sort
	@echo ""

# ─── Setup ────────────────────────────────────────────────────────────────────

setup: ## One-time dev setup: configure Go env for private modules
	go env -w GONOSUMDB=github.com/kratofl/*
	go env -w GONOPROXY=github.com/kratofl/*
	@echo "✓ Go env configured for private modules"

# ─── Development ──────────────────────────────────────────────────────────────

dev-app: ## Run the Wails desktop app in dev mode
	cd $(APP_DIR) && GONOSUMDB=github.com/kratofl/* GONOPROXY=github.com/kratofl/* wails dev

dev-api: ## Run the API server locally (hot-reload with go run)
	go run ./api

dev-web: ## Run the Next.js web app in dev mode
	pnpm --filter @sprint/web dev

# ─── Build ────────────────────────────────────────────────────────────────────

$(BINARY_DIR):
	mkdir -p $(BINARY_DIR)

build-api: $(BINARY_DIR) ## Build the API server binary → bin/sprint-api
	go build -trimpath -ldflags="-s -w -X main.Version=$(VERSION)" -o $(API_BINARY) ./api

build-web: ## Build the Next.js web app (production)
	pnpm --filter @sprint/web build

build-app: ## Build the Wails desktop app (requires Wails CLI)
	cd $(APP_DIR) && wails build -clean -ldflags "-X main.Version=$(VERSION)"

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

# Sprint — Sim Racing Telemetry Platform
# Usage: make <target>
# Run `make help` to list all available targets.

.PHONY: help setup dev-app dev-api dev-web build-api build-web build-app build-installer icons build \
        test test-api test-pkg lint fmt \
        docker-build docker-up docker-down docker-logs \
        clean

SHELL = powershell.exe
.SHELLFLAGS = -NoProfile -Command

BINARY_DIR := bin
API_BINARY := $(BINARY_DIR)/sprint-api
APP_DIR    := app

# Version: read from the most recent git tag (strips leading "v").
# Override with: make build-app VERSION=1.2.3
_RAW_VERSION := $(shell git describe --tags --abbrev=0 2>$$null; if ($$LASTEXITCODE) { 'dev' })
VERSION ?= $(patsubst v%,%,$(_RAW_VERSION))

# Prevent Go from hitting sum.golang.org for private modules in this workspace.
# Can also be set permanently: go env -w GONOSUMDB=github.com/kratofl/*
export GONOSUMDB := github.com/kratofl/*
export GONOPROXY := github.com/kratofl/*

# ─── Help ─────────────────────────────────────────────────────────────────────

help: ## Show this help message
	Select-String -Path Makefile -Pattern '^[a-zA-Z_-]+:.*?## ' | ForEach-Object { if ($$_.Line -match '^([a-zA-Z_-]+):.*?## (.*)') { '  {0,-18} {1}' -f $$Matches[1], $$Matches[2] } } | Sort-Object

# ─── Setup ────────────────────────────────────────────────────────────────────

setup: ## One-time dev setup: configure Go env for private modules
	go env -w GONOSUMDB=github.com/kratofl/*
	go env -w GONOPROXY=github.com/kratofl/*
	Write-Host 'Go env configured for private modules'

# ─── Development ──────────────────────────────────────────────────────────────

dev-app: ## Run the Wails desktop app in dev mode
	$$env:GONOSUMDB = 'github.com/kratofl/*'; $$env:GONOPROXY = 'github.com/kratofl/*'; Set-Location $(APP_DIR); wails dev

dev-api: ## Run the API server locally (hot-reload with go run)
	go run ./api

dev-web: ## Run the Next.js web app in dev mode
	pnpm --filter @sprint/web dev

# ─── Build ────────────────────────────────────────────────────────────────────

$(BINARY_DIR):
	New-Item -ItemType Directory -Force -Path '$(BINARY_DIR)' | Out-Null

build-api: $(BINARY_DIR) ## Build the API server binary → bin/sprint-api
	go build -trimpath -ldflags "-s -w -X main.Version=$(VERSION)" -o $(API_BINARY) ./api

build-web: ## Build the Next.js web app (production)
	pnpm --filter @sprint/web build

icons: ## Generate app/build icons from app/frontend/src/assets/sprint_logo_icon.png
	Set-Location $(APP_DIR); go run ./cmd/genicons

build-app: icons ## Build the Wails desktop app (requires Wails CLI)
	Set-Location $(APP_DIR); wails build -clean -ldflags "-X main.Version=$(VERSION)"
	New-Item -ItemType Directory -Force -Path 'app/build/bin/DeviceCatalog' | Out-Null
	Copy-Item -Path 'app/presets/devices/*.json' -Destination 'app/build/bin/DeviceCatalog/'
	Copy-Item -Path 'app/presets/dash/default.json' -Destination 'app/build/bin/DefaultDash.json'

build-installer: build-app ## Build Windows NSIS installer → app/build/bin/Sprint-amd64-installer.exe
	Set-Location 'app/build/windows/installer'; makensis -DVERSION=$(VERSION) project.nsi

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
	Set-Location app; go vet ./...

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
	Remove-Item -Recurse -Force -ErrorAction SilentlyContinue '$(BINARY_DIR)', 'web/.next', 'app/build/bin', 'app/frontend/dist'

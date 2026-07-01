# Sprint — Sim Racing Telemetry Platform
# Usage: make <target>
# Run `make help` to list all available targets.

.PHONY: help setup dev-app dev-api dev-web build-api build-web build-app build \
        test test-api test-pkg test-app lint lint-app fmt \
        docker-build docker-up docker-down docker-logs \
        clean

SHELL = powershell.exe
.SHELLFLAGS = -NoProfile -Command

BINARY_DIR := bin
API_BINARY := $(BINARY_DIR)/sprint-api
APP_DIR    := app
APP_SOLUTION := $(APP_DIR)/Sprint.Desktop.sln
APP_CLIENT_PROJECT := $(APP_DIR)/Sprint.Desktop.Client/Sprint.Desktop.Client.csproj
APP_TEST_PROJECT := $(APP_DIR)/Sprint.Desktop.Tests/Sprint.Desktop.Tests.csproj

# Version: read from the most recent git tag (strips leading "v").
# Override with: make build-app VERSION=1.2.3
_RAW_VERSION := $(shell $$tag = git describe --tags --abbrev=0 2>&1; if ($$LASTEXITCODE -eq 0) { $$tag.Trim() } else { 'dev' })
VERSION ?= $(patsubst v%,%,$(_RAW_VERSION))

# ─── Help─────────────────────────────────────────────────────────────────────

help: ## Show this help message
	Select-String -Path Makefile -Pattern '^[a-zA-Z_-]+:.*?## ' | ForEach-Object { if ($$_.Line -match '^([a-zA-Z_-]+):.*?## (.*)') { '  {0,-18} {1}' -f $$Matches[1], $$Matches[2] } } | Sort-Object

# ─── Setup ────────────────────────────────────────────────────────────────────

setup: ## Restore project dependencies
	dotnet restore $(APP_SOLUTION)
	pnpm install
	Write-Host 'Setup complete'

# ─── Development ──────────────────────────────────────────────────────────────

dev-app: ## Run the Avalonia desktop app in dev mode
	dotnet run --project $(APP_CLIENT_PROJECT)

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

build-app: ## Publish the Avalonia desktop app -> app/build/bin
	dotnet publish $(APP_CLIENT_PROJECT) -c Release -r win-x64 --self-contained false -p:InformationalVersion=$(VERSION) -o $(APP_DIR)/build/bin

build: build-api build-web ## Build all (API + web)

# ─── Test ─────────────────────────────────────────────────────────────────────

test: test-api test-pkg test-app ## Run API, shared Go, and desktop tests

test-api: ## Run API server tests
	go test ./api/...

test-pkg: ## Run shared package tests
	go test ./pkg/...

test-app: ## Run Avalonia desktop tests (xunit)
	dotnet test $(APP_TEST_PROJECT)

# ─── Lint & Format ────────────────────────────────────────────────────────────

lint: ## Run Go vet on api/pkg and pnpm lint
	go vet ./api/... ./pkg/...
	pnpm lint

lint-app: ## Build the Avalonia desktop app with warnings enabled
	dotnet build $(APP_SOLUTION) -warnaserror

fmt: ## Format Go, C#, and TS/JS code
	gofmt -w ./api ./pkg
	dotnet format $(APP_SOLUTION)
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
	Remove-Item -Recurse -Force -ErrorAction SilentlyContinue '$(BINARY_DIR)', 'web/.next', 'app/build/bin', 'app/Sprint.Desktop.Client/bin', 'app/Sprint.Desktop.Client/obj', 'app/Sprint.Desktop.Api/bin', 'app/Sprint.Desktop.Api/obj', 'app/Sprint.Games/bin', 'app/Sprint.Games/obj', 'app/Sprint.Desktop.Tests/bin', 'app/Sprint.Desktop.Tests/obj'

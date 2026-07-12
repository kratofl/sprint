# Sprint — Sim Racing Telemetry Platform
# Usage: make <target>
# Run `make help` to list all available targets.

.PHONY: help setup dev-app dev-api dev-web build-api build-web build-app build \
        test test-api test-app lint lint-app lint-api fmt schema \
        docker-build docker-up docker-down docker-logs \
        clean

SHELL = powershell.exe
.SHELLFLAGS = -NoProfile -Command

APP_DIR    := app
APP_SOLUTION := $(APP_DIR)/Sprint.Desktop.slnx
APP_CLIENT_PROJECT := $(APP_DIR)/Sprint.Desktop.Client/Sprint.Desktop.Client.csproj
APP_TEST_PROJECT := $(APP_DIR)/Sprint.Desktop.Tests/Sprint.Desktop.Tests.csproj
API_DIR    := api
API_SOLUTION := $(API_DIR)/Sprint.Api.slnx
API_PROJECT := $(API_DIR)/Sprint.Api/Sprint.Api.csproj
API_TEST_PROJECT := $(API_DIR)/Sprint.Api.Tests/Sprint.Api.Tests.csproj

# Publish runtime identifier. Override for Linux: make build-app RID=linux-x64
RID ?= win-x64

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
	dotnet restore $(API_SOLUTION)
	pnpm install
	Write-Host 'Setup complete'

# ─── Development ──────────────────────────────────────────────────────────────

dev-app: ## Run the Avalonia desktop app in dev mode
	dotnet watch --project $(APP_CLIENT_PROJECT)

dev-api: ## Run the API server locally (hot-reload)
	dotnet watch --project $(API_PROJECT)

dev-web: ## Run the Next.js web app in dev mode
	pnpm --filter @sprint/web dev

schema: ## Export the GraphQL schema → web/schema.graphql (for web codegen)
	dotnet run --project $(API_PROJECT) -- export-schema ../../web/schema.graphql

# ─── Build ────────────────────────────────────────────────────────────────────

build-api: ## Publish the API server → api/build/bin
	dotnet publish $(API_PROJECT) -c Release -p:InformationalVersion=$(VERSION) -o $(API_DIR)/build/bin

build-web: ## Build the Next.js web app (production)
	pnpm --filter @sprint/web build

build-app: ## Publish a lightweight self-contained desktop binary -> app/build/bin (RID=win-x64|linux-x64)
	dotnet publish $(APP_CLIENT_PROJECT) -c Release -r $(RID) -p:PublishSingleFile=true -p:InformationalVersion=$(VERSION) -o $(APP_DIR)/build/bin

build: build-api build-web ## Build all (API + web)

# ─── Test ─────────────────────────────────────────────────────────────────────

test: test-api test-app ## Run API and desktop tests

test-api: ## Run API server tests (xunit)
	dotnet test $(API_TEST_PROJECT)

test-app: ## Run Avalonia desktop tests (xunit)
	dotnet test $(APP_TEST_PROJECT)

# ─── Lint & Format ────────────────────────────────────────────────────────────

lint: ## Build the API solution with warnings as errors and run pnpm lint
	dotnet build $(API_SOLUTION) -warnaserror
	pnpm lint

lint-app: ## Build the Avalonia desktop app with warnings enabled
	dotnet build $(APP_SOLUTION) -warnaserror

lint-api: ## Build the API solution with warnings as errors
	dotnet build $(API_SOLUTION) -warnaserror

fmt: ## Format C# and TS/JS code
	dotnet format $(APP_SOLUTION)
	dotnet format $(API_SOLUTION)
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
	Remove-Item -Recurse -Force -ErrorAction SilentlyContinue 'web/.next', 'app/build/bin', 'api/build/bin', 'app/Sprint.Desktop.Client/bin', 'app/Sprint.Desktop.Client/obj', 'app/Sprint.Desktop.Api/bin', 'app/Sprint.Desktop.Api/obj', 'app/Sprint.Contracts/bin', 'app/Sprint.Contracts/obj', 'app/Sprint.Games/bin', 'app/Sprint.Games/obj', 'app/Sprint.Desktop.Tests/bin', 'app/Sprint.Desktop.Tests/obj', 'api/Sprint.Api/bin', 'api/Sprint.Api/obj', 'api/Sprint.Api.Tests/bin', 'api/Sprint.Api.Tests/obj'

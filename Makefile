# Sprint — Sim Racing Telemetry Platform
# Usage: make <target>
# Run `make help` to list all available targets.

.PHONY: help setup types dev-app dev-host dev-api dev-web build-api build-web build-app build \
        test test-api test-app lint lint-app lint-api fmt schema \
        docker-build docker-up docker-down docker-logs \
        clean

# Recipes are written to run unchanged under PowerShell (Windows) and sh
# (macOS/Linux). Anything shell-specific goes through scripts/make-tasks.mjs.
ifeq ($(OS),Windows_NT)
SHELL = powershell.exe
.SHELLFLAGS = -NoProfile -Command
endif

TASKS := node scripts/make-tasks.mjs

APP_DIR    := app
APP_SOLUTION := $(APP_DIR)/Sprint.Desktop.slnx
APP_DESKTOP_DIR := $(APP_DIR)/desktop
APP_HOST_PROJECT := $(APP_DIR)/Sprint.Desktop.Host/Sprint.Desktop.Host.csproj
APP_TEST_PROJECT := $(APP_DIR)/Sprint.Desktop.Tests/Sprint.Desktop.Tests.csproj
APP_HOST_TEST_PROJECT := $(APP_DIR)/Sprint.Desktop.Host/Tests/Sprint.Desktop.Host.Tests.csproj
API_DIR    := api
API_SOLUTION := $(API_DIR)/Sprint.Api.slnx
API_PROJECT := $(API_DIR)/Sprint.Api/Sprint.Api.csproj
API_TEST_PROJECT := $(API_DIR)/Sprint.Api.Tests/Sprint.Api.Tests.csproj

# Publish runtime identifier. Defaults to this machine: win-x64 on Windows,
# osx-arm64/osx-x64 on macOS, linux-x64/linux-arm64 on Linux.
# Override with: make build-app RID=osx-x64
RID ?= $(shell $(TASKS) rid)

# Version: read from the most recent git tag (strips leading "v"), else "dev".
# Override with: make build-app VERSION=1.2.3
VERSION ?= $(shell $(TASKS) version)

# ─── Help─────────────────────────────────────────────────────────────────────

help: ## Show this help message
	@$(TASKS) help

# ─── Setup ────────────────────────────────────────────────────────────────────

setup: ## Restore project dependencies
	dotnet restore $(APP_SOLUTION)
	dotnet restore $(API_SOLUTION)
	pnpm install
	echo 'Setup complete'

# ─── Development ──────────────────────────────────────────────────────────────

# @sprint/types is consumed from its built dist/ (gitignored), so every desktop
# target builds it first; otherwise a fresh clone cannot resolve it.
types: ## Build the shared TypeScript contracts (@sprint/types)
	pnpm --filter @sprint/types build

dev-app: types ## Run the desktop app in dev mode (Vite + Electron + native host)
	pnpm --filter @sprint/desktop dev

dev-host: ## Run only the native desktop host (loopback HTTP, no UI)
	dotnet watch --project $(APP_HOST_PROJECT)

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

build-app: types ## Package the desktop app -> app/build/bin (RID=win-x64|osx-arm64|osx-x64|linux-x64)
	dotnet publish $(APP_HOST_PROJECT) -c Release -r $(RID) -p:PublishSingleFile=true -p:InformationalVersion=$(VERSION) -o $(APP_DESKTOP_DIR)/resources/host
	pnpm --filter @sprint/desktop build
	pnpm --filter @sprint/desktop package

build: build-api build-web ## Build all (API + web)

# ─── Test ─────────────────────────────────────────────────────────────────────

test: test-api test-app ## Run API and desktop tests

test-api: ## Run API server tests (xunit)
	dotnet test $(API_TEST_PROJECT)

test-app: types ## Run desktop tests (native xunit + dashboard/electron TS)
	dotnet test $(APP_TEST_PROJECT)
	dotnet test $(APP_HOST_TEST_PROJECT)
	pnpm --filter @sprint/dashboard test
	pnpm --filter @sprint/desktop test

# ─── Lint & Format ────────────────────────────────────────────────────────────

lint: ## Build the API solution with warnings as errors and run pnpm lint
	dotnet build $(API_SOLUTION) -warnaserror
	pnpm lint

lint-app: types ## Build the desktop solution with warnings as errors and type-check the UI
	dotnet build $(APP_SOLUTION) -warnaserror
	pnpm --filter @sprint/dashboard type-check
	pnpm --filter @sprint/desktop type-check

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
	$(TASKS) clean

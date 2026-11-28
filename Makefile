# Sprint — Sim Racing Telemetry Platform
# Usage: make <target>
# Run `make help` to list all available targets.

.PHONY: help setup types dev-app dev-host agent-app smoke-app dev-data reset-dev-data \
        dev-db dev-api dev-web dev-cloud schema build-api build-web build-app build \
        test test-api test-app lint lint-api lint-app fmt \
        docker-build docker-up docker-down docker-logs clean

# Recipes are written to run unchanged under PowerShell (Windows) and sh
# (macOS/Linux). Anything shell-specific goes through scripts/make-tasks.mjs.
ifeq ($(OS),Windows_NT)
SHELL = powershell.exe
.SHELLFLAGS = -NoProfile -Command
endif

TASKS := node scripts/make-tasks.mjs
# cargo in the wheel-dash renderer crate (packages/dashboard/renderer), found on PATH or in ~/.cargo/bin.
DASH_CARGO := node scripts/build-dash-renderer.mjs --cargo

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

# `make help` prints the `target: ## text` lines under the `# ─── Section` heading above them,
# in file order.

# ─── Setup ────────────────────────────────────────────────────────────────────

help: ## Show this help message
	@$(TASKS) help

setup: ## Restore project dependencies
	dotnet restore $(APP_SOLUTION)
	dotnet restore $(API_SOLUTION)
	pnpm install
	$(DASH_CARGO) fetch
	echo 'Setup complete'

# @sprint/types is consumed from its built dist/ (gitignored), so every desktop
# target builds it first; otherwise a fresh clone cannot resolve it.
types: ## Build the shared TypeScript contracts (@sprint/types)
	pnpm --filter @sprint/types build

# ─── Desktop app ──────────────────────────────────────────────────────────────

dev-app: types ## Run the app (Vite + Electron + host) on the game; REPLAY=<recording> plays one instead, RECORD=1 records the session
	$(TASKS) dev-app $(if $(REPLAY),--replay "$(REPLAY)") $(if $(RECORD),--record)

dev-host: ## Run only the native host (loopback HTTP, no UI)
	$(TASKS) dev-host

agent-app: types ## An agent's hidden run on fresh data, driven over CDP; DATA=<dir> copies data in, REPLAY=<recording> plays one
	node app/desktop/scripts/agent-app.mjs $(if $(DATA),--data "$(DATA)") $(if $(REPLAY),--replay "$(REPLAY)")

smoke-app: types ## Start the real app hidden, open every page on a replayed race, fail on any error (CI runs it)
	node app/desktop/scripts/smoke.mjs

# ─── Dev data ─────────────────────────────────────────────────────────────────
# A dev run keeps its data in this checkout's app/desktop/.dev/data, never the installed app's.

dev-data: ## Fill this checkout's dev data with the laps of every recording in app/recordings (no game needed)
	$(TASKS) dev-data

dev-sessions-to-app: ## Copy sessions driven on a dev build into the installed Sprint; lists them, SESSION=<id>[,<id>] or SESSION=today copies
	node app/desktop/scripts/dev-sessions-to-app.mjs $(if $(SESSION),--session=$(SESSION))

reset-dev-data: ## Delete this checkout's dev data (settings, laps, logs); the installed app is untouched
	$(TASKS) reset-dev-data

# ─── Cloud (API + web) ────────────────────────────────────────────────────────

# Compose interpolates the whole file, and the prod services require .env secrets,
# so without a .env the dev database comes up with the .env.example defaults.
dev-db: ## Start the local Postgres the API needs (no-op when it is already up)
	docker compose $(if $(wildcard .env),,--env-file .env.example) up -d --wait db

dev-api: dev-db ## Run the API server locally (hot-reload)
	dotnet watch --project $(API_PROJECT)

dev-web: ## Run the Next.js web app in dev mode
	pnpm --filter @sprint/web dev

dev-cloud: ## Run Postgres, the API and the web app together (Ctrl+C stops both servers)
	$(MAKE) -j2 dev-api dev-web

schema: ## Export the GraphQL schema → web/schema.graphql (for web codegen)
	dotnet run --project $(API_PROJECT) -- export-schema ../../web/schema.graphql

# ─── Build ────────────────────────────────────────────────────────────────────

build-app: types ## Package the desktop app -> app/build/bin; the Windows installer too (RID=win-x64|osx-arm64|osx-x64|linux-x64)
	dotnet publish $(APP_HOST_PROJECT) -c Release -r $(RID) -p:PublishSingleFile=true -p:InformationalVersion=$(VERSION) -o $(APP_DESKTOP_DIR)/resources/host
	pnpm --filter @sprint/desktop build
	pnpm --filter @sprint/desktop package $(VERSION)

build-api: ## Publish the API server → api/build/bin
	dotnet publish $(API_PROJECT) -c Release -p:InformationalVersion=$(VERSION) -o $(API_DIR)/build/bin

build-web: ## Build the Next.js web app (production)
	pnpm --filter @sprint/web build

build: build-api build-web ## Build the API and the web app (the desktop app: build-app)

# ─── Test ─────────────────────────────────────────────────────────────────────

test: test-api test-app ## Run API and desktop tests

test-api: ## Run API server tests (xunit)
	dotnet test $(API_TEST_PROJECT)

test-app: types ## Run desktop tests (native xunit, the dash renderer crate, dashboard/electron TS)
	dotnet test $(APP_TEST_PROJECT)
	dotnet test $(APP_HOST_TEST_PROJECT)
	$(DASH_CARGO) test
	pnpm --filter @sprint/dashboard test
	pnpm --filter @sprint/desktop test

# ─── Lint & Format ────────────────────────────────────────────────────────────

lint: lint-api lint-app ## Lint everything: lint-api, lint-app and pnpm lint
	pnpm lint

lint-api: ## Build the API solution with warnings as errors
	dotnet build $(API_SOLUTION) -warnaserror

lint-app: types ## Build the desktop solution with warnings as errors, lint the dash renderer crate and type-check the UI
	dotnet build $(APP_SOLUTION) -warnaserror
	$(DASH_CARGO) clippy --all-targets -- -D warnings
	$(DASH_CARGO) fmt --check
	pnpm --filter @sprint/dashboard type-check
	pnpm --filter @sprint/desktop type-check

fmt: ## Format C#, Rust and TS/JS code
	dotnet format $(APP_SOLUTION)
	dotnet format $(API_SOLUTION)
	$(DASH_CARGO) fmt
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

# Copilot Instructions

## General Rules

- Do **not** install system-level programs, applications, or packages on the host machine without explicit user consent.
- Do **not** read, write, or execute anything outside the `/Users/kratofl/Projects/sprint` directory.
- Prefer **LSP-based tools** (go to definition, find references, hover, etc.) for code navigation and understanding. Fall back to file read operations (grep, glob, cat) only as a last resort.

## Project Overview

A sim racing telemetry platform with two components:

1. **Web app** (`/web` or similar) — Next.js frontend for analyzing telemetry, comparing setups, and sharing data with other users.
2. **Data client** (`/client` or similar) — A Go program that runs locally on the user's machine, reads live telemetry from sim racing games, converts it to a unified DTO format, and sends it to the web app.

## Architecture

```
Sim Game (e.g. LeMansUltimate)
        ↓  UDP/shared memory
  Go Data Client (local)
        ↓  unified DTO → HTTP/WebSocket
    Next.js Web App
        ↓
    Backend/API (Next.js API routes or separate service)
        ↓
    Database (user data, sessions, comparisons)
```

### Key Architectural Decisions

- **Unified DTO**: All game-specific telemetry is normalized into a single shared data format before being sent to the web app. New games are added by writing an adapter that maps raw game data to this DTO — the rest of the pipeline stays unchanged.
- **Currently supported games**: LeMansUltimate. New games should only require a new adapter, not changes to the core pipeline.
- **Multi-user**: Users can upload telemetry sessions and compare data with others on the platform.

## Go Data Client Conventions

- Game integrations live in their own packages (one per game). Each implements a common interface so new games can be added without touching the core.
- The unified DTO is the contract between game adapters and the rest of the system — changes to it affect both the client and the web app.
- Prefer composition over large monolithic structs for telemetry data models.

## Next.js Web App Conventions

- This is a Next.js project. Use the App Router unless the project was scaffolded with the Pages Router.
- API routes handle communication with the Go client and data storage.
- Telemetry comparison and race engineer features are core UI concerns.

## Data Flow for New Game Support

1. Create a new package under the games directory (e.g., `games/iracing/`).
2. Implement the game adapter interface to read raw telemetry from the game.
3. Map the raw data to the shared unified DTO.
4. Register the adapter in the client's game selector — no changes needed downstream.

# Desktop App Implementation Guide

This document explains the current structure of the desktop app after the
desktop simplification pass. It is meant for contributors working in `app/`
who need to understand where logic belongs and how the frontend/backend
boundary is expected to work.

Related notes:

- [Structure review](./structure-review.md)
- [Wails guidance](../agents/wails.md)

## Goals Of The Current Structure

- Keep the Wails `App` layer thin.
- Keep orchestration in `internal/core`.
- Keep persistence and registry mutations in focused services.
- Use generated Wails bindings for frontend calls instead of ad hoc string RPC.
- Keep event names and payloads centrally typed.
- Preserve current saved dashboard/device JSON formats.

## Structure At A Glance

```text
app/
├─ app.go + app_*.go                 Wails-bound methods only
├─ internal/core/                    lifecycle and subsystem orchestration
├─ internal/dashboard/               layouts, widgets, alerts, painter
├─ internal/devices/                 registry, catalog, device services
├─ internal/hardware/                screen drivers and render/send loops
└─ frontend/src/
   ├─ lib/
   │  ├─ wails.ts                    runtime checks + typed event subscription
   │  ├─ desktopEvents.ts            event names and payload map
   │  ├─ dash/
   │  │  ├─ types.ts                 frontend dash/device types
   │  │  ├─ defaults.ts              shared desktop defaults
   │  │  ├─ adapters.ts              Wails payload normalization
   │  │  └─ api.ts                   typed desktop API wrappers
   │  ├─ settings.ts                 typed settings/update/app-info calls
   │  ├─ controls.ts                 typed controls calls
   │  └─ window.ts                   window command wrappers
   └─ components/dash-editor/
      ├─ useDashEditorController.ts  dash editor state/effects
      └─ WidgetPalette.tsx           palette UI
```

## Frontend Boundary

### Wails Calls

The frontend should treat `app/frontend/wailsjs/go/main/App` as the source of
truth for callable methods.

Use this pattern:

1. Import the generated binding.
2. Wrap it in a small typed helper in `src/lib/...`.
3. Normalize payload shape in one place if the Wails payload is awkward or
   still stringly typed.

Do not reintroduce generic `call('MethodName', ...)` style helpers.

### Runtime Helper

[`app/frontend/src/lib/wails.ts`](../../app/frontend/src/lib/wails.ts) is now
narrow on purpose.

It should only own:

- desktop runtime availability checks;
- guarded method execution for browser/dev fallback behavior;
- typed event subscription through `onEvent(...)`.

It should not become a generic RPC abstraction again.

### Typed Desktop Events

[`app/frontend/src/lib/desktopEvents.ts`](../../app/frontend/src/lib/desktopEvents.ts)
is the central registry for event names and payloads.

Current domains:

- `APP_EVENTS`
- `TELEMETRY_EVENTS`
- `DASH_EVENTS`
- `SCREEN_EVENTS`
- `DEVICE_EVENTS`
- `UPDATE_EVENTS`

If the backend emits a new event:

1. add the event constant here;
2. add the payload shape to `DesktopEventMap`;
3. use `onEvent(...)` from `wails.ts` in the UI;
4. prefer a typed Go struct for the payload over `map[string]any`.

## Dash Frontend Modules

The previous `src/lib/dash.ts` had too many responsibilities. It now acts as a
barrel while the actual responsibilities live in focused modules.

### `types.ts`

Frontend-owned TypeScript types used across dash, devices, and editor views.

### `defaults.ts`

Shared desktop defaults such as the default dash theme and domain palette.
These values should be reused instead of being duplicated in editor/view code.

### `adapters.ts`

Normalization layer between Wails payloads and frontend-friendly shapes.

Examples:

- `snake_case` to `camelCase`
- defensive defaults for partially-filled payloads
- purpose config encoding/decoding helpers

Keep transport normalization here instead of spreading it across components.

### `api.ts`

Typed desktop wrappers around generated Wails bindings for:

- dash layouts and preview flow;
- devices and device bindings;
- widget catalog and alert catalog.

If a caller needs dash/device data, it should normally go through these helpers
instead of importing Wails bindings directly.

## Dash Editor Split

[`app/frontend/src/components/DashEditMode.tsx`](../../app/frontend/src/components/DashEditMode.tsx)
is now mostly composition.

The heavy editor logic lives in
[`useDashEditorController.ts`](../../app/frontend/src/components/dash-editor/useDashEditorController.ts),
which owns:

- preview lifecycle;
- page selection and live preview targeting;
- widget catalog loading;
- screen sizing and fitted canvas state;
- save/dirty state;
- page/widget mutations.

Supporting UI pieces such as
[`WidgetPalette.tsx`](../../app/frontend/src/components/dash-editor/WidgetPalette.tsx)
should stay presentational where possible.

Rule of thumb:

- stateful editor orchestration belongs in the controller hook;
- reusable/pure rendering belongs in focused components;
- transport/data normalization belongs in `src/lib/dash`.

## Backend Boundary

### `App` Methods

`app.go` and `app_*.go` remain the Wails-facing layer. Exported methods should
be small and mostly do one of these:

- delegate to an internal service;
- delegate to the coordinator;
- return static/default metadata.

They should not accumulate repeated registry mutation flows.

### Services

Two new services now carry repeated persistence/update flows:

- [`app/internal/dashboard/service.go`](../../app/internal/dashboard/service.go)
- [`app/internal/devices/service.go`](../../app/internal/devices/service.go)

These services own the common patterns around:

- load or create state;
- mutate;
- save;
- trigger hot-reload/runtime follow-up;
- emit update events where needed.

That keeps the Wails boundary small and makes the behavior easier to test.

### Coordinator

`internal/core` is still the app lifecycle and orchestration layer.

Keep using it for:

- subsystem startup/shutdown;
- preview rendering flow;
- screen renderer coordination;
- live event emission for the frontend.

Do not move general persistence logic into `internal/core`.

## Typed States And Events In Go

Where cheap and high-value, shared string states should use concrete types.

Current examples:

- [`devices.ScreenStatus`](../../app/internal/devices/status.go)
- typed event payloads in
  [`internal/core/events.go`](../../app/internal/core/events.go) and
  [`internal/hardware/events.go`](../../app/internal/hardware/events.go)

This is the preferred direction for desktop boundary code:

- concrete type or struct first;
- raw string or `map[string]any` only where flexibility is still required.

## What To Keep

These choices are intentional and should not be "simplified away" without a
clear reason:

- thin `App` plus `internal/*` split;
- `internal/core` as the orchestrator;
- `dashboard` vs `hardware` separation;
- generic widget engine internals;
- local React state and custom hooks instead of a global store;
- shared UI and token packages for cross-surface consistency.

## Deferred Work

Still intentionally deferred after this pass:

- deeper typing of widget `config` blobs inside the widget engine;
- request-object Wails APIs such as a typed `DeviceRef`;
- further slimming of `internal/core` if new hotspots appear;
- checked-in Wails codegen refresh during a normal build workflow.

## Practical Rules For Future Changes

When adding a new desktop feature:

1. Add or update the Go `App` method.
2. Keep the method thin and delegate when logic is reusable.
3. Regenerate or refresh Wails bindings in the normal workflow.
4. Add a typed frontend wrapper in `src/lib/...`.
5. Normalize payload shapes in adapters, not in components.
6. Add typed event constants/payloads if the backend emits new events.
7. Add focused tests near the extracted helpers or services.

If a change starts introducing more raw strings, more JSON blobs in components,
or more duplicated load-update-save code in `app/app_*.go`, it is probably
going in the wrong direction.

# Desktop Structure Review

## What Changed
- Replaced most raw Wails method-name strings in the desktop frontend with generated bindings from `wailsjs/go/main/App`.
- Narrowed [`app/frontend/src/lib/wails.ts`](/C:/Projects/sprint/app/frontend/src/lib/wails.ts) to runtime availability and typed event subscription instead of acting as a generic string-based RPC layer.
- Split the oversized desktop dash boundary out of [`app/frontend/src/lib/dash.ts`](/C:/Projects/sprint/app/frontend/src/lib/dash.ts) into focused modules:
  - [`types.ts`](/C:/Projects/sprint/app/frontend/src/lib/dash/types.ts)
  - [`defaults.ts`](/C:/Projects/sprint/app/frontend/src/lib/dash/defaults.ts)
  - [`adapters.ts`](/C:/Projects/sprint/app/frontend/src/lib/dash/adapters.ts)
  - [`api.ts`](/C:/Projects/sprint/app/frontend/src/lib/dash/api.ts)
- Added typed desktop event constants in [`app/frontend/src/lib/desktopEvents.ts`](/C:/Projects/sprint/app/frontend/src/lib/desktopEvents.ts) so event names and payloads are grouped and centrally owned.
- Extracted repeated device/dashboard persistence flows into backend services:
  - [`app/internal/devices/service.go`](/C:/Projects/sprint/app/internal/devices/service.go)
  - [`app/internal/dashboard/service.go`](/C:/Projects/sprint/app/internal/dashboard/service.go)
- Added a concrete Go `ScreenStatus` type and replaced several event payload `map[string]any` blobs with typed structs in `internal/core` and `internal/hardware`.
- Split the dash editor controller/palette work out of [`app/frontend/src/components/DashEditMode.tsx`](/C:/Projects/sprint/app/frontend/src/components/DashEditMode.tsx) into:
  - [`useDashEditorController.ts`](/C:/Projects/sprint/app/frontend/src/components/dash-editor/useDashEditorController.ts)
  - [`WidgetPalette.tsx`](/C:/Projects/sprint/app/frontend/src/components/dash-editor/WidgetPalette.tsx)

## Why
- The desktop app already had generated Wails typings, but the frontend was bypassing them with raw string calls and ad hoc normalization. That was unnecessary indirection and weakened type safety.
- `dash.ts` and `DashEditMode.tsx` had become mixed-responsibility files: transport, normalization, domain types, state orchestration, preview lifecycle, and UI composition were all blended together.
- The Go bindings in `app/app*.go` were doing the same registry load-update-save-reload sequences repeatedly. Moving those flows into services keeps the Wails layer thinner and makes behavior easier to test.

## What We Kept
- The thin `App` struct as the Wails-facing boundary.
- `internal/core` as the lifecycle/coordinator layer.
- The existing `dashboard` vs `hardware` split.
- The widget registry/painter model.
- Local React state and custom hooks instead of adding a global state library.
- Current persisted dashboard/device file formats.

## Deferred
- Deep widget config typing inside the dash/widget engine. `map[string]any` still exists there on purpose for this pass.
- A stronger request-object style desktop API such as a typed `DeviceRef` passed across the Wails boundary instead of repeated `vid/pid/serial` tuples.
- Further `internal/core` slimming if it remains a hotspot after the new service boundaries settle.
- Wails codegen refresh. The frontend now treats the generated bindings as the source of truth for calls, but the checked-in generated files should be regenerated in a normal app build workflow.

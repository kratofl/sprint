# Desktop App (`/app`)

Native .NET 10/Avalonia desktop app for the driver's rig.

## Responsibilities

- Host the Graphite desktop shell from the figma branch as native Avalonia UI.
- Show live demo telemetry, engineer controls, setup programs, dash layouts, devices,
  settings, and help pages.
- Load desktop presets from `app/Sprint.Desktop.Client/presets`.
- Persist user settings, saved devices, and created dash layouts under the Sprint
  app-data folder.

## Structure

```
app/
├── Sprint.Desktop.sln
├── Sprint.Desktop.Client/ ← Avalonia app, feature slices, assets, presets
├── Sprint.Desktop.Api/    ← shared desktop/game API contracts
├── Sprint.Games/          ← game adapters and game-specific data paths
└── Sprint.Desktop.Tests/  ← lightweight desktop regression tests
```

The desktop app consumes shared telemetry contracts from `app/Sprint.Desktop.Api`.
Game-specific paths, adapters, and source implementations live in `app/Sprint.Games`.

## Running

```powershell
dotnet run --project app/Sprint.Desktop.Client/Sprint.Desktop.Client.csproj
make dev-app
```

## Building

```powershell
make build-app
```

The published app is written to `app/build/bin`.

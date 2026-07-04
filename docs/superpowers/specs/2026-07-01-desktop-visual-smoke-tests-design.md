# Desktop Visual Smoke Tests Design

## Context

Sprint's desktop app is an Avalonia application under `app/Sprint.Desktop.Client`.
The existing `app/Sprint.Desktop.Tests` project already uses `Avalonia.Headless`
to construct the real `MainWindow` without a visible display. That proves the
shell can build and close, but it does not render pixels or create screenshots
for agents to inspect.

The goal is to give AI agents an automatic first look at desktop UI work before
they claim it is finished. The check should catch obvious visual failures such as
blank windows, missing content, broken shell regions, or views that fail to
render after navigation.

## Decision

Use `Avalonia.Headless` with Skia drawing enabled as the primary visual test
harness. This fits the current test project, avoids system-wide tools, runs in
CI, and can produce PNG artifacts for inspection.

Real-window automation with FlaUI, Appium, or a Windows driver remains a later
option for focus, accessibility, drag, and platform-specific behavior. It is not
the first layer because it is slower, more brittle, and requires extra local
setup.

## Architecture

The desktop test app builder should use Skia plus headless drawing:

```csharp
AppBuilder.Configure<App>()
    .UseSkia()
    .UseHeadless(new AvaloniaHeadlessPlatformOptions
    {
        UseHeadlessDrawing = false
    });
```

Add focused visual smoke tests in `app/Sprint.Desktop.Tests`, separate from pure
presenter and runtime tests. The tests should:

- create a fresh temp data root through `TestEnv`;
- construct the real `MainWindow` with deterministic fake telemetry;
- set stable desktop viewport sizes such as `1440x900` and one constrained size
  near the app minimum;
- navigate the key shell views: Live, Engineer, Setup, Dashes, Devices,
  Settings, and Help;
- capture rendered frames with `CaptureRenderedFrame`;
- save PNG artifacts under `app/Sprint.Desktop.Tests/artifacts/visual/`;
- assert that frames are non-empty and contain meaningful rendered pixels.

The first implementation should prefer deterministic smoke assertions over
pixel-perfect baselines. Baselines can be added later once the Graphite shell is
more stable.

## Agent Workflow

After desktop visual, layout, Graphite, or Avalonia shell changes, agents should
run the visual smoke tests before finishing:

```powershell
dotnet test app/Sprint.Desktop.Tests/Sprint.Desktop.Tests.csproj --filter VisualSmokeTests
```

If the visual filter is not available yet, run:

```powershell
make test-app
```

and call out that the visual harness has not been implemented.

On failure, inspect generated PNG artifacts with the available image-viewing
tool before editing the UI again. The intended artifact location is:

```text
app/Sprint.Desktop.Tests/artifacts/visual/
```

## Assertions

The smoke tests should fail when:

- the captured image is null, zero-sized, or cannot be saved;
- the frame is mostly one color, indicating a blank or failed render;
- expected shell regions do not contain visible non-background pixels;
- navigation to any primary view throws or renders an empty body;
- the window cannot close cleanly and dispose telemetry resources.

The tests should not initially fail on small antialiasing or font differences.
Use broad thresholds and explicit artifact inspection for judgment-heavy visual
issues.

## Error Handling

When rendering fails, the test should write:

- the actual PNG frame;
- a short text note naming the view, viewport, and failure reason;
- optionally a simple diff or diagnostic mask if baseline comparison is added
  later.

Artifacts are diagnostic output, not product assets. They may be regenerated
freely and should not be treated as canonical screenshots unless a later baseline
workflow explicitly adopts them.

## Non-Goals

- Do not install WinAppDriver, Appium, FlaUI, or other system-wide automation
  tools for the first implementation.
- Do not add fragile pixel-perfect baselines in the first pass.
- Do not replace unit tests for presenters, telemetry, or runtime behavior.
- Do not require real sim hardware or a live telemetry source.

## Verification

Implementation is complete when:

- `dotnet test app/Sprint.Desktop.Tests/Sprint.Desktop.Tests.csproj --filter VisualSmokeTests`
  runs and captures PNG artifacts;
- `make test-app` includes the visual smoke tests;
- failure output points agents to `app/Sprint.Desktop.Tests/artifacts/visual/`;
- `AGENTS.md` tells agents to run the visual smoke tests after desktop UI work.

# Sprint Desktop Tests

## The test run never touches hardware or the shell

`TestHostEffects` calls `HostEffects.DisableForTestRun()` from a `[ModuleInitializer]`, so it
takes effect before any test body runs and applies to tests added later without them opting in.

It exists because the suite used to reach out of the process on a developer's machine:

- **Screens.** Nearly every headless test builds a real `MainWindow`, which calls
  `DeviceScreenService.Sync()` and starts a hardware publisher for each saved screen device. On
  a desk with a wheel screen attached, the suite was driving it. `ScreenDriverFactory.Create`
  now returns `FakeScreenDriver` whenever the gate is off, so no WinUSB transport is ever
  opened — the render loop and Devices UI stay fully exercisable against the fake.
- **File-manager windows.** `UpdateInstaller.RevealInFolder` and the diagnostics log-folder
  action go through `HostEffects.TryRevealInFileManager`, which no-ops and returns false.
  `UpdateScript.BuildWindowsBatch` also omits its `explorer.exe` line by default, because
  `UpdateScriptTests` executes the generated batch for real; pass
  `revealStagingOnFailure: true` when asserting on the script text.

If you add a test that needs to reach the OS or a device, inject a fake at the seam — do not
re-enable the gate. `HostEffectsTests` pins all of this.

## Agent UI Review

Run this after desktop UI changes when an agent needs to inspect the rendered app:

```powershell
dotnet test app\Sprint.Desktop.Tests\Sprint.Desktop.Tests.csproj --filter AgentUiReview
```

The test writes an agent-local report and screenshots to:

```text
app/Sprint.Desktop.Tests/artifacts/ui-review/latest/
```

Open `report.html` for the full journey, or inspect the PNGs directly. Agents must inspect the generated screenshots before claiming desktop UI work is complete. The harness drives real Avalonia controls through Home, Devices, Setups, Settings, Help, and Dash Editor, and records visible text plus semantic failures next to each image.

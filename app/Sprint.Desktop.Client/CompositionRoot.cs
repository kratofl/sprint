using Sprint.Desktop.Api.Telemetry;
using Sprint.Desktop.Shell;
using Sprint.Games;

namespace Sprint.Desktop;

/// <summary>
/// Explicit composition root: builds the desktop app's dependency graph in one
/// place and hands it to the shell window. Keeps wiring out of
/// <see cref="MainWindow"/> — no hidden singletons or service-locator lookups.
/// <para>The real Le Mans Ultimate adapter is now instantiable via
/// <see cref="GameTelemetryPackage.CreateSource"/>; the dev/default source stays the
/// demo so <c>make dev-app</c> shows a live, delta-augmented stream without a running
/// game (selecting a real game per-launch — and the game-picker UI — is a follow-up
/// product decision, tracked against PRD #107). The window wraps whichever source it
/// is given in the WS4 <c>TelemetryEngine</c>.</para>
/// </summary>
internal static class CompositionRoot
{
    public static MainWindow CreateMainWindow()
    {
        var runtime = new DesktopRuntime();
        var shell = new ShellState();
        ITelemetrySource telemetry = GameTelemetryPackage.CreateDemoSource();
        return new MainWindow(runtime, shell, telemetry);
    }
}

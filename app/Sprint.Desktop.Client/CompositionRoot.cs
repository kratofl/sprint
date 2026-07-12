using Sprint.Desktop.Api.Telemetry;
using Sprint.Desktop.Shell;
using Sprint.Games;

namespace Sprint.Desktop;

/// <summary>
/// Explicit composition root: builds the desktop app's dependency graph in one
/// place and hands it to the shell window. Keeps wiring out of
/// <see cref="MainWindow"/> — no hidden singletons or service-locator lookups.
/// <para>The app default is the first real game adapter. Demo telemetry remains
/// available only through explicit test/dev wiring so startup never paints synthetic
/// live data as if a sim were connected.</para>
/// </summary>
internal static class CompositionRoot
{
    public static MainWindow CreateMainWindow()
    {
        var runtime = new DesktopRuntime();
        var shell = new ShellState(runtime.Settings.SidebarCollapsed);
        var telemetry = CreateTelemetrySource();
        return new MainWindow(runtime, shell, telemetry);
    }

    internal static ITelemetrySource CreateTelemetrySource()
    {
        var descriptor = GameTelemetryPackage.SupportedGames.First(game =>
            !game.Id.Equals("demo", StringComparison.OrdinalIgnoreCase));
        return GameTelemetryPackage.CreateSource(descriptor);
    }
}

using Sprint.Desktop.Api.Telemetry;
using Sprint.Desktop.Features.Diagnostics;
using Sprint.Desktop.Features.Input;
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
        // AppDiagnostics.Log is the one cross-cutting accessor the app permits: it
        // is installed by Program.Main before any wiring runs, and injected here so
        // feature code (DesktopRuntime) depends on ILog, not the static holder.
        var runtime = new DesktopRuntime(log: AppDiagnostics.Log);
        var shell = new ShellState(runtime.Settings.SidebarCollapsed);
        var telemetry = CreateTelemetrySource();
        var hardwareInput = HardwareInputSourceFactory.Create(AppDiagnostics.Log);
        try
        {
            return new MainWindow(
                runtime,
                shell,
                telemetry,
                AppDiagnostics.Log,
                AppDiagnostics.LiveLog,
                screenDriverFactory: null,
                diagnosticsPaths: AppDiagnostics.Paths,
                hardwareInput: hardwareInput);
        }
        catch
        {
            hardwareInput.Dispose();
            throw;
        }
    }

    internal static ITelemetrySource CreateTelemetrySource()
    {
        var descriptor = GameTelemetryPackage.SupportedGames.First(game =>
            !game.Id.Equals("demo", StringComparison.OrdinalIgnoreCase));
        return GameTelemetryPackage.CreateSource(descriptor);
    }
}

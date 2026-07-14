using Avalonia;
using Sprint.Desktop.Features.Diagnostics;
using Sprint.Desktop.Runtime;

namespace Sprint.Desktop;

internal static class Program
{
    [STAThread]
    public static void Main(string[] args)
    {
        // Install diagnostics first so logging and crash capture cover the entire
        // process lifetime, including composition-root wiring and the UI loop.
        AppDiagnostics.Install();
        AppDiagnostics.Log.Info($"Sprint Desktop {BuildInfo.Version} starting");

        try
        {
            BuildAvaloniaApp().StartWithClassicDesktopLifetime(args);
            AppDiagnostics.Log.Info("Sprint Desktop exited normally");
        }
        catch (Exception ex)
        {
            // Fatal exception escaping the UI loop: record it before the process
            // dies so a report exists to attach to a bug. Rethrow so the OS still
            // sees a non-zero exit / normal crash semantics.
            var path = AppDiagnostics.Crash?.Report("UI", ex);
            AppDiagnostics.Log.Error(
                path is null ? "Fatal UI exception (crash report could not be written)" : $"Fatal UI exception; crash report: {path}");
            throw;
        }
    }

    public static AppBuilder BuildAvaloniaApp()
    {
        return AppBuilder
            .Configure<App>()
            .UsePlatformDetect();
    }
}

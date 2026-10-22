using Sprint.Desktop.Features.Dashes;
using Sprint.Desktop.Features.SessionPlanning;
using Sprint.Desktop.Features.Setup;
using Sprint.Desktop.Features.Sharing;
using Xunit;

namespace Sprint.Desktop.Tests;

/// <summary>The sync's view of the desktop's real stores: what a second PC ends up with after a download.</summary>
public sealed class RuntimeSyncLocalTests : IDisposable
{
    private readonly string _first = Path.Combine(Path.GetTempPath(), "sprint-sync-local-a-" + Guid.NewGuid().ToString("N"));
    private readonly string _second = Path.Combine(Path.GetTempPath(), "sprint-sync-local-b-" + Guid.NewGuid().ToString("N"));

    public void Dispose()
    {
        foreach (string root in new[] { this._first, this._second })
        {
            if (Directory.Exists(root))
                Directory.Delete(root, recursive: true);
        }
    }

    [Fact]
    public void ADownloadedDashNeverBecomesASecondDefault()
    {
        RuntimeSyncLocal first = Local(this._first, out DesktopRuntime firstRuntime);
        DashLayout dash = firstRuntime.CreateDashLayout();
        firstRuntime.SetDefaultDashLayout(dash);
        SyncItem uploaded = first.Items().Single(item => item.Kind == SyncKind.Dash && item.Id == dash.Id);

        RuntimeSyncLocal second = Local(this._second, out DesktopRuntime secondRuntime);
        second.Write(SyncKind.Dash, uploaded.Json);

        Assert.Single(secondRuntime.DashLayouts, layout => layout.IsDefault);
        Assert.Contains(secondRuntime.DashLayouts, layout => layout.Id == dash.Id && !layout.IsDefault);
    }

    [Fact]
    public void SetupsAndSessionsArriveOnASecondPcAsTheyLeftTheFirst()
    {
        RuntimeSyncLocal first = Local(this._first, out DesktopRuntime firstRuntime);
        firstRuntime.SetupPrograms.Add(new SetupProgram { Id = "monza-low", Name = "Monza low DF", Values = { ["wing"] = 3 } });
        firstRuntime.SaveSetupPrograms();
        LocalLapHistoryStore firstHistory = new(Path.Combine(this._first, "lap-history"));
        firstHistory.Save(new LapHistorySession
        {
            Id = "spa-1",
            Context = new LapHistoryContext { Game = "Le Mans Ultimate", TrackCourse = "Spa", CarModel = "Porsche 963" },
            StartedAt = new DateTimeOffset(2026, 10, 1, 18, 0, 0, TimeSpan.Zero),
            EndedAt = new DateTimeOffset(2026, 10, 1, 19, 0, 0, TimeSpan.Zero),
        });

        RuntimeSyncLocal second = Local(this._second, out DesktopRuntime secondRuntime);
        foreach (SyncItem item in first.Items().Where(item => item.Kind != SyncKind.Dash))
            second.Write(item.Kind, item.Json);

        Assert.Equal(3, Assert.Single(secondRuntime.SetupPrograms, program => program.Id == "monza-low").Values["wing"]);
        SyncItem session = Assert.Single(second.Items(), item => item.Kind == SyncKind.Session);
        Assert.Equal(new SyncSessionInfo("Le Mans Ultimate", "Spa", "Porsche 963", "Unknown", new DateTimeOffset(2026, 10, 1, 18, 0, 0, TimeSpan.Zero), true), session.Session);
    }

    private static RuntimeSyncLocal Local(string root, out DesktopRuntime runtime)
    {
        runtime = new DesktopRuntime(root, TestEnv.PresetRoot);
        return new RuntimeSyncLocal(runtime, new LocalLapHistoryStore(Path.Combine(root, "lap-history")));
    }
}

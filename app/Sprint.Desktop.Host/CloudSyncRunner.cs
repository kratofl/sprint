using Sprint.Desktop.Features.Diagnostics;
using Sprint.Desktop.Features.Sharing;
using Sprint.Desktop.Runtime;

namespace Sprint.Desktop.Host;

/// <summary>The last sync the host ran, for Settings to show.</summary>
public sealed record SyncOutcome(DateTimeOffset At, string Direction, SyncReport Report);

/// <summary>
/// Runs <see cref="CloudSync"/> for the signed-in account: on request (the setup's transfer step,
/// Settings' Upload and Download), and in the background every few minutes while the driver
/// keeps data on the server. "Web only" uploads also remove finished sessions here.
/// </summary>
public sealed class CloudSyncRunner(CloudAccount account, CloudSync sync, DesktopRuntime runtime, ILog log)
{
    private static readonly TimeSpan Interval = TimeSpan.FromMinutes(10);
    private static readonly SyncReport SignedOut = SyncReport.Failed("Sign in to a Sprint server first.");

    public SyncOutcome? Last { get; private set; }

    public SyncProgress? Progress => sync.Progress;

    public async Task<SyncReport> PushAsync(CancellationToken ct)
    {
        bool webOnly = runtime.Settings.Cloud.Storage == CloudStorageMode.Remote;
        SyncReport report = await account.WithClientAsync(client => sync.PushAsync(client, account.AccountKey, webOnly, ct), SignedOut);
        this.Last = new SyncOutcome(DateTimeOffset.UtcNow, "upload", report);
        return report;
    }

    public async Task<SyncReport> PullAsync(CancellationToken ct)
    {
        SyncReport report = await account.WithClientAsync(client => sync.PullAsync(client, account.AccountKey, ct), SignedOut);
        this.Last = new SyncOutcome(DateTimeOffset.UtcNow, "download", report);
        return report;
    }

    /// <summary>Uploads every <see cref="Interval"/> while signed in and storage is not Local, until <paramref name="stop"/>.</summary>
    public async Task RunAsync(CancellationToken stop)
    {
        using PeriodicTimer timer = new(Interval);
        try
        {
            while (await timer.WaitForNextTickAsync(stop))
            {
                if (runtime.Settings.Cloud.Storage == CloudStorageMode.Local || !account.State.SignedIn)
                    continue;
                try
                {
                    SyncReport report = await this.PushAsync(stop);
                    if (!report.Ok)
                        log.Warn($"Background upload stopped: {report.Error}");
                }
                catch (Exception ex) when (ex is not OperationCanceledException)
                {
                    log.Warn("Background upload failed", ex);
                }
            }
        }
        catch (OperationCanceledException)
        {
            // Expected on shutdown.
        }
    }
}

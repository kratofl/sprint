using System.ComponentModel;
using System.Diagnostics;
using System.IO.Compression;
using System.Runtime.InteropServices;

namespace Sprint.Desktop.Features.Updates;

/// <summary>The staged result of downloading + extracting an update, ready to apply.</summary>
public sealed record StagedUpdate(string StagingDir, string ArchivePath);

/// <summary>
/// Thin IO orchestrator for the one-click self-replacing update. It downloads the
/// platform archive (progress-reported), extracts it to a temp staging folder, and
/// — on Windows — launches the <see cref="UpdateScript"/> helper batch that swaps
/// the running install and relaunches. The self-replace itself cannot be
/// unit-tested (it exits the process), so all decision logic lives in the pure
/// <see cref="ReleaseAssetSelector"/> / <see cref="UpdateScript"/> seams; this class
/// stays deliberately thin and best-effort — any failure surfaces to the caller and
/// never bricks the running app.
/// </summary>
public sealed class UpdateInstaller(HttpClient? httpClient = null)
{
    private readonly HttpClient _http = httpClient ?? CreateClient();

    /// <summary>The runtime identifier of the current build, mapped to the release-asset RIDs.</summary>
    public static string CurrentRid =>
        RuntimeInformation.IsOSPlatform(OSPlatform.Windows) ? "win-x64" : "linux-x64";

    /// <summary>True on platforms where the helper-batch self-replace is supported.</summary>
    public static bool SupportsSelfReplace => RuntimeInformation.IsOSPlatform(OSPlatform.Windows);

    /// <summary>
    /// Downloads <paramref name="asset"/> to a per-version temp folder and, on Windows,
    /// extracts the zip into a staging directory. <paramref name="progress"/> receives
    /// download fraction 0..1.
    /// </summary>
    public async Task<StagedUpdate> DownloadAsync(
        string version,
        ReleaseAsset asset,
        IProgress<double>? progress = null,
        CancellationToken ct = default)
    {
        ArgumentNullException.ThrowIfNull(asset);

        var root = Path.Combine(Path.GetTempPath(), "Sprint", "updates", Sanitize(version));
        Directory.CreateDirectory(root);
        var archivePath = Path.Combine(root, asset.Name);

        await DownloadToFileAsync(asset.DownloadUrl, archivePath, progress, ct).ConfigureAwait(false);

        // A previous failed/self-replace attempt can leave its staged executable
        // temporarily locked by Explorer or an image scanner. Never make a retry
        // depend on deleting that directory; isolate every extraction instead.
        var stagingDir = Path.Combine(root, $"staged-{Guid.NewGuid():N}");
        Directory.CreateDirectory(stagingDir);
        if (archivePath.EndsWith(".zip", StringComparison.OrdinalIgnoreCase))
        {
            ZipFile.ExtractToDirectory(archivePath, stagingDir, overwriteFiles: true);
        }

        return new StagedUpdate(stagingDir, archivePath);
    }

    /// <summary>
    /// Writes and launches the helper batch that replaces the running install with the
    /// staged build and relaunches. The caller must shut the app down immediately after
    /// this returns so the batch's file swap can proceed.
    /// </summary>
    public static void LaunchWindowsSelfReplace(string stagingDir)
    {
        var processPath = Environment.ProcessPath
            ?? throw new InvalidOperationException("Cannot resolve the running executable path.");
        var installDir = Path.GetDirectoryName(processPath)
            ?? throw new InvalidOperationException("Cannot resolve the install directory.");
        var exeName = Path.GetFileName(processPath);

        // Protected locations such as Program Files need an elevated helper. Launch
        // it before the app exits so a declined UAC prompt leaves this build running.
        var requiresElevation = !IsInstallDirectoryWritable(installDir);

        var pid = Environment.ProcessId;
        var batchPath = Path.Combine(Path.GetTempPath(), "Sprint", $"apply-update-{pid}.bat");
        var completionPath = requiresElevation
            ? Path.Combine(Path.GetTempPath(), "Sprint", $"apply-update-{pid}.done")
            : null;
        var batch = UpdateScript.BuildWindowsBatch(
            pid,
            stagingDir,
            installDir,
            exeName,
            completionPath);
        File.WriteAllText(batchPath, batch);

        Process? relaunchWatcher = null;
        string? relaunchBatchPath = null;
        try
        {
            if (completionPath is not null)
            {
                File.Delete(completionPath);
                relaunchBatchPath = Path.Combine(
                    Path.GetTempPath(),
                    "Sprint",
                    $"relaunch-update-{pid}.bat");
                File.WriteAllText(
                    relaunchBatchPath,
                    UpdateScript.BuildWindowsRelaunchBatch(
                        completionPath,
                        installDir,
                        exeName));
                relaunchWatcher = Process.Start(
                    CreateWindowsHelperStartInfo(
                        relaunchBatchPath,
                        requiresElevation: false));
                if (relaunchWatcher is null)
                {
                    throw new Win32Exception("The update relaunch watcher could not start.");
                }
            }

            if (Process.Start(CreateWindowsHelperStartInfo(batchPath, requiresElevation)) is null)
            {
                throw new Win32Exception("The update helper could not start.");
            }
        }
        catch
        {
            StopRelaunchWatcher(relaunchWatcher);
            TryDelete(relaunchBatchPath);
            TryDelete(completionPath);
            throw;
        }
    }

    internal static bool IsInstallDirectoryWritable(string installDir)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(installDir);
        var probePath = Path.Combine(installDir, $".sprint-update-access-{Guid.NewGuid():N}.tmp");

        try
        {
            using var _ = new FileStream(
                probePath,
                FileMode.CreateNew,
                FileAccess.Write,
                FileShare.None,
                bufferSize: 1,
                FileOptions.DeleteOnClose);
            return true;
        }
        catch (IOException)
        {
            return false;
        }
        catch (UnauthorizedAccessException)
        {
            return false;
        }
    }

    internal static ProcessStartInfo CreateWindowsHelperStartInfo(
        string batchPath,
        bool requiresElevation)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(batchPath);
        return new ProcessStartInfo
        {
            FileName = batchPath,
            UseShellExecute = true,
            Verb = requiresElevation ? "runas" : "",
            CreateNoWindow = true,
            WindowStyle = ProcessWindowStyle.Hidden,
        };
    }

    internal static string DescribeFailure(Exception error) => error switch
    {
        HttpRequestException =>
            "Update failed — the download could not be completed. Check your connection and try again.",
        InvalidDataException =>
            "Update failed — the downloaded archive is invalid. Download the release manually.",
        UnauthorizedAccessException =>
            "Update failed — the install folder is not writable. Move Sprint to a writable folder or install manually.",
        IOException io when IsFileBusy(io) =>
            "Update failed — a local update file is busy. Close Explorer and try again.",
        IOException =>
            "Update failed — a local file could not be written. Check free disk space and try again.",
        Win32Exception { NativeErrorCode: 1223 } =>
            "Update canceled — Windows permission was not granted. Sprint is still running.",
        Win32Exception =>
            "Update failed — the install helper could not start. Install the downloaded release manually.",
        _ =>
            "Update failed — try again or install the downloaded release manually.",
    };

    private static bool IsFileBusy(IOException error) =>
        (error.HResult & 0xFFFF) is 32 or 33;

    private static void StopRelaunchWatcher(Process? watcher)
    {
        if (watcher is null)
        {
            return;
        }

        try
        {
            if (!watcher.HasExited)
            {
                watcher.Kill(entireProcessTree: true);
                watcher.WaitForExit(2_000);
            }
        }
        catch (InvalidOperationException)
        {
            // The short-lived wrapper already exited.
        }
        finally
        {
            watcher.Dispose();
        }
    }

    private static void TryDelete(string? path)
    {
        if (string.IsNullOrWhiteSpace(path))
        {
            return;
        }

        try
        {
            File.Delete(path);
        }
        catch (IOException)
        {
            // Best-effort cleanup; the temp path is reused and overwritten next time.
        }
        catch (UnauthorizedAccessException)
        {
            // Best-effort cleanup; the temp path is reused and overwritten next time.
        }
    }

    /// <summary>Opens the folder holding a staged/downloaded update (Linux + fallback path).</summary>
    public static void RevealInFolder(string path)
    {
        var folder = Directory.Exists(path) ? path : Path.GetDirectoryName(path) ?? path;
        Process.Start(new ProcessStartInfo { FileName = folder, UseShellExecute = true });
    }

    private async Task DownloadToFileAsync(string url, string destination, IProgress<double>? progress, CancellationToken ct)
    {
        using var response = await _http
            .GetAsync(url, HttpCompletionOption.ResponseHeadersRead, ct)
            .ConfigureAwait(false);
        response.EnsureSuccessStatusCode();

        var total = response.Content.Headers.ContentLength ?? -1L;
        await using var source = await response.Content.ReadAsStreamAsync(ct).ConfigureAwait(false);
        await using var target = new FileStream(destination, FileMode.Create, FileAccess.Write, FileShare.None);

        var buffer = new byte[81920];
        long read = 0;
        int n;
        while ((n = await source.ReadAsync(buffer, ct).ConfigureAwait(false)) > 0)
        {
            await target.WriteAsync(buffer.AsMemory(0, n), ct).ConfigureAwait(false);
            read += n;
            if (total > 0)
            {
                progress?.Report(Math.Clamp((double)read / total, 0, 1));
            }
        }

        progress?.Report(1);
    }

    private static string Sanitize(string version)
    {
        var invalid = Path.GetInvalidFileNameChars();
        var cleaned = new string(version.Select(c => invalid.Contains(c) ? '_' : c).ToArray()).Trim();
        return string.IsNullOrWhiteSpace(cleaned) ? "latest" : cleaned;
    }

    private static HttpClient CreateClient()
    {
        var client = new HttpClient { Timeout = TimeSpan.FromMinutes(5) };
        client.DefaultRequestHeaders.UserAgent.ParseAdd("Sprint-Desktop-Updater");
        return client;
    }
}

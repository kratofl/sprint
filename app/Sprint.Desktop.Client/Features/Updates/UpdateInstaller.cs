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

        var stagingDir = Path.Combine(root, "staged");
        if (Directory.Exists(stagingDir))
        {
            Directory.Delete(stagingDir, recursive: true);
        }

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

        // Fail while the current build is still running when an archive was placed in
        // a protected install location (for example Program Files). The UI can then
        // report the manual fallback instead of exiting into a guaranteed copy failure.
        EnsureInstallDirectoryWritable(installDir);

        var pid = Environment.ProcessId;
        var batch = UpdateScript.BuildWindowsBatch(pid, stagingDir, installDir, exeName);
        var batchPath = Path.Combine(Path.GetTempPath(), "Sprint", $"apply-update-{pid}.bat");
        File.WriteAllText(batchPath, batch);

        Process.Start(new ProcessStartInfo
        {
            FileName = batchPath,
            UseShellExecute = true,
            CreateNoWindow = true,
            WindowStyle = ProcessWindowStyle.Hidden,
        });
    }

    internal static void EnsureInstallDirectoryWritable(string installDir)
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
        }
        catch (Exception ex) when (ex is IOException or UnauthorizedAccessException)
        {
            throw new InvalidOperationException(
                $"Sprint cannot replace files in the install directory '{installDir}'.",
                ex);
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

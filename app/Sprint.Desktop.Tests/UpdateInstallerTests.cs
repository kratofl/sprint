using System.IO.Compression;
using System.Net;
using System.ComponentModel;
using System.Diagnostics;
using Sprint.Desktop.Features.Updates;
using Xunit;

namespace Sprint.Desktop.Tests;

public sealed class UpdateInstallerTests
{
    [Fact]
    public async Task RetryUsesFreshStagingWhenPreviousAttemptIsStillLocked()
    {
        string version = $"retry-{Guid.NewGuid():N}";
        string versionRoot = Path.Combine(Path.GetTempPath(), "Sprint", "updates", version);
        string previousStaging = Path.Combine(versionRoot, "staged");
        string previousExe = Path.Combine(previousStaging, "Sprint.exe");
        Directory.CreateDirectory(previousStaging);
        File.WriteAllText(previousExe, "old");

        await using FileStream lockedPreviousExe = new FileStream(
            previousExe,
            FileMode.Open,
            FileAccess.Read,
            FileShare.Read);

        try
        {
            using HttpClient client = new HttpClient(new StaticResponseHandler(CreateUpdateZip()));
            UpdateInstaller installer = new UpdateInstaller(client);
            ReleaseAsset asset = new ReleaseAsset(
                $"sprint-{version}-windows-amd64.zip",
                "https://example.test/update.zip");

            StagedUpdate staged = await installer.DownloadAsync(version, asset);

            Assert.NotEqual(previousStaging, staged.StagingDir);
            Assert.Equal(
                "new",
                await File.ReadAllTextAsync(
                    Path.Combine(staged.StagingDir, "Sprint.exe")));
        }
        finally
        {
            await lockedPreviousExe.DisposeAsync();
            Directory.Delete(versionRoot, recursive: true);
        }
    }

    [Fact]
    public void WritableInstallDirectoryDoesNotRequireElevationOrLeaveProbeFiles()
    {
        string installDir = Path.Combine(Path.GetTempPath(), $"sprint-update-access-{Guid.NewGuid():N}");
        Directory.CreateDirectory(installDir);

        try
        {
            Assert.True(UpdateInstaller.IsInstallDirectoryWritable(installDir));
            Assert.Empty(Directory.EnumerateFileSystemEntries(installDir));
        }
        finally
        {
            Directory.Delete(installDir);
        }
    }

    [Fact]
    public void BlockedInstallPathRequiresElevation()
    {
        string root = Path.Combine(Path.GetTempPath(), $"sprint-update-access-{Guid.NewGuid():N}");
        Directory.CreateDirectory(root);
        string blockedPath = Path.Combine(root, "not-a-directory");
        File.WriteAllText(blockedPath, "");

        try
        {
            Assert.False(UpdateInstaller.IsInstallDirectoryWritable(blockedPath));
        }
        finally
        {
            Directory.Delete(root, recursive: true);
        }
    }

    [Fact]
    public void ProtectedInstallUsesWindowsElevationForTheHelper()
    {
        ProcessStartInfo startInfo = UpdateInstaller.CreateWindowsHelperStartInfo(
            @"C:\Temp\Sprint\apply-update-123.bat",
            requiresElevation: true);

        Assert.True(startInfo.UseShellExecute);
        Assert.Equal("runas", startInfo.Verb);
        Assert.Equal(ProcessWindowStyle.Hidden, startInfo.WindowStyle);
    }

    [Fact]
    public void CancelledElevationHasSpecificFailureMessage()
    {
        string message = UpdateInstaller.DescribeFailure(
            new Win32Exception(1223, "The operation was canceled by the user."));

        Assert.Equal(
            "Update canceled — Windows permission was not granted. Sprint is still running.",
            message);
    }

    [Fact]
    public void FailureMessageExplainsBusyLocalUpdateFile()
    {
        string message = UpdateInstaller.DescribeFailure(
            new IOException(
                "The process cannot access the file because it is in use.",
                unchecked((int)0x80070020)));

        Assert.Equal(
            "Update failed — a local update file is busy. Close Explorer and try again.",
            message);
    }

    [Fact]
    public void GenericIoFailureDoesNotClaimTheFileIsBusy()
    {
        string message = UpdateInstaller.DescribeFailure(
            new IOException("There is not enough space on the disk."));

        Assert.Equal(
            "Update failed — a local file could not be written. Check free disk space and try again.",
            message);
    }

    private static byte[] CreateUpdateZip()
    {
        using MemoryStream bytes = new MemoryStream();
        using (ZipArchive archive = new ZipArchive(bytes, ZipArchiveMode.Create, leaveOpen: true))
        {
            ZipArchiveEntry entry = archive.CreateEntry("Sprint.exe");
            using StreamWriter writer = new StreamWriter(entry.Open());
            writer.Write("new");
        }

        return bytes.ToArray();
    }

    private sealed class StaticResponseHandler(byte[] content) : HttpMessageHandler
    {
        protected override Task<HttpResponseMessage> SendAsync(
            HttpRequestMessage request,
            CancellationToken cancellationToken) =>
            Task.FromResult(new HttpResponseMessage(HttpStatusCode.OK)
            {
                Content = new ByteArrayContent(content),
                RequestMessage = request,
            });
    }
}

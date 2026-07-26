using System.ComponentModel;
using System.Diagnostics;
using Sprint.Desktop.Features.Updates;
using Xunit;

namespace Sprint.Desktop.Tests;

public sealed class UpdateScriptTests
{
    private const int Pid = 4321;
    private const string Staging = @"C:\Temp\Sprint\updates\1.2.3\staged";
    private const string Install = @"C:\Program Files\Sprint";
    private const string Exe = "Sprint.Desktop.Client.exe";

    private static string Build() => UpdateScript.BuildWindowsBatch(Pid, Staging, Install, Exe);

    [Fact]
    public void WaitsForTheRunningProcessToExit()
    {
        var batch = Build();
        Assert.Contains("set \"PID=4321\"", batch);
        Assert.Contains(":waitloop", batch);
        Assert.Contains("tasklist /FI \"PID eq %PID%\"", batch);
        Assert.Contains("goto waitloop", batch);
    }

    [Fact]
    public void CopiesStagedBuildOverInstallDirWithQuotedPaths()
    {
        var batch = Build();
        Assert.Contains($"robocopy \"{Staging}\" \"{Install}\" /E", batch);
    }

    [Fact]
    public void RelaunchesTheExeAndSelfDeletes()
    {
        var batch = Build();
        Assert.Contains($"start \"\" \"{Install}\\{Exe}\"", batch);
        Assert.Contains("del \"%~f0\"", batch);
    }

    [Fact]
    public void SurfacesAPersistentCopyFailureBeforeRelaunchingTheOldBuild()
    {
        var batch = Build();
        var copy = batch.IndexOf("robocopy ", StringComparison.Ordinal);
        var failureGuard = batch.IndexOf("if errorlevel 8 goto updatefailed", StringComparison.Ordinal);
        var failureLabel = batch.IndexOf(":updatefailed", StringComparison.Ordinal);
        var reveal = batch.IndexOf("start \"\" explorer.exe", failureLabel, StringComparison.Ordinal);
        var relaunch = batch.IndexOf(
            $"start \"\" \"{Install}\\{Exe}\"",
            failureLabel,
            StringComparison.Ordinal);

        Assert.True(
            copy >= 0
            && failureGuard > copy
            && failureLabel > failureGuard
            && reveal > failureLabel
            && relaunch > reveal);
        Assert.Contains("apply-update-%PID%.log", batch);
        Assert.Contains($"start \"\" explorer.exe /select,\"{Staging}\\{Exe}\"", batch);
    }

    [Fact]
    public void CopiesThePrimaryExecutableLast()
    {
        var batch = Build();
        var supportCopy = batch.IndexOf($"/XF \"{Exe}\"", StringComparison.Ordinal);
        var supportGuard = batch.IndexOf(
            "if errorlevel 8 goto updatefailed",
            supportCopy,
            StringComparison.Ordinal);
        var executableCopy = batch.IndexOf(
            $"\"{Exe}\" /R:30",
            supportGuard,
            StringComparison.Ordinal);
        var executableGuard = batch.IndexOf(
            "if errorlevel 8 goto updatefailed",
            executableCopy,
            StringComparison.Ordinal);
        var successRelaunch = batch.IndexOf(
            $"start \"\" \"{Install}\\{Exe}\"",
            executableGuard,
            StringComparison.Ordinal);

        Assert.True(
            supportCopy >= 0
            && supportGuard > supportCopy
            && executableCopy > supportGuard
            && executableGuard > executableCopy
            && successRelaunch > executableGuard);
    }

    [Fact]
    public void ElevatedApplySignalsWatcherInsteadOfRelaunchingSprint()
    {
        const string completion = @"C:\Temp\Sprint\apply-update-4321.done";

        var batch = UpdateScript.BuildWindowsBatch(
            Pid,
            Staging,
            Install,
            Exe,
            completion);

        Assert.DoesNotContain($"start \"\" \"{Install}\\{Exe}\"", batch);
        Assert.Contains($"echo success>\"{completion}\"", batch);
        Assert.Contains($"echo failure>\"{completion}\"", batch);
    }

    [Fact]
    public void RelaunchWatcherWaitsForApplyThenStartsSprintAsItsOwnChild()
    {
        const string completion = @"C:\Temp\Sprint\apply-update-4321.done";

        var batch = UpdateScript.BuildWindowsRelaunchBatch(completion, Install, Exe);

        Assert.Contains($"set \"RESULT={completion}\"", batch);
        Assert.Contains("if exist \"%RESULT%\" goto relaunch", batch);
        Assert.Contains($"start \"\" \"{Install}\\{Exe}\"", batch);
        Assert.Contains("del \"%RESULT%\"", batch);
        Assert.Contains("del \"%~f0\"", batch);
    }

    [Fact]
    public void UsesCrlfLineEndings()
    {
        Assert.Contains("\r\n", Build());
    }

    [Fact]
    public async Task RetriesTheCopyUntilAPostExitExecutableLockIsReleased()
    {
        if (!OperatingSystem.IsWindows())
        {
            return;
        }

        var root = Path.Combine(Path.GetTempPath(), $"sprint-update-script-{Guid.NewGuid():N}");
        var staging = Path.Combine(root, "staged");
        var install = Path.Combine(root, "installed");
        var exe = "Sprint.Test.exe";
        var stagedExe = Path.Combine(staging, exe);
        var installedExe = Path.Combine(install, exe);
        var batchPath = Path.Combine(root, "apply-update.bat");
        var completionPath = Path.Combine(root, "apply-update.done");

        Directory.CreateDirectory(staging);
        Directory.CreateDirectory(install);
        // Identical size + timestamp reproduces the metadata case where robocopy
        // otherwise classifies different content as "same" and skips replacement.
        // A completion marker suppresses relaunch, so deterministic byte fixtures
        // exercise copy/retry semantics without starting another process.
        await File.WriteAllBytesAsync(stagedExe, Enumerable.Repeat((byte)0xA5, 4096).ToArray());
        await File.WriteAllBytesAsync(installedExe, Enumerable.Repeat((byte)0x5A, 4096).ToArray());
        var sharedTimestamp = DateTime.UtcNow.AddMinutes(-5);
        File.SetLastWriteTimeUtc(stagedExe, sharedTimestamp);
        File.SetLastWriteTimeUtc(installedExe, sharedTimestamp);

        FileStream? executableLock = null;
        Process? helper = null;
        try
        {
            File.WriteAllText(
                batchPath,
                UpdateScript.BuildWindowsBatch(
                    int.MaxValue,
                    staging,
                    install,
                    exe,
                    completionPath));

            executableLock = new FileStream(
                installedExe,
                FileMode.Open,
                FileAccess.Read,
                FileShare.Read);
            helper = StartHelper(batchPath);

            // The original helper exhausted /R:3 /W:2 in roughly six seconds and
            // relaunched the old build. Real executable/image scanners can retain the
            // closed process's file lock for longer than that.
            await Task.Delay(TimeSpan.FromSeconds(8));
            executableLock.Dispose();

            await helper.WaitForExitAsync().WaitAsync(TimeSpan.FromSeconds(30));

            Assert.Equal(
                await File.ReadAllBytesAsync(stagedExe),
                await File.ReadAllBytesAsync(installedExe));
        }
        finally
        {
            executableLock?.Dispose();
            await StopProcessTreeAsync(helper);
            await StopProcessesFromPathAsync(installedExe);
            await DeleteDirectoryEventuallyAsync(root);
        }
    }

    [Theory]
    [InlineData("", Install, Exe)]
    [InlineData(Staging, "", Exe)]
    [InlineData(Staging, Install, "")]
    public void RejectsBlankArguments(string staging, string install, string exe)
    {
        Assert.ThrowsAny<System.ArgumentException>(() => UpdateScript.BuildWindowsBatch(Pid, staging, install, exe));
    }

    private static Process StartHelper(string batchPath) =>
        Process.Start(new ProcessStartInfo
        {
            FileName = "cmd.exe",
            Arguments = $"/d /c \"{batchPath}\"",
            CreateNoWindow = true,
            UseShellExecute = false,
        })!;

    private static async Task StopProcessTreeAsync(Process? process)
    {
        if (process is null)
        {
            return;
        }

        try
        {
            if (!process.HasExited)
            {
                process.Kill(entireProcessTree: true);
                await process.WaitForExitAsync();
            }
        }
        catch (InvalidOperationException)
        {
            // The helper exited between HasExited and Kill.
        }
        finally
        {
            process.Dispose();
        }
    }

    private static async Task StopProcessesFromPathAsync(string executablePath)
    {
        var processName = Path.GetFileNameWithoutExtension(executablePath);
        foreach (var process in Process.GetProcessesByName(processName))
        {
            try
            {
                if (!string.Equals(
                        process.MainModule?.FileName,
                        executablePath,
                        StringComparison.OrdinalIgnoreCase))
                {
                    continue;
                }

                if (!process.HasExited)
                {
                    process.Kill(entireProcessTree: true);
                    await process.WaitForExitAsync();
                }
            }
            catch (Exception ex) when (ex is InvalidOperationException or Win32Exception)
            {
                // The short-lived fixture exited while it was being inspected.
            }
            finally
            {
                process.Dispose();
            }
        }

        Assert.DoesNotContain(
            Process.GetProcessesByName(processName),
            process =>
            {
                using (process)
                {
                    try
                    {
                        return string.Equals(
                            process.MainModule?.FileName,
                            executablePath,
                            StringComparison.OrdinalIgnoreCase);
                    }
                    catch (Exception ex) when (ex is InvalidOperationException or Win32Exception)
                    {
                        return false;
                    }
                }
            });
    }

    private static async Task DeleteDirectoryEventuallyAsync(string path)
    {
        for (var attempt = 0; attempt < 50 && Directory.Exists(path); attempt++)
        {
            try
            {
                Directory.Delete(path, recursive: true);
                return;
            }
            catch (Exception ex) when (ex is IOException or UnauthorizedAccessException)
            {
                await Task.Delay(100);
            }
        }

        Assert.False(Directory.Exists(path), $"Expected test cleanup to remove '{path}'.");
    }
}

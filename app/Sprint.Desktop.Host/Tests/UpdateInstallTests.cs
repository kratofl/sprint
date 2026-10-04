using Sprint.Desktop.Features.Updates;
using Xunit;

namespace Sprint.Desktop.Host.Tests;

/// <summary>
/// Focused tests for the <c>POST /api/updates/install</c> boundary (WEB_DESKTOP_CUTOVER item 2):
/// the endpoint hands <see cref="UpdateInstallTargetValidator"/> caller-supplied
/// pid/installDir/exeName and treats them as hostile, since a valid target makes the host
/// overwrite a directory and launch a batch file. Covers every rejection case plus the one
/// success case. A second group proves the values the Electron caller supplies -- not this
/// process's own <see cref="Environment.ProcessPath"/> -- are what reach
/// <see cref="UpdateScript.BuildWindowsBatch"/>; it stops short of calling
/// <see cref="UpdateInstaller.LaunchWindowsSelfReplace(string, int, string, string)"/> itself,
/// which would launch a real batch process and is out of scope for a test run.
/// </summary>
public sealed class UpdateInstallTests
{
    [Theory]
    [InlineData(0)]
    [InlineData(-1)]
    public void RejectsNonPositivePid(int pid)
    {
        string installDir = NewInstallDirWithExe(out string exeName);
        try
        {
            bool ok = UpdateInstallTargetValidator.TryValidate(pid, installDir, exeName, out _, out string? error);

            Assert.False(ok);
            Assert.Equal("pid must be a positive integer.", error);
        }
        finally
        {
            Cleanup(installDir);
        }
    }

    [Theory]
    [InlineData(null)]
    [InlineData("")]
    [InlineData("   ")]
    public void RejectsMissingInstallDir(string? installDir)
    {
        bool ok = UpdateInstallTargetValidator.TryValidate(123, installDir, "Sprint.exe", out _, out string? error);

        Assert.False(ok);
        Assert.Equal("installDir is required.", error);
    }

    [Fact]
    public void RejectsARelativeInstallDir()
    {
        bool ok = UpdateInstallTargetValidator.TryValidate(123, @"relative\path", "Sprint.exe", out _, out string? error);

        Assert.False(ok);
        Assert.Equal("installDir must be an absolute path.", error);
    }

    [Fact]
    public void RejectsAnInstallDirThatDoesNotExist()
    {
        string missing = Path.Combine(Path.GetTempPath(), "Sprint.Desktop.Host.Tests", Guid.NewGuid().ToString("N"));

        bool ok = UpdateInstallTargetValidator.TryValidate(123, missing, "Sprint.exe", out _, out string? error);

        Assert.False(ok);
        Assert.Equal("installDir does not exist.", error);
    }

    [Theory]
    [InlineData(null)]
    [InlineData("")]
    [InlineData("   ")]
    public void RejectsMissingExeName(string? exeName)
    {
        string installDir = NewInstallDir();
        try
        {
            bool ok = UpdateInstallTargetValidator.TryValidate(123, installDir, exeName, out _, out string? error);

            Assert.False(ok);
            Assert.Equal("exeName is required.", error);
        }
        finally
        {
            Cleanup(installDir);
        }
    }

    [Theory]
    [InlineData(@"sub\Sprint.exe")]
    [InlineData("sub/Sprint.exe")]
    [InlineData(@"..\Sprint.exe")]
    [InlineData("Sprint..exe")]
    public void RejectsAnExeNameThatIsNotABareFileName(string exeName)
    {
        string installDir = NewInstallDir();
        try
        {
            bool ok = UpdateInstallTargetValidator.TryValidate(123, installDir, exeName, out _, out string? error);

            Assert.False(ok);
            Assert.Equal("exeName must be a bare file name.", error);
        }
        finally
        {
            Cleanup(installDir);
        }
    }

    [Fact]
    public void RejectsAnExeNameThatDoesNotEndInExe()
    {
        string installDir = NewInstallDir();
        File.WriteAllText(Path.Combine(installDir, "Sprint.dll"), "");
        try
        {
            bool ok = UpdateInstallTargetValidator.TryValidate(123, installDir, "Sprint.dll", out _, out string? error);

            Assert.False(ok);
            Assert.Equal("exeName must end in .exe.", error);
        }
        finally
        {
            Cleanup(installDir);
        }
    }

    [Fact]
    public void RejectsAnExeNameNotFoundInsideInstallDir()
    {
        string installDir = NewInstallDir();
        try
        {
            bool ok = UpdateInstallTargetValidator.TryValidate(123, installDir, "Sprint.exe", out _, out string? error);

            Assert.False(ok);
            Assert.Equal("exeName was not found inside installDir.", error);
        }
        finally
        {
            Cleanup(installDir);
        }
    }

    [Fact]
    public void AcceptsAPositivePidAnExistingAbsoluteInstallDirAndAMatchingBareExeName()
    {
        string installDir = NewInstallDirWithExe(out string exeName);
        try
        {
            bool ok = UpdateInstallTargetValidator.TryValidate(4321, installDir, exeName, out UpdateInstallTarget? target, out string? error);

            Assert.True(ok);
            Assert.Null(error);
            Assert.Equal(new UpdateInstallTarget(4321, installDir, exeName), target);
        }
        finally
        {
            Cleanup(installDir);
        }
    }

    /// <summary>
    /// The endpoint's whole point is that the target comes from the Electron caller, not from
    /// this (host) process's own <see cref="Environment.ProcessPath"/>. Proves the caller-supplied
    /// pid/installDir/exeName -- values that could never equal this test host's own process
    /// identity or location -- are exactly what would land in the generated batch, without
    /// actually launching it.
    /// </summary>
    [Fact]
    public void CallerSuppliedTargetValuesReachUpdateScriptUnchanged()
    {
        const int electronPid = 999_999;
        const string electronInstallDir = @"C:\Users\driver\AppData\Local\Programs\Sprint";
        const string electronExeName = "Sprint.exe";

        Assert.NotEqual(electronPid, Environment.ProcessId);

        const string stagingDir = @"C:\Temp\Sprint\updates\9.9.9\staged";
        string batch = UpdateScript.BuildWindowsBatch(
            electronPid,
            stagingDir,
            electronInstallDir,
            electronExeName,
            revealStagingOnFailure: false);

        Assert.Contains($"set \"PID={electronPid}\"", batch);
        Assert.Contains($"robocopy \"{stagingDir}\" \"{electronInstallDir}\"", batch);
        Assert.Contains($"start \"\" \"{electronInstallDir}\\{electronExeName}\"", batch);
    }

    private static string NewInstallDir()
    {
        string dir = Path.Combine(Path.GetTempPath(), "Sprint.Desktop.Host.Tests", "updates", Guid.NewGuid().ToString("N"));
        Directory.CreateDirectory(dir);
        return dir;
    }

    private static string NewInstallDirWithExe(out string exeName)
    {
        string dir = NewInstallDir();
        exeName = "Sprint.exe";
        File.WriteAllText(Path.Combine(dir, exeName), "");
        return dir;
    }

    private static void Cleanup(string installDir)
    {
        if (Directory.Exists(installDir))
        {
            Directory.Delete(installDir, recursive: true);
        }
    }
}

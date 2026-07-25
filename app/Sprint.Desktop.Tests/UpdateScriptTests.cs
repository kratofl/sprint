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
    public void UsesCrlfLineEndings()
    {
        Assert.Contains("\r\n", Build());
    }

    [Theory]
    [InlineData("", Install, Exe)]
    [InlineData(Staging, "", Exe)]
    [InlineData(Staging, Install, "")]
    public void RejectsBlankArguments(string staging, string install, string exe)
    {
        Assert.ThrowsAny<System.ArgumentException>(() => UpdateScript.BuildWindowsBatch(Pid, staging, install, exe));
    }
}

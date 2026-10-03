using Sprint.Desktop.Features.Hardware;
using Sprint.Desktop.Features.Updates;
using Sprint.Desktop.Runtime;
using Xunit;

namespace Sprint.Desktop.Tests;

/// <summary>
/// The test run must not reach out of the process: no driving the developer's real wheel
/// screen through a hardware publisher, and no Explorer windows popped from the update
/// paths. Those effects are gated by <see cref="HostEffects"/>, and this pins the gate shut.
/// </summary>
public sealed class HostEffectsTests
{
    [Fact]
    public void TheTestRunHasHostEffectsDisabled()
    {
        // Set once by the assembly's module initializer, so a test added later cannot forget.
        Assert.False(HostEffects.Enabled);
    }

    [Theory]
    [InlineData("vocore")]
    [InlineData("usbd480")]
    [InlineData("unknown")]
    public void NoRealScreenDriverIsEverCreatedDuringTests(string driver)
    {
        // The wheel is physically attached to the machine running these tests. Opening it and
        // pushing frames at it is the one side effect no assertion could justify.
        Assert.IsType<FakeScreenDriver>(ScreenDriverFactory.Create(driver));
    }

    [Fact]
    public void TheUpdateHelperDoesNotOpenExplorerDuringTests()
    {
        var batch = UpdateScript.BuildWindowsBatch(4321, "C:/staging", "C:/install", "Sprint.exe");

        // UpdateScriptTests executes this batch for real, so a reveal line here opens a window
        // on the developer's desktop.
        Assert.DoesNotContain("explorer.exe", batch);
    }

    [Fact]
    public void TheRevealLineIsStillProducibleWhenAskedForExplicitly()
    {
        // The product does reveal the staging folder on a permanent failure; a test asserting
        // the script text has to be able to see it without the gate hiding it.
        var batch = UpdateScript.BuildWindowsBatch(
            4321,
            "C:/staging",
            "C:/install",
            "Sprint.exe",
            revealStagingOnFailure: true);

        Assert.Contains("explorer.exe", batch);
    }

    [Fact]
    public void RevealingAFolderIsANoOpDuringTests()
    {
        // Returns false rather than throwing: callers show their own fallback message, and a
        // test must not be able to spawn a file-manager window.
        Assert.False(HostEffects.TryRevealInFileManager(Path.GetTempPath()));
    }
}

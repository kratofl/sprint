using Xunit;

namespace Sprint.Desktop.Tests;

public sealed class AgentUiReviewTests
{
    [Fact]
    [Trait("Category", "AgentUiReview")]
    public async Task Agent_ui_review_harness_generates_journey_report_and_screenshots()
    {
        var result = await AgentUiReviewHarness.GenerateAsync();

        Assert.True(Directory.Exists(result.ArtifactRoot), $"Expected artifact directory at {result.ArtifactRoot}.");
        Assert.True(File.Exists(result.ReportPath), $"Expected report at {result.ReportPath}.");
        Assert.Contains("Sprint agent UI review", File.ReadAllText(result.ReportPath));
        Assert.Contains(result.Frames, frame => frame.Name == "home-runtime-overview");
        Assert.Contains(result.Frames, frame => frame.Name == "devices-detail");
        Assert.Contains(result.Frames, frame => frame.Name == "setups-duplicated-user-copy");
        Assert.Contains(result.Frames, frame => frame.Name == "dash-editor-layout");

        foreach (var frame in result.Frames)
        {
            Assert.True(File.Exists(frame.ImagePath), $"Expected screenshot for {frame.Name} at {frame.ImagePath}.");
            Assert.True(new FileInfo(frame.ImagePath).Length > 0, $"Expected screenshot for {frame.Name} to be non-empty.");
            Assert.NotEmpty(frame.VisibleText);
            Assert.Empty(frame.Failures);
        }
    }
}

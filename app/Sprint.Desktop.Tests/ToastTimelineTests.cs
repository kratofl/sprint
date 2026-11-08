using Sprint.Desktop.Features.Notifications;
using Xunit;

namespace Sprint.Desktop.Tests;

public sealed class ToastTimelineTests
{
    [Fact]
    public void CoordinatesEntryLifetimeProgressAndExit()
    {
        ToastAnimationFrame initial = ToastTimeline.Sample(TimeSpan.Zero);
        Assert.Equal(0, initial.Opacity);
        Assert.Equal(18, initial.TranslateX);
        Assert.Equal(100, initial.ProgressPercent);
        Assert.False(initial.Complete);

        ToastAnimationFrame settled = ToastTimeline.Sample(ToastTimeline.EnterDuration);
        Assert.Equal(1, settled.Opacity);
        Assert.Equal(0, settled.TranslateX);

        ToastAnimationFrame halfway = ToastTimeline.Sample(ToastTimeline.Lifetime / 2);
        Assert.Equal(1, halfway.Opacity);
        Assert.Equal(50, halfway.ProgressPercent);

        ToastAnimationFrame complete = ToastTimeline.Sample(ToastTimeline.Lifetime);
        Assert.Equal(0, complete.Opacity);
        Assert.Equal(12, complete.TranslateX);
        Assert.Equal(0, complete.ProgressPercent);
        Assert.True(complete.Complete);
    }

    [Fact]
    public void ReducedMotionKeepsFadeAndProgressButRemovesTranslation()
    {
        ToastAnimationFrame frame = ToastTimeline.Sample(
            TimeSpan.FromMilliseconds(80),
            spatialMotion: false);

        Assert.InRange(frame.Opacity, 0.45, 0.95);
        Assert.Equal(0, frame.TranslateX);
        Assert.InRange(frame.ProgressPercent, 98, 100);
    }
}

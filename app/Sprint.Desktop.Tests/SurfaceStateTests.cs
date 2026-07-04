using Sprint.Desktop.Features.Live;
using Sprint.Desktop.Shell;
using Xunit;

namespace Sprint.Desktop.Tests;

public sealed class SurfaceStateTests
{
    [Fact]
    public void EveryStateHasNonEmptyCopyAndTone()
    {
        foreach (SurfaceState state in Enum.GetValues<SurfaceState>())
        {
            var view = SurfaceStatePresenter.Describe(state);
            Assert.False(string.IsNullOrWhiteSpace(view.Title));
            Assert.IsType<StatusTone>(view.Tone);
        }
    }

    [Fact]
    public void DegradedStatesUseWarnTone()
    {
        Assert.Equal(StatusTone.Warn, SurfaceStatePresenter.Describe(SurfaceState.Stale).Tone);
        Assert.Equal(StatusTone.Warn, SurfaceStatePresenter.Describe(SurfaceState.PermissionDenied).Tone);
        Assert.Equal(StatusTone.Warn, SurfaceStatePresenter.Describe(SurfaceState.Retrying).Tone);
        Assert.Equal(StatusTone.Fault, SurfaceStatePresenter.Describe(SurfaceState.Fault).Tone);
    }
}

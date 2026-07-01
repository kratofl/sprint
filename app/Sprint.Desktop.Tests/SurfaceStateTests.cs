using Sprint.Desktop.Api.Telemetry;
using Sprint.Desktop.Features.Live;
using Sprint.Desktop.Shell;
using Xunit;

namespace Sprint.Desktop.Tests;

public sealed class SurfaceStateTests
{
    [Fact]
    public void ConnectedHealthyLinkHasNoSurfaceState()
    {
        Assert.Null(SurfaceStatePresenter.FromTelemetry(TelemetryConnectionState.Connected, lastFrameValid: true));
    }

    [Fact]
    public void ConnectedButInvalidFrameSurfacesInvalidData()
    {
        Assert.Equal(SurfaceState.InvalidFrame, SurfaceStatePresenter.FromTelemetry(TelemetryConnectionState.Connected, lastFrameValid: false));
    }

    [Theory]
    [InlineData(TelemetryConnectionState.Disconnected, SurfaceState.Disconnected)]
    [InlineData(TelemetryConnectionState.WaitingForGame, SurfaceState.Disconnected)]
    [InlineData(TelemetryConnectionState.Connecting, SurfaceState.Loading)]
    [InlineData(TelemetryConnectionState.Stale, SurfaceState.Stale)]
    [InlineData(TelemetryConnectionState.Unsupported, SurfaceState.Unsupported)]
    [InlineData(TelemetryConnectionState.PermissionDenied, SurfaceState.PermissionDenied)]
    [InlineData(TelemetryConnectionState.Faulted, SurfaceState.Retrying)]
    public void MapsTelemetryStatesToSharedSurfaceStates(TelemetryConnectionState state, SurfaceState expected)
    {
        Assert.Equal(expected, SurfaceStatePresenter.FromTelemetry(state, lastFrameValid: true));
    }

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
    }
}

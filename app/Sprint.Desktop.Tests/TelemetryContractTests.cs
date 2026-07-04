using Sprint.Desktop.Api.Telemetry;
using Sprint.Desktop.Features.Live;
using Sprint.Desktop.Shell;
using Sprint.Games;
using Xunit;

namespace Sprint.Desktop.Tests;

/// <summary>
/// WS3 contract behaviour: telemetry-source lifecycle/health (asserted through the
/// <see cref="ITelemetrySource"/> abstraction, not demo internals), the pure
/// freshness derivation, the honest status presenter, and rate measurement. The
/// degraded link states have no WS3 emitter (the demo is a healthy-link simulator),
/// so they are pinned here over hand-constructed <see cref="TelemetryStatus"/>.
/// </summary>
public class TelemetryContractTests
{
    // Fixed clock so freshness/presenter cases are deterministic (no real time).
    private static readonly DateTimeOffset Now = new(2026, 1, 1, 12, 0, 0, TimeSpan.Zero);

    private static ITelemetrySource NewSource() => GameTelemetryPackage.CreateDemoSource();

    // ---- Lifecycle (against the interface) -------------------------------

    [Fact]
    public void Source_starts_disconnected()
    {
        using var source = NewSource();
        Assert.Equal(TelemetryConnectionState.Disconnected, source.Status.State);
        Assert.NotNull(source.Current);
    }

    [Fact]
    public void Connect_disconnect_reconnect_cycle_is_idempotent_and_never_throws()
    {
        using var source = NewSource();

        source.Connect();
        source.Connect(); // idempotent
        Assert.Equal(TelemetryConnectionState.Connected, source.Status.State);

        source.Disconnect();
        source.Disconnect(); // idempotent
        Assert.Equal(TelemetryConnectionState.Disconnected, source.Status.State);

        source.Connect(); // reusable across cycles (a reconnect loop relies on this)
        Assert.Equal(TelemetryConnectionState.Connected, source.Status.State);
    }

    [Fact]
    public void TryRead_before_connect_returns_false_and_a_nonnull_last_known_frame()
    {
        using var source = NewSource();

        var ok = source.TryRead(out var frame);

        Assert.False(ok);
        Assert.NotNull(frame);
        Assert.Same(source.Current, frame);
    }

    [Fact]
    public void TryRead_after_connect_yields_a_fresh_frame_and_stamps_LastFrameAt()
    {
        using var source = NewSource();
        source.Connect();

        Assert.True(source.TryRead(out var frame));
        Assert.NotNull(frame);
        Assert.Same(source.Current, frame);
        Assert.Equal(TelemetryConnectionState.Connected, source.Status.State);
        Assert.NotNull(source.Status.LastFrameAt);
        Assert.True(source.Status.LastFrameValid);
    }

    [Fact]
    public void Dispose_is_terminal()
    {
        var source = NewSource();
        source.Connect();
        source.Dispose();

        Assert.Equal(TelemetryConnectionState.Disconnected, source.Status.State); // Status still readable
        source.Disconnect(); // no-op after dispose, must not throw
        Assert.Throws<ObjectDisposedException>(() => source.Connect());
        Assert.Throws<ObjectDisposedException>(() => source.TryRead(out _));
    }

    // ---- Freshness (pure) ------------------------------------------------

    [Fact]
    public void Freshness_downgrades_only_a_stale_connected_link()
    {
        var connected = new TelemetryStatus { State = TelemetryConnectionState.Connected, LastFrameAt = Now };

        Assert.Equal(
            TelemetryConnectionState.Connected,
            TelemetryFreshness.Evaluate(connected with { LastFrameAt = Now.AddMilliseconds(-100) }, Now));

        Assert.Equal(
            TelemetryConnectionState.Stale,
            TelemetryFreshness.Evaluate(connected with { LastFrameAt = Now.AddSeconds(-2) }, Now));
    }

    [Fact]
    public void Freshness_leaves_other_states_and_frameless_links_unchanged()
    {
        // Connected but no frame yet: nothing to age out.
        Assert.Equal(
            TelemetryConnectionState.Connected,
            TelemetryFreshness.Evaluate(new TelemetryStatus { State = TelemetryConnectionState.Connected }, Now));

        // A non-connected state is never reinterpreted as stale.
        Assert.Equal(
            TelemetryConnectionState.WaitingForGame,
            TelemetryFreshness.Evaluate(
                new TelemetryStatus { State = TelemetryConnectionState.WaitingForGame, LastFrameAt = Now.AddSeconds(-30) },
                Now));
    }

    [Fact]
    public void Freshness_boundary_is_strictly_greater_than_the_window()
    {
        var window = TelemetryFreshness.DefaultWindow;
        Assert.Equal(TimeSpan.FromMilliseconds(750), window); // pin the documented magnitude

        var atWindow = new TelemetryStatus { State = TelemetryConnectionState.Connected, LastFrameAt = Now - window };
        var pastWindow = new TelemetryStatus { State = TelemetryConnectionState.Connected, LastFrameAt = Now - window - TimeSpan.FromMilliseconds(1) };

        // age == window ⇒ still fresh (the derivation uses a strict '>').
        Assert.Equal(TelemetryConnectionState.Connected, TelemetryFreshness.Evaluate(atWindow, Now));
        // age > window ⇒ stale.
        Assert.Equal(TelemetryConnectionState.Stale, TelemetryFreshness.Evaluate(pastWindow, Now));
    }

    // ---- Status presenter (pure) -----------------------------------------

    [Theory]
    [InlineData(TelemetryConnectionState.Disconnected, "OFFLINE", StatusTone.Idle)]
    [InlineData(TelemetryConnectionState.WaitingForGame, "WAITING FOR GAME", StatusTone.Warn)]
    [InlineData(TelemetryConnectionState.Unsupported, "UNSUPPORTED", StatusTone.Fault)]
    [InlineData(TelemetryConnectionState.PermissionDenied, "NO ACCESS", StatusTone.Fault)]
    [InlineData(TelemetryConnectionState.Faulted, "FAULT", StatusTone.Fault)]
    public void Presenter_maps_link_states_to_labels_and_tones(TelemetryConnectionState state, string label, StatusTone tone)
    {
        // Nonzero rate: the "—" assertion must prove non-live states SUPPRESS the
        // rate, not merely that FormatRate(0) collapses to a dash.
        var view = TelemetryStatusPresenter.ToView(new TelemetryStatus { State = state, SourceName = "Sprint Demo" }, 30, Now);

        Assert.Equal(label, view.Label);
        Assert.Equal(tone, view.Tone);
        Assert.Equal("—", view.RateText); // not live ⇒ no rate
    }

    [Fact]
    public void Presenter_shows_source_name_and_measured_rate_when_live()
    {
        var status = new TelemetryStatus
        {
            State = TelemetryConnectionState.Connected,
            SourceName = "Sprint Demo",
            LastFrameAt = Now
        };

        var view = TelemetryStatusPresenter.ToView(status, 30.4, Now);

        Assert.Equal("SPRINT DEMO", view.Label);
        Assert.Equal(StatusTone.Live, view.Tone);
        Assert.Equal("30 Hz", view.RateText);
    }

    [Fact]
    public void Presenter_distinguishes_connecting_loading_from_retrying()
    {
        var loading = TelemetryStatusPresenter.ToView(
            new TelemetryStatus { State = TelemetryConnectionState.Connecting }, 0, Now);
        Assert.Equal("CONNECTING", loading.Label);

        var retrying = TelemetryStatusPresenter.ToView(
            new TelemetryStatus { State = TelemetryConnectionState.Connecting, LastFrameAt = Now.AddSeconds(-5) }, 0, Now);
        Assert.Equal("RETRYING", retrying.Label);
    }

    [Fact]
    public void Presenter_flags_an_invalid_frame_on_a_live_link()
    {
        var status = new TelemetryStatus
        {
            State = TelemetryConnectionState.Connected,
            SourceName = "Sprint Demo",
            LastFrameAt = Now,
            LastFrameValid = false,
            InvalidReason = "NaN tyre temps"
        };

        var view = TelemetryStatusPresenter.ToView(status, 30, Now);

        Assert.Equal("INVALID FRAME", view.Label);
        Assert.Equal(StatusTone.Warn, view.Tone);
        Assert.Equal("NaN tyre temps", view.Detail);
    }

    [Fact]
    public void Presenter_renders_a_stale_link_via_freshness()
    {
        var status = new TelemetryStatus
        {
            State = TelemetryConnectionState.Connected,
            SourceName = "Sprint Demo",
            LastFrameAt = Now.AddSeconds(-3)
        };

        var view = TelemetryStatusPresenter.ToView(status, 30, Now);

        Assert.Equal("STALE", view.Label);
        Assert.Equal(StatusTone.Warn, view.Tone);
    }

    [Theory]
    [MemberData(nameof(TelemetryHealthCases))]
    public void Presenter_returns_one_titlebar_and_surface_verdict(
        TelemetryStatus status,
        string expectedLabel,
        StatusTone expectedTone,
        SurfaceState? expectedSurface)
    {
        var view = TelemetryStatusPresenter.Present(status, 30, Now);

        Assert.Equal(expectedLabel, view.Titlebar.Label);
        Assert.Equal(expectedTone, view.Titlebar.Tone);
        Assert.Equal(expectedSurface, view.Surface);
    }

    public static IEnumerable<object?[]> TelemetryHealthCases()
    {
        yield return new object?[]
        {
            new TelemetryStatus { State = TelemetryConnectionState.Faulted, Detail = "decode error" },
            "FAULT",
            StatusTone.Fault,
            SurfaceState.Fault
        };
        yield return new object?[]
        {
            new TelemetryStatus
            {
                State = TelemetryConnectionState.Connected,
                SourceName = "Sprint Demo",
                LastFrameAt = Now.AddSeconds(-3),
                LastFrameValid = false,
                InvalidReason = "NaN tyre temps"
            },
            "STALE",
            StatusTone.Warn,
            SurfaceState.Stale
        };
        yield return new object?[]
        {
            new TelemetryStatus { State = TelemetryConnectionState.Connecting, LastFrameAt = Now.AddSeconds(-5) },
            "RETRYING",
            StatusTone.Warn,
            SurfaceState.Retrying
        };
        yield return new object?[]
        {
            new TelemetryStatus
            {
                State = TelemetryConnectionState.Connected,
                SourceName = "Sprint Demo",
                LastFrameAt = Now,
                LastFrameValid = false,
                InvalidReason = "NaN tyre temps"
            },
            "INVALID FRAME",
            StatusTone.Warn,
            SurfaceState.InvalidFrame
        };
        yield return new object?[]
        {
            new TelemetryStatus { State = TelemetryConnectionState.Connected, SourceName = "Sprint Demo", LastFrameAt = Now },
            "SPRINT DEMO",
            StatusTone.Live,
            null
        };
    }

    // ---- Rate meter (pure) -----------------------------------------------

    [Fact]
    public void RateMeter_converges_to_the_sampled_rate()
    {
        var meter = new RateMeter();
        Assert.Equal(0, meter.Hz); // no rate from a single sample

        var t = Now;
        meter.Sample(t);
        for (var i = 0; i < 40; i++)
        {
            t = t.AddMilliseconds(100); // 10 Hz
            meter.Sample(t);
        }

        Assert.InRange(meter.Hz, 9.5, 10.5);

        meter.Reset();
        Assert.Equal(0, meter.Hz);
    }

    [Fact]
    public void RateMeter_eases_toward_a_new_cadence_without_snapping()
    {
        var meter = new RateMeter(0.3);
        var t = Now;
        meter.Sample(t);
        for (var i = 0; i < 30; i++)
        {
            t = t.AddMilliseconds(100); // settle near 10 Hz
            meter.Sample(t);
        }

        Assert.InRange(meter.Hz, 9.5, 10.5);

        // Step the cadence to 20 Hz (50 ms spacing). One sample must ease toward 20
        // (exercising the EMA blend term) but must not snap to the instantaneous rate.
        t = t.AddMilliseconds(50);
        var afterOne = meter.Sample(t);
        Assert.True(afterOne > 10.5, "EMA should move toward the faster cadence.");
        Assert.True(afterOne < 20, "EMA must not snap to the new instantaneous rate in one sample.");

        for (var i = 0; i < 60; i++)
        {
            t = t.AddMilliseconds(50);
            meter.Sample(t);
        }

        Assert.InRange(meter.Hz, 19, 21); // converges to the new cadence
    }

    [Fact]
    public void RateMeter_ignores_nonadvancing_timestamps_and_rejects_bad_smoothing()
    {
        var meter = new RateMeter();
        meter.Sample(Now);
        Assert.Equal(0, meter.Hz);
        meter.Sample(Now); // duplicate timestamp ⇒ no division, rate held
        Assert.Equal(0, meter.Hz);

        Assert.Throws<ArgumentOutOfRangeException>(() => new RateMeter(0));
        Assert.Throws<ArgumentOutOfRangeException>(() => new RateMeter(1.5));
    }
}

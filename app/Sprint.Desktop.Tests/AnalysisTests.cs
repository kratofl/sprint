using Sprint.Desktop.Features.Analysis;
using Sprint.Desktop.Features.Charts;
using Sprint.Desktop.Features.SessionPlanning;
using Xunit;

namespace Sprint.Desktop.Tests;

/// <summary>
/// The Analysis view's rules (#196): which laps the corpus offers, and what two of them look
/// like overlaid. Avalonia-free, so the whole selection story is a unit test.
/// </summary>
public sealed class AnalysisTests
{
    private static readonly DateTimeOffset Now = new(2026, 8, 2, 12, 0, 0, TimeSpan.Zero);
    private const double TrackLength = 5000;

    [Fact]
    public void AnEmptyCorpusSaysSoRatherThanShowingAnEmptyChart()
    {
        var controller = new AnalysisController(new LapCorpusBrowser(
            new FakeHistory(), new FakeTraces()));

        var state = controller.Load();

        Assert.Empty(state.Contexts);
        Assert.Null(state.Stack);
        Assert.Contains("No laps recorded yet", state.Notice, StringComparison.Ordinal);
    }

    [Fact]
    public void ContextsComeFromTheCorpusMostRecentFirst()
    {
        var browser = Browser(
            Session("hs-old", "Spa-Francorchamps", Now.AddDays(-7), traced: true),
            Session("hs-new", "Monza", Now, traced: true));

        var contexts = browser.Contexts();

        Assert.Equal(2, contexts.Count);
        Assert.Equal("Monza", contexts[0].TrackCourse);
    }

    [Fact]
    public void LapsAreListedFastestFirstWithTheirTier()
    {
        var browser = Browser(Session("hs-1", "Spa-Francorchamps", Now, traced: true));

        var laps = browser.Laps(Context("Spa-Francorchamps"));

        Assert.Equal([101.0, 102.0, 103.0], laps.Select(lap => lap.LapTimeSeconds));
        Assert.All(laps, lap => Assert.Equal(LapTargetTier.FullTrace, lap.Tier));
        Assert.Equal("Lap 1 · 1:41.0", laps[0].Label);
    }

    [Fact]
    public void AnInvalidLapIsNotOfferedAsSomethingToShapeACornerAgainst()
    {
        var session = Session("hs-1", "Spa-Francorchamps", Now, traced: true);
        session.Laps[0].IsValid = false;
        var browser = Browser(session);

        Assert.DoesNotContain(browser.Laps(Context("Spa-Francorchamps")), lap => lap.LapNumber == 1);
    }

    [Fact]
    public void ALapWithoutChannelsIsStillListedWithTheReasonItCannotBeOverlaid()
    {
        // Hiding it would read as "that lap is gone", which is false — the lap is there, its
        // channels are not.
        var session = Session("hs-1", "Spa-Francorchamps", Now, traced: false);
        var browser = Browser(session);

        var lap = browser.Laps(Context("Spa-Francorchamps"))[0];

        Assert.Equal(LapTargetTier.ReferenceCurve, lap.Tier);
        Assert.False(lap.HasChannels);
        Assert.Contains("No channels", lap.UnavailableReason!, StringComparison.Ordinal);
    }

    [Fact]
    public void ASharedLapIsAttributedToWhoDroveIt()
    {
        var session = Session("hs-shared", "Spa-Francorchamps", Now, traced: true);
        session.Origin = LapHistoryOrigin.Shared;
        session.SharedFrom = "Ada";
        var browser = Browser(session);

        Assert.Contains("Shared by Ada", browser.Laps(Context("Spa-Francorchamps"))[0].Detail, StringComparison.Ordinal);
    }

    [Fact]
    public void OneLapDrawsAloneInEmber()
    {
        var controller = Loaded(out var laps);

        controller.SelectPrimary(laps[0]);
        var state = controller.State();

        Assert.NotNull(state.Stack);
        Assert.All(
            state.Stack!.Charts.SelectMany(chart => chart.Series),
            series => Assert.Equal(ChartSeriesRole.Current, series.Role));
    }

    [Fact]
    public void TwoLapsOverlayOnOneSharedDomain()
    {
        var controller = Loaded(out var laps);

        controller.SelectPrimary(laps[0]);
        controller.SelectComparison(laps[1]);
        var state = controller.State();

        var speed = state.Stack!.Charts[0];
        Assert.Equal(ChartDomainKind.TrackPosition, state.Stack.Domain.Kind);
        Assert.Contains(speed.Series, series => series.Role == ChartSeriesRole.Current);
        Assert.Contains(speed.Series, series => series.Role == ChartSeriesRole.Comparison);
    }

    [Fact]
    public void PickingTheComparisonLapAsPrimarySwapsThemRatherThanComparingALapWithItself()
    {
        var controller = Loaded(out var laps);
        controller.SelectPrimary(laps[0]);
        controller.SelectComparison(laps[1]);

        controller.SelectPrimary(laps[1]);
        var state = controller.State();

        Assert.Equal(laps[1].LapNumber, state.Primary!.LapNumber);
        Assert.Equal(laps[0].LapNumber, state.Comparison!.LapNumber);
    }

    [Fact]
    public void PickingTheComparisonAgainClearsIt()
    {
        var controller = Loaded(out var laps);
        controller.SelectComparison(laps[1]);

        controller.SelectComparison(laps[1]);

        Assert.Null(controller.State().Comparison);
    }

    [Fact]
    public void ChangingTrackDropsTheLapChoicesTheyBelongedToTheOldOne()
    {
        var browser = Browser(
            Session("hs-spa", "Spa-Francorchamps", Now, traced: true),
            Session("hs-monza", "Monza", Now.AddDays(-1), traced: true));
        var controller = new AnalysisController(browser);
        controller.Load();
        controller.SelectContext(Context("Spa-Francorchamps"));
        controller.SelectPrimary(browser.Laps(Context("Spa-Francorchamps"))[0]);

        controller.SelectContext(Context("Monza"));

        Assert.Null(controller.State().Primary);
    }

    [Fact]
    public void AChannelOnlyOneLapCarriesIsNamedRatherThanLeavingAPanelBlank()
    {
        var traces = new FakeTraces();
        var history = new FakeHistory();
        var full = Session("hs-full", "Spa-Francorchamps", Now, traced: true);
        var partial = Session("hs-partial", "Spa-Francorchamps", Now.AddHours(-1), traced: true);
        history.Add(full, traces, Trace());
        history.Add(partial, traces, TraceWithoutGear());

        var controller = new AnalysisController(new LapCorpusBrowser(history, traces));
        controller.Load();
        var laps = new LapCorpusBrowser(history, traces).Laps(Context("Spa-Francorchamps"));
        controller.SelectPrimary(laps.First(lap => lap.SessionId == "hs-full"));
        controller.SelectComparison(laps.First(lap => lap.SessionId == "hs-partial"));

        Assert.Contains(LapTraceChannels.Gear, controller.State().Notice!, StringComparison.Ordinal);
    }

    [Fact]
    public void SelectingALapWithNoChannelsExplainsWhyNothingIsDrawn()
    {
        var traces = new FakeTraces();
        var history = new FakeHistory();
        history.Add(Session("hs-1", "Spa-Francorchamps", Now, traced: false), traces, null);
        var browser = new LapCorpusBrowser(history, traces);
        var controller = new AnalysisController(browser);
        controller.Load();

        controller.SelectPrimary(browser.Laps(Context("Spa-Francorchamps"))[0]);
        var state = controller.State();

        Assert.Null(state.Stack);
        Assert.Contains("No channels", state.Notice!, StringComparison.Ordinal);
    }

    [Fact]
    public void SharedChannelsAreTheIntersectionOfWhatBothLapsCarry()
    {
        Assert.DoesNotContain(
            LapTraceChannels.Gear,
            LapCorpusBrowser.SharedChannels(Trace(), TraceWithoutGear()));
        Assert.Contains(
            LapTraceChannels.SpeedKph,
            LapCorpusBrowser.SharedChannels(Trace(), TraceWithoutGear()));
    }

    private static AnalysisController Loaded(out IReadOnlyList<CorpusLap> laps)
    {
        var browser = Browser(Session("hs-1", "Spa-Francorchamps", Now, traced: true));
        var controller = new AnalysisController(browser);
        controller.Load();
        laps = browser.Laps(Context("Spa-Francorchamps"));
        return controller;
    }

    private static LapCorpusBrowser Browser(params LapHistorySession[] sessions)
    {
        var traces = new FakeTraces();
        var history = new FakeHistory();
        foreach (var session in sessions)
        {
            history.Add(session, traces, Trace());
        }

        return new LapCorpusBrowser(history, traces);
    }

    private static LapHistoryContext Context(string track) => new()
    {
        Game = "Le Mans Ultimate",
        TrackCourse = track,
        CarModel = "Porsche 963",
        TrackLengthMeters = TrackLength,
    };

    private static LapHistorySession Session(string id, string track, DateTimeOffset at, bool traced)
    {
        var session = new LapHistorySession
        {
            Id = id,
            Kind = HistorySessionKind.Practice,
            StartedAt = at,
            Context = Context(track),
        };

        for (var lap = 1; lap <= 3; lap++)
        {
            session.Laps.Add(new LapHistoryRecord
            {
                LapNumber = lap,
                IsValid = true,
                LapTimeSeconds = 100 + lap,
                ReferenceCurve = new LapReferenceCurve { PositionStep = 0.5, TimesSeconds = [0, 50, 100] },
                TraceId = traced ? LapTraceId.For(id, lap) : null,
            });
        }

        return session;
    }

    private static LapChannelTrace Trace() => BuildTrace(withGear: true);

    private static LapChannelTrace TraceWithoutGear() => BuildTrace(withGear: false);

    private static LapChannelTrace BuildTrace(bool withGear)
    {
        const int Count = 201;
        var speed = new float[Count];
        var brake = new float[Count];
        var throttle = new float[Count];
        var steering = new float[Count];
        var gear = new float[Count];
        for (var i = 0; i < Count; i++)
        {
            var t = i / (double)(Count - 1);
            speed[i] = (float)(100 + (200 * t));
            brake[i] = (float)t;
            throttle[i] = (float)(1 - t);
            steering[i] = (float)((2 * t) - 1);
            gear[i] = 4;
        }

        var channels = new Dictionary<string, float[]>(StringComparer.Ordinal)
        {
            [LapTraceChannels.SpeedKph] = speed,
            [LapTraceChannels.Brake] = brake,
            [LapTraceChannels.Throttle] = throttle,
            [LapTraceChannels.Steering] = steering,
        };
        if (withGear)
        {
            channels[LapTraceChannels.Gear] = gear;
        }

        return new LapChannelTrace
        {
            PositionStep = 1.0 / (Count - 1),
            TrackLengthMeters = TrackLength,
            Channels = channels,
        };
    }

    private sealed class FakeHistory : ILapHistoryStore
    {
        private readonly List<LapHistorySession> _sessions = [];

        public void Add(LapHistorySession session, FakeTraces traces, LapChannelTrace? trace)
        {
            _sessions.Add(session);
            if (trace is null)
            {
                return;
            }

            foreach (var lap in session.Laps.Where(lap => lap.TraceId is { Length: > 0 }))
            {
                traces.All[lap.TraceId!] = trace;
            }
        }

        public IReadOnlyList<LapHistorySession> LoadAll() => _sessions;

        public void Save(LapHistorySession session) => _sessions.Add(session);

        public void Delete(string sessionId) => _sessions.RemoveAll(s => s.Id == sessionId);
    }

    private sealed class FakeTraces : ILapTraceStore
    {
        public Dictionary<string, LapChannelTrace> All { get; } = new(StringComparer.Ordinal);

        public void Save(string traceId, LapChannelTrace trace) => All[traceId] = trace;

        public LapChannelTrace? Load(string traceId) =>
            All.TryGetValue(traceId, out var trace) ? trace : null;

        public void Delete(string traceId) => All.Remove(traceId);

        public IReadOnlyList<LapTraceInfo> List() =>
            [.. All.Select(pair => new LapTraceInfo(pair.Key, 0, Now))];
    }
}

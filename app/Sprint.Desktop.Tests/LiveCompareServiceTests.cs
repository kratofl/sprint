using Sprint.Desktop.Features.Analysis;
using Sprint.Desktop.Features.LiveCompare;
using Sprint.Desktop.Features.SessionPlanning;
using Xunit;

namespace Sprint.Desktop.Tests;

/// <summary>
/// Training against an older lap (#195): which laps the On track page offers, which one the HUD
/// chases, and when the HUD may open.
/// </summary>
public sealed class LiveCompareServiceTests
{
    private const double TrackLength = 7004;
    private static readonly DateTimeOffset Monday = new(2026, 9, 28, 19, 0, 0, TimeSpan.Zero);

    private static readonly LiveCompareCourse Spa = new("Le Mans Ultimate", "Spa-Francorchamps", "Porsche 963");
    private static readonly LiveCompareCourse Monza = new("Le Mans Ultimate", "Monza", "Porsche 963");

    [Fact]
    public void ThePageListsTheCourseBeingDrivenEvenBeforeItHasALap()
    {
        LiveCompareService service = Service(() => Context(Monza), Session("spa", Spa, Monday, traced: true));

        LiveCompareState state = service.State();

        Assert.Equal(Monza, state.Course);
        Assert.Equal([Monza, Spa], state.Courses);
        Assert.Empty(state.Laps);
    }

    [Fact]
    public void OutOfTheGameThePageListsTheNewestCourseWithATrace()
    {
        LiveCompareService service = Service(
            () => null,
            Session("spa", Spa, Monday, traced: true),
            Session("monza-old", Monza, Monday.AddDays(-7), traced: true),
            Session("monza-untraced", Monza, Monday.AddDays(1), traced: false));

        Assert.Equal(Spa, service.State().Course);
    }

    [Fact]
    public void LapsFromEverySessionOnTheCourseAreListedFastestFirst()
    {
        LiveCompareService service = Service(
            () => null,
            Session("spa-1", Spa, Monday, traced: true, firstLapSeconds: 125),
            Session("spa-2", Spa, Monday.AddDays(-3), traced: true, firstLapSeconds: 124));

        LiveCompareState state = service.State();

        Assert.Equal(6, state.LapCount);
        Assert.Equal("spa-2", state.Laps[0].SessionId);
        Assert.True(state.Laps.Zip(state.Laps.Skip(1)).All(pair => pair.First.LapTimeSeconds <= pair.Second.LapTimeSeconds));
    }

    [Fact]
    public void ALapWithoutChannelsCannotBeTheTargetAndTheHudWaitsForOne()
    {
        LiveCompareService service = Service(() => null, Session("spa", Spa, Monday, traced: false));

        Assert.False(service.SetTarget("spa", 1, out string targetError));
        Assert.StartsWith("No channels", targetError, StringComparison.Ordinal);
        Assert.False(service.SetHudOpen(true, out string hudError));
        Assert.Equal("Pick a lap to train against first.", hudError);
        Assert.False(service.HudOpen);
    }

    [Fact]
    public void PickingALapOnAnotherCourseShowsThatCourseAndClearingItClosesTheHud()
    {
        LiveCompareService service = Service(
            () => Context(Spa),
            Session("spa", Spa, Monday, traced: true),
            Session("monza", Monza, Monday, traced: true));

        Assert.True(service.SetTarget("monza", 2, out string error), error);
        Assert.True(service.SetHudOpen(true, out _));

        LiveCompareState picked = service.State();
        Assert.Equal(Monza, picked.Course);
        Assert.Equal(2, picked.Target?.LapNumber);
        Assert.StartsWith("2:02.0 · Lap 2, ", picked.Target?.Label, StringComparison.Ordinal);

        service.ClearTarget();

        Assert.Null(service.State().Target);
        Assert.False(service.HudOpen);
    }

    // ── Fixtures ─────────────────────────────────────────────────────────────

    private static LiveCompareService Service(Func<LapHistoryContext?> live, params LapHistorySession[] sessions)
    {
        FakeTraces traces = new();
        FakeHistory history = new();
        foreach (LapHistorySession session in sessions)
        {
            history.Sessions.Add(session);
            foreach (LapHistoryRecord lap in session.Laps)
            {
                if (lap.TraceId is { Length: > 0 } traceId)
                {
                    traces.All[traceId] = Trace();
                }
            }
        }

        return new LiveCompareService(new LapCorpusBrowser(history, traces), live);
    }

    private static LapHistoryContext Context(LiveCompareCourse course) => new()
    {
        Game = course.Game,
        TrackCourse = course.TrackCourse,
        CarModel = course.CarModel,
        TrackLengthMeters = TrackLength,
    };

    private static LapHistorySession Session(
        string id,
        LiveCompareCourse course,
        DateTimeOffset at,
        bool traced,
        double firstLapSeconds = 121)
    {
        LapHistorySession session = new()
        {
            Id = id,
            Kind = HistorySessionKind.Practice,
            StartedAt = at,
            Context = Context(course),
        };

        for (int lap = 1; lap <= 3; lap++)
        {
            session.Laps.Add(new LapHistoryRecord
            {
                LapNumber = lap,
                IsValid = true,
                LapTimeSeconds = firstLapSeconds + lap - 1,
                ReferenceCurve = new LapReferenceCurve { PositionStep = 0.5, TimesSeconds = [0, 60, 120] },
                TraceId = traced ? LapTraceId.For(id, lap) : null,
            });
        }

        return session;
    }

    private static LapChannelTrace Trace()
    {
        const int Count = 201;
        float[] speed = new float[Count];
        float[] elapsed = new float[Count];
        for (int i = 0; i < Count; i++)
        {
            double t = i / (double)(Count - 1);
            speed[i] = (float)(100 + (200 * t));
            elapsed[i] = (float)(120 * t);
        }

        return new LapChannelTrace
        {
            PositionStep = 1.0 / (Count - 1),
            TrackLengthMeters = TrackLength,
            Channels = new Dictionary<string, float[]>(StringComparer.Ordinal)
            {
                [LapTraceChannels.SpeedKph] = speed,
                [LapTraceChannels.ElapsedSeconds] = elapsed,
            },
        };
    }

    private sealed class FakeHistory : ILapHistoryStore
    {
        public List<LapHistorySession> Sessions { get; } = [];

        public IReadOnlyList<LapHistorySession> LoadAll() => this.Sessions;

        public void Save(LapHistorySession session) => this.Sessions.Add(session);

        public void Delete(string sessionId) => this.Sessions.RemoveAll(session => session.Id == sessionId);
    }

    private sealed class FakeTraces : ILapTraceStore
    {
        public Dictionary<string, LapChannelTrace> All { get; } = new(StringComparer.Ordinal);

        public void Save(string traceId, LapChannelTrace trace) => this.All[traceId] = trace;

        public LapChannelTrace? Load(string traceId) => this.All.TryGetValue(traceId, out LapChannelTrace? trace) ? trace : null;

        public void Delete(string traceId) => this.All.Remove(traceId);

        public IReadOnlyList<LapTraceInfo> List() => [.. this.All.Select(pair => new LapTraceInfo(pair.Key, 0, Monday))];
    }
}

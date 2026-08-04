using Sprint.Desktop.Features.Analysis;
using Sprint.Desktop.Features.Charts;
using Sprint.Desktop.Features.SessionPlanning;
using Sprint.Games;
using Xunit;

namespace Sprint.Desktop.Tests;

/// <summary>
/// The Analysis view's rules (#196): narrowing the corpus down to one session, then comparing two
/// of its laps. Avalonia-free, so the whole selection story is a unit test.
/// <para>
/// The cascade exists because a flat list of every lap is unusable once a driver has real
/// mileage — driver feedback, 2026-08-03.
/// </para>
/// </summary>
public sealed class AnalysisTests
{
    private static readonly DateTimeOffset Evening = new(2026, 8, 2, 19, 0, 0, TimeSpan.Zero);
    private const double TrackLength = 5000;

    // ── The narrowing cascade ────────────────────────────────────────────────

    [Fact]
    public void GamesAndTracksAreOfferedMostRecentlyDrivenFirst()
    {
        var filter = Filter(
            Session("hs-spa", "Spa-Francorchamps", "Hypercar", "Porsche 963", Evening.AddDays(-7)),
            Session("hs-monza", "Monza", "Hypercar", "Porsche 963", Evening));

        Assert.Equal(["Le Mans Ultimate"], filter.Games);
        Assert.Equal("Le Mans Ultimate", filter.Game);
        Assert.Equal(["Monza", "Spa-Francorchamps"], filter.Tracks);
        // A real choice stays unanswered until the track step.
        Assert.Null(filter.Track);
    }

    [Fact]
    public void PickingAGameKeepsTracksFromOtherGamesOutOfTheNextStep()
    {
        var lmu = HistorySession("hs-lmu", "Spa-Francorchamps", "Hypercar", "Porsche 963", Evening, traced: true);
        var acc = HistorySession("hs-acc", "Monza", "GT3", "Ferrari 296", Evening.AddHours(-1), traced: true, game: "Assetto Corsa Competizione");
        var filter = Filter(lmu, acc);

        Assert.Null(filter.Game);
        filter.SelectGame("Assetto Corsa Competizione");

        Assert.Equal(["Monza"], filter.Tracks);
        Assert.Equal("Monza", filter.Track);
        Assert.Equal("GT3", filter.CarClass);
    }

    [Fact]
    public void ASingleClassAndCarArePreselectedRatherThanAsked()
    {
        // "falls dann nur ein gibt dann direkt das vor auswählen" — a step with one answer is
        // not a question.
        var filter = Filter(Session("hs-1", "Spa-Francorchamps", "Hypercar", "Porsche 963", Evening));

        Assert.Equal("Hypercar", filter.CarClass);
        Assert.Equal("Porsche 963", filter.CarModel);
        Assert.False(filter.ClassIsAChoice);
        Assert.False(filter.CarModelIsAChoice);
    }

    [Fact]
    public void TwoClassesAtOneTrackAreAChoiceAndNarrowTheCarsUnderThem()
    {
        var filter = Filter(
            Session("hs-hyper", "Spa-Francorchamps", "Hypercar", "Porsche 963", Evening),
            Session("hs-gt3", "Spa-Francorchamps", "GT3", "Ferrari 296", Evening.AddHours(-2)),
            Session("hs-gt3b", "Spa-Francorchamps", "GT3", "BMW M4", Evening.AddHours(-3)));

        Assert.True(filter.ClassIsAChoice);
        Assert.Equal(["Hypercar", "LMGT3"], filter.Classes);

        filter.SelectClass("GT3");

        Assert.Equal(["BMW M4", "Ferrari 296"], filter.CarModels);
        // Two cars in the class, so the driver still has to say which.
        Assert.True(filter.CarModelIsAChoice);
        Assert.Null(filter.CarModel);
    }

    [Fact]
    public void PickingAClassWithOneCarStillPreselectsThatCar()
    {
        var filter = Filter(
            Session("hs-hyper", "Spa-Francorchamps", "Hypercar", "Porsche 963", Evening),
            Session("hs-gt3", "Spa-Francorchamps", "GT3", "Ferrari 296", Evening.AddHours(-2)));

        filter.SelectClass("GT3");

        Assert.Equal("Ferrari 296", filter.CarModel);
    }

    [Fact]
    public void ASessionWithNoCarClassIsNamedRatherThanHidden()
    {
        var filter = Filter(Session("hs-1", "Spa-Francorchamps", carClass: null, "Porsche 963", Evening));

        Assert.Equal([LapCorpusFilter.UnspecifiedClass], filter.Classes);
        Assert.Equal(LapCorpusFilter.UnspecifiedClass, filter.CarClass);
        Assert.Single(filter.Sessions);
    }

    [Fact]
    public void ChangingTrackForgetsEverythingUnderTheOldOne()
    {
        var filter = Filter(
            Session("hs-spa", "Spa-Francorchamps", "Hypercar", "Porsche 963", Evening),
            Session("hs-monza-a", "Monza", "GT3", "Ferrari 296", Evening.AddDays(-1)),
            Session("hs-monza-b", "Monza", "GT3", "BMW M4", Evening.AddDays(-2)));

        filter.SelectTrack("Monza");

        Assert.Equal("LMGT3", filter.CarClass);
        // Two cars at Monza, so nothing is assumed.
        Assert.Null(filter.CarModel);
        Assert.All(filter.Sessions, session => Assert.Equal("Monza", session.Context.TrackCourse));
    }

    [Fact]
    public void LmuClassAliasesCombineUnderReadableGameClassNames()
    {
        var filter = Filter(
            Session("hs-hyper", "Spa-Francorchamps", "Hyper", "Porsche 963", Evening),
            Session("hs-hypercar", "Spa-Francorchamps", "Hypercar", "Ferrari 499P", Evening.AddHours(-1)),
            Session("hs-lmp2", "Monza", "LMP2_ELMS", "Oreca 07", Evening.AddHours(-2)));

        filter.SelectTrack("Spa-Francorchamps");

        Assert.Equal(["Hypercar"], filter.Classes);
        Assert.Equal(["Ferrari 499P", "Porsche 963"], filter.CarModels);
        Assert.Equal(["Hypercar", "LMP2", "LMGT3", "GTE"], filter.ClassOptions.Select(option => option.Name));
    }

    [Fact]
    public void UnknownGameClassNamesRemainReadableWithoutSharingLmuAliases()
    {
        var classes = GameCarClassCatalog.Classes("Another Game", ["GT3_WORLD-CHALLENGE"]);

        var definition = Assert.Single(classes);
        Assert.Equal("GT3 WORLD CHALLENGE", definition.Name);
        Assert.Equal("GT3_WORLD-CHALLENGE", GameCarClassCatalog.CanonicalId("Another Game", definition.Id));
    }

    [Fact]
    public void TheDayFilterIsOptionalAndNarrowsToOneEvening()
    {
        // "gestern um 19:00 war eine session die will ich anschauen".
        var filter = Filter(
            Session("hs-today", "Spa-Francorchamps", "Hypercar", "Porsche 963", Evening),
            Session("hs-yesterday", "Spa-Francorchamps", "Hypercar", "Porsche 963", Evening.AddDays(-1)));

        Assert.Null(filter.Day);
        Assert.Equal(2, filter.Sessions.Count);

        var yesterday = filter.Days.Last();
        filter.SelectDay(yesterday);

        Assert.Equal("hs-yesterday", Assert.Single(filter.Sessions).Id);
    }

    [Fact]
    public void TheDateRangeIsInclusiveAndCanBeOpenEnded()
    {
        var filter = Filter(
            Session("hs-today", "Spa-Francorchamps", "Hypercar", "Porsche 963", Evening),
            Session("hs-yesterday", "Spa-Francorchamps", "Hypercar", "Porsche 963", Evening.AddDays(-1)),
            Session("hs-older", "Spa-Francorchamps", "Hypercar", "Porsche 963", Evening.AddDays(-2)));

        var yesterday = DateOnly.FromDateTime(Evening.AddDays(-1).LocalDateTime);
        filter.SelectDateRange(yesterday, null);
        Assert.Equal(["hs-today", "hs-yesterday"], filter.Sessions.Select(session => session.Id));

        filter.SelectDateRange(null, yesterday);
        Assert.Equal(["hs-yesterday", "hs-older"], filter.Sessions.Select(session => session.Id));

        filter.SelectDateRange(yesterday, yesterday);
        Assert.Equal("hs-yesterday", Assert.Single(filter.Sessions).Id);

        Assert.Throws<ArgumentException>(() => filter.SelectDateRange(yesterday, yesterday.AddDays(-1)));

        filter.SelectDateFrom(yesterday.AddDays(1));
        Assert.Equal(filter.DateFrom, filter.DateTo);
        filter.SelectDateTo(yesterday.AddDays(-2));
        Assert.Equal(filter.DateFrom, filter.DateTo);
    }

    [Fact]
    public void DaysReadTheWayADriverNamesThem()
    {
        var today = new DateOnly(2026, 8, 3);

        Assert.Equal("Today", LapCorpusFilter.DayLabel(today, today));
        Assert.Equal("Yesterday", LapCorpusFilter.DayLabel(today.AddDays(-1), today));
        Assert.Equal("Fri 31 Jul", LapCorpusFilter.DayLabel(new DateOnly(2026, 7, 31), today));
    }

    [Fact]
    public void SessionsAreListedNewestFirstWithTheirTimeAndBestLap()
    {
        var filter = Filter(
            Session("hs-early", "Spa-Francorchamps", "Hypercar", "Porsche 963", Evening.AddHours(-3)),
            Session("hs-late", "Spa-Francorchamps", "Hypercar", "Porsche 963", Evening));

        var sessions = filter.Sessions;

        Assert.Equal("hs-late", sessions[0].Id);
        Assert.Contains("Practice", sessions[0].Label, StringComparison.Ordinal);
        Assert.Contains("3 laps", sessions[0].Detail, StringComparison.Ordinal);
        Assert.Contains("best 1:41.0", sessions[0].Detail, StringComparison.Ordinal);
    }

    [Fact]
    public void ASharedSessionIsLabelledByWhoDroveIt()
    {
        var session = HistorySession("hs-shared", "Spa-Francorchamps", "Hypercar", "Porsche 963", Evening, traced: true);
        session.Origin = LapHistoryOrigin.Shared;
        session.SharedFrom = "Ada";

        Assert.Equal("Shared by Ada", Filter(session).Sessions[0].Label);
    }

    [Fact]
    public void ASessionWithNoTracedLapsSaysSoBeforeItIsOpened()
    {
        var filter = Filter(HistorySession("hs-1", "Spa-Francorchamps", "Hypercar", "Porsche 963", Evening, traced: false));

        Assert.False(filter.Sessions[0].HasChannels);
    }

    // ── Laps within a session ────────────────────────────────────────────────

    [Fact]
    public void AnEmptyCorpusSaysSoRatherThanShowingAnEmptyChart()
    {
        var controller = new AnalysisController(new LapCorpusBrowser(new FakeHistory(), new FakeTraces()));

        var state = controller.Load();

        Assert.True(state.Filter.IsEmpty);
        Assert.Null(state.Stack);
        Assert.Contains("No laps recorded yet", state.Notice, StringComparison.Ordinal);
    }

    [Fact]
    public void OpeningThePageWaitsForAnExplicitSessionChoice()
    {
        var browser = BrowserFor(
            Session("hs-old", "Spa-Francorchamps", "Hypercar", "Porsche 963", Evening.AddDays(-1)),
            Session("hs-new", "Spa-Francorchamps", "Hypercar", "Porsche 963", Evening));
        var controller = new AnalysisController(browser);

        Assert.Null(controller.Load().Session);
        Assert.Equal("hs-new", controller.CreateSessionFilter().Sessions[0].Id);
    }

    [Fact]
    public void LapsAreListedFastestFirstWithTheirTier()
    {
        var controller = Controller(out var browser, Session("hs-1", "Spa-Francorchamps", "Hypercar", "Porsche 963", Evening));
        var state = controller.Load();

        var laps = browser.Laps(state.Session);

        Assert.Equal([101.0, 102.0, 103.0], laps.Select(lap => lap.LapTimeSeconds));
        Assert.All(laps, lap => Assert.Equal(LapTargetTier.FullTrace, lap.Tier));
        Assert.Equal("Lap 1 · 1:41.0", laps[0].Label);
    }

    [Fact]
    public void LapSidebarCanFilterByChannelsAndSortByLapNumber()
    {
        var session = HistorySession("hs-1", "Spa-Francorchamps", "Hypercar", "Porsche 963", Evening, traced: true);
        session.Laps[1].TraceId = null;
        var browser = BrowserFor(session);
        var described = browser.Laps(browser.Sessions()[0]);

        var channels = AnalysisLapList.Apply(described, AnalysisLapFilter.WithChannels, AnalysisLapSort.LapNumber);
        var timeOnly = AnalysisLapList.Apply(described, AnalysisLapFilter.TimeOnly, AnalysisLapSort.Fastest);

        Assert.Equal([1, 3], channels.Select(lap => lap.LapNumber));
        Assert.Equal(2, Assert.Single(timeOnly).LapNumber);
    }

    [Fact]
    public void AnInvalidLapIsNotOfferedAsSomethingToShapeACornerAgainst()
    {
        var session = HistorySession("hs-1", "Spa-Francorchamps", "Hypercar", "Porsche 963", Evening, traced: true);
        session.Laps[0].IsValid = false;
        var controller = Controller(out var browser, session);

        Assert.DoesNotContain(browser.Laps(controller.Load().Session), lap => lap.LapNumber == 1);
    }

    [Fact]
    public void ALapWithoutChannelsIsStillListedWithTheReasonItCannotBeOverlaid()
    {
        // Hiding it would read as "that lap is gone", which is false — the lap is there, its
        // channels are not.
        var controller = Controller(
            out var browser,
            HistorySession("hs-1", "Spa-Francorchamps", "Hypercar", "Porsche 963", Evening, traced: false));

        var lap = browser.Laps(controller.Load().Session)[0];

        Assert.Equal(LapTargetTier.ReferenceCurve, lap.Tier);
        Assert.False(lap.HasChannels);
        Assert.Contains("No channels", lap.UnavailableReason!, StringComparison.Ordinal);
    }

    [Fact]
    public void TwoLapsOverlayOnOneSharedDomain()
    {
        var controller = Controller(out var browser, Session("hs-1", "Spa-Francorchamps", "Hypercar", "Porsche 963", Evening));
        var laps = browser.Laps(controller.Load().Session);

        controller.SelectPrimary(laps[0]);
        controller.SelectComparison(laps[1]);
        var state = controller.State();

        var speed = state.Stack!.Charts.Single(chart => chart.Title == "Speed");
        Assert.Equal(ChartDomainKind.TrackPosition, state.Stack.Domain.Kind);
        Assert.Contains(speed.Series, series => series.Role == ChartSeriesRole.Current);
        Assert.Contains(speed.Series, series => series.Role == ChartSeriesRole.Comparison);
    }

    [Fact]
    public void LapChoicesSurviveSwitchingSessionSoTwoRunsCanBeCompared()
    {
        // Tonight's lap against the best ever is the comparison that matters most, and it needs
        // no extra UI — only changing track invalidates a pick.
        var controller = Controller(
            out var browser,
            Session("hs-old", "Spa-Francorchamps", "Hypercar", "Porsche 963", Evening.AddDays(-1)),
            Session("hs-new", "Spa-Francorchamps", "Hypercar", "Porsche 963", Evening));
        var state = controller.Load();

        controller.SelectPrimary(browser.Laps(state.Session)[0]);
        var old = controller.Filter.Sessions.Single(session => session.Id == "hs-old");
        controller.SelectSession(old);
        controller.SelectComparison(browser.Laps(old)[0]);

        var overlaid = controller.State();
        Assert.Equal("hs-new", overlaid.Primary!.SessionId);
        Assert.Equal("hs-old", overlaid.Comparison!.SessionId);
        Assert.NotNull(overlaid.Stack);
    }

    [Fact]
    public void ChangingTrackDropsTheLapChoicesTheyBelongedToTheOldOne()
    {
        var controller = Controller(
            out var browser,
            Session("hs-spa", "Spa-Francorchamps", "Hypercar", "Porsche 963", Evening),
            Session("hs-monza", "Monza", "Hypercar", "Porsche 963", Evening.AddDays(-1)));
        var state = controller.Load();
        controller.SelectPrimary(browser.Laps(state.Session)[0]);

        controller.SelectTrack("Monza");

        Assert.Null(controller.State().Primary);
    }

    [Fact]
    public void PickingTheComparisonAgainClearsIt()
    {
        var controller = Controller(out var browser, Session("hs-1", "Spa-Francorchamps", "Hypercar", "Porsche 963", Evening));
        var laps = browser.Laps(controller.Load().Session);

        controller.SelectComparison(laps[1]);
        controller.SelectComparison(laps[1]);

        Assert.Null(controller.State().Comparison);
    }

    [Fact]
    public void SelectingALapWithNoChannelsExplainsWhyNothingIsDrawn()
    {
        var controller = Controller(
            out var browser,
            HistorySession("hs-1", "Spa-Francorchamps", "Hypercar", "Porsche 963", Evening, traced: false));

        controller.SelectPrimary(browser.Laps(controller.Load().Session)[0]);
        var state = controller.State();

        Assert.Null(state.Stack);
        Assert.Contains("No channels", state.Notice!, StringComparison.Ordinal);
    }

    [Fact]
    public void AFilterThatMatchesNothingSaysSo()
    {
        var controller = Controller(out _, Session("hs-1", "Spa-Francorchamps", "Hypercar", "Porsche 963", Evening));
        controller.Load();

        controller.SelectDay(new DateOnly(2020, 1, 1));

        Assert.Contains("No sessions match", controller.State().Notice!, StringComparison.Ordinal);
    }

    [Fact]
    public void SharedChannelsAreTheIntersectionOfWhatBothLapsCarry()
    {
        Assert.DoesNotContain(LapTraceChannels.Gear, LapCorpusBrowser.SharedChannels(Trace(), TraceWithoutGear()));
        Assert.Contains(LapTraceChannels.SpeedKph, LapCorpusBrowser.SharedChannels(Trace(), TraceWithoutGear()));
    }

    // ── Fixtures ─────────────────────────────────────────────────────────────

    private static AnalysisController Controller(
        out LapCorpusBrowser browser,
        params LapHistorySession[] sessions)
    {
        browser = BrowserFor(sessions);
        var controller = new AnalysisController(browser);
        controller.Load();
        controller.SelectSession(browser.Sessions().FirstOrDefault());
        return controller;
    }

    private static LapCorpusFilter Filter(params LapHistorySession[] sessions) =>
        new(BrowserFor(sessions).Sessions());

    private static LapCorpusBrowser BrowserFor(params LapHistorySession[] sessions)
    {
        var traces = new FakeTraces();
        var history = new FakeHistory();
        foreach (var session in sessions)
        {
            history.Add(session, traces, Trace());
        }

        return new LapCorpusBrowser(history, traces);
    }

    private static LapHistorySession Session(
        string id,
        string track,
        string? carClass,
        string car,
        DateTimeOffset at) => HistorySession(id, track, carClass, car, at, traced: true);

    private static LapHistorySession HistorySession(
        string id,
        string track,
        string? carClass,
        string car,
        DateTimeOffset at,
        bool traced,
        string game = "Le Mans Ultimate")
    {
        var session = new LapHistorySession
        {
            Id = id,
            Kind = HistorySessionKind.Practice,
            StartedAt = at,
            Context = new LapHistoryContext
            {
                Game = game,
                TrackCourse = track,
                CarModel = car,
                CarClass = carClass,
                TrackLengthMeters = TrackLength,
            },
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

        public void Add(LapHistorySession session, FakeTraces traces, LapChannelTrace trace)
        {
            _sessions.Add(session);
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
            [.. All.Select(pair => new LapTraceInfo(pair.Key, 0, Evening))];
    }
}

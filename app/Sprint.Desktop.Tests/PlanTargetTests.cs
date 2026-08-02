using Sprint.Desktop.Features.SessionPlanning;
using Xunit;

namespace Sprint.Desktop.Tests;

/// <summary>
/// Acceptance-criteria tests for #186: plan targets stored per segment kind, picked as a
/// (scope, statistic) pair over the lap-history corpus (#179) through #184's statistics.
/// <para>
/// Every expectation below is hand-worked against <see cref="Corpus"/> — two qualifying
/// sessions on known dates plus a practice session — so each scope has one unambiguous right
/// answer that differs from its neighbours' (Current Quali's fastest is 131, all-time Quali's
/// is 129). Nothing here recomputes an expectation with the implementation's own expression.
/// </para>
/// </summary>
public sealed class PlanTargetTests
{
    private static readonly DateTimeOffset Now = new(2026, 8, 1, 12, 0, 0, TimeSpan.Zero);

    // The qualifying session immediately before the race, and the one from the week before.
    private static readonly DateTimeOffset CurrentQualiAt = new(2026, 7, 31, 18, 20, 0, TimeSpan.Zero);
    private static readonly DateTimeOffset OlderQualiAt = new(2026, 7, 24, 17, 5, 0, TimeSpan.Zero);
    private static readonly DateTimeOffset PracticeAt = new(2026, 7, 30, 10, 0, 0, TimeSpan.Zero);

    [Fact]
    public void TargetsAreStoredPerSegmentKindAndRoundTripThroughThePlanStore()
    {
        var root = TestEnv.NewTempDataRoot();
        try
        {
            var planId = "";
            WithController(root, Corpus(), controller =>
            {
                planId = controller.CreatePlan(NewRequest()).Id;

                var choices = controller.TargetChoices();
                controller.SetTarget(
                    SegmentKind.Qualifying,
                    choices.Scope(PlanTargetScope.CurrentQualifying)!.Option(PlanTargetStatistic.Fastest)!);
                controller.SetTarget(
                    SegmentKind.Race,
                    choices.Scope(PlanTargetScope.Practice)!.Option(PlanTargetStatistic.Median)!);
            });

            // A brand-new service over the same files: targets are plain persisted plan data,
            // so a future remote store can carry them without the planner changing.
            var reloaded = new SessionPlannerService(new LocalSessionPlanStore(root)).Find(planId);

            Assert.NotNull(reloaded);
            var qualifying = reloaded!.TargetsFor(SegmentKind.Qualifying)?.LapTime;
            var race = reloaded.TargetsFor(SegmentKind.Race)?.LapTime;
            Assert.Equal(131, qualifying?.LapTimeSeconds);
            Assert.Equal(PlanTargetScope.CurrentQualifying, qualifying?.Scope);
            // Hand-worked: practice laps sorted [136, 140, 145, 150] have no single middle
            // lap, and the lower median (140) is the one actually driven.
            Assert.Equal(140, race?.LapTimeSeconds);
            Assert.Equal(PlanTargetStatistic.Median, race?.Statistic);
        }
        finally
        {
            Directory.Delete(root, recursive: true);
        }
    }

    [Fact]
    public void CurrentQualiIsTheMostRecentQualifyingSessionAndCarriesItsTimestamp()
    {
        WithChoices(Corpus(), choices =>
        {
            var current = choices.Scope(PlanTargetScope.CurrentQualifying);

            Assert.NotNull(current);
            // Only the 31 Jul session's three laps, not the 24 Jul session's two.
            Assert.Equal(3, current!.SampleSize);
            Assert.Equal(131, current.Option(PlanTargetStatistic.Fastest)!.LapTimeSeconds);
            Assert.Equal("hs-q-current", current.Option(PlanTargetStatistic.Fastest)!.LapSessionId);
            // The timestamp is in the label so "the session right before the race" is
            // verifiable rather than assumed.
            Assert.Equal("Current Quali · 2026-07-31 18:20", current.Label);
            Assert.Equal(CurrentQualiAt, current.Option(PlanTargetStatistic.Fastest)!.LapSessionStartedAt);
        });
    }

    [Fact]
    public void TheAllTimeQualiScopeSpansEveryQualifyingSessionAndDiffersFromTheCurrentOne()
    {
        WithChoices(Corpus(), choices =>
        {
            var allTime = choices.Scope(PlanTargetScope.Qualifying);

            Assert.NotNull(allTime);
            Assert.Equal("Quali", allTime!.Label);
            // Hand-worked: [129, 130, 131, 133, 138] across both sessions. The fastest lap is
            // in the OLDER session, which is exactly what makes this scope a different answer
            // from Current Quali's 131.
            Assert.Equal(5, allTime.SampleSize);
            Assert.Equal(129, allTime.Option(PlanTargetStatistic.Fastest)!.LapTimeSeconds);
            Assert.Equal("hs-q-old", allTime.Option(PlanTargetStatistic.Fastest)!.LapSessionId);
        });
    }

    [Fact]
    public void ThePracticeScopeUsesPracticeLapsOnly()
    {
        WithChoices(Corpus(), choices =>
        {
            var practice = choices.Scope(PlanTargetScope.Practice);

            Assert.NotNull(practice);
            Assert.Equal("Practice", practice!.Label);
            // Hand-worked: [136, 140, 145, 150]. No qualifying lap leaks in, so nothing here
            // is faster than 136.
            Assert.Equal(4, practice.SampleSize);
            Assert.Equal(136, practice.Option(PlanTargetStatistic.Fastest)!.LapTimeSeconds);
            Assert.Equal(150, practice.Option(PlanTargetStatistic.Slowest)!.LapTimeSeconds);
        });
    }

    [Fact]
    public void EachStatisticResolvesToTheRealLapAtItsPositionInTheScope()
    {
        WithChoices(Corpus(), choices =>
        {
            var current = choices.Scope(PlanTargetScope.CurrentQualifying)!;

            // Hand-worked over [131, 133, 138]: the middle lap is 133 and it is a lap that was
            // driven, never an interpolated 134.
            Assert.Equal(131, current.Option(PlanTargetStatistic.Fastest)!.LapTimeSeconds);
            Assert.Equal(133, current.Option(PlanTargetStatistic.Median)!.LapTimeSeconds);
            Assert.Equal(138, current.Option(PlanTargetStatistic.Slowest)!.LapTimeSeconds);
            Assert.Equal(2, current.Option(PlanTargetStatistic.Median)!.LapNumber);
        });
    }

    [Fact]
    public void EveryOptionLabelShowsItsResolvedTimeAndSampleSize()
    {
        WithChoices(Corpus(), choices =>
        {
            var current = choices.Scope(PlanTargetScope.CurrentQualifying)!;

            // 133 s = 2:13.0. A statistic is never shown without the sample size behind it,
            // because a median of three laps and a median of forty-seven read the same
            // otherwise.
            Assert.Equal("2:13.0", current.Option(PlanTargetStatistic.Median)!.TimeText);
            Assert.Equal("2:13.0 · median of 3 laps", current.Option(PlanTargetStatistic.Median)!.Detail);
            Assert.Equal("2:11.0 · fastest of 3 laps", current.Option(PlanTargetStatistic.Fastest)!.Detail);
        });
    }

    [Fact]
    public void ChoosingASpecificLapListsTheScopeFastestToSlowestAndPointsAtTheLapPicked()
    {
        var root = TestEnv.NewTempDataRoot();
        try
        {
            WithController(root, Corpus(), controller =>
            {
                controller.CreatePlan(NewRequest());
                var quali = controller.TargetChoices().Scope(PlanTargetScope.Qualifying)!;

                // Hand-worked: both qualifying sessions interleaved, fastest first.
                Assert.Equal(
                    new[] { 129.0, 130, 131, 133, 138 },
                    quali.Laps.Select(lap => lap.LapTimeSeconds));
                Assert.All(quali.Laps, lap => Assert.Equal(PlanTargetStatistic.Custom, lap.Statistic));

                // The 133 lap: lap 2 of the 31 Jul session, fourth in the ordered list.
                var picked = quali.Laps[3];
                Assert.Equal("Lap 2", picked.Label);
                Assert.Equal("2:13.0 · #4 of 5 laps", picked.Detail);

                controller.SetTarget(SegmentKind.Race, picked);

                var target = controller.TargetFor(SegmentKind.Race);
                Assert.NotNull(target);
                Assert.Equal(PlanTargetStatistic.Custom, target!.Statistic);
                Assert.Equal(133, target.LapTimeSeconds);
                Assert.Equal("hs-q-current", target.LapSessionId);
                Assert.Equal(2, target.LapNumber);
                // Still drawn from a five-lap corpus, and the stored target says so.
                Assert.Equal(5, target.SampleSize);
            });
        }
        finally
        {
            Directory.Delete(root, recursive: true);
        }
    }

    [Fact]
    public void AnImportedLapIsOfferedAsTimeOnlyWhileARecordedLapCarriesItsReferenceCurve()
    {
        // An imported session can never have a position trace, so a target picked from it can
        // only ever be a scalar; a recorded one can drive a position-accurate delta. The
        // selector has to say which tier the driver just chose.
        var imported = Session("hs-q-imported", HistorySessionKind.Qualifying, CurrentQualiAt, 131);
        imported.Origin = LapHistoryOrigin.Imported;
        foreach (var lap in imported.Laps)
        {
            lap.ReferenceCurve = null;
        }

        var recorded = Session("hs-practice", HistorySessionKind.Practice, PracticeAt, 140);
        var root = TestEnv.NewTempDataRoot();
        try
        {
            WithController(root, new FakeLapHistoryStore([imported, recorded]), controller =>
            {
                controller.CreatePlan(NewRequest());
                var choices = controller.TargetChoices();

                var scalar = choices.Scope(PlanTargetScope.CurrentQualifying)!
                    .Option(PlanTargetStatistic.Fastest)!;
                Assert.False(scalar.HasReferenceCurve);
                Assert.Equal("time only", scalar.TierNote);

                var curve = choices.Scope(PlanTargetScope.Practice)!
                    .Option(PlanTargetStatistic.Fastest)!;
                Assert.True(curve.HasReferenceCurve);
                Assert.Equal("reference curve", curve.TierNote);

                // The tier is stored, not just displayed: #189 delivers the lap reference and
                // has to know whether there is one before promising a delta.
                controller.SetTarget(SegmentKind.Qualifying, scalar);
                Assert.False(controller.TargetFor(SegmentKind.Qualifying)!.HasReferenceCurve);
                controller.SetTarget(SegmentKind.Race, curve);
                Assert.True(controller.TargetFor(SegmentKind.Race)!.HasReferenceCurve);
            });
        }
        finally
        {
            Directory.Delete(root, recursive: true);
        }
    }

    [Fact]
    public void WithNoHistoryForTheContextNoTargetIsOfferedAtAll()
    {
        // A corpus that holds laps for a different car: the planner must offer nothing rather
        // than a scope resolving to someone else's pace, and no zero-second placeholder. There
        // is no typed fallback either — a lap time is something a car did, so the section
        // stays empty until a session is driven or imported.
        var otherCar = Session("hs-other", HistorySessionKind.Qualifying, CurrentQualiAt, 131, 133);
        otherCar.Context.CarModel = "Peugeot 9X8";

        var root = TestEnv.NewTempDataRoot();
        try
        {
            WithController(root, new FakeLapHistoryStore([otherCar]), controller =>
            {
                controller.CreatePlan(NewRequest());

                var choices = controller.TargetChoices();
                Assert.True(choices.IsEmpty);
                Assert.Empty(choices.Scopes);
                Assert.Null(controller.TargetFor(SegmentKind.Race));
            });
        }
        finally
        {
            Directory.Delete(root, recursive: true);
        }
    }

    [Fact]
    public void AManualTargetStoredByAnEarlierVersionStillDescribesItselfHonestly()
    {
        // The typed-entry path is gone from the page, but plans written before that carry
        // Manual targets on disk and must keep rendering with their provenance intact.
        Assert.Equal(
            "2:05.4 · set by hand",
            PlanTargetResolver.Describe(new PlanTarget
            {
                Scope = PlanTargetScope.Manual,
                LapTimeSeconds = 125.4,
            }));
    }

    [Fact]
    public void PracticeProgramScopesAppearOnlyForProgramTypesTheCorpusActuallyContains()
    {
        var root = TestEnv.NewTempDataRoot();
        try
        {
            WithController(root, new FakeLapHistoryStore([ProgramPractice()]), controller =>
            {
                controller.CreatePlan(NewRequest());
                var choices = controller.TargetChoices();

                var quali = choices.Scope(PlanTargetScope.PracticeProgram, "QUALI");
                Assert.NotNull(quali);
                Assert.Equal("Practice program · QUALI", quali!.Label);
                // Hand-worked: only the two QUALI-tagged laps [140, 145].
                Assert.Equal(2, quali.SampleSize);
                Assert.Equal(140, quali.Option(PlanTargetStatistic.Fastest)!.LapTimeSeconds);

                Assert.NotNull(choices.Scope(PlanTargetScope.PracticeProgram, "PACE"));
                // Nothing in the corpus was ever run as an ENDURANCE program, so there is no
                // scope for it — the list is what the corpus holds, not a fixed menu.
                Assert.Null(choices.Scope(PlanTargetScope.PracticeProgram, "ENDURANCE"));

                // The program laps are still practice laps, so the plain Practice scope keeps
                // all four of them.
                Assert.Equal(4, choices.Scope(PlanTargetScope.Practice)!.SampleSize);
            });
        }
        finally
        {
            Directory.Delete(root, recursive: true);
        }
    }

    [Fact]
    public void PracticeProgramScopesAreHiddenInQuickMode()
    {
        var root = TestEnv.NewTempDataRoot();
        try
        {
            WithController(root, new FakeLapHistoryStore([ProgramPractice()]), controller =>
            {
                controller.CreatePlan(NewRequest() with { Mode = PlanMode.Quick });
                var choices = controller.TargetChoices();

                // Quick mode is the minute before joining a server; program scopes are the
                // deliberate, unhurried choice and stay out of it.
                Assert.Null(choices.Scope(PlanTargetScope.PracticeProgram, "QUALI"));
                Assert.DoesNotContain(choices.Scopes, group => group.Scope == PlanTargetScope.PracticeProgram);
                // The everyday scopes are still there — Quick mode hides the program list, not
                // targets themselves.
                Assert.NotNull(choices.Scope(PlanTargetScope.Practice));
            });
        }
        finally
        {
            Directory.Delete(root, recursive: true);
        }
    }

    /// <summary>Practice laps [136 untagged, 140 QUALI, 145 QUALI, 150 PACE].</summary>
    private static LapHistorySession ProgramPractice()
    {
        var session = Session("hs-programs", HistorySessionKind.Practice, PracticeAt, 136, 140, 145, 150);
        session.Laps[1].ProgramType = "QUALI";
        session.Laps[2].ProgramType = "QUALI";
        session.Laps[3].ProgramType = "PACE";
        return session;
    }

    [Fact]
    public void APlanFileWrittenBeforeTargetsExistedStillLoadsAndSimplyHasNone()
    {
        var root = TestEnv.NewTempDataRoot();
        try
        {
            // Exactly the shape the store wrote before this issue: no "targets" key at all.
            File.WriteAllText(Path.Combine(root, "legacy.json"), """
                {
                  "id": "legacy",
                  "name": "Spa 6h",
                  "game": "Le Mans Ultimate",
                  "car": "Porsche 963",
                  "track": "Spa-Francorchamps",
                  "status": "Draft",
                  "qualifyingIncluded": true,
                  "raceLengthFormat": "TimeBased",
                  "raceLengthValue": 360,
                  "fuelReserveLaps": 1,
                  "createdAt": "2026-07-20T10:00:00+00:00",
                  "segments": [],
                  "warnings": []
                }
                """);

            var plan = new SessionPlannerService(new LocalSessionPlanStore(root)).Find("legacy");

            Assert.NotNull(plan);
            Assert.Equal("Spa 6h", plan!.Name);
            Assert.Empty(plan.Targets);
            Assert.Null(plan.TargetsFor(SegmentKind.Qualifying));
            Assert.Null(plan.TargetsFor(SegmentKind.Race));
        }
        finally
        {
            Directory.Delete(root, recursive: true);
        }
    }

    [Fact]
    public void AStoredTargetIsPlainSerialisableDataOnThePlanFile()
    {
        var root = TestEnv.NewTempDataRoot();
        try
        {
            WithController(root, Corpus(), controller =>
            {
                controller.CreatePlan(NewRequest());
                controller.SetTarget(
                    SegmentKind.Qualifying,
                    controller.TargetChoices()
                        .Scope(PlanTargetScope.CurrentQualifying)!
                        .Option(PlanTargetStatistic.Fastest)!);
            });

            var json = File.ReadAllText(Path.Combine(root, "id-1.json"));

            // Nothing but data: no ids into another store, no sync bookkeeping. Enums are
            // written by name, so reordering a member cannot silently change stored plans.
            Assert.Contains("\"targets\"", json, StringComparison.Ordinal);
            Assert.Contains("\"kind\": \"Qualifying\"", json, StringComparison.Ordinal);
            Assert.Contains("\"scope\": \"CurrentQualifying\"", json, StringComparison.Ordinal);
            Assert.Contains("\"statistic\": \"Fastest\"", json, StringComparison.Ordinal);
            Assert.Contains("\"sampleSize\": 3", json, StringComparison.Ordinal);
            Assert.Contains("\"lapSessionId\": \"hs-q-current\"", json, StringComparison.Ordinal);
            Assert.Contains("\"hasReferenceCurve\": true", json, StringComparison.Ordinal);
        }
        finally
        {
            Directory.Delete(root, recursive: true);
        }
    }

    [Fact]
    public void TargetsAreEditableBeforeAnythingStartsAndTheTwoKindsStayIndependent()
    {
        var root = TestEnv.NewTempDataRoot();
        try
        {
            WithController(root, Corpus(), controller =>
            {
                var plan = controller.CreatePlan(NewRequest());
                var choices = controller.TargetChoices();

                controller.SetTarget(
                    SegmentKind.Qualifying,
                    choices.Scope(PlanTargetScope.CurrentQualifying)!.Option(PlanTargetStatistic.Fastest)!);
                controller.SetTarget(
                    SegmentKind.Race,
                    choices.Scope(PlanTargetScope.Practice)!.Option(PlanTargetStatistic.Slowest)!);

                // Nothing has been armed or tracked: there is no segment to hang a target on,
                // which is exactly why they live on the plan.
                Assert.Equal(PlanStatus.Draft, plan.Status);
                Assert.Empty(plan.Segments);

                // Changing the qualifying target replaces it rather than accumulating, and
                // leaves the race target (150 s, practice slowest) alone.
                controller.SetTarget(
                    SegmentKind.Qualifying,
                    choices.Scope(PlanTargetScope.Qualifying)!.Option(PlanTargetStatistic.Median)!);

                Assert.Equal(2, plan.Targets.Count);
                Assert.Equal(131, controller.TargetFor(SegmentKind.Qualifying)!.LapTimeSeconds);
                Assert.Equal(150, controller.TargetFor(SegmentKind.Race)!.LapTimeSeconds);

                controller.ClearTarget(SegmentKind.Qualifying);
                Assert.Null(controller.TargetFor(SegmentKind.Qualifying));
                Assert.Equal(150, controller.TargetFor(SegmentKind.Race)!.LapTimeSeconds);
            });
        }
        finally
        {
            Directory.Delete(root, recursive: true);
        }
    }

    [Fact]
    public void TheSelectorShowsTheFirstScopeUntilOneIsPickedAndFallsBackIfItDisappears()
    {
        var root = TestEnv.NewTempDataRoot();
        try
        {
            WithController(root, Corpus(), controller =>
            {
                controller.CreatePlan(NewRequest());
                var choices = controller.TargetChoices();

                // Current Quali first: the session right before the race is the common answer.
                Assert.Equal(PlanTargetScope.CurrentQualifying, controller.SelectedTargetScope(choices)?.Scope);

                controller.SelectTargetScope(PlanTargetScope.Practice);
                Assert.Equal(PlanTargetScope.Practice, controller.SelectedTargetScope(choices)?.Scope);

                // A scope the corpus no longer offers (a different plan's context, an emptied
                // corpus) must not leave the selector pointing at nothing.
                controller.SelectTargetScope(PlanTargetScope.PracticeProgram, "QUALI");
                Assert.Equal(PlanTargetScope.CurrentQualifying, controller.SelectedTargetScope(choices)?.Scope);
                Assert.Null(controller.SelectedTargetScope(PlanTargetChoices.None));
            });
        }
        finally
        {
            Directory.Delete(root, recursive: true);
        }
    }

    [Fact]
    public void AStoredTargetDescribesItsTimeItsProvenanceItsSampleSizeAndItsTier()
    {
        var root = TestEnv.NewTempDataRoot();
        try
        {
            WithController(root, Corpus(), controller =>
            {
                controller.CreatePlan(NewRequest());
                var choices = controller.TargetChoices();

                controller.SetTarget(
                    SegmentKind.Qualifying,
                    choices.Scope(PlanTargetScope.CurrentQualifying)!.Option(PlanTargetStatistic.Fastest)!);
                Assert.Equal(
                    "2:11.0 · Current Quali · 2026-07-31 18:20 · fastest of 3 laps · reference curve",
                    PlanTargetResolver.Describe(controller.TargetFor(SegmentKind.Qualifying)!));

                // A specific lap names the lap, and still says how large the corpus was.
                controller.SetTarget(SegmentKind.Race, choices.Scope(PlanTargetScope.Qualifying)!.Laps[3]);
                Assert.Equal(
                    "2:13.0 · Quali · lap 2 of 5 laps · reference curve",
                    PlanTargetResolver.Describe(controller.TargetFor(SegmentKind.Race)!));

            });
        }
        finally
        {
            Directory.Delete(root, recursive: true);
        }
    }

    [Fact]
    public void APlanWithNoCarOrTrackHasNoContextToResolveAgainst()
    {
        // A plan may be created before the driver is in a car. There is no corpus bucket for
        // "unknown", so an empty key must not match laps that were recorded without a context
        // either — that would aim a Porsche plan at whatever those laps happen to be.
        var unknown = Session("hs-unknown", HistorySessionKind.Qualifying, CurrentQualiAt, 131, 133);
        unknown.Context.TrackCourse = "";
        unknown.Context.CarModel = "";

        var root = TestEnv.NewTempDataRoot();
        try
        {
            WithController(root, new FakeLapHistoryStore([unknown]), controller =>
            {
                controller.CreatePlan(NewRequest() with { Car = "", Track = "" });

                Assert.True(controller.TargetChoices().IsEmpty);
            });
        }
        finally
        {
            Directory.Delete(root, recursive: true);
        }
    }

    private static CreatePlanRequest NewRequest() => new()
    {
        Name = "Spa 6h",
        Game = "Le Mans Ultimate",
        Car = "Porsche 963",
        Track = "Spa-Francorchamps",
        RaceLengthFormat = RaceLengthFormat.TimeBased,
        RaceLengthValue = 360,
    };

    /// <summary>
    /// The hand-worked corpus. Two qualifying sessions a week apart and one practice session,
    /// all for the plan's context:
    /// <list type="bullet">
    /// <item>Current Quali (31 Jul): 131, 133, 138 — fastest 131, median 133, slowest 138.</item>
    /// <item>All-time Quali: 129, 130, 131, 133, 138 — fastest 129, median 131, slowest 138.</item>
    /// <item>Practice: 136, 140, 145, 150 — fastest 136, lower median 140, slowest 150.</item>
    /// </list>
    /// </summary>
    private static ILapHistoryStore Corpus() => new FakeLapHistoryStore(
    [
        Session("hs-q-current", HistorySessionKind.Qualifying, CurrentQualiAt, 131, 133, 138),
        Session("hs-q-old", HistorySessionKind.Qualifying, OlderQualiAt, 129, 130),
        Session("hs-practice", HistorySessionKind.Practice, PracticeAt, 136, 140, 145, 150),
    ]);

    private static LapHistorySession Session(
        string id,
        HistorySessionKind kind,
        DateTimeOffset startedAt,
        params double[] lapTimes) => new()
    {
        Id = id,
        Kind = kind,
        StartedAt = startedAt,
        Origin = LapHistoryOrigin.Recorded,
        Context = new LapHistoryContext
        {
            Game = "Le Mans Ultimate",
            TrackCourse = "Spa-Francorchamps",
            CarModel = "Porsche 963",
        },
        Laps =
        [
            .. lapTimes.Select((time, index) => new LapHistoryRecord
            {
                LapNumber = index + 1,
                IsValid = true,
                LapTimeSeconds = time,
                // Recorded laps carry a curve; the tier tests override this.
                ReferenceCurve = new LapReferenceCurve { TimesSeconds = [0, time] },
            }),
        ],
    };

    /// <summary>Creates one plan for the corpus's context and hands over its target choices.</summary>
    private static void WithChoices(ILapHistoryStore corpus, Action<PlanTargetChoices> assert)
    {
        var root = TestEnv.NewTempDataRoot();
        try
        {
            WithController(root, corpus, controller =>
            {
                controller.CreatePlan(NewRequest());
                assert(controller.TargetChoices());
            });
        }
        finally
        {
            Directory.Delete(root, recursive: true);
        }
    }

    private static void WithController(
        string root,
        ILapHistoryStore corpus,
        Action<SessionPlannerController> body)
    {
        var counter = 0;
        var service = new SessionPlannerService(
            new LocalSessionPlanStore(root),
            clock: () => Now,
            idFactory: () => $"id-{++counter}");
        body(new SessionPlannerController(
            service,
            NoFuelHistorySource.Instance,
            () => PlanContext.Empty,
            corpus,
            () => Now));
    }

    private sealed class FakeLapHistoryStore(IReadOnlyList<LapHistorySession> sessions) : ILapHistoryStore
    {
        public IReadOnlyList<LapHistorySession> LoadAll() => sessions;

        public void Save(LapHistorySession session) => throw new NotSupportedException();

        public void Delete(string sessionId) => throw new NotSupportedException();
    }

    [Fact]
    public void TheTierNoteNamesAllThreeTiers()
    {
        Assert.Equal("time only", TierOption(curve: false, trace: false).TierNote);
        Assert.Equal("reference curve", TierOption(curve: true, trace: false).TierNote);
        Assert.Equal("full trace", TierOption(curve: true, trace: true).TierNote);
    }

    [Fact]
    public void TheTiersAreOrderedThinnestToRichest()
    {
        Assert.True(TierOption(curve: true, trace: true).Tier
            > TierOption(curve: true, trace: false).Tier);
        Assert.True(TierOption(curve: true, trace: false).Tier
            > TierOption(curve: false, trace: false).Tier);
    }

    [Fact]
    public void ATraceWithoutACurveIsStillOnlyTheThinnestTier()
    {
        // The two tiers share their completeness guards, so this should not arise — but if a
        // pruned or half-written corpus produces it, the note must not promise what a target
        // consumer cannot use. Plan target delivery reads the curve, not the trace.
        Assert.Equal("time only", TierOption(curve: false, trace: true).TierNote);
    }

    [Fact]
    public void TheTierIsCarriedOntoTheStoredTarget()
    {
        var stored = TierOption(curve: true, trace: true).ToTarget(Now);

        Assert.True(stored.HasReferenceCurve);
        Assert.True(stored.HasChannelTrace);
    }

    [Fact]
    public void ARecordedLapWithATraceResolvesToTheFullTraceTier()
    {
        // End to end through the resolver, so the flag is actually read off the corpus rather
        // than only being carried by a hand-built option.
        var store = new FakeLapHistoryStore([TracedSession()]);

        var choices = PlanTargetResolver.Choices(store, TracedContext(), PlanMode.Planned);
        var best = choices.Scope(PlanTargetScope.Practice)!.Option(PlanTargetStatistic.Fastest)!;

        Assert.Equal(LapTargetTier.FullTrace, best.Tier);
        Assert.Equal("full trace", best.TierNote);
    }

    private static PlanTargetOption TierOption(bool curve, bool trace) => new(
        PlanTargetScope.Practice,
        null,
        PlanTargetStatistic.Fastest,
        "Fastest",
        "1:30.500",
        "",
        90.5,
        1,
        "hs-tier",
        3,
        curve,
        trace,
        null);

    private static LapHistoryContext TracedContext() => new()
    {
        Game = "Le Mans Ultimate",
        TrackCourse = "Monza",
        CarModel = "Ferrari 499P",
    };

    private static LapHistorySession TracedSession() => new()
    {
        Id = "hs-traced",
        Kind = HistorySessionKind.Practice,
        StartedAt = Now.AddHours(-2),
        Context = TracedContext(),
        Laps =
        [
            new LapHistoryRecord
            {
                LapNumber = 1,
                IsValid = true,
                LapTimeSeconds = 100,
                TraceId = LapTraceId.For("hs-traced", 1),
                ReferenceCurve = new LapReferenceCurve { PositionStep = 0.5, TimesSeconds = [0, 50, 100] },
            },
        ],
    };
}

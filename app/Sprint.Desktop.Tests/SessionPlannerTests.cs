using Sprint.Desktop.Api.Telemetry;
using Sprint.Desktop.Features.SessionPlanning;
using Xunit;

namespace Sprint.Desktop.Tests;

/// <summary>
/// Behavior tests for the Session Planner foundation (#99): local store round-trip,
/// plan lifecycle, the single active-tracking slot, and telemetry ingestion. Runs
/// against a throwaway temp root via the real <see cref="LocalSessionPlanStore"/>, so
/// persistence is exercised end-to-end and never touches the user's AppData.
/// </summary>
public sealed class SessionPlannerTests
{
    [Fact]
    public void APlanRemembersWhetherItWasCreatedQuicklyOrPlanned()
    {
        var root = TestEnv.NewTempDataRoot();
        try
        {
            var store = new LocalSessionPlanStore(root);
            var service = new SessionPlannerService(store, clock: () => new DateTimeOffset(2026, 8, 1, 12, 0, 0, TimeSpan.Zero));

            var quick = service.CreatePlan(new CreatePlanRequest { Name = "Quick", Mode = PlanMode.Quick });
            var planned = service.CreatePlan(new CreatePlanRequest { Name = "Planned" });

            Assert.Equal(PlanMode.Quick, quick.Mode);
            // Default is Planned, so a request that says nothing keeps the old meaning.
            Assert.Equal(PlanMode.Planned, planned.Mode);

            // The mode has to survive the modal closing — #102 shows confidence from it.
            var reloaded = new LocalSessionPlanStore(root).LoadAll();
            Assert.Equal(PlanMode.Quick, reloaded.Single(plan => plan.Name == "Quick").Mode);
            Assert.Equal(PlanMode.Planned, reloaded.Single(plan => plan.Name == "Planned").Mode);
        }
        finally
        {
            Directory.Delete(root, recursive: true);
        }
    }

    [Fact]
    public void APlanFileWrittenBeforeModesExistedReadsAsPlanned()
    {
        var root = TestEnv.NewTempDataRoot();
        try
        {
            // A pre-existing file has no "mode" key at all; an upgrade must not silently
            // reinterpret the user's saved plans as quick ones.
            File.WriteAllText(
                Path.Combine(root, "old.json"),
                """{"id":"old","name":"Last season","raceLengthFormat":"TimeBased","raceLengthValue":60}""");

            var plan = Assert.Single(new LocalSessionPlanStore(root).LoadAll());

            Assert.Equal(PlanMode.Planned, plan.Mode);
        }
        finally
        {
            Directory.Delete(root, recursive: true);
        }
    }

    private static readonly DateTimeOffset Now = new(2026, 7, 13, 12, 0, 0, TimeSpan.Zero);

    [Fact]
    public void LocalStoreRoundTripsPlansAndActivePointerAndIgnoresPointerInLoadAll()
    {
        var root = TestEnv.NewTempDataRoot();
        try
        {
            var store = new LocalSessionPlanStore(root);
            var plan = new SessionPlan { Id = "plan-1", Name = "Spa 6h", Game = "lmu", CreatedAt = Now };
            store.Save(plan);
            store.SaveActivePlanId("plan-1");

            var reloaded = new LocalSessionPlanStore(root);
            var all = reloaded.LoadAll();

            Assert.Single(all);
            Assert.Equal("Spa 6h", all[0].Name);
            Assert.Equal("plan-1", reloaded.LoadActivePlanId());
        }
        finally
        {
            Directory.Delete(root, recursive: true);
        }
    }

    [Fact]
    public void LocalStoreDeleteRemovesPlanAndClearsActivePointer()
    {
        var root = TestEnv.NewTempDataRoot();
        try
        {
            var store = new LocalSessionPlanStore(root);
            store.Save(new SessionPlan { Id = "plan-1", CreatedAt = Now });
            store.SaveActivePlanId("plan-1");

            store.Delete("plan-1");

            Assert.Empty(store.LoadAll());
            Assert.Null(store.LoadActivePlanId());
        }
        finally
        {
            Directory.Delete(root, recursive: true);
        }
    }

    [Fact]
    public void LocalStoreSkipsCorruptPlanFileButKeepsOthers()
    {
        var root = TestEnv.NewTempDataRoot();
        try
        {
            var store = new LocalSessionPlanStore(root);
            store.Save(new SessionPlan { Id = "good", Name = "Keep", CreatedAt = Now });
            File.WriteAllText(Path.Combine(root, "corrupt.json"), "{ not valid json");

            var all = store.LoadAll();

            Assert.Single(all);
            Assert.Equal("good", all[0].Id);
        }
        finally
        {
            Directory.Delete(root, recursive: true);
        }
    }

    [Fact]
    public void CreatePlanPersistsAndListsNewestFirst()
    {
        Run((service, _) =>
        {
            var first = service.CreatePlan(new CreatePlanRequest { Name = "First" });
            var second = service.CreatePlan(new CreatePlanRequest { Name = "Second" });

            Assert.Equal(new[] { second.Id, first.Id }, service.Plans.Select(plan => plan.Id));
            Assert.Equal(PlanStatus.Draft, first.Status);
        });
    }

    [Fact]
    public void CompletedPlansSurviveReloadAsHistory()
    {
        var root = TestEnv.NewTempDataRoot();
        try
        {
            var service = NewService(root, out _);
            var plan = service.CreatePlan(new CreatePlanRequest { Name = "History" });
            service.StartTracking(plan.Id, SegmentKind.Race);
            service.StopTracking(plan.Id);

            var reloaded = NewService(root, out _);

            var restored = Assert.Single(reloaded.Plans);
            Assert.Equal(PlanStatus.Completed, restored.Status);
            Assert.Null(reloaded.ActivePlan);
        }
        finally
        {
            Directory.Delete(root, recursive: true);
        }
    }

    [Fact]
    public void OnlyOnePlanMayHoldTheActiveSlot()
    {
        Run((service, _) =>
        {
            var a = service.CreatePlan(new CreatePlanRequest { Name = "A" });
            var b = service.CreatePlan(new CreatePlanRequest { Name = "B" });

            service.StartTracking(a.Id, SegmentKind.Qualifying);

            var ex = Assert.Throws<InvalidOperationException>(() => service.Arm(b.Id));
            Assert.Contains("only one plan can be active", ex.Message, StringComparison.OrdinalIgnoreCase);
            Assert.Equal(a.Id, service.ActivePlan?.Id);
        });
    }

    [Fact]
    public void StartTrackingOpensSegmentAndStopClosesItAndReleasesSlot()
    {
        Run((service, _) =>
        {
            var plan = service.CreatePlan(new CreatePlanRequest { Name = "Race" });

            var segment = service.StartTracking(plan.Id, SegmentKind.Race);
            Assert.Equal(PlanStatus.Tracking, plan.Status);
            Assert.NotNull(segment.ActualStart);
            Assert.Null(segment.ActualEnd);
            Assert.Same(plan, service.ActivePlan);

            service.StopTracking(plan.Id);
            Assert.Equal(PlanStatus.Completed, plan.Status);
            Assert.NotNull(plan.Segments[0].ActualEnd);
            Assert.Null(service.ActivePlan);

            // Slot released: a second plan can now be tracked.
            var next = service.CreatePlan(new CreatePlanRequest { Name = "Next" });
            service.StartTracking(next.Id, SegmentKind.Race);
            Assert.Equal(next.Id, service.ActivePlan?.Id);
        });
    }

    [Fact]
    public void IngestAppendsALapSummaryWhenTheLapCounterAdvances()
    {
        Run((service, _) =>
        {
            var plan = service.CreatePlan(new CreatePlanRequest { Name = "Race" });
            var segment = service.StartTracking(plan.Id, SegmentKind.Race);

            service.Ingest(Frame(lap: 1, lastLapTime: 0));      // establishes baseline, no lap yet
            service.Ingest(Frame(lap: 2, lastLapTime: 92.5, fuel: 40f)); // lap 1 completed

            var summary = Assert.Single(segment.Laps);
            Assert.Equal(1, summary.LapNumber);
            Assert.Equal(92.5, summary.LapTimeSeconds);
            Assert.Equal(40d, summary.FuelRemainingLiters);
        });
    }

    [Fact]
    public void CompletedLapValidityDoesNotComeFromTheNewLapCrossingFrame()
    {
        Run((service, _) =>
        {
            SessionPlan plan = service.CreatePlan(new CreatePlanRequest { Name = "Race" });
            PlanSegment segment = service.StartTracking(plan.Id, SegmentKind.Race);

            service.Ingest(Frame(lap: 1, lastLapTime: 0, isValid: true));
            service.Ingest(Frame(lap: 2, lastLapTime: 92.5, isValid: false));

            Assert.True(Assert.Single(segment.Laps).IsValid);
        });
    }

    [Fact]
    public void IngestRaisesRaceFormatMismatchWarningOnceWhenTelemetryDisagrees()
    {
        Run((service, _) =>
        {
            var plan = service.CreatePlan(new CreatePlanRequest
            {
                Name = "Race",
                RaceLengthFormat = RaceLengthFormat.TimeBased,
            });
            service.StartTracking(plan.Id, SegmentKind.Race);

            // Telemetry reports a lap-based race (MaxLaps > 0) -> mismatch.
            service.Ingest(Frame(lap: 1, lastLapTime: 0, maxLaps: 20));
            service.Ingest(Frame(lap: 1, lastLapTime: 0, maxLaps: 20));

            var warning = Assert.Single(plan.Warnings);
            Assert.Equal("race-format-mismatch", warning.Kind);
        });
    }

    [Fact]
    public void IngestIsANoOpWhenNoPlanIsTracking()
    {
        Run((service, _) =>
        {
            var plan = service.CreatePlan(new CreatePlanRequest { Name = "Idle" });
            service.Ingest(Frame(lap: 5, lastLapTime: 90));
            Assert.Empty(plan.Segments);
        });
    }

    [Fact]
    public void ReconcileDemotesACrashLeftTrackingPlanToAbandonedOnReload()
    {
        var root = TestEnv.NewTempDataRoot();
        try
        {
            var service = NewService(root, out _);
            var plan = service.CreatePlan(new CreatePlanRequest { Name = "Crashed" });
            service.StartTracking(plan.Id, SegmentKind.Race);
            // Simulate a crash: process dies with the plan still Tracking and slot held.

            var reloaded = NewService(root, out _);

            var restored = Assert.Single(reloaded.Plans);
            Assert.Equal(PlanStatus.Abandoned, restored.Status);
            Assert.NotNull(restored.Segments[0].ActualEnd);
            Assert.Null(reloaded.ActivePlan);
        }
        finally
        {
            Directory.Delete(root, recursive: true);
        }
    }

    [Fact]
    public void CreatePlanPersistsManualFuelFallbackValues()
    {
        var root = TestEnv.NewTempDataRoot();
        try
        {
            var service = NewService(root, out _);
            service.CreatePlan(new CreatePlanRequest
            {
                Name = "Spa",
                AvgLapTimeSeconds = 125.4,
                FuelPerLapLiters = 3.4,
            });

            var reloaded = NewService(root, out _);

            var restored = Assert.Single(reloaded.Plans);
            Assert.Equal(125.4, restored.AvgLapTimeSeconds);
            Assert.Equal(3.4, restored.FuelPerLapLiters);
        }
        finally
        {
            Directory.Delete(root, recursive: true);
        }
    }

    [Fact]
    public void PlanFilesWrittenBeforeTheFuelFieldsExistedStillLoad()
    {
        var root = TestEnv.NewTempDataRoot();
        try
        {
            File.WriteAllText(
                Path.Combine(root, "old.json"),
                """{"id":"old","name":"Legacy","createdAt":"2026-01-01T00:00:00+00:00"}""");

            var service = NewService(root, out _);

            var restored = Assert.Single(service.Plans);
            Assert.Equal("Legacy", restored.Name);
            Assert.Null(restored.AvgLapTimeSeconds);
            Assert.Null(restored.FuelPerLapLiters);
        }
        finally
        {
            Directory.Delete(root, recursive: true);
        }
    }

    [Fact]
    public void DisarmReturnsAnArmedPlanToDraftAndReleasesTheSlot()
    {
        Run((service, _) =>
        {
            var plan = service.CreatePlan(new CreatePlanRequest { Name = "Armed" });
            service.Arm(plan.Id);
            Assert.Equal(PlanStatus.Armed, plan.Status);

            service.Disarm(plan.Id);

            Assert.Equal(PlanStatus.Draft, plan.Status);
            Assert.Null(service.ActivePlan);
            Assert.Empty(plan.Segments);

            // The slot is genuinely free: another plan can claim it.
            var other = service.CreatePlan(new CreatePlanRequest { Name = "Other" });
            service.Arm(other.Id);
            Assert.Equal(other.Id, service.ActivePlan?.Id);
        });
    }

    [Fact]
    public void DisarmIsANoOpForAPlanThatIsNotArmed()
    {
        Run((service, _) =>
        {
            var plan = service.CreatePlan(new CreatePlanRequest { Name = "Tracking" });
            service.StartTracking(plan.Id, SegmentKind.Race);

            service.Disarm(plan.Id);

            Assert.Equal(PlanStatus.Tracking, plan.Status);
            Assert.Equal(plan.Id, service.ActivePlan?.Id);
        });
    }

    [Fact]
    public void ReleaseActiveSlotDisarmsAnArmedPlanAndStopsATrackingOne()
    {
        Run((service, _) =>
        {
            var armed = service.CreatePlan(new CreatePlanRequest { Name = "Armed" });
            service.Arm(armed.Id);
            service.ReleaseActiveSlot();
            Assert.Equal(PlanStatus.Draft, armed.Status);
            Assert.Null(service.ActivePlan);

            var tracking = service.CreatePlan(new CreatePlanRequest { Name = "Tracking" });
            service.StartTracking(tracking.Id, SegmentKind.Race);
            service.ReleaseActiveSlot();
            Assert.Equal(PlanStatus.Completed, tracking.Status);
            Assert.Null(service.ActivePlan);

            // Releasing with nothing active is harmless.
            service.ReleaseActiveSlot();
            Assert.Null(service.ActivePlan);
        });
    }

    [Fact]
    public void ArmedPlanAutoStartsOnceTheReportedSessionTypeHoldsForASecond()
    {
        var root = TestEnv.NewTempDataRoot();
        try
        {
            var now = Now;
            var service = NewServiceWithClock(root, () => now);
            var plan = service.CreatePlan(new CreatePlanRequest { Name = "Race" });
            service.Arm(plan.Id);

            // First sighting only starts the hold.
            service.Ingest(SessionFrame(SessionType.Race));
            Assert.Equal(PlanStatus.Armed, plan.Status);
            Assert.Empty(plan.Segments);

            // Still inside the hold window.
            now = Now.AddMilliseconds(500);
            service.Ingest(SessionFrame(SessionType.Race));
            Assert.Equal(PlanStatus.Armed, plan.Status);

            // Hold satisfied.
            now = Now.AddMilliseconds(1000);
            service.Ingest(SessionFrame(SessionType.Race));

            Assert.Equal(PlanStatus.Tracking, plan.Status);
            var segment = Assert.Single(plan.Segments);
            Assert.Equal(SegmentKind.Race, segment.Kind);
            Assert.Equal(SegmentSource.Detected, segment.Source);
            Assert.Equal(DetectionConfidence.Medium, segment.SourceConfidence);
        }
        finally
        {
            Directory.Delete(root, recursive: true);
        }
    }

    [Fact]
    public void AFlickeringSessionTypeRestartsTheAutoStartHold()
    {
        var root = TestEnv.NewTempDataRoot();
        try
        {
            var now = Now;
            var service = NewServiceWithClock(root, () => now);
            var plan = service.CreatePlan(new CreatePlanRequest { Name = "Race" });
            service.Arm(plan.Id);

            service.Ingest(SessionFrame(SessionType.Race));
            now = Now.AddMilliseconds(900);
            service.Ingest(SessionFrame(SessionType.Practice)); // breaks the run
            now = Now.AddMilliseconds(1800);
            service.Ingest(SessionFrame(SessionType.Race));     // hold starts over here

            Assert.Equal(PlanStatus.Armed, plan.Status);
            Assert.Empty(plan.Segments);
        }
        finally
        {
            Directory.Delete(root, recursive: true);
        }
    }

    [Fact]
    public void AutoStartIgnoresQualifyingWhenThePlanSkipsIt()
    {
        var root = TestEnv.NewTempDataRoot();
        try
        {
            var now = Now;
            var service = NewServiceWithClock(root, () => now);
            var plan = service.CreatePlan(new CreatePlanRequest
            {
                Name = "Race only",
                QualifyingIncluded = false,
            });
            service.Arm(plan.Id);

            service.Ingest(SessionFrame(SessionType.Qualify));
            now = Now.AddSeconds(5);
            service.Ingest(SessionFrame(SessionType.Qualify));
            Assert.Equal(PlanStatus.Armed, plan.Status);

            // It waits for Race and starts on that instead.
            now = Now.AddSeconds(6);
            service.Ingest(SessionFrame(SessionType.Race));
            now = Now.AddSeconds(8);
            service.Ingest(SessionFrame(SessionType.Race));

            Assert.Equal(PlanStatus.Tracking, plan.Status);
            Assert.Equal(SegmentKind.Race, Assert.Single(plan.Segments).Kind);
        }
        finally
        {
            Directory.Delete(root, recursive: true);
        }
    }

    [Fact]
    public void AutoStartStartsQualifyingWhenThePlanIncludesIt()
    {
        var root = TestEnv.NewTempDataRoot();
        try
        {
            var now = Now;
            var service = NewServiceWithClock(root, () => now);
            var plan = service.CreatePlan(new CreatePlanRequest { Name = "Weekend" });
            service.Arm(plan.Id);

            service.Ingest(SessionFrame(SessionType.Qualify));
            now = Now.AddSeconds(2);
            service.Ingest(SessionFrame(SessionType.Qualify));

            Assert.Equal(SegmentKind.Qualifying, Assert.Single(plan.Segments).Kind);
        }
        finally
        {
            Directory.Delete(root, recursive: true);
        }
    }

    [Fact]
    public void ADraftPlanNeverAutoStarts()
    {
        var root = TestEnv.NewTempDataRoot();
        try
        {
            var now = Now;
            var service = NewServiceWithClock(root, () => now);
            var plan = service.CreatePlan(new CreatePlanRequest { Name = "Draft" });

            service.Ingest(SessionFrame(SessionType.Race));
            now = Now.AddSeconds(5);
            service.Ingest(SessionFrame(SessionType.Race));

            Assert.Equal(PlanStatus.Draft, plan.Status);
            Assert.Empty(plan.Segments);
        }
        finally
        {
            Directory.Delete(root, recursive: true);
        }
    }

    private static TelemetryFrame Frame(
        int lap,
        double lastLapTime,
        float fuel = 0f,
        int maxLaps = 0,
        bool isValid = true) => new()
    {
        Session = new SessionInfo { SessionType = SessionType.Race, MaxLaps = maxLaps },
        Lap = new LapState { CurrentLap = lap, LastLapTime = lastLapTime, IsValid = isValid },
        Car = new CarState { FuelLiters = fuel },
    };

    private static void Run(Action<SessionPlannerService, string> body)
    {
        var root = TestEnv.NewTempDataRoot();
        try
        {
            var service = NewService(root, out var storeRoot);
            body(service, storeRoot);
        }
        finally
        {
            Directory.Delete(root, recursive: true);
        }
    }

    /// <summary>A service whose clock the test drives, for time-dependent behaviour.</summary>
    private static SessionPlannerService NewServiceWithClock(string root, Func<DateTimeOffset> clock)
    {
        var counter = 0;
        return new SessionPlannerService(
            new LocalSessionPlanStore(root),
            clock: clock,
            idFactory: () => $"id-{++counter}");
    }

    private static TelemetryFrame SessionFrame(SessionType type) => new()
    {
        Session = new SessionInfo { SessionType = type },
        Lap = new LapState { CurrentLap = 0, LastLapTime = 0 },
    };

    private static SessionPlannerService NewService(string root, out string storeRoot)
    {
        storeRoot = root;
        var store = new LocalSessionPlanStore(root);
        var counter = 0;
        return new SessionPlannerService(
            store,
            clock: () => Now,
            idFactory: () => $"id-{++counter}");
    }
}

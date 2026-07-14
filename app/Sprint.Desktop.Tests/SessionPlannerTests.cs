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

    private static TelemetryFrame Frame(int lap, double lastLapTime, float fuel = 0f, int maxLaps = 0) => new()
    {
        Session = new SessionInfo { SessionType = SessionType.Race, MaxLaps = maxLaps },
        Lap = new LapState { CurrentLap = lap, LastLapTime = lastLapTime, IsValid = true },
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

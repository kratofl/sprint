using Sprint.Desktop.Api.Telemetry;
using Sprint.Desktop.Features.Live;
using Sprint.Desktop.Features.SessionPlanning;
using Xunit;

namespace Sprint.Desktop.Host.Tests;

/// <summary>
/// Focused tests for <see cref="TelemetryIngestionPipeline"/>: the wiring gap the parity audit
/// found (driving records no laps, armed plans never start). Not a smoke test of every consumer
/// — each Core consumer (<see cref="LapHistoryRecorder"/>, <see cref="SessionPlannerService"/>,
/// <see cref="PlanTargetDelivery"/>) already has its own focused tests in Sprint.Desktop.Tests;
/// these pin the pipeline's own job: exactly-once fan-out per new frame, and isolating one
/// consumer's failure from the others.
/// </summary>
public sealed class TelemetryIngestionPipelineTests
{
    [Fact]
    public void SyntheticLapOfFrames_ProducesARecordedLap()
    {
        string dataRoot = NewTempDataRoot();
        try
        {
            DesktopRuntime runtime = new(dataRoot, PresetRoot);
            ILapHistoryStore lapHistoryStore = new LocalLapHistoryStore(Path.Combine(dataRoot, "lap-history"));
            ILapTraceStore lapTraceStore = new LocalLapTraceStore(Path.Combine(dataRoot, "lap-traces"));
            SessionPlannerService planner = new(new LocalSessionPlanStore(Path.Combine(dataRoot, "session-plans")));
            // Synchronous dispatch: the recorder's default hands persistence to the thread pool,
            // which would make this test race its own assertion.
            LapHistoryRecorder lapHistory = new(lapHistoryStore, lapTraceStore, dispatch: work => work());
            PlanTargetDelivery planTargets = new(() => planner.ActivePlan, lapHistoryStore);
            TelemetryIngestionPipeline pipeline = new(runtime, planner, lapHistory, planTargets, _ => { });

            // Establishes the baseline lap (1) the recorder is waiting to see finished, then
            // crosses the line into lap 2 with a completed time for lap 1.
            pipeline.Poll(Frame(currentLap: 1));
            pipeline.Poll(Frame(currentLap: 2, lastLapTime: 92.345));

            LapHistorySession session = Assert.Single(lapHistoryStore.LoadAll());
            LapHistoryRecord lap = Assert.Single(session.Laps);
            Assert.Equal(1, lap.LapNumber);
            Assert.Equal(92.345, lap.LapTimeSeconds);
        }
        finally
        {
            Cleanup(dataRoot);
        }
    }

    [Fact]
    public void ArmedPlan_AutoStartsFromFrames()
    {
        string dataRoot = NewTempDataRoot();
        try
        {
            DesktopRuntime runtime = new(dataRoot, PresetRoot);
            TestClock clock = new();
            SessionPlannerService planner = new(
                new LocalSessionPlanStore(Path.Combine(dataRoot, "session-plans")),
                clock: () => clock.Now);
            ILapHistoryStore lapHistoryStore = new LocalLapHistoryStore(Path.Combine(dataRoot, "lap-history"));
            LapHistoryRecorder lapHistory = new(lapHistoryStore, dispatch: work => work());
            PlanTargetDelivery planTargets = new(() => planner.ActivePlan, lapHistoryStore);
            TelemetryIngestionPipeline pipeline = new(runtime, planner, lapHistory, planTargets, _ => { });

            SessionPlan plan = planner.CreatePlan(new CreatePlanRequest { Name = "Race", Game = "LMU", Car = "GT3", Track = "Spa" });
            planner.Arm(plan.Id);
            Assert.Equal(PlanStatus.Armed, planner.Find(plan.Id)!.Status);

            // The reported session type has to hold for the auto-start hold (1s) before a
            // segment opens, so this needs two frames spaced across that hold, not just one.
            pipeline.Poll(Frame(sessionType: SessionType.Race));
            Assert.Equal(PlanStatus.Armed, planner.Find(plan.Id)!.Status);

            clock.Now = clock.Now.AddSeconds(1.5);
            pipeline.Poll(Frame(sessionType: SessionType.Race));

            Assert.Equal(PlanStatus.Tracking, planner.Find(plan.Id)!.Status);
        }
        finally
        {
            Cleanup(dataRoot);
        }
    }

    [Fact]
    public void EachFrame_IsIngestedExactlyOnceRegardlessOfPollRate()
    {
        string dataRoot = NewTempDataRoot();
        try
        {
            DesktopRuntime runtime = new(dataRoot, PresetRoot);
            ILapHistoryStore lapHistoryStore = new LocalLapHistoryStore(Path.Combine(dataRoot, "lap-history"));
            SessionPlannerService planner = new(new LocalSessionPlanStore(Path.Combine(dataRoot, "session-plans")));
            LapHistoryRecorder lapHistory = new(lapHistoryStore, dispatch: work => work());
            PlanTargetDelivery planTargets = new(() => planner.ActivePlan, lapHistoryStore);
            TelemetryIngestionPipeline pipeline = new(runtime, planner, lapHistory, planTargets, _ => { });

            // A host publish loop polling faster than the game publishes new frames re-observes
            // the same TelemetryEngine.Snapshot.Frame instance on every extra tick.
            TelemetryFrame frameA = Frame(currentLap: 1);
            pipeline.Poll(frameA);
            pipeline.Poll(frameA);
            pipeline.Poll(frameA);
            Assert.Equal(1, pipeline.IngestCount);

            TelemetryFrame frameB = Frame(currentLap: 2, lastLapTime: 80);
            pipeline.Poll(frameB);
            pipeline.Poll(frameB);
            Assert.Equal(2, pipeline.IngestCount);
        }
        finally
        {
            Cleanup(dataRoot);
        }
    }

    [Fact]
    public void AThrowingConsumer_DoesNotStopTheOthersOrThePipeline()
    {
        string dataRoot = NewTempDataRoot();
        try
        {
            DesktopRuntime runtime = new(dataRoot, PresetRoot);
            TestClock clock = new();
            ThrowingSessionPlanStore planStore = new(new LocalSessionPlanStore(Path.Combine(dataRoot, "session-plans")));
            SessionPlannerService planner = new(planStore, clock: () => clock.Now);
            ILapHistoryStore lapHistoryStore = new LocalLapHistoryStore(Path.Combine(dataRoot, "lap-history"));
            LapHistoryRecorder lapHistory = new(lapHistoryStore, dispatch: work => work());
            PlanTargetDelivery planTargets = new(() => planner.ActivePlan, lapHistoryStore);
            List<DeltaReference?> requestedReferences = [];
            TelemetryIngestionPipeline pipeline = new(
                runtime, planner, lapHistory, planTargets, reference => requestedReferences.Add(reference));

            SessionPlan plan = planner.CreatePlan(new CreatePlanRequest { Name = "Race", Game = "LMU", Car = "GT3", Track = "Spa" });
            planner.Arm(plan.Id);
            pipeline.Poll(Frame(sessionType: SessionType.Race, currentLap: 1));
            clock.Now = clock.Now.AddSeconds(1.5);
            pipeline.Poll(Frame(sessionType: SessionType.Race, currentLap: 1));
            Assert.Equal(PlanStatus.Tracking, planner.Find(plan.Id)!.Status);

            // The session planner is the second of four consumers the pipeline fans a frame out
            // to (after last-seen context, before lap history and plan-target delivery). Once it
            // is tracking, every ingested frame calls its store's Save; making that throw proves
            // a failure there does not skip the lap-history recording or the plan-target push
            // that come after it in the same call, and does not escape Poll.
            planStore.ThrowOnSave = true;
            int requestedBefore = requestedReferences.Count;
            TelemetryFrame lapCrossing = Frame(sessionType: SessionType.Race, currentLap: 2, lastLapTime: 95.0);
            Exception? escaped = Record.Exception(() => pipeline.Poll(lapCrossing));

            Assert.Null(escaped);
            LapHistorySession session = Assert.Single(lapHistoryStore.LoadAll());
            Assert.Single(session.Laps);
            // The lap-number crossing (1 -> 2) is exactly what fires PlanTargetDelivery's latch,
            // so this call must have added exactly one more request despite the earlier throw.
            Assert.Equal(requestedBefore + 1, requestedReferences.Count);

            // The pipeline itself is not poisoned by the earlier throw: it keeps counting and
            // fanning out on the next genuinely new frame.
            pipeline.Poll(Frame(sessionType: SessionType.Race, currentLap: 3, lastLapTime: 91.0));
            Assert.Equal(4, pipeline.IngestCount);
        }
        finally
        {
            Cleanup(dataRoot);
        }
    }

    private static TelemetryFrame Frame(
        string game = "LMU",
        string track = "Spa",
        string car = "GT3",
        SessionType sessionType = SessionType.Practice,
        bool inCar = true,
        int currentLap = 0,
        double lastLapTime = 0) => new()
    {
        Session = new SessionInfo
        {
            Game = game,
            Track = track,
            Car = car,
            SessionType = sessionType,
            InCar = inCar,
        },
        Lap = new LapState
        {
            CurrentLap = currentLap,
            LastLapTime = lastLapTime,
        },
    };

    private static string NewTempDataRoot()
    {
        string dir = Path.Combine(Path.GetTempPath(), "Sprint.Desktop.Host.Tests", Guid.NewGuid().ToString("N"));
        Directory.CreateDirectory(dir);
        return dir;
    }

    private static void Cleanup(string dataRoot)
    {
        if (Directory.Exists(dataRoot))
        {
            Directory.Delete(dataRoot, recursive: true);
        }
    }

    private static string PresetRoot => Path.Combine(RepoRoot, "app", "Sprint.Desktop.Host", "presets");

    private static string RepoRoot
    {
        get
        {
            for (DirectoryInfo? dir = new(AppContext.BaseDirectory); dir is not null; dir = dir.Parent)
            {
                if (Directory.Exists(Path.Combine(dir.FullName, "app", "Sprint.Desktop.Host", "presets")))
                {
                    return dir.FullName;
                }
            }

            throw new InvalidOperationException("Could not locate the repo root from the test's base directory.");
        }
    }

    /// <summary>A mutable clock so a test can move time forward past the auto-start hold without
    /// a real 1-second sleep.</summary>
    private sealed class TestClock
    {
        public DateTimeOffset Now { get; set; } = DateTimeOffset.UtcNow;
    }

    /// <summary>Wraps a real store so a test can turn on a <see cref="Save"/> failure at a
    /// precise moment, without needing a full hand-written fake of every member.</summary>
    private sealed class ThrowingSessionPlanStore(ISessionPlanStore inner) : ISessionPlanStore
    {
        public bool ThrowOnSave { get; set; }

        public IReadOnlyList<SessionPlan> LoadAll() => inner.LoadAll();

        public void Save(SessionPlan plan)
        {
            if (ThrowOnSave)
            {
                throw new InvalidOperationException("Simulated session-plan store failure.");
            }

            inner.Save(plan);
        }

        public void Delete(string planId) => inner.Delete(planId);

        public string? LoadActivePlanId() => inner.LoadActivePlanId();

        public void SaveActivePlanId(string? planId) => inner.SaveActivePlanId(planId);
    }
}

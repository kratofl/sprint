using Sprint.Desktop.Api.Games;
using Sprint.Desktop.Api.Telemetry;
using Sprint.Desktop.Features.Analysis;
using Sprint.Desktop.Features.SessionPlanning;
using Sprint.Desktop.Features.Setup;
using Sprint.Games.LeMansUltimate.Setups;
using Xunit;

namespace Sprint.Desktop.Tests;

/// <summary>
/// Setups on runs: the recorder splits a session where the car went back to the garage, the
/// driver puts a setup on a run in Analysis, the run keeps the version the file held when it
/// started, and the Setups pages read how each version drove. Nothing is ever guessed.
/// </summary>
public sealed class RunSetupTests : IDisposable
{
    private static readonly DateTimeOffset Start = new(2026, 10, 29, 18, 0, 0, TimeSpan.Zero);

    private readonly string _root = Path.Combine(Path.GetTempPath(), "sprint-run-setups-" + Guid.NewGuid().ToString("N"));

    public RunSetupTests() => Directory.CreateDirectory(this._root);

    public void Dispose()
    {
        try
        {
            Directory.Delete(this._root, recursive: true);
        }
        catch (IOException)
        {
            // Best-effort temp cleanup; a locked file must not fail the test run.
        }
    }

    [Fact]
    public void A_run_ends_in_the_garage_and_not_on_a_roll_past_the_stall()
    {
        LocalLapHistoryStore store = new(Path.Combine(this._root, "lap-history"));
        LapHistoryRecorder recorder = new(store, clock: () => Start, idFactory: () => "hs-1", dispatch: work => work());
        int outings = 0;
        recorder.OutingStarted += () => outings++;

        recorder.Ingest(Frame(1, 0, 0));
        recorder.Ingest(Frame(2, 131.0, 130));
        // Through the pit lane past the stall at speed: still the same run.
        recorder.Ingest(Frame(2, 131.0, 140) with { Car = new CarState { InGarage = true, SpeedMetersPerSecond = 16f } });
        recorder.Ingest(Frame(3, 130.5, 270));
        // Back to the game's garage screen, where setups change, then out again.
        recorder.Ingest(Frame(3, 130.5, 300) with { Session = Frame(3, 0, 300).Session with { InCar = false } });
        recorder.Ingest(Frame(3, 130.5, 600));
        recorder.Ingest(Frame(4, 129.8, 730));
        // Parked in the stall without leaving the car counts too.
        recorder.Ingest(Frame(4, 129.8, 740) with { Car = new CarState { InGarage = true, SpeedMetersPerSecond = 0f } });
        recorder.Ingest(Frame(4, 129.8, 900));
        recorder.Ingest(Frame(5, 129.1, 1030));

        LapHistorySession session = Assert.Single(store.LoadAll());
        Assert.Equal([(1, 1), (2, 1), (3, 2), (4, 3)], session.Laps.Select(lap => (lap.LapNumber, lap.Outing ?? 0)));
        Assert.Equal(Start.AddSeconds(130), session.Laps[0].CompletedAt);
        Assert.Equal(2, outings);
    }

    [Fact]
    public void A_run_keeps_the_version_the_setup_file_held_when_it_started()
    {
        string path = this.WriteSetup("Race v3", 30, "-1.0 deg", Start.AddDays(-1));
        SetupLibrary library = this.Library();
        string id = Assert.Single(library.List()).Id;
        RunSetup before = Assert.IsType<RunSetup>(library.VersionAt(id, Start));

        File.WriteAllText(path, Svm(28, "-1.2 deg"));
        File.SetLastWriteTimeUtc(path, Start.AddHours(2).UtcDateTime);

        Assert.Equal("Race v3", before.Name);
        Assert.Equal(before, library.VersionAt(id, Start.AddHours(1)));
        Assert.NotEqual(before.SnapshotId, library.VersionAt(id, Start.AddHours(3))?.SnapshotId);
        // A run older than every version Sprint kept gets the oldest one.
        Assert.Equal(before, library.VersionAt(id, Start.AddDays(-30)));
        Assert.Null(library.VersionAt("file-missing", Start));
    }

    [Fact]
    public void A_setup_put_on_a_run_shows_on_that_run_and_in_how_the_setup_drove()
    {
        this.WriteSetup("Race v3", 30, "-1.0 deg", Start.AddDays(-1));
        SetupLibrary library = this.Library();
        string id = Assert.Single(library.List()).Id;
        LocalLapHistoryStore history = new(Path.Combine(this._root, "lap-history"));
        history.Save(new LapHistorySession
        {
            Id = "hs-1",
            Kind = HistorySessionKind.Practice,
            StartedAt = Start,
            Context = new LapHistoryContext { Game = "Le Mans Ultimate", TrackCourse = "Spa-Francorchamps", CarModel = "Porsche 963" },
            Laps =
            [
                Lap(1, 1, 126.0, 3.2, "Medium", "Medium"),
                Lap(2, 1, 125.4, 3.1, "Medium", "Medium"),
                Lap(3, 1, 125.9, 3.0, "Medium", "Medium"),
                Lap(4, 2, 125.2, 3.1, "Soft", "Medium"),
            ],
        });
        RunSetups runSetups = new(Path.Combine(this._root, "run-setups.json"));
        AnalysisController analysis = new(new LapCorpusBrowser(history, new LocalLapTraceStore(Path.Combine(this._root, "lap-traces"))), runSetups, library);
        analysis.SelectSession(Assert.Single(analysis.Filter.Sessions));

        Assert.True(analysis.SetRunSetup(1, id, out string error), error);

        Assert.Equal(["Race v3", null], analysis.State().Runs.Select(run => run.Setup?.Name));
        Assert.Equal([1, 2], analysis.State().Runs.Select(run => run.Number));
        string version = Assert.IsType<RunSetup>(analysis.State().Runs[0].Setup).SnapshotId;
        SetupDriven driven = Assert.Single(SetupDriving.Summarize([version], history.LoadAll(), new RunSetups(Path.Combine(this._root, "run-setups.json")).All()));
        Assert.Equal((3, 1, 125.4, 125.9, 3.1), (driven.Laps, driven.Sessions, driven.BestLapSeconds, driven.MedianLapSeconds, driven.FuelPerLapLiters));
        Assert.Equal([new TyreChoice("Medium", "Medium", 3)], driven.Tyres);

        // Taking it off again, and refusing what the page could never send.
        Assert.True(analysis.SetRunSetup(1, null, out error), error);
        Assert.All(analysis.State().Runs, run => Assert.Null(run.Setup));
        Assert.False(analysis.SetRunSetup(9, id, out _));
        Assert.False(analysis.SetRunSetup(1, "file-missing", out _));
    }

    private static LapHistoryRecord Lap(int number, int outing, double seconds, double fuel, string front, string rear) => new()
    {
        LapNumber = number,
        Outing = outing,
        LapTimeSeconds = seconds,
        FuelUsedLiters = fuel,
        CompletedAt = Start.AddSeconds(number * 130),
        Tires =
        [
            new LapHistoryTire { Position = "FrontLeft", Compound = front },
            new LapHistoryTire { Position = "FrontRight", Compound = front },
            new LapHistoryTire { Position = "RearLeft", Compound = rear },
            new LapHistoryTire { Position = "RearRight", Compound = rear },
        ],
    };

    private static TelemetryFrame Frame(int lap, double lastLapTime, double seconds) => new()
    {
        Timestamp = Start.AddSeconds(seconds),
        Session = new SessionInfo
        {
            Game = "Le Mans Ultimate",
            Track = "Spa-Francorchamps",
            Car = "Porsche 963",
            SessionType = SessionType.Practice,
            InCar = true,
        },
        Car = new CarState { SpeedMetersPerSecond = 60f },
        Lap = new LapState { CurrentLap = lap, LastLapTime = lastLapTime },
    };

    private static string Svm(int frontCamber, string camber) => $"""
        VehicleClassSetting="Hypercar Porsche_963 WEC2024"

        [FRONTLEFT]
        CamberSetting={frontCamber}//{camber}
        """;

    private SetupLibrary Library() =>
        new(new SetupGame(new LmuSetupRepository(Path.Combine(this._root, "game"))), new LocalSetupSnapshotStore(Path.Combine(this._root, "versions")));

    private string WriteSetup(string name, int camber, string reads, DateTimeOffset savedAt)
    {
        string directory = Path.Combine(this._root, "game", "Spa");
        Directory.CreateDirectory(directory);
        string path = Path.Combine(directory, name + ".svm");
        File.WriteAllText(path, Svm(camber, reads));
        File.SetLastWriteTimeUtc(path, savedAt.UtcDateTime);
        return path;
    }

    /// <summary>A game that stores setups and nothing else.</summary>
    private sealed class SetupGame(ISetupRepository setups) : IGameProvider
    {
        public GameDescriptor Descriptor { get; } = new(Id: "lemansultimate", Name: "Le Mans Ultimate", Transport: "shared-memory", Available: false);

        public IResultsImporter? Results => null;

        public ISetupRepository? Setups { get; } = setups;

        public IScheduleSource? Schedule => null;

        public ITelemetrySource CreateTelemetrySource() => throw new NotSupportedException();
    }
}

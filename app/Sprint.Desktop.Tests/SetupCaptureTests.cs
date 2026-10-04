using Sprint.Desktop.Api.Games;
using Sprint.Desktop.Api.Telemetry;
using Sprint.Desktop.Features.SessionPlanning;
using Sprint.Desktop.Features.Setup;
using Sprint.Games;
using Sprint.Games.LeMansUltimate.Setups;
using Xunit;

namespace Sprint.Desktop.Tests;

/// <summary>
/// Setup capture, vault snapshots and session association (#188). Everything here runs
/// against fixtures in a temp folder: the game's own directory is never read and never
/// written, and no watcher is ever pointed at a real install.
/// </summary>
public sealed class SetupCaptureTests : IDisposable
{
    private readonly string _root;

    public SetupCaptureTests()
    {
        _root = Path.Combine(Path.GetTempPath(), "sprint-setup-capture-" + Guid.NewGuid().ToString("N"));
        Directory.CreateDirectory(_root);
    }

    public void Dispose()
    {
        try
        {
            Directory.Delete(_root, recursive: true);
        }
        catch (IOException)
        {
            // Best-effort temp cleanup; a locked file must not fail the test run.
        }
    }

    /// <summary>
    /// A setup shaped like the ones Le Mans Ultimate writes: a commented vehicle path, the
    /// class header outside any section, <c>//</c> comments between values, and index values
    /// under <c>[SECTION]</c> headers.
    /// </summary>
    private const string Porsche963Svm = """
        //VEH=C:\Steam\steamapps\common\Le Mans Ultimate\Installed\Vehicles\Porsche_963_2023\1.43\Porsche_963_2023.VEH
        VehicleClassSetting="Hypercar Porsche_963 WEC2025"

        [GENERAL]
        // fuel is an index into the vehicle's own fuel steps, not litres
        FuelSetting=63
        NumPitstopsSetting=2
        Notes="Le Mans qualifying trim"

        [LEFTFENDER]
        FenderFlareSetting=1

        [CONTROLS]
        BrakeBiasSetting=34
        """;

    /// <summary>The same fixture saved for another car, or with brake bias on another click.</summary>
    private static string Svm(string vehicleClass, int brakeBiasSetting) => Porsche963Svm
        .Replace("Hypercar Porsche_963 WEC2025", vehicleClass, StringComparison.Ordinal)
        .Replace("BrakeBiasSetting=34", $"BrakeBiasSetting={brakeBiasSetting}", StringComparison.Ordinal);

    private string WriteSetup(string track, string name, string content, DateTime lastWriteUtc)
    {
        var directory = Path.Combine(_root, track);
        Directory.CreateDirectory(directory);
        var path = Path.Combine(directory, name + ".svm");
        File.WriteAllText(path, content);
        File.SetLastWriteTimeUtc(path, lastWriteUtc);
        return path;
    }

    /// <summary>
    /// A game that stores setups and nothing else, so capture is exercised exactly as the
    /// client reaches it: through the provider's optional setup capability.
    /// </summary>
    private sealed class SetupOnlyGameProvider(ISetupRepository? setups) : IGameProvider
    {
        public GameDescriptor Descriptor { get; } = new(
            Id: "lemansultimate",
            Name: "Le Mans Ultimate",
            Transport: "shared-memory",
            Available: false);

        public IResultsImporter? Results => null;

        public ISetupRepository? Setups { get; } = setups;

        public IScheduleSource? Schedule => null;

        public ITelemetrySource CreateTelemetrySource() => throw new NotSupportedException();
    }

    [Fact]
    public void Reads_a_setup_into_sections_values_and_the_vehicle_header()
    {
        WriteSetup("Le Mans", "Quali", Porsche963Svm, new DateTime(2026, 7, 30, 9, 0, 0, DateTimeKind.Utc));
        var repository = new LmuSetupRepository(_root);

        var info = Assert.Single(repository.ListSetups());
        var snapshot = repository.Read(info);

        Assert.Equal("Quali", info.Name);
        Assert.Equal("Le Mans", info.Track);
        Assert.NotNull(snapshot);

        // The class header is what a car match is made on, so it is lifted out of the values —
        // unquoted, because the quotes are the file's syntax. It stays in the values as well,
        // exactly as written, so a diff of two versions still sees a car swap.
        Assert.Equal("Hypercar Porsche_963 WEC2025", snapshot.VehicleDescriptor);
        Assert.Equal("", snapshot.Values[0].Section);
        Assert.Equal("VehicleClassSetting", snapshot.Values[0].Key);
        Assert.Equal("\"Hypercar Porsche_963 WEC2025\"", snapshot.Values[0].RawValue);

        // Values keep the file's own sections, keys and raw indices, in file order, and the
        // `//` comment lines are not values.
        Assert.Equal(
            new[]
            {
                ("GENERAL", "FuelSetting", "63"),
                ("GENERAL", "NumPitstopsSetting", "2"),
                ("GENERAL", "Notes", "\"Le Mans qualifying trim\""),
                ("LEFTFENDER", "FenderFlareSetting", "1"),
                ("CONTROLS", "BrakeBiasSetting", "34"),
            },
            snapshot.Values
                .Where(value => value.Section.Length > 0)
                .Select(value => (value.Section, value.Key, value.RawValue)));
    }

    [Fact]
    public void Saving_the_same_setup_twice_captures_one_snapshot()
    {
        var path = WriteSetup("Le Mans", "Quali", Porsche963Svm, new DateTime(2026, 7, 30, 9, 0, 0, DateTimeKind.Utc));
        var game = new SetupOnlyGameProvider(new LmuSetupRepository(_root));
        var store = new LocalSetupSnapshotStore(Path.Combine(_root, "vault"));
        var capture = new SetupCaptureService(store);

        var first = capture.Capture(game);

        // The driver saves again from the sim without changing anything: a new file on disk
        // with a new timestamp, but the same setup.
        File.WriteAllText(path, Porsche963Svm);
        File.SetLastWriteTimeUtc(path, new DateTime(2026, 7, 30, 9, 5, 0, DateTimeKind.Utc));
        var second = capture.Capture(game);

        Assert.Single(first);
        Assert.Empty(second);
        var snapshot = Assert.Single(store.LoadAll());
        Assert.Equal("Quali", snapshot.Name);
        Assert.Equal("Hypercar Porsche_963 WEC2025", snapshot.VehicleDescriptor);
    }

    [Fact]
    public void Editing_a_setup_captures_a_second_version_that_can_be_diffed()
    {
        var path = WriteSetup("Le Mans", "Quali", Porsche963Svm, new DateTime(2026, 7, 30, 9, 0, 0, DateTimeKind.Utc));
        var game = new SetupOnlyGameProvider(new LmuSetupRepository(_root));
        var store = new LocalSetupSnapshotStore(Path.Combine(_root, "vault"));
        var capture = new SetupCaptureService(store);
        capture.Capture(game);

        // One click of brake bias: the same setup, a different version of it.
        File.WriteAllText(path, Porsche963Svm.Replace("BrakeBiasSetting=34", "BrakeBiasSetting=36", StringComparison.Ordinal));
        File.SetLastWriteTimeUtc(path, new DateTime(2026, 7, 30, 9, 5, 0, DateTimeKind.Utc));

        var edited = Assert.Single(capture.Capture(game));

        var stored = store.LoadAll();
        Assert.Equal(2, stored.Count);
        Assert.Equal("36", edited.Value("BrakeBiasSetting"));

        var original = Assert.Single(stored, snapshot => snapshot.Id != edited.Id);
        Assert.Equal("34", original.Value("BrakeBiasSetting"));

        // Both versions keep the whole file, so the diff between them is exactly the one
        // value the driver changed.
        var differences = original.Values
            .Zip(edited.Values, (before, after) => (before.Key, before.RawValue, after.RawValue))
            .Where(pair => pair.Item2 != pair.Item3)
            .ToList();
        Assert.Equal([("BrakeBiasSetting", "34", "36")], differences);
    }

    [Fact]
    public void A_captured_version_enters_the_vault_only_when_the_user_promotes_it()
    {
        var path = WriteSetup("Le Mans", "Quali", Porsche963Svm, new DateTime(2026, 7, 30, 9, 0, 0, DateTimeKind.Utc));
        var game = new SetupOnlyGameProvider(new LmuSetupRepository(_root));
        var store = new LocalSetupSnapshotStore(Path.Combine(_root, "vault"));
        var promotedAt = new DateTimeOffset(2026, 7, 30, 10, 0, 0, TimeSpan.Zero);
        var capture = new SetupCaptureService(store, clock: () => promotedAt);

        var captured = Assert.Single(capture.Capture(game));
        Assert.False(captured.IsInVault);

        var promoted = capture.Promote(captured.Id);

        Assert.NotNull(promoted);
        Assert.Equal(promotedAt, promoted.PromotedAt);
        Assert.True(Assert.Single(store.LoadAll(), snapshot => snapshot.Id == captured.Id).IsInVault);

        // A later capture pass records the new version and promotes nothing: the vault is a
        // curated set, so every entry in it was put there on purpose.
        File.WriteAllText(path, Porsche963Svm.Replace("FuelSetting=63", "FuelSetting=40", StringComparison.Ordinal));
        var edited = Assert.Single(capture.Capture(game));
        Assert.False(edited.IsInVault);
        Assert.Single(store.LoadAll(), snapshot => snapshot.IsInVault);
    }

    /// <summary>
    /// A folder of setups the driver could plausibly have used, and several they could not:
    /// the right car at another track, and another car at this one.
    /// </summary>
    private ISetupSnapshotStore CapturedFolder()
    {
        var day = new DateTime(2026, 7, 30, 0, 0, 0, DateTimeKind.Utc);
        WriteSetup("Le Mans", "Quali", Svm("Hypercar Porsche_963 WEC2025", 34), day.AddHours(9));
        WriteSetup("Le Mans", "Race", Svm("Hypercar Porsche_963 WEC2025", 31), day.AddHours(11));
        WriteSetup("Le Mans", "Ferrari Race", Svm("Hypercar Ferrari_499P WEC2025", 30), day.AddHours(12));
        WriteSetup("Monza", "Race", Svm("Hypercar Porsche_963 WEC2025", 29), day.AddHours(13));

        var store = new LocalSetupSnapshotStore(Path.Combine(_root, "vault"));
        new SetupCaptureService(store).Capture(new SetupOnlyGameProvider(new LmuSetupRepository(_root)));
        return store;
    }

    private static LapHistorySession Session(string track, string car) => new()
    {
        Id = "session-1",
        StartedAt = new DateTimeOffset(2026, 7, 30, 11, 30, 0, TimeSpan.Zero),
        Context = new LapHistoryContext { Game = "lemansultimate", TrackCourse = track, CarModel = car },
        Laps = [new LapHistoryRecord { LapNumber = 1, LapTimeSeconds = 210.5 }],
    };

    [Fact]
    public void Proposes_the_most_recently_saved_setup_for_the_car_and_track_driven()
    {
        var association = new SetupAssociationService(CapturedFolder(), new InMemoryLapHistoryStore());

        var proposal = association.Propose(Session("Le Mans", "Porsche 963"));

        // "Ferrari Race" and the Monza setup were saved later, but neither is a setup this
        // session could have been driven with.
        Assert.NotNull(proposal.Candidate);
        Assert.Equal("Race", proposal.Candidate.Name);
        Assert.Equal("Le Mans", proposal.Candidate.Track);
        Assert.Equal("31", proposal.Candidate.Value("BrakeBiasSetting"));
        Assert.False(proposal.IsUnknown);
    }

    [Theory]
    // A car this driver has never saved a setup for, at a track they have.
    [InlineData("Le Mans", "Cadillac V-Series.R")]
    // The car they always drive, at a track they have never saved a setup for.
    [InlineData("Spa-Francorchamps", "Porsche 963")]
    public void Reports_an_unidentified_setup_as_unknown_instead_of_the_nearest_one(string track, string car)
    {
        var association = new SetupAssociationService(CapturedFolder(), new InMemoryLapHistoryStore());

        var proposal = association.Propose(Session(track, car));

        Assert.True(proposal.IsUnknown);
        Assert.Null(proposal.Candidate);
        Assert.Equal(SetupAssociation.Unknown, proposal.Reference);
    }

    [Fact]
    public void Carries_the_observed_and_the_stated_brake_bias_for_the_driver_to_check()
    {
        var association = new SetupAssociationService(CapturedFolder(), new InMemoryLapHistoryStore());

        var proposal = association.Propose(Session("Le Mans", "Porsche 963"), observedBrakeBiasRear: 0.462);

        // The file states a click, telemetry states a fraction, and Sprint has no vehicle data
        // to convert between them: both are carried verbatim for the driver to judge, and
        // neither is turned into the other.
        Assert.Equal(0.462, proposal.ObservedBrakeBiasRear);
        Assert.Equal("31", proposal.CandidateBrakeBiasSetting);
    }

    [Fact]
    public void Confirming_the_proposal_records_it_on_the_session_and_its_lap_records()
    {
        var history = new InMemoryLapHistoryStore();
        var association = new SetupAssociationService(CapturedFolder(), history);
        var session = Session("Le Mans", "Porsche 963");
        var segment = new PlanSegment
        {
            Id = "segment-1",
            Kind = SegmentKind.Race,
            Laps = [new LapSummary { LapNumber = 1, LapTimeSeconds = 210.5 }],
        };

        var proposal = association.Propose(session);
        association.Confirm(session, proposal.Reference, segment);

        var stored = Assert.Single(history.LoadAll());
        Assert.Equal(proposal.Candidate?.Id, stored.SetupReference);
        Assert.Equal(proposal.Candidate?.Id, Assert.Single(segment.Laps).SetupReference);
        Assert.False(SetupAssociation.IsUnknown(stored.SetupReference));
    }

    [Fact]
    public void Confirming_an_unidentified_setup_records_unknown_rather_than_nothing()
    {
        var history = new InMemoryLapHistoryStore();
        var association = new SetupAssociationService(CapturedFolder(), history);
        var session = Session("Spa-Francorchamps", "Porsche 963");

        association.Confirm(session, association.Propose(session).Reference);

        // Marked, not left blank: an unanswered session can be asked about again, while this
        // one has been answered and must never turn into a guess.
        var stored = Assert.Single(history.LoadAll());
        Assert.Equal(SetupAssociation.Unknown, stored.SetupReference);
        Assert.True(SetupAssociation.IsUnknown(stored.SetupReference));
    }

    [Fact]
    public void Le_mans_ultimate_exposes_its_setups_as_a_provider_capability()
    {
        var provider = GameProviders.Find("lemansultimate");
        Assert.NotNull(provider);

        var setups = provider.Setups;

        // The sim always stores setups, so the capability exists wherever the default library
        // does; whether this machine has saved any yet is ListSetups' answer, not a reason to
        // hide the capability. Nothing here reads that folder.
        var defaultPath = LmuSetupRepository.DefaultSetupsPath();
        Assert.Equal(defaultPath.Length == 0, setups is null);
        if (setups is null)
        {
            return;
        }

        Assert.Equal(defaultPath, setups.WatchRoot);
        Assert.EndsWith(LmuSetupRepository.SetupsSubPath, setups.WatchRoot);
        Assert.Same(setups, provider.Setups); // resolved once, not per read
    }

    /// <summary>A corpus that keeps what it is given, so a confirmation can be read back.</summary>
    private sealed class InMemoryLapHistoryStore : ILapHistoryStore
    {
        private readonly Dictionary<string, LapHistorySession> _sessions = [];

        public IReadOnlyList<LapHistorySession> LoadAll() => [.. _sessions.Values];

        public void Save(LapHistorySession session) => _sessions[session.Id] = session;

        public void Delete(string sessionId) => _sessions.Remove(sessionId);
    }
}

using Sprint.Desktop.Api.Games;
using Sprint.Desktop.Api.Telemetry;
using Sprint.Desktop.Features.SessionPlanning;
using Sprint.Games;
using Sprint.Games.LeMansUltimate;
using Sprint.Games.LeMansUltimate.Results;
using Xunit;

namespace Sprint.Desktop.Tests;

/// <summary>
/// Importing Le Mans Ultimate's own results archive into the lap-history corpus (#182). The
/// archive is an <em>import</em> path only: everything a reader sees afterwards is a Sprint
/// record, and the two mappings that decide whether imported and recorded laps land in the
/// same bucket (course, not venue; car type, not class) are pinned here.
/// </summary>
public sealed class LmuResultsImportTests : IDisposable
{
    private readonly string _dir;

    public LmuResultsImportTests()
    {
        _dir = Path.Combine(Path.GetTempPath(), "sprint-lmu-import-" + Guid.NewGuid().ToString("N"));
        Directory.CreateDirectory(_dir);
    }

    public void Dispose()
    {
        try
        {
            Directory.Delete(_dir, recursive: true);
        }
        catch (IOException)
        {
            // Best-effort temp cleanup; a locked file must not fail the test run.
        }
    }

    // A trimmed but structurally faithful race result, shaped like the files the sim writes
    // (see LmuResultsParserTests). The venue and the course differ on purpose — Le Mans is
    // exactly the case where importing the venue would split the bucket. Lap 1 is an out lap
    // with the sim's "--.----" no-time placeholder and no sectors; a second, non-player
    // driver is present because only the local player's laps are the driver's own history.
    private const string RaceXml = """
        <?xml version="1.0" encoding="utf-8"?>
        <rFactorXML>
          <RaceResults>
            <TrackVenue>Le Mans</TrackVenue>
            <TrackCourse>Circuit des 24 Heures</TrackCourse>
            <TrackLength>13626.0</TrackLength>
            <RaceLaps>0</RaceLaps>
            <RaceTime>60</RaceTime>
            <DateTime>1782240911</DateTime>
            <TimeString>2026/06/23 20:55:11</TimeString>
            <GameVersion>1.3000</GameVersion>
            <Race>
              <Driver>
                <Name>Alpha Tester</Name>
                <VehName>Test 499P #1</VehName>
                <Category>WEC 2025, Hypercar, Ferrari 499P</Category>
                <CarType>Ferrari 499P</CarType>
                <CarClass>Hyper</CarClass>
                <CarNumber>1</CarNumber>
                <TeamName>Sample Team Purple</TeamName>
                <isPlayer>1</isPlayer>
                <Lap num="1" p="2" et="--.---" topspeed="210.81" fcompound="0,Medium" rcompound="0,Medium">--.----</Lap>
                <Lap num="2" p="2" et="240.5801" s1="40.7216" s2="28.8316" s3="38.5551" topspeed="287.83" fcompound="0,Medium" rcompound="0,Medium">108.1083</Lap>
                <Lap num="3" p="2" et="348.7000" s1="40.8718" s2="28.7522" s3="38.4118" topspeed="290.98" fcompound="0,Soft" rcompound="0,Soft">107.6273</Lap>
                <BestLapTime>107.6273</BestLapTime>
                <Laps>3</Laps>
                <Pitstops>1</Pitstops>
                <FinishStatus>Finished Normally</FinishStatus>
              </Driver>
              <Driver>
                <Name>Bravo Tester</Name>
                <CarType>Porsche 963</CarType>
                <CarClass>Hyper</CarClass>
                <isPlayer>0</isPlayer>
                <Lap num="1" p="3" et="126.9" s1="49.0" s2="30.0" s3="41.0" topspeed="280.0">120.0</Lap>
                <Laps>1</Laps>
              </Driver>
            </Race>
          </RaceResults>
        </rFactorXML>
        """;

    // The sim names the session element after the session itself (Practice1, Qualify, Race, ...).
    private static string SessionXml(string sessionElement) => $"""
        <rFactorXML><RaceResults>
          <TrackVenue>Le Mans</TrackVenue>
          <TrackCourse>Circuit des 24 Heures</TrackCourse>
          <DateTime>1782240911</DateTime>
          <{sessionElement}><Driver>
            <Name>Alpha Tester</Name><CarType>Ferrari 499P</CarType><CarClass>Hyper</CarClass>
            <isPlayer>1</isPlayer>
            <Lap num="1" p="1" et="106.0" s1="40.0" s2="28.0" s3="38.0" topspeed="280.0">106.0</Lap>
          </Driver></{sessionElement}>
        </RaceResults></rFactorXML>
        """;

    private string WriteResult(string name, string xml)
    {
        var path = Path.Combine(_dir, name);
        File.WriteAllText(path, xml);
        return path;
    }

    private ImportedSession ReadSingle(string xml)
    {
        WriteResult("result.xml", xml);
        var importer = new LmuResultsImporter(_dir);
        var entry = Assert.Single(importer.ListEntries());
        var session = importer.Read(entry);

        Assert.NotNull(session);
        return session;
    }

    [Fact]
    public void Buckets_an_imported_session_by_the_course_never_the_venue()
    {
        var session = ReadSingle(RaceXml);

        // Live telemetry reports the layout being driven, so the archive's course is the only
        // field the two history writers can agree on.
        Assert.Equal("Circuit des 24 Heures", session.TrackCourse);
        Assert.DoesNotContain("Le Mans", session.TrackCourse);
    }

    [Fact]
    public void Keys_on_the_car_model_and_keeps_the_class_as_metadata()
    {
        var session = ReadSingle(RaceXml);

        // "Hyper" is a whole field of cars; live telemetry reports the model, so the model is
        // the key and the class rides along for a future "same class" fallback.
        Assert.Equal("Ferrari 499P", session.CarModel);
        Assert.Equal("Hyper", session.CarClass);

        // The archive scores the whole field; only the local player's entry is this driver's
        // own history.
        Assert.Equal("Alpha Tester", session.PlayerName);

        // The cross-check against the recorder's live lap distance.
        Assert.Equal(13626.0, session.TrackLengthMeters);
    }

    [Theory]
    [InlineData("Practice1", ImportedSessionKind.Practice)]
    [InlineData("Qualify", ImportedSessionKind.Qualifying)]
    [InlineData("Warmup", ImportedSessionKind.Warmup)]
    [InlineData("Race", ImportedSessionKind.Race)]
    [InlineData("TestDay", ImportedSessionKind.TestDay)]
    [InlineData("SomethingNew", ImportedSessionKind.Unknown)]
    public void Maps_every_session_kind_the_sim_writes(string sessionElement, ImportedSessionKind expected)
    {
        var session = ReadSingle(SessionXml(sessionElement));

        Assert.Equal(expected, session.Kind);
    }

    [Fact]
    public void Carries_the_players_laps_with_times_sectors_speed_and_compounds()
    {
        var session = ReadSingle(RaceXml);

        // Three laps: the player's. The other driver's lap belongs to somebody else's history.
        Assert.Equal(3, session.Laps.Count);

        var outLap = session.Laps[0];
        Assert.Equal(1, outLap.LapNumber);
        Assert.Null(outLap.LapTimeSeconds); // "--.----" is untimed, not a zero-second lap
        Assert.Empty(outLap.SectorsSeconds);
        Assert.Equal(210.81, outLap.TopSpeedKph); // the sim still records speed on an out lap
        Assert.Equal("Medium", outLap.FrontCompound);
        Assert.Equal("Medium", outLap.RearCompound);

        var fastest = session.Laps[2];
        Assert.Equal(3, fastest.LapNumber);
        Assert.Equal(107.6273, fastest.LapTimeSeconds);
        Assert.Equal(new[] { 40.8718, 28.7522, 38.4118 }, fastest.SectorsSeconds);
        Assert.Equal(290.98, fastest.TopSpeedKph);
        Assert.Equal("Soft", fastest.FrontCompound);
        Assert.Equal("Soft", fastest.RearCompound);
    }

    [Fact]
    public void Keeps_sectors_positional_when_the_archive_states_only_some()
    {
        var session = ReadSingle("""
            <rFactorXML><RaceResults>
              <TrackCourse>Circuit des 24 Heures</TrackCourse>
              <Race><Driver>
                <Name>Alpha Tester</Name><CarType>Ferrari 499P</CarType><isPlayer>1</isPlayer>
                <Lap num="1" s1="40.0" s3="38.0">106.0</Lap>
              </Driver></Race>
            </RaceResults></rFactorXML>
            """);

        // Index i is sector i+1, so a stated third sector after an omitted second is dropped
        // rather than reported as the second — a reader adding these up must not get a total
        // that never happened.
        var lap = Assert.Single(session.Laps);
        Assert.Equal(new[] { 40.0 }, lap.SectorsSeconds);
    }

    [Fact]
    public void Lists_entries_newest_first_with_the_keys_a_ledger_scan_needs()
    {
        var older = WriteResult("2026_06_20-race.xml", RaceXml);
        var newer = WriteResult("2026_06_22-quali.xml", SessionXml("Qualify"));
        File.SetLastWriteTimeUtc(older, new DateTime(2026, 6, 20, 12, 0, 0, DateTimeKind.Utc));
        File.SetLastWriteTimeUtc(newer, new DateTime(2026, 6, 22, 12, 0, 0, DateTimeKind.Utc));

        var entries = new LmuResultsImporter(_dir).ListEntries();

        Assert.Equal(2, entries.Count);
        Assert.Equal(newer, entries[0].Id); // newest first
        Assert.Equal(older, entries[1].Id);

        // Size and last-write are what lets a startup scan (#185) decide there is nothing new
        // without parsing a single file.
        Assert.Equal(new DateTimeOffset(2026, 6, 22, 12, 0, 0, TimeSpan.Zero), entries[0].LastWriteUtc);
        Assert.Equal(new FileInfo(newer).Length, entries[0].SizeBytes);
    }

    [Fact]
    public void An_archive_that_was_never_written_is_empty_and_says_where_it_looked()
    {
        var importer = new LmuResultsImporter(Path.Combine(_dir, "never-run"));

        // A game that has never been run is not an error, and an empty result has to be able
        // to say what was scanned.
        Assert.Empty(importer.ListEntries());
        Assert.Contains("never-run", importer.SourceDescription);
    }

    [Fact]
    public void Reads_nothing_from_an_entry_it_cannot_parse_or_bucket()
    {
        // A file the sim left half-written must not abort the rest of a batch import.
        WriteResult("broken.xml", "<rFactorXML><RaceResults>");
        Assert.Null(new LmuResultsImporter(_dir).Read(Single(_dir)));
        File.Delete(Path.Combine(_dir, "broken.xml"));

        // Nothing marks the local player, so there is no driver whose history this is.
        WriteResult("spectated.xml", """
            <rFactorXML><RaceResults><TrackCourse>Circuit des 24 Heures</TrackCourse>
              <Race><Driver><Name>Bravo</Name><CarType>Porsche 963</CarType><isPlayer>0</isPlayer>
                <Lap num="1">106.0</Lap></Driver></Race>
            </RaceResults></rFactorXML>
            """);
        Assert.Null(new LmuResultsImporter(_dir).Read(Single(_dir)));
        File.Delete(Path.Combine(_dir, "spectated.xml"));

        // A venue is not a course, and substituting one would file these laps in a bucket the
        // recorder can never write to. No course means no bucket.
        WriteResult("venue-only.xml", """
            <rFactorXML><RaceResults><TrackVenue>Le Mans</TrackVenue>
              <Race><Driver><Name>Alpha</Name><CarType>Ferrari 499P</CarType><isPlayer>1</isPlayer>
                <Lap num="1">106.0</Lap></Driver></Race>
            </RaceResults></rFactorXML>
            """);
        Assert.Null(new LmuResultsImporter(_dir).Read(Single(_dir)));
        File.Delete(Path.Combine(_dir, "venue-only.xml"));

        // Likewise no car model: the bucket key is game + course + model, and a guessed bucket
        // silently corrupts every statistic drawn from it.
        WriteResult("carless.xml", """
            <rFactorXML><RaceResults><TrackCourse>Circuit des 24 Heures</TrackCourse>
              <Race><Driver><Name>Alpha</Name><isPlayer>1</isPlayer>
                <Lap num="1">106.0</Lap></Driver></Race>
            </RaceResults></rFactorXML>
            """);
        Assert.Null(new LmuResultsImporter(_dir).Read(Single(_dir)));
    }

    private static ResultsArchiveEntry Single(string directory) =>
        Assert.Single(new LmuResultsImporter(directory).ListEntries());

    private LapHistorySession ImportSingle(string xml)
    {
        WriteResult("result.xml", xml);
        var store = new RecordingLapHistoryStore();
        new LapHistoryImportService(store).Import(new LmuResultsImporter(_dir));

        return Assert.Single(store.LoadAll());
    }

    [Fact]
    public void Writes_an_archived_session_into_the_corpus_as_sprint_records()
    {
        WriteResult("race.xml", RaceXml);
        var store = new RecordingLapHistoryStore();

        var report = new LapHistoryImportService(store).Import(new LmuResultsImporter(_dir));

        var session = Assert.Single(store.LoadAll());
        Assert.Equal(LapHistoryOrigin.Imported, session.Origin);
        Assert.Equal(HistorySessionKind.Race, session.Kind);
        Assert.Equal("LeMansUltimate", session.Context.Game);
        Assert.Equal("Circuit des 24 Heures", session.Context.TrackCourse);
        Assert.Equal("Ferrari 499P", session.Context.CarModel);
        Assert.Equal("Hyper", session.Context.CarClass);
        Assert.Equal(13626.0, session.Context.TrackLengthMeters);
        Assert.Equal(DateTimeOffset.FromUnixTimeSeconds(1782240911), session.StartedAt);

        // Only the two timed laps: a history record has no way to say "no time", and filing an
        // out lap as a zero-second lap would poison every median drawn from the bucket.
        Assert.Equal(new[] { 108.1083, 107.6273 }, session.Laps.Select(lap => lap.LapTimeSeconds));
        Assert.Equal(new[] { 2, 3 }, session.Laps.Select(lap => lap.LapNumber));
        Assert.Equal(new[] { 40.8718, 28.7522, 38.4118 }, session.Laps[1].SectorsSeconds);

        Assert.Equal(1, report.ImportedCount);
    }

    [Fact]
    public void Carries_top_speed_all_the_way_into_the_corpus()
    {
        // The archive states it, so the corpus must keep it: stopping at the importer would
        // mean re-parsing XML later to answer a question the import already had in hand.
        var laps = ImportSingle(RaceXml).Laps;

        // The out lap is untimed and therefore never written; lap 3 is the fastest.
        Assert.Equal(290.98, laps[^1].TopSpeedKph);
    }

    [Fact]
    public void Leaves_what_the_archive_never_stated_absent_rather_than_zero()
    {
        var session = ImportSingle(RaceXml);

        // The results XML carries no fuel, no virtual energy, no weather, no grip and no
        // multipliers, and never will. A reader has to be able to tell "unknown" from "dry" or
        // "used nothing".
        Assert.Null(session.Conditions.PathWetness);
        Assert.Null(session.Conditions.TrackGripLevel);
        Assert.Null(session.Conditions.FuelMultiplier);
        Assert.Null(session.Conditions.TireMultiplier);
        Assert.Null(session.Conditions.FixedSetup);
        Assert.Null(session.SetupReference);

        // The archive states when a session ran, never when it stopped.
        Assert.Null(session.EndedAt);

        Assert.All(session.Laps, lap =>
        {
            Assert.Null(lap.FuelUsedLiters);
            Assert.Null(lap.FuelRemainingLiters);
            Assert.Null(lap.VirtualEnergyUsed);
            Assert.Null(lap.VirtualEnergyRemaining);

            // There is no position trace in the archive, so an imported lap degrades to a
            // scalar target and must say so rather than offering an empty curve.
            Assert.Null(lap.ReferenceCurve);
            Assert.False(lap.HasReferenceCurve);

            Assert.Null(lap.ProgramType);
            Assert.Null(lap.ProgramId);
            Assert.Null(lap.RunId);

            // The archive invalidates nothing, so a lap it gave a time to is a lap that counted.
            Assert.True(lap.IsValid);
        });
    }

    [Fact]
    public void Carries_the_stated_compounds_without_inventing_wear_or_temperature()
    {
        var lap = ImportSingle(RaceXml).Laps[1]; // lap 3, run on softs

        // The archive states one compound per axle, so both corners of an axle carry it and
        // nothing else about the corner is claimed.
        Assert.Equal(
            new[] { "FrontLeft", "FrontRight", "RearLeft", "RearRight" },
            lap.Tires.Select(tire => tire.Position));
        Assert.Equal(new[] { "Soft", "Soft", "Soft", "Soft" }, lap.Tires.Select(tire => tire.Compound));
        Assert.All(lap.Tires, tire =>
        {
            Assert.Null(tire.WearPercent);
            Assert.Null(tire.TempAverageCelsius);
            Assert.Null(tire.PressureKPa);
        });

        // A file that states no compound gets no corners, rather than four empty ones on disk.
        Assert.Empty(Assert.Single(ImportSingle(SessionXml("Race")).Laps).Tires);
    }

    [Fact]
    public void Re_importing_the_same_session_writes_nothing_a_second_time()
    {
        WriteResult("race.xml", RaceXml);
        var store = new RecordingLapHistoryStore();
        var service = new LapHistoryImportService(store);

        var first = service.Import(new LmuResultsImporter(_dir));

        // The same session under a different file name, as a moved or restored results folder
        // produces. The key is the session itself, so this costs one re-parse and nothing else.
        WriteResult("race-restored.xml", RaceXml);
        var second = service.Import(new LmuResultsImporter(_dir));

        Assert.Single(store.LoadAll());
        Assert.Equal(1, store.Saves); // not even rewritten with an identical record
        Assert.Equal(1, first.ImportedCount);
        Assert.Equal(0, second.ImportedCount);
        Assert.Equal(2, second.AlreadyImportedCount);
    }

    [Fact]
    public void The_natural_key_a_scan_can_compute_is_the_id_the_import_writes()
    {
        WriteResult("race.xml", RaceXml);
        var importer = new LmuResultsImporter(_dir);
        var entry = Assert.Single(importer.ListEntries());
        var imported = importer.Read(entry);
        Assert.NotNull(imported);
        var store = new RecordingLapHistoryStore();

        new LapHistoryImportService(store).Import(importer);

        // Track, kind, session time (the archive's own, 18:55:11 UTC) and player, readable and
        // with no hash of anything on disk to keep in step.
        var session = Assert.Single(store.LoadAll());
        Assert.Equal(
            "imported-lemansultimate-circuit_des_24_heures-race-20260623T185511Z-alpha_tester",
            session.Id);

        // A scan (#185) decides what is new before importing anything; a key it derived
        // differently would make every scan import the same sessions again.
        Assert.Equal(session.Id, LapHistoryImportService.SessionId(imported, entry));
    }

    [Fact]
    public void Tells_sessions_apart_by_session_time_kind_and_player()
    {
        // Same track and car, so only the rest of the natural key can separate these. A key that
        // collapsed any of them would silently merge four sessions into one.
        WriteResult("race.xml", RaceXml);
        WriteResult("later.xml", RaceXml.Replace("1782240911", "1782244511"));
        WriteResult("practice.xml", RaceXml.Replace("<Race>", "<Practice1>").Replace("</Race>", "</Practice1>"));
        WriteResult("teammate.xml", RaceXml.Replace("Alpha Tester", "Charlie Tester"));
        var store = new RecordingLapHistoryStore();

        var report = new LapHistoryImportService(store).Import(new LmuResultsImporter(_dir));

        Assert.Equal(4, report.ImportedCount);
        Assert.Equal(4, store.LoadAll().Count);
        Assert.Equal(3, report.ImportedByKind[HistorySessionKind.Race]);
        Assert.Equal(1, report.ImportedByKind[HistorySessionKind.Practice]);
    }

    [Fact]
    public void The_game_provider_exposes_the_archive_as_its_results_capability()
    {
        var provider = GameProviders.Find("lemansultimate");
        Assert.NotNull(provider);

        var importer = provider.Results;

        // Le Mans Ultimate always archives results, so the capability exists wherever the
        // default library does; whether this machine has any files yet is ListEntries' answer,
        // not a reason to hide the capability.
        var defaultPath = LmuResultsReader.DefaultResultsPath();
        Assert.Equal(defaultPath.Length == 0, importer is null);
        if (importer is null)
        {
            return;
        }

        Assert.Equal(defaultPath, importer.SourceDescription);
        Assert.Same(importer, provider.Results); // resolved once, not per read
    }

    [Fact]
    public void Imported_laps_land_in_the_same_bucket_as_recorded_laps()
    {
        // The live context is taken from the game's own telemetry mapping rather than typed out,
        // because that is what the recorder writes. If the importer and the live adapter ever
        // disagree about the game name, the course or the car model, this is where it shows.
        var live = new LmuTelemetryMapper(() => new DateTimeOffset(2026, 6, 23, 21, 0, 0, TimeSpan.Zero))
            .Map(new LmuParsedFrame
            {
                ScoringInfo = new LmuScoringInfo
                {
                    TrackName = "Circuit des 24 Heures",
                    Session = 10, // race
                    LapDistance = 13626.0,
                },
                PlayerHasVehicle = true,
                PlayerIndex = 0,
                PlayerVehicle = new LmuVehicleScoring
                {
                    VehicleName = "Ferrari 499P",
                    VehicleClass = "Hyper",
                },
            });

        var store = new RecordingLapHistoryStore();
        var recorder = new LapHistoryRecorder(store, dispatch: work => work());
        recorder.Ingest(live with { Lap = new LapState { CurrentLap = 4 } });
        recorder.Ingest(live with { Lap = new LapState { CurrentLap = 5, LastLapTime = 109.5 } });

        WriteResult("race.xml", RaceXml);
        new LapHistoryImportService(store).Import(new LmuResultsImporter(_dir));

        // Two sessions on disk — one per writer — but one bucket.
        Assert.Equal(2, store.LoadAll().Count);

        var statistics = LapHistoryStatistics.Resolve(store, new LapHistoryContext
        {
            Game = live.Session.Game,
            TrackCourse = live.Session.Track,
            CarModel = live.Session.Car,
        });

        Assert.NotNull(statistics);
        Assert.Equal(3, statistics.SampleSize); // both imported laps plus the recorded one
        Assert.Equal(107.6273, statistics.Fastest.Lap.LapTimeSeconds);
        Assert.Equal(LapHistoryOrigin.Imported, statistics.Fastest.Session.Origin);
        Assert.Equal(109.5, statistics.Slowest.Lap.LapTimeSeconds);
        Assert.Equal(LapHistoryOrigin.Recorded, statistics.Slowest.Session.Origin);

        // The two writers must agree on the whole key, the game name included.
        Assert.All(store.LoadAll(), session =>
        {
            Assert.Equal(live.Session.Game, session.Context.Game);
            Assert.Equal(live.Session.Track, session.Context.TrackCourse);
            Assert.Equal(live.Session.Car, session.Context.CarModel);
        });
    }

    /// <summary>
    /// An in-memory <see cref="ILapHistoryStore"/> that also counts writes, so a re-import can
    /// be shown to write nothing at all rather than merely to overwrite with the same record.
    /// </summary>
    private sealed class RecordingLapHistoryStore : ILapHistoryStore
    {
        private readonly Dictionary<string, LapHistorySession> _sessions = [];

        public int Saves { get; private set; }

        public IReadOnlyList<LapHistorySession> LoadAll() => [.. _sessions.Values];

        public void Save(LapHistorySession session)
        {
            Saves++;
            _sessions[session.Id] = session;
        }

        public void Delete(string sessionId) => _sessions.Remove(sessionId);
    }
}

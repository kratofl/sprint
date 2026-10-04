using Sprint.Desktop.Api.Games;

namespace Sprint.Games.LeMansUltimate.Results;

/// <summary>
/// Le Mans Ultimate's results archive (<c>UserData\Log\Results\*.xml</c>) as Sprint records.
/// This is the boundary the game-native <see cref="LmuSessionResult"/> stops at: callers see
/// <see cref="ImportedSession"/> only, so the corpus — and the planner behind it — never
/// depends on the sim's XML.
/// </summary>
public sealed class LmuResultsImporter : IResultsImporter
{
    // A history bucket is keyed by game as well as track and car, so both writers must spell
    // it identically — one shared constant instead of a literal per writer. The import tests
    // additionally pin it against a mapped live frame.
    private const string GameName = LeMansUltimateGameData.GameName;

    private readonly LmuResultsReader _reader;

    /// <param name="directory">Directory holding the result XMLs. Need not exist yet.</param>
    public LmuResultsImporter(string directory)
        : this(new LmuResultsReader(directory))
    {
    }

    internal LmuResultsImporter(LmuResultsReader reader)
    {
        _reader = reader;
    }

    /// <summary>
    /// Named, not pathed. This reads inside a sentence the driver sees ("Sprint found … in
    /// {SourceDescription}"), and a full install path is both unreadable there and tells them
    /// nothing about their own machine they did not already know. The actual directory stays
    /// available on the reader for diagnostics.
    /// </summary>
    public string SourceDescription => "the Le Mans Ultimate results folder";

    public IReadOnlyList<ResultsArchiveEntry> ListEntries() =>
        [.. _reader.ListResultFiles().Select(file => new ResultsArchiveEntry(
            file.FullName,
            file.Length,
            file.LastWriteTimeUtc))];

    public ImportedSession? Read(ResultsArchiveEntry entry)
    {
        ArgumentNullException.ThrowIfNull(entry);

        // The id is this importer's own key and a path only to this importer, so a key from
        // anywhere else names no file here — and File.Exists answers that without throwing on an
        // id that is not a path at all.
        if (!File.Exists(entry.Id)
            || !_reader.TryReadFile(entry.Id, out var result, out _)
            || result is null)
        {
            return null;
        }

        return Map(result);
    }

    private static ImportedSession? Map(LmuSessionResult result)
    {
        // Without a player there is no driver whose history this is, and without a course or a
        // car model there is no bucket to file it in. Substituting the venue for a missing
        // course, or filing under a blank car, would create a bucket the live recorder can
        // never write to — the laps would be present but joined to nothing, which is worse
        // than not importing them. The recorder refuses a blank track or car for the same
        // reason.
        if (result.Player is not { } player
            || Blank(result.TrackCourse)
            || Blank(player.CarType))
        {
            return null;
        }

        return new ImportedSession(
            Game: GameName,
            // The course is the layout actually driven; the venue can name a site with
            // several layouts of very different lengths.
            TrackCourse: result.TrackCourse,
            CarModel: player.CarType,
            Kind: MapKind(result.SessionType),
            SessionTimeUtc: result.SessionTimeUtc,
            PlayerName: player.Name,
            // The archive scores the whole field; only the local player's laps are this
            // driver's history. Untimed out/in laps are kept as laps with no time, because
            // the writer, not the reader, decides what an untimed lap is worth.
            Laps: [.. player.Laps.Select(MapLap)])
        {
            // The parser reports an absent element as an empty string; a bucket qualifier that
            // was never stated must read as unknown, not as a car with no class.
            CarClass = Blank(player.CarClass) ? null : player.CarClass,
            TrackLengthMeters = result.TrackLengthMeters,
        };
    }

    private static ImportedLap MapLap(LmuLapResult lap) => new(
        lap.LapNumber,
        lap.LapTimeSeconds,
        Sectors(lap))
    {
        TopSpeedKph = lap.TopSpeedKph,
        FrontCompound = lap.FrontCompound,
        RearCompound = lap.RearCompound,
    };

    /// <summary>
    /// The lap's sector times, positionally: index <c>i</c> is sector <c>i+1</c>. Only the
    /// leading run of stated sectors is kept, so a file that omits sector 2 but states sector 3
    /// reports two sectors' worth of nothing rather than the third sector as the second.
    /// </summary>
    private static IReadOnlyList<double> Sectors(LmuLapResult lap)
    {
        double?[] stated = [lap.Sector1Seconds, lap.Sector2Seconds, lap.Sector3Seconds];
        var sectors = new List<double>(stated.Length);
        foreach (var sector in stated)
        {
            if (sector is not { } seconds)
            {
                break;
            }

            sectors.Add(seconds);
        }

        return sectors;
    }

    /// <summary>
    /// The sim's own session vocabulary onto the shared one. A session name this build of the
    /// game invented reads as unknown rather than being guessed into a bucket it may not
    /// belong in — the kind decides which laps a later scope filter considers.
    /// </summary>
    private static ImportedSessionKind MapKind(LmuSessionType type) => type switch
    {
        LmuSessionType.Practice => ImportedSessionKind.Practice,
        LmuSessionType.Qualifying => ImportedSessionKind.Qualifying,
        LmuSessionType.Warmup => ImportedSessionKind.Warmup,
        LmuSessionType.Race => ImportedSessionKind.Race,
        LmuSessionType.TestDay => ImportedSessionKind.TestDay,
        _ => ImportedSessionKind.Unknown,
    };

    private static bool Blank(string? value) => string.IsNullOrWhiteSpace(value);
}

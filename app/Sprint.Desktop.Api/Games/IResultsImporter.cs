namespace Sprint.Desktop.Api.Games;

/// <summary>
/// Which part of a weekend an archived session covers. Deliberately its own enum rather
/// than the live telemetry contract's session type: it carries kinds the live contract has
/// no concept of (<see cref="TestDay"/>), and an archive's vocabulary must not shift when
/// the live contract is renamed.
/// </summary>
public enum ImportedSessionKind
{
    Unknown,
    Practice,
    Qualifying,
    Warmup,
    Race,
    TestDay,
}

/// <summary>
/// One entry in a game's results archive, identified and change-stamped <em>without</em>
/// parsing it. Id, size and last-write are exactly the ledger keys a startup scan needs to
/// decide there is nothing new, so a normal launch parses nothing.
/// </summary>
/// <param name="Id">Opaque locator the importer can read back (a file path for a
/// file-based archive). Callers must treat it as a key, never as a path.</param>
public sealed record ResultsArchiveEntry(
    string Id,
    long SizeBytes,
    DateTimeOffset LastWriteUtc);

/// <summary>
/// One archived session as a Sprint record: the context it belongs to, the natural key
/// (track, kind, time, player) that makes a re-import a no-op, and the laps that were
/// driven.
/// </summary>
/// <remarks>
/// The fields carry <see cref="Game"/> so a session stays self-describing once it leaves
/// the provider — a history bucket is keyed by game, track and car together, and re-joining
/// identity at the consumer is exactly where the two history writers could drift apart.
/// <para>An archive supplies no fuel, no virtual energy, no conditions and no position
/// trace. That is a permanent property of the source, so those are absent from this record
/// rather than present as zero.</para>
/// </remarks>
public sealed record ImportedSession(
    string Game,
    string TrackCourse,
    string CarModel,
    ImportedSessionKind Kind,
    DateTimeOffset? SessionTimeUtc,
    string PlayerName,
    IReadOnlyList<ImportedLap> Laps)
{
    /// <summary>Metadata, not part of the context key, so a future "same class" fallback stays open.</summary>
    public string? CarClass { get; init; }

    /// <summary>Track length in metres when the archive states it — a cross-check against live lap distance.</summary>
    public double? TrackLengthMeters { get; init; }

    /// <summary>The championship the car was entered in (e.g. "WEC 2026"), when the archive states it.</summary>
    public string? Championship { get; init; }

    /// <summary>The entry the player drove — the livery — when the archive names it apart from <see cref="CarModel"/>.</summary>
    public string? Livery { get; init; }
}

/// <summary>
/// One entry a results archive names: a livery and the car it is. The game's live feed can
/// name only the livery (older recordings never stored more), and this is the lookup that
/// says which car that was.
/// </summary>
/// <param name="Livery">The entry as the game names it live (e.g. "BMW M Team WRT 2026 #15:LM").</param>
/// <param name="CarType">The car's model (e.g. "BMW M Hybrid V8").</param>
/// <param name="CarClass">The class in the game's own spelling, or null when not stated.</param>
/// <param name="Championship">The championship (e.g. "WEC 2026"), or null when not stated.</param>
public sealed record ResultsCar(
    string Livery,
    string CarType,
    string? CarClass,
    string? Championship);

/// <summary>
/// One archived lap. <see cref="LapTimeSeconds"/> is null for an out/in/incomplete lap the
/// archive left untimed, and sectors may be shorter than the lap's real sector count when
/// the archive omitted them.
/// </summary>
public sealed record ImportedLap(
    int LapNumber,
    double? LapTimeSeconds,
    IReadOnlyList<double> SectorsSeconds)
{
    public double? TopSpeedKph { get; init; }

    public string? FrontCompound { get; init; }

    public string? RearCompound { get; init; }
}

/// <summary>
/// Reads sessions a game already archived on disk, mapped onto Sprint records. Listing is
/// separate from reading because the startup scan is ledger-driven: it compares entries and
/// only parses what changed.
/// </summary>
/// <remarks>
/// Synchronous, like the game readers behind it: an archive is local storage, and the caller
/// decides whether a scan runs off the UI thread.
/// </remarks>
public interface IResultsImporter
{
    /// <summary>
    /// Where this importer looks, phrased for a person (e.g. the results folder). Lets an
    /// empty result say what was scanned instead of "nothing found".
    /// </summary>
    string SourceDescription { get; }

    /// <summary>
    /// Every archive entry, newest first. Empty when the archive does not exist yet — a game
    /// that has never been run is not an error.
    /// </summary>
    IReadOnlyList<ResultsArchiveEntry> ListEntries();

    /// <summary>
    /// Parse one entry, or null when it cannot be read or parsed. A single unreadable entry
    /// must never abort a batch import.
    /// </summary>
    ImportedSession? Read(ResultsArchiveEntry entry);

    /// <summary>
    /// Every entry the whole archive names, once per livery. Parses every entry, so it is for a
    /// one-off pass, never a poll. Empty for an archive that does not name liveries.
    /// </summary>
    IReadOnlyList<ResultsCar> ListCars() => [];
}

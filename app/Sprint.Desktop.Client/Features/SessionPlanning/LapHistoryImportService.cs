using Sprint.Desktop.Api.Games;
using Sprint.Desktop.Api.Telemetry;
using Sprint.Desktop.Features.Diagnostics;

namespace Sprint.Desktop.Features.SessionPlanning;

/// <summary>What became of one archive entry an import pass looked at.</summary>
public enum LapHistoryImportStatus
{
    /// <summary>Parsed, mapped and written to the corpus.</summary>
    Imported,

    /// <summary>The corpus already holds this session under its natural key.</summary>
    AlreadyImported,

    /// <summary>The entry could not be read, parsed, or placed in a context bucket.</summary>
    Unreadable,

    /// <summary>Read, but it holds no completed lap time — nothing a reader could use.</summary>
    NoTimedLaps,
}

/// <param name="Session">The record written, present only for <see cref="LapHistoryImportStatus.Imported"/>.</param>
public sealed record LapHistoryImportOutcome(
    ResultsArchiveEntry Entry,
    LapHistoryImportStatus Status)
{
    public LapHistorySession? Session { get; init; }
}

/// <summary>
/// What one import pass did, per entry. The per-kind breakdown is what an import prompt needs
/// to say "Practice 9, Qualifying 3, Race 2" instead of asking for a blind yes.
/// </summary>
public sealed class LapHistoryImportReport
{
    public required IReadOnlyList<LapHistoryImportOutcome> Outcomes { get; init; }

    public int ImportedCount => Count(LapHistoryImportStatus.Imported);

    public int AlreadyImportedCount => Count(LapHistoryImportStatus.AlreadyImported);

    public int UnreadableCount => Count(LapHistoryImportStatus.Unreadable);

    /// <summary>How many sessions of each kind this pass added to the corpus.</summary>
    public IReadOnlyDictionary<HistorySessionKind, int> ImportedByKind =>
        Outcomes
            .Where(outcome => outcome.Session is not null)
            .GroupBy(outcome => outcome.Session!.Kind)
            .ToDictionary(group => group.Key, group => group.Count());

    private int Count(LapHistoryImportStatus status) =>
        Outcomes.Count(outcome => outcome.Status == status);
}

/// <summary>
/// Writes a game's results archive into the lap-history corpus (#182). This is the only place
/// archived sessions enter the corpus, and it is an <em>import</em> path: the planner and every
/// statistic read Sprint records afterwards, never the game's own files.
/// <para>
/// Idempotency is by natural key — game, course, kind, session time and player, composed into
/// the session id — checked against the corpus on entries the caller was going to parse anyway.
/// A results folder that was moved, renamed or restored therefore costs one re-parse and
/// duplicates nothing, with no hash of anything on disk to keep in step.
/// </para>
/// </summary>
public sealed class LapHistoryImportService
{
    private readonly ILapHistoryStore _store;
    private readonly ILog _log;

    public LapHistoryImportService(ILapHistoryStore store, ILog? log = null)
    {
        _store = store ?? throw new ArgumentNullException(nameof(store));
        _log = log ?? NullLog.Instance;
    }

    /// <summary>
    /// Imports <paramref name="entries"/> (every entry the importer lists when null) into the
    /// corpus, skipping sessions it already holds.
    /// </summary>
    public LapHistoryImportReport Import(
        IResultsImporter importer,
        IEnumerable<ResultsArchiveEntry>? entries = null)
    {
        ArgumentNullException.ThrowIfNull(importer);

        // One read of the corpus per pass, not per entry: the natural key is the session id, so
        // the ids already on disk are the whole dedupe state.
        var known = new HashSet<string>(_store.LoadAll().Select(session => session.Id), StringComparer.Ordinal);
        var outcomes = new List<LapHistoryImportOutcome>();

        foreach (var entry in entries ?? importer.ListEntries())
        {
            outcomes.Add(ImportOne(importer, entry, known));
        }

        return new LapHistoryImportReport { Outcomes = outcomes };
    }

    private LapHistoryImportOutcome ImportOne(
        IResultsImporter importer,
        ResultsArchiveEntry entry,
        HashSet<string> known)
    {
        var imported = importer.Read(entry);
        if (imported is null)
        {
            // One file the sim left half-written, or a session with no context to file it under,
            // must never cost the driver the rest of the archive; leave a breadcrumb instead.
            _log.Warn($"Skipping results archive entry '{entry.Id}': it could not be read or bucketed");
            return new LapHistoryImportOutcome(entry, LapHistoryImportStatus.Unreadable);
        }

        var session = Map(imported, SessionTime(imported, entry));
        if (session is null)
        {
            return new LapHistoryImportOutcome(entry, LapHistoryImportStatus.NoTimedLaps);
        }

        if (!known.Add(session.Id))
        {
            return new LapHistoryImportOutcome(entry, LapHistoryImportStatus.AlreadyImported);
        }

        _store.Save(session);
        return new LapHistoryImportOutcome(entry, LapHistoryImportStatus.Imported) { Session = session };
    }

    /// <summary>
    /// When the session ran. An archive that states no session time still has a file the game
    /// wrote at the end of it, and that is a better answer than dropping the laps — but it is
    /// also part of the natural key, so a restored folder can only re-key sessions the archive
    /// itself left untimed.
    /// </summary>
    private static DateTimeOffset SessionTime(ImportedSession imported, ResultsArchiveEntry entry) =>
        imported.SessionTimeUtc ?? entry.LastWriteUtc;

    /// <summary>
    /// The corpus id an archive entry would be written under. This is the whole dedupe rule, so
    /// a scan that wants to know what is new (#185) asks here rather than re-deriving it — a
    /// second derivation that resolved the session time differently would import duplicates.
    /// </summary>
    public static string SessionId(ImportedSession imported, ResultsArchiveEntry entry)
    {
        ArgumentNullException.ThrowIfNull(imported);
        ArgumentNullException.ThrowIfNull(entry);

        return SessionId(imported, SessionTime(imported, entry));
    }

    /// <summary>
    /// The corpus id for an archived session: its natural key of game, course, kind, session
    /// time and player.
    /// </summary>
    public static string SessionId(ImportedSession imported, DateTimeOffset when)
    {
        ArgumentNullException.ThrowIfNull(imported);

        return string.Join('-',
            "imported",
            Slug(imported.Game),
            Slug(imported.TrackCourse),
            Slug(imported.Kind.ToString()),
            when.ToUniversalTime().ToString("yyyyMMddTHHmmssZ"),
            Slug(imported.PlayerName));
    }

    private static LapHistorySession? Map(ImportedSession imported, DateTimeOffset when)
    {
        // A history record cannot say "no time", and an out lap filed as a zero-second lap
        // would poison every median the corpus is read for.
        var laps = imported.Laps
            .Where(lap => lap.LapTimeSeconds is > 0)
            .Select(MapLap)
            .ToList();

        if (laps.Count == 0)
        {
            return null;
        }

        return new LapHistorySession
        {
            Id = SessionId(imported, when),
            Origin = LapHistoryOrigin.Imported,
            Kind = MapKind(imported.Kind),
            StartedAt = when,
            Context = new LapHistoryContext
            {
                Game = imported.Game,
                TrackCourse = imported.TrackCourse,
                CarModel = imported.CarModel,
                CarClass = imported.CarClass,
                TrackLengthMeters = imported.TrackLengthMeters,
            },
            Laps = laps,
        };
    }

    private static LapHistoryRecord MapLap(ImportedLap lap) => new()
    {
        LapNumber = lap.LapNumber,
        LapTimeSeconds = lap.LapTimeSeconds!.Value,
        SectorsSeconds = [.. lap.SectorsSeconds],
        TopSpeedKph = lap.TopSpeedKph,
        Tires = [.. Compounds(lap)],
    };

    /// <summary>
    /// The lap's compounds as corners. An archive states one compound per axle and nothing else
    /// about the corner, so wear, temperature and pressure stay absent; a corner is only filed
    /// when a compound was actually stated, rather than putting four empty corners on disk for
    /// every imported lap.
    /// </summary>
    private static IEnumerable<LapHistoryTire> Compounds(ImportedLap lap)
    {
        if (lap.FrontCompound is { Length: > 0 } front)
        {
            yield return Corner(TirePosition.FrontLeft, front);
            yield return Corner(TirePosition.FrontRight, front);
        }

        if (lap.RearCompound is { Length: > 0 } rear)
        {
            yield return Corner(TirePosition.RearLeft, rear);
            yield return Corner(TirePosition.RearRight, rear);
        }
    }

    // The recorder names corners after the telemetry contract's positions; an imported corner
    // has to answer to the same name or a reader would have to know which writer filed it.
    private static LapHistoryTire Corner(TirePosition position, string compound) => new()
    {
        Position = position.ToString(),
        Compound = compound,
    };

    /// <summary>
    /// The archive's session vocabulary onto the corpus's own on-disk one. Both enums list the
    /// same kinds today; they are separate types because one is a capability contract and the
    /// other is a storage format, and this is the single place they meet — the startup scan
    /// (#185) builds its per-kind breakdown through here rather than mapping a second time.
    /// </summary>
    internal static HistorySessionKind MapKind(ImportedSessionKind kind) => kind switch
    {
        ImportedSessionKind.Practice => HistorySessionKind.Practice,
        ImportedSessionKind.Qualifying => HistorySessionKind.Qualifying,
        ImportedSessionKind.Warmup => HistorySessionKind.Warmup,
        ImportedSessionKind.Race => HistorySessionKind.Race,
        ImportedSessionKind.TestDay => HistorySessionKind.TestDay,
        _ => HistorySessionKind.Unknown,
    };

    /// <summary>
    /// A key part reduced to a stable, file-name-safe token. The store names a file after the
    /// session id, so a course or driver name with separators in it must not decide where the
    /// record lands.
    /// </summary>
    private static string Slug(string value)
    {
        var slug = new System.Text.StringBuilder(value.Length);
        foreach (var c in value)
        {
            // Letters of any script survive: mangling them would make two courses that differ
            // only outside ASCII share a key, and a shared key means a dropped session.
            if (char.IsLetterOrDigit(c))
            {
                slug.Append(char.ToLowerInvariant(c));
            }
            else if (slug.Length > 0 && slug[^1] != '_')
            {
                slug.Append('_');
            }
        }

        return slug.ToString().TrimEnd('_');
    }
}

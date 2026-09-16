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
        List<LapHistorySession> existing = [.. this._store.LoadAll()];
        HashSet<string> known = new(existing.Select(session => session.Id), StringComparer.Ordinal);
        List<LapHistoryImportOutcome> outcomes = [];

        foreach (ResultsArchiveEntry entry in entries ?? importer.ListEntries())
        {
            outcomes.Add(this.ImportOne(importer, entry, known, existing));
        }

        return new LapHistoryImportReport { Outcomes = outcomes };
    }

    private LapHistoryImportOutcome ImportOne(
        IResultsImporter importer,
        ResultsArchiveEntry entry,
        HashSet<string> known,
        List<LapHistorySession> existing)
    {
        ImportedSession? imported = importer.Read(entry);
        if (imported is null)
        {
            // One file the sim left half-written, or a session with no context to file it under,
            // must never cost the driver the rest of the archive; leave a breadcrumb instead.
            _log.Warn($"Skipping results archive entry '{entry.Id}': it could not be read or bucketed");
            return new LapHistoryImportOutcome(entry, LapHistoryImportStatus.Unreadable);
        }

        LapHistorySession? session = Map(imported, SessionTime(imported, entry));
        if (session is null)
        {
            return new LapHistoryImportOutcome(entry, LapHistoryImportStatus.NoTimedLaps);
        }

        if (!known.Add(session.Id) || MatchesRecordedSession(imported, entry, existing))
        {
            return new LapHistoryImportOutcome(entry, LapHistoryImportStatus.AlreadyImported);
        }

        this._store.Save(session);
        existing.Add(session);
        return new LapHistoryImportOutcome(entry, LapHistoryImportStatus.Imported) { Session = session };
    }

    /// <summary>
    /// Whether the archive describes a session Sprint already watched live. Recorded and
    /// imported sessions deliberately use different ids, so their shared facts are the only
    /// safe bridge: context, kind, time window, and lap time. Lap numbers are intentionally
    /// excluded because LMU's live and archived counters can differ at the crossing boundary.
    /// </summary>
    internal static bool MatchesRecordedSession(
        ImportedSession imported,
        ResultsArchiveEntry entry,
        IEnumerable<LapHistorySession> existing)
    {
        ArgumentNullException.ThrowIfNull(imported);
        ArgumentNullException.ThrowIfNull(entry);
        ArgumentNullException.ThrowIfNull(existing);

        DateTimeOffset archiveStart = SessionTime(imported, entry);
        DateTimeOffset archiveEnd = entry.LastWriteUtc > archiveStart ? entry.LastWriteUtc : archiveStart;
        TimeSpan clockTolerance = TimeSpan.FromMinutes(5);
        HistorySessionKind kind = MapKind(imported.Kind);

        foreach (LapHistorySession recorded in existing)
        {
            if (recorded.Origin != LapHistoryOrigin.Recorded
                || recorded.Kind != kind
                || !Same(recorded.Context.Game, imported.Game)
                || !SameTrack(imported.Game, recorded.Context.TrackCourse, imported.TrackCourse)
                || !SameCar(imported.Game, recorded.Context.CarModel, imported.CarModel)
                || recorded.StartedAt < archiveStart - clockTolerance
                || recorded.StartedAt > archiveEnd + clockTolerance)
            {
                continue;
            }

            foreach (ImportedLap archivedLap in imported.Laps)
            {
                if (archivedLap.LapTimeSeconds is not > 0)
                {
                    continue;
                }

                if (recorded.Laps.Any(lap =>
                    Math.Abs(lap.LapTimeSeconds - archivedLap.LapTimeSeconds.Value) <= 0.01))
                {
                    return true;
                }
            }
        }

        return false;
    }

    /// <summary>
    /// Whether an already-stored imported session is the time-only copy of a richer recorded
    /// session. Readers can hide the copy without deleting either file.
    /// </summary>
    internal static bool HasRecordedEquivalent(
        LapHistorySession imported,
        IEnumerable<LapHistorySession> existing)
    {
        ArgumentNullException.ThrowIfNull(imported);
        ArgumentNullException.ThrowIfNull(existing);
        if (imported.Origin != LapHistoryOrigin.Imported)
        {
            return false;
        }

        TimeSpan sessionTolerance = TimeSpan.FromHours(1);
        foreach (LapHistorySession recorded in existing)
        {
            if (recorded.Origin != LapHistoryOrigin.Recorded
                || recorded.Kind != imported.Kind
                || !Same(recorded.Context.Game, imported.Context.Game)
                || !SameTrack(imported.Context.Game, recorded.Context.TrackCourse, imported.Context.TrackCourse)
                || !SameCar(imported.Context.Game, recorded.Context.CarModel, imported.Context.CarModel)
                || Math.Abs((recorded.StartedAt - imported.StartedAt).TotalMinutes) > sessionTolerance.TotalMinutes)
            {
                continue;
            }

            if (imported.Laps.Any(importedLap =>
                importedLap.LapTimeSeconds > 0
                && recorded.Laps.Any(recordedLap =>
                    Math.Abs(recordedLap.LapTimeSeconds - importedLap.LapTimeSeconds) <= 0.01)))
            {
                return true;
            }
        }

        return false;
    }

    /// <summary>
    /// Whether an archived lap corroborates a recorded channel lap that an older recorder
    /// mislabelled with the validity of the newly started lap at the crossing.
    /// </summary>
    internal static bool HasImportedEquivalent(
        LapHistorySession recorded,
        LapHistoryRecord recordedLap,
        IEnumerable<LapHistorySession> existing)
    {
        ArgumentNullException.ThrowIfNull(recorded);
        ArgumentNullException.ThrowIfNull(recordedLap);
        ArgumentNullException.ThrowIfNull(existing);
        if (recorded.Origin != LapHistoryOrigin.Recorded || !recordedLap.HasChannelTrace)
        {
            return false;
        }

        TimeSpan sessionTolerance = TimeSpan.FromHours(1);
        return existing.Any(imported =>
            imported.Origin == LapHistoryOrigin.Imported
            && imported.Kind == recorded.Kind
            && Same(imported.Context.Game, recorded.Context.Game)
            && SameTrack(recorded.Context.Game, imported.Context.TrackCourse, recorded.Context.TrackCourse)
            && SameCar(recorded.Context.Game, imported.Context.CarModel, recorded.Context.CarModel)
            && Math.Abs((imported.StartedAt - recorded.StartedAt).TotalMinutes) <= sessionTolerance.TotalMinutes
            && imported.Laps.Any(importedLap =>
                importedLap.LapTimeSeconds > 0
                && Math.Abs(importedLap.LapTimeSeconds - recordedLap.LapTimeSeconds) <= 0.01));
    }

    private static bool Same(string left, string right) =>
        string.Equals(left, right, StringComparison.OrdinalIgnoreCase);

    private static bool SameTrack(string game, string left, string right)
    {
        if (Same(left, right))
        {
            return true;
        }

        return Same(game, "Le Mans Ultimate")
            && Same(NormalizeLmuTrack(left), NormalizeLmuTrack(right));
    }

    private static bool SameCar(string game, string left, string right)
    {
        if (Same(left, right))
        {
            return true;
        }

        return Same(game, "Le Mans Ultimate")
            && Same(NormalizeLmuCar(left), NormalizeLmuCar(right));
    }

    private static string NormalizeLmuTrack(string value)
    {
        string normalized = LettersAndDigits(value);
        string[] venuePrefixes = ["circuitde", "circuitdu"];
        foreach (string prefix in venuePrefixes)
        {
            if (normalized.StartsWith(prefix, StringComparison.Ordinal))
            {
                return normalized[prefix.Length..];
            }
        }

        return normalized;
    }

    private static string NormalizeLmuCar(string value)
    {
        int skinSeparator = value.IndexOf(':');
        string identity = skinSeparator < 0 ? value : value[..skinSeparator];
        return LettersAndDigits(identity);
    }

    private static string LettersAndDigits(string value) =>
        new string([.. value.Where(char.IsLetterOrDigit).Select(char.ToLowerInvariant)]);

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

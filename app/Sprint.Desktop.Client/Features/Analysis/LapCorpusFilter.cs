using System.Globalization;
using Sprint.Desktop.Features.SessionPlanning;
using Sprint.Games;

namespace Sprint.Desktop.Features.Analysis;

/// <summary>
/// One recorded session as the picker lists it: enough to recognise "the one I drove yesterday
/// evening" without loading a single lap.
/// </summary>
public sealed record CorpusSession(
    string Id,
    LapHistoryContext Context,
    HistorySessionKind Kind,
    LapHistoryOrigin Origin,
    DateTimeOffset StartedAt,
    int LapCount,
    int TracedLapCount,
    double? BestLapSeconds,
    string? SharedFrom)
{
    /// <summary>The local day this session was driven on, which is how a driver remembers it.</summary>
    public DateOnly Day => DateOnly.FromDateTime(StartedAt.ToLocalTime().DateTime);

    /// <summary>"Practice · 19:04" — the kind and the time, because that is what is recalled.</summary>
    public string Label => SharedFrom is { Length: > 0 } from
        ? $"Shared by {from}"
        : $"{Kind} · {StartedAt.ToLocalTime().ToString("HH:mm", CultureInfo.InvariantCulture)}";

    public string Detail
    {
        get
        {
            var laps = LapCount == 1 ? "1 lap" : $"{LapCount} laps";
            return BestLapSeconds is { } best
                ? $"{laps} · best {PlanTargetResolver.FormatLapTime(best)}"
                : laps;
        }
    }

    /// <summary>Whether any lap here can be overlaid channel by channel.</summary>
    public bool HasChannels => TracedLapCount > 0;
}

/// <summary>The compact badge and full name shown for one car-class choice.</summary>
public sealed record AnalysisCarClassDisplay(
    string Id,
    string Abbreviation,
    string Name,
    GameCarClassVisualRole VisualRole);

/// <summary>
/// Narrowing the corpus down to one session (#196).
/// <para>
/// A flat list of every lap is unusable once a driver has real mileage — hundreds of rows with
/// nothing to steer by. This narrows the way a driver actually remembers a session: which game,
/// then which track, class and car, then optionally which day. A step with one answer is
/// answered for them rather than asked.
/// </para>
/// <para>Avalonia-free, so the whole cascade is a unit test.</para>
/// </summary>
public sealed class LapCorpusFilter
{
    /// <summary>Stands in for sessions the game never gave a car class.</summary>
    public const string UnspecifiedClass = "Unspecified";

    private readonly IReadOnlyList<CorpusSession> _all;

    public LapCorpusFilter(IReadOnlyList<CorpusSession> sessions)
    {
        _all = sessions ?? throw new ArgumentNullException(nameof(sessions));
        if (Games.Count == 1)
        {
            SelectGame(Games[0]);
        }
    }

    public string? Game { get; private set; }

    /// <summary>
    /// The chosen circuit, which may still have more than one layout under it. A layout variant
    /// is not a place of its own, so it never occupies a card in the track step.
    /// </summary>
    public string? Circuit { get; private set; }

    public string? Track { get; private set; }

    public string? CarClass { get; private set; }

    public string? CarModel { get; private set; }

    /// <summary>The optional inclusive start of the session date range.</summary>
    public DateOnly? DateFrom { get; private set; }

    /// <summary>The optional inclusive end of the session date range.</summary>
    public DateOnly? DateTo { get; private set; }

    /// <summary>Compatibility view for callers that selected one exact day.</summary>
    public DateOnly? Day => DateFrom == DateTo ? DateFrom : null;

    /// <summary>Games in the corpus, most recently driven first.</summary>
    public IReadOnlyList<string> Games =>
        [.. _all
            .GroupBy(session => session.Context.Game, StringComparer.Ordinal)
            .OrderByDescending(group => group.Max(session => session.StartedAt))
            .Select(group => group.Key)];

    /// <summary>Tracks for the selected game, most recently driven first.</summary>
    public IReadOnlyList<string> Tracks =>
        [.. Matching(game: true)
            .GroupBy(session => session.Context.TrackCourse, StringComparer.Ordinal)
            .OrderByDescending(group => group.Max(session => session.StartedAt))
            .Select(group => group.Key)];

    /// <summary>Circuits for the selected game, most recently driven first.</summary>
    public IReadOnlyList<GameCircuit> Circuits => GameTrackCatalog.Circuits(Game, Tracks);

    /// <summary>The layouts of the selected circuit, in catalog order.</summary>
    public IReadOnlyList<GameTrackLayout> Layouts =>
        Circuit is null
            ? []
            : Circuits
                .FirstOrDefault(circuit => string.Equals(circuit.Id, Circuit, StringComparison.Ordinal))
                ?.Layouts
              ?? [];

    /// <summary>Whether the chosen circuit still leaves a layout to pick.</summary>
    public bool LayoutIsAChoice => Layouts.Count > 1;

    /// <summary>Canonical car classes at the selected track.</summary>
    public IReadOnlyList<string> Classes =>
        [.. Matching(game: true, track: true)
            .Select(session => GameCarClassCatalog.CanonicalId(Game, ClassOf(session)))
            .Distinct(StringComparer.Ordinal)
            .Order(StringComparer.Ordinal)];

    /// <summary>
    /// Every class the selected game knows, including unavailable classes that help explain why
    /// a track choice narrowed the next step.
    /// </summary>
    public IReadOnlyList<GameCarClass> ClassOptions => GameCarClassCatalog.Classes(
        Game,
        Matching(game: true).Select(ClassOf));

    /// <summary>Car models in the selected track and class.</summary>
    public IReadOnlyList<string> CarModels =>
        [.. Matching(game: true, track: true, carClass: true)
            .Select(session => session.Context.CarModel)
            .Distinct(StringComparer.Ordinal)
            .Order(StringComparer.Ordinal)];

    /// <summary>Days that have a session for the selected track, class and car — newest first.</summary>
    public IReadOnlyList<DateOnly> Days =>
        [.. Matching(game: true, track: true, carClass: true, carModel: true)
            .Select(session => session.Day)
            .Distinct()
            .OrderDescending()];

    /// <summary>The sessions that survive every filter, newest first.</summary>
    public IReadOnlyList<CorpusSession> Sessions =>
        [.. Matching(game: true, track: true, carClass: true, carModel: true, day: true)
            .OrderByDescending(session => session.StartedAt)];

    /// <summary>Whether the corpus holds nothing at all.</summary>
    public bool IsEmpty => _all.Count == 0;

    /// <summary>
    /// How many sessions were driven on one exact layout, so choosing between a circuit's layouts
    /// is a choice between things of known size.
    /// </summary>
    public int SessionsOnLayout(string trackName)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(trackName);
        return Matching(game: true).Count(session =>
            string.Equals(session.Context.TrackCourse, trackName, StringComparison.Ordinal));
    }

    /// <summary>
    /// Whether a step still has a real choice in it. A step with one answer is not a question,
    /// so the view does not draw it.
    /// </summary>
    public bool ClassIsAChoice => Classes.Count > 1;

    public bool CarModelIsAChoice => CarModels.Count > 1;

    public void SelectGame(string? game)
    {
        Game = game;
        Circuit = null;
        Track = null;
        CarClass = null;
        CarModel = null;
        ClearDateRange();

        var circuits = Circuits;
        if (circuits.Count == 1)
        {
            SelectCircuit(circuits[0].Id);
        }
    }

    /// <summary>
    /// Chooses a place. A circuit with one layout answers the layout question too; one with
    /// several leaves it open, because guessing which layout was meant is worse than asking.
    /// </summary>
    public void SelectCircuit(string? circuitId)
    {
        Circuit = circuitId;
        Track = null;
        CarClass = null;
        CarModel = null;
        ClearDateRange();

        var layouts = Layouts;
        if (layouts.Count == 1)
        {
            Track = layouts[0].TrackName;
            CascadeClass();
        }
    }

    public void SelectTrack(string? track)
    {
        Track = track;
        Circuit = track is null ? null : GameTrackCatalog.CircuitId(Game, track);
        // Everything downstream belonged to the old track.
        CarClass = null;
        CarModel = null;
        ClearDateRange();
        CascadeClass();
    }

    public void SelectClass(string? carClass)
    {
        CarClass = carClass is null ? null : GameCarClassCatalog.CanonicalId(Game, carClass);
        CarModel = null;
        ClearDateRange();
        CascadeCarModel();
    }

    public void SelectCarModel(string? carModel)
    {
        CarModel = carModel;
        ClearDateRange();
    }

    /// <summary>Sets or clears one exact day while preserving the existing controller API.</summary>
    public void SelectDay(DateOnly? day) => SelectDateRange(day, day);

    /// <summary>Sets an inclusive, optionally open-ended date range.</summary>
    public void SelectDateRange(DateOnly? from, DateOnly? to)
    {
        if (from is not null && to is not null && from > to)
        {
            throw new ArgumentException("The start date must not be later than the end date.", nameof(from));
        }

        DateFrom = from;
        DateTo = to;
    }

    /// <summary>Changes the start and moves an older end forward to keep the range valid.</summary>
    public void SelectDateFrom(DateOnly? from)
    {
        DateFrom = from;
        if (from is not null && DateTo is not null && DateTo < from)
        {
            DateTo = from;
        }
    }

    /// <summary>Changes the end and moves a newer start back to keep the range valid.</summary>
    public void SelectDateTo(DateOnly? to)
    {
        DateTo = to;
        if (to is not null && DateFrom is not null && DateFrom > to)
        {
            DateFrom = to;
        }
    }

    /// <summary>The class of a session, with the unknown case named rather than blank.</summary>
    public static string ClassOf(CorpusSession session)
    {
        ArgumentNullException.ThrowIfNull(session);
        return session.Context.CarClass is { Length: > 0 } carClass ? carClass : UnspecifiedClass;
    }

    /// <summary>
    /// Keeps the catalog's canonical full name while giving the picker a compact, readable badge.
    /// Unknown model-emitted classes retain their full catalog name and get a deterministic badge
    /// derived from their identity rather than being relabeled as a known class.
    /// </summary>
    public static AnalysisCarClassDisplay DisplayClass(GameCarClass option)
    {
        ArgumentNullException.ThrowIfNull(option);
        var abbreviation = option.Id switch
        {
            "Hypercar" => "HYP",
            _ => AbbreviationFromIdentity(option.Id),
        };
        return new AnalysisCarClassDisplay(option.Id, abbreviation, option.Name, option.VisualRole);
    }

    /// <summary>How a day reads in the filter. Yesterday is how a driver names it.</summary>
    public static string DayLabel(DateOnly day, DateOnly today) => (today.DayNumber - day.DayNumber) switch
    {
        0 => "Today",
        1 => "Yesterday",
        _ => day.ToString("ddd d MMM", CultureInfo.InvariantCulture),
    };

    // A single class is not a question; answer it and move on. Same for the car under it, which
    // is exactly the "if there is only one, preselect it" the driver asked for.
    private void CascadeClass()
    {
        var classes = Classes;
        if (classes.Count == 1)
        {
            CarClass = classes[0];
        }

        CascadeCarModel();
    }

    private void CascadeCarModel()
    {
        if (CarClass is null)
        {
            return;
        }

        var models = CarModels;
        if (models.Count == 1)
        {
            CarModel = models[0];
        }
    }

    private IEnumerable<CorpusSession> Matching(
        bool game = false,
        bool track = false,
        bool carClass = false,
        bool carModel = false,
        bool day = false)
    {
        var query = _all.AsEnumerable();
        if (game && Game is not null)
        {
            query = query.Where(session =>
                string.Equals(session.Context.Game, Game, StringComparison.Ordinal));
        }

        if (track && Track is not null)
        {
            query = query.Where(session =>
                string.Equals(session.Context.TrackCourse, Track, StringComparison.Ordinal));
        }

        if (carClass && CarClass is not null)
        {
            query = query.Where(session => string.Equals(
                GameCarClassCatalog.CanonicalId(Game, ClassOf(session)),
                CarClass,
                StringComparison.Ordinal));
        }

        if (carModel && CarModel is not null)
        {
            query = query.Where(session =>
                string.Equals(session.Context.CarModel, CarModel, StringComparison.Ordinal));
        }

        if (day && DateFrom is { } from)
        {
            query = query.Where(session => session.Day >= from);
        }

        if (day && DateTo is { } to)
        {
            query = query.Where(session => session.Day <= to);
        }

        return query;
    }

    private void ClearDateRange()
    {
        DateFrom = null;
        DateTo = null;
    }

    private static string AbbreviationFromIdentity(string identity)
    {
        var parts = identity
            .Split(['_', '-', ' '], StringSplitOptions.RemoveEmptyEntries)
            .Select(part => part.ToUpperInvariant())
            .ToArray();
        if (parts.Length == 0)
        {
            return "CLASS";
        }

        if (parts.Length == 1)
        {
            return parts[0];
        }

        return $"{parts[0]}-{string.Concat(parts.Skip(1).Select(part => part[0]))}";
    }
}

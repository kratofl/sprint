using System.Globalization;
using Sprint.Desktop.Features.SessionPlanning;
using Sprint.Games;

namespace Sprint.Desktop.Features.Analysis;

/// <summary>
/// One recorded session as the picker lists it: enough to recognise "the one I drove yesterday
/// evening" without loading a single lap.
/// </summary>
/// <param name="Runs">How many drives out of the garage its laps came from; 0 when they do not say.</param>
public sealed record CorpusSession(
    string Id,
    LapHistoryContext Context,
    HistorySessionKind Kind,
    LapHistoryOrigin Origin,
    DateTimeOffset StartedAt,
    int LapCount,
    int TracedLapCount,
    double? BestLapSeconds,
    string? SharedFrom,
    int Runs = 0)
{
    /// <summary>The local day this session was driven on, which is how a driver remembers it.</summary>
    public DateOnly Day => DateOnly.FromDateTime(this.StartedAt.ToLocalTime().DateTime);

    /// <summary>"Practice · 19:04" — the kind and the time, because that is what is recalled.</summary>
    public string Label => this.SharedFrom is { Length: > 0 } from
        ? $"Shared by {from}"
        : $"{this.Kind} · {this.StartedAt.ToLocalTime().ToString("HH:mm", CultureInfo.InvariantCulture)}";

    public string Detail
    {
        get
        {
            string laps = this.LapCount == 1 ? "1 lap" : $"{this.LapCount} laps";
            return this.BestLapSeconds is { } best
                ? $"{laps} · best {PlanTargetResolver.FormatLapTime(best)}"
                : laps;
        }
    }

    /// <summary>Whether any lap here can be overlaid channel by channel.</summary>
    public bool HasChannels => this.TracedLapCount > 0;
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
        this._all = sessions ?? throw new ArgumentNullException(nameof(sessions));
        if (this.Games.Count == 1)
        {
            this.SelectGame(this.Games[0]);
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
    public DateOnly? Day => this.DateFrom == this.DateTo ? this.DateFrom : null;

    /// <summary>Games in the corpus, most recently driven first.</summary>
    public IReadOnlyList<string> Games =>
        [.. this._all
            .GroupBy(session => session.Context.Game, StringComparer.Ordinal)
            .OrderByDescending(group => group.Max(session => session.StartedAt))
            .Select(group => group.Key)];

    /// <summary>Tracks for the selected game, most recently driven first.</summary>
    public IReadOnlyList<string> Tracks =>
        [.. this.Matching(game: true)
            .GroupBy(session => session.Context.TrackCourse, StringComparer.Ordinal)
            .OrderByDescending(group => group.Max(session => session.StartedAt))
            .Select(group => group.Key)];

    /// <summary>Circuits for the selected game, most recently driven first.</summary>
    public IReadOnlyList<GameCircuit> Circuits => GameTrackCatalog.Circuits(this.Game, this.Tracks);

    /// <summary>The layouts of the selected circuit, in catalog order.</summary>
    public IReadOnlyList<GameTrackLayout> Layouts =>
        this.Circuit is null
            ? []
            : this.Circuits
                .FirstOrDefault(circuit => string.Equals(circuit.Id, this.Circuit, StringComparison.Ordinal))
                ?.Layouts
              ?? [];

    /// <summary>Whether the chosen circuit still leaves a layout to pick.</summary>
    public bool LayoutIsAChoice => this.Layouts.Count > 1;

    /// <summary>Canonical car classes at the selected track.</summary>
    public IReadOnlyList<string> Classes =>
        [.. this.Matching(game: true, track: true)
            .Select(session => GameCarClassCatalog.CanonicalId(this.Game, ClassOf(session)))
            .Distinct(StringComparer.Ordinal)
            .Order(StringComparer.Ordinal)];

    /// <summary>
    /// Every class the selected game knows, including unavailable classes that help explain why
    /// a track choice narrowed the next step.
    /// </summary>
    public IReadOnlyList<GameCarClass> ClassOptions => GameCarClassCatalog.Classes(
        this.Game,
        this.Matching(game: true).Select(ClassOf));

    /// <summary>Car models in the selected track and class.</summary>
    public IReadOnlyList<string> CarModels =>
        [.. this.Matching(game: true, track: true, carClass: true)
            .Select(session => session.Context.CarModel)
            .Distinct(StringComparer.Ordinal)
            .Order(StringComparer.Ordinal)];

    /// <summary>Days that have a session for the selected track, class and car — newest first.</summary>
    public IReadOnlyList<DateOnly> Days =>
        [.. this.Matching(game: true, track: true, carClass: true, carModel: true)
            .Select(session => session.Day)
            .Distinct()
            .OrderDescending()];

    /// <summary>The sessions that survive every filter, newest first.</summary>
    public IReadOnlyList<CorpusSession> Sessions =>
        [.. this.Matching(game: true, track: true, carClass: true, carModel: true, day: true)
            .OrderByDescending(session => session.StartedAt)];

    /// <summary>Whether the corpus holds nothing at all.</summary>
    public bool IsEmpty => this._all.Count == 0;

    /// <summary>
    /// How many sessions were driven on one exact layout, so choosing between a circuit's layouts
    /// is a choice between things of known size.
    /// </summary>
    public int SessionsOnLayout(string trackName)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(trackName);
        return this.Matching(game: true).Count(session =>
            string.Equals(session.Context.TrackCourse, trackName, StringComparison.Ordinal));
    }

    /// <summary>
    /// Whether a step still has a real choice in it. A step with one answer is not a question,
    /// so the view does not draw it.
    /// </summary>
    public bool ClassIsAChoice => this.Classes.Count > 1;

    public bool CarModelIsAChoice => this.CarModels.Count > 1;

    public void SelectGame(string? game)
    {
        this.Game = game;
        this.Circuit = null;
        this.Track = null;
        this.CarClass = null;
        this.CarModel = null;
        this.ClearDateRange();

        IReadOnlyList<GameCircuit> circuits = this.Circuits;
        if (circuits.Count == 1)
        {
            this.SelectCircuit(circuits[0].Id);
        }
    }

    /// <summary>
    /// Chooses a place. A circuit with one layout answers the layout question too; one with
    /// several leaves it open, because guessing which layout was meant is worse than asking.
    /// </summary>
    public void SelectCircuit(string? circuitId)
    {
        this.Circuit = circuitId;
        this.Track = null;
        this.CarClass = null;
        this.CarModel = null;
        this.ClearDateRange();

        IReadOnlyList<GameTrackLayout> layouts = this.Layouts;
        if (layouts.Count == 1)
        {
            this.Track = layouts[0].TrackName;
            this.CascadeClass();
        }
    }

    public void SelectTrack(string? track)
    {
        this.Track = track;
        this.Circuit = track is null ? null : GameTrackCatalog.CircuitId(this.Game, track);
        // Everything downstream belonged to the old track.
        this.CarClass = null;
        this.CarModel = null;
        this.ClearDateRange();
        this.CascadeClass();
    }

    public void SelectClass(string? carClass)
    {
        this.CarClass = carClass is null ? null : GameCarClassCatalog.CanonicalId(this.Game, carClass);
        this.CarModel = null;
        this.ClearDateRange();
        this.CascadeCarModel();
    }

    public void SelectCarModel(string? carModel)
    {
        this.CarModel = carModel;
        this.ClearDateRange();
    }

    /// <summary>Sets or clears one exact day while preserving the existing controller API.</summary>
    public void SelectDay(DateOnly? day) => this.SelectDateRange(day, day);

    /// <summary>Sets an inclusive, optionally open-ended date range.</summary>
    public void SelectDateRange(DateOnly? from, DateOnly? to)
    {
        if (from is not null && to is not null && from > to)
        {
            throw new ArgumentException("The start date must not be later than the end date.", nameof(from));
        }

        this.DateFrom = from;
        this.DateTo = to;
    }

    /// <summary>Changes the start and moves an older end forward to keep the range valid.</summary>
    public void SelectDateFrom(DateOnly? from)
    {
        this.DateFrom = from;
        if (from is not null && this.DateTo is not null && this.DateTo < from)
        {
            this.DateTo = from;
        }
    }

    /// <summary>Changes the end and moves a newer start back to keep the range valid.</summary>
    public void SelectDateTo(DateOnly? to)
    {
        this.DateTo = to;
        if (to is not null && this.DateFrom is not null && this.DateFrom > to)
        {
            this.DateFrom = to;
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
        string abbreviation = option.Id switch
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
        IReadOnlyList<string> classes = this.Classes;
        if (classes.Count == 1)
        {
            this.CarClass = classes[0];
        }

        this.CascadeCarModel();
    }

    private void CascadeCarModel()
    {
        if (this.CarClass is null)
        {
            return;
        }

        IReadOnlyList<string> models = this.CarModels;
        if (models.Count == 1)
        {
            this.CarModel = models[0];
        }
    }

    private IEnumerable<CorpusSession> Matching(
        bool game = false,
        bool track = false,
        bool carClass = false,
        bool carModel = false,
        bool day = false)
    {
        IEnumerable<CorpusSession> query = this._all.AsEnumerable();
        if (game && this.Game is not null)
        {
            query = query.Where(session =>
                string.Equals(session.Context.Game, this.Game, StringComparison.Ordinal));
        }

        if (track && this.Track is not null)
        {
            query = query.Where(session =>
                string.Equals(session.Context.TrackCourse, this.Track, StringComparison.Ordinal));
        }

        if (carClass && this.CarClass is not null)
        {
            query = query.Where(session => string.Equals(
                GameCarClassCatalog.CanonicalId(this.Game, ClassOf(session)),
                this.CarClass,
                StringComparison.Ordinal));
        }

        if (carModel && this.CarModel is not null)
        {
            query = query.Where(session =>
                string.Equals(session.Context.CarModel, this.CarModel, StringComparison.Ordinal));
        }

        if (day && this.DateFrom is { } from)
        {
            query = query.Where(session => session.Day >= from);
        }

        if (day && this.DateTo is { } to)
        {
            query = query.Where(session => session.Day <= to);
        }

        return query;
    }

    private void ClearDateRange()
    {
        this.DateFrom = null;
        this.DateTo = null;
    }

    private static string AbbreviationFromIdentity(string identity)
    {
        string[] parts = identity
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

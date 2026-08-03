using System.Globalization;
using Sprint.Desktop.Features.SessionPlanning;

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

/// <summary>
/// Narrowing the corpus down to one session (#196).
/// <para>
/// A flat list of every lap is unusable once a driver has real mileage — hundreds of rows with
/// nothing to steer by. This narrows the way a driver actually remembers a session: which track,
/// then which class, then which car, then optionally which day. A step with one answer is
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
        SelectTrack(Tracks.FirstOrDefault());
    }

    public string? Track { get; private set; }

    public string? CarClass { get; private set; }

    public string? CarModel { get; private set; }

    /// <summary>The optional day filter. Null means every day.</summary>
    public DateOnly? Day { get; private set; }

    /// <summary>Tracks in the corpus, most recently driven first.</summary>
    public IReadOnlyList<string> Tracks =>
        [.. _all
            .GroupBy(session => session.Context.TrackCourse, StringComparer.Ordinal)
            .OrderByDescending(group => group.Max(session => session.StartedAt))
            .Select(group => group.Key)];

    /// <summary>Car classes at the selected track.</summary>
    public IReadOnlyList<string> Classes =>
        [.. Matching(track: true)
            .Select(ClassOf)
            .Distinct(StringComparer.Ordinal)
            .Order(StringComparer.Ordinal)];

    /// <summary>Car models in the selected track and class.</summary>
    public IReadOnlyList<string> CarModels =>
        [.. Matching(track: true, carClass: true)
            .Select(session => session.Context.CarModel)
            .Distinct(StringComparer.Ordinal)
            .Order(StringComparer.Ordinal)];

    /// <summary>Days that have a session for the selected track, class and car — newest first.</summary>
    public IReadOnlyList<DateOnly> Days =>
        [.. Matching(track: true, carClass: true, carModel: true)
            .Select(session => session.Day)
            .Distinct()
            .OrderDescending()];

    /// <summary>The sessions that survive every filter, newest first.</summary>
    public IReadOnlyList<CorpusSession> Sessions =>
        [.. Matching(track: true, carClass: true, carModel: true, day: true)
            .OrderByDescending(session => session.StartedAt)];

    /// <summary>Whether the corpus holds nothing at all.</summary>
    public bool IsEmpty => _all.Count == 0;

    /// <summary>
    /// Whether a step still has a real choice in it. A step with one answer is not a question,
    /// so the view does not draw it.
    /// </summary>
    public bool ClassIsAChoice => Classes.Count > 1;

    public bool CarModelIsAChoice => CarModels.Count > 1;

    public void SelectTrack(string? track)
    {
        Track = track;
        // Everything downstream belonged to the old track.
        CarClass = null;
        CarModel = null;
        Day = null;
        CascadeClass();
    }

    public void SelectClass(string? carClass)
    {
        CarClass = carClass;
        CarModel = null;
        Day = null;
        CascadeCarModel();
    }

    public void SelectCarModel(string? carModel)
    {
        CarModel = carModel;
        Day = null;
    }

    /// <summary>Sets or clears the optional day filter.</summary>
    public void SelectDay(DateOnly? day) => Day = day;

    /// <summary>The class of a session, with the unknown case named rather than blank.</summary>
    public static string ClassOf(CorpusSession session)
    {
        ArgumentNullException.ThrowIfNull(session);
        return session.Context.CarClass is { Length: > 0 } carClass ? carClass : UnspecifiedClass;
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
        bool track = false,
        bool carClass = false,
        bool carModel = false,
        bool day = false)
    {
        var query = _all.AsEnumerable();
        if (track && Track is not null)
        {
            query = query.Where(session =>
                string.Equals(session.Context.TrackCourse, Track, StringComparison.Ordinal));
        }

        if (carClass && CarClass is not null)
        {
            query = query.Where(session => string.Equals(ClassOf(session), CarClass, StringComparison.Ordinal));
        }

        if (carModel && CarModel is not null)
        {
            query = query.Where(session =>
                string.Equals(session.Context.CarModel, CarModel, StringComparison.Ordinal));
        }

        if (day && Day is { } selected)
        {
            query = query.Where(session => session.Day == selected);
        }

        return query;
    }
}

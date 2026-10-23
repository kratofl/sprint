using System.Globalization;
using Sprint.Desktop.Features.Analysis;
using Sprint.Desktop.Features.SessionPlanning;
using Sprint.Desktop.Runtime;

namespace Sprint.Desktop.Features.LiveCompare;

/// <summary>A track layout driven in one car — the set of laps it makes sense to train against.</summary>
public sealed record LiveCompareCourse(string Game, string TrackCourse, string CarModel)
{
    public static LiveCompareCourse Of(LapHistoryContext context) => new(context.Game, context.TrackCourse, context.CarModel);
}

/// <summary>What the On track page shows: the courses, the laps on the chosen one, the target and the HUD.</summary>
/// <param name="LapCount">Every valid lap on the course; <see cref="Laps"/> holds the fastest of them.</param>
public sealed record LiveCompareState(
    IReadOnlyList<LiveCompareCourse> Courses,
    LiveCompareCourse? Course,
    IReadOnlyList<CorpusLap> Laps,
    int LapCount,
    LiveCompareTarget? Target,
    bool HudOpen);

/// <summary>
/// Training against an older lap (#195): which lap the HUD chases, and whether the HUD is up.
/// The rolling window itself is <see cref="LiveCompareController"/>; this is the part the
/// commands and the On track page drive.
/// <para>
/// The course the page lists defaults to the one being driven, then to the newest one with a
/// trace, so opening the page in the car shows this track's laps without a single click.
/// </para>
/// </summary>
public sealed class LiveCompareService
{
    /// <summary>How many laps the picker lists. The fastest ones; any other lap is a click away in Analysis.</summary>
    public const int ListedLaps = 30;

    private readonly object _gate = new();
    private readonly LapCorpusBrowser _browser;
    private readonly Func<LapHistoryContext?> _liveContext;

    private LiveCompareCourse? _course;
    private bool _hudOpen;

    /// <param name="liveContext">The course being driven right now, or null out of the game.</param>
    public LiveCompareService(LapCorpusBrowser browser, Func<LapHistoryContext?> liveContext)
    {
        this._browser = browser ?? throw new ArgumentNullException(nameof(browser));
        this._liveContext = liveContext ?? throw new ArgumentNullException(nameof(liveContext));
    }

    public LiveCompareController Controller { get; } = new();

    public bool HudOpen
    {
        get { lock (this._gate) { return this._hudOpen; } }
    }

    /// <summary>Applies the driver's HUD preferences: which charts a snapshot carries, and the window around the car.</summary>
    public void Configure(LiveCompareSettings settings)
    {
        ArgumentNullException.ThrowIfNull(settings);
        this.Controller.Panels = HudWindowPlan.Panels(HudWindowPlan.Build(settings));
        this.Controller.MetersBehind = settings.MetersBehind;
        this.Controller.MetersAhead = settings.MetersAhead;
    }

    public LiveCompareState State()
    {
        List<LiveCompareCourse> courses = [.. this._browser.Sessions()
            .Where(session => session.TracedLapCount > 0)
            .Select(session => LiveCompareCourse.Of(session.Context))
            .Distinct()];
        LiveCompareCourse? live = this._liveContext() is { } context ? LiveCompareCourse.Of(context) : null;
        if (live is not null && !courses.Contains(live))
        {
            courses.Insert(0, live);
        }

        LiveCompareCourse? course;
        bool hudOpen;
        lock (this._gate)
        {
            course = this._course ?? live ?? courses.FirstOrDefault();
            hudOpen = this._hudOpen;
        }

        IReadOnlyList<CorpusLap> laps = course is null
            ? []
            : this._browser.LapsOn(course.Game, course.TrackCourse, course.CarModel);

        return new LiveCompareState(
            courses,
            course,
            [.. laps.Take(ListedLaps)],
            laps.Count,
            this.Controller.Target,
            hudOpen);
    }

    /// <summary>Lists another course's laps. Null goes back to following the car.</summary>
    public void SelectCourse(LiveCompareCourse? course)
    {
        lock (this._gate)
        {
            this._course = course;
        }
    }

    /// <summary>
    /// Trains against a lap. Refused for a lap without channels: the HUD draws the target's
    /// traces, and a lap time alone has nothing to draw.
    /// </summary>
    public bool SetTarget(string sessionId, int lapNumber, out string error)
    {
        error = "";
        CorpusLap? lap = this._browser.Find(sessionId, lapNumber);
        if (lap is null)
        {
            error = "That lap is no longer in your laps.";
            return false;
        }

        if (!lap.HasChannels || this._browser.Trace(lap) is not { IsUsable: true } trace)
        {
            error = lap.UnavailableReason ?? "That lap's channels could not be read.";
            return false;
        }

        this.Controller.SetTarget(
            new LiveCompareTarget(lap.SessionId, lap.LapNumber, TargetLabel(lap), lap.LapTimeSeconds, lap.Context),
            trace);
        lock (this._gate)
        {
            // The page follows the target, so a lap picked in Analysis shows up selected here.
            this._course = LiveCompareCourse.Of(lap.Context);
        }

        return true;
    }

    /// <summary>Drops the target. The HUD closes with it: there is nothing left for it to draw.</summary>
    public void ClearTarget()
    {
        this.Controller.SetTarget(null, null);
        lock (this._gate)
        {
            this._hudOpen = false;
        }
    }

    /// <summary>Shows or hides the HUD. Showing it needs a target — an overlay of nothing is not training.</summary>
    public bool SetHudOpen(bool open, out string error)
    {
        error = "";
        if (open && !this.Controller.HasTarget)
        {
            error = "Pick a lap to train against first.";
            return false;
        }

        lock (this._gate)
        {
            this._hudOpen = open;
        }

        return true;
    }

    /// <summary>"2:05.263 · Lap 5, Sep 28" — what the delta window says it is chasing.</summary>
    private static string TargetLabel(CorpusLap lap)
    {
        string time = PlanTargetResolver.FormatLapTime(lap.LapTimeSeconds);
        if (lap.SharedFrom is { Length: > 0 } from)
        {
            return $"{time} · {from}";
        }

        return lap.SessionStartedAt is { } started
            ? $"{time} · Lap {lap.LapNumber}, {started.ToLocalTime().ToString("MMM d", CultureInfo.InvariantCulture)}"
            : $"{time} · Lap {lap.LapNumber}";
    }
}

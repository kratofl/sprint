using Sprint.Desktop.Features.Charts;
using Sprint.Desktop.Features.SessionPlanning;

namespace Sprint.Desktop.Features.Analysis;

/// <summary>
/// What the Analysis page shows right now: the picked laps, the stack, and anything the driver
/// needs told rather than left to infer.
/// </summary>
public sealed record AnalysisState(
    LapCorpusFilter Filter,
    CorpusSession? Session,
    IReadOnlyList<CorpusLap> Laps,
    CorpusLap? Primary,
    CorpusLap? Comparison,
    ChartStack? Stack,
    string? Notice);

/// <summary>
/// The Analysis view's state machine (#196), free of Avalonia so every selection rule is a unit
/// test. Also the home of the Live Compare target picker, because "which lap" is one question
/// and this is where the corpus is already on screen.
/// </summary>
public sealed class AnalysisController
{
    private readonly LapCorpusBrowser _browser;

    private LapCorpusFilter _filter;
    private CorpusSession? _session;
    private CorpusLap? _primary;
    private CorpusLap? _comparison;
    private LapChannelTrace? _primaryTrace;
    private LapChannelTrace? _comparisonTrace;

    public AnalysisController(LapCorpusBrowser browser)
    {
        _browser = browser ?? throw new ArgumentNullException(nameof(browser));
        _filter = new LapCorpusFilter(_browser.Sessions());
    }

    /// <summary>The narrowing cascade: track, class, car, optionally day.</summary>
    public LapCorpusFilter Filter => _filter;

    public IReadOnlyList<LapChartPanelSpec> Panels { get; set; } = LapChartPanels.AnalysisDefaults;

    public event EventHandler? Changed;

    /// <summary>
    /// Re-reads the corpus and lands on the most recent session, which is the one a driver has
    /// just finished and most often wants to look at.
    /// </summary>
    public AnalysisState Load()
    {
        var sessions = _browser.Sessions();
        var previousTrack = _filter.Track;
        var previousSessionId = _session?.Id;

        _filter = new LapCorpusFilter(sessions);
        if (previousTrack is not null && _filter.Tracks.Contains(previousTrack, StringComparer.Ordinal))
        {
            _filter.SelectTrack(previousTrack);
        }

        // Keep the driver where they were if that session still matches the filter; otherwise
        // the newest one, so opening the page after a session shows that session.
        _session = _filter.Sessions.FirstOrDefault(candidate => candidate.Id == previousSessionId)
            ?? _filter.Sessions.FirstOrDefault();

        return State();
    }

    /// <summary>Narrows to a track. Lap choices do not survive: they belong to the old track.</summary>
    public void SelectTrack(string? track)
    {
        _filter.SelectTrack(track);
        ClearLaps();
        SnapToNewestSession();
        Changed?.Invoke(this, EventArgs.Empty);
    }

    public void SelectClass(string? carClass)
    {
        _filter.SelectClass(carClass);
        SnapToNewestSession();
        Changed?.Invoke(this, EventArgs.Empty);
    }

    public void SelectCarModel(string? carModel)
    {
        _filter.SelectCarModel(carModel);
        SnapToNewestSession();
        Changed?.Invoke(this, EventArgs.Empty);
    }

    /// <summary>Sets or clears the optional day filter — "the run I did yesterday evening".</summary>
    public void SelectDay(DateOnly? day)
    {
        _filter.SelectDay(day);
        SnapToNewestSession();
        Changed?.Invoke(this, EventArgs.Empty);
    }

    /// <summary>
    /// Opens one session's laps.
    /// <para>
    /// Lap choices deliberately survive this. Picking A in one session and B in another is how a
    /// driver compares tonight's lap against their best ever, and it needs no extra UI — only
    /// changing track clears them, because laps from two tracks cannot be overlaid.
    /// </para>
    /// </summary>
    public void SelectSession(CorpusSession? session)
    {
        _session = session;
        Changed?.Invoke(this, EventArgs.Empty);
    }

    /// <summary>
    /// Picks the ember lap. Selecting the lap already in the comparison slot swaps them rather
    /// than showing one lap against itself.
    /// </summary>
    public void SelectPrimary(CorpusLap? lap)
    {
        if (lap is not null && Same(lap, _comparison))
        {
            _comparison = _primary;
            _comparisonTrace = _primaryTrace;
        }

        _primary = lap;
        _primaryTrace = _browser.Trace(lap);
        Changed?.Invoke(this, EventArgs.Empty);
    }

    /// <summary>Picks the blue lap, or clears it by passing the lap already selected.</summary>
    public void SelectComparison(CorpusLap? lap)
    {
        if (lap is not null && Same(lap, _comparison))
        {
            lap = null;
        }
        else if (lap is not null && Same(lap, _primary))
        {
            _primary = null;
            _primaryTrace = null;
        }

        _comparison = lap;
        _comparisonTrace = _browser.Trace(lap);
        Changed?.Invoke(this, EventArgs.Empty);
    }

    public AnalysisState State()
    {
        var laps = _browser.Laps(_session);

        return new AnalysisState(
            _filter,
            _session,
            laps,
            _primary,
            _comparison,
            BuildStack(),
            Notice(laps));
    }

    private void ClearLaps()
    {
        _primary = null;
        _comparison = null;
        _primaryTrace = null;
        _comparisonTrace = null;
    }

    // After any narrowing, land on the newest session that still matches rather than leaving the
    // page pointed at one the filter has just excluded.
    private void SnapToNewestSession()
    {
        if (_session is null || !_filter.Sessions.Any(candidate => candidate.Id == _session.Id))
        {
            _session = _filter.Sessions.FirstOrDefault();
        }
    }

    private ChartStack? BuildStack()
    {
        var sources = new List<LapTraceSeriesSource>();
        if (_primary is not null && _primaryTrace is { IsUsable: true })
        {
            sources.Add(Source(_primary, _primaryTrace, ChartSeriesRole.Current));
        }

        if (_comparison is not null && _comparisonTrace is { IsUsable: true })
        {
            sources.Add(Source(_comparison, _comparisonTrace, ChartSeriesRole.Comparison));
        }

        if (sources.Count == 0)
        {
            return null;
        }

        // A whole lap is read as a fraction of the track, not in metres: the question here is
        // "where in the lap", and the axis has to cover a whole one. Distance is the HUD's
        // local question, over a few hundred metres.
        return LapTraceCharts.Build(Panels, ChartDomain.TrackPosition(), sources);
    }

    private static LapTraceSeriesSource Source(CorpusLap lap, LapChannelTrace trace, ChartSeriesRole role) =>
        new(
            trace,
            trace.TrackLengthMeters ?? lap.Context.TrackLengthMeters ?? LapChannelTrace.FallbackTrackLengthMeters,
            $"Lap {lap.LapNumber}",
            role);

    /// <summary>
    /// The one thing the driver most needs told. Never a list: a page that stacks three
    /// advisories teaches people to ignore all of them.
    /// </summary>
    private string? Notice(IReadOnlyList<CorpusLap> laps)
    {
        if (_filter.IsEmpty)
        {
            return "No laps recorded yet. Drive a session, or import one, and it will appear here.";
        }

        if (_filter.Sessions.Count == 0)
        {
            return "No sessions match this filter.";
        }

        if (laps.Count == 0)
        {
            return "That session has no valid laps.";
        }

        if (_primary is null && _comparison is null)
        {
            return laps.Any(lap => lap.HasChannels)
                ? "Pick a lap to see how it was driven, and a second to overlay it."
                : "These laps carry lap times only. Laps recorded from now on will carry channels.";
        }

        if (_primary is { HasChannels: false })
        {
            return _primary.UnavailableReason;
        }

        if (_comparison is { HasChannels: false })
        {
            return _comparison.UnavailableReason;
        }

        // Both laps drawn, but not on the same set of channels — say which, rather than let a
        // panel look empty for a reason the driver has to guess.
        if (_primaryTrace is not null && _comparisonTrace is not null)
        {
            var missing = _primaryTrace.Channels.Keys
                .Union(_comparisonTrace.Channels.Keys, StringComparer.Ordinal)
                .Except(LapCorpusBrowser.SharedChannels(_primaryTrace, _comparisonTrace), StringComparer.Ordinal)
                .ToList();

            if (missing.Count > 0)
            {
                return $"Only one lap carries: {string.Join(", ", missing.Order(StringComparer.Ordinal))}.";
            }
        }

        return null;
    }

    private static bool Same(CorpusLap? left, CorpusLap? right) =>
        left is not null
        && right is not null
        && left.SessionId == right.SessionId
        && left.LapNumber == right.LapNumber;
}

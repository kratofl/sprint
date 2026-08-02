using Sprint.Desktop.Features.Charts;
using Sprint.Desktop.Features.SessionPlanning;

namespace Sprint.Desktop.Features.Analysis;

/// <summary>
/// What the Analysis page shows right now: the picked laps, the stack, and anything the driver
/// needs told rather than left to infer.
/// </summary>
public sealed record AnalysisState(
    IReadOnlyList<LapHistoryContext> Contexts,
    LapHistoryContext? Context,
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

    private LapHistoryContext? _context;
    private CorpusLap? _primary;
    private CorpusLap? _comparison;
    private LapChannelTrace? _primaryTrace;
    private LapChannelTrace? _comparisonTrace;

    public AnalysisController(LapCorpusBrowser browser) =>
        _browser = browser ?? throw new ArgumentNullException(nameof(browser));

    public IReadOnlyList<LapChartPanelSpec> Panels { get; set; } = LapChartPanels.AnalysisDefaults;

    public event EventHandler? Changed;

    /// <summary>Reads the corpus and picks a sensible starting point.</summary>
    public AnalysisState Load()
    {
        var contexts = _browser.Contexts();
        if (_context is null || !contexts.Any(Same))
        {
            SelectContext(contexts.FirstOrDefault(), notify: false);
        }

        return State(contexts);
    }

    /// <summary>Switches bucket. Lap choices do not survive: they belong to the old track.</summary>
    public void SelectContext(LapHistoryContext? context, bool notify = true)
    {
        _context = context;
        _primary = null;
        _comparison = null;
        _primaryTrace = null;
        _comparisonTrace = null;

        if (notify)
        {
            Changed?.Invoke(this, EventArgs.Empty);
        }
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

    public AnalysisState State() => State(_browser.Contexts());

    private AnalysisState State(IReadOnlyList<LapHistoryContext> contexts)
    {
        var laps = _context is null ? [] : _browser.Laps(_context);

        return new AnalysisState(
            contexts,
            _context,
            laps,
            _primary,
            _comparison,
            BuildStack(),
            Notice(contexts, laps));
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
    private string? Notice(IReadOnlyList<LapHistoryContext> contexts, IReadOnlyList<CorpusLap> laps)
    {
        if (contexts.Count == 0)
        {
            return "No laps recorded yet. Drive a session, or import one, and it will appear here.";
        }

        if (laps.Count == 0)
        {
            return "No valid laps for this car and track yet.";
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

    private bool Same(LapHistoryContext context) =>
        _context is not null
        && context.Game == _context.Game
        && context.TrackCourse == _context.TrackCourse
        && context.CarModel == _context.CarModel;

    private static bool Same(CorpusLap? left, CorpusLap? right) =>
        left is not null
        && right is not null
        && left.SessionId == right.SessionId
        && left.LapNumber == right.LapNumber;
}

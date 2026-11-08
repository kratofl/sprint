using System.Diagnostics.CodeAnalysis;
using Sprint.Desktop.Features.Charts;
using Sprint.Desktop.Features.SessionPlanning;
using Sprint.Desktop.Features.Setup;

namespace Sprint.Desktop.Features.Analysis;

/// <summary>
/// One run of the open session: a drive out of the garage and back, so one setup throughout.
/// </summary>
/// <param name="Outing">The stored outing (<see cref="LapHistoryRecord.Outing"/>); 0 for a session that does not know its runs.</param>
/// <param name="Number">The run's place in the session, from 1, as the driver reads it.</param>
/// <param name="StartedAt">When the run's first listed lap began; null when no lap says when it ended.</param>
/// <param name="Setup">The setup the driver put on this run, or null when they have not.</param>
public sealed record CorpusRun(int Outing, int Number, int Laps, double BestLapSeconds, DateTimeOffset? StartedAt, RunSetup? Setup);

/// <summary>
/// What the Analysis page shows right now: the picked laps, the stack, and anything the driver
/// needs told rather than left to infer.
/// </summary>
/// <param name="Sessions">Every session in the corpus as it is now, newest first: the sessions list.</param>
/// <param name="CourseLaps">Every valid lap with the open session's car on its track, from any
/// session, fastest first: "your best here" and the laps compare can pick. Empty with no session open.</param>
public sealed record AnalysisState(
    LapCorpusFilter Filter,
    IReadOnlyList<CorpusSession> Sessions,
    CorpusSession? Session,
    IReadOnlyList<CorpusLap> Laps,
    IReadOnlyList<CorpusRun> Runs,
    IReadOnlyList<CorpusLap> CourseLaps,
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
    private readonly RunSetups? _runSetups;
    private readonly SetupLibrary? _setups;

    private LapCorpusFilter _filter;
    private CorpusSession? _session;
    private CorpusLap? _primary;
    private CorpusLap? _comparison;
    private LapChannelTrace? _primaryTrace;
    private LapChannelTrace? _comparisonTrace;

    /// <summary>
    /// Without <paramref name="runSetups"/> and <paramref name="setups"/> the runs list no setups
    /// and none can be put on them.
    /// </summary>
    public AnalysisController(LapCorpusBrowser browser, RunSetups? runSetups = null, SetupLibrary? setups = null)
    {
        this._browser = browser ?? throw new ArgumentNullException(nameof(browser));
        this._runSetups = runSetups;
        this._setups = setups;
        this._filter = new LapCorpusFilter(this._browser.Sessions());
    }

    /// <summary>The narrowing cascade: game, track, class, car, optionally day.</summary>
    public LapCorpusFilter Filter => _filter;

    public IReadOnlyList<LapChartPanelSpec> Panels { get; set; } = LapChartPanels.AnalysisDefaults;

    public event EventHandler? Changed;

    /// <summary>
    /// Re-reads the corpus while keeping an explicitly opened session. The page no longer
    /// guesses which run the driver meant: opening one is the first action in Analysis.
    /// </summary>
    public AnalysisState Load()
    {
        var sessions = _browser.Sessions();
        var previousGame = _filter.Game;
        var previousTrack = _filter.Track;
        var previousSessionId = _session?.Id;

        _filter = new LapCorpusFilter(sessions);
        if (previousGame is not null && _filter.Games.Contains(previousGame, StringComparer.Ordinal))
        {
            _filter.SelectGame(previousGame);
        }

        if (previousTrack is not null && _filter.Tracks.Contains(previousTrack, StringComparer.Ordinal))
        {
            _filter.SelectTrack(previousTrack);
        }

        // Keep an opened session if it still exists. Null stays null: the central Open session
        // action owns the initial choice instead of a left rail silently making one.
        _session = previousSessionId is null
            ? null
            : sessions.FirstOrDefault(candidate => candidate.Id == previousSessionId);

        return State();
    }

    /// <summary>
    /// A fresh modal filter. It is deliberately separate from the active session so closing
    /// the dialog cannot strand the page on a half-applied track or day selection.
    /// </summary>
    public LapCorpusFilter CreateSessionFilter()
    {
        var filter = new LapCorpusFilter(_browser.Sessions());
        if (_session is null)
        {
            return filter;
        }

        filter.SelectGame(_session.Context.Game);
        filter.SelectTrack(_session.Context.TrackCourse);
        filter.SelectClass(LapCorpusFilter.ClassOf(_session));
        filter.SelectCarModel(_session.Context.CarModel);
        filter.SelectDay(_session.Day);
        return filter;
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
        if (_session is not null
            && session is not null
            && (!string.Equals(_session.Context.Game, session.Context.Game, StringComparison.Ordinal)
                || !string.Equals(
                    _session.Context.TrackCourse,
                    session.Context.TrackCourse,
                    StringComparison.Ordinal)))
        {
            ClearLaps();
        }

        _session = session;
        if (session is not null)
        {
            _filter.SelectGame(session.Context.Game);
            _filter.SelectTrack(session.Context.TrackCourse);
            _filter.SelectClass(LapCorpusFilter.ClassOf(session));
            _filter.SelectCarModel(session.Context.CarModel);
            _filter.SelectDay(null);
        }

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

    /// <summary>
    /// One session of the whole corpus as it is now, or null when there is no such session. The
    /// sessions list shows every session live, so opening one never waits for a reload.
    /// </summary>
    public CorpusSession? FindSession(string id) =>
        this._browser.Sessions().FirstOrDefault(candidate => string.Equals(candidate.Id, id, StringComparison.Ordinal));

    public AnalysisState State()
    {
        IReadOnlyList<CorpusLap> laps = this._browser.Laps(this._session);
        IReadOnlyList<CorpusLap> courseLaps = this._session is { } session
            ? this._browser.LapsOn(session.Context.Game, session.Context.TrackCourse, session.Context.CarModel)
            : [];

        return new AnalysisState(
            this._filter,
            this._browser.Sessions(),
            this._session,
            laps,
            this.Runs(laps),
            courseLaps,
            this._primary,
            this._comparison,
            this.BuildStack(),
            this.Notice(laps));
    }

    /// <summary>
    /// Puts setup <paramref name="setupId"/> (a Setups list id) on one run of the open session, or
    /// takes the run's setup off with null. The version kept is the one the file held when the run
    /// started (<see cref="SetupLibrary.VersionAt"/>).
    /// </summary>
    public bool SetRunSetup(int outing, string? setupId, out string error)
    {
        error = "";
        if (this._session is not { } session)
        {
            error = "no session is open";
            return false;
        }

        if (this._runSetups is not { } runSetups || this._setups is not { } setups)
        {
            error = "setups cannot be put on runs here";
            return false;
        }

        CorpusRun? run = this.State().Runs.FirstOrDefault(candidate => candidate.Outing == outing);
        if (run is null)
        {
            error = "no such run in the open session";
            return false;
        }

        RunSetup? picked = null;
        if (setupId is not null)
        {
            picked = setups.VersionAt(setupId, run.StartedAt ?? session.StartedAt);
            if (picked is null)
            {
                error = "no such setup";
                return false;
            }
        }

        runSetups.Set(session.Id, outing, picked);
        this.Changed?.Invoke(this, EventArgs.Empty);
        return true;
    }

    /// <summary>
    /// Leaves a note at a place on a lap, any lap with a time (a friend's too: the note is yours,
    /// kept beside their lap). <paramref name="author"/> is the driver name in Settings.
    /// </summary>
    public bool AddNote(string sessionId, int lapNumber, double distanceMeters, string text, string author, out string error)
    {
        if (!this.NoteTarget(sessionId, lapNumber, out CorpusLap? lap, out LapNotes? notes, out error)
            || !ValidNoteText(text, out string clean, out error))
        {
            return false;
        }

        // A lap whose length the game never said was laid out on the fallback length.
        double length = lap.Context.TrackLengthMeters ?? LapChannelTrace.FallbackTrackLengthMeters;
        if (!double.IsFinite(distanceMeters) || distanceMeters < 0 || distanceMeters > length + 1)
        {
            error = "distanceMeters must be a place on the lap";
            return false;
        }

        notes.Add(sessionId, lapNumber, Math.Min(distanceMeters, length), clean, author.Trim());
        this.Changed?.Invoke(this, EventArgs.Empty);
        return true;
    }

    /// <summary>Rewrites one of the driver's own notes. A note that came with a shared lap is not theirs to change.</summary>
    public bool UpdateNote(string sessionId, int lapNumber, string noteId, string text, out string error)
    {
        if (!this.NoteTarget(sessionId, lapNumber, out CorpusLap? lap, out LapNotes? notes, out error)
            || !ValidNoteText(text, out string clean, out error)
            || !OwnNote(lap, noteId, out error))
        {
            return false;
        }

        notes.Update(sessionId, lapNumber, noteId, clean);
        this.Changed?.Invoke(this, EventArgs.Empty);
        return true;
    }

    /// <summary>Removes one of the driver's own notes.</summary>
    public bool DeleteNote(string sessionId, int lapNumber, string noteId, out string error)
    {
        if (!this.NoteTarget(sessionId, lapNumber, out CorpusLap? lap, out LapNotes? notes, out error)
            || !OwnNote(lap, noteId, out error))
        {
            return false;
        }

        notes.Delete(sessionId, lapNumber, noteId);
        this.Changed?.Invoke(this, EventArgs.Empty);
        return true;
    }

    private bool NoteTarget(
        string sessionId,
        int lapNumber,
        [NotNullWhen(true)] out CorpusLap? lap,
        [NotNullWhen(true)] out LapNotes? notes,
        out string error)
    {
        error = "";
        notes = this._browser.Notes;
        lap = this._browser.Find(sessionId, lapNumber);
        if (notes is null)
        {
            error = "notes cannot be kept here";
            return false;
        }

        if (lap is null)
        {
            error = "no such lap";
            return false;
        }

        return true;
    }

    private static bool ValidNoteText(string text, out string clean, out string error)
    {
        error = "";
        clean = text.Trim();
        if (clean.Length == 0)
        {
            error = "Write something first.";
            return false;
        }

        if (clean.Length > LapNote.MaxTextLength)
        {
            error = $"Keep a note under {LapNote.MaxTextLength} characters.";
            return false;
        }

        return true;
    }

    private static bool OwnNote(CorpusLap lap, string noteId, out string error)
    {
        error = "";
        CorpusLapNote? note = lap.Notes.FirstOrDefault(candidate => candidate.Id == noteId);
        if (note is null)
        {
            error = "no such note on that lap";
            return false;
        }

        if (!note.Mine)
        {
            error = "That note came with a shared lap; only its author can change it.";
            return false;
        }

        return true;
    }

    /// <summary>The open session's runs in the order they were driven, each with the setup put on it.</summary>
    private IReadOnlyList<CorpusRun> Runs(IReadOnlyList<CorpusLap> laps)
    {
        if (this._session is null || laps.Count == 0)
        {
            return [];
        }

        IReadOnlyDictionary<int, RunSetup> picked = this._runSetups?.For(this._session.Id) ?? new Dictionary<int, RunSetup>();
        return
        [
            .. laps
                .GroupBy(lap => lap.Outing)
                .OrderBy(group => group.Key)
                .Select((group, index) => new CorpusRun(
                    group.Key,
                    index + 1,
                    group.Count(),
                    group.Min(lap => lap.LapTimeSeconds),
                    StartOf(group),
                    picked.GetValueOrDefault(group.Key)))
        ];
    }

    /// <summary>When the earliest of these laps began: its end less its time. Null when none says when it ended.</summary>
    private static DateTimeOffset? StartOf(IEnumerable<CorpusLap> laps)
    {
        DateTimeOffset? start = null;
        foreach (CorpusLap lap in laps)
        {
            if (lap.CompletedAt is { } completed)
            {
                DateTimeOffset began = completed.AddSeconds(-lap.LapTimeSeconds);
                start = start is { } earlier && earlier <= began ? earlier : began;
            }
        }

        return start;
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

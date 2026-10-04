using Sprint.Desktop.Api.Telemetry;

namespace Sprint.Desktop.Features.Live;

/// <summary>
/// A reference lap handed to <see cref="DeltaTracker"/> from outside the session — a lap
/// the driver chose to be measured against rather than one this session produced. Stated
/// as a uniform position→time curve (time at index <c>i</c> is the elapsed lap time at
/// track position <c>i * PositionStep</c>), which is the shape the lap-history corpus
/// stores.
/// </summary>
/// <remarks>
/// Deliberately a plain telemetry-side value: the tracker never learns what a plan or a
/// history record is, so the planner can be replaced without touching the delta path.
/// </remarks>
public sealed record DeltaReference
{
    /// <summary>Sampling interval as a fraction of a lap. Must be greater than zero.</summary>
    public required double PositionStep { get; init; }

    /// <summary>Elapsed lap time at each sampled position, from the line onwards.</summary>
    public required IReadOnlyList<double> TimesSeconds { get; init; }

    /// <summary>The reference lap's own total time, reported as <see cref="LapState.TargetLapTime"/>.</summary>
    public required double LapTimeSeconds { get; init; }
}

/// <summary>
/// Pure lap-delta computation: builds a position→time reference curve from the
/// fastest completed valid lap and injects <see cref="LapState.Delta"/> (the
/// position-relative gap to that reference; negative = ahead) and
/// <see cref="LapState.TargetLapTime"/> (the reference lap's total time) into a
/// frame via a <em>non-mutating</em> record <c>with</c>-copy. This is the
/// .NET analogue of the old Go <c>internal/delta</c> tracker (reference store +
/// position tracker + manual reference) that fed delta augmentation.
/// </summary>
/// <remarks>
/// <para><b>Threading.</b> Single-threaded and reader-thread-owned: every method
/// MUST be called on the telemetry engine's reader thread, so there is no internal
/// locking (matching the old single-goroutine tracker). When WS8 wires
/// <c>dash.target.set</c> to <see cref="SetManualReference"/>, that command must be
/// marshalled onto the reader thread by the engine, never invoked cross-thread.</para>
///
/// <para><b>Lap boundary.</b> The authoritative boundary is a <em>lap-number
/// increment</em> (an integer, jitter-free) — both the LMU adapter and the demo
/// increment it exactly when the start/finish line is crossed, which coincides with
/// the track-position wrap. We deliberately do not also key off the float
/// track-position wrap, which would risk a double-finalize across the one/two frames
/// where the int and float fields tick at slightly different instants.</para>
///
/// <para><b>Reference total.</b> On the boundary frame the adapter has already
/// reseeded <see cref="LapState.CurrentLapTime"/> to the <em>new</em> lap's small
/// starting value, so the completed lap's total is taken from
/// <see cref="LapState.LastLapTime"/> (authoritative on the boundary frame) and only
/// falls back to the maximum CurrentLapTime observed during the lap. The in-progress
/// trace is finalized <em>before</em> the boundary frame's sample is appended.</para>
/// </remarks>
public sealed class DeltaTracker
{
    // A completed lap is only adopted as a reference if its trace spans roughly the
    // whole lap, so a partial join-mid-session lap or a pit out-lap is rejected.
    private const double CompleteStartMax = 0.2; // first sample must be at/under this position
    private const double CompleteEndMin = 0.8;   // last sample must be at/over this position
    private const int CompleteMinSamples = 8;
    private const double PosEpsilon = 1e-6;       // strictly-ascending guard for interpolation
    private const double WrapJumpThreshold = 0.5; // a backward position jump beyond this = a start/finish crossing, not jitter

    private readonly List<(double Pos, double Time)> _current = new();

    private (double Pos, double Time)[]? _reference;
    private double _referenceTotal;
    private bool _manualReference;

    // An externally chosen reference lap (a plan target, #189). Held apart from the
    // auto-adopted session best rather than overwriting it, so clearing it restores the
    // session-best comparison that was being tracked underneath all along.
    private (double Pos, double Time)[]? _planReference;
    private double _planReferenceTotal;

    // In-progress lap accumulation.
    private bool _haveLap;
    private int _lapNumber;
    private double _maxTime;     // max CurrentLapTime seen this lap (fallback total)
    private bool _lapValid;      // latched false if any frame this lap was invalid
    private double _prevPos;     // previous frame's track position (line-crossing detection)
    private double _lastDelta;   // last computed delta, held through a region desync at the line

    // Continuity tracking for hard resets (session/track change, teleport).
    private string _track = "";
    private SessionType _session = SessionType.Unknown;
    private bool _inCar;

    /// <summary>
    /// Return <paramref name="frame"/> with computed <see cref="LapState.Delta"/> and
    /// <see cref="LapState.TargetLapTime"/> when a reference lap exists and the car is
    /// on track; otherwise return it unchanged. Never mutates the input.
    /// </summary>
    public TelemetryFrame Augment(TelemetryFrame frame)
    {
        ArgumentNullException.ThrowIfNull(frame);

        var lap = frame.Lap;

        // Off-track: end the current stint's trace (so a re-entry doesn't splice onto
        // it) but keep the reference — it is still a valid target for this session.
        if (!frame.Session.InCar)
        {
            if (_inCar)
            {
                EndStint();
            }

            _inCar = false;
            return frame;
        }

        // Hard reset on a genuine discontinuity. A new venue/session discards a stale
        // reference even when the car left the cockpit in between (so it is NOT gated on
        // an in-progress lap — pitting clears _haveLap but the reference must still go).
        // The venue check only fires once we actually hold state, so the very first
        // in-car frame (when _track is still "") doesn't churn. A lap number going
        // backwards is a session restart / teleport.
        var venueChanged = (frame.Session.Track != _track || frame.Session.SessionType != _session)
                           && (_haveLap || _reference is not null);
        var lapWentBack = _haveLap && lap.CurrentLap < _lapNumber;
        if (venueChanged || lapWentBack)
        {
            ResetAll();
        }

        if (!_inCar)
        {
            // Fresh stint: start a clean trace, keep any session reference.
            EndStint();
        }

        _inCar = true;
        _track = frame.Session.Track;
        _session = frame.Session.SessionType;

        var pos = Math.Clamp(lap.TrackPosition, 0.0, 1.0);

        // The integer lap number (telemetry region) and the float track position
        // (scoring region) can disagree by a frame about whether the start/finish line
        // was just crossed. When exactly one of them says "new lap", the lap-relative
        // time and position are momentarily inconsistent and a naive delta would spike by
        // ~a whole lap. Detect that desync and hold the last delta until they agree.
        var lapAdvanced = _haveLap && lap.CurrentLap > _lapNumber;
        var posWrapped = _haveLap && pos + WrapJumpThreshold < _prevPos;
        var lineSkew = _haveLap && lapAdvanced != posWrapped;

        if (!_haveLap)
        {
            BeginLap(lap.CurrentLap);
        }
        else if (lapAdvanced)
        {
            // Lap boundary: finalize the just-completed lap BEFORE recording the new
            // lap's first sample (CurrentLapTime is already reseeded on this frame).
            FinalizeLap(lap.LastLapTime);
            BeginLap(lap.CurrentLap);
        }

        // Accumulate the in-progress lap. Append only on strictly-forward progress so
        // the reference stays a function of position (no duplicate/again-backwards pos).
        _maxTime = Math.Max(_maxTime, NonNegative(lap.CurrentLapTime));
        if (!lap.IsValid)
        {
            _lapValid = false;
        }

        if (_current.Count == 0 || pos > _current[^1].Pos + PosEpsilon)
        {
            _current.Add((pos, NonNegative(lap.CurrentLapTime)));
        }

        _prevPos = pos;

        // A chosen plan target outranks the session best: it is what the driver said they
        // are driving against.
        var reference = _planReference ?? _reference;
        if (reference is null)
        {
            return frame; // nothing to compare against yet
        }

        var referenceTotal = _planReference is not null ? _planReferenceTotal : _referenceTotal;

        // Hold the last delta through the 1–2 frame line desync rather than emitting a
        // ~full-lap spike; otherwise compute the position-relative gap.
        if (!lineSkew)
        {
            _lastDelta = Sanitize(NonNegative(lap.CurrentLapTime) - ReferenceTimeAt(reference, referenceTotal, pos));
        }

        return frame with
        {
            Lap = lap with { Delta = _lastDelta, TargetLapTime = referenceTotal }
        };
    }

    /// <summary>Forget all state (reference + in-progress lap). For a full restart.</summary>
    public void Reset() => ResetAll();

    /// <summary>
    /// Pin the current reference lap as a manual target and stop auto-replacing it with
    /// faster laps. Reader-thread-only effect requested through
    /// <see cref="TelemetryEngine.RequestManualReference"/>.
    /// No-op until a reference has actually been adopted — pinning "nothing" would
    /// otherwise permanently disable auto-adoption.
    /// </summary>
    public void SetManualReference()
    {
        if (_reference is not null)
        {
            _manualReference = true;
        }
    }

    /// <summary>Resume automatic best-lap reference adoption.</summary>
    public void ClearManualReference() => _manualReference = false;

    /// <summary>
    /// Measure against <paramref name="reference"/> — a lap chosen outside this session —
    /// instead of the session best, or pass <c>null</c> to go back to the session best.
    /// <para>
    /// Applied the moment it is called: the caller owns <em>when</em> a target changes
    /// (targets latch at the start/finish line, #189), because only the caller knows that a
    /// target changed at all. A curve that cannot describe a lap — no step, fewer than two
    /// samples, no total — clears instead of being half-adopted, so a truncated stored curve
    /// degrades to the session best rather than to a delta against nothing.
    /// </para>
    /// <para>
    /// Auto-adoption keeps running underneath, so the session best is still there when the
    /// target is cleared. Reader-thread-only, like every other method here; the engine
    /// marshals the request (see <see cref="TelemetryEngine.RequestPlanReference"/>).
    /// </para>
    /// </summary>
    public void SetPlanReference(DeltaReference? reference)
    {
        if (reference is null
            || reference.PositionStep <= 0
            || reference.TimesSeconds.Count < 2
            || reference.LapTimeSeconds <= 0)
        {
            _planReference = null;
            _planReferenceTotal = 0;
            return;
        }

        // Positions are known by construction — the curve stores only the times — and a
        // positive step makes them strictly ascending, which the interpolation requires.
        var samples = new (double Pos, double Time)[reference.TimesSeconds.Count];
        for (var i = 0; i < samples.Length; i++)
        {
            samples[i] = (i * reference.PositionStep, reference.TimesSeconds[i]);
        }

        _planReference = samples;
        _planReferenceTotal = reference.LapTimeSeconds;
    }

    private void BeginLap(int lapNumber)
    {
        _haveLap = true;
        _lapNumber = lapNumber;
        _current.Clear();
        _maxTime = 0;
        _lapValid = true;
    }

    private void FinalizeLap(double lastLapTime)
    {
        if (_manualReference || _current.Count < CompleteMinSamples)
        {
            return;
        }

        if (!_lapValid)
        {
            return;
        }

        // Require the trace to span (about) a whole lap.
        if (_current[0].Pos > CompleteStartMax || _current[^1].Pos < CompleteEndMin)
        {
            return;
        }

        var total = lastLapTime > 0 ? lastLapTime : _maxTime;
        if (total <= 0)
        {
            return;
        }

        // Adopt only the first reference, then only strictly-faster laps.
        if (_reference is not null && total >= _referenceTotal)
        {
            return;
        }

        _reference = _current.ToArray();
        _referenceTotal = total;
    }

    private void EndStint()
    {
        _haveLap = false;
        _current.Clear();
        _maxTime = 0;
        _lapValid = true;
        _prevPos = 0;
    }

    private void ResetAll()
    {
        EndStint();
        _reference = null;
        _referenceTotal = 0;
        _lastDelta = 0;
        // The plan reference goes too: it is a lap of the venue that just changed, so it no
        // longer describes anything about what is being driven. Its owner re-delivers it at
        // the next start/finish line if it still applies.
        _planReference = null;
        _planReferenceTotal = 0;
        // Manual pin and continuity markers are cleared on a true restart.
        _manualReference = false;
        _track = "";
        _session = SessionType.Unknown;
    }

    private static double ReferenceTimeAt((double Pos, double Time)[] samples, double total, double pos)
    {
        if (pos <= samples[0].Pos)
        {
            return samples[0].Time;
        }

        if (pos >= samples[^1].Pos)
        {
            return total; // past the last sample ⇒ the full lap time
        }

        // Binary search for the bracketing interval (positions are strictly ascending).
        var lo = 0;
        var hi = samples.Length - 1;
        while (hi - lo > 1)
        {
            var mid = (lo + hi) / 2;
            if (samples[mid].Pos <= pos)
            {
                lo = mid;
            }
            else
            {
                hi = mid;
            }
        }

        var (p0, t0) = samples[lo];
        var (p1, t1) = samples[hi];
        var span = p1 - p0;
        if (span <= PosEpsilon)
        {
            return t0; // degenerate interval guard (should not happen post-append guard)
        }

        return t0 + (t1 - t0) * ((pos - p0) / span);
    }

    private static double NonNegative(double value) => value > 0 ? value : 0;

    private static double Sanitize(double value) => double.IsFinite(value) ? value : 0;
}

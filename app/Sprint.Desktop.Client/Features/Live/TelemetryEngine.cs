using System.Threading;
using Sprint.Desktop.Api.Telemetry;

namespace Sprint.Desktop.Features.Live;

/// <summary>
/// An immutable, consistent snapshot of what the engine has acquired: the latest
/// (delta-augmented) frame, the source's raw health <see cref="TelemetryStatus"/>,
/// and the measured update rate. Published as a single atomic reference swap (see
/// <see cref="TelemetryEngine.Snapshot"/>). It is a <b>class</b> record on purpose —
/// only the reference is published, so a reader can never observe a torn multi-field
/// value (a <c>readonly record struct</c> would tear under a concurrent read).
/// </summary>
public sealed record EngineSnapshot
{
    public required TelemetryFrame Frame { get; init; }
    public required TelemetryStatus Status { get; init; }
    public double Hz { get; init; }
}

/// <summary>Tunables for the engine loop.</summary>
public sealed record EngineOptions
{
    /// <summary>Pacing between reader iterations while a link is live. Keeps the loop
    /// off a busy-spin against an always-ready source (e.g. the demo) while staying
    /// well above the 30Hz UI handoff.</summary>
    public TimeSpan PollInterval { get; init; } = TimeSpan.FromMilliseconds(5);

    /// <summary>Idle wait between (re)connect probes while no link is established.</summary>
    public TimeSpan ReconnectInterval { get; init; } = TimeSpan.FromSeconds(5);

    /// <summary>EMA smoothing for the rate meter.</summary>
    public double RateSmoothing { get; init; } = 0.3;
}

/// <summary>
/// The WS4 telemetry engine: the consumer-side acquisition loop the
/// <see cref="ITelemetrySource"/> contract intentionally keeps off the adapter. It
/// owns a background reader thread that drives Connect/TryRead, a 5s probe/reconnect
/// loop that idles on a dropped link, a <see cref="RateMeter"/> measuring the real
/// frame cadence, and a <see cref="DeltaTracker"/> that augments each frame with
/// lap delta — then publishes the latest value into a buffer the UI drains at ~30Hz
/// (a decoupled latest-value handoff, not a per-frame UI callback). Avalonia-free, so
/// it is unit- and headless-testable; the synchronous <see cref="Step"/> exposes one
/// loop iteration for deterministic tests.
/// </summary>
/// <remarks>
/// <b>Single owner.</b> Every source mutation (Connect/TryRead/Disconnect) happens on
/// the reader thread; <see cref="Dispose"/> cancels the loop, joins the thread, and
/// only then disposes the source — so the source is never touched concurrently. The
/// UI thread only ever reads the volatile <see cref="Snapshot"/>.
/// </remarks>
public sealed class TelemetryEngine : IDisposable
{
    private readonly ITelemetrySource _source;
    private readonly EngineOptions _options;
    private readonly Func<DateTimeOffset> _clock;
    private readonly RateMeter _rate;
    private readonly DeltaTracker _delta = new();
    private readonly CancellationTokenSource _cts = new();

    private Thread? _thread;
    private int _started;
    private int _disposed;
    private int _manualReferenceRequested;
    private EngineSnapshot _snapshot;
    private TelemetryConnectionState _prevState = TelemetryConnectionState.Disconnected;

    // The last frame the engine published with delta augmentation applied. Held and
    // re-published on every non-read path (no-new-frame, reconnect, fault) so the UI
    // keeps the computed Delta/TargetLapTime between source updates instead of
    // flickering to the raw adapter frame's zeros. Reader-thread-owned.
    private TelemetryFrame _lastAugmented;

    public TelemetryEngine(ITelemetrySource source, EngineOptions? options = null, Func<DateTimeOffset>? clock = null)
    {
        _source = source ?? throw new ArgumentNullException(nameof(source));
        _options = options ?? new EngineOptions();
        _clock = clock ?? (() => DateTimeOffset.UtcNow);
        _rate = new RateMeter(_options.RateSmoothing);
        _lastAugmented = source.Current;
        _snapshot = new EngineSnapshot { Frame = _lastAugmented, Status = source.Status, Hz = 0 };
    }

    /// <summary>The wrapped source's display name.</summary>
    public string SourceName => _source.Name;

    /// <summary>The latest consistent snapshot. Never null; safe to read from any thread.</summary>
    public EngineSnapshot Snapshot => Volatile.Read(ref _snapshot);

    /// <summary>
    /// Requests that the reader thread pin the currently adopted delta reference.
    /// Safe to call from UI/input threads; the tracker itself remains single-owner.
    /// </summary>
    public void RequestManualReference() =>
        Interlocked.Exchange(ref _manualReferenceRequested, 1);

    /// <summary>
    /// Connect synchronously (so the first paint reflects the real link state) and
    /// start the background reader. Idempotent: a second call is a no-op. No-op after
    /// <see cref="Dispose"/>.
    /// </summary>
    public void Start()
    {
        if (Volatile.Read(ref _disposed) == 1)
        {
            return;
        }

        if (Interlocked.CompareExchange(ref _started, 1, 0) != 0)
        {
            return;
        }

        SafeConnect();
        Publish(_lastAugmented, _source.Status, 0);

        _thread = new Thread(RunLoop)
        {
            IsBackground = true,
            Name = "Sprint.TelemetryEngine.Reader"
        };
        _thread.Start();
    }

    public void Dispose()
    {
        if (Interlocked.CompareExchange(ref _disposed, 1, 0) != 0)
        {
            return;
        }

        _cts.Cancel();

        var thread = _thread;
        var joined = thread is null || !thread.IsAlive || thread.Join(TimeSpan.FromSeconds(2));

        // Only dispose the source once the reader thread has actually exited, so the
        // source is never touched concurrently (the single-owner invariant). On a join
        // timeout (a pathological blocking source), the cancelled reader's loop-exit
        // Disconnect releases the link best-effort; we accept that over racing Dispose
        // against an in-flight TryRead (which could fault the underlying handle).
        if (joined)
        {
            try
            {
                _source.Dispose();
            }
            catch
            {
                // Terminal cleanup must never throw.
            }

            _cts.Dispose();
        }
    }

    private void RunLoop()
    {
        var token = _cts.Token;
        while (!token.IsCancellationRequested)
        {
            // Step is contracted never-throw (it self-publishes Faulted on an
            // unexpected error), so a bad frame can never tear down this thread —
            // even one a ReadFrame/Connect throws past the adapter's narrow catch list.
            var wait = WaitFor(Step(_clock()));

            if (token.IsCancellationRequested)
            {
                break;
            }

            token.WaitHandle.WaitOne(wait);
        }

        try
        {
            _source.Disconnect();
        }
        catch
        {
            // Best-effort cleanup as the loop exits.
        }
    }

    /// <summary>Maps a step outcome to its pacing. ReadFrame paces by
    /// <see cref="EngineOptions.PollInterval"/> (never zero) so an always-ready source
    /// can't busy-spin a core; only an unestablished link idles for the reconnect interval.</summary>
    internal TimeSpan WaitFor(StepOutcome outcome) =>
        outcome == StepOutcome.Reconnecting ? _options.ReconnectInterval : _options.PollInterval;

    /// <summary>
    /// Performs exactly one acquisition iteration and publishes a fresh snapshot.
    /// Internal so tests can drive connect/read/reconnect/delta deterministically with
    /// an injected clock, without spinning a real thread. Contracted <b>never-throw</b>:
    /// any unexpected error is surfaced as a Faulted snapshot (US17).
    /// </summary>
    internal StepOutcome Step(DateTimeOffset now)
    {
        try
        {
            return StepCore(now);
        }
        catch (Exception ex)
        {
            PublishFault(ex);
            return StepOutcome.Reconnecting;
        }
    }

    private StepOutcome StepCore(DateTimeOffset now)
    {
        if (Interlocked.Exchange(ref _manualReferenceRequested, 0) != 0)
        {
            _delta.SetManualReference();
        }

        var status = _source.Status;
        var state = status.State;

        if (state == TelemetryConnectionState.Connected)
        {
            _prevState = state;
            if (_source.TryRead(out var frame))
            {
                _rate.Sample(now);
                _lastAugmented = _delta.Augment(frame);
                Publish(_lastAugmented, _source.Status, _rate.Hz);
                return StepOutcome.ReadFrame;
            }

            // Link is live but no new frame yet: hold the last good (augmented) frame, so
            // the computed delta survives the quiet tick. Do NOT reset the delta tracker —
            // the lap is continuous, just momentarily quiet.
            Publish(_lastAugmented, _source.Status, _rate.Hz);
            return StepOutcome.NoFrame;
        }

        // Not connected. Reset the rate meter only on the edge into a non-live state so
        // a recovered link doesn't fold the outage gap into its first measured Hz. The
        // delta tracker is intentionally NOT reset here — it self-resets on a real
        // session/track/lap discontinuity (see DeltaTracker), so a transient
        // Faulted-while-open hiccup does not discard the reference lap.
        if (_prevState == TelemetryConnectionState.Connected)
        {
            _rate.Reset();
        }

        _prevState = state;

        if (state == TelemetryConnectionState.Connecting)
        {
            // A connect is already in progress; don't re-enter it.
            Publish(_lastAugmented, status, 0);
            return StepOutcome.NoFrame;
        }

        // Disconnected / WaitingForGame / Unsupported / PermissionDenied / Faulted:
        // attempt a (re)connect. Connect is idempotent and never-throws for recoverable
        // failures (it reflects them in Status).
        SafeConnect();
        var after = _source.Status;
        if (after.State == TelemetryConnectionState.Connected)
        {
            // Reached a live link — read on the very next iteration (no reconnect idle).
            Publish(_lastAugmented, after, _rate.Hz);
            return StepOutcome.JustConnected;
        }

        Publish(_lastAugmented, after, 0);
        return StepOutcome.Reconnecting;
    }

    private void SafeConnect()
    {
        if (Volatile.Read(ref _disposed) == 1)
        {
            return;
        }

        try
        {
            _source.Connect();
        }
        catch (ObjectDisposedException)
        {
            // Racing a dispose; nothing to do.
        }
        catch (Exception ex)
        {
            // Connect is contracted never-throw for recoverable failures; this is
            // defense-in-depth for US17 so a misbehaving adapter can't crash startup.
            PublishFault(ex);
        }
    }

    private void Publish(TelemetryFrame frame, TelemetryStatus status, double hz) =>
        Volatile.Write(ref _snapshot, new EngineSnapshot { Frame = frame, Status = status, Hz = hz });

    private void PublishFault(Exception ex)
    {
        var status = new TelemetryStatus
        {
            State = TelemetryConnectionState.Faulted,
            SourceName = _source.Name,
            Detail = ex.Message,
            LastFrameValid = false,
            InvalidReason = ex.Message
        };

        Volatile.Write(ref _snapshot, new EngineSnapshot { Frame = _lastAugmented, Status = status, Hz = 0 });
    }
}

/// <summary>The result of one <see cref="TelemetryEngine.Step"/> iteration, used to pace the loop.</summary>
internal enum StepOutcome
{
    /// <summary>A fresh frame was read and published.</summary>
    ReadFrame,

    /// <summary>Link live but no new frame; last good frame held.</summary>
    NoFrame,

    /// <summary>A (re)connect just reached a live link; read immediately next iteration.</summary>
    JustConnected,

    /// <summary>No link established; idle for the reconnect interval before probing again.</summary>
    Reconnecting
}

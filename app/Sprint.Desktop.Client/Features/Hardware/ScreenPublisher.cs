using System.Threading;
using Sprint.Desktop.Api.Telemetry;

namespace Sprint.Desktop.Features.Hardware;

/// <summary>Tunables for the screen publish loop.</summary>
public sealed record ScreenPublisherOptions
{
    public int TargetFps { get; init; } = 30;

    /// <summary>Idle wait between (re)connect attempts while the screen is not linked.</summary>
    public TimeSpan ReconnectInterval { get; init; } = TimeSpan.FromSeconds(3);
}

/// <summary>The outcome of one <see cref="ScreenPublisher.Step"/> iteration, used to pace the loop.</summary>
internal enum ScreenStepOutcome
{
    SentFrame,
    NotSent,
    Reconnecting,
}

/// <summary>
/// The WS7 hardware render loop: a background thread that keeps a screen linked
/// (connect + 3s retry), renders the active dash via an <see cref="IDashFrameSource"/>,
/// and pushes native RGB565 frames to an <see cref="IScreenDriver"/> at the target
/// FPS — all off the UI thread with explicit lifecycle/cancellation (matrix 4.6
/// US32). Contracted never-throw: any unexpected error keeps the loop alive so a
/// transport hiccup surfaces as driver status rather than crashing the app (US33).
/// Mirrors the <c>TelemetryEngine</c> single-owner threading model.
/// </summary>
public sealed class ScreenPublisher : IDisposable
{
    private readonly IScreenDriver _driver;
    private readonly IDashFrameSource _source;
    private readonly Func<TelemetryFrame> _frameProvider;
    private readonly ScreenPublisherOptions _options;
    private readonly CancellationTokenSource _cts = new();
    private readonly byte[] _buffer;

    private Thread? _thread;
    private int _started;
    private int _disposed;
    private volatile string? _lastError;

    public ScreenPublisher(
        IScreenDriver driver,
        IDashFrameSource source,
        Func<TelemetryFrame> frameProvider,
        ScreenPublisherOptions? options = null)
    {
        _driver = driver ?? throw new ArgumentNullException(nameof(driver));
        _source = source ?? throw new ArgumentNullException(nameof(source));
        _frameProvider = frameProvider ?? throw new ArgumentNullException(nameof(frameProvider));
        _options = options ?? new ScreenPublisherOptions();
        _buffer = new byte[source.Width * source.Height * 2];
    }

    /// <summary>The driver's current link status (source of truth for the Devices UI).</summary>
    public ScreenStatus Status => _driver.Status;

    /// <summary>The last unexpected render/transport error, if any (defense-in-depth beyond driver status).</summary>
    public string? LastError => _lastError;

    public void Start()
    {
        if (Volatile.Read(ref _disposed) == 1 || Interlocked.CompareExchange(ref _started, 1, 0) != 0)
        {
            return;
        }

        _thread = new Thread(RunLoop)
        {
            IsBackground = true,
            Name = "Sprint.ScreenPublisher"
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

        // Only dispose once the loop thread has actually exited, so we never dispose
        // the source/driver/CTS out from under an in-flight render or blocking USB
        // write (which would fault a native handle or throw on the background thread).
        // On a pathological join timeout — a real transport stalled in a non-cancelable
        // native write — we accept leaking these until process exit over that race; the
        // cancelled loop's exit still Disconnects best-effort. Mirrors TelemetryEngine.
        if (joined)
        {
            try { _driver.Disconnect(); } catch { /* terminal cleanup never throws */ }
            try { _driver.Dispose(); } catch { /* terminal cleanup never throws */ }
            try { _source.Dispose(); } catch { /* terminal cleanup never throws */ }
            _cts.Dispose();
        }
    }

    private void RunLoop()
    {
        var token = _cts.Token;
        var frameInterval = TimeSpan.FromMilliseconds(1000.0 / Math.Max(1, _options.TargetFps));
        while (!token.IsCancellationRequested)
        {
            var outcome = Step();
            if (token.IsCancellationRequested)
            {
                break;
            }

            var wait = outcome == ScreenStepOutcome.Reconnecting ? _options.ReconnectInterval : frameInterval;
            token.WaitHandle.WaitOne(wait);
        }

        try { _driver.Disconnect(); } catch { /* best effort */ }
    }

    /// <summary>One publish iteration. Internal + never-throw so tests can drive connect/send/retry deterministically.</summary>
    internal ScreenStepOutcome Step()
    {
        try
        {
            if (!_driver.Status.IsConnected)
            {
                return _driver.Connect() ? SendCurrentFrame() : ScreenStepOutcome.Reconnecting;
            }

            return SendCurrentFrame();
        }
        catch (Exception ex)
        {
            _lastError = ex.Message;
            return ScreenStepOutcome.Reconnecting;
        }
    }

    private ScreenStepOutcome SendCurrentFrame()
    {
        _source.Render(_frameProvider(), _buffer);
        return _driver.TrySendFrame(_buffer) ? ScreenStepOutcome.SentFrame : ScreenStepOutcome.Reconnecting;
    }
}

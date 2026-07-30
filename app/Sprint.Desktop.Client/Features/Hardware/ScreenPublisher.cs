using System.Diagnostics;
using System.Threading;
using Sprint.Desktop.Api.Telemetry;
using Sprint.Desktop.Features.Diagnostics;

namespace Sprint.Desktop.Features.Hardware;

/// <summary>Tunables for the screen publish loop.</summary>
public sealed record ScreenPublisherOptions
{
    public int TargetFps { get; init; } = 30;

    /// <summary>Idle wait between (re)connect attempts while the screen is not linked.</summary>
    public TimeSpan ReconnectInterval { get; init; } = TimeSpan.FromSeconds(3);

    /// <summary>
    /// A native open that stays in Connecting beyond this point receives more
    /// diagnostic detail. It remains Connecting until a native error proves a
    /// distinct failure such as access denied/device busy.
    /// </summary>
    public TimeSpan ConnectingWarningAfter { get; init; } = TimeSpan.FromSeconds(3);
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
    private IDashFrameSource _source;
    private readonly Func<int, int, IDashFrameSource>? _sourceFactory;
    private readonly Func<TelemetryFrame> _frameProvider;
    private readonly ScreenPublisherOptions _options;
    private readonly CancellationTokenSource _cts = new();
    private byte[] _buffer;
    private readonly ILog _log;
    private readonly string _deviceId;

    private Thread? _thread;
    private int _started;
    private int _disposed;
    private volatile string? _lastError;
    private int _testPattern;
    private ScreenConnectionState? _lastLoggedState;
    private bool _loggedFirstFrame;
    private long _connectAttemptStarted;

    public ScreenPublisher(
        IScreenDriver driver,
        IDashFrameSource source,
        Func<TelemetryFrame> frameProvider,
        ScreenPublisherOptions? options = null,
        ILog? log = null,
        string? deviceId = null,
        Func<int, int, IDashFrameSource>? sourceFactory = null)
    {
        _driver = driver ?? throw new ArgumentNullException(nameof(driver));
        _source = source ?? throw new ArgumentNullException(nameof(source));
        _frameProvider = frameProvider ?? throw new ArgumentNullException(nameof(frameProvider));
        _sourceFactory = sourceFactory;
        _options = options ?? new ScreenPublisherOptions();
        _log = log ?? NullLog.Instance;
        _deviceId = string.IsNullOrWhiteSpace(deviceId) ? driver.Name : deviceId;
        _buffer = new byte[source.Width * source.Height * 2];
    }

    /// <summary>The driver's current link status (source of truth for the Devices UI).</summary>
    public ScreenStatus Status
    {
        get
        {
            if (_lastError is { } sourceError)
            {
                return new ScreenStatus
                {
                    State = ScreenConnectionState.Faulted,
                    Detail = $"Frame source failed: {sourceError}",
                };
            }

            var status = _driver.Status;
            var started = Volatile.Read(ref _connectAttemptStarted);
            if (status.State == ScreenConnectionState.Connecting
                && started != 0
                && Stopwatch.GetElapsedTime(started) >= _options.ConnectingWarningAfter)
            {
                return new ScreenStatus
                {
                    State = ScreenConnectionState.Connecting,
                    Detail =
                        $"The native USB open is taking longer than {_options.ConnectingWarningAfter.TotalSeconds:0.#} seconds. " +
                        "It may be blocked in device enumeration or WinUSB initialization; check the latest screen log stage.",
                };
            }

            return status;
        }
    }

    /// <summary>The last unexpected render/transport error, if any (defense-in-depth beyond driver status).</summary>
    public string? LastError => _lastError;

    /// <summary>
    /// The panel size the driver learned after connecting, which can differ from the
    /// saved configuration (USBD480 reports its real dimensions, and a generic entry
    /// starts with a placeholder). Null until a driver reports one.
    /// </summary>
    public ScreenNativeSize? DetectedNativeSize => _driver.NativeSize;

    public ScreenTestPattern TestPattern =>
        (ScreenTestPattern)Volatile.Read(ref _testPattern);

    /// <summary>
    /// Replaces telemetry rendering with a deterministic hardware test frame.
    /// <see cref="ScreenTestPattern.Dashboard"/> restores normal rendering.
    /// </summary>
    public void SetTestPattern(ScreenTestPattern pattern) =>
        Volatile.Write(ref _testPattern, (int)pattern);

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
        _log.Debug($"Screen publisher thread starting: device={_deviceId} fps={_options.TargetFps}.");
        _thread.Start();
    }

    public void Dispose()
    {
        if (Interlocked.CompareExchange(ref _disposed, 1, 0) != 0)
        {
            return;
        }

        _cts.Cancel();
        _log.Debug($"Screen publisher stopping: device={_deviceId}.");
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
                _log.Debug($"Screen connect attempt: device={_deviceId} driver={_driver.Name}.");
                Volatile.Write(ref _connectAttemptStarted, Stopwatch.GetTimestamp());
                var connected = _driver.Connect();
                if (connected || _driver.Status.State != ScreenConnectionState.Connecting)
                {
                    Volatile.Write(ref _connectAttemptStarted, 0);
                }

                LogStatusIfChanged();
                return connected ? SendCurrentFrame() : ScreenStepOutcome.Reconnecting;
            }

            return SendCurrentFrame();
        }
        catch (Exception ex)
        {
            _lastError = ex.Message;
            _log.Error($"Screen publisher failed: device={_deviceId}.", ex);
            return ScreenStepOutcome.Reconnecting;
        }
    }

    private ScreenStepOutcome SendCurrentFrame()
    {
        EnsureNativeFrameSize();
        var pattern = TestPattern;
        if (pattern == ScreenTestPattern.Dashboard)
        {
            _source.Render(_frameProvider(), _buffer);
        }
        else
        {
            ScreenTestPatternRenderer.Fill(pattern, _buffer, _source.Width, _source.Height);
        }

        if (_driver.TrySendFrame(_buffer))
        {
            _lastError = null;
            if (!_loggedFirstFrame)
            {
                _loggedFirstFrame = true;
                _log.Info($"Screen first frame sent: device={_deviceId} bytes={_buffer.Length} pattern={pattern}.");
            }

            return ScreenStepOutcome.SentFrame;
        }

        LogStatusIfChanged();
        _log.Warn($"Screen frame was not sent: device={_deviceId} pattern={pattern}.");
        return ScreenStepOutcome.Reconnecting;
    }

    private void EnsureNativeFrameSize()
    {
        var native = _driver.NativeSize;
        if (native is not { IsValid: true } size
            || (size.Width == _source.Width && size.Height == _source.Height))
        {
            return;
        }

        if (_sourceFactory is null)
        {
            _log.Warn(
                $"Screen reported native size {size.Width}x{size.Height}, but device={_deviceId} " +
                $"has no renderer factory; continuing with {_source.Width}x{_source.Height}.");
            return;
        }

        var replacement = _sourceFactory(size.Width, size.Height);
        if (replacement.Width != size.Width || replacement.Height != size.Height)
        {
            replacement.Dispose();
            throw new InvalidOperationException(
                $"Screen renderer factory returned {replacement.Width}x{replacement.Height}; " +
                $"expected native size {size.Width}x{size.Height}.");
        }

        var previous = _source;
        _source = replacement;
        _buffer = new byte[size.Width * size.Height * 2];
        previous.Dispose();
        _log.Info(
            $"Screen renderer resized to native device dimensions: " +
            $"device={_deviceId} size={size.Width}x{size.Height} bytes={_buffer.Length}.");
    }

    private void LogStatusIfChanged()
    {
        var status = Status;
        if (_lastLoggedState == status.State)
        {
            return;
        }

        _lastLoggedState = status.State;
        var detail = string.IsNullOrWhiteSpace(status.Detail) ? "" : $" detail={status.Detail}";
        _log.Info($"Screen status changed: device={_deviceId} state={status.State}.{detail}");
    }
}

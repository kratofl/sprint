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
    UnchangedFrame,
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
    private static readonly TimeSpan PerformanceLogInterval = TimeSpan.FromSeconds(5);

    private readonly record struct RenderedFrame(
        byte[] Buffer,
        long StartedAt,
        ScreenFrameTiming Timing);

    private readonly IScreenDriver _driver;
    private IDashFrameSource _source;
    private readonly Func<int, int, IDashFrameSource>? _sourceFactory;
    private readonly Func<TelemetryFrame> _frameProvider;
    private readonly ScreenPublisherOptions _options;
    private readonly CancellationTokenSource _cts = new();
    private byte[] _buffer;
    private byte[] _lastSentBuffer;
    private bool _hasSentFrame;
    private readonly ILog _log;
    private readonly string _deviceId;
    private readonly ScreenPerformanceTracker _performance = new();

    private Thread? _thread;
    private int _started;
    private int _disposed;
    private volatile string? _lastError;
    private int _testPattern;
    private ScreenConnectionState? _lastLoggedState;
    private bool _loggedFirstFrame;
    private long _connectAttemptStarted;
    private long _lastPerformanceLog;

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
        _lastSentBuffer = new byte[_buffer.Length];
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
    /// Latest measurements from the real render/capture → transport pipeline.
    /// The immutable snapshot is safe for the UI thread to read.
    /// </summary>
    public ScreenPerformanceSnapshot Performance => _performance.Snapshot;

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
        using var transfers = new ScreenTransferWorker(_driver);
        byte[]? alternateBuffer = null;
        try
        {
            while (!token.IsCancellationRequested)
            {
                try
                {
                    if (!_driver.Status.IsConnected && !TryConnect())
                    {
                        token.WaitHandle.WaitOne(_options.ReconnectInterval);
                        continue;
                    }

                    EnsureNativeFrameSize();
                    if (alternateBuffer is null || alternateBuffer.Length != _buffer.Length)
                    {
                        alternateBuffer = new byte[_buffer.Length];
                    }

                    PublishConnectedFrames(
                        transfers,
                        alternateBuffer,
                        frameInterval,
                        token);
                }
                catch (Exception ex)
                {
                    _lastError = ex.Message;
                    _log.Error($"Screen publisher failed: device={_deviceId}.", ex);
                    token.WaitHandle.WaitOne(_options.ReconnectInterval);
                }
            }
        }
        finally
        {
            try { _driver.Disconnect(); } catch { /* best effort */ }
        }
    }

    private void PublishConnectedFrames(
        ScreenTransferWorker transfers,
        byte[] alternateBuffer,
        TimeSpan frameInterval,
        CancellationToken token)
    {
        RenderedFrame? pending = null;
        try
        {
            var rendered = RenderCurrentFrame(_buffer);
            if (IsDuplicate(rendered.Buffer))
            {
                RecordSkipped(rendered);
                WaitForNextFrame(frameInterval, rendered.StartedAt, token);
                return;
            }

            transfers.Start(rendered.Buffer);
            pending = rendered;
            var renderBuffer = alternateBuffer;
            while (!token.IsCancellationRequested)
            {
                var next = RenderCurrentFrame(renderBuffer);
                var transfer = transfers.Complete();
                var completed = pending.Value;
                pending = null;
                if (!RecordTransfer(completed, transfer))
                {
                    return;
                }

                if (token.IsCancellationRequested)
                {
                    return;
                }

                if (IsDuplicate(next.Buffer))
                {
                    RecordSkipped(next);
                    WaitForNextFrame(frameInterval, transfer.StartedAt, token);
                    return;
                }

                WaitForNextFrame(frameInterval, transfer.StartedAt, token);
                if (token.IsCancellationRequested)
                {
                    return;
                }

                transfers.Start(next.Buffer);
                pending = next;
                renderBuffer = ReferenceEquals(renderBuffer, _buffer)
                    ? alternateBuffer
                    : _buffer;
            }
        }
        finally
        {
            if (transfers.IsInFlight && pending is { } inFlight)
            {
                CompletePendingTransfer(transfers, inFlight);
            }
        }
    }

    private void CompletePendingTransfer(
        ScreenTransferWorker transfers,
        RenderedFrame pending)
    {
        try
        {
            var transfer = transfers.Complete();
            _ = RecordTransfer(pending, transfer);
        }
        catch (Exception ex)
        {
            _lastError = ex.Message;
            _log.Error(
                $"Screen publisher failed while completing an in-flight transfer: device={_deviceId}.",
                ex);
        }
    }

    internal static TimeSpan RemainingFrameDelay(TimeSpan frameInterval, TimeSpan workElapsed) =>
        workElapsed >= frameInterval ? TimeSpan.Zero : frameInterval - workElapsed;

    /// <summary>One publish iteration. Internal + never-throw so tests can drive connect/send/retry deterministically.</summary>
    internal ScreenStepOutcome Step()
    {
        try
        {
            if (!_driver.Status.IsConnected && !TryConnect())
            {
                return ScreenStepOutcome.Reconnecting;
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
        var rendered = RenderCurrentFrame(_buffer);
        if (IsDuplicate(rendered.Buffer))
        {
            RecordSkipped(rendered);
            return ScreenStepOutcome.UnchangedFrame;
        }

        var transferStarted = Stopwatch.GetTimestamp();
        var transfer = new ScreenTransferResult(
            _driver.TrySendFrame(rendered.Buffer),
            transferStarted,
            Stopwatch.GetTimestamp());
        return RecordTransfer(rendered, transfer)
            ? ScreenStepOutcome.SentFrame
            : ScreenStepOutcome.Reconnecting;
    }

    private bool TryConnect()
    {
        _log.Debug($"Screen connect attempt: device={_deviceId} driver={_driver.Name}.");
        Volatile.Write(ref _connectAttemptStarted, Stopwatch.GetTimestamp());
        var connected = _driver.Connect();
        if (connected || _driver.Status.State != ScreenConnectionState.Connecting)
        {
            Volatile.Write(ref _connectAttemptStarted, 0);
        }

        LogStatusIfChanged();
        return connected;
    }

    private RenderedFrame RenderCurrentFrame(byte[] buffer)
    {
        var frameStarted = Stopwatch.GetTimestamp();
        var pattern = TestPattern;
        ScreenFrameTiming renderTiming;
        if (pattern == ScreenTestPattern.Dashboard)
        {
            renderTiming = _source.Render(_frameProvider(), buffer);
        }
        else
        {
            ScreenTestPatternRenderer.Fill(pattern, buffer, _source.Width, _source.Height);
            renderTiming = new ScreenFrameTiming(
                Stopwatch.GetElapsedTime(frameStarted),
                TimeSpan.Zero);
        }

        _lastError = null;
        return new RenderedFrame(
            buffer,
            frameStarted,
            renderTiming);
    }

    private bool IsDuplicate(byte[] buffer) =>
        _hasSentFrame && buffer.AsSpan().SequenceEqual(_lastSentBuffer);

    private void RecordSkipped(RenderedFrame rendered)
    {
        var completedAt = Stopwatch.GetTimestamp();
        _performance.RecordFrame(
            completedAt,
            rendered.Timing,
            TimeSpan.Zero,
            Stopwatch.GetElapsedTime(rendered.StartedAt, completedAt),
            ScreenFrameDisposition.Skipped);
        LogPerformanceIfDue(completedAt);
    }

    private bool RecordTransfer(RenderedFrame rendered, ScreenTransferResult transfer)
    {
        if (transfer.Error is { } error)
        {
            throw new InvalidOperationException("The screen transfer worker failed.", error);
        }

        if (transfer.Succeeded)
        {
            rendered.Buffer.CopyTo(_lastSentBuffer, 0);
            _hasSentFrame = true;
            _performance.RecordFrame(
                transfer.CompletedAt,
                rendered.Timing,
                transfer.Elapsed,
                rendered.Timing.FrameTime + transfer.Elapsed,
                ScreenFrameDisposition.Sent);
            LogPerformanceIfDue(transfer.CompletedAt);
            if (!_loggedFirstFrame)
            {
                _loggedFirstFrame = true;
                _log.Info(
                    $"Screen first frame sent: device={_deviceId} " +
                    $"bytes={rendered.Buffer.Length} pattern={TestPattern}.");
            }

            return true;
        }

        _performance.RecordFrame(
            transfer.CompletedAt,
            rendered.Timing,
            transfer.Elapsed,
            rendered.Timing.FrameTime + transfer.Elapsed,
            ScreenFrameDisposition.Rendered);
        LogPerformanceIfDue(transfer.CompletedAt);
        LogStatusIfChanged();
        _log.Warn($"Screen frame was not sent: device={_deviceId} pattern={TestPattern}.");
        return false;
    }

    private void LogPerformanceIfDue(long completedAt)
    {
        if (_lastPerformanceLog == 0)
        {
            _lastPerformanceLog = completedAt;
            return;
        }

        if (Stopwatch.GetElapsedTime(_lastPerformanceLog, completedAt) < PerformanceLogInterval)
        {
            return;
        }

        _lastPerformanceLog = completedAt;
        var performance = _performance.Snapshot;
        _log.Debug(
            $"Screen performance: device={_deviceId} " +
            $"fps={performance.FramesPerSecond:0.0} " +
            $"sourceMs={performance.SourceTime.TotalMilliseconds:0.0} " +
            $"pixelMs={performance.PixelTransformTime.TotalMilliseconds:0.0} " +
            $"usbMs={performance.UsbTransferTime.TotalMilliseconds:0.0} " +
            $"totalMs={performance.TotalFrameTime.TotalMilliseconds:0.0} " +
            $"rendered={performance.FramesRendered} sent={performance.FramesSent} " +
            $"skipped={performance.FramesSkipped}.");
    }

    private static void WaitForNextFrame(
        TimeSpan frameInterval,
        long previousTransferStartedAt,
        CancellationToken token)
    {
        var wait = RemainingFrameDelay(
            frameInterval,
            Stopwatch.GetElapsedTime(previousTransferStartedAt));
        if (wait > TimeSpan.FromMilliseconds(5))
        {
            token.WaitHandle.WaitOne(wait);
            return;
        }

        // WaitHandle rounds very short waits up to the Windows timer quantum,
        // which turned a ~3 ms remainder into ~10 ms and capped a 30 Hz VoCore
        // panel near 25 FPS. A bounded spin is cheaper than losing that cadence;
        // USB already consumes almost the entire frame interval.
        while (!token.IsCancellationRequested
               && Stopwatch.GetElapsedTime(previousTransferStartedAt) < frameInterval)
        {
            Thread.SpinWait(64);
        }
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
        _lastSentBuffer = new byte[_buffer.Length];
        _hasSentFrame = false;
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

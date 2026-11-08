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

    /// <summary>
    /// An unchanged frame is skipped, but sent again once this long has passed since the last
    /// transfer: only a failed transfer reveals an unplugged panel, so a screen showing a still
    /// picture (the idle page while no game runs) would otherwise read Connected forever.
    /// </summary>
    public TimeSpan ResendUnchangedAfter { get; init; } = TimeSpan.FromSeconds(1);
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
    private long _lastSentAt;
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
        this._driver = driver ?? throw new ArgumentNullException(nameof(driver));
        this._source = source ?? throw new ArgumentNullException(nameof(source));
        this._frameProvider = frameProvider ?? throw new ArgumentNullException(nameof(frameProvider));
        this._sourceFactory = sourceFactory;
        this._options = options ?? new ScreenPublisherOptions();
        this._log = log ?? NullLog.Instance;
        this._deviceId = string.IsNullOrWhiteSpace(deviceId) ? driver.Name : deviceId;
        this._buffer = new byte[source.Width * source.Height * 2];
        this._lastSentBuffer = new byte[this._buffer.Length];
    }

    /// <summary>The driver's current link status (source of truth for the Devices UI).</summary>
    public ScreenStatus Status
    {
        get
        {
            if (this._lastError is { } sourceError)
            {
                return new ScreenStatus
                {
                    State = ScreenConnectionState.Faulted,
                    Detail = $"Frame source failed: {sourceError}",
                };
            }

            ScreenStatus status = this._driver.Status;
            long started = Volatile.Read(ref this._connectAttemptStarted);
            if (status.State == ScreenConnectionState.Connecting
                && started != 0
                && Stopwatch.GetElapsedTime(started) >= this._options.ConnectingWarningAfter)
            {
                return new ScreenStatus
                {
                    State = ScreenConnectionState.Connecting,
                    Detail =
                        $"The native USB open is taking longer than {this._options.ConnectingWarningAfter.TotalSeconds:0.#} seconds. " +
                        "It may be blocked in device enumeration or WinUSB initialization; check the latest screen log stage.",
                };
            }

            return status;
        }
    }

    /// <summary>The last unexpected render/transport error, if any (defense-in-depth beyond driver status).</summary>
    public string? LastError => this._lastError;

    /// <summary>
    /// Latest measurements from the real render/capture → transport pipeline.
    /// The immutable snapshot is safe for the UI thread to read.
    /// </summary>
    public ScreenPerformanceSnapshot Performance => this._performance.Snapshot;

    /// <summary>
    /// The panel size the driver learned after connecting, which can differ from the
    /// saved configuration (USBD480 reports its real dimensions, and a generic entry
    /// starts with a placeholder). Null until a driver reports one.
    /// </summary>
    public ScreenNativeSize? DetectedNativeSize => this._driver.NativeSize;

    public ScreenTestPattern TestPattern =>
        (ScreenTestPattern)Volatile.Read(ref this._testPattern);

    /// <summary>
    /// Replaces telemetry rendering with a deterministic hardware test frame.
    /// <see cref="ScreenTestPattern.Dashboard"/> restores normal rendering.
    /// </summary>
    public void SetTestPattern(ScreenTestPattern pattern) =>
        Volatile.Write(ref this._testPattern, (int)pattern);

    public void Start()
    {
        if (Volatile.Read(ref this._disposed) == 1 || Interlocked.CompareExchange(ref this._started, 1, 0) != 0)
        {
            return;
        }

        this._thread = new Thread(this.RunLoop)
        {
            IsBackground = true,
            Name = "Sprint.ScreenPublisher"
        };
        this._log.Debug($"Screen publisher thread starting: device={this._deviceId} fps={this._options.TargetFps}.");
        this._thread.Start();
    }

    public void Dispose()
    {
        if (Interlocked.CompareExchange(ref this._disposed, 1, 0) != 0)
        {
            return;
        }

        this._cts.Cancel();
        this._log.Debug($"Screen publisher stopping: device={this._deviceId}.");
        Thread? thread = this._thread;
        bool joined = thread is null || !thread.IsAlive || thread.Join(TimeSpan.FromSeconds(2));

        // Only dispose once the loop thread has actually exited, so we never dispose
        // the source/driver/CTS out from under an in-flight render or blocking USB
        // write (which would fault a native handle or throw on the background thread).
        // On a pathological join timeout — a real transport stalled in a non-cancelable
        // native write — we accept leaking these until process exit over that race; the
        // cancelled loop's exit still Disconnects best-effort. Mirrors TelemetryEngine.
        if (joined)
        {
            try { this._driver.Disconnect(); } catch { /* terminal cleanup never throws */ }
            try { this._driver.Dispose(); } catch { /* terminal cleanup never throws */ }
            try { this._source.Dispose(); } catch { /* terminal cleanup never throws */ }
            this._cts.Dispose();
        }
    }

    private void RunLoop()
    {
        CancellationToken token = this._cts.Token;
        TimeSpan frameInterval = TimeSpan.FromMilliseconds(1000.0 / Math.Max(1, this._options.TargetFps));
        using ScreenTransferWorker transfers = new ScreenTransferWorker(this._driver);
        byte[]? alternateBuffer = null;
        try
        {
            while (!token.IsCancellationRequested)
            {
                try
                {
                    if (!this._driver.Status.IsConnected && !this.TryConnect())
                    {
                        token.WaitHandle.WaitOne(this._options.ReconnectInterval);
                        continue;
                    }

                    this.EnsureNativeFrameSize();
                    if (alternateBuffer is null || alternateBuffer.Length != this._buffer.Length)
                    {
                        alternateBuffer = new byte[this._buffer.Length];
                    }

                    this.PublishConnectedFrames(
                        transfers,
                        alternateBuffer,
                        frameInterval,
                        token);
                }
                catch (Exception ex)
                {
                    this._lastError = ex.Message;
                    this._log.Error($"Screen publisher failed: device={this._deviceId}.", ex);
                    token.WaitHandle.WaitOne(this._options.ReconnectInterval);
                }
            }
        }
        finally
        {
            try { this._driver.Disconnect(); } catch { /* best effort */ }
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
            RenderedFrame rendered = this.RenderCurrentFrame(this._buffer);
            if (this.IsDuplicate(rendered.Buffer))
            {
                this.RecordSkipped(rendered);
                WaitForNextFrame(frameInterval, rendered.StartedAt, token);
                return;
            }

            transfers.Start(rendered.Buffer);
            pending = rendered;
            byte[] renderBuffer = alternateBuffer;
            while (!token.IsCancellationRequested)
            {
                RenderedFrame next = this.RenderCurrentFrame(renderBuffer);
                ScreenTransferResult transfer = transfers.Complete();
                RenderedFrame completed = pending.Value;
                pending = null;
                if (!this.RecordTransfer(completed, transfer))
                {
                    return;
                }

                if (token.IsCancellationRequested)
                {
                    return;
                }

                if (this.IsDuplicate(next.Buffer))
                {
                    this.RecordSkipped(next);
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
                renderBuffer = ReferenceEquals(renderBuffer, this._buffer)
                    ? alternateBuffer
                    : this._buffer;
            }
        }
        finally
        {
            if (transfers.IsInFlight && pending is { } inFlight)
            {
                this.CompletePendingTransfer(transfers, inFlight);
            }
        }
    }

    private void CompletePendingTransfer(
        ScreenTransferWorker transfers,
        RenderedFrame pending)
    {
        try
        {
            ScreenTransferResult transfer = transfers.Complete();
            _ = this.RecordTransfer(pending, transfer);
        }
        catch (Exception ex)
        {
            this._lastError = ex.Message;
            this._log.Error(
                $"Screen publisher failed while completing an in-flight transfer: device={this._deviceId}.",
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
            if (!this._driver.Status.IsConnected && !this.TryConnect())
            {
                return ScreenStepOutcome.Reconnecting;
            }

            return this.SendCurrentFrame();
        }
        catch (Exception ex)
        {
            this._lastError = ex.Message;
            this._log.Error($"Screen publisher failed: device={this._deviceId}.", ex);
            return ScreenStepOutcome.Reconnecting;
        }
    }

    private ScreenStepOutcome SendCurrentFrame()
    {
        this.EnsureNativeFrameSize();
        RenderedFrame rendered = this.RenderCurrentFrame(this._buffer);
        if (this.IsDuplicate(rendered.Buffer))
        {
            this.RecordSkipped(rendered);
            return ScreenStepOutcome.UnchangedFrame;
        }

        long transferStarted = Stopwatch.GetTimestamp();
        ScreenTransferResult transfer = new ScreenTransferResult(
            this._driver.TrySendFrame(rendered.Buffer),
            transferStarted,
            Stopwatch.GetTimestamp());
        return this.RecordTransfer(rendered, transfer)
            ? ScreenStepOutcome.SentFrame
            : ScreenStepOutcome.Reconnecting;
    }

    private bool TryConnect()
    {
        this._log.Debug($"Screen connect attempt: device={this._deviceId} driver={this._driver.Name}.");
        Volatile.Write(ref this._connectAttemptStarted, Stopwatch.GetTimestamp());
        bool connected = this._driver.Connect();
        if (connected || this._driver.Status.State != ScreenConnectionState.Connecting)
        {
            Volatile.Write(ref this._connectAttemptStarted, 0);
        }

        this.LogStatusIfChanged();
        return connected;
    }

    private RenderedFrame RenderCurrentFrame(byte[] buffer)
    {
        long frameStarted = Stopwatch.GetTimestamp();
        ScreenTestPattern pattern = this.TestPattern;
        ScreenFrameTiming renderTiming;
        if (pattern == ScreenTestPattern.Dashboard)
        {
            renderTiming = this._source.Render(this._frameProvider(), buffer);
        }
        else
        {
            ScreenTestPatternRenderer.Fill(pattern, buffer, this._source.Width, this._source.Height);
            renderTiming = new ScreenFrameTiming(
                Stopwatch.GetElapsedTime(frameStarted),
                TimeSpan.Zero);
        }

        this._lastError = null;
        return new RenderedFrame(
            buffer,
            frameStarted,
            renderTiming);
    }

    private bool IsDuplicate(byte[] buffer) =>
        this._hasSentFrame
        && Stopwatch.GetElapsedTime(this._lastSentAt) < this._options.ResendUnchangedAfter
        && buffer.AsSpan().SequenceEqual(this._lastSentBuffer);

    private void RecordSkipped(RenderedFrame rendered)
    {
        long completedAt = Stopwatch.GetTimestamp();
        this._performance.RecordFrame(
            completedAt,
            rendered.Timing,
            TimeSpan.Zero,
            Stopwatch.GetElapsedTime(rendered.StartedAt, completedAt),
            ScreenFrameDisposition.Skipped);
        this.LogPerformanceIfDue(completedAt);
    }

    private bool RecordTransfer(RenderedFrame rendered, ScreenTransferResult transfer)
    {
        if (transfer.Error is { } error)
        {
            throw new InvalidOperationException("The screen transfer worker failed.", error);
        }

        if (transfer.Succeeded)
        {
            rendered.Buffer.CopyTo(this._lastSentBuffer, 0);
            this._hasSentFrame = true;
            this._lastSentAt = transfer.CompletedAt;
            this._performance.RecordFrame(
                transfer.CompletedAt,
                rendered.Timing,
                transfer.Elapsed,
                rendered.Timing.FrameTime + transfer.Elapsed,
                ScreenFrameDisposition.Sent);
            this.LogPerformanceIfDue(transfer.CompletedAt);
            if (!this._loggedFirstFrame)
            {
                this._loggedFirstFrame = true;
                this._log.Info(
                    $"Screen first frame sent: device={this._deviceId} " +
                    $"bytes={rendered.Buffer.Length} pattern={this.TestPattern}.");
            }

            return true;
        }

        this._performance.RecordFrame(
            transfer.CompletedAt,
            rendered.Timing,
            transfer.Elapsed,
            rendered.Timing.FrameTime + transfer.Elapsed,
            ScreenFrameDisposition.Rendered);
        this.LogPerformanceIfDue(transfer.CompletedAt);
        this.LogStatusIfChanged();
        this._log.Warn($"Screen frame was not sent: device={this._deviceId} pattern={this.TestPattern}.");
        return false;
    }

    private void LogPerformanceIfDue(long completedAt)
    {
        if (this._lastPerformanceLog == 0)
        {
            this._lastPerformanceLog = completedAt;
            return;
        }

        if (Stopwatch.GetElapsedTime(this._lastPerformanceLog, completedAt) < PerformanceLogInterval)
        {
            return;
        }

        this._lastPerformanceLog = completedAt;
        ScreenPerformanceSnapshot performance = this._performance.Snapshot;
        this._log.Debug(
            $"Screen performance: device={this._deviceId} " +
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
        TimeSpan wait = RemainingFrameDelay(
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
        ScreenNativeSize? native = this._driver.NativeSize;
        if (native is not { IsValid: true } size
            || (size.Width == this._source.Width && size.Height == this._source.Height))
        {
            return;
        }

        if (this._sourceFactory is null)
        {
            this._log.Warn(
                $"Screen reported native size {size.Width}x{size.Height}, but device={this._deviceId} " +
                $"has no renderer factory; continuing with {this._source.Width}x{this._source.Height}.");
            return;
        }

        IDashFrameSource replacement = this._sourceFactory(size.Width, size.Height);
        if (replacement.Width != size.Width || replacement.Height != size.Height)
        {
            replacement.Dispose();
            throw new InvalidOperationException(
                $"Screen renderer factory returned {replacement.Width}x{replacement.Height}; " +
                $"expected native size {size.Width}x{size.Height}.");
        }

        IDashFrameSource previous = this._source;
        this._source = replacement;
        this._buffer = new byte[size.Width * size.Height * 2];
        this._lastSentBuffer = new byte[this._buffer.Length];
        this._hasSentFrame = false;
        previous.Dispose();
        this._log.Info(
            $"Screen renderer resized to native device dimensions: " +
            $"device={this._deviceId} size={size.Width}x{size.Height} bytes={this._buffer.Length}.");
    }

    private void LogStatusIfChanged()
    {
        ScreenStatus status = this.Status;
        if (this._lastLoggedState == status.State)
        {
            return;
        }

        this._lastLoggedState = status.State;
        string detail = string.IsNullOrWhiteSpace(status.Detail) ? "" : $" detail={status.Detail}";
        this._log.Info($"Screen status changed: device={this._deviceId} state={status.State}.{detail}");
    }
}

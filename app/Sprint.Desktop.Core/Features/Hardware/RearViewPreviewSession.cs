using System.Diagnostics;
using Sprint.Desktop.Features.Devices;

namespace Sprint.Desktop.Features.Hardware;

public readonly record struct RearViewPreviewStatistics(
    double FramesPerSecond,
    TimeSpan FrameTime);

/// <summary>
/// Captures a rear-view region on a dedicated low-rate thread. The UI only copies
/// the newest completed frame, so GDI capture never blocks Avalonia's render thread.
/// Buffers are reused for the full session.
/// </summary>
public sealed class RearViewPreviewSession : IDisposable
{
    private readonly object _sync = new();
    private readonly ScreenCaptureRegion _region;
    private readonly IDesktopRegionCapturer _capturer;
    private readonly LatestBgraFrameExchange? _sharedFrames;
    private readonly TimeSpan _sharedFrameMaxAge;
    private readonly TimeSpan _frameInterval;
    private readonly CancellationTokenSource _cts = new();
    private byte[] _working;
    private byte[] _published;
    private Thread? _thread;
    private long _version;
    private long _sharedVersion;
    private int _started;
    private int _disposed;
    private RearViewPreviewStatistics _statistics;

    public RearViewPreviewSession(
        ScreenCaptureRegion region,
        int width,
        int height,
        IDesktopRegionCapturer capturer,
        int targetFps = 15,
        LatestBgraFrameExchange? sharedFrames = null,
        TimeSpan? sharedFrameMaxAge = null)
    {
        ArgumentNullException.ThrowIfNull(region);
        ArgumentNullException.ThrowIfNull(capturer);
        if (!region.IsValid)
        {
            throw new ArgumentOutOfRangeException(nameof(region));
        }

        if (width <= 0)
        {
            throw new ArgumentOutOfRangeException(nameof(width));
        }

        if (height <= 0)
        {
            throw new ArgumentOutOfRangeException(nameof(height));
        }

        this._region = region;
        this._capturer = capturer;
        if (sharedFrames is not null
            && (sharedFrames.Width != width || sharedFrames.Height != height))
        {
            throw new ArgumentException(
                "Shared capture dimensions must match the preview.",
                nameof(sharedFrames));
        }

        this._sharedFrames = sharedFrames;
        this._sharedFrameMaxAge = sharedFrameMaxAge ?? TimeSpan.FromMilliseconds(500);
        if (this._sharedFrameMaxAge <= TimeSpan.Zero)
        {
            throw new ArgumentOutOfRangeException(nameof(sharedFrameMaxAge));
        }

        this.Width = width;
        this.Height = height;
        this._working = new byte[checked(width * height * 4)];
        this._published = new byte[this._working.Length];
        this._frameInterval = TimeSpan.FromSeconds(1d / Math.Clamp(targetFps, 1, 30));
    }

    public int Width { get; }

    public int Height { get; }

    public RearViewPreviewStatistics Statistics
    {
        get
        {
            lock (this._sync)
            {
                return this._statistics;
            }
        }
    }

    public void Start()
    {
        if (Volatile.Read(ref this._disposed) == 1
            || Interlocked.CompareExchange(ref this._started, 1, 0) != 0)
        {
            return;
        }

        this._thread = new Thread(this.CaptureLoop)
        {
            IsBackground = true,
            Name = "Sprint.RearViewPreview",
        };
        this._thread.Start();
    }

    public bool TryCopyLatest(
        Span<byte> destination,
        ref long observedVersion,
        out RearViewPreviewStatistics statistics)
    {
        if (destination.Length < this._published.Length)
        {
            throw new ArgumentException("Destination buffer is too small for the preview frame.", nameof(destination));
        }

        lock (this._sync)
        {
            statistics = this._statistics;
            if (this._version == 0 || this._version == observedVersion)
            {
                return false;
            }

            this._published.CopyTo(destination);
            observedVersion = this._version;
            return true;
        }
    }

    private void CaptureLoop()
    {
        CancellationToken token = this._cts.Token;
        long previousFrame = Stopwatch.GetTimestamp();
        bool firstFrame = true;
        while (!token.IsCancellationRequested)
        {
            long started = Stopwatch.GetTimestamp();
            LatestFrameReadResult sharedResult = this._sharedFrames?.TryCopyLatest(
                this._working,
                ref this._sharedVersion,
                this._sharedFrameMaxAge) ?? LatestFrameReadResult.Unavailable;
            bool captured = sharedResult == LatestFrameReadResult.Copied;
            if (sharedResult == LatestFrameReadResult.Unavailable)
            {
                captured = this._capturer.TryCapture(this._region, this.Width, this.Height, this._working);
            }

            long completed = Stopwatch.GetTimestamp();
            if (captured)
            {
                TimeSpan frameTime = Stopwatch.GetElapsedTime(started, completed);
                TimeSpan elapsed = Stopwatch.GetElapsedTime(previousFrame, completed);
                previousFrame = completed;
                double fps = firstFrame || elapsed <= TimeSpan.Zero
                    ? 1d / this._frameInterval.TotalSeconds
                    : 1d / elapsed.TotalSeconds;
                firstFrame = false;

                lock (this._sync)
                {
                    (this._working, this._published) = (this._published, this._working);
                    this._version++;
                    this._statistics = new RearViewPreviewStatistics(
                        Blend(this._statistics.FramesPerSecond, fps),
                        TimeSpan.FromMilliseconds(Blend(
                            this._statistics.FrameTime.TotalMilliseconds,
                            frameTime.TotalMilliseconds)));
                }
            }

            TimeSpan wait = this._frameInterval - Stopwatch.GetElapsedTime(started);
            if (wait > TimeSpan.Zero)
            {
                token.WaitHandle.WaitOne(wait);
            }
        }
    }

    private static double Blend(double previous, double current) =>
        previous <= 0 ? current : previous * 0.8 + current * 0.2;

    public void Dispose()
    {
        if (Interlocked.Exchange(ref this._disposed, 1) == 1)
        {
            return;
        }

        this._cts.Cancel();
        Thread? thread = this._thread;
        bool joined = thread is null || !thread.IsAlive || thread.Join(TimeSpan.FromSeconds(2));
        if (joined)
        {
            if (this._capturer is IDisposable disposable)
            {
                disposable.Dispose();
            }

            this._cts.Dispose();
        }
    }
}

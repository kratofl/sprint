using System.Diagnostics;
using Sprint.Desktop.Features.Devices;

namespace Sprint.Desktop.Features.Hardware;

internal readonly record struct RearViewPreviewStatistics(
    double FramesPerSecond,
    TimeSpan FrameTime);

/// <summary>
/// Captures a rear-view region on a dedicated low-rate thread. The UI only copies
/// the newest completed frame, so GDI capture never blocks Avalonia's render thread.
/// Buffers are reused for the full session.
/// </summary>
internal sealed class RearViewPreviewSession : IDisposable
{
    private readonly object _sync = new();
    private readonly ScreenCaptureRegion _region;
    private readonly IDesktopRegionCapturer _capturer;
    private readonly TimeSpan _frameInterval;
    private readonly CancellationTokenSource _cts = new();
    private byte[] _working;
    private byte[] _published;
    private Thread? _thread;
    private long _version;
    private int _started;
    private int _disposed;
    private RearViewPreviewStatistics _statistics;

    public RearViewPreviewSession(
        ScreenCaptureRegion region,
        int width,
        int height,
        IDesktopRegionCapturer capturer,
        int targetFps = 15)
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

        _region = region;
        _capturer = capturer;
        Width = width;
        Height = height;
        _working = new byte[checked(width * height * 4)];
        _published = new byte[_working.Length];
        _frameInterval = TimeSpan.FromSeconds(1d / Math.Clamp(targetFps, 1, 30));
    }

    public int Width { get; }

    public int Height { get; }

    public RearViewPreviewStatistics Statistics
    {
        get
        {
            lock (_sync)
            {
                return _statistics;
            }
        }
    }

    public void Start()
    {
        if (Volatile.Read(ref _disposed) == 1
            || Interlocked.CompareExchange(ref _started, 1, 0) != 0)
        {
            return;
        }

        _thread = new Thread(CaptureLoop)
        {
            IsBackground = true,
            Name = "Sprint.RearViewPreview",
        };
        _thread.Start();
    }

    public bool TryCopyLatest(
        Span<byte> destination,
        ref long observedVersion,
        out RearViewPreviewStatistics statistics)
    {
        if (destination.Length < _published.Length)
        {
            throw new ArgumentException("Destination buffer is too small for the preview frame.", nameof(destination));
        }

        lock (_sync)
        {
            statistics = _statistics;
            if (_version == 0 || _version == observedVersion)
            {
                return false;
            }

            _published.CopyTo(destination);
            observedVersion = _version;
            return true;
        }
    }

    private void CaptureLoop()
    {
        var token = _cts.Token;
        var previousFrame = Stopwatch.GetTimestamp();
        var firstFrame = true;
        while (!token.IsCancellationRequested)
        {
            var started = Stopwatch.GetTimestamp();
            var captured = _capturer.TryCapture(_region, Width, Height, _working);
            var completed = Stopwatch.GetTimestamp();
            if (captured)
            {
                var frameTime = Stopwatch.GetElapsedTime(started, completed);
                var elapsed = Stopwatch.GetElapsedTime(previousFrame, completed);
                previousFrame = completed;
                var fps = firstFrame || elapsed <= TimeSpan.Zero
                    ? 1d / _frameInterval.TotalSeconds
                    : 1d / elapsed.TotalSeconds;
                firstFrame = false;

                lock (_sync)
                {
                    (_working, _published) = (_published, _working);
                    _version++;
                    _statistics = new RearViewPreviewStatistics(
                        Blend(_statistics.FramesPerSecond, fps),
                        TimeSpan.FromMilliseconds(Blend(
                            _statistics.FrameTime.TotalMilliseconds,
                            frameTime.TotalMilliseconds)));
                }
            }

            var wait = _frameInterval - Stopwatch.GetElapsedTime(started);
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
        if (Interlocked.Exchange(ref _disposed, 1) == 1)
        {
            return;
        }

        _cts.Cancel();
        var thread = _thread;
        var joined = thread is null || !thread.IsAlive || thread.Join(TimeSpan.FromSeconds(2));
        if (joined)
        {
            if (_capturer is IDisposable disposable)
            {
                disposable.Dispose();
            }

            _cts.Dispose();
        }
    }
}

using System.Diagnostics;
using Sprint.Desktop.Api.Telemetry;
using Sprint.Desktop.Features.Devices;

namespace Sprint.Desktop.Features.Hardware;

/// <summary>
/// Dash frame source for the Electron/browser render path (WEB_DESKTOP_CUTOVER):
/// an offscreen browser paints the dash and POSTs raw BGRA to the host, which
/// publishes it into a <see cref="LatestBgraFrameExchange"/>; this source reads
/// the latest published frame and composes it into the native RGB565 panel
/// buffer through <see cref="Rgb565.ComposeFromBgra"/> — the same
/// rotation/margin/offset pipeline dash painting and desktop capture use, so
/// there is exactly one place pixel math happens. A device that has not
/// received a frame yet, or whose browser output has gone quiet, keeps
/// recomposing its last known picture (black before the first frame ever
/// arrives) rather than blanking or throwing, mirroring
/// <see cref="DesktopCaptureFrameSource"/>'s honest-idle behaviour.
/// </summary>
public sealed class BrowserFrameSource : IDashFrameSource
{
    // Generous relative to the browser's normal render cadence (tens of Hz):
    // TryCopyLatest reports Unavailable past this age, in which case Render
    // simply recomposes the previously copied frame instead of blanking.
    private static readonly TimeSpan MaxFrameAge = TimeSpan.FromSeconds(10);

    private readonly LatestBgraFrameExchange _exchange;
    private readonly ScreenConfig _config;
    private readonly DeviceOrientationTransform _transform;
    private readonly byte[] _bgra;
    private long _observedVersion;

    /// <summary>
    /// <paramref name="exchange"/> is owned by the caller (shared with the HTTP
    /// frame-receive path) and must already be sized to the device's logical
    /// (pre-rotation) dimensions for <paramref name="config"/>.
    /// </summary>
    public BrowserFrameSource(LatestBgraFrameExchange exchange, ScreenConfig config)
    {
        ArgumentNullException.ThrowIfNull(exchange);
        ArgumentNullException.ThrowIfNull(config);

        this._config = config;
        this.Width = config.Width;
        this.Height = config.Height;
        this._transform = DeviceOrientations.Transform(this.Width, this.Height, config.Orientation);
        if (exchange.Width != this._transform.LogicalWidth || exchange.Height != this._transform.LogicalHeight)
        {
            throw new ArgumentException(
                "Frame exchange dimensions must match the device's logical (pre-rotation) size.",
                nameof(exchange));
        }

        this._exchange = exchange;
        this._bgra = new byte[checked(this._transform.LogicalWidth * this._transform.LogicalHeight * 4)];
    }

    /// <summary>Native screen width in pixels (post-rotation).</summary>
    public int Width { get; }

    /// <summary>Native screen height in pixels (post-rotation).</summary>
    public int Height { get; }

    public ScreenFrameTiming Render(TelemetryFrame frame, Span<byte> rgb565)
    {
        ArgumentNullException.ThrowIfNull(frame);
        if (rgb565.Length < this.Width * this.Height * 2)
        {
            throw new ArgumentException("Destination buffer too small for the native screen.", nameof(rgb565));
        }

        long sourceStarted = Stopwatch.GetTimestamp();
        // Unavailable/Current both leave _bgra holding whatever it already held
        // (the last successfully copied frame, or all-zero/black before the
        // first one ever arrives); recomposing that is what keeps a slow or
        // momentarily quiet browser output showing its last known picture
        // instead of a torn or blank frame.
        this._exchange.TryCopyLatest(this._bgra, ref this._observedVersion, MaxFrameAge);
        long sourceCompleted = Stopwatch.GetTimestamp();
        Rgb565.ComposeFromBgra(
            this._bgra,
            this.Width,
            this.Height,
            this._transform,
            this._config.Margin,
            this._config.OffsetX,
            this._config.OffsetY,
            rgb565);
        long transformCompleted = Stopwatch.GetTimestamp();
        return new ScreenFrameTiming(
            Stopwatch.GetElapsedTime(sourceStarted, sourceCompleted),
            Stopwatch.GetElapsedTime(sourceCompleted, transformCompleted));
    }

    public void Dispose()
    {
        // The exchange is owned by the caller; nothing here to release.
    }
}

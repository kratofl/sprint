using Sprint.Desktop.Features.Devices;

namespace Sprint.Desktop.Features.Hardware;

/// <summary>
/// Captures a physical desktop rectangle and scales it into a caller-owned BGRA
/// buffer. Implementations may be platform-specific; the frame source stays
/// deterministic and injectable for tests.
/// </summary>
public interface IDesktopRegionCapturer
{
    bool TryCapture(
        ScreenCaptureRegion region,
        int destinationWidth,
        int destinationHeight,
        byte[] bgra);
}

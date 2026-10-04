namespace Sprint.Desktop.Features.Hardware;

using Sprint.Desktop.Features.Diagnostics;
using Sprint.Desktop.Runtime;

/// <summary>
/// Creates the appropriate <see cref="IScreenDriver"/> for a driver id (matrix 4.6
/// factory). Real WinUSB drivers are returned only on Windows. On any other OS a
/// VoCore/USBD480 device gets a driver that reports
/// <see cref="ScreenConnectionState.Unsupported"/>, so the Devices UI says the screen
/// is unavailable instead of pretending it is connected (and the publisher never
/// renders, so a rear-view capture never runs). The "fake"/unknown id, and every id
/// during a test run, gets a plain <see cref="FakeScreenDriver"/>.
/// </summary>
public static class ScreenDriverFactory
{
    public static IScreenDriver Create(string driver, ILog? log = null)
    {
        // A test run must never open the screen on the developer's desk: tests build a
        // publisher per saved screen device, and HostEffects gates that off by default.
        if (!HostEffects.Enabled)
        {
            return new FakeScreenDriver();
        }

        string? id = driver?.Trim().ToLowerInvariant();
        if (OperatingSystem.IsWindows())
        {
            switch (id)
            {
                case "vocore":
                    return new VoCoreScreenDriver(log);
                case "usbd480":
                    return new Usbd480ScreenDriver(log);
            }
        }
        else if (id is "vocore" or "usbd480")
        {
            return new FakeScreenDriver
            {
                ConnectResult = ScreenConnectionState.Unsupported,
                ConnectDetail = "USB screens are only supported on Windows.",
            };
        }

        return new FakeScreenDriver();
    }
}

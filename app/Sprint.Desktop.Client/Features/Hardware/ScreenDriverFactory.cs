namespace Sprint.Desktop.Features.Hardware;

using Sprint.Desktop.Features.Diagnostics;

/// <summary>
/// Creates the appropriate <see cref="IScreenDriver"/> for a driver id (matrix 4.6
/// factory). Real WinUSB drivers are returned only on Windows; everywhere else (and
/// for the "fake"/unknown id) a <see cref="FakeScreenDriver"/> is returned so the
/// render loop and Devices UI stay exercisable off-hardware without special-casing.
/// </summary>
public static class ScreenDriverFactory
{
    public static IScreenDriver Create(string driver, ILog? log = null)
    {
        if (OperatingSystem.IsWindows())
        {
            switch (driver?.Trim().ToLowerInvariant())
            {
                case "vocore":
                    return new VoCoreScreenDriver(log);
                case "usbd480":
                    return new Usbd480ScreenDriver(log);
            }
        }

        return new FakeScreenDriver();
    }
}

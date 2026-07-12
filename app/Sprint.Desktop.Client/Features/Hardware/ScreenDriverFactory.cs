namespace Sprint.Desktop.Features.Hardware;

/// <summary>
/// Creates the appropriate <see cref="IScreenDriver"/> for a driver id (matrix 4.6
/// factory). Real WinUSB drivers are returned only on Windows; everywhere else (and
/// for the "fake"/unknown id) a <see cref="FakeScreenDriver"/> is returned so the
/// render loop and Devices UI stay exercisable off-hardware without special-casing.
/// </summary>
public static class ScreenDriverFactory
{
    public static IScreenDriver Create(string driver)
    {
        if (OperatingSystem.IsWindows())
        {
            switch (driver?.Trim().ToLowerInvariant())
            {
                case "vocore":
                    return new VoCoreScreenDriver();
                case "usbd480":
                    return new Usbd480ScreenDriver();
            }
        }

        return new FakeScreenDriver();
    }
}

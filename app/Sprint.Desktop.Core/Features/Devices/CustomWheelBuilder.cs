using System.Text;

namespace Sprint.Desktop.Features.Devices;

/// <summary>What the user typed into the "custom wheel" form (issue #49).</summary>
/// <param name="Name">Display name for the wheel.</param>
/// <param name="HasScreen">Whether the wheel has an integrated screen.</param>
/// <param name="Driver">Screen transport (<c>vocore</c>/<c>usbd480</c>); ignored without a screen.</param>
/// <param name="Width">Screen width in pixels, or 0 to auto-detect.</param>
/// <param name="Height">Screen height in pixels, or 0 to auto-detect.</param>
public sealed record CustomWheelRequest(
    string? Name,
    bool HasScreen,
    string? Driver = null,
    int Width = 0,
    int Height = 0);

/// <summary>
/// Turns the custom-wheel form into a <see cref="CatalogDevice"/> (issue #49): users
/// can define their own wheel instead of only picking a shipped preset. Pure and
/// IO-free — validation and the resulting device shape are unit-tested, and the
/// caller just hands the result to <c>AddDevice</c>.
///
/// <para>Custom wheels carry no VID/PID, which is exactly how the shipped generic
/// entries auto-detect: the screen service claims the first unregistered display of
/// the chosen family. Leaving the resolution at 0 keeps the driver's default, which
/// hardware detection then corrects.</para>
/// </summary>
public static class CustomWheelBuilder
{
    /// <summary>Screen transports a custom wheel can declare.</summary>
    public static IReadOnlyList<string> ScreenDrivers { get; } = ["vocore", "usbd480"];

    /// <summary>Largest accepted manual resolution; guards typos like a pasted serial number.</summary>
    public const int MaxDimension = 4096;

    /// <summary>
    /// Validates <paramref name="request"/> and produces the catalog entry to add.
    /// Returns <c>false</c> with a user-facing <paramref name="error"/> when the form
    /// is incomplete; never throws on bad input.
    /// </summary>
    public static bool TryBuild(CustomWheelRequest request, out CatalogDevice device, out string? error)
    {
        ArgumentNullException.ThrowIfNull(request);
        device = new CatalogDevice();

        var name = request.Name?.Trim() ?? "";
        if (name.Length == 0)
        {
            error = "Enter a name for the wheel.";
            return false;
        }

        var driver = "";
        var width = 0;
        var height = 0;
        if (request.HasScreen)
        {
            driver = request.Driver?.Trim().ToLowerInvariant() ?? "";
            if (!ScreenDrivers.Contains(driver, StringComparer.Ordinal))
            {
                error = "Choose the screen type for this wheel.";
                return false;
            }

            width = request.Width;
            height = request.Height;
            if (width < 0 || height < 0 || width > MaxDimension || height > MaxDimension)
            {
                error = $"Resolution must be between 1 and {MaxDimension} pixels, or auto-detected.";
                return false;
            }

            // A half-filled resolution is ambiguous: either both sides are given or the
            // driver default stands in until hardware reports the real panel size.
            if (width == 0 != (height == 0))
            {
                error = "Enter both width and height, or use auto-detect.";
                return false;
            }
        }

        device = new CatalogDevice
        {
            Id = $"custom-wheel-{Slug(name)}",
            Name = name,
            Description = Describe(request.HasScreen, driver, width, height),
            Type = "wheel",
            Vid = 0,
            Pid = 0,
            Width = width,
            Height = height,
            Rotation = 0,
            OffsetX = 0,
            OffsetY = 0,
            Margin = 0,
            Driver = driver,
            Bindings = [],
        };

        error = null;
        return true;
    }

    /// <summary>The label shown for a screen transport in the form.</summary>
    public static string DriverLabel(string driver) =>
        driver.Trim().ToLowerInvariant() switch
        {
            "vocore" => "VoCore",
            "usbd480" => "USBD480",
            _ => driver,
        };

    /// <summary>The transport for a form label, or <c>null</c> when unknown.</summary>
    public static string? DriverForLabel(string? label) =>
        ScreenDrivers.FirstOrDefault(driver =>
            string.Equals(DriverLabel(driver), label?.Trim(), StringComparison.OrdinalIgnoreCase));

    private static string Describe(bool hasScreen, string driver, int width, int height)
    {
        if (!hasScreen)
        {
            return "Custom wheel — buttons and encoders only, no screen.";
        }

        var resolution = width > 0 && height > 0 ? $"{width} × {height}" : "auto-detected resolution";
        return $"Custom wheel — {DriverLabel(driver)} screen, {resolution}.";
    }

    private static string Slug(string name)
    {
        var slug = new StringBuilder(name.Length);
        foreach (var c in name.ToLowerInvariant())
        {
            if (char.IsAsciiLetterOrDigit(c))
            {
                slug.Append(c);
            }
            else if (slug.Length > 0 && slug[^1] != '-')
            {
                slug.Append('-');
            }
        }

        return slug.ToString().Trim('-') is { Length: > 0 } trimmed ? trimmed : "wheel";
    }
}

namespace Sprint.Desktop.Features.Devices;

public enum DeviceOrientation
{
    Portrait = 0,
    Landscape = 90,
    PortraitInverted = 180,
    LandscapeInverted = 270,
}

public enum PixelRotation
{
    None = 0,
    Clockwise90 = 90,
    Clockwise180 = 180,
    Clockwise270 = 270,
}

public sealed record DeviceOrientationOption(DeviceOrientation Orientation, string Label);
public readonly record struct DeviceOrientationTransform(
    int LogicalWidth,
    int LogicalHeight,
    PixelRotation PixelRotation);

/// <summary>
/// User-facing device orientation catalog. Rotation stays persisted as degrees,
/// while controls and selector geometry use stable names and explicit orientation.
/// </summary>
public static class DeviceOrientations
{
    public static IReadOnlyList<DeviceOrientationOption> All { get; } =
    [
        new(DeviceOrientation.Portrait, "Portrait"),
        new(DeviceOrientation.Landscape, "Landscape"),
        new(DeviceOrientation.PortraitInverted, "Portrait inverted"),
        new(DeviceOrientation.LandscapeInverted, "Landscape inverted"),
    ];

    public static IReadOnlyList<string> Labels { get; } =
        All.Select(orientation => orientation.Label).ToArray();

    public static DeviceOrientation Resolve(int rotation)
    {
        var normalized = ((rotation % 360) + 360) % 360;
        return Enum.IsDefined(typeof(DeviceOrientation), normalized)
            ? (DeviceOrientation)normalized
            : DeviceOrientation.Portrait;
    }

    public static bool IsLandscape(DeviceOrientation orientation) =>
        orientation is DeviceOrientation.Landscape or DeviceOrientation.LandscapeInverted;

    public static DeviceOrientationTransform Transform(
        int nativeWidth,
        int nativeHeight,
        DeviceOrientation orientation)
    {
        if (nativeWidth <= 0 || nativeHeight <= 0)
        {
            throw new ArgumentOutOfRangeException(
                nameof(nativeWidth),
                "A screen device needs a positive native size.");
        }

        var shortEdge = Math.Min(nativeWidth, nativeHeight);
        var longEdge = Math.Max(nativeWidth, nativeHeight);
        var landscape = IsLandscape(orientation);
        var logicalWidth = landscape ? longEdge : shortEdge;
        var logicalHeight = landscape ? shortEdge : longEdge;
        var nativeIsLandscape = nativeWidth >= nativeHeight;
        var baseRotation = nativeIsLandscape == landscape ? 0 : 90;
        var inverted = orientation is DeviceOrientation.PortraitInverted
            or DeviceOrientation.LandscapeInverted;

        return new DeviceOrientationTransform(
            logicalWidth,
            logicalHeight,
            (PixelRotation)(inverted ? (baseRotation + 180) % 360 : baseRotation));
    }

    public static string Label(DeviceOrientation orientation) =>
        All.First(option => option.Orientation == orientation).Label;

    public static string Label(int rotation) => Label(Resolve(rotation));

    public static DeviceOrientation? OrientationForLabel(string? label) =>
        All.FirstOrDefault(option =>
            string.Equals(option.Label, label, StringComparison.OrdinalIgnoreCase)) is { } match
            ? match.Orientation
            : null;
}

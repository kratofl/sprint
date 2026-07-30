namespace Sprint.Desktop.Features.Devices;

public sealed record DeviceOrientation(int Rotation, string Label, bool IsLandscape);

/// <summary>
/// User-facing device orientation catalog. Rotation stays persisted as degrees,
/// while controls and selector geometry use stable names and explicit orientation.
/// </summary>
public static class DeviceOrientations
{
    public static IReadOnlyList<DeviceOrientation> All { get; } =
    [
        new(0, "Portrait", false),
        new(90, "Landscape", true),
        new(180, "Portrait inverted", false),
        new(270, "Landscape inverted", true),
    ];

    public static IReadOnlyList<string> Labels { get; } =
        All.Select(orientation => orientation.Label).ToArray();

    public static DeviceOrientation Resolve(int rotation)
    {
        var normalized = ((rotation % 360) + 360) % 360;
        return All.FirstOrDefault(orientation => orientation.Rotation == normalized) ?? All[0];
    }

    public static string Label(int rotation) => Resolve(rotation).Label;

    public static int? RotationForLabel(string? label) =>
        All.FirstOrDefault(orientation =>
            string.Equals(orientation.Label, label, StringComparison.OrdinalIgnoreCase))?.Rotation;
}

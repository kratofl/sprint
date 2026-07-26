namespace Sprint.Desktop.Features.Devices;

/// <summary>
/// One thing a device's screen can be used for. <see cref="Available"/> marks the
/// purposes Sprint can actually render today; the rest are declared so a user can
/// label a screen ahead of the feature landing, and so the UI can say plainly that
/// nothing is being sent yet.
/// </summary>
public sealed record DevicePurpose(string Id, string Label, string Description, bool Available);

/// <summary>
/// The device-purpose catalog (issue #53). A purpose decides what output a screen
/// gets: only <see cref="Dash"/> drives a dash layout, so a screen set to any other
/// purpose is deliberately left idle until that output exists. Pure and IO-free —
/// persistence normalizes through <see cref="Normalize"/> so an unknown or missing
/// value always resolves to the dash default rather than silently killing output.
/// </summary>
public static class DevicePurposes
{
    public const string Dash = "dash";
    public const string RearViewMirror = "rear-view-mirror";
    public const string Flags = "flags";
    public const string LapTimes = "lap-times";

    public static IReadOnlyList<DevicePurpose> All { get; } =
    [
        new(Dash, "Dash", "Render an assigned dash layout on this screen.", true),
        new(
            RearViewMirror,
            "Rear view mirror",
            "Show the car's rear view on this screen (tracked in issue #41).",
            false),
        new(Flags, "Flags", "Show marshalling flags and session state.", false),
        new(LapTimes, "Lap times", "Show a Racelogic-style lap time and delta readout.", false),
    ];

    /// <summary>The labels in catalog order, for a purpose dropdown.</summary>
    public static IReadOnlyList<string> Labels { get; } = All.Select(purpose => purpose.Label).ToArray();

    public static DevicePurpose? Find(string? id) =>
        string.IsNullOrWhiteSpace(id)
            ? null
            : All.FirstOrDefault(purpose => string.Equals(purpose.Id, id.Trim(), StringComparison.OrdinalIgnoreCase));

    public static DevicePurpose? FindByLabel(string? label) =>
        string.IsNullOrWhiteSpace(label)
            ? null
            : All.FirstOrDefault(purpose => string.Equals(purpose.Label, label.Trim(), StringComparison.OrdinalIgnoreCase));

    /// <summary>The purpose for an id, falling back to dash for blank/unknown values.</summary>
    public static DevicePurpose Resolve(string? id) => Find(id) ?? All[0];

    /// <summary>Canonical id for a persisted value; blank/unknown normalizes to dash.</summary>
    public static string Normalize(string? id) => Resolve(id).Id;

    /// <summary>True when the device should be driven with a dash layout.</summary>
    public static bool IsDash(string? id) => string.Equals(Normalize(id), Dash, StringComparison.Ordinal);
}

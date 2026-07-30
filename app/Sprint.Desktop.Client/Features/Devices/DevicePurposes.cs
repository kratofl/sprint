namespace Sprint.Desktop.Features.Devices;

public enum DevicePurposeOutputKind
{
    DashboardLayout,
    BuiltInFlagLayout,
    BuiltInLapTimerLayout,
    PendingRearViewVideo,
}

/// <summary>
/// One task a device screen can perform. Availability is derived from its output kind
/// so the catalog cannot claim a pending source is ready. Pending purposes remain
/// selectable so intent is persisted and the UI can explain what is needed next.
/// </summary>
public sealed record DevicePurpose(
    string Id,
    string Label,
    string Description,
    DevicePurposeOutputKind Output)
{
    public bool Available => Output is not DevicePurposeOutputKind.PendingRearViewVideo;
}

/// <summary>
/// The device-purpose catalog (issue #53). A purpose decides what output a screen
/// gets: a user dashboard, a built-in focused display, or a future video source. Pure
/// and IO-free — persistence normalizes through <see cref="Normalize"/> so an unknown
/// or missing value resolves to the dashboard default rather than silently killing
/// output.
/// </summary>
public static class DevicePurposes
{
    public const string Dash = "dash";
    public const string RearViewMirror = "rear-view-mirror";
    public const string Flags = "flags";
    public const string LapTimes = "lap-times";

    public static IReadOnlyList<DevicePurpose> All { get; } =
    [
        new(
            Dash,
            "Dashboard",
            "Show a customizable racing dashboard.",
            DevicePurposeOutputKind.DashboardLayout),
        new(
            RearViewMirror,
            "Rear-view mirror",
            "Show live rear-view video from the game on this screen.",
            DevicePurposeOutputKind.PendingRearViewVideo),
        new(
            Flags,
            "Flag display",
            "Show the active marshalling flag at maximum glanceability.",
            DevicePurposeOutputKind.BuiltInFlagLayout),
        new(
            LapTimes,
            "Lap timer",
            "Show current, last, and best lap times with a live delta.",
            DevicePurposeOutputKind.BuiltInLapTimerLayout),
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

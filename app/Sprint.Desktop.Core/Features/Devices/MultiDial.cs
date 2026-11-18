using System.Text.Json.Serialization;
using Sprint.Desktop.Features.Input;

namespace Sprint.Desktop.Features.Devices;

/// <summary>
/// A preset wheel's multi-position switch, as its preset JSON describes it
/// (<see cref="CatalogDevice.MultiDial"/>): where it sits on the device picture and which held
/// input each position reports, in order clockwise from the top-right position.
/// </summary>
public sealed record MultiDialLayout
{
    [JsonPropertyName("label")]
    public string Label { get; init; } = "";

    /// <summary>The dial's centre on the device picture, as a fraction of its width.</summary>
    [JsonPropertyName("x")]
    public double X { get; init; }

    /// <summary>The dial's centre on the device picture, as a fraction of its height.</summary>
    [JsonPropertyName("y")]
    public double Y { get; init; }

    /// <summary>The dial's outer radius, printed labels included, as a fraction of the picture's width.</summary>
    [JsonPropertyName("radius")]
    public double Radius { get; init; }

    [JsonPropertyName("positions")]
    public List<MultiDialPosition> Positions { get; init; } = [];
}

/// <summary>One dial position: the input the wheel holds while it is selected, and its default name and colour.</summary>
public sealed record MultiDialPosition
{
    [JsonPropertyName("input")]
    public string Input { get; init; } = "";

    [JsonPropertyName("label")]
    public string Label { get; init; } = "";

    [JsonPropertyName("color")]
    public string Color { get; init; } = "";
}

/// <summary>A position's name and colour as the dash popup shows it.</summary>
public sealed record MultiDialLabel(string Label, string Color);

/// <summary>
/// The driver's own names and colours for a wheel's dial positions, and which of the driver's dash
/// modes (<c>DashMode.Id</c>) each position switches on. Stored on the saved device; null until first
/// edited, so the preset's defaults apply until then. The colours only colour the dash popup --
/// nothing is sent to the wheel. How the popup shows (size, inversion, duration) is the app-wide
/// <c>dial_change</c> alert's; an older file's per-device <c>invertPopup</c> is ignored.
/// </summary>
public sealed record MultiDialSettings
{
    public List<MultiDialLabel> Positions { get; init; } = [];

    /// <summary>Per position (by index), the dash mode it switches on; null or missing: none.</summary>
    public List<string?> Modes { get; init; } = [];
}

/// <summary>Everything the desktop needs about one saved wheel's dial, as /api/state reports it.</summary>
public sealed record MultiDialState(
    string DeviceId,
    string Label,
    double X,
    double Y,
    double Radius,
    IReadOnlyList<MultiDialLabel> Positions,
    IReadOnlyList<string?> Modes,
    int? Position,
    int Changes);

/// <summary>
/// Pure rules joining a saved device to its preset's dial: which devices have one, the names
/// in force, editing one position, and the state /api/state reports.
/// </summary>
public static class MultiDials
{
    /// <summary>The longest name a position takes: the popup prints it in big letters.</summary>
    public const int MaxLabelLength = 8;

    /// <summary>
    /// The catalog entry a saved device came from: its recorded preset id, or -- for a device
    /// saved before preset ids were recorded -- the entry with its name, type and driver (the
    /// same fallback the desktop uses for the device picture).
    /// </summary>
    public static CatalogDevice? PresetOf(SavedDevice device, IEnumerable<CatalogDevice> catalog)
    {
        List<CatalogDevice> entries = catalog.ToList();
        return string.IsNullOrEmpty(device.PresetId)
            ? entries.FirstOrDefault(entry =>
                string.Equals(entry.Name, device.Name, StringComparison.Ordinal)
                && string.Equals(entry.Type, device.Type, StringComparison.OrdinalIgnoreCase)
                && string.Equals(entry.Driver, device.Driver, StringComparison.OrdinalIgnoreCase))
            : entries.FirstOrDefault(entry => string.Equals(entry.Id, device.PresetId, StringComparison.OrdinalIgnoreCase));
    }

    /// <summary>The device's dial layout, or null when its preset has none.</summary>
    public static MultiDialLayout? LayoutOf(SavedDevice device, IEnumerable<CatalogDevice> catalog) =>
        PresetOf(device, catalog)?.MultiDial is { Positions.Count: > 0 } layout ? layout : null;

    /// <summary>The names in force: the driver's own where set, the preset's default otherwise.</summary>
    public static IReadOnlyList<MultiDialLabel> LabelsOf(MultiDialLayout layout, MultiDialSettings? settings) =>
        layout.Positions
            .Select((position, index) => settings is not null && index < settings.Positions.Count
                ? settings.Positions[index]
                : new MultiDialLabel(position.Label, position.Color))
            .ToList();

    /// <summary>The settings with one position renamed and recoloured; every other position keeps the name in force.</summary>
    public static MultiDialSettings WithPosition(MultiDialLayout layout, MultiDialSettings? settings, int index, MultiDialLabel label)
    {
        List<MultiDialLabel> labels = LabelsOf(layout, settings).ToList();
        labels[index] = label;
        return (settings ?? new MultiDialSettings()) with { Positions = labels };
    }

    /// <summary>Each position's dash mode (by index, as many as the dial has positions); null where none is set.</summary>
    public static IReadOnlyList<string?> ModesOf(MultiDialLayout layout, MultiDialSettings? settings) =>
        layout.Positions.Select((_, index) => settings is not null && index < settings.Modes.Count ? settings.Modes[index] : null).ToList();

    /// <summary>The settings with one position switching on <paramref name="modeId"/> (null: none).</summary>
    public static MultiDialSettings WithMode(MultiDialLayout layout, MultiDialSettings? settings, int index, string? modeId)
    {
        List<string?> modes = ModesOf(layout, settings).ToList();
        modes[index] = modeId;
        return (settings ?? new MultiDialSettings()) with { Positions = LabelsOf(layout, settings).ToList(), Modes = modes };
    }

    /// <summary>
    /// The dash mode the device's dial switches on right now: the mode of the position it sits on,
    /// when that mode still exists (<paramref name="known"/>). Null while the dial has not reported.
    /// </summary>
    public static string? ActiveMode(SavedDevice device, MultiDialLayout layout, MultiDialStatus status, Func<string, bool> known) =>
        status.Position is int position && position < layout.Positions.Count
        && ModesOf(layout, device.MultiDial)[position] is { } modeId && known(modeId)
            ? modeId
            : null;

    /// <summary>What the tracker should listen to: one source per enabled device whose preset has a dial.</summary>
    public static IReadOnlyList<MultiDialSource> Sources(IEnumerable<SavedDevice> devices, IEnumerable<CatalogDevice> catalog)
    {
        List<CatalogDevice> entries = catalog.ToList();
        List<MultiDialSource> sources = [];
        foreach (SavedDevice device in devices.Where(device => !device.Disabled))
        {
            CatalogDevice? preset = PresetOf(device, entries);
            if (preset?.MultiDial is { Positions.Count: > 0 } layout)
            {
                sources.Add(new MultiDialSource(device.Id, preset.Detect, layout.Positions.Select(position => position.Input).ToList()));
            }
        }

        return sources;
    }

    /// <summary>The /api/state view of every saved device with a dial.</summary>
    public static IReadOnlyList<MultiDialState> Describe(IEnumerable<SavedDevice> devices, IEnumerable<CatalogDevice> catalog, MultiDialTracker tracker)
    {
        List<CatalogDevice> entries = catalog.ToList();
        List<MultiDialState> states = [];
        foreach (SavedDevice device in devices)
        {
            if (LayoutOf(device, entries) is not { } layout)
            {
                continue;
            }

            MultiDialStatus status = tracker.StatusOf(device.Id);
            states.Add(new MultiDialState(
                device.Id,
                layout.Label,
                layout.X,
                layout.Y,
                layout.Radius,
                LabelsOf(layout, device.MultiDial),
                ModesOf(layout, device.MultiDial),
                status.Position,
                status.Changes));
        }

        return states;
    }
}

using System.Text.Json.Serialization;

namespace Sprint.Desktop.Features.Devices;

public sealed class CatalogDevice
{
    [JsonPropertyName("id")]
    public string Id { get; set; } = "";

    [JsonPropertyName("name")]
    public string Name { get; set; } = "";

    [JsonPropertyName("description")]
    public string Description { get; set; } = "";

    [JsonPropertyName("type")]
    public string Type { get; set; } = "screen";

    [JsonPropertyName("vid")]
    public ushort Vid { get; set; }

    [JsonPropertyName("pid")]
    public ushort Pid { get; set; }

    [JsonPropertyName("width")]
    public int Width { get; set; }

    [JsonPropertyName("height")]
    public int Height { get; set; }

    [JsonPropertyName("rotation")]
    public int Rotation { get; set; }

    [JsonPropertyName("offset_x")]
    public int OffsetX { get; set; }

    [JsonPropertyName("offset_y")]
    public int OffsetY { get; set; }

    [JsonPropertyName("margin")]
    public int Margin { get; set; }

    [JsonPropertyName("driver")]
    public string Driver { get; set; } = "";

    [JsonPropertyName("bindings")]
    public List<DeviceBinding> Bindings { get; set; } = [];
}

public sealed class SavedDevice
{
    public string Id { get; set; } = "";
    public string Name { get; set; } = "";
    public string Driver { get; set; } = "";
    public string Type { get; set; } = "screen";
    public ushort Vid { get; set; }
    public ushort Pid { get; set; }
    public string Serial { get; set; } = "";
    public int Width { get; set; }
    public int Height { get; set; }
    public int Rotation { get; set; }
    public int OffsetX { get; set; }
    public int OffsetY { get; set; }
    public int Margin { get; set; }
    public string DashId { get; set; } = "default";
    public List<DeviceBinding> Bindings { get; set; } = [];
    public bool Disabled { get; set; }
}

public sealed class DeviceBinding
{
    [JsonPropertyName("input")]
    public string Input { get; set; } = "";

    [JsonPropertyName("command")]
    public string Command { get; set; } = "";
}

/// <summary>
/// Pure dash↔screen assignment queries shared by the shell and its tests (PRD #122
/// US28/US29/US34). Keeps the "which screens will show this dash" rule in one place
/// so the Apply-to-screen gating and the Devices/Home assignment views agree.
/// </summary>
public static class DashDeviceAssignments
{
    /// <summary>
    /// The enabled screen devices whose assigned dash is <paramref name="dashId"/>. These
    /// are exactly the screens an "Apply to screen" for that dash would drive, so an empty
    /// result means the action has nothing to push to (US34 honesty gate).
    /// </summary>
    public static IReadOnlyList<SavedDevice> EnabledScreensFor(IEnumerable<SavedDevice> devices, string? dashId)
    {
        ArgumentNullException.ThrowIfNull(devices);
        if (string.IsNullOrEmpty(dashId))
        {
            return [];
        }

        return devices
            .Where(device => !device.Disabled
                && string.Equals(device.Type, "screen", StringComparison.OrdinalIgnoreCase)
                && string.Equals(device.DashId, dashId, StringComparison.Ordinal))
            .ToList();
    }
}

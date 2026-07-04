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

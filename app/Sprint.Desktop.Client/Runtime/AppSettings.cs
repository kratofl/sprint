using System.Text.Json.Serialization;

namespace Sprint.Desktop.Runtime;

public sealed class AppSettings
{
    [JsonPropertyName("sidebarCollapsed")]
    public bool SidebarCollapsed { get; set; }

    [JsonPropertyName("updateChannel")]
    public string UpdateChannel { get; set; } = "stable";

    [JsonPropertyName("driverName")]
    public string DriverName { get; set; } = "Your Name";

    [JsonPropertyName("driverNumber")]
    public string DriverNumber { get; set; } = "22";

    [JsonPropertyName("dashEditorUI")]
    public DashEditorUiSettings DashEditorUI { get; set; } = new();

    [JsonPropertyName("newDashDefaults")]
    public NewDashDefaults NewDashDefaults { get; set; } = new();
}

public sealed class NewDashDefaults
{
    [JsonPropertyName("mode")]
    public string Mode { get; set; } = "basic";

    [JsonPropertyName("display")]
    public string Display { get; set; } = "";

    [JsonPropertyName("speedUnit")]
    public string SpeedUnit { get; set; } = "km/h";

    [JsonPropertyName("tempUnit")]
    public string TempUnit { get; set; } = "c";
}

public sealed class DashEditorUiSettings
{
    [JsonPropertyName("palette")]
    public DockPanelState Palette { get; set; } = new();

    [JsonPropertyName("inspector")]
    public DockPanelState Inspector { get; set; } = new();
}

public sealed class DockPanelState
{
    [JsonPropertyName("open")]
    public bool Open { get; set; } = true;

    [JsonPropertyName("pinned")]
    public bool Pinned { get; set; } = true;
}

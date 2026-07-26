using System.Text.Json.Serialization;

namespace Sprint.Desktop.Runtime;

public sealed class AppSettings
{
    [JsonPropertyName("sidebarCollapsed")]
    public bool SidebarCollapsed { get; set; }

    [JsonPropertyName("updateChannel")]
    public string UpdateChannel { get; set; } = "stable";

    /// <summary>The two supported release channels, in ascending pre-release visibility.</summary>
    public static readonly string[] Channels = ["stable", "pre-release"];

    /// <summary>
    /// Maps a persisted or user-supplied channel string to the canonical two-channel
    /// model. Legacy <c>beta</c>/<c>alpha</c> (and any non-stable value) collapse to
    /// <c>pre-release</c>; everything else is <c>stable</c>.
    /// </summary>
    public static string NormalizeChannel(string? channel) =>
        channel?.Trim().ToLowerInvariant() switch
        {
            "pre-release" or "prerelease" or "beta" or "alpha" => "pre-release",
            _ => "stable",
        };

    [JsonPropertyName("driverName")]
    public string DriverName { get; set; } = "Your Name";

    [JsonPropertyName("driverNumber")]
    public string DriverNumber { get; set; } = "22";

    [JsonPropertyName("dashEditorUI")]
    public DashEditorUiSettings DashEditorUI { get; set; } = new();

    [JsonPropertyName("newDashDefaults")]
    public NewDashDefaults NewDashDefaults { get; set; } = new();

    [JsonPropertyName("devicesUI")]
    public DevicesUiSettings DevicesUI { get; set; } = new();
}

public sealed class DevicesUiSettings
{
    /// <summary>How the Devices overview lists saved devices: "gallery" (default) or "list".</summary>
    [JsonPropertyName("viewMode")]
    public string ViewMode { get; set; } = "gallery";

    /// <summary>Whether the device detail preview subscribes to live telemetry frames (animates) or shows a single frozen frame.</summary>
    [JsonPropertyName("livePreview")]
    public bool LivePreview { get; set; } = true;
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

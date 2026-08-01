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

    /// <summary>The most recent non-empty game/car/track telemetry reported. The Session
    /// Planner prefills new plans from this, because a plan is created before entering a
    /// car — when the live frame has nothing to offer.</summary>
    [JsonPropertyName("lastSeenContext")]
    public LastSeenContext LastSeenContext { get; set; } = new();

    /// <summary>Session Planner defaults and behaviour (#103). Desktop-local for this phase.</summary>
    [JsonPropertyName("sessionPlanner")]
    public SessionPlannerSettings SessionPlanner { get; set; } = new();
}

/// <summary>
/// Which laps a fuel/lap-time estimate is allowed to draw on.
/// <para>
/// Written as a name, not an ordinal: this is an on-disk setting, and a numeric value would
/// silently change meaning if the members were ever reordered.
/// </para>
/// </summary>
[JsonConverter(typeof(JsonStringEnumConverter<FuelHistorySource>))]
public enum FuelHistorySource
{
    /// <summary>
    /// Every valid lap for the matching game/car/track. The default: this corpus is what
    /// makes an estimate possible at all, and narrowing it by session type throws away most
    /// of it — practice is where most laps are driven.
    /// </summary>
    AllValidLaps,

    /// <summary>Only laps from the same session type as the segment being planned.</summary>
    MatchingSessionType,
}

/// <summary>What Sprint does when it detects a session the driver has no plan for. Stored by name.</summary>
[JsonConverter(typeof(JsonStringEnumConverter<AutoDetectMode>))]
public enum AutoDetectMode
{
    /// <summary>
    /// Offer a draft the driver confirms. The default, because a detected plan that armed
    /// itself would start tracking against numbers nobody agreed to.
    /// </summary>
    DraftSuggestion,

    /// <summary>Create the plan and arm it without asking, for drivers who want that.</summary>
    CreateAndArm,
}

/// <summary>
/// Global Session Planner settings (#103). These are defaults for new plans — anything a
/// plan stores itself can still be overridden per plan.
/// </summary>
public sealed class SessionPlannerSettings
{
    /// <summary>60 Hz is the default trace rate; higher rates are offered for sources and disks that keep up.</summary>
    public const int DefaultTraceCaptureHz = 60;

    /// <summary>The offered capture rates, ascending.</summary>
    public static readonly int[] TraceCaptureRates = [30, 60, 120, 240];

    /// <summary>Default fuel reserve on top of the estimate, in whole laps.</summary>
    [JsonPropertyName("fuelReserveLaps")]
    public int FuelReserveLaps { get; set; } = 1;

    [JsonPropertyName("fuelHistorySource")]
    public FuelHistorySource FuelHistorySource { get; set; } = FuelHistorySource.AllValidLaps;

    [JsonPropertyName("autoDetect")]
    public AutoDetectMode AutoDetect { get; set; } = AutoDetectMode.DraftSuggestion;

    /// <summary>Detailed trace capture rate. Consumed by trace capture (#101), which is not built yet.</summary>
    [JsonPropertyName("traceCaptureHz")]
    public int TraceCaptureHz { get; set; } = DefaultTraceCaptureHz;

    /// <summary>How long traces are kept. Bounds local disk use rather than growing forever.</summary>
    [JsonPropertyName("traceRetentionDays")]
    public int TraceRetentionDays { get; set; } = 90;

    /// <summary>A hard ceiling on trace storage, so a long stint cannot fill the disk.</summary>
    [JsonPropertyName("traceMaxTotalMegabytes")]
    public int TraceMaxTotalMegabytes { get; set; } = 4096;

    /// <summary>Warn when live telemetry disagrees with the planned race-length format.</summary>
    [JsonPropertyName("warnOnRaceFormatMismatch")]
    public bool WarnOnRaceFormatMismatch { get; set; } = true;

    /// <summary>Warn when the detected qualifying/race segment changes mid-plan.</summary>
    [JsonPropertyName("warnOnDetectedSegmentChange")]
    public bool WarnOnDetectedSegmentChange { get; set; } = true;
}

public sealed class LastSeenContext
{
    [JsonPropertyName("game")]
    public string Game { get; set; } = "";

    [JsonPropertyName("car")]
    public string Car { get; set; } = "";

    [JsonPropertyName("track")]
    public string Track { get; set; } = "";
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

using System.Text.Json;
using System.Text.Json.Serialization;
using Sprint.Desktop.Features.SessionPlanning;

namespace Sprint.Desktop.Runtime;

public sealed class AppSettings
{
    /// <summary>
    /// The shape of this file. Adding a setting does not bump it (unknown fields are kept);
    /// renaming one or changing what a value means does, with a migration on load.
    /// </summary>
    public const int CurrentVersion = 1;

    /// <summary>What wrote this file. A file from before versioning reads as 1, the shape it had.</summary>
    [JsonPropertyName("version")]
    public int Version { get; set; } = CurrentVersion;

    [JsonPropertyName("sidebarCollapsed")]
    public bool SidebarCollapsed { get; set; }

    [JsonPropertyName("updateChannel")]
    public string UpdateChannel { get; set; } = "stable";

    /// <summary>The two supported release channels, in ascending pre-release visibility.</summary>
    public static readonly string[] Channels = ["stable", "pre-release"];

    /// <summary>
    /// Updates download in the background and install when Sprint quits. Off, the driver starts
    /// each one from Settings. The Electron main process acts on it; the host only keeps it.
    /// </summary>
    [JsonPropertyName("autoInstallUpdates")]
    public bool AutoInstallUpdates { get; set; } = true;

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

    /// <summary>The placeholder driver name a fresh install starts with; the first-run setup refuses to keep it.</summary>
    public const string DefaultDriverName = "Your Name";

    [JsonPropertyName("driverName")]
    public string DriverName { get; set; } = DefaultDriverName;

    [JsonPropertyName("driverNumber")]
    public string DriverNumber { get; set; } = "22";

    /// <summary>
    /// The first-run setup (driver, game folder, results import) was finished, so it is not
    /// shown again. False by default, so an install from before the setup existed sees it once.
    /// </summary>
    [JsonPropertyName("firstRunDone")]
    public bool FirstRunDone { get; set; }

    /// <summary>
    /// The Le Mans Ultimate install folder the driver chose, or null to find it in the Steam
    /// libraries. Setups and results are read from it.
    /// </summary>
    [JsonPropertyName("gameFolder")]
    public string? GameFolder { get; set; }

    [JsonPropertyName("dashEditorUI")]
    public DashEditorUiSettings DashEditorUI { get; set; } = new();

    [JsonPropertyName("newDashDefaults")]
    public NewDashDefaults NewDashDefaults { get; set; } = new();

    /// <summary>
    /// The user's own dash categories, in creation order (the built-ins live in
    /// <c>DashCategories.BuiltIn</c>). Kept here so a category exists before any dash is in it.
    /// </summary>
    [JsonPropertyName("customDashCategories")]
    public List<string> CustomDashCategories { get; set; } = [];

    [JsonPropertyName("devicesUI")]
    public DevicesUiSettings DevicesUI { get; set; } = new();

    [JsonPropertyName("dashesUI")]
    public DashesUiSettings DashesUI { get; set; } = new();

    /// <summary>The most recent non-empty game/car/track telemetry reported. The Session
    /// Planner prefills new plans from this, because a plan is created before entering a
    /// car — when the live frame has nothing to offer.</summary>
    [JsonPropertyName("lastSeenContext")]
    public LastSeenContext LastSeenContext { get; set; } = new();

    /// <summary>Session Planner defaults and behaviour (#103). Desktop-local for this phase.</summary>
    [JsonPropertyName("sessionPlanner")]
    public SessionPlannerSettings SessionPlanner { get; set; } = new();

    /// <summary>Live Compare HUD preferences (#195).</summary>
    [JsonPropertyName("liveCompare")]
    public LiveCompareSettings LiveCompare { get; set; } = new();

    /// <summary>Where this Sprint's cloud lives (#197).</summary>
    [JsonPropertyName("cloud")]
    public CloudSettings Cloud { get; set; } = new();

    /// <summary>The live link to an engineer's desktop.</summary>
    [JsonPropertyName("liveLink")]
    public LiveLinkSettings LiveLink { get; set; } = new();

    /// <summary>Fields a newer Sprint wrote, kept so a rollback does not erase them.</summary>
    [JsonExtensionData]
    public Dictionary<string, JsonElement>? ExtensionData { get; set; }
}

/// <summary>The live link's choices on the driver's side.</summary>
public sealed class LiveLinkSettings
{
    /// <summary>Whether the engineer's pit wall gets the active session plan and its target lap.</summary>
    [JsonPropertyName("sharePlan")]
    public bool SharePlan { get; set; } = true;

    [JsonExtensionData]
    public Dictionary<string, JsonElement>? ExtensionData { get; set; }
}

/// <summary>
/// Whether this desktop uses a Sprint server, and where its data lives. Answered once by the
/// first-run setup (<see cref="SetupDone"/>), changeable later in Settings. The server address
/// and the signed-in account live in <c>cloud-session.json</c> (CloudSession), not here:
/// settings get copied between machines, a session token must not.
/// </summary>
public sealed class CloudSettings
{
    /// <summary>The first-run setup was answered — whatever the answer — so it is not shown again.</summary>
    [JsonPropertyName("setupDone")]
    public bool SetupDone { get; set; }

    [JsonPropertyName("server")]
    public CloudServerChoice Server { get; set; } = CloudServerChoice.None;

    [JsonPropertyName("storage")]
    public CloudStorageMode Storage { get; set; } = CloudStorageMode.Local;

    [JsonExtensionData]
    public Dictionary<string, JsonElement>? ExtensionData { get; set; }
}

/// <summary>Which Sprint server the driver chose. Stored by name.</summary>
[JsonConverter(typeof(JsonStringEnumConverter<CloudServerChoice>))]
public enum CloudServerChoice
{
    /// <summary>Sprint on this PC only.</summary>
    None,

    /// <summary>The official server, at the address the build ships in the host's appsettings.json.</summary>
    Official,

    /// <summary>A server the driver runs, found on the network or typed in.</summary>
    SelfHosted,
}

/// <summary>Where sessions, setups and dashes are kept once a server is connected. Stored by name.</summary>
[JsonConverter(typeof(JsonStringEnumConverter<CloudStorageMode>))]
public enum CloudStorageMode
{
    /// <summary>Only on this PC; nothing is uploaded.</summary>
    Local,

    /// <summary>On this PC and on the server, kept in step.</summary>
    Both,

    /// <summary>
    /// On the server. Finished sessions are removed from this PC once the server holds them;
    /// dashes and setups stay, because driving needs them.
    /// </summary>
    Remote,
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

/// <summary>
/// Global Session Planner settings (#103). These are defaults for new plans — anything a
/// plan stores itself can still be overridden per plan.
/// <para>
/// An older file's <c>autoDetect</c> key (online detection, #102, never built) lands in
/// <see cref="ExtensionData"/> and is written back untouched.
/// </para>
/// </summary>
public sealed class SessionPlannerSettings
{
    /// <summary>Default fuel reserve on top of the estimate, in whole laps.</summary>
    [JsonPropertyName("fuelReserveLaps")]
    public int FuelReserveLaps { get; set; } = 1;

    /// <summary>The largest reserve the planner's settings accept.</summary>
    public const int MaxFuelReserveLaps = 10;

    [JsonPropertyName("fuelHistorySource")]
    public FuelHistorySource FuelHistorySource { get; set; } = FuelHistorySource.AllValidLaps;

    /// <summary>
    /// After how many days a lap's trace is deleted, or 0 to keep every trace (the default: the
    /// driver opts into deleting, in Settings). Protection outranks it.
    /// <para>
    /// Not the earlier <c>traceRetentionDays</c>, which defaulted to 90 without anyone choosing
    /// it: a settings file that still holds that key must not read as having opted in.
    /// </para>
    /// </summary>
    [JsonPropertyName("traceExpiryDays")]
    public int TraceExpiryDays { get; set; }

    /// <summary>The longest age limit a driver can set.</summary>
    public const int MaxTraceExpiryDays = 3650;

    /// <summary>
    /// How many of the fastest valid laps per (game, track, car) keep their trace whatever the
    /// age limit: a reference lap gets old, so deleting by age alone would delete exactly the
    /// laps worth chasing.
    /// </summary>
    [JsonPropertyName("traceProtectedLapsPerContext")]
    public int TraceProtectedLapsPerContext { get; set; } = 5;

    /// <summary>These settings as the retention service's budget (#194).</summary>
    public LapTraceBudget TraceBudget() => new(
        Math.Max(0, this.TraceProtectedLapsPerContext),
        this.TraceExpiryDays > 0 ? this.TraceExpiryDays : null);

    /// <summary>Warn when live telemetry disagrees with the planned race-length format.</summary>
    [JsonPropertyName("warnOnRaceFormatMismatch")]
    public bool WarnOnRaceFormatMismatch { get; set; } = true;

    /// <summary>Warn when the detected qualifying/race segment changes mid-plan.</summary>
    [JsonPropertyName("warnOnDetectedSegmentChange")]
    public bool WarnOnDetectedSegmentChange { get; set; } = true;

    [JsonExtensionData]
    public Dictionary<string, JsonElement>? ExtensionData { get; set; }
}

/// <summary>Where one Live Compare overlay window sat on one (monitor, resolution).</summary>
public sealed class HudWindowLayout
{
    /// <summary>
    /// Identifies the overlay window and the monitor it was left on — see
    /// <c>HudLayoutStore.KeyFor</c>. Since 2026-08-07 the HUD is a set of small windows rather
    /// than one, so the window id is part of the key: each of them keeps its own place.
    /// </summary>
    [JsonPropertyName("key")]
    public string Key { get; set; } = "";

    [JsonPropertyName("x")]
    public int X { get; set; }

    [JsonPropertyName("y")]
    public int Y { get; set; }

    [JsonPropertyName("width")]
    public int Width { get; set; }

    [JsonPropertyName("height")]
    public int Height { get; set; }

    [JsonExtensionData]
    public Dictionary<string, JsonElement>? ExtensionData { get; set; }
}

/// <summary>
/// Live Compare HUD preferences (#195). The target itself is deliberately not here: it is a
/// lap in the corpus, chosen per session, and a stored target could point at a lap retention
/// has since pruned.
/// </summary>
public sealed class LiveCompareSettings
{
    /// <summary>
    /// The current shape of these preferences. Bumped when a stored default becomes wrong
    /// rather than merely different, so the next start discards it.
    /// <para>
    /// 2: the first build sized the overlay as a fraction of the screen (a third of a 2560-wide
    /// monitor) and shipped speed+pedals. Both were wrong in use, and a driver who had already
    /// opened the HUD once had the bad size and panel set persisted.
    /// </para>
    /// <para>
    /// 3: the overlay was one window holding a stack of charts. It was asked for as a set of
    /// small windows the driver drags and sizes one by one — throttle, brake and speed each on
    /// their own — so both the panel set and every stored rectangle describe a window shape
    /// that no longer exists.
    /// </para>
    /// </summary>
    public const int CurrentVersion = 3;

    /// <summary>What wrote these preferences. 0 for anything written before versioning.</summary>
    [JsonPropertyName("version")]
    public int Version { get; set; }

    /// <summary>Metres of already-driven track kept behind the car.</summary>
    [JsonPropertyName("metersBehind")]
    public double MetersBehind { get; set; } = 200;

    /// <summary>Metres ahead of the car, where a braking zone slides into view.</summary>
    [JsonPropertyName("metersAhead")]
    public double MetersAhead { get; set; } = 600;

    /// <summary>The fewest and most metres the HUD may keep behind the car.</summary>
    public const double MinMetersBehind = 50;
    public const double MaxMetersBehind = 1000;

    /// <summary>
    /// The fewest and most metres the HUD may look ahead. Under 100 m a braking zone arrives with
    /// no warning; past 2 km a chart a few hundred pixels wide no longer shows a corner's shape.
    /// </summary>
    public const double MinMetersAhead = 100;
    public const double MaxMetersAhead = 2000;

    /// <summary>Whether a rolling window of <paramref name="behind"/> and <paramref name="ahead"/> metres is one the HUD draws; the reason when not.</summary>
    public static bool IsRange(double behind, double ahead, out string error)
    {
        error = "";
        if (!double.IsFinite(behind) || behind < MinMetersBehind || behind > MaxMetersBehind)
        {
            error = $"metersBehind must be between {MinMetersBehind} and {MaxMetersBehind}";
            return false;
        }

        if (!double.IsFinite(ahead) || ahead < MinMetersAhead || ahead > MaxMetersAhead)
        {
            error = $"metersAhead must be between {MinMetersAhead} and {MaxMetersAhead}";
            return false;
        }

        return true;
    }

    /// <summary>
    /// Panel ids from the chart catalogue. One overlay window each, in this order down the
    /// screen on first open.
    /// </summary>
    [JsonPropertyName("panelIds")]
    public List<string> PanelIds { get; set; } = ["throttle", "brake", "speed"];

    /// <summary>
    /// Whether the small delta window is part of the set.
    /// <para>
    /// On by default and its own window rather than a strip inside each chart: spec §2.4
    /// requires the HUD to always name the lap it is chasing, because the wheel delta and the
    /// HUD can legitimately be measuring against different laps. Repeating that in every chart
    /// window would say it three times; dropping it would say it nowhere.
    /// </para>
    /// </summary>
    [JsonPropertyName("showDelta")]
    public bool ShowDelta { get; set; } = true;

    [JsonPropertyName("layouts")]
    public List<HudWindowLayout> Layouts { get; set; } = [];

    /// <summary>
    /// Drops preferences an older build persisted that are now wrong. Only the ones a stale
    /// value actively breaks: the driver's window position is theirs, but a size derived from a
    /// bad formula and a panel set they never chose are not.
    /// </summary>
    public bool Migrate()
    {
        if (this.Version >= CurrentVersion)
        {
            return false;
        }

        this.Version = CurrentVersion;
        this.PanelIds = ["throttle", "brake", "speed"];
        this.ShowDelta = true;
        this.Layouts.Clear();
        return true;
    }

    [JsonExtensionData]
    public Dictionary<string, JsonElement>? ExtensionData { get; set; }
}

public sealed class LastSeenContext
{
    [JsonPropertyName("game")]
    public string Game { get; set; } = "";

    [JsonPropertyName("car")]
    public string Car { get; set; } = "";

    [JsonPropertyName("track")]
    public string Track { get; set; } = "";

    [JsonExtensionData]
    public Dictionary<string, JsonElement>? ExtensionData { get; set; }
}

public sealed class DevicesUiSettings
{
    /// <summary>How the Devices overview lists saved devices: "gallery" (default) or "list".</summary>
    [JsonPropertyName("viewMode")]
    public string ViewMode { get; set; } = "gallery";

    /// <summary>Whether the device detail preview subscribes to live telemetry frames (animates) or shows a single frozen frame.</summary>
    [JsonPropertyName("livePreview")]
    public bool LivePreview { get; set; } = true;

    [JsonExtensionData]
    public Dictionary<string, JsonElement>? ExtensionData { get; set; }
}

public sealed class DashesUiSettings
{
    /// <summary>How the Dashes overview lists dashes: "gallery" (tiles, default) or "list".</summary>
    [JsonPropertyName("viewMode")]
    public string ViewMode { get; set; } = "gallery";

    [JsonExtensionData]
    public Dictionary<string, JsonElement>? ExtensionData { get; set; }
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

    [JsonExtensionData]
    public Dictionary<string, JsonElement>? ExtensionData { get; set; }
}

public sealed class DashEditorUiSettings
{
    [JsonPropertyName("palette")]
    public DockPanelState Palette { get; set; } = new();

    [JsonPropertyName("inspector")]
    public DockPanelState Inspector { get; set; } = new();

    [JsonExtensionData]
    public Dictionary<string, JsonElement>? ExtensionData { get; set; }
}

public sealed class DockPanelState
{
    [JsonPropertyName("open")]
    public bool Open { get; set; } = true;

    [JsonPropertyName("pinned")]
    public bool Pinned { get; set; } = true;

    [JsonExtensionData]
    public Dictionary<string, JsonElement>? ExtensionData { get; set; }
}

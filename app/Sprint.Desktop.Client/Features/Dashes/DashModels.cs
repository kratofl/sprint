using System.Text.Json;
using System.Text.Json.Serialization;

namespace Sprint.Desktop.Features.Dashes;

public sealed class DashLayout
{
    [JsonPropertyName("id")]
    public string Id { get; set; } = "";

    [JsonPropertyName("name")]
    public string Name { get; set; } = "";

    [JsonPropertyName("default")]
    public bool IsDefault { get; set; }

    [JsonPropertyName("mode")]
    public string Mode { get; set; } = "basic";

    /// <summary>
    /// The target wheel-screen size this dash is designed for (PRD #122). Additive
    /// and backward-compatible: blank/missing on legacy layouts normalizes to the
    /// default profile via <see cref="ScreenProfileCatalog.Resolve"/>. Drives the
    /// editor canvas aspect and the fixed grid below.
    /// </summary>
    [JsonPropertyName("screenProfile")]
    public string? ScreenProfileId { get; set; }

    [JsonPropertyName("gridCols")]
    public int GridCols { get; set; } = 20;

    [JsonPropertyName("gridRows")]
    public int GridRows { get; set; } = 12;

    [JsonPropertyName("idlePage")]
    public DashPage? IdlePage { get; set; }

    [JsonPropertyName("pages")]
    public List<DashPage> Pages { get; set; } = [];

    [JsonPropertyName("alerts")]
    public List<DashAlert> Alerts { get; set; } = [];

    [JsonPropertyName("theme")]
    public DashTheme? Theme { get; set; }

    [JsonPropertyName("alertConfig")]
    public DashAlertConfig? AlertConfig { get; set; }

    [JsonExtensionData]
    public Dictionary<string, JsonElement>? ExtensionData { get; set; }
}

/// <summary>
/// Layout-level palette overrides (WS6 theme manager). Each field is a hex colour
/// (e.g. <c>#FF6A00</c>) that replaces the corresponding <see cref="DashPalette"/>
/// slot for the whole layout when rendered; null inherits the Graphite default.
/// Resolved by <see cref="DashPalette.FromTheme"/>. Presets in <c>DashThemePresets</c>.
/// </summary>
public sealed class DashTheme
{
    [JsonPropertyName("primary")]
    public string? Primary { get; set; }

    [JsonPropertyName("accent")]
    public string? Accent { get; set; }

    [JsonPropertyName("foreground")]
    public string? Foreground { get; set; }

    [JsonPropertyName("surface")]
    public string? Surface { get; set; }

    [JsonPropertyName("border")]
    public string? Border { get; set; }

    [JsonPropertyName("success")]
    public string? Success { get; set; }

    [JsonPropertyName("warning")]
    public string? Warning { get; set; }

    [JsonPropertyName("danger")]
    public string? Danger { get; set; }

    [JsonIgnore]
    public bool IsEmpty =>
        string.IsNullOrEmpty(Primary) && string.IsNullOrEmpty(Accent) &&
        string.IsNullOrEmpty(Foreground) && string.IsNullOrEmpty(Surface) &&
        string.IsNullOrEmpty(Border) && string.IsNullOrEmpty(Success) &&
        string.IsNullOrEmpty(Warning) && string.IsNullOrEmpty(Danger);

    public DashTheme Clone() => new()
    {
        Primary = Primary,
        Accent = Accent,
        Foreground = Foreground,
        Surface = Surface,
        Border = Border,
        Success = Success,
        Warning = Warning,
        Danger = Danger,
    };
}

public sealed class DashAlertConfig
{
    [JsonPropertyName("displayMode")]
    public string DisplayMode { get; set; } = "full";

    [JsonPropertyName("durationSeconds")]
    public double DurationSeconds { get; set; } = 1.5;

    [JsonPropertyName("invertColors")]
    public bool InvertColors { get; set; }

    [JsonPropertyName("colorToken")]
    public string ColorToken { get; set; } = "auto";

    [JsonPropertyName("enabledTypes")]
    public List<string> EnabledTypes { get; set; } = [];

    [JsonIgnore]
    public bool IsDefault =>
        string.Equals(DisplayMode, "full", StringComparison.OrdinalIgnoreCase) &&
        Math.Abs(DurationSeconds - 1.5) < 0.001 &&
        !InvertColors &&
        string.Equals(ColorToken, "auto", StringComparison.OrdinalIgnoreCase) &&
        EnabledTypes.Count == 0;

    public DashAlertConfig Clone() => new()
    {
        DisplayMode = DisplayMode,
        DurationSeconds = DurationSeconds,
        InvertColors = InvertColors,
        ColorToken = ColorToken,
        EnabledTypes = EnabledTypes.ToList(),
    };
}

public sealed class DashPage
{
    [JsonPropertyName("id")]
    public string Id { get; set; } = "";

    [JsonPropertyName("name")]
    public string Name { get; set; } = "";

    [JsonPropertyName("widgets")]
    public List<DashWidget> Widgets { get; set; } = [];

    [JsonPropertyName("widgetStacks")]
    public List<DashWidgetStack> WidgetStacks { get; set; } = [];
}

/// <summary>
/// A multi-function region on a page (WS6 widget stacks): a grid rectangle holding
/// several <see cref="DashWidgetStackLayer"/>s, each a self-contained set of widgets
/// laid out in the stack's local sub-grid. One layer shows at a time — the painter
/// renders <see cref="DefaultLayerId"/> (runtime layer cycling is a documented deferral).
/// </summary>
public sealed class DashWidgetStack
{
    [JsonPropertyName("id")]
    public string Id { get; set; } = "";

    [JsonPropertyName("name")]
    public string Name { get; set; } = "";

    [JsonPropertyName("col")]
    public int Col { get; set; }

    [JsonPropertyName("row")]
    public int Row { get; set; }

    [JsonPropertyName("colSpan")]
    public int ColSpan { get; set; } = 6;

    [JsonPropertyName("rowSpan")]
    public int RowSpan { get; set; } = 4;

    [JsonPropertyName("defaultLayerId")]
    public string? DefaultLayerId { get; set; }

    [JsonPropertyName("layers")]
    public List<DashWidgetStackLayer> Layers { get; set; } = [];

    [JsonExtensionData]
    public Dictionary<string, JsonElement>? ExtensionData { get; set; }
}

public sealed class DashWidgetStackLayer
{
    [JsonPropertyName("id")]
    public string Id { get; set; } = "";

    [JsonPropertyName("name")]
    public string Name { get; set; } = "";

    [JsonPropertyName("widgets")]
    public List<DashWidget> Widgets { get; set; } = [];
}

public sealed class DashWidget
{
    [JsonPropertyName("id")]
    public string Id { get; set; } = "";

    [JsonPropertyName("type")]
    public string Type { get; set; } = "";

    [JsonPropertyName("col")]
    public int Col { get; set; }

    [JsonPropertyName("row")]
    public int Row { get; set; }

    [JsonPropertyName("colSpan")]
    public int ColSpan { get; set; } = 1;

    [JsonPropertyName("rowSpan")]
    public int RowSpan { get; set; } = 1;

    [JsonPropertyName("config")]
    public Dictionary<string, JsonElement>? Config { get; set; }

    [JsonPropertyName("style")]
    public DashWidgetStyle? Style { get; set; }

    [JsonExtensionData]
    public Dictionary<string, JsonElement>? ExtensionData { get; set; }
}

/// <summary>
/// Per-widget appearance overrides applied on top of the layout theme by the
/// painter (WS6 per-widget style inspector). Colours are Graphite token names
/// (see <see cref="DashPalette.StyleColor"/>) rather than raw hex so widgets
/// stay on-brand; <see cref="Border"/> is a tri-state override of the type's
/// default outline (null = default, true = force on, false = force off).
/// </summary>
public sealed class DashWidgetStyle
{
    [JsonPropertyName("textColor")]
    public string? TextColor { get; set; }

    [JsonPropertyName("labelColor")]
    public string? LabelColor { get; set; }

    [JsonPropertyName("border")]
    public bool? Border { get; set; }

    [JsonIgnore]
    public bool IsEmpty => string.IsNullOrEmpty(TextColor) && string.IsNullOrEmpty(LabelColor) && Border is null;
}

public sealed class DashAlert
{
    [JsonPropertyName("id")]
    public string Id { get; set; } = "";

    [JsonPropertyName("type")]
    public string Type { get; set; } = "";

    [JsonPropertyName("enabled")]
    public bool Enabled { get; set; } = true;

    [JsonPropertyName("col")]
    public int Col { get; set; } = 6;

    [JsonPropertyName("row")]
    public int Row { get; set; } = 3;

    [JsonPropertyName("colSpan")]
    public int ColSpan { get; set; } = 8;

    [JsonPropertyName("rowSpan")]
    public int RowSpan { get; set; } = 6;

    [JsonPropertyName("colorToken")]
    public string? ColorToken { get; set; }

    [JsonPropertyName("durationSeconds")]
    public double? DurationSeconds { get; set; }

    [JsonPropertyName("invertColors")]
    public bool? InvertColors { get; set; }

    [JsonIgnore]
    public bool UsesGlobalSettings => ColorToken is null && DurationSeconds is null && InvertColors is null;
}

using System.Text.Json;
using System.Text.Json.Serialization;

namespace Sprint.Desktop.Features.Dashes;

[JsonConverter(typeof(DashColorSystemJsonConverter))]
public enum DashColorSystem
{
    Functional,
    Styled,
}

public sealed class DashColorSystemJsonConverter : JsonConverter<DashColorSystem>
{
    public override DashColorSystem Read(ref Utf8JsonReader reader, Type typeToConvert, JsonSerializerOptions options) =>
        string.Equals(reader.GetString(), "styled", StringComparison.OrdinalIgnoreCase)
            ? DashColorSystem.Styled
            : DashColorSystem.Functional;

    public override void Write(Utf8JsonWriter writer, DashColorSystem value, JsonSerializerOptions options) =>
        writer.WriteStringValue(value == DashColorSystem.Styled ? "styled" : "functional");
}

/// <summary>
/// How every widget on a dash is framed and titled: separate rounded panels, one ruled
/// grid, or panels with a title bar. Independent of layout: switching it never moves or
/// resizes a widget. Drawn by <c>chrome.tsx</c> in <c>packages/dashboard</c>.
/// </summary>
[JsonConverter(typeof(DashStyleJsonConverter))]
public enum DashStyle
{
    Panels,
    Grid,
    Bars,
}

/// <summary>Reads leniently: a missing, unknown or future style name falls back to panels instead of rejecting the layout.</summary>
public sealed class DashStyleJsonConverter : JsonConverter<DashStyle>
{
    public override DashStyle Read(ref Utf8JsonReader reader, Type typeToConvert, JsonSerializerOptions options) =>
        reader.GetString()?.ToLowerInvariant() switch
        {
            "grid" => DashStyle.Grid,
            "bars" => DashStyle.Bars,
            _ => DashStyle.Panels,
        };

    public override void Write(Utf8JsonWriter writer, DashStyle value, JsonSerializerOptions options) =>
        writer.WriteStringValue(value switch
        {
            DashStyle.Grid => "grid",
            DashStyle.Bars => "bars",
            _ => "panels",
        });
}

public sealed class DashLayout
{
    [JsonPropertyName("id")]
    public string Id { get; set; } = "";

    [JsonPropertyName("name")]
    public string Name { get; set; } = "";

    /// <summary>
    /// The one category the Dashes page files this dash under: a <see cref="DashCategories.BuiltIn"/>
    /// name or one of the user's custom ones, in its known spelling. Null means "Other". Changed
    /// only through the <c>dash.setCategory</c>/<c>dash.category.*</c> commands, never by a save.
    /// </summary>
    [JsonPropertyName("category")]
    public string? Category { get; set; }

    [JsonPropertyName("mode")]
    public string Mode { get; set; } = "basic";

    [JsonPropertyName("colorSystem")]
    public DashColorSystem? ColorSystem { get; set; }

    [JsonPropertyName("dashStyle")]
    public DashStyle DashStyle { get; set; } = DashStyle.Panels;

    [JsonIgnore]
    public DashColorSystem EffectiveColorSystem => this.ColorSystem ??
        (this.Theme is { IsEmpty: false } ? DashColorSystem.Styled : DashColorSystem.Functional);

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
/// (e.g. <c>#FF6A00</c>) that replaces the corresponding dash palette slot for the
/// whole layout when rendered; null inherits the default dash palette.
/// Resolved by <c>resolveDashPalette</c> in <c>packages/dashboard/src/palette.ts</c>.
/// Presets in <see cref="DashThemePresets"/>.
/// </summary>
public sealed class DashTheme
{
    [JsonPropertyName("neutral")]
    public string? Neutral { get; set; }

    [JsonPropertyName("goodOnTarget")]
    public string? GoodOnTarget { get; set; }

    [JsonPropertyName("coldLow")]
    public string? ColdLow { get; set; }

    [JsonPropertyName("assistActive")]
    public string? AssistActive { get; set; }

    [JsonPropertyName("critical")]
    public string? Critical { get; set; }

    [JsonPropertyName("fault")]
    public string? Fault { get; set; }

    [JsonPropertyName("timingFastestOverall")]
    public string? TimingFastestOverall { get; set; }

    [JsonPropertyName("timingPersonalBest")]
    public string? TimingPersonalBest { get; set; }

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
        string.IsNullOrEmpty(this.Neutral) && string.IsNullOrEmpty(this.GoodOnTarget) &&
        string.IsNullOrEmpty(this.ColdLow) && string.IsNullOrEmpty(this.AssistActive) &&
        string.IsNullOrEmpty(this.Critical) && string.IsNullOrEmpty(this.Fault) &&
        string.IsNullOrEmpty(this.TimingFastestOverall) && string.IsNullOrEmpty(this.TimingPersonalBest) &&
        string.IsNullOrEmpty(this.Primary) && string.IsNullOrEmpty(this.Accent) &&
        string.IsNullOrEmpty(this.Foreground) && string.IsNullOrEmpty(this.Surface) &&
        string.IsNullOrEmpty(this.Border) && string.IsNullOrEmpty(this.Success) &&
        string.IsNullOrEmpty(this.Warning) && string.IsNullOrEmpty(this.Danger);

    public DashTheme Clone() => new()
    {
        Neutral = this.Neutral,
        GoodOnTarget = this.GoodOnTarget,
        ColdLow = this.ColdLow,
        AssistActive = this.AssistActive,
        Critical = this.Critical,
        Fault = this.Fault,
        TimingFastestOverall = this.TimingFastestOverall,
        TimingPersonalBest = this.TimingPersonalBest,
        Primary = this.Primary,
        Accent = this.Accent,
        Foreground = this.Foreground,
        Surface = this.Surface,
        Border = this.Border,
        Success = this.Success,
        Warning = this.Warning,
        Danger = this.Danger,
    };

    public bool NormalizeProtectedColors()
    {
        bool changed = false;
        if (!string.IsNullOrWhiteSpace(this.Critical) && !string.Equals(this.Critical, "#F02744", StringComparison.OrdinalIgnoreCase))
        {
            this.Critical = "#F02744";
            changed = true;
        }

        if (!string.IsNullOrWhiteSpace(this.Fault) && !string.Equals(this.Fault, "#F02744", StringComparison.OrdinalIgnoreCase))
        {
            this.Fault = "#F02744";
            changed = true;
        }

        return changed;
    }
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
        string.Equals(this.DisplayMode, "full", StringComparison.OrdinalIgnoreCase) &&
        Math.Abs(this.DurationSeconds - 1.5) < 0.001 &&
        !this.InvertColors &&
        string.Equals(this.ColorToken, "auto", StringComparison.OrdinalIgnoreCase) &&
        this.EnabledTypes.Count == 0;

    public DashAlertConfig Clone() => new()
    {
        DisplayMode = this.DisplayMode,
        DurationSeconds = this.DurationSeconds,
        InvertColors = this.InvertColors,
        ColorToken = this.ColorToken,
        EnabledTypes = this.EnabledTypes.ToList(),
    };
}

public sealed class DashPage
{
    [JsonPropertyName("id")]
    public string Id { get; set; } = "";

    [JsonPropertyName("name")]
    public string Name { get; set; } = "";

    /// <summary>Every widget on the page, grouped or not, in page grid coordinates and in draw order.</summary>
    [JsonPropertyName("widgets")]
    public List<DashWidget> Widgets { get; set; } = [];

    /// <summary>
    /// The page's widget groups. Flat: a widget names its group (<see cref="DashWidget.Group"/>),
    /// a group its parent. The tree and the drawing rule live in <c>groups.ts</c> in
    /// <c>packages/dashboard</c>; <see cref="DashLayoutValidator"/> enforces the shape.
    /// </summary>
    [JsonPropertyName("groups")]
    public List<DashWidgetGroup> Groups { get; set; } = [];

    /// <summary>
    /// Widget stacks as dashes saved them before groups replaced them. Read only so
    /// <see cref="DashWidgetStackMigration"/> can turn them into groups; never written.
    /// </summary>
    [JsonPropertyName("widgetStacks")]
    [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
    public List<LegacyDashWidgetStack>? LegacyWidgetStacks { get; set; }
}

/// <summary>
/// How a group shows its direct children. <see cref="Together"/> is a plain folder;
/// <see cref="OneAtATime"/> is a widget stack: each child (a widget or a group) is a layer and the
/// wheel shows <see cref="DashWidgetGroup.ShownFirst"/>, else the first. Runtime layer switching
/// (a button binding) is a documented deferral, so today a stack always shows that layer.
/// </summary>
[JsonConverter(typeof(DashGroupModeJsonConverter))]
public enum DashGroupMode
{
    Together,
    OneAtATime,
}

/// <summary>Reads leniently: an unknown or missing mode is a plain folder.</summary>
public sealed class DashGroupModeJsonConverter : JsonConverter<DashGroupMode>
{
    public override DashGroupMode Read(ref Utf8JsonReader reader, Type typeToConvert, JsonSerializerOptions options) =>
        string.Equals(reader.GetString(), "oneAtATime", StringComparison.OrdinalIgnoreCase) ? DashGroupMode.OneAtATime : DashGroupMode.Together;

    public override void Write(Utf8JsonWriter writer, DashGroupMode value, JsonSerializerOptions options) =>
        writer.WriteStringValue(value == DashGroupMode.OneAtATime ? "oneAtATime" : "together");
}

/// <summary>
/// A named group of widgets and groups on a page. Groups and widgets share one id space per page,
/// because <see cref="ShownFirst"/> names either. Optional fields are omitted when empty, so the
/// designer's copy and the host's compare equal.
/// </summary>
public sealed class DashWidgetGroup
{
    [JsonPropertyName("id")]
    public string Id { get; set; } = "";

    [JsonPropertyName("name")]
    public string Name { get; set; } = "";

    /// <summary>The group this one sits in; null on the page.</summary>
    [JsonPropertyName("parent")]
    [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
    public string? Parent { get; set; }

    [JsonPropertyName("mode")]
    public DashGroupMode Mode { get; set; } = DashGroupMode.Together;

    /// <summary>The child a one-at-a-time group shows; kept while the group is together so switching back restores it.</summary>
    [JsonPropertyName("shownFirst")]
    [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
    public string? ShownFirst { get; set; }

    /// <summary>Not drawn on the wheel, with everything in it; the widgets still hold their cells.</summary>
    [JsonPropertyName("hidden")]
    [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingDefault)]
    public bool Hidden { get; set; }
}

/// <summary>A pre-groups widget stack: a grid region whose layers lay widgets out in its own local grid.</summary>
public sealed class LegacyDashWidgetStack
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
    public List<LegacyDashWidgetStackLayer> Layers { get; set; } = [];
}

public sealed class LegacyDashWidgetStackLayer
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

    /// <summary>The <see cref="DashWidgetGroup"/> this widget sits in; null on the page.</summary>
    [JsonPropertyName("group")]
    [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
    public string? Group { get; set; }

    /// <summary>Not drawn on the wheel; the widget still holds its cells.</summary>
    [JsonPropertyName("hidden")]
    [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingDefault)]
    public bool Hidden { get; set; }

    [JsonExtensionData]
    public Dictionary<string, JsonElement>? ExtensionData { get; set; }
}

/// <summary>
/// Per-widget appearance overrides applied on top of the layout theme by the
/// painter (WS6 per-widget style inspector). Colours are dash style-color token
/// names (see <c>resolveStyleColor</c> in <c>packages/dashboard/src/palette.ts</c>)
/// rather than raw hex so widgets stay on-brand. A widget's frame is not a
/// per-widget choice: the layout's <see cref="DashLayout.DashStyle"/> draws it.
/// </summary>
public sealed class DashWidgetStyle
{
    [JsonPropertyName("textColor")]
    public string? TextColor { get; set; }

    [JsonPropertyName("labelColor")]
    public string? LabelColor { get; set; }

    [JsonIgnore]
    public bool IsEmpty => string.IsNullOrEmpty(this.TextColor) && string.IsNullOrEmpty(this.LabelColor);
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

    /// <summary>The alert's own "full" or "center" (in its grid rect); null uses <see cref="DashAlertConfig.DisplayMode"/>.</summary>
    [JsonPropertyName("displayMode")]
    public string? DisplayMode { get; set; }

    [JsonPropertyName("colorToken")]
    public string? ColorToken { get; set; }

    [JsonPropertyName("durationSeconds")]
    public double? DurationSeconds { get; set; }

    [JsonPropertyName("invertColors")]
    public bool? InvertColors { get; set; }

    [JsonIgnore]
    public bool UsesGlobalSettings => this.DisplayMode is null && this.ColorToken is null && this.DurationSeconds is null && this.InvertColors is null;
}

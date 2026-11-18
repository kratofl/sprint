using System.Text.Json;
using System.Text.Json.Serialization;

namespace Sprint.Desktop.Features.Dashes;

/// <summary>How big an alert shows: a band across the middle of the dash, or the whole dash. The renderer draws a strip full where the screen is too short for it.</summary>
public enum DashAlertSize
{
    Strip,
    Full,
}

/// <summary>
/// One alert type's app-wide settings (<c>DashAlertSettings</c> in packages/dashboard/src/alerts.ts).
/// <see cref="DurationSeconds"/> is kept while <see cref="UntilAck"/> ignores it, for when the driver
/// turns that off. <see cref="LapsLeft"/> is set on <c>fuel_low</c> only, and null on every other type.
/// </summary>
[JsonConverter(typeof(DashAlertSettingsJsonConverter))]
public sealed record DashAlertSettings(
    string Type,
    bool Enabled,
    DashAlertSize Size,
    bool InvertColors,
    double DurationSeconds,
    bool UntilAck,
    int? LapsLeft = null)
{
    /// <summary>The layout alert the renderer reads for these settings (<c>dashAlertFromSettings</c> in alerts.ts). Its grid rect only matters to a "center" alert, which settings never make.</summary>
    public DashAlert ToLayoutAlert() => new()
    {
        Id = this.Type,
        Type = this.Type,
        Enabled = this.Enabled,
        Col = 0,
        Row = 0,
        ColSpan = 1,
        RowSpan = 1,
        DisplayMode = DashAlertTypes.SizeName(this.Size),
        InvertColors = this.InvertColors,
        DurationSeconds = this.DurationSeconds,
        UntilAck = this.UntilAck,
        LapsLeft = this.LapsLeft,
    };

    /// <summary>These settings inside the ranges the renderer draws: the duration within the type's limits, <see cref="LapsLeft"/> 1–9 on <c>fuel_low</c> and null elsewhere.</summary>
    public DashAlertSettings Clamped()
    {
        double duration = double.IsFinite(this.DurationSeconds)
            ? Math.Clamp(this.DurationSeconds, DashAlertTypes.MinSeconds, DashAlertTypes.MaxSeconds(this.Type))
            : DashAlertTypes.DefaultOf(this.Type)?.DurationSeconds ?? DashAlertTypes.MinSeconds;
        int? lapsLeft = this.Type == DashAlertTypes.FuelLow
            ? Math.Clamp(this.LapsLeft ?? DashAlertTypes.DefaultFuelLapsLeft, DashAlertTypes.MinLapsLeft, DashAlertTypes.MaxLapsLeft)
            : null;
        return this with { DurationSeconds = duration, LapsLeft = lapsLeft };
    }
}

/// <summary>
/// Every alert type, by its wire id, and its settings before the driver changes them. The same
/// list as <c>dashAlertTypes</c>/<c>dashAlertDefaults</c> in packages/dashboard/src/alerts.ts and
/// the renderer's own (renderer/src/alerts.rs); keep the three in step.
/// </summary>
public static class DashAlertTypes
{
    public const string FuelLow = "fuel_low";
    public const string LapSummary = "lap_summary";

    /// <summary>The shortest and longest an alert stays up, seconds; the lap summary keeps to <see cref="LapSummaryMaxSeconds"/>.</summary>
    public const double MinSeconds = 1;
    public const double MaxAlertSeconds = 30;
    public const double LapSummaryMaxSeconds = 15;

    /// <summary>The range of <c>fuel_low</c>'s laps-left threshold.</summary>
    public const int MinLapsLeft = 1;
    public const int MaxLapsLeft = 9;
    public const int DefaultFuelLapsLeft = 2;

    /// <summary>Every type's defaults, in the order the app lists them.</summary>
    public static readonly IReadOnlyList<DashAlertSettings> Defaults =
    [
        new("tc_change", true, DashAlertSize.Full, false, 2, false),
        new("abs_change", true, DashAlertSize.Full, false, 2, false),
        new("bias_change", true, DashAlertSize.Strip, false, 2, false),
        new("enginemap_change", true, DashAlertSize.Strip, false, 2, false),
        new("migration_change", true, DashAlertSize.Strip, false, 2, false),
        new("arb_change", false, DashAlertSize.Strip, false, 2, false),
        new("dial_change", true, DashAlertSize.Strip, false, 2, false),
        new("pit_limiter", true, DashAlertSize.Strip, false, 3, true),
        new("flag", true, DashAlertSize.Strip, false, 3, false),
        new("penalty", true, DashAlertSize.Full, true, 5, true),
        new("damage", true, DashAlertSize.Full, false, 5, false),
        new("engine_warning", true, DashAlertSize.Full, true, 5, true),
        new(FuelLow, true, DashAlertSize.Strip, false, 3, true, DefaultFuelLapsLeft),
        new(LapSummary, true, DashAlertSize.Full, false, 5, false),
    ];

    public static bool IsKnown(string type) => DefaultOf(type) is not null;

    public static DashAlertSettings? DefaultOf(string type) =>
        Defaults.FirstOrDefault(alert => string.Equals(alert.Type, type, StringComparison.Ordinal));

    /// <summary>The longest an alert of <paramref name="type"/> may stay up (the renderer clamps to the same).</summary>
    public static double MaxSeconds(string type) => type == LapSummary ? LapSummaryMaxSeconds : MaxAlertSeconds;

    /// <summary>The wire name of a size, as the layout's <c>displayMode</c> and the settings file spell it.</summary>
    public static string SizeName(DashAlertSize size) => size == DashAlertSize.Strip ? "strip" : "full";

    /// <summary>The size a wire name spells, or null for anything else.</summary>
    public static DashAlertSize? ParseSize(string? name) => name switch
    {
        "strip" => DashAlertSize.Strip,
        "full" => DashAlertSize.Full,
        _ => null,
    };
}

/// <summary>
/// The driver's alert settings, app-wide (<c>AppSettings.DashAlerts</c>, JSON <c>dashAlerts</c>):
/// one entry per alert type, always all of them, in <see cref="DashAlertTypes.Defaults"/> order. Read
/// leniently (see <see cref="Resolve"/>), so a hand-edited or older file never fails to load.
/// <para>
/// Alerts are not part of a dash: whoever hands a dash to a renderer gives it a copy with these
/// stamped on (<see cref="Stamp"/>), so every dash shows the same alerts in its own colours.
/// </para>
/// </summary>
[JsonConverter(typeof(AppDashAlertsJsonConverter))]
public sealed record AppDashAlerts(IReadOnlyList<DashAlertSettings> Alerts)
{
    public static readonly AppDashAlerts Default = new(DashAlertTypes.Defaults);

    /// <summary>All the types in order: a stored type's settings clamped into range (the first entry wins), a missing type its defaults; an unknown type is dropped.</summary>
    public static AppDashAlerts Resolve(IEnumerable<DashAlertSettings> stored)
    {
        List<DashAlertSettings> entries = stored.ToList();
        return new AppDashAlerts(DashAlertTypes.Defaults
            .Select(fallback => entries.FirstOrDefault(entry => entry.Type == fallback.Type)?.Clamped() ?? fallback)
            .ToList());
    }

    /// <summary>The settings of one type; every known type has some.</summary>
    public DashAlertSettings Of(string type) =>
        this.Alerts.FirstOrDefault(alert => alert.Type == type) ?? DashAlertTypes.DefaultOf(type) ?? throw new ArgumentException($"unknown alert type: {type}", nameof(type));

    /// <summary>These settings with <paramref name="settings"/> in place of its type's.</summary>
    public AppDashAlerts With(DashAlertSettings settings) =>
        Resolve(this.Alerts.Select(alert => alert.Type == settings.Type ? settings : alert));

    /// <summary>
    /// These settings with every alert running its duration instead of waiting for Ack: what the
    /// screens get while no device has an Ack button, so nothing stays up for good.
    /// </summary>
    public AppDashAlerts WithoutUntilAck() =>
        new(this.Alerts.Select(alert => alert with { UntilAck = false }).ToList());

    /// <summary>
    /// What a renderer is handed for <paramref name="layout"/>: a shallow copy whose <c>alerts</c> are
    /// these settings and whose <c>alertConfig</c> is neutral. The layout itself is not changed, so a
    /// stamped copy is never saved.
    /// </summary>
    public DashLayout Stamp(DashLayout layout) =>
        layout.WithAlerts(this.Alerts.Select(alert => alert.ToLayoutAlert()).ToList());
}

/// <summary>Writes one alert type's settings in the contract's shape; reads it leniently (null for an unknown type, a field of the wrong kind left at its default).</summary>
public sealed class DashAlertSettingsJsonConverter : JsonConverter<DashAlertSettings>
{
    public override DashAlertSettings? Read(ref Utf8JsonReader reader, Type typeToConvert, JsonSerializerOptions options)
    {
        using JsonDocument document = JsonDocument.ParseValue(ref reader);
        return ReadEntry(document.RootElement);
    }

    public override void Write(Utf8JsonWriter writer, DashAlertSettings value, JsonSerializerOptions options) => WriteEntry(writer, value);

    /// <summary>One stored entry over its type's defaults, clamped; null when it names no known type.</summary>
    internal static DashAlertSettings? ReadEntry(JsonElement entry)
    {
        if (entry.ValueKind != JsonValueKind.Object
            || !entry.TryGetProperty("type", out JsonElement typeElement)
            || typeElement.ValueKind != JsonValueKind.String
            || DashAlertTypes.DefaultOf(typeElement.GetString() ?? "") is not { } settings)
        {
            return null;
        }

        if (Bool(entry, "enabled") is bool enabled)
        {
            settings = settings with { Enabled = enabled };
        }

        if (entry.TryGetProperty("size", out JsonElement size) && size.ValueKind == JsonValueKind.String && DashAlertTypes.ParseSize(size.GetString()) is { } parsedSize)
        {
            settings = settings with { Size = parsedSize };
        }

        if (Bool(entry, "invertColors") is bool invert)
        {
            settings = settings with { InvertColors = invert };
        }

        if (Number(entry, "durationSeconds") is double duration)
        {
            settings = settings with { DurationSeconds = duration };
        }

        if (Bool(entry, "untilAck") is bool untilAck)
        {
            settings = settings with { UntilAck = untilAck };
        }

        if (Number(entry, "lapsLeft") is double lapsLeft && double.IsFinite(lapsLeft))
        {
            settings = settings with { LapsLeft = (int)Math.Round(Math.Clamp(lapsLeft, DashAlertTypes.MinLapsLeft, DashAlertTypes.MaxLapsLeft)) };
        }

        return settings.Clamped();
    }

    internal static void WriteEntry(Utf8JsonWriter writer, DashAlertSettings value)
    {
        writer.WriteStartObject();
        writer.WriteString("type", value.Type);
        writer.WriteBoolean("enabled", value.Enabled);
        writer.WriteString("size", DashAlertTypes.SizeName(value.Size));
        writer.WriteBoolean("invertColors", value.InvertColors);
        writer.WriteNumber("durationSeconds", value.DurationSeconds);
        writer.WriteBoolean("untilAck", value.UntilAck);
        if (value.LapsLeft is int lapsLeft)
        {
            writer.WriteNumber("lapsLeft", lapsLeft);
        }

        writer.WriteEndObject();
    }

    private static bool? Bool(JsonElement entry, string name) =>
        entry.TryGetProperty(name, out JsonElement element) && element.ValueKind is JsonValueKind.True or JsonValueKind.False
            ? element.GetBoolean()
            : null;

    private static double? Number(JsonElement entry, string name) =>
        entry.TryGetProperty(name, out JsonElement element) && element.ValueKind == JsonValueKind.Number && element.TryGetDouble(out double value)
            ? value
            : null;
}

/// <summary>Writes <c>{ "alerts": [...] }</c> with every type; reads any shape, keeping what it can (<see cref="AppDashAlerts.Resolve"/>).</summary>
public sealed class AppDashAlertsJsonConverter : JsonConverter<AppDashAlerts>
{
    // A stored null reads as the defaults rather than leaving the setting null.
    public override bool HandleNull => true;

    public override AppDashAlerts Read(ref Utf8JsonReader reader, Type typeToConvert, JsonSerializerOptions options)
    {
        using JsonDocument document = JsonDocument.ParseValue(ref reader);
        List<DashAlertSettings> stored = [];
        if (document.RootElement.ValueKind == JsonValueKind.Object
            && document.RootElement.TryGetProperty("alerts", out JsonElement alerts)
            && alerts.ValueKind == JsonValueKind.Array)
        {
            foreach (JsonElement entry in alerts.EnumerateArray())
            {
                if (DashAlertSettingsJsonConverter.ReadEntry(entry) is { } settings)
                {
                    stored.Add(settings);
                }
            }
        }

        return AppDashAlerts.Resolve(stored);
    }

    public override void Write(Utf8JsonWriter writer, AppDashAlerts value, JsonSerializerOptions options)
    {
        writer.WriteStartObject();
        writer.WriteStartArray("alerts");
        foreach (DashAlertSettings alert in value.Alerts)
        {
            DashAlertSettingsJsonConverter.WriteEntry(writer, alert);
        }

        writer.WriteEndArray();
        writer.WriteEndObject();
    }
}

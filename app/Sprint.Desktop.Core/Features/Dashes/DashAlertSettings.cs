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
/// turns that off. The numbers after it belong to one type each (<see cref="DashAlertTypes.Numbers"/>)
/// and are null on every other: <c>fuel_low</c>'s two levels, laps left (amber widgets at
/// <see cref="WarningLapsLeft"/>, red and LOW FUEL at <see cref="LapsLeft"/>); <c>engine_warning</c>'s
/// water and oil limits, °C; <c>launch</c>'s window (clutch %, speed in km/h, revs and throttle %
/// from–to); <c>lift_now</c>'s point on the game's 0–255 cue. The dash's widgets warn from them too.
/// </summary>
[JsonConverter(typeof(DashAlertSettingsJsonConverter))]
public sealed record DashAlertSettings(
    string Type,
    bool Enabled,
    DashAlertSize Size,
    bool InvertColors,
    double DurationSeconds,
    bool UntilAck,
    int? LapsLeft = null,
    int? WarningLapsLeft = null,
    int? WaterLimitCelsius = null,
    int? OilLimitCelsius = null,
    int? ClutchPercent = null,
    int? SpeedKmh = null,
    int? RpmFrom = null,
    int? RpmTo = null,
    int? ThrottleFrom = null,
    int? ThrottleTo = null,
    int? LiftPoint = null)
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
        WarningLapsLeft = this.WarningLapsLeft,
        WaterLimitCelsius = this.WaterLimitCelsius,
        OilLimitCelsius = this.OilLimitCelsius,
        ClutchPercent = this.ClutchPercent,
        SpeedKmh = this.SpeedKmh,
        RpmFrom = this.RpmFrom,
        RpmTo = this.RpmTo,
        ThrottleFrom = this.ThrottleFrom,
        ThrottleTo = this.ThrottleTo,
        LiftPoint = this.LiftPoint,
    };

    /// <summary>
    /// These settings inside the ranges the renderer draws: the duration within the type's limits,
    /// each of the type's own numbers within its range (its default when unset), the second of an
    /// <see cref="DashAlertTypes.Ordered"/> pair raised to the first, and every other type's numbers null.
    /// </summary>
    public DashAlertSettings Clamped()
    {
        double duration = double.IsFinite(this.DurationSeconds)
            ? Math.Clamp(this.DurationSeconds, DashAlertTypes.MinSeconds, DashAlertTypes.MaxSeconds(this.Type))
            : DashAlertTypes.DefaultOf(this.Type)?.DurationSeconds ?? DashAlertTypes.MinSeconds;
        DashAlertSettings clamped = this with { DurationSeconds = duration };
        foreach (DashAlertNumber number in DashAlertTypes.Numbers)
        {
            int? value = number.Type == this.Type ? Math.Clamp(number.Get(this) ?? number.Default, number.Min, number.Max) : null;
            clamped = number.With(clamped, value);
        }

        foreach ((DashAlertNumber low, DashAlertNumber high) in DashAlertTypes.Ordered)
        {
            if (low.Get(clamped) is int lowValue && high.Get(clamped) is int highValue && highValue < lowValue)
            {
                clamped = high.With(clamped, lowValue);
            }
        }

        return clamped;
    }
}

/// <summary>
/// One whole number an alert type has beside its look: its wire name (the settings file, the
/// <c>dashAlerts.update</c> command and the stamped layout alert spell it the same), its range and
/// default, and the <see cref="DashAlertSettings"/> property that holds it.
/// </summary>
public sealed record DashAlertNumber(
    string Type,
    string Name,
    int Min,
    int Max,
    int Default,
    Func<DashAlertSettings, int?> Get,
    Func<DashAlertSettings, int?, DashAlertSettings> With);

/// <summary>
/// Every alert type, by its wire id, and its settings before the driver changes them. The same
/// list as <c>dashAlertTypes</c>/<c>dashAlertDefaults</c> in packages/dashboard/src/alerts.ts and
/// the renderer's own (renderer/src/alerts.rs); keep the three in step.
/// </summary>
public static class DashAlertTypes
{
    public const string Launch = "launch";
    public const string FuelLow = "fuel_low";
    public const string EngineWarning = "engine_warning";
    public const string LiftNow = "lift_now";
    public const string LapSummary = "lap_summary";

    /// <summary>The shortest and longest an alert stays up, seconds; the lap summary keeps to <see cref="LapSummaryMaxSeconds"/>.</summary>
    public const double MinSeconds = 1;
    public const double MaxAlertSeconds = 30;
    public const double LapSummaryMaxSeconds = 15;

    /// <summary>The range of <c>fuel_low</c>'s two laps-left levels.</summary>
    public const int MinLapsLeft = 1;
    public const int MaxLapsLeft = 9;

    /// <summary>The range of <c>engine_warning</c>'s water and oil limits, °C.</summary>
    public const int MinEngineLimitCelsius = 60;
    public const int MaxEngineLimitCelsius = 160;

    /// <summary>
    /// Every type's own numbers, with their ranges and defaults (<c>FUEL_LAPS_LEFT_*</c>,
    /// <c>ENGINE_LIMIT_*</c>, <c>LAUNCH_RANGES</c>, <c>LIFT_POINT_*</c> and the defaults in alerts.ts;
    /// the renderer clamps to the same). The launch revs are only a starting point: they differ per car.
    /// </summary>
    public static readonly IReadOnlyList<DashAlertNumber> Numbers =
    [
        new(FuelLow, "lapsLeft", MinLapsLeft, MaxLapsLeft, 2, settings => settings.LapsLeft, (settings, value) => settings with { LapsLeft = value }),
        new(FuelLow, "warningLapsLeft", MinLapsLeft, MaxLapsLeft, 4, settings => settings.WarningLapsLeft, (settings, value) => settings with { WarningLapsLeft = value }),
        new(EngineWarning, "waterLimitCelsius", MinEngineLimitCelsius, MaxEngineLimitCelsius, 110, settings => settings.WaterLimitCelsius, (settings, value) => settings with { WaterLimitCelsius = value }),
        new(EngineWarning, "oilLimitCelsius", MinEngineLimitCelsius, MaxEngineLimitCelsius, 130, settings => settings.OilLimitCelsius, (settings, value) => settings with { OilLimitCelsius = value }),
        new(Launch, "clutchPercent", 5, 95, 50, settings => settings.ClutchPercent, (settings, value) => settings with { ClutchPercent = value }),
        new(Launch, "speedKmh", 1, 50, 10, settings => settings.SpeedKmh, (settings, value) => settings with { SpeedKmh = value }),
        new(Launch, "rpmFrom", 1000, 20000, 5000, settings => settings.RpmFrom, (settings, value) => settings with { RpmFrom = value }),
        new(Launch, "rpmTo", 1000, 20000, 6000, settings => settings.RpmTo, (settings, value) => settings with { RpmTo = value }),
        new(Launch, "throttleFrom", 0, 100, 20, settings => settings.ThrottleFrom, (settings, value) => settings with { ThrottleFrom = value }),
        new(Launch, "throttleTo", 0, 100, 30, settings => settings.ThrottleTo, (settings, value) => settings with { ThrottleTo = value }),
        new(LiftNow, "liftPoint", 0, 255, 220, settings => settings.LiftPoint, (settings, value) => settings with { LiftPoint = value }),
    ];

    /// <summary>
    /// The pairs of numbers whose second may never be under its first: the fuel warning's amber
    /// level and its LOW FUEL level (equal, the widgets go straight to red), and the launch windows' ends.
    /// </summary>
    public static readonly IReadOnlyList<(DashAlertNumber Low, DashAlertNumber High)> Ordered =
    [
        (NumberOf("lapsLeft"), NumberOf("warningLapsLeft")),
        (NumberOf("rpmFrom"), NumberOf("rpmTo")),
        (NumberOf("throttleFrom"), NumberOf("throttleTo")),
    ];

    /// <summary>Every type's defaults, in the order the app lists them; a type's own numbers take their <see cref="Numbers"/> defaults.</summary>
    public static readonly IReadOnlyList<DashAlertSettings> Defaults = new DashAlertSettings[]
    {
        new("tc_change", true, DashAlertSize.Full, false, 2, false),
        new("abs_change", true, DashAlertSize.Full, false, 2, false),
        new("bias_change", true, DashAlertSize.Strip, false, 2, false),
        new("enginemap_change", true, DashAlertSize.Strip, false, 2, false),
        new("migration_change", true, DashAlertSize.Strip, false, 2, false),
        new("arb_change", false, DashAlertSize.Strip, false, 2, false),
        new("dial_change", true, DashAlertSize.Strip, false, 2, false),
        new("pit_limiter", true, DashAlertSize.Strip, false, 3, true),
        new(Launch, true, DashAlertSize.Strip, false, 5, true),
        new("flag", true, DashAlertSize.Strip, false, 3, false),
        new("penalty", true, DashAlertSize.Full, true, 5, true),
        new("damage", true, DashAlertSize.Full, false, 5, false),
        new(EngineWarning, true, DashAlertSize.Full, true, 5, true),
        new(FuelLow, true, DashAlertSize.Strip, false, 3, true),
        new("pit_now", true, DashAlertSize.Strip, false, 5, true),
        new(LiftNow, true, DashAlertSize.Strip, false, 2, true),
        new(LapSummary, true, DashAlertSize.Full, false, 5, false),
    }.Select(settings => settings.Clamped()).ToList();

    /// <summary>The number spelt <paramref name="name"/> (no two types share a name).</summary>
    public static DashAlertNumber NumberOf(string name) => Numbers.Single(number => number.Name == name);

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
    /// these settings. The layout itself is not changed, so a stamped copy is never saved.
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

        foreach (DashAlertNumber number in DashAlertTypes.Numbers)
        {
            if (Number(entry, number.Name) is double value && double.IsFinite(value))
            {
                settings = number.With(settings, (int)Math.Round(Math.Clamp(value, number.Min, number.Max)));
            }
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
        foreach (DashAlertNumber number in DashAlertTypes.Numbers)
        {
            if (number.Get(value) is int set)
            {
                writer.WriteNumber(number.Name, set);
            }
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

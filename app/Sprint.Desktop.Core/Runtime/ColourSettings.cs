using System.Text.Json.Serialization;

namespace Sprint.Desktop.Runtime;

/// <summary>
/// What colours mean across Sprint, app-wide: the theme picks the colours of the cold–good–warm–hot
/// scale, the limits say where a value moves along it. The wheel dash (the host hands both to the
/// renderer in each scene's settings), the pit wall and Analysis all read the same setting, each
/// drawing its own shade of a colour. Warm is always amber and hot always red; fastest laps and
/// each knob keep their colours in every theme.
/// </summary>
public sealed record ColourSettings
{
    [JsonPropertyName("theme")]
    public ColourTheme Theme { get; init; } = ColourTheme.Sprint;

    [JsonPropertyName("limits")]
    public ColourLimits Limits { get; init; } = new();

    /// <summary>
    /// The setting as loaded: a theme Sprint does not have becomes Sprint, and limits that are
    /// missing or break a range or the order go back to the defaults.
    /// </summary>
    public ColourSettings Clean()
    {
        ColourTheme theme = Enum.IsDefined(this.Theme) ? this.Theme : ColourTheme.Sprint;
        ColourLimits limits = this.Limits is { } loaded && ColourLimits.Problem(loaded) is null ? loaded : new ColourLimits();
        return this with { Theme = theme, Limits = limits };
    }
}

/// <summary>Sprint's colour themes; each sets the scale's cold and good colours. Stored and sent by name.</summary>
[JsonConverter(typeof(JsonStringEnumConverter<ColourTheme>))]
public enum ColourTheme
{
    /// <summary>Cold blue, good green: every state its own colour.</summary>
    Sprint,

    /// <summary>Cold grey, good in the plain text colour: colour only when something is off.</summary>
    Calm,

    /// <summary>Cold red, good green: outside the window is red.</summary>
    Strict,
}

/// <summary>
/// Where values change colour, in °C and percent. Tyres are measured against the compound's ideal
/// temperature: cold more than <see cref="TyreColdBelow"/> under it, warm and hot more than
/// <see cref="TyreWarmAbove"/> and <see cref="TyreHotAbove"/> over it. Brakes in plain °C. Tyre
/// wear (tread left) and fuel and energy levels turn low, then critical, under their marks.
/// </summary>
public sealed record ColourLimits
{
    [JsonPropertyName("tyreColdBelow")]
    public int TyreColdBelow { get; init; } = 10;

    [JsonPropertyName("tyreWarmAbove")]
    public int TyreWarmAbove { get; init; } = 10;

    [JsonPropertyName("tyreHotAbove")]
    public int TyreHotAbove { get; init; } = 20;

    [JsonPropertyName("brakeColdBelow")]
    public int BrakeColdBelow { get; init; } = 300;

    [JsonPropertyName("brakeWarmAbove")]
    public int BrakeWarmAbove { get; init; } = 650;

    [JsonPropertyName("brakeHotAbove")]
    public int BrakeHotAbove { get; init; } = 800;

    [JsonPropertyName("wearLowBelow")]
    public int WearLowBelow { get; init; } = 60;

    [JsonPropertyName("wearCriticalBelow")]
    public int WearCriticalBelow { get; init; } = 30;

    [JsonPropertyName("energyLowBelow")]
    public int EnergyLowBelow { get; init; } = 50;

    [JsonPropertyName("energyCriticalBelow")]
    public int EnergyCriticalBelow { get; init; } = 20;

    /// <summary>Each limit by its wire name, with the whole numbers it accepts.</summary>
    public static readonly IReadOnlyList<ColourLimitField> Fields =
    [
        new("tyreColdBelow", 1, 40),
        new("tyreWarmAbove", 1, 40),
        new("tyreHotAbove", 2, 60),
        new("brakeColdBelow", 50, 800),
        new("brakeWarmAbove", 100, 1100),
        new("brakeHotAbove", 150, 1200),
        new("wearLowBelow", 5, 95),
        new("wearCriticalBelow", 1, 90),
        new("energyLowBelow", 5, 95),
        new("energyCriticalBelow", 1, 90),
    ];

    /// <summary>These limits with one changed by its wire name (one of <see cref="Fields"/>).</summary>
    public ColourLimits With(string name, int value) => name switch
    {
        "tyreColdBelow" => this with { TyreColdBelow = value },
        "tyreWarmAbove" => this with { TyreWarmAbove = value },
        "tyreHotAbove" => this with { TyreHotAbove = value },
        "brakeColdBelow" => this with { BrakeColdBelow = value },
        "brakeWarmAbove" => this with { BrakeWarmAbove = value },
        "brakeHotAbove" => this with { BrakeHotAbove = value },
        "wearLowBelow" => this with { WearLowBelow = value },
        "wearCriticalBelow" => this with { WearCriticalBelow = value },
        "energyLowBelow" => this with { EnergyLowBelow = value },
        "energyCriticalBelow" => this with { EnergyCriticalBelow = value },
        _ => throw new ArgumentOutOfRangeException(nameof(name), name, "not a colour limit"),
    };

    /// <summary>What makes these limits unusable (a value out of its range, or marks out of order), or null.</summary>
    public static string? Problem(ColourLimits limits)
    {
        foreach (ColourLimitField field in Fields)
        {
            int value = limits.Value(field.Name);
            if (value < field.Min || value > field.Max)
            {
                return $"{field.Name} must be a whole number from {field.Min} to {field.Max}";
            }
        }

        if (limits.TyreHotAbove <= limits.TyreWarmAbove) return "tyreHotAbove must be over tyreWarmAbove";
        if (limits.BrakeWarmAbove <= limits.BrakeColdBelow) return "brakeWarmAbove must be over brakeColdBelow";
        if (limits.BrakeHotAbove <= limits.BrakeWarmAbove) return "brakeHotAbove must be over brakeWarmAbove";
        if (limits.WearCriticalBelow >= limits.WearLowBelow) return "wearCriticalBelow must be under wearLowBelow";
        if (limits.EnergyCriticalBelow >= limits.EnergyLowBelow) return "energyCriticalBelow must be under energyLowBelow";
        return null;
    }

    private int Value(string name) => name switch
    {
        "tyreColdBelow" => this.TyreColdBelow,
        "tyreWarmAbove" => this.TyreWarmAbove,
        "tyreHotAbove" => this.TyreHotAbove,
        "brakeColdBelow" => this.BrakeColdBelow,
        "brakeWarmAbove" => this.BrakeWarmAbove,
        "brakeHotAbove" => this.BrakeHotAbove,
        "wearLowBelow" => this.WearLowBelow,
        "wearCriticalBelow" => this.WearCriticalBelow,
        "energyLowBelow" => this.EnergyLowBelow,
        "energyCriticalBelow" => this.EnergyCriticalBelow,
        _ => throw new ArgumentOutOfRangeException(nameof(name), name, "not a colour limit"),
    };
}

/// <summary>One colour limit's wire name and the whole numbers it accepts.</summary>
public sealed record ColourLimitField(string Name, int Min, int Max);

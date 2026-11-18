using Sprint.Desktop.Features.SessionPlanning;
using Sprint.Desktop.Runtime;

namespace Sprint.Desktop.Features.Devices;

/// <summary>
/// One of a device's exceptions to its own dash (<see cref="SavedDevice.DashRules"/>): while the
/// driver is in this game, class or car, the device shows <see cref="DashId"/> instead.
/// </summary>
public sealed class DeviceDashRule
{
    /// <summary><see cref="DeviceDashRules.Game"/>, <see cref="DeviceDashRules.Class"/> or <see cref="DeviceDashRules.Car"/>.</summary>
    public string Kind { get; set; } = DeviceDashRules.Car;

    /// <summary>The game as telemetry names it ("LeMansUltimate"), a class as <see cref="CarNames.ClassOf"/> spells it ("Hypercar"), or a car's name (<see cref="CarNames.Of"/>, "Hypercar BMW").</summary>
    public string Value { get; set; } = "";

    public string DashId { get; set; } = "";
}

/// <summary>The game and car the driver is in, or was last in (<see cref="LastSeenContext"/>): what a device's dash rules match against.</summary>
public sealed record DriverCar(string Game, string Car)
{
    public static DriverCar None { get; } = new("", "");

    public static DriverCar Of(LastSeenContext seen)
    {
        ArgumentNullException.ThrowIfNull(seen);
        return new DriverCar(seen.Game, seen.Car);
    }

    /// <summary>The car's class, the first word of its name ("Hypercar BMW", "LMP2 ELMS"); null when the name is the game's own, not one <see cref="CarNames"/> made.</summary>
    public string? Class => CarNames.ClassOf(this.Car.Split(' ', 2)[0]);
}

/// <summary>Which of a device's dash rules applies: a car before its class, a class before its game.</summary>
public static class DeviceDashRules
{
    public const string Game = "game";
    public const string Class = "class";
    public const string Car = "car";

    /// <summary>The most a device keeps; far more than a garage of cars needs.</summary>
    public const int MaxRules = 64;

    public const int MaxValueLength = 120;

    public static bool IsKind(string kind) => kind is Game or Class or Car;

    /// <summary>
    /// The dash the most specific matching rule names, or null when none matches. A rule whose
    /// dash no longer exists (<paramref name="exists"/>) is passed over, so a deleted dash falls
    /// back to the next rule and finally to the device's own dash.
    /// </summary>
    public static string? Pick(IReadOnlyList<DeviceDashRule> rules, DriverCar car, Func<string, bool> exists)
    {
        ArgumentNullException.ThrowIfNull(rules);
        ArgumentNullException.ThrowIfNull(car);
        ArgumentNullException.ThrowIfNull(exists);

        string? carClass = car.Class;
        DeviceDashRule? best = null;
        int bestRank = 0;
        foreach (DeviceDashRule rule in rules)
        {
            int rank = rule.Kind switch
            {
                Car when Same(rule.Value, car.Car) => 3,
                Class when carClass is not null && Same(rule.Value, carClass) => 2,
                Game when Same(rule.Value, car.Game) => 1,
                _ => 0,
            };
            if (rank > bestRank && exists(rule.DashId))
            {
                best = rule;
                bestRank = rank;
            }
        }

        return best?.DashId;
    }

    private static bool Same(string rule, string current) =>
        current.Length > 0 && string.Equals(rule.Trim(), current.Trim(), StringComparison.OrdinalIgnoreCase);
}

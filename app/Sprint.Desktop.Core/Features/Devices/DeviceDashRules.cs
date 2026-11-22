using System.Text.Json;
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

    /// <summary>
    /// The rules every device shares ("All devices", <see cref="AppSettings.DashRules"/>), matched
    /// against the same car alongside each device's own (<see cref="DeviceDashRules.Pick"/>).
    /// </summary>
    public IReadOnlyList<DeviceDashRule> AllDevices { get; init; } = [];

    /// <summary>The car in <paramref name="settings"/>' last-seen context, with its rules for every device.</summary>
    public static DriverCar Of(AppSettings settings)
    {
        ArgumentNullException.ThrowIfNull(settings);
        return new DriverCar(settings.LastSeenContext.Game, settings.LastSeenContext.Car) { AllDevices = settings.DashRules };
    }

    /// <summary>The car's class, the first word of its name ("Hypercar BMW", "LMP2 ELMS"); null when the name is the game's own, not one <see cref="CarNames"/> made.</summary>
    public string? Class => CarNames.ClassOf(this.Car.Split(' ', 2)[0]);
}

/// <summary>
/// Which dash rule applies: a car before its class, a class before its game; at the same level a
/// device's own rule before one for every device.
/// </summary>
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
    /// The dash the most specific matching rule names, of a device's own <paramref name="rules"/>
    /// and the car's rules for every device (<see cref="DriverCar.AllDevices"/>), or null when none
    /// matches. A rule whose dash no longer exists (<paramref name="exists"/>) is passed over, so a
    /// deleted dash falls back to the next rule and finally to the device's own dash.
    /// </summary>
    public static string? Pick(IReadOnlyList<DeviceDashRule> rules, DriverCar car, Func<string, bool> exists)
    {
        ArgumentNullException.ThrowIfNull(rules);
        ArgumentNullException.ThrowIfNull(car);
        ArgumentNullException.ThrowIfNull(exists);

        string? carClass = car.Class;
        string? best = null;
        int bestRank = 0;
        // A level counts twice, so a device's own rule (+1) beats one for every device at the same level.
        foreach ((DeviceDashRule rule, int own) in rules.Select(rule => (rule, 1)).Concat(car.AllDevices.Select(rule => (rule, 0))))
        {
            int level = rule.Kind switch
            {
                Car when Same(rule.Value, car.Car) => 3,
                Class when carClass is not null && Same(rule.Value, carClass) => 2,
                Game when Same(rule.Value, car.Game) => 1,
                _ => 0,
            };
            int rank = level == 0 ? 0 : level * 2 + own;
            if (rank > bestRank && exists(rule.DashId))
            {
                best = rule.DashId;
                bestRank = rank;
            }
        }

        return best;
    }

    /// <summary>
    /// Reads a rule list from a command's <c>rules</c> array: each a known kind, a value of 1 to
    /// <see cref="MaxValueLength"/> characters and a dash <paramref name="dashExists"/> knows, a
    /// kind and value once, at most <see cref="MaxRules"/>.
    /// </summary>
    public static bool TryParse(JsonElement command, Func<string, bool> dashExists, out List<DeviceDashRule> rules, out string error)
    {
        ArgumentNullException.ThrowIfNull(dashExists);
        rules = [];
        error = "";
        if (!command.TryGetProperty("rules", out JsonElement list) || list.ValueKind != JsonValueKind.Array)
        {
            error = "rules must be an array";
            return false;
        }

        if (list.GetArrayLength() > MaxRules)
        {
            error = $"at most {MaxRules} rules";
            return false;
        }

        HashSet<string> seen = new(StringComparer.OrdinalIgnoreCase);
        foreach (JsonElement element in list.EnumerateArray())
        {
            if (element.ValueKind != JsonValueKind.Object ||
                !element.TryGetProperty("kind", out JsonElement kindElement) || kindElement.ValueKind != JsonValueKind.String ||
                !element.TryGetProperty("value", out JsonElement valueElement) || valueElement.ValueKind != JsonValueKind.String ||
                !element.TryGetProperty("dashId", out JsonElement dashElement) || dashElement.ValueKind != JsonValueKind.String)
            {
                error = "each rule needs a kind, a value and a dashId";
                return false;
            }

            string kind = kindElement.GetString() ?? "";
            string value = (valueElement.GetString() ?? "").Trim();
            string dashId = dashElement.GetString() ?? "";
            if (!IsKind(kind)) { error = $"unknown rule kind '{kind}'"; return false; }
            if (value.Length == 0 || value.Length > MaxValueLength) { error = $"a rule's value must be 1 to {MaxValueLength} characters"; return false; }
            if (!dashExists(dashId)) { error = $"no dash '{dashId}'"; return false; }
            if (!seen.Add($"{kind}:{value}")) { error = $"'{value}' has two rules"; return false; }

            rules.Add(new DeviceDashRule { Kind = kind, Value = value, DashId = dashId });
        }

        return true;
    }

    /// <summary>A rule list as stored: a hand-edited file may hold a null list or a rule missing a field; matching assumes neither.</summary>
    public static List<DeviceDashRule> Clean(IEnumerable<DeviceDashRule?>? rules) =>
        (rules ?? [])
            .Where(rule => rule is not null && IsKind(rule.Kind ?? "") && !string.IsNullOrWhiteSpace(rule.Value) && !string.IsNullOrWhiteSpace(rule.DashId))
            .Select(rule => rule!)
            .ToList();

    private static bool Same(string rule, string current) =>
        current.Length > 0 && string.Equals(rule.Trim(), current.Trim(), StringComparison.OrdinalIgnoreCase);
}

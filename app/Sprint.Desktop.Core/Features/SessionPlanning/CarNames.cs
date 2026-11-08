using Sprint.Desktop.Api.Telemetry;

namespace Sprint.Desktop.Features.SessionPlanning;

/// <summary>
/// What a car is called, and therefore what laps are grouped and matched by
/// (<see cref="LapHistoryContext.CarModel"/>): the class and the make — "Hypercar BMW",
/// "LMGT3 Porsche" — and for LMP2, a spec class where every car is the Oreca 07, the
/// championship — "LMP2 ELMS", "LMP2 WEC". A livery is one entry of a car, so a friend's lap
/// in another livery of the same car is a lap on the same car.
/// </summary>
public static class CarNames
{
    // Makes longer than the model's first word. Every other make is the first word, hyphens
    // included ("Mercedes-AMG LMGT3" is a Mercedes-AMG).
    private static readonly string[] TwoWordMakes = ["Aston Martin", "Isotta Fraschini"];

    /// <summary>
    /// The car's name, or null when its class or make cannot be told. A caller keeps the name
    /// it had rather than guessing one: a lap filed under a wrong car is worse than a lap filed
    /// under a livery.
    /// </summary>
    /// <param name="carClass">The class in any spelling the game uses ("Hyper", "LMP2_ELMS", "GT3", …).</param>
    /// <param name="championship">The championship ("WEC 2026", "ELMS 2025"), or null when unknown.</param>
    /// <param name="carType">The car's model ("BMW M Hybrid V8"), or null when unknown.</param>
    public static string? Name(string? carClass, string? championship, string? carType)
    {
        string? name = ClassOf(carClass);
        if (name == "LMP2")
        {
            // The championship decides which LMP2 it is; without one, the spec the class names
            // does (LMU's LMP2_ELMS is the ELMS car, its plain LMP2 the WEC one).
            string series = SeriesOf(championship)
                ?? (Spelled(carClass) == "LMP2_ELMS" ? "ELMS" : "WEC");
            return $"LMP2 {series}";
        }

        return name is not null && MakeOf(carType) is { } make ? $"{name} {make}" : null;
    }

    /// <summary>The name of the car a live session is in, or the game's own car name when it cannot be told.</summary>
    public static string Of(SessionInfo session)
    {
        ArgumentNullException.ThrowIfNull(session);
        return Name(session.CarClass, session.CarChampionship, session.CarType) ?? session.Car;
    }

    /// <summary>
    /// The class as a car's name spells it ("Hypercar", "LMP2", "LMP3", "LMGTE", "LMGT3"), or
    /// null for a class this rule does not know.
    /// </summary>
    public static string? ClassOf(string? carClass) => Spelled(carClass) switch
    {
        "HYPER" or "HYPERCAR" or "LMH" or "LMDH" => "Hypercar",
        "LMP2" or "LMP2_ELMS" => "LMP2",
        "LMP3" => "LMP3",
        "GTE" or "LMGTE" or "GTE_AM" or "GTE_PRO" => "LMGTE",
        "GT3" or "LMGT3" => "LMGT3",
        _ => null,
    };

    /// <summary>"ELMS" or "WEC" from a championship such as "ELMS 2025", or null when it names neither.</summary>
    private static string? SeriesOf(string? championship)
    {
        string spelled = Spelled(championship);
        if (spelled.StartsWith("ELMS", StringComparison.Ordinal))
        {
            return "ELMS";
        }

        return spelled.StartsWith("WEC", StringComparison.Ordinal) ? "WEC" : null;
    }

    /// <summary>The make a model starts with, or null for no model.</summary>
    private static string? MakeOf(string? carType)
    {
        string model = carType?.Trim() ?? "";
        if (model.Length == 0)
        {
            return null;
        }

        foreach (string make in TwoWordMakes)
        {
            if (model.StartsWith(make, StringComparison.OrdinalIgnoreCase)
                && (model.Length == make.Length || model[make.Length] == ' '))
            {
                return model[..make.Length];
            }
        }

        return model.Split(' ', 2)[0];
    }

    /// <summary>A class or championship reduced to one spelling: upper case, words joined by underscores.</summary>
    private static string Spelled(string? value) =>
        string.Join('_', (value ?? "").ToUpperInvariant().Split([' ', '-', '_'], StringSplitOptions.RemoveEmptyEntries));
}

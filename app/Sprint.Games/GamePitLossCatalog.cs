using System.Text.Json;

namespace Sprint.Games;

/// <summary>
/// What a pit stop typically costs a class at a track, in seconds: <paramref name="Lane"/> the time
/// lost driving through the pit lane instead of past it, <paramref name="Standing"/> the rest of a
/// typical race stop — the same two parts Sprint measures a stop in.
/// </summary>
public sealed record TypicalPitLoss(double Lane, double Standing);

/// <summary>
/// Each track's typical pit loss per class, for before a session has a stop of its own to measure.
/// Le Mans Ultimate's comes from the bundled track data, <c>LeMansUltimate/lmu-pit-loss.json</c>
/// (refreshed by <c>app/desktop/scripts/sync-track-data.mjs</c>; credit in
/// <c>app/desktop/src/assets/tracks/README.md</c>). Its <c>dt</c> (a drive-through's loss) is the
/// lane loss and its <c>pit</c> (a typical race stop's) less that is the standing time. Other games
/// have none.
/// </summary>
public static class GamePitLossCatalog
{
    private const string LeMansUltimateResource = "Sprint.Games.LeMansUltimate.lmu-pit-loss.json";

    // Declared before the data: static fields initialise in this order.
    private static readonly JsonSerializerOptions JsonOptions = new() { PropertyNameCaseInsensitive = true };

    // Keyed by LMU's own track name in lower case, then by the data's class ("hyp", "lmp2", "gt3", …).
    private static readonly IReadOnlyDictionary<string, Dictionary<string, PitTimes>> LeMansUltimateTracks = Load(LeMansUltimateResource);

    /// <summary>
    /// The typical pit loss of <paramref name="carClass"/> (the game's own spelling) at
    /// <paramref name="track"/> (the game's own name); null for a game, track or class the data lacks.
    /// </summary>
    public static TypicalPitLoss? Typical(string? game, string? track, string? carClass)
    {
        if (!GameNames.IsLeMansUltimate(game) || string.IsNullOrWhiteSpace(track) || LeMansUltimateDataClass(carClass) is not { } dataClass)
            return null;

        if (!LeMansUltimateTracks.TryGetValue(track.Trim().ToLowerInvariant(), out Dictionary<string, PitTimes>? classes)
            || !classes.TryGetValue(dataClass, out PitTimes? times))
            return null;

        return new TypicalPitLoss(times.Dt, times.Pit - times.Dt);
    }

    /// <summary>The data's class for an LMU class (its car data's class codes); an ELMS LMP2 is an LMP2 there.</summary>
    private static string? LeMansUltimateDataClass(string? carClass) =>
        string.Join('_', (carClass ?? "").ToUpperInvariant().Split([' ', '-', '_'], StringSplitOptions.RemoveEmptyEntries)) switch
        {
            "HYPER" or "HYPERCAR" or "LMH" or "LMDH" => "hyp",
            "LMP2" or "LMP2_ELMS" => "lmp2",
            "LMP3" => "lmp3",
            "GTE" or "LMGTE" or "GTE_AM" or "GTE_PRO" => "gte",
            "GT3" or "LMGT3" => "gt3",
            _ => null,
        };

    private static Dictionary<string, Dictionary<string, PitTimes>> Load(string resource)
    {
        using Stream stream = typeof(GamePitLossCatalog).Assembly.GetManifestResourceStream(resource)
            ?? throw new InvalidOperationException($"The embedded resource {resource} is missing.");
        return JsonSerializer.Deserialize<Dictionary<string, Dictionary<string, PitTimes>>>(stream, JsonOptions) ?? [];
    }

    /// <summary>One class's entry as the sync script writes it: seconds a drive-through and a typical stop lose.</summary>
    private sealed record PitTimes(double Dt, double Pit);
}

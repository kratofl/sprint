using Sprint.Games;

namespace Sprint.Desktop.Features.Analysis;

/// <summary>The resolved car identity and the only real asset, if Sprint has one.</summary>
internal sealed record AnalysisCarArtwork(
    string Identity,
    string? AssetFileName,
    string MissingMessage)
{
    public bool IsMissing => AssetFileName is null;
}

/// <summary>A real circuit layout and the asset that draws it.</summary>
internal sealed record AnalysisTrackArtwork(string Identity, string AssetFileName);

/// <summary>
/// Resolves artwork from the car model identity, never from a broad class fallback.
/// </summary>
internal static class AnalysisArtworkCatalog
{
    /// <summary>
    /// The circuits Sprint has a real outline for, keyed by <see cref="GameTrackCatalog"/>'s
    /// circuit identity. Every layout of a circuit shares its outline; a circuit that is missing
    /// here draws no outline at all rather than borrowing another circuit's.
    /// </summary>
    private static readonly IReadOnlySet<string> CircuitsWithLayouts = new HashSet<string>(StringComparer.Ordinal)
    {
        "algarve",
        "bahrain",
        "barcelona",
        "cota",
        "daytona",
        "fuji",
        "imola",
        "interlagos",
        "le-mans",
        "monza",
        "paul-ricard",
        "sebring",
        "silverstone",
        "spa",
    };

    /// <summary>The outline for a raw track name, resolved through the game's circuit identity.</summary>
    public static AnalysisTrackArtwork? ResolveTrack(string? game, string? track) =>
        string.IsNullOrWhiteSpace(track) ? null : ResolveCircuit(GameTrackCatalog.CircuitId(game, track));

    /// <summary>The outline for a circuit identity, or null when Sprint has no real asset.</summary>
    public static AnalysisTrackArtwork? ResolveCircuit(string? circuitId) =>
        circuitId is not null && CircuitsWithLayouts.Contains(circuitId)
            ? new AnalysisTrackArtwork(circuitId, $"track-{circuitId}.svg")
            : null;

    public static AnalysisCarArtwork ResolveCar(string? game, string? carModel)
    {
        _ = game;
        var normalized = Normalize(carModel);
        return normalized switch
        {
            "porsche963" => Real("porsche-963", "car-porsche-963.jpg"),
            "ferrari296" or "ferrari296gt3" or "ferrari296lmgt3" =>
                Real("ferrari-296-gt3", "car-ferrari-296-gt3.jpg"),
            "mclaren720slmgt3evo" or "mclaren720sgt3evo" or "mclaren720s" =>
                Missing("mclaren-720s-lmgt3-evo"),
            "porsche911gt3rlmgt3" or "porsche911gt3r" or "porsche911gt3r992" =>
                Missing("porsche-911-gt3-r-lmgt3"),
            _ => Missing(string.IsNullOrWhiteSpace(normalized) ? "unknown-car" : normalized),
        };
    }

    private static AnalysisCarArtwork Real(string identity, string assetFileName) =>
        new(identity, assetFileName, string.Empty);

    private static AnalysisCarArtwork Missing(string identity) =>
        new(identity, null, "No real asset for this model");

    private static string Normalize(string? value)
    {
        if (string.IsNullOrWhiteSpace(value))
        {
            return string.Empty;
        }

        var builder = new System.Text.StringBuilder(value.Length);
        foreach (var character in value.Trim().ToLowerInvariant())
        {
            if (char.IsLetterOrDigit(character))
            {
                builder.Append(character);
            }
        }

        return builder.ToString();
    }
}

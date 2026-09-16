using System.Globalization;
using System.Text;

namespace Sprint.Games;

/// <summary>One layout of a circuit, named the way the game names it.</summary>
/// <param name="TrackName">The raw track name recorded with a session.</param>
/// <param name="Label">How the layout reads beside its siblings — "Endurance", "Mulsanne".</param>
public sealed record GameTrackLayout(string TrackName, string Label);

/// <summary>
/// One circuit and the layouts of it a corpus has actually seen.
/// </summary>
public sealed record GameCircuit(string Id, string Name, IReadOnlyList<GameTrackLayout> Layouts)
{
    /// <summary>Whether the layout is still a real question once this circuit is chosen.</summary>
    public bool LayoutIsAChoice => Layouts.Count > 1;
}

/// <summary>
/// Game-specific circuit vocabulary at the adapter boundary, the sibling of
/// <see cref="GameCarClassCatalog"/>.
/// <para>
/// A game emits one flat track name per layout — "Circuit de Spa-Francorchamps" and
/// "Circuit de Spa-Francorchamps Endurance" are two names for one place. Consumers that list
/// tracks want the place, and the layout only once the place is settled, so the grouping lives
/// here rather than in each surface that has to draw it.
/// </para>
/// <para>
/// An unrecognised name is never dropped or folded into a circuit it may not belong to: it
/// becomes its own single-layout circuit under the name the game gave.
/// </para>
/// </summary>
public static class GameTrackCatalog
{
    private sealed record LayoutDefinition(string Label, IReadOnlyList<string> Aliases);

    private sealed record CircuitDefinition(string Id, string Name, IReadOnlyList<LayoutDefinition> Layouts);

    private static readonly IReadOnlyList<CircuitDefinition> LeMansUltimateCircuits =
    [
        new("algarve", "Algarve International Circuit",
        [
            new("Grand Prix", ["Algarve International Circuit", "Portimao", "Portimão"]),
        ]),
        new("bahrain", "Bahrain International Circuit",
        [
            new("Grand Prix", ["Bahrain International Circuit", "Bahrain"]),
        ]),
        new("barcelona", "Circuit de Barcelona-Catalunya",
        [
            new("Grand Prix", ["Circuit de Barcelona", "Circuit de Barcelona-Catalunya", "Barcelona", "Catalunya"]),
        ]),
        new("cota", "Circuit of the Americas",
        [
            new("Grand Prix", ["Circuit of the Americas", "COTA", "Austin"]),
        ]),
        new("daytona", "Daytona International Speedway",
        [
            new("Road Course", ["Daytona International Speedway Road Course", "Daytona International Speedway", "Daytona"]),
        ]),
        new("fuji", "Fuji Speedway",
        [
            new("Grand Prix", ["Fuji Speedway", "Fuji"]),
            new("Classic", ["Fuji Speedway Classic"]),
        ]),
        new("imola", "Autodromo Enzo e Dino Ferrari",
        [
            new("Grand Prix", ["Autodromo Enzo e Dino Ferrari", "Imola"]),
        ]),
        new("interlagos", "Autódromo José Carlos Pace",
        [
            new("Grand Prix", ["Autódromo José Carlos Pace", "Interlagos"]),
        ]),
        new("le-mans", "Circuit de la Sarthe",
        [
            new("24 Heures du Mans", ["Circuit de la Sarthe", "Circuit des 24 Heures du Mans", "Le Mans"]),
            new("Mulsanne", ["Circuit de la Sarthe Mulsanne"]),
        ]),
        new("monza", "Autodromo Nazionale Monza",
        [
            new("Grand Prix", ["Autodromo Nazionale Monza", "Monza"]),
            new("Curva Grande", ["Monza Curva Grande Circuit", "Monza Curva Grande"]),
        ]),
        new("paul-ricard", "Circuit Paul Ricard",
        [
            new("Grand Prix", ["Circuit Paul Ricard", "Paul Ricard"]),
            new("ELMS", ["Paul Ricard - ELMS", "Circuit Paul Ricard - ELMS"]),
        ]),
        new("sebring", "Sebring International Raceway",
        [
            new("International", ["Sebring International Raceway", "Sebring"]),
        ]),
        new("silverstone", "Silverstone Circuit",
        [
            new("Grand Prix", ["Silverstone Grand Prix Circuit", "Silverstone"]),
            new("Grand Prix · ELMS", ["Silverstone Grand Prix Circuit - ELMS"]),
        ]),
        new("spa", "Circuit de Spa-Francorchamps",
        [
            new("Grand Prix", ["Circuit de Spa-Francorchamps", "Spa-Francorchamps", "Spa"]),
            new("Endurance", ["Circuit de Spa-Francorchamps Endurance", "Spa-Francorchamps Endurance"]),
        ]),
    ];

    /// <summary>
    /// The observed track names grouped into circuits, keeping the order the names arrived in so
    /// a caller's "most recently driven first" survives the grouping.
    /// </summary>
    public static IReadOnlyList<GameCircuit> Circuits(string? game, IEnumerable<string> observedTrackNames)
    {
        ArgumentNullException.ThrowIfNull(observedTrackNames);

        var order = new List<string>();
        var grouped = new Dictionary<string, List<GameTrackLayout>>(StringComparer.Ordinal);
        var names = new Dictionary<string, string>(StringComparer.Ordinal);

        foreach (var track in observedTrackNames.Where(name => !string.IsNullOrWhiteSpace(name)))
        {
            var id = CircuitId(game, track);
            if (!grouped.TryGetValue(id, out var layouts))
            {
                layouts = [];
                grouped[id] = layouts;
                names[id] = CircuitName(game, track);
                order.Add(id);
            }

            if (layouts.Any(layout => string.Equals(layout.TrackName, track, StringComparison.Ordinal)))
            {
                continue;
            }

            layouts.Add(new GameTrackLayout(track, LayoutLabel(game, track)));
        }

        return
        [
            .. order.Select(id => new GameCircuit(
                id,
                names[id],
                [.. Sorted(game, id, grouped[id])])),
        ];
    }

    /// <summary>The circuit a track name belongs to, or an identity derived from the name.</summary>
    public static string CircuitId(string? game, string trackName)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(trackName);
        return Find(game, trackName)?.Circuit.Id ?? Normalize(trackName);
    }

    /// <summary>The circuit's name, or the game's own track name when it is unrecognised.</summary>
    public static string CircuitName(string? game, string trackName)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(trackName);
        return Find(game, trackName)?.Circuit.Name ?? trackName.Trim();
    }

    /// <summary>
    /// The layout's label within its circuit. An unrecognised name keeps itself as its label:
    /// inventing "Grand Prix" for a layout nobody described would be a guess.
    /// </summary>
    public static string LayoutLabel(string? game, string trackName)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(trackName);
        return Find(game, trackName)?.Layout.Label ?? trackName.Trim();
    }

    /// <summary>Whether the catalog recognises this track name for this game.</summary>
    public static bool IsKnown(string? game, string trackName) => Find(game, trackName) is not null;

    // Known layouts keep their catalog order so "Grand Prix" leads and variants follow; anything
    // the catalog has never seen keeps the order it was observed in.
    private static IEnumerable<GameTrackLayout> Sorted(string? game, string id, List<GameTrackLayout> layouts)
    {
        var definition = KnownCircuits(game).FirstOrDefault(circuit =>
            string.Equals(circuit.Id, id, StringComparison.Ordinal));
        if (definition is null)
        {
            return layouts;
        }

        return layouts.OrderBy(layout => definition.Layouts
            .ToList()
            .FindIndex(candidate => string.Equals(candidate.Label, layout.Label, StringComparison.Ordinal)));
    }

    private static (CircuitDefinition Circuit, LayoutDefinition Layout)? Find(string? game, string trackName)
    {
        var normalized = Normalize(trackName);
        foreach (var circuit in KnownCircuits(game))
        {
            foreach (var layout in circuit.Layouts)
            {
                if (layout.Aliases.Any(alias => string.Equals(Normalize(alias), normalized, StringComparison.Ordinal)))
                {
                    return (circuit, layout);
                }
            }
        }

        return null;
    }

    private static IReadOnlyList<CircuitDefinition> KnownCircuits(string? game) => IsLeMansUltimate(game)
        ? LeMansUltimateCircuits
        : [];

    private static bool IsLeMansUltimate(string? game) =>
        string.Equals(game, "Le Mans Ultimate", StringComparison.OrdinalIgnoreCase)
        || string.Equals(game, "LeMansUltimate", StringComparison.OrdinalIgnoreCase)
        || string.Equals(game, "LMU", StringComparison.OrdinalIgnoreCase);

    /// <summary>
    /// Folds case, separators and accents so "Autódromo José Carlos Pace" and the ASCII spelling
    /// a results file may use are one name.
    /// </summary>
    private static string Normalize(string value)
    {
        var decomposed = value.Trim().ToLowerInvariant().Normalize(NormalizationForm.FormD);
        var builder = new StringBuilder(decomposed.Length);
        foreach (var character in decomposed)
        {
            if (CharUnicodeInfo.GetUnicodeCategory(character) == UnicodeCategory.NonSpacingMark)
            {
                continue;
            }

            if (char.IsLetterOrDigit(character))
            {
                builder.Append(character);
            }
        }

        return builder.ToString();
    }
}

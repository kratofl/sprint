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
    public bool LayoutIsAChoice => this.Layouts.Count > 1;
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

    // Country is the ISO 3166-1 alpha-2 code of where the circuit is, for its flag.
    private sealed record CircuitDefinition(string Id, string Name, string Country, IReadOnlyList<LayoutDefinition> Layouts);

    private static readonly IReadOnlyList<CircuitDefinition> LeMansUltimateCircuits =
    [
        new("algarve", "Algarve International Circuit", "PT",
        [
            new("Grand Prix", ["Algarve International Circuit", "Portimao", "Portimão"]),
        ]),
        new("bahrain", "Bahrain International Circuit", "BH",
        [
            new("Grand Prix", ["Bahrain International Circuit", "Bahrain"]),
        ]),
        new("barcelona", "Circuit de Barcelona-Catalunya", "ES",
        [
            new("Grand Prix", ["Circuit de Barcelona", "Circuit de Barcelona-Catalunya", "Barcelona", "Catalunya"]),
        ]),
        new("cota", "Circuit of the Americas", "US",
        [
            new("Grand Prix", ["Circuit of the Americas", "COTA", "Austin"]),
        ]),
        new("daytona", "Daytona International Speedway", "US",
        [
            // "Daytonarc" is the road course's setup folder.
            new("Road Course", ["Daytona International Speedway Road Course", "Daytona International Speedway", "Daytona", "Daytonarc"]),
        ]),
        new("fuji", "Fuji Speedway", "JP",
        [
            new("Grand Prix", ["Fuji Speedway", "Fuji"]),
            new("Classic", ["Fuji Speedway Classic"]),
        ]),
        new("imola", "Autodromo Enzo e Dino Ferrari", "IT",
        [
            new("Grand Prix", ["Autodromo Enzo e Dino Ferrari", "Imola"]),
        ]),
        new("interlagos", "Autódromo José Carlos Pace", "BR",
        [
            new("Grand Prix", ["Autódromo José Carlos Pace", "Interlagos"]),
        ]),
        new("le-mans", "Circuit de la Sarthe", "FR",
        [
            new("24 Heures du Mans", ["Circuit de la Sarthe", "Circuit des 24 Heures du Mans", "Le Mans"]),
            new("Mulsanne", ["Circuit de la Sarthe Mulsanne"]),
        ]),
        new("long-beach", "Long Beach Street Circuit", "US",
        [
            new("Street Circuit", ["Long Beach Street Circuit", "Streets of Long Beach", "Long Beach"]),
        ]),
        new("lusail", "Lusail International Circuit", "QA",
        [
            new("Grand Prix", ["Lusail International Circuit", "Losail International Circuit", "Lusail", "Qatar"]),
        ]),
        new("monza", "Autodromo Nazionale Monza", "IT",
        [
            new("Grand Prix", ["Autodromo Nazionale Monza", "Monza"]),
            new("Curva Grande", ["Monza Curva Grande Circuit", "Monza Curva Grande"]),
        ]),
        new("paul-ricard", "Circuit Paul Ricard", "FR",
        [
            new("Grand Prix", ["Circuit Paul Ricard", "Paul Ricard"]),
            new("ELMS", ["Paul Ricard - ELMS", "Circuit Paul Ricard - ELMS"]),
        ]),
        new("road-atlanta", "Michelin Raceway Road Atlanta", "US",
        [
            new("Grand Prix", ["Michelin Raceway Road Atlanta", "Road Atlanta"]),
        ]),
        new("sebring", "Sebring International Raceway", "US",
        [
            new("International", ["Sebring International Raceway", "Sebring"]),
        ]),
        new("silverstone", "Silverstone Circuit", "GB",
        [
            new("Grand Prix", ["Silverstone Grand Prix Circuit", "Silverstone"]),
            new("Grand Prix · ELMS", ["Silverstone Grand Prix Circuit - ELMS"]),
            // The setup folders of the shorter layouts ("Silverstone_National" as LMU files them).
            new("National", ["Silverstone National"]),
            new("International", ["Silverstone International"]),
        ]),
        new("spa", "Circuit de Spa-Francorchamps", "BE",
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

        List<string> order = new List<string>();
        Dictionary<string, List<GameTrackLayout>> grouped = new Dictionary<string, List<GameTrackLayout>>(StringComparer.Ordinal);
        Dictionary<string, string> names = new Dictionary<string, string>(StringComparer.Ordinal);

        foreach (string? track in observedTrackNames.Where(name => !string.IsNullOrWhiteSpace(name)))
        {
            string id = CircuitId(game, track);
            if (!grouped.TryGetValue(id, out List<GameTrackLayout>? layouts))
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

    /// <summary>
    /// Where the circuit is, as an ISO 3166-1 alpha-2 code ("BE"), or null for a track the catalog
    /// does not know: a flag is never guessed from a name.
    /// </summary>
    public static string? Country(string? game, string trackName)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(trackName);
        return Find(game, trackName)?.Circuit.Country;
    }

    /// <summary>Whether the catalog recognises this track name for this game.</summary>
    public static bool IsKnown(string? game, string trackName) => Find(game, trackName) is not null;

    // Known layouts keep their catalog order so "Grand Prix" leads and variants follow; anything
    // the catalog has never seen keeps the order it was observed in.
    private static IEnumerable<GameTrackLayout> Sorted(string? game, string id, List<GameTrackLayout> layouts)
    {
        CircuitDefinition? definition = KnownCircuits(game).FirstOrDefault(circuit =>
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
        string normalized = Normalize(trackName);
        foreach (CircuitDefinition circuit in KnownCircuits(game))
        {
            foreach (LayoutDefinition layout in circuit.Layouts)
            {
                if (layout.Aliases.Any(alias => string.Equals(Normalize(alias), normalized, StringComparison.Ordinal)))
                {
                    return (circuit, layout);
                }
            }
        }

        return null;
    }

    private static IReadOnlyList<CircuitDefinition> KnownCircuits(string? game) => GameNames.IsLeMansUltimate(game)
        ? LeMansUltimateCircuits
        : [];

    /// <summary>
    /// Folds case, separators and accents so "Autódromo José Carlos Pace" and the ASCII spelling
    /// a results file may use are one name.
    /// </summary>
    private static string Normalize(string value)
    {
        string decomposed = value.Trim().ToLowerInvariant().Normalize(NormalizationForm.FormD);
        StringBuilder builder = new StringBuilder(decomposed.Length);
        foreach (char character in decomposed)
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

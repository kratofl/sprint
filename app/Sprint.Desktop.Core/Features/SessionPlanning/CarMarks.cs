using Sprint.Games;

namespace Sprint.Desktop.Features.SessionPlanning;

/// <summary>
/// What the app shows with a car and a track (the renderer's CarBadges): the car as it reads beside
/// its class tag ("Porsche 963", or "Porsche" from the name "Hypercar Porsche"), the class tag, the
/// make for the maker's logo and the track's country for its flag. A part that cannot be told is
/// null, and the car then keeps the name it was given: a livery stays a livery.
/// </summary>
public sealed record CarMarks(string Car, string? ClassTag, string? Make, string? Country)
{
    // LMP2 is a spec class: every car in it is the Oreca 07, so a name says no make (CarNames).
    private const string Lmp2Make = "Oreca";
    private const string Lmp2Model = "Oreca 07";

    /// <param name="game">The game the track belongs to.</param>
    /// <param name="track">The track as the game names it; empty when unknown.</param>
    /// <param name="carName">The car's name per <see cref="CarNames"/> ("Hypercar Porsche", "LMP2 ELMS"), or the game's own.</param>
    /// <param name="carClass">The game's class, when known; otherwise the name's class word tells it.</param>
    /// <param name="carType">The game's model ("Porsche 963"), when known.</param>
    public static CarMarks Of(string game, string track, string carName, string? carClass = null, string? carType = null)
    {
        string name = carName.Trim();
        string[] words = name.Split(' ', 2, StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries);
        // A name the rule made is "<class> <make>", or "LMP2 <series>".
        string? namedClass = words.Length == 2 ? CarNames.ClassOf(words[0]) : null;
        string? nameMake = namedClass switch
        {
            null => null,
            "LMP2" => Lmp2Make,
            _ => words[1],
        };
        string? model = string.IsNullOrWhiteSpace(carType) ? null : carType.Trim();

        string? classTag = !string.IsNullOrWhiteSpace(carClass)
            ? CarNames.Tag(carClass, name)
            : namedClass is null ? null : CarNames.Tag(words[0], name);
        string shown = model ?? (namedClass == "LMP2" ? Lmp2Model : nameMake) ?? name;
        string? country = string.IsNullOrWhiteSpace(track) ? null : GameTrackCatalog.Country(game, track);
        return new CarMarks(shown, classTag, CarNames.MakeOf(model) ?? nameMake, country);
    }
}

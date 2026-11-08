using System.Text.RegularExpressions;

namespace Sprint.Desktop.Features.Setup;

/// <summary>The session a setup is made for, when its name says.</summary>
public enum SetupSession
{
    Quali,
    Race,
}

/// <summary>How a setup is set up to drive, when its name says.</summary>
public enum SetupStyle
{
    Esport,
    Safe,
    Wet,
}

/// <summary>What a setup's name says about it. Every part is null when the name does not say.</summary>
public sealed record SetupNameParts(SetupSession? Session, SetupStyle? Style, string? Version);

/// <summary>
/// Reads what a setup's name says. Setup shops code it into the file name — Bealien's
/// <c>bA2_963_BAHE_E_Q_V2_0_0</c> is an esport (<c>E</c>; <c>S</c> safe, <c>W</c> wet) quali
/// (<c>Q</c>; <c>R</c> race) setup, version 2.0.0 — and drivers write it out ("Race wet").
/// </summary>
public static partial class SetupNaming
{
    private static readonly Dictionary<string, SetupSession> Sessions = new(StringComparer.OrdinalIgnoreCase)
    {
        ["Q"] = SetupSession.Quali,
        ["Quali"] = SetupSession.Quali,
        ["Qualy"] = SetupSession.Quali,
        ["Qualifying"] = SetupSession.Quali,
        ["R"] = SetupSession.Race,
        ["Race"] = SetupSession.Race,
    };

    private static readonly Dictionary<string, SetupStyle> Styles = new(StringComparer.OrdinalIgnoreCase)
    {
        ["E"] = SetupStyle.Esport,
        ["Esport"] = SetupStyle.Esport,
        ["S"] = SetupStyle.Safe,
        ["Safe"] = SetupStyle.Safe,
        ["W"] = SetupStyle.Wet,
        ["Wet"] = SetupStyle.Wet,
        ["Rain"] = SetupStyle.Wet,
    };

    /// <summary>
    /// The parts a name states. Words are read from the end, where the codes sit, so a car's
    /// own letters earlier in the name ("911_GT3_R") do not count when a code follows them.
    /// </summary>
    public static SetupNameParts Read(string name)
    {
        Match version = VersionPattern().Match(name);
        string rest = version.Success ? name[..version.Index] : name;
        string[] words = WordSeparator().Split(rest);
        string? number = version.Success ? version.Groups[1].Value.Replace('_', '.') : null;

        // Older shop names put the version straight after the session letter: "..._S_R06".
        if (!version.Success && SessionVersionPattern().Match(words[^1]) is { Success: true } joined)
        {
            words[^1] = joined.Groups[1].Value;
            number = int.Parse(joined.Groups[2].Value, System.Globalization.CultureInfo.InvariantCulture).ToString(System.Globalization.CultureInfo.InvariantCulture);
        }

        SetupSession? session = null;
        SetupStyle? style = null;
        for (int index = words.Length - 1; index >= 0; index--)
        {
            if (session is null && Sessions.TryGetValue(words[index], out SetupSession named))
            {
                session = named;
            }
            else if (style is null && Styles.TryGetValue(words[index], out SetupStyle styled))
            {
                style = styled;
            }
        }

        return new SetupNameParts(session, style, number);
    }

    /// <summary>A trailing version: "V2_0_0", "v3", " v1.2".</summary>
    [GeneratedRegex(@"[_\s-]?[Vv](\d+(?:[_.]\d+)*)$")]
    private static partial Regex VersionPattern();

    /// <summary>A session letter with the version joined on: "R06", "Q5".</summary>
    [GeneratedRegex(@"^([QqRr])(\d+)$")]
    private static partial Regex SessionVersionPattern();

    [GeneratedRegex(@"[_\s\-.]+")]
    private static partial Regex WordSeparator();
}

namespace Sprint.Games.LeMansUltimate.Setups;

/// <summary>One <c>Key=Value</c> line, under the <c>[SECTION]</c> it appeared in.</summary>
/// <param name="Section">The enclosing section, or an empty string for the header lines
/// that precede the first one.</param>
/// <param name="RawValue">The text right of the first <c>=</c>, verbatim. Setup values are
/// the vehicle's own indices, so nothing here is converted to a number or a unit.</param>
internal sealed record LmuSetupEntry(string Section, string Key, string RawValue);

/// <summary>
/// A parsed <c>.svm</c> setup: Le Mans Ultimate's own INI-like format. Game-native and
/// internal on purpose — callers see <c>GameSetupSnapshot</c> through
/// <see cref="LmuSetupRepository"/>, never this.
/// </summary>
internal sealed record LmuSetupFile(string? VehicleClassSetting, IReadOnlyList<LmuSetupEntry> Entries)
{
    /// <summary>The header key naming the car (and class) the setup was saved for.</summary>
    private const string VehicleClassKey = "VehicleClassSetting";

    /// <summary>
    /// Parses setup text. There is no such thing as an invalid <c>.svm</c> here: an unfamiliar
    /// or truncated line is skipped rather than failing the file, because a setup Sprint could
    /// not fully read is still worth listing, snapshotting and diffing.
    /// </summary>
    public static LmuSetupFile Parse(string text)
    {
        ArgumentNullException.ThrowIfNull(text);

        var entries = new List<LmuSetupEntry>();
        var section = "";
        string? vehicleClass = null;

        foreach (var raw in text.Split('\n'))
        {
            var line = raw.Trim();

            // `//` comments carry provenance (the vehicle path the sim saved from) but no
            // setup value. Dropping them keeps a diff of two versions about what the driver
            // actually changed, and keeps the content hash from moving when the sim rewrites
            // a comment the setup does not depend on.
            if (line.Length == 0 || line.StartsWith("//", StringComparison.Ordinal))
            {
                continue;
            }

            if (line[0] == '[' && line[^1] == ']')
            {
                section = line[1..^1].Trim();
                continue;
            }

            var separator = line.IndexOf('=', StringComparison.Ordinal);
            if (separator <= 0)
            {
                continue;
            }

            var key = line[..separator].Trim();
            var value = line[(separator + 1)..].Trim();
            entries.Add(new LmuSetupEntry(section, key, value));

            if (vehicleClass is null && key.Equals(VehicleClassKey, StringComparison.OrdinalIgnoreCase))
            {
                // The quotes are the file's syntax, not part of the car's name, and this string
                // is matched against a car the telemetry contract reports unquoted.
                vehicleClass = value.Trim('"');
            }
        }

        return new LmuSetupFile(vehicleClass, entries);
    }
}

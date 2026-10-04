using System.Text.Json;
using System.Text.Json.Serialization;

namespace Sprint.Desktop.Features.Setup;

// Captured setups (#188). Deliberately separate from SetupProgram: a program is a curated
// thing the user edits inside Sprint with numeric parameters, while a snapshot is a faithful
// copy of what the sim wrote — the file's own sections and index values, as text. Coercing
// one into the other would throw away exactly the fidelity a version diff needs.

/// <summary>
/// One stored value, exactly as the game wrote it. Values are the game's own indices, not
/// physical units, so nothing here is parsed: a diff of two snapshots compares text and is
/// honest about it, where "rear wing = 7 clicks" would need vehicle data the file lacks.
/// </summary>
public sealed class SetupSnapshotValue
{
    [JsonPropertyName("section")]
    public string Section { get; set; } = "";

    [JsonPropertyName("key")]
    public string Key { get; set; } = "";

    [JsonPropertyName("rawValue")]
    public string RawValue { get; set; } = "";
}

/// <summary>
/// One version of a setup, as it existed at the moment Sprint saw it.
/// <para>
/// <see cref="Id"/> is content-addressed, which is the whole deduplication rule: saving the
/// same setup twice yields the same id and therefore one snapshot, while a real edit yields a
/// different one. It also means a snapshot log survives a restart, a moved folder or a
/// restored backup without keeping any separate "already seen" state in step.
/// </para>
/// </summary>
public sealed class SetupSnapshot
{
    [JsonPropertyName("id")]
    public string Id { get; set; } = "";

    /// <summary>The game this setup belongs to, so one vault can hold several games' setups.</summary>
    [JsonPropertyName("game")]
    public string Game { get; set; } = "";

    /// <summary>
    /// The repository's own locator for the file this came from. Provenance, not identity:
    /// two snapshots of the same file differ, and the file may later be gone.
    /// </summary>
    [JsonPropertyName("sourceId")]
    public string SourceId { get; set; } = "";

    [JsonPropertyName("name")]
    public string Name { get; set; } = "";

    /// <summary>The track the game files the setup under, or null when it files none.</summary>
    [JsonPropertyName("track")]
    public string? Track { get; set; }

    /// <summary>The car/class string the setup declares, or null when it declares none.</summary>
    [JsonPropertyName("vehicleDescriptor")]
    public string? VehicleDescriptor { get; set; }

    /// <summary>When Sprint captured it. The file's own timestamp is <see cref="SourceLastWriteUtc"/>.</summary>
    [JsonPropertyName("capturedAt")]
    public DateTimeOffset CapturedAt { get; set; }

    /// <summary>
    /// When the game last wrote the file. This, not the capture time, is what "most recently
    /// modified" means when a setup is matched to a session the driver has just finished.
    /// </summary>
    [JsonPropertyName("sourceLastWriteUtc")]
    public DateTimeOffset SourceLastWriteUtc { get; set; }

    /// <summary>
    /// When the user promoted this snapshot into the vault, or null while it is only a
    /// captured version. Promotion is always an explicit user action: the vault is a curated
    /// set, and a capture log that promoted itself would not be one.
    /// </summary>
    [JsonPropertyName("promotedAt")]
    public DateTimeOffset? PromotedAt { get; set; }

    [JsonPropertyName("values")]
    public List<SetupSnapshotValue> Values { get; set; } = [];

    [JsonExtensionData]
    public Dictionary<string, JsonElement>? ExtensionData { get; set; }

    /// <summary>Whether the user has promoted this version into the curated vault.</summary>
    [JsonIgnore]
    public bool IsInVault => PromotedAt is not null;

    /// <summary>
    /// The first value stored under <paramref name="key"/> in any section, or null when the
    /// setup does not state it. For the single-valued controls a sanity check names, where the
    /// caller knows the key but not which section the sim filed it in — a per-corner key
    /// repeats across sections and has to be read from <see cref="Values"/> with its section.
    /// </summary>
    public string? Value(string key) => Values
        .FirstOrDefault(value => string.Equals(value.Key, key, StringComparison.OrdinalIgnoreCase))
        ?.RawValue;
}

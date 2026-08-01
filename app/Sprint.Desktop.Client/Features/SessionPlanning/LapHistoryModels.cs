using System.Text.Json;
using System.Text.Json.Serialization;

namespace Sprint.Desktop.Features.SessionPlanning;

// The lap-history corpus (#179). Sprint-owned, game-agnostic records with two writers —
// the always-on recorder and (later) the results importer — and one reader. Deliberately
// separate from SessionPlan: plans stay a short curated list the user made on purpose,
// while this grows to hundreds of sessions and must not bury them.
//
// Every qualifier is nullable. An import can never supply conditions or fuel, so
// filtering on them now would discard imported laps; not recording them at all would be
// unrecoverable. Record generously, filter later.

/// <summary>
/// Which kind of session a history record came from.
/// <para>
/// This is an <em>on-disk format</em> and deliberately not the telemetry contract's
/// <c>SessionType</c>: typing years of stored history with a live contract would let a
/// future contract rename silently change how that history deserialises. It also carries
/// kinds the live contract has no concept of (<see cref="TestDay"/>).
/// </para>
/// </summary>
public enum HistorySessionKind
{
    Practice,
    Qualifying,
    Race,
    Warmup,
    TestDay,
    Unknown,
}

/// <summary>Where a history session's laps came from.</summary>
public enum LapHistoryOrigin
{
    /// <summary>Sprint watched the laps being driven, so richer per-lap data exists.</summary>
    Recorded,

    /// <summary>Parsed from a file the game wrote. No fuel, no conditions, no trace.</summary>
    Imported,
}

/// <summary>
/// The bucket a lap belongs to. <see cref="Game"/> + <see cref="TrackCourse"/> +
/// <see cref="CarModel"/> is the key, and both writers must map onto exactly these three:
/// if one wrote a venue where the other writes a course, one real context would split into
/// two buckets that never join and every statistic would silently use half the data.
/// </summary>
public sealed class LapHistoryContext
{
    [JsonPropertyName("game")]
    public string Game { get; set; } = "";

    /// <summary>The layout actually driven, not the venue — a shorter course must not drag the median.</summary>
    [JsonPropertyName("trackCourse")]
    public string TrackCourse { get; set; } = "";

    /// <summary>The car model (e.g. "Porsche 963"), the field both writers can agree on.</summary>
    [JsonPropertyName("carModel")]
    public string CarModel { get; set; } = "";

    /// <summary>
    /// Track length in metres, stored beside the key as a cross-check between writers
    /// (live lap distance vs an import's track length). Null when unknown.
    /// </summary>
    [JsonPropertyName("trackLengthMeters")]
    public double? TrackLengthMeters { get; set; }

    /// <summary>
    /// The car's class. Metadata, deliberately <em>not</em> part of the key, so a future
    /// "same class" fallback stays possible without re-bucketing history.
    /// </summary>
    [JsonPropertyName("carClass")]
    public string? CarClass { get; set; }
}

/// <summary>
/// Conditions a session was driven in. All nullable: imports can never supply them, and
/// recording them now is what makes filtering by them possible later.
/// </summary>
public sealed class LapHistoryConditions
{
    [JsonPropertyName("pathWetness")]
    public double? PathWetness { get; set; }

    [JsonPropertyName("trackGripLevel")]
    public double? TrackGripLevel { get; set; }

    [JsonPropertyName("fuelMultiplier")]
    public double? FuelMultiplier { get; set; }

    [JsonPropertyName("tireMultiplier")]
    public double? TireMultiplier { get; set; }

    [JsonPropertyName("fixedSetup")]
    public bool? FixedSetup { get; set; }
}

/// <summary>One session's worth of laps for a single context.</summary>
public sealed class LapHistorySession
{
    [JsonPropertyName("id")]
    public string Id { get; set; } = "";

    [JsonPropertyName("context")]
    public LapHistoryContext Context { get; set; } = new();

    [JsonPropertyName("kind")]
    public HistorySessionKind Kind { get; set; } = HistorySessionKind.Unknown;

    [JsonPropertyName("origin")]
    public LapHistoryOrigin Origin { get; set; } = LapHistoryOrigin.Recorded;

    [JsonPropertyName("startedAt")]
    public DateTimeOffset StartedAt { get; set; }

    [JsonPropertyName("endedAt")]
    public DateTimeOffset? EndedAt { get; set; }

    [JsonPropertyName("conditions")]
    public LapHistoryConditions Conditions { get; set; } = new();

    /// <summary>The setup the session was driven with, once confirmed. Null while unknown.</summary>
    [JsonPropertyName("setupReference")]
    public string? SetupReference { get; set; }

    [JsonPropertyName("laps")]
    public List<LapHistoryRecord> Laps { get; set; } = [];

    [JsonExtensionData]
    public Dictionary<string, JsonElement>? ExtensionData { get; set; }
}

/// <summary>Per-corner tyre state at the end of a lap. Every value nullable.</summary>
public sealed class LapHistoryTire
{
    [JsonPropertyName("position")]
    public string Position { get; set; } = "";

    [JsonPropertyName("wearPercent")]
    public double? WearPercent { get; set; }

    [JsonPropertyName("compound")]
    public string? Compound { get; set; }

    /// <summary>Mean of the corner's available temperature readings, in Celsius.</summary>
    [JsonPropertyName("tempAverageCelsius")]
    public double? TempAverageCelsius { get; set; }

    [JsonPropertyName("pressureKpa")]
    public double? PressureKPa { get; set; }
}

/// <summary>
/// One completed lap. Times and validity are always present so a reader can exclude
/// invalid laps; everything else is null when the source could not supply it.
/// </summary>
public sealed class LapHistoryRecord
{
    [JsonPropertyName("lapNumber")]
    public int LapNumber { get; set; }

    [JsonPropertyName("isValid")]
    public bool IsValid { get; set; } = true;

    [JsonPropertyName("lapTimeSeconds")]
    public double LapTimeSeconds { get; set; }

    [JsonPropertyName("sectorsSeconds")]
    public List<double> SectorsSeconds { get; set; } = [];

    [JsonPropertyName("fuelUsedLiters")]
    public double? FuelUsedLiters { get; set; }

    [JsonPropertyName("fuelRemainingLiters")]
    public double? FuelRemainingLiters { get; set; }

    /// <summary>
    /// Virtual energy used over the lap. Not optional detail in LMU: a hypercar stint is
    /// energy-limited as much as fuel-limited, so a fuel-only record predicts stint lengths
    /// the car cannot actually run.
    /// </summary>
    [JsonPropertyName("virtualEnergyUsed")]
    public double? VirtualEnergyUsed { get; set; }

    [JsonPropertyName("virtualEnergyRemaining")]
    public double? VirtualEnergyRemaining { get; set; }

    [JsonPropertyName("tires")]
    public List<LapHistoryTire> Tires { get; set; } = [];

    /// <summary>Practice-program tag. Written once practice programs exist; null until then.</summary>
    [JsonPropertyName("programType")]
    public string? ProgramType { get; set; }

    [JsonPropertyName("programId")]
    public string? ProgramId { get; set; }

    [JsonPropertyName("runId")]
    public string? RunId { get; set; }

    [JsonExtensionData]
    public Dictionary<string, JsonElement>? ExtensionData { get; set; }
}

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

    /// <summary>
    /// The setup the session was driven with, once the driver confirmed it (#188): a captured
    /// snapshot's id, or <c>SetupAssociation.Unknown</c> when it could not be identified. Null
    /// while nobody has been asked — the state that may still be asked about, and the only one
    /// that is not an answer.
    /// </summary>
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
/// How a lap was driven, not just how long it took: elapsed lap time resampled at a fixed
/// fraction of the track, from the start of the lap to the finish line. This is what lets a
/// lap chosen as a target drive a position-accurate delta rather than a single number.
/// <para>
/// Only the times are stored — the position of index <c>i</c> is <c>i * PositionStep</c>.
/// Storing the positions as well would double the size of the corpus's largest field to
/// record numbers that are already known by construction.
/// </para>
/// <para>
/// Deliberately says nothing about where it came from. The always-on recorder produces it
/// today and detailed trace capture (#101) may supersede that source later; a consumer that
/// branched on the producer would have to be rewritten when it does.
/// </para>
/// </summary>
public sealed class LapReferenceCurve
{
    /// <summary>The sampling interval as a fraction of a lap — ~0.5 % of the track.</summary>
    public const double PositionStepDefault = 0.005;

    // Milliseconds are the resolution the sims report and the resolution any delta is shown
    // at; further digits would grow every history file on disk with noise.
    private const int TimeDecimals = 3;

    // The completeness guards the live delta path already applies (Features/Live/DeltaTracker).
    // A trace that does not span roughly the whole lap describes a join-mid-session lap, an
    // out lap or an aborted one, and a curve resampled from it reads as a lap nobody drove.
    private const double CompleteStartMax = 0.2;
    private const double CompleteEndMin = 0.8;
    private const int CompleteMinSamples = 8;

    // One guard the delta path does not need. Its own trace is only ever compared live, while
    // this one is stored and re-read as "how the lap was driven", so a hole in the middle
    // matters: a lap seen at the line and again from half distance passes the two end guards,
    // and interpolating across the hole would draw a straight line through corners nobody saw.
    // Ten output intervals is seconds of unobserved driving, not a stutter.
    private const double CompleteMaxGap = PositionStepDefault * 10;

    // Degenerate-interval guard for the interpolation divisor.
    private const double PositionEpsilon = 1e-6;

    [JsonPropertyName("positionStep")]
    public double PositionStep { get; set; } = PositionStepDefault;

    /// <summary>
    /// Elapsed lap time in seconds at each sampled position, index <c>i</c> being track
    /// position <c>i * PositionStep</c>. The last entry is the lap's own time, at the line.
    /// </summary>
    [JsonPropertyName("timesSeconds")]
    public List<double> TimesSeconds { get; set; } = [];

    /// <summary>
    /// Resamples one lap's raw position→time samples onto the fixed interval, or returns
    /// null when they do not span enough of the lap to describe it honestly — a partial or
    /// aborted lap must yield no curve rather than a misleading one.
    /// </summary>
    /// <param name="samples">
    /// The lap's observed samples, strictly ascending in position.
    /// </param>
    /// <param name="lapTimeSeconds">The lap's completed time, the only time known to be true at the line.</param>
    public static LapReferenceCurve? FromSamples(
        IReadOnlyList<(double Position, double Time)> samples,
        double lapTimeSeconds)
    {
        ArgumentNullException.ThrowIfNull(samples);

        // The recorder only files laps the game gave a completed time for, but this factory is
        // the seam a future trace source writes through too, and past the last sample the lap
        // total is the only time it can state — an absent one would be stated as zero.
        if (lapTimeSeconds <= 0
            || samples.Count < CompleteMinSamples
            || samples[0].Position > CompleteStartMax
            || samples[^1].Position < CompleteEndMin
            || HasGap(samples))
        {
            return null;
        }

        var count = (int)Math.Round(1.0 / PositionStepDefault) + 1;
        var times = new List<double>(count);
        var index = 0;
        for (var i = 0; i < count; i++)
        {
            var position = i * PositionStepDefault;
            if (position <= samples[0].Position)
            {
                // Before the first sample nothing was observed; holding the first reading is
                // what the live delta reference does at the same edge.
                times.Add(Round(samples[0].Time));
                continue;
            }

            if (position >= samples[^1].Position)
            {
                times.Add(Round(lapTimeSeconds));
                continue;
            }

            // Both series ascend, so the bracketing sample only ever moves forward.
            while (samples[index + 1].Position <= position)
            {
                index++;
            }

            var (startPosition, startTime) = samples[index];
            var (endPosition, endTime) = samples[index + 1];
            var span = endPosition - startPosition;
            times.Add(Round(span <= PositionEpsilon
                ? startTime
                : startTime + ((endTime - startTime) * ((position - startPosition) / span))));
        }

        return new LapReferenceCurve { PositionStep = PositionStepDefault, TimesSeconds = times };
    }

    private static bool HasGap(IReadOnlyList<(double Position, double Time)> samples)
    {
        for (var i = 1; i < samples.Count; i++)
        {
            if (samples[i].Position - samples[i - 1].Position > CompleteMaxGap)
            {
                return true;
            }
        }

        return false;
    }

    private static double Round(double seconds) => Math.Round(seconds, TimeDecimals);
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

    /// <summary>
    /// Top speed reached on the lap, in km/h. Null when the source did not state one — the
    /// live recorder does not measure it today, while an imported archive does.
    /// </summary>
    [JsonPropertyName("topSpeedKph")]
    public double? TopSpeedKph { get; set; }

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

    /// <summary>
    /// How the lap was driven, when a position trace was available. Null otherwise: an
    /// imported lap has none and never will, so it degrades to a scalar target.
    /// </summary>
    [JsonPropertyName("referenceCurve")]
    public LapReferenceCurve? ReferenceCurve { get; set; }

    /// <summary>
    /// Whether this lap can honestly drive a position-accurate delta. A reader has to be
    /// able to tell the two tiers apart, and a curve that came back off disk truncated is no
    /// more usable than no curve at all.
    /// </summary>
    [JsonIgnore]
    public bool HasReferenceCurve =>
        ReferenceCurve is { PositionStep: > 0, TimesSeconds.Count: > 1 };

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

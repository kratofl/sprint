using System.Text.Json;
using System.Text.Json.Serialization;

namespace Sprint.Desktop.Features.SessionPlanning;

// Plan targets (#186). What the driver is aiming at, chosen from the lap-history corpus
// (#179) through #184's statistics rather than typed from memory.
//
// These live on SessionPlan and are stored per SegmentKind, not on PlanSegment: a segment
// holds actuals and does not exist while the driver is still planning. They are plain
// serialisable data on purpose — sync-ready with no sync built (spec 2.10), so a future
// remote plan store can replace them without the planner or the dash path changing.

/// <summary>
/// Which slice of the corpus a target was picked from.
/// <para>
/// Persisted by name (the plan store uses <see cref="JsonStringEnumConverter"/>), so the
/// members may be reordered without changing what stored plans mean.
/// </para>
/// </summary>
public enum PlanTargetScope
{
    /// <summary>
    /// The most recent qualifying session for the context — the one that should be right
    /// before the race. Deliberately no recency cutoff: the timestamp is shown instead, so
    /// the driver can verify which session it is rather than trusting a silent rule.
    /// </summary>
    CurrentQualifying,

    /// <summary>Every qualifying session for the context, all-time.</summary>
    Qualifying,

    /// <summary>Every practice session for the context, all-time.</summary>
    Practice,

    /// <summary>
    /// One practice-program type (e.g. <c>QUALI</c>, <c>PACE</c>). Listed only for program
    /// types the corpus actually contains, and hidden entirely in Quick mode.
    /// </summary>
    PracticeProgram,

    /// <summary>
    /// A value the driver typed. Not a corpus scope: it is what keeps the planner from
    /// dead-ending when there is no history for the context yet.
    /// </summary>
    Manual,
}

/// <summary>Which lap of a scope a target aims at.</summary>
public enum PlanTargetStatistic
{
    Fastest,

    /// <summary>
    /// The lap at the median position (lower median on even counts), never an interpolated
    /// time — see #184. A synthetic time has no per-corner pace behind it.
    /// </summary>
    Median,

    Slowest,

    /// <summary>One specific lap the driver picked out of the fastest-to-slowest list.</summary>
    Custom,
}

/// <summary>
/// The target set for one <see cref="SegmentKind"/> — a qualifying set and a race set on the
/// plan. A set rather than a bare target because the fuel side (#50) adds its own targets
/// here later; those must be additions, not a reshape of stored plans.
/// </summary>
public sealed class PlanTargets
{
    [JsonPropertyName("kind")]
    public SegmentKind Kind { get; set; }

    /// <summary>The lap-time target, or null when the driver has not set one.</summary>
    [JsonPropertyName("lapTime")]
    public PlanTarget? LapTime { get; set; }

    [JsonExtensionData]
    public Dictionary<string, JsonElement>? ExtensionData { get; set; }
}

/// <summary>
/// One resolved target: the (scope, statistic) choice plus the snapshot it resolved to. Both
/// halves are stored, because a consumer needs the value and its provenance — which real lap
/// it was, how many laps it was drawn from, and whether that lap can drive a
/// position-accurate delta or only a scalar one.
/// </summary>
public sealed class PlanTarget
{
    [JsonPropertyName("scope")]
    public PlanTargetScope Scope { get; set; }

    /// <summary>
    /// Which lap of the scope this aims at. Null for a manual value: a typed number is not a
    /// statistic over anything, and recording it as "fastest" would invent a provenance.
    /// </summary>
    [JsonPropertyName("statistic")]
    public PlanTargetStatistic? Statistic { get; set; }

    /// <summary>The program type for <see cref="PlanTargetScope.PracticeProgram"/>; null otherwise.</summary>
    [JsonPropertyName("programType")]
    public string? ProgramType { get; set; }

    [JsonPropertyName("lapTimeSeconds")]
    public double LapTimeSeconds { get; set; }

    /// <summary>
    /// How many laps the statistic was drawn from. Always stored, because a target shown
    /// without its sample size invites trusting a median of two laps.
    /// </summary>
    [JsonPropertyName("sampleSize")]
    public int SampleSize { get; set; }

    /// <summary>The history session holding the resolved lap. Null for a manual value.</summary>
    [JsonPropertyName("lapSessionId")]
    public string? LapSessionId { get; set; }

    /// <summary>The resolved lap's number within its session. Null for a manual value.</summary>
    [JsonPropertyName("lapNumber")]
    public int? LapNumber { get; set; }

    /// <summary>
    /// When the resolved lap's session started. Shown for
    /// <see cref="PlanTargetScope.CurrentQualifying"/> so "the session right before the race"
    /// is verifiable rather than assumed.
    /// </summary>
    [JsonPropertyName("lapSessionStartedAt")]
    public DateTimeOffset? LapSessionStartedAt { get; set; }

    /// <summary>
    /// Whether the resolved lap has a reference curve. A recorded lap can drive a
    /// position-accurate delta; an imported lap is scalar-only, and a consumer that could not
    /// tell them apart would present a pro-rata delta as if it were measured.
    /// </summary>
    [JsonPropertyName("hasReferenceCurve")]
    public bool HasReferenceCurve { get; set; }

    /// <summary>
    /// When this target was last written. Targets are intent, not measurements, so a future
    /// sync resolves conflicts last-write-wins and nothing irrecoverable is lost.
    /// </summary>
    [JsonPropertyName("updatedAt")]
    public DateTimeOffset UpdatedAt { get; set; }

    [JsonExtensionData]
    public Dictionary<string, JsonElement>? ExtensionData { get; set; }
}

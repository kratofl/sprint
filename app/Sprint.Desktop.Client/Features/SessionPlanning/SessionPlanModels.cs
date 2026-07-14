using System.Text.Json;
using System.Text.Json.Serialization;

namespace Sprint.Desktop.Features.SessionPlanning;

// Session Planner data model (#99). These are Sprint-owned, game-agnostic records:
// nothing here references Sprint.Games or any game-native structure. They are
// mutable, JSON-friendly aggregates (matching the desktop's other persisted models
// such as DashLayout) so a local JSON store can round-trip them today and a future
// RemoteStore can write the same shapes without a frontend contract change.

/// <summary>Lifecycle status of a <see cref="SessionPlan"/>.</summary>
public enum PlanStatus
{
    /// <summary>Created but not yet claiming the single active tracking slot.</summary>
    Draft,

    /// <summary>Holding the active slot, waiting for telemetry (auto-start) or a manual start.</summary>
    Armed,

    /// <summary>Actively tracking a live segment.</summary>
    Tracking,

    /// <summary>Tracking finished; retained in local history.</summary>
    Completed,

    /// <summary>Abandoned before completion; retained in local history.</summary>
    Abandoned,
}

/// <summary>Which part of a race weekend a segment covers.</summary>
public enum SegmentKind
{
    Qualifying,
    Race,
}

/// <summary>How a race's length is expressed.</summary>
public enum RaceLengthFormat
{
    Unknown,
    TimeBased,
    LapBased,
}

/// <summary>Where a segment's boundary/identity came from.</summary>
public enum SegmentSource
{
    Planned,
    Manual,
    Detected,
}

/// <summary>Confidence in a detected value (used by auto-detection, #102).</summary>
public enum DetectionConfidence
{
    None,
    Low,
    Medium,
    High,
}

/// <summary>
/// The aggregate root: one planned/tracked session (race weekend). Older plans stay
/// in local history; at most one is <see cref="PlanStatus.Armed"/> or
/// <see cref="PlanStatus.Tracking"/> at a time (the single active slot).
/// </summary>
public sealed class SessionPlan
{
    /// <summary>Globally unique id (stable across a future sync boundary).</summary>
    [JsonPropertyName("id")]
    public string Id { get; set; } = "";

    [JsonPropertyName("name")]
    public string Name { get; set; } = "";

    [JsonPropertyName("game")]
    public string Game { get; set; } = "";

    [JsonPropertyName("car")]
    public string Car { get; set; } = "";

    [JsonPropertyName("track")]
    public string Track { get; set; } = "";

    [JsonPropertyName("status")]
    public PlanStatus Status { get; set; } = PlanStatus.Draft;

    [JsonPropertyName("qualifyingIncluded")]
    public bool QualifyingIncluded { get; set; } = true;

    [JsonPropertyName("raceLengthFormat")]
    public RaceLengthFormat RaceLengthFormat { get; set; } = RaceLengthFormat.Unknown;

    /// <summary>Minutes for a time-based race, or lap count for a lap-based race.</summary>
    [JsonPropertyName("raceLengthValue")]
    public double RaceLengthValue { get; set; }

    /// <summary>Fuel reserve, in whole laps, added on top of the estimate (default +1 lap, #103).</summary>
    [JsonPropertyName("fuelReserveLaps")]
    public int FuelReserveLaps { get; set; } = 1;

    /// <summary>References to selected setups (opaque ids), if any.</summary>
    [JsonPropertyName("setupReferences")]
    public List<string> SetupReferences { get; set; } = [];

    [JsonPropertyName("notes")]
    public string Notes { get; set; } = "";

    [JsonPropertyName("createdAt")]
    public DateTimeOffset CreatedAt { get; set; }

    [JsonPropertyName("startedAt")]
    public DateTimeOffset? StartedAt { get; set; }

    [JsonPropertyName("endedAt")]
    public DateTimeOffset? EndedAt { get; set; }

    [JsonPropertyName("segments")]
    public List<PlanSegment> Segments { get; set; } = [];

    [JsonPropertyName("warnings")]
    public List<PlanWarning> Warnings { get; set; } = [];

    [JsonExtensionData]
    public Dictionary<string, JsonElement>? ExtensionData { get; set; }
}

/// <summary>A qualifying or race segment of a plan, planned and/or actually tracked.</summary>
public sealed class PlanSegment
{
    [JsonPropertyName("id")]
    public string Id { get; set; } = "";

    [JsonPropertyName("kind")]
    public SegmentKind Kind { get; set; }

    [JsonPropertyName("source")]
    public SegmentSource Source { get; set; } = SegmentSource.Manual;

    [JsonPropertyName("sourceConfidence")]
    public DetectionConfidence SourceConfidence { get; set; } = DetectionConfidence.None;

    [JsonPropertyName("plannedStart")]
    public DateTimeOffset? PlannedStart { get; set; }

    [JsonPropertyName("plannedEnd")]
    public DateTimeOffset? PlannedEnd { get; set; }

    [JsonPropertyName("actualStart")]
    public DateTimeOffset? ActualStart { get; set; }

    [JsonPropertyName("actualEnd")]
    public DateTimeOffset? ActualEnd { get; set; }

    /// <summary>Session type reported by live telemetry while tracking (e.g. "Race").</summary>
    [JsonPropertyName("liveSessionType")]
    public string LiveSessionType { get; set; } = "";

    /// <summary>Race length format inferred from telemetry, for mismatch detection.</summary>
    [JsonPropertyName("detectedRaceFormat")]
    public RaceLengthFormat DetectedRaceFormat { get; set; } = RaceLengthFormat.Unknown;

    [JsonPropertyName("laps")]
    public List<LapSummary> Laps { get; set; } = [];

    [JsonPropertyName("capture")]
    public CaptureManifest? Capture { get; set; }
}

/// <summary>A single completed lap's summary within a tracked segment.</summary>
public sealed class LapSummary
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

    [JsonPropertyName("tireSummary")]
    public string? TireSummary { get; set; }

    [JsonPropertyName("electronicsSummary")]
    public string? ElectronicsSummary { get; set; }

    [JsonPropertyName("setupReference")]
    public string? SetupReference { get; set; }
}

/// <summary>
/// Index of a segment's detailed trace capture (#101 writes the chunks; this is the
/// loadable manifest so history can be summarized without scanning trace data).
/// </summary>
public sealed class CaptureManifest
{
    [JsonPropertyName("chunkFiles")]
    public List<string> ChunkFiles { get; set; } = [];

    [JsonPropertyName("frameCount")]
    public long FrameCount { get; set; }

    [JsonPropertyName("droppedFrameCount")]
    public long DroppedFrameCount { get; set; }

    [JsonPropertyName("captureRateHz")]
    public int CaptureRateHz { get; set; }

    [JsonPropertyName("startTime")]
    public DateTimeOffset? StartTime { get; set; }

    [JsonPropertyName("endTime")]
    public DateTimeOffset? EndTime { get; set; }
}

/// <summary>A warning surfaced against a plan (e.g. detected race format mismatch).</summary>
public sealed class PlanWarning
{
    [JsonPropertyName("kind")]
    public string Kind { get; set; } = "";

    [JsonPropertyName("message")]
    public string Message { get; set; } = "";

    [JsonPropertyName("createdAt")]
    public DateTimeOffset CreatedAt { get; set; }
}

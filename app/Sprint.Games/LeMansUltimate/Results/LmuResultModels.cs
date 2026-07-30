namespace Sprint.Games.LeMansUltimate.Results;

// Game-native model for a Le Mans Ultimate (rFactor 2 / ISI) result XML written to
// UserData\Log\Results after every session. These are intentionally Sprint.Games-owned
// shapes: they mirror the on-disk XML, not any Sprint.Desktop.Client model. Mapping this
// into the game-agnostic Session Planner records (LapSummary/PlanSegment) is the Client
// layer's job, because Sprint.Games must not reference the desktop client (dependency
// direction) and SessionPlanModels explicitly references no game-native structure.

/// <summary>Which part of a race weekend a result file covers.</summary>
public enum LmuSessionType
{
    Unknown,
    Practice,
    Qualifying,
    Warmup,
    Race,
    TestDay,
}

/// <summary>One parsed LMU result file: session metadata plus every scored driver.</summary>
public sealed class LmuSessionResult
{
    /// <summary>Track venue as written by the sim (e.g. "Sebring International Raceway").</summary>
    public string TrackVenue { get; init; } = "";

    /// <summary>Track layout/course name (often equal to the venue).</summary>
    public string TrackCourse { get; init; } = "";

    /// <summary>Track length in metres, or null when absent/unparseable.</summary>
    public double? TrackLengthMeters { get; init; }

    /// <summary>Normalised session kind, derived from the XML session element name.</summary>
    public LmuSessionType SessionType { get; init; } = LmuSessionType.Unknown;

    /// <summary>Raw session element name (e.g. "Practice1", "Qualify", "Race").</summary>
    public string RawSessionName { get; init; } = "";

    /// <summary>Session timestamp from the file's Unix <c>DateTime</c> field, UTC.</summary>
    public DateTimeOffset? SessionTimeUtc { get; init; }

    /// <summary>The sim's human-readable local time string (e.g. "2026/06/23 20:55:11").</summary>
    public string TimeString { get; init; } = "";

    /// <summary>Sim/game version string (e.g. "1.3000").</summary>
    public string GameVersion { get; init; } = "";

    /// <summary>Scheduled race length in laps (0 for a time-based race).</summary>
    public int RaceLaps { get; init; }

    /// <summary>Scheduled race length in minutes (0 for a lap-based race).</summary>
    public double RaceTimeMinutes { get; init; }

    /// <summary>Every scored driver in the session, in file order.</summary>
    public IReadOnlyList<LmuDriverResult> Drivers { get; init; } = [];

    /// <summary>The local player's entry, if the file marks one (<c>isPlayer=1</c>).</summary>
    public LmuDriverResult? Player => Drivers.FirstOrDefault(d => d.IsPlayer);
}

/// <summary>One driver's entry within a session result: identity, standings, and laps.</summary>
public sealed class LmuDriverResult
{
    public string Name { get; init; } = "";
    public string TeamName { get; init; } = "";

    /// <summary>Car number, or null when absent/unparseable.</summary>
    public int? CarNumber { get; init; }

    /// <summary>Class abbreviation as written by the sim (e.g. "Hyper").</summary>
    public string CarClass { get; init; } = "";

    /// <summary>Car model (e.g. "Ferrari 499P").</summary>
    public string CarType { get; init; } = "";

    /// <summary>Full category label (e.g. "WEC 2025, Hypercar, Ferrari 499P").</summary>
    public string Category { get; init; } = "";

    /// <summary>Vehicle/livery name as written by the sim.</summary>
    public string VehicleName { get; init; } = "";

    /// <summary>True when this entry is the local player (<c>isPlayer=1</c>).</summary>
    public bool IsPlayer { get; init; }

    /// <summary>Overall grid position, or null (absent in practice/qualifying files).</summary>
    public int? GridPosition { get; init; }

    /// <summary>Overall finishing position, or null when absent.</summary>
    public int? FinishPosition { get; init; }

    /// <summary>In-class grid position, or null when absent.</summary>
    public int? ClassGridPosition { get; init; }

    /// <summary>In-class finishing position, or null when absent.</summary>
    public int? ClassPosition { get; init; }

    /// <summary>Best lap time in seconds, or null when the driver set no valid lap.</summary>
    public double? BestLapTimeSeconds { get; init; }

    /// <summary>Number of pit stops, or null when absent.</summary>
    public int? PitStops { get; init; }

    /// <summary>Finish status as written by the sim (e.g. "None", "Finished Normally", "DNF").</summary>
    public string FinishStatus { get; init; } = "";

    /// <summary>The driver's laps, in the order the file lists them.</summary>
    public IReadOnlyList<LmuLapResult> Laps { get; init; } = [];
}

/// <summary>A single lap from a driver's result entry.</summary>
public sealed class LmuLapResult
{
    /// <summary>1-based lap number (the <c>num</c> attribute).</summary>
    public int LapNumber { get; init; }

    /// <summary>Track position on this lap (the <c>p</c> attribute), or null when absent.</summary>
    public int? Position { get; init; }

    /// <summary>
    /// Lap time in seconds, or null when the file records no time (written as
    /// <c>--.----</c> for out/in/incomplete laps).
    /// </summary>
    public double? LapTimeSeconds { get; init; }

    /// <summary>True when this lap has a numeric completed time.</summary>
    public bool HasLapTime => LapTimeSeconds.HasValue;

    /// <summary>Session elapsed time at lap completion in seconds (<c>et</c>), or null when absent.</summary>
    public double? ElapsedTimeSeconds { get; init; }

    /// <summary>Sector 1 time in seconds, or null (absent in many practice/qualifying laps).</summary>
    public double? Sector1Seconds { get; init; }

    /// <summary>Sector 2 time in seconds, or null when absent.</summary>
    public double? Sector2Seconds { get; init; }

    /// <summary>Sector 3 time in seconds, or null when absent.</summary>
    public double? Sector3Seconds { get; init; }

    /// <summary>Top speed on the lap in km/h (<c>topspeed</c>), or null when absent.</summary>
    public double? TopSpeedKph { get; init; }

    /// <summary>Front tyre compound name (e.g. "Medium"), or null when absent.</summary>
    public string? FrontCompound { get; init; }

    /// <summary>Rear tyre compound name (e.g. "Medium"), or null when absent.</summary>
    public string? RearCompound { get; init; }
}

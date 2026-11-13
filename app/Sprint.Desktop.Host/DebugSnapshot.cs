using System.Diagnostics;
using Sprint.Desktop.Api.Telemetry;
using Sprint.Desktop.Core;
using Sprint.Desktop.Features.Dashes;
using Sprint.Desktop.Features.Devices;
using Sprint.Desktop.Features.Hardware;
using Sprint.Desktop.Features.Peer;
using Sprint.Desktop.Features.SessionPlanning;

namespace Sprint.Desktop.Host;

/// <summary>
/// The dev-only debug window's picture (<c>GET /api/debug</c>, Debug builds only): what is worth
/// knowing while driving and testing, flat and in the host's own units, without the bulk of
/// <c>/api/state</c>. The frame's readings come whole from the host frame, so it shows what the
/// renderer's <c>@sprint/types</c> mirror leaves out (applied pedals, brake temperatures, the tank).
/// </summary>
public sealed record DebugSnapshot(
    DebugTelemetry Telemetry,
    DebugSession Session,
    DebugCar Car,
    IReadOnlyList<DebugScreen> Screens,
    DebugSprint Sprint)
{
    /// <summary>
    /// Builds the snapshot. <paramref name="now"/> ages the last frame; everything else is read as
    /// it stands, so a racing write is at worst one poll old.
    /// </summary>
    public static DebugSnapshot Build(
        DesktopTelemetryState telemetry,
        DateTimeOffset now,
        IEnumerable<SavedDevice> devices,
        Func<string, ScreenOutputHardware?> hardware,
        DebugSprint sprint)
    {
        ArgumentNullException.ThrowIfNull(telemetry);
        ArgumentNullException.ThrowIfNull(devices);
        ArgumentNullException.ThrowIfNull(hardware);
        ArgumentNullException.ThrowIfNull(sprint);

        TelemetryFrame frame = telemetry.Frame;
        TelemetryStatus status = telemetry.Status;
        return new DebugSnapshot(
            new DebugTelemetry(
                status.SourceName,
                status.State,
                status.Detail,
                telemetry.Hz,
                status.LastFrameAt is { } at ? Math.Max(0, (now - at).TotalMilliseconds) : null,
                status.LastFrameValid,
                status.InvalidReason),
            DebugSession.From(frame),
            DebugCar.From(frame),
            DebugScreen.From(devices, hardware),
            sprint);
    }
}

/// <summary>The telemetry link: its source, state, rate and how old the newest frame is.</summary>
public sealed record DebugTelemetry(
    string Source,
    TelemetryConnectionState State,
    string? Detail,
    double Hz,
    double? FrameAgeMs,
    bool LastFrameValid,
    string? InvalidReason);

/// <summary>
/// The session as the game reports it. <see cref="MaxLaps"/> is 0 without a lap limit (a timed
/// session, or the game's "no limit"); the remaining time is null for a session without one.
/// </summary>
public sealed record DebugSession(
    string Game,
    string Track,
    double? TrackLengthMeters,
    string Car,
    string CarClass,
    SessionType Type,
    SessionPhase Phase,
    bool InCar,
    int Lap,
    int MaxLaps,
    double SessionTimeSeconds,
    double? TimeRemainingSeconds,
    int Position,
    int TotalPositions,
    double CurrentLapTime,
    double LastLapTime,
    double BestLapTime,
    double TargetLapTime,
    double Delta,
    int Sector,
    bool LapValid,
    bool InPitLane,
    bool InGarage,
    PitState? PitState)
{
    public static DebugSession From(TelemetryFrame frame) => new(
        frame.Session.Game,
        frame.Session.Track,
        frame.Session.TrackLengthMeters,
        frame.Session.Car,
        frame.Session.CarClass,
        frame.Session.SessionType,
        frame.Session.Phase,
        frame.Session.InCar,
        frame.Lap.CurrentLap,
        frame.Session.MaxLaps,
        frame.Session.SessionTime,
        frame.Session.SessionTimeRemaining,
        frame.Race.Position,
        frame.Race.TotalPositions,
        frame.Lap.CurrentLapTime,
        frame.Lap.LastLapTime,
        frame.Lap.BestLapTime,
        frame.Lap.TargetLapTime,
        frame.Lap.Delta,
        frame.Lap.Sector,
        frame.Lap.IsValid,
        frame.Car.InPitLane == true,
        frame.Car.InGarage == true,
        frame.Car.PitState);
}

/// <summary>
/// The car: pedals as the driver pressed them and as the car applied them (null where the game
/// does not say), fuel, the cockpit settings with their maximums (0: the car has none), and each
/// corner front left first.
/// </summary>
public sealed record DebugCar(
    double SpeedKph,
    int Gear,
    double Rpm,
    double MaxRpm,
    double Throttle,
    double? ThrottleApplied,
    double Brake,
    double? BrakeApplied,
    double Clutch,
    double Steering,
    double FuelLiters,
    double? FuelCapacityLiters,
    double FuelPerLapLiters,
    double BrakeBiasRear,
    bool? PitLimiter,
    DebugElectronics Electronics,
    double VirtualEnergy,
    double StateOfCharge,
    IReadOnlyList<DebugCorner> Corners)
{
    public static DebugCar From(TelemetryFrame frame) => new(
        frame.Car.SpeedMetersPerSecond * 3.6,
        frame.Car.Gear,
        frame.Car.Rpm,
        frame.Car.MaxRpm,
        frame.Car.Throttle,
        frame.Car.ThrottleApplied,
        frame.Car.Brake,
        frame.Car.BrakeApplied,
        frame.Car.Clutch,
        frame.Car.Steering,
        frame.Car.FuelLiters,
        frame.Car.FuelCapacityLiters,
        frame.Car.FuelPerLapLiters,
        frame.Car.BrakeBiasRear,
        frame.Car.PitLimiter,
        new DebugElectronics(
            frame.Electronics.TractionControl,
            frame.Electronics.TractionControlMax,
            frame.Electronics.TractionControlCut,
            frame.Electronics.TractionControlCutMax,
            frame.Electronics.TractionControlSlip,
            frame.Electronics.TractionControlSlipMax,
            frame.Electronics.TractionControlActive,
            frame.Electronics.Abs,
            frame.Electronics.AbsMax,
            frame.Electronics.MotorMap,
            frame.Electronics.MotorMapMax,
            frame.Electronics.Migration,
            frame.Electronics.MigrationMax),
        frame.Energy.VirtualEnergy,
        frame.Energy.StateOfCharge,
        [.. frame.Tires.OrderBy(tire => tire.Position).Select(tire => new DebugCorner(
            tire.Position,
            tire.TempInnerCelsius,
            tire.TempMiddleCelsius,
            tire.TempOuterCelsius,
            tire.TempCoreCelsius,
            tire.PressureKPa,
            tire.WearPercent,
            tire.BrakeTempCelsius,
            tire.Compound))]);
}

/// <summary>The cockpit settings, each with the car's maximum.</summary>
public sealed record DebugElectronics(
    int Tc,
    int TcMax,
    int TcCut,
    int TcCutMax,
    int TcSlip,
    int TcSlipMax,
    bool TcActive,
    int Abs,
    int AbsMax,
    int MotorMap,
    int MotorMapMax,
    int Migration,
    int MigrationMax);

/// <summary>One corner's tyre and brake.</summary>
public sealed record DebugCorner(
    TirePosition Position,
    double TempInner,
    double TempMiddle,
    double TempOuter,
    double TempCore,
    double PressureKPa,
    double WearPercent,
    double BrakeTemp,
    string Compound);

/// <summary>
/// One enabled screen output: the device, and how its frames are going (the publisher's
/// <see cref="ScreenPerformanceSnapshot"/>), or null figures while it has no running output.
/// Every drawn frame is sent, held back as unchanged from the last one, or failed in transfer.
/// </summary>
public sealed record DebugScreen(
    string DeviceId,
    string Name,
    string Driver,
    int Width,
    int Height,
    int RefreshHz,
    ScreenConnectionState? State,
    string? Detail,
    double? Fps,
    double? RenderMs,
    double? UsbMs,
    double? TotalMs,
    long FramesSent,
    long FramesUnchanged,
    long FramesFailed,
    int? Viewers)
{
    /// <summary>Every enabled device with a screen output, in the saved order (the same selection the outputs drive).</summary>
    public static IReadOnlyList<DebugScreen> From(IEnumerable<SavedDevice> devices, Func<string, ScreenOutputHardware?> hardware)
    {
        List<DebugScreen> screens = [];
        foreach (SavedDevice device in devices)
        {
            if (device.Disabled || !DeviceCapabilities.DrivesScreenOutput(device))
            {
                continue;
            }

            ScreenOutputHardware? output = hardware(device.Id);
            ScreenPerformanceSnapshot performance = output?.Performance ?? ScreenPerformanceSnapshot.Empty;
            bool timed = performance.HasSamples;
            screens.Add(new DebugScreen(
                device.Id,
                device.Name,
                device.Driver,
                device.Width,
                device.Height,
                DeviceRefreshRates.Normalize(device.RefreshHz),
                output?.Status.State,
                output?.Status.Detail,
                output is null ? null : performance.FramesPerSecond,
                timed ? performance.FrameTime.TotalMilliseconds : null,
                timed ? performance.UsbTransferTime.TotalMilliseconds : null,
                timed ? performance.TotalFrameTime.TotalMilliseconds : null,
                performance.FramesSent,
                performance.FramesSkipped,
                Math.Max(0, performance.FramesRendered - performance.FramesSent - performance.FramesSkipped),
                output?.Viewers));
        }

        return screens;
    }
}

/// <summary>
/// Sprint's own moving parts: the targets latched for this lap, the active plan, the HUD, the live
/// link, the lap recorder and how long the host's own loops take.
/// </summary>
public sealed record DebugSprint(
    DebugTargets Targets,
    DebugPlan? Plan,
    DebugHud Hud,
    DebugLink Link,
    DebugRecorder? Recorder,
    DebugTimingsSnapshot Timings);

/// <summary>What the dash's <c>target.*</c> bindings read now, and whether a reference lap drives the delta.</summary>
public sealed record DebugTargets(double? LapTimeSeconds, double? FuelPerLapLiters, double? ReferenceLapSeconds)
{
    public static DebugTargets From(DashTargets targets, double? referenceLapSeconds) =>
        new(targets.LapTimeSeconds, targets.FuelPerLapLiters, referenceLapSeconds);
}

/// <summary>The armed or tracking plan, from disk like <c>/api/state</c>'s plans.</summary>
public sealed record DebugPlan(string Id, string Name, PlanStatus Status, PlanMode Mode, double? AvgLapTimeSeconds, double? FuelPerLapLiters)
{
    /// <summary>The first armed or tracking plan, or null without one.</summary>
    public static DebugPlan? Active(IEnumerable<SessionPlan> plans) =>
        plans.FirstOrDefault(plan => plan.Status is PlanStatus.Armed or PlanStatus.Tracking) is { } active
            ? new DebugPlan(active.Id, active.Name, active.Status, active.Mode, active.AvgLapTimeSeconds, active.FuelPerLapLiters)
            : null;
}

/// <summary>
/// The training HUD, and whether a game holds exclusive fullscreen: nothing can be drawn over it
/// then, the debug window included.
/// </summary>
public sealed record DebugHud(bool Open, bool Arranging, bool ExclusiveFullscreen);

/// <summary>The live link's phase and, while connected, its health and the other side's build.</summary>
public sealed record DebugLink(
    PeerLinkPhase Phase,
    PeerRole? Role,
    PeerPath? Path,
    int? RoundTripMs,
    double? SampleRate,
    double? LossPercent,
    string? PeerApp,
    PeerBuildMatch? PeerMatch,
    string? Detail)
{
    public static DebugLink From(PeerLinkState state) => new(
        state.Phase,
        state.Role,
        state.Health?.Path,
        state.Health?.RoundTripMs,
        state.Health?.SampleRate,
        state.Health?.LossPercent,
        state.Peer?.App,
        state.Peer?.Match,
        state.Detail);
}

/// <summary>The lap-history session being recorded into: what, since when, how many laps, and the last lap's fuel.</summary>
public sealed record DebugRecorder(string SessionId, HistorySessionKind Kind, string Track, string Car, DateTimeOffset StartedAt, int Laps, double? LastLapFuelLiters)
{
    /// <summary>Null when nothing is being recorded. The telemetry thread appends laps; a count read mid-append is one lap behind at worst.</summary>
    public static DebugRecorder? From(LapHistorySession? session)
    {
        if (session is null)
        {
            return null;
        }

        List<LapHistoryRecord> laps = session.Laps;
        int count = laps.Count;
        return new DebugRecorder(
            session.Id,
            session.Kind,
            session.Context.TrackCourse,
            session.Context.CarModel,
            session.StartedAt,
            count,
            count > 0 ? laps[count - 1].FuelUsedLiters : null);
    }
}

/// <summary>How long the host's last <c>/api/state</c> took to build and its telemetry loop's last tick took to run.</summary>
public sealed record DebugTimingsSnapshot(double StateBuildMs, double PublishTickMs);

/// <summary>
/// The host's own timings for the debug window, written by the loops that are timed: one
/// <see cref="Stopwatch"/> read per state request and per telemetry tick.
/// </summary>
public sealed class DebugTimings
{
    private double _stateBuildMs;
    private double _publishTickMs;

    public DebugTimingsSnapshot Snapshot => new(Volatile.Read(ref this._stateBuildMs), Volatile.Read(ref this._publishTickMs));

    public void StateBuilt(TimeSpan elapsed) => Volatile.Write(ref this._stateBuildMs, elapsed.TotalMilliseconds);

    public void PublishTicked(TimeSpan elapsed) => Volatile.Write(ref this._publishTickMs, elapsed.TotalMilliseconds);
}

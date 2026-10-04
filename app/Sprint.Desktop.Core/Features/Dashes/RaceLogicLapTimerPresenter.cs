using System.Diagnostics;
using System.Globalization;
using Sprint.Desktop.Api.Telemetry;

namespace Sprint.Desktop.Features.Dashes;

public enum RaceLogicLapTimerMode
{
    Rolling,
    Predictive,
    LapResult,
}

public readonly record struct RaceLogicLapTimerView(
    RaceLogicLapTimerMode Mode,
    string Primary,
    string Status,
    double Delta,
    bool ShowDeltaBar);

/// <summary>
/// Small state machine behind the RaceLogic-style purpose display. It builds a
/// reference truthfully, switches to predictive Delta-T, and briefly freezes a
/// completed lap at the lap boundary.
/// </summary>
public sealed class RaceLogicLapTimerPresenter
{
    private static readonly long ResultDurationTicks =
        (long)(Stopwatch.Frequency * TimeSpan.FromSeconds(3).TotalSeconds);

    private int? _observedLap;
    private long _resultUntil;
    private double _resultLapTime;
    private double _resultDelta;

    public RaceLogicLapTimerView Present(TelemetryFrame frame, long timestamp)
    {
        ArgumentNullException.ThrowIfNull(frame);
        LapState lap = frame.Lap;
        if (this._observedLap is { } previousLap
            && lap.CurrentLap > previousLap
            && lap.LastLapTime > 0)
        {
            this._resultLapTime = lap.LastLapTime;
            this._resultDelta = lap.TargetLapTime > 0
                ? lap.LastLapTime - lap.TargetLapTime
                : 0;
            this._resultUntil = timestamp + ResultDurationTicks;
        }

        this._observedLap = lap.CurrentLap;
        if (timestamp < this._resultUntil)
        {
            return new RaceLogicLapTimerView(
                RaceLogicLapTimerMode.LapResult,
                DashFormat.Lap(this._resultLapTime),
                lap.TargetLapTime > 0
                    ? $"{FormatDelta(this._resultDelta)} TO REFERENCE"
                    : "LAP COMPLETE",
                this._resultDelta,
                ShowDeltaBar: lap.TargetLapTime > 0);
        }

        if (lap.TargetLapTime <= 0)
        {
            return new RaceLogicLapTimerView(
                RaceLogicLapTimerMode.Rolling,
                DashFormat.Lap(lap.CurrentLapTime),
                lap.IsValid ? "BUILDING REFERENCE" : "INVALID LAP",
                0,
                ShowDeltaBar: false);
        }

        return new RaceLogicLapTimerView(
            RaceLogicLapTimerMode.Predictive,
            FormatDelta(lap.Delta),
            lap.IsValid ? "PREDICTIVE" : "INVALID LAP",
            lap.Delta,
            ShowDeltaBar: true);
    }

    // Invariant like DashFormat: the wheel always shows a dot decimal separator.
    private static string FormatDelta(double delta) =>
        delta.ToString("+0.00;-0.00;0.00", CultureInfo.InvariantCulture);
}

using Sprint.Desktop.Api.Telemetry;
using Sprint.Desktop.Features.PitWall;

namespace Sprint.Desktop.Features.Live;

/// <summary>
/// What a pit stop costs the player, for the dash: the race engineer's figure
/// (<see cref="PitLossMeter"/>, lane loss plus standing time) worked out on the driver's own
/// desktop from the scored field, so it needs no engineer. Fills <see cref="LapState.PitLossSeconds"/>;
/// a frame without a field passes unchanged. Starts over on a new session.
/// </summary>
/// <remarks>Not thread-safe: <see cref="TelemetryEngine"/> calls it from its reader thread only.</remarks>
public sealed class PitLossTracker
{
    private readonly PitLossMeter _meter = new();
    private readonly SessionWatch _session = new();
    private IReadOnlyList<FieldCar>? _lastField;
    private double? _loss;

    /// <summary>Returns <paramref name="frame"/> with the pit loss filled in. Never mutates the input.</summary>
    public TelemetryFrame Augment(TelemetryFrame frame)
    {
        ArgumentNullException.ThrowIfNull(frame);
        SessionInfo session = frame.Session;
        if (this._session.StartedOver(session))
        {
            this._meter.Clear();
            this._loss = null;
            this._lastField = null;
        }

        if (frame.Field is not { Count: > 0 } field)
        {
            return frame;
        }

        // The game hands out the same list until scoring changes, so a repeat has nothing new.
        if (!ReferenceEquals(field, this._lastField))
        {
            this._lastField = field;
            double length = session.TrackLengthMeters is > 0 and { } meters ? meters : 0;
            foreach (FieldCar car in field)
            {
                double fraction = length > 0 ? Math.Clamp(car.LapDistanceMeters / length, 0, 1) : 0;
                this._meter.Follow(car.Id, car.CarClass, car.InPitLane, car.PitState, fraction, car.BestLapTime ?? car.LastLapTime, session.SessionTime);
            }

            FieldCar? own = field.FirstOrDefault(car => car.IsPlayer);
            PitWallPitLoss loss = this._meter.Loss(own?.Id, own?.CarClass);
            this._loss = loss.Lane is { } lane && loss.Standing is { } standing ? Math.Round(lane + standing, 1) : null;
        }

        return frame with { Lap = frame.Lap with { PitLossSeconds = this._loss } };
    }
}

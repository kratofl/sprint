using Sprint.Desktop.Api.Telemetry;

namespace Sprint.Desktop.Features.Live;

/// <summary>
/// The spotter: which cars are alongside the player, left and right, read from the scored field's
/// positions (<see cref="FieldCar.PositionX"/>/<see cref="FieldCar.PositionZ"/>, the player's own
/// entry included, so both ends of a comparison come from the same scoring update) turned into the
/// car's frame with its pose. Fills <see cref="RaceState.CarLeftMeters"/> and
/// <see cref="RaceState.CarRightMeters"/>; a frame without a field or a pose passes unchanged.
/// </summary>
public static class Spotter
{
    /// <summary>A car whose centre is at most this far ahead or behind overlaps the player (about a car's length).</summary>
    public const double OverlapMeters = 5.0;

    /// <summary>A car further than this to the side is in another lane (the pit lane, a parallel straight).</summary>
    public const double SideMeters = 4.5;

    /// <summary>Returns <paramref name="frame"/> with the cars alongside filled in. Never mutates the input.</summary>
    public static TelemetryFrame Augment(TelemetryFrame frame)
    {
        ArgumentNullException.ThrowIfNull(frame);
        if (frame.Field is not { Count: > 1 } field || frame.Car.Pose is not { } pose || field.FirstOrDefault(car => car.IsPlayer) is not { } player)
        {
            return frame;
        }

        float? left = null;
        float? right = null;
        foreach (FieldCar car in field)
        {
            if (car.IsPlayer || car.InGarage || car.InPitLane != player.InPitLane)
            {
                continue;
            }

            (double side, double ahead) = InCarFrame(pose, car.PositionX - player.PositionX, car.PositionZ - player.PositionZ);
            if (Math.Abs(ahead) > OverlapMeters || Math.Abs(side) > SideMeters)
            {
                continue;
            }

            if (side < 0)
            {
                left = Nearer(left, ahead);
            }
            else
            {
                right = Nearer(right, ahead);
            }
        }

        return frame with { Race = frame.Race with { CarLeftMeters = left, CarRightMeters = right } };
    }

    private static float Nearer(float? held, double ahead) =>
        held is float current && Math.Abs(current) <= Math.Abs(ahead) ? current : (float)ahead;

    /// <summary>
    /// A world offset seen from above (x, z) in the car's frame: metres to the right, and metres
    /// ahead. The pose's orientation turns body vectors into world ones, so its inverse (the
    /// conjugate) turns this one back; the body's forward is -Z.
    /// </summary>
    public static (double Right, double Ahead) InCarFrame(CarPose pose, double worldX, double worldZ)
    {
        // v' = v + 2w(u x v) + 2u x (u x v), with (u, w) the conjugate quaternion and v = (x, 0, z).
        double ux = -pose.OrientationX;
        double uy = -pose.OrientationY;
        double uz = -pose.OrientationZ;
        double w = pose.OrientationW;
        (double cx, double cy, double cz) = Cross(ux, uy, uz, worldX, 0, worldZ);
        (double ccx, _, double ccz) = Cross(ux, uy, uz, cx, cy, cz);
        double bodyX = worldX + (2 * w * cx) + (2 * ccx);
        double bodyZ = worldZ + (2 * w * cz) + (2 * ccz);
        return (bodyX, -bodyZ);
    }

    private static (double X, double Y, double Z) Cross(double ax, double ay, double az, double bx, double by, double bz) =>
        ((ay * bz) - (az * by), (az * bx) - (ax * bz), (ax * by) - (ay * bx));
}

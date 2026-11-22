using Sprint.Desktop.Api.Telemetry;

namespace Sprint.Desktop.Features.Live;

/// <summary>
/// Fills a frame's session bests from the scored field (<see cref="TelemetryFrame.Field"/>): the
/// best time in each sector by the player, by the player's class and by anyone, and the best lap
/// overall and in class. The field only says each car's last and current lap, so the sector
/// bests are kept here across frames; they start over when the track or session type changes or
/// the session clock runs backwards (a restart). A frame without a field passes unchanged.
/// </summary>
/// <remarks>Not thread-safe: <see cref="TelemetryEngine"/> calls it from its reader thread only.</remarks>
public sealed class SectorBestsTracker
{
    private readonly double?[] _personal = new double?[3];
    private readonly double?[] _overall = new double?[3];
    private readonly Dictionary<string, double?[]> _byClass = new(StringComparer.Ordinal);
    private readonly SessionWatch _session = new();
    private IReadOnlyList<FieldCar>? _lastField;

    /// <summary>Returns <paramref name="frame"/> with the session bests filled in. Never mutates the input.</summary>
    public TelemetryFrame Augment(TelemetryFrame frame)
    {
        ArgumentNullException.ThrowIfNull(frame);
        this.StartOverOnNewSession(frame.Session);

        IReadOnlyList<FieldCar>? field = frame.Field;
        if (field is null || field.Count == 0)
        {
            return frame;
        }

        // The game hands out the same list until scoring changes, so a repeat has nothing new.
        if (!ReferenceEquals(field, this._lastField))
        {
            this._lastField = field;
            foreach (FieldCar car in field)
            {
                this.Take(car);
            }
        }

        FieldCar? player = field.FirstOrDefault(car => car.IsPlayer);
        string carClass = player?.CarClass ?? frame.Session.CarClass;
        double?[] classBest = this._byClass.TryGetValue(carClass, out double?[]? held) ? held : new double?[3];
        return frame with
        {
            Lap = frame.Lap with
            {
                PersonalBestSectorsSeconds = [.. this._personal],
                SessionBestSectorsSeconds = [.. this._overall],
                ClassBestSectorsSeconds = [.. classBest],
                SessionBestLapTime = BestLap(field, _ => true),
                ClassBestLapTime = BestLap(field, car => string.Equals(car.CarClass, carClass, StringComparison.Ordinal))
            }
        };
    }

    private void StartOverOnNewSession(SessionInfo session)
    {
        if (this._session.StartedOver(session))
        {
            Array.Clear(this._personal);
            Array.Clear(this._overall);
            this._byClass.Clear();
            this._lastField = null;
        }
    }

    // Every sector time the car shows, from its last lap and the lap it is on.
    private void Take(FieldCar car)
    {
        if (!this._byClass.TryGetValue(car.CarClass, out double?[]? classBest))
        {
            classBest = new double?[3];
            this._byClass[car.CarClass] = classBest;
        }

        double?[] sectors = [car.LastLapSector1, car.LastLapSector2, car.LastLapSector3, car.CurrentLapSector1, car.CurrentLapSector2];
        for (int i = 0; i < sectors.Length; i++)
        {
            if (sectors[i] is not double time || !double.IsFinite(time) || time <= 0)
            {
                continue;
            }

            int sector = i % 3;
            Improve(this._overall, sector, time);
            Improve(classBest, sector, time);
            if (car.IsPlayer)
            {
                Improve(this._personal, sector, time);
            }
        }
    }

    private static void Improve(double?[] bests, int sector, double time)
    {
        if (bests[sector] is not double best || time < best)
        {
            bests[sector] = time;
        }
    }

    private static double? BestLap(IReadOnlyList<FieldCar> field, Func<FieldCar, bool> counts)
    {
        double? best = null;
        foreach (FieldCar car in field)
        {
            if (counts(car) && car.BestLapTime is double time && double.IsFinite(time) && time > 0 && (best is null || time < best))
            {
                best = time;
            }
        }

        return best;
    }
}

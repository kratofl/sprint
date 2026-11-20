using Sprint.Desktop.Api.Telemetry;

namespace Sprint.Desktop.Features.Live;

/// <summary>
/// Time gaps between cars, measured from where each car was when rather than from how far apart
/// they are: the gap to a car ahead is how long ago it stood where the car behind stands now. Two
/// cars that brake for the same corner therefore keep their gap, where a distance-over-speed
/// estimate shrinks it. Fills <see cref="RaceState"/>'s gaps and every car's
/// <see cref="FieldCar.RelativeGapSeconds"/>; a frame without a field passes unchanged.
/// </summary>
/// <remarks>
/// <para>
/// Each scoring update adds every car's total distance (laps completed × track length + lap
/// distance, so a lapped car is simply further back) at the session clock to that car's history,
/// a bounded ring. A gap reads the car ahead's history at the car behind's distance and
/// interpolates between the two samples either side. Until the history reaches back that far (a
/// few seconds after a car first appears or a reset), the game's own figure stands in.
/// </para>
/// <para>
/// A car's history starts over when it jumps (back to the garage, a teleport): a jump that the
/// next sample confirms; a one-sample glitch, such as the lap count and the lap distance rolling
/// over a scoring update apart at the line, is dropped. A car standing still (a pit stop) keeps two
/// samples, arriving and latest, so its history is not filled with one place. Everything starts
/// over on a new session (track, session type or track length changes, or the clock runs back);
/// a car that leaves the field is forgotten. Cars in the pit lane are still tracked.
/// </para>
/// <para>Not thread-safe: <see cref="TelemetryEngine"/> calls it from its reader thread only.</para>
/// </remarks>
public sealed class GapTracker
{
    /// <summary>Samples kept per car: about ten minutes of scoring at LMU's 5 Hz, a few laps of anywhere.</summary>
    public const int HistoryCapacity = 3000;

    // Faster than any car moves, so anything beyond it between two samples is a jump.
    private const double MaxSpeedMetersPerSecond = 120;
    private const double JumpSlackMeters = 50;

    // A car that reads up to this far back is standing (scoring jitter), not jumping.
    private const double StandingJitterMeters = 5;

    private readonly Dictionary<int, CarHistory> _cars = [];
    private readonly SessionWatch _session = new();
    private double _trackLength;

    // The field last measured and what came of it, so the 60 Hz frames between two scoring
    // updates reuse one result (and one field list, which consumers compare by reference).
    private IReadOnlyList<FieldCar>? _lastField;
    private IReadOnlyList<FieldCar> _measuredField = [];
    private MeasuredGaps _measured = MeasuredGaps.None;

    /// <summary>Returns <paramref name="frame"/> with the gaps filled in. Never mutates the input.</summary>
    public TelemetryFrame Augment(TelemetryFrame frame)
    {
        ArgumentNullException.ThrowIfNull(frame);
        if (frame.Field is not { Count: > 0 } field)
        {
            return frame;
        }

        if (!ReferenceEquals(field, this._lastField))
        {
            this._lastField = field;
            this.Measure(frame.Session, field);
        }

        MeasuredGaps gaps = this._measured;
        RaceState race = frame.Race;
        return frame with
        {
            Field = this._measuredField,
            Race = race with
            {
                // On the road the game has a figure of its own to fall back on; for places it is the field's.
                GapAhead = Seconds(gaps.Ahead) ?? race.GapAhead,
                GapBehind = Seconds(gaps.Behind) ?? race.GapBehind,
                PositionGapAhead = Seconds(gaps.PositionAhead),
                PositionGapBehind = Seconds(gaps.PositionBehind),
                ClassGapAhead = Seconds(gaps.ClassAhead),
                ClassGapBehind = Seconds(gaps.ClassBehind),
                GapToLeader = Seconds(gaps.Leader),
                GapToClassLeader = Seconds(gaps.ClassLeader),
            },
        };
    }

    // RaceState carries seconds as floats, like the game's own gaps.
    private static float? Seconds(double? value) => value is { } seconds ? (float)seconds : null;

    private void Measure(SessionInfo session, IReadOnlyList<FieldCar> field)
    {
        double trackLength = session.TrackLengthMeters is > 0 and { } meters ? meters : 0;
        double now = session.SessionTime;
        bool startedOver = this._session.StartedOver(session);
        if (startedOver || trackLength != this._trackLength)
        {
            this._cars.Clear();
            this._trackLength = trackLength;
        }

        if (trackLength <= 0)
        {
            // No length, no distance: every gap is the game's own.
            this._measuredField = field;
            this._measured = Fallbacks(field);
            return;
        }

        HashSet<int> present = [];
        foreach (FieldCar car in field)
        {
            present.Add(car.Id);
            string identity = car.Driver + "\n" + car.Car;
            if (!this._cars.TryGetValue(car.Id, out CarHistory? history) || history.Identity != identity)
            {
                // A new car, or a slot the server gave to someone else.
                history = new CarHistory(identity);
                this._cars[car.Id] = history;
            }

            history.Add(now, TotalDistance(car, trackLength));
        }

        foreach (int gone in this._cars.Keys.Where(id => !present.Contains(id)).ToList())
        {
            this._cars.Remove(gone);
        }

        (this._measuredField, this._measured) = this.Gaps(field, trackLength, now, session.SessionType == SessionType.Race);
    }

    /// <summary>
    /// The gaps on the road always come from the history. The gaps to places do only in a race:
    /// elsewhere the places go by best lap, so the cars round them are anywhere on the road and
    /// the game's own figures (differences in lap time) stand.
    /// </summary>
    private (IReadOnlyList<FieldCar> Field, MeasuredGaps Gaps) Gaps(IReadOnlyList<FieldCar> field, double trackLength, double now, bool race)
    {
        MeasuredGaps fallbacks = Fallbacks(field);
        if (field.FirstOrDefault(car => car.IsPlayer) is not { } player || !this._cars.TryGetValue(player.Id, out CarHistory? mine))
        {
            return (field, fallbacks);
        }

        // Where each car is as its history has it: a sample it rejected (a glitch, or a jump not
        // yet confirmed) does not move it.
        double Distance(FieldCar car) => this._cars.TryGetValue(car.Id, out CarHistory? history) ? history.Latest : TotalDistance(car, trackLength);
        double myDistance = mine.Latest;

        // On the road: every other car within half a lap either way, timed through the history of
        // whichever of the two is in front.
        FieldCar[] measured = new FieldCar[field.Count];
        double? ahead = null;
        double? behind = null;
        double nearestAhead = double.MaxValue;
        double nearestBehind = double.MaxValue;
        for (int i = 0; i < field.Count; i++)
        {
            FieldCar car = field[i];
            if (car.IsPlayer)
            {
                measured[i] = car;
                continue;
            }

            double distance = Distance(car);
            double onRoad = OnRoad(distance - myDistance, trackLength);
            double? seconds = onRoad > 0
                ? -this.Since(car.Id, distance - onRoad, now)
                : mine.Since(myDistance + onRoad, now);
            measured[i] = car with { RelativeGapSeconds = seconds };

            if (car.InGarage)
            {
                continue;
            }

            if (onRoad > 0 && onRoad < nearestAhead)
            {
                nearestAhead = onRoad;
                ahead = seconds is { } s ? -s : null;
            }
            else if (onRoad <= 0 && -onRoad < nearestBehind)
            {
                nearestBehind = -onRoad;
                behind = seconds;
            }
        }

        if (!race)
        {
            return (measured, fallbacks with { Ahead = ahead, Behind = behind });
        }

        // In the order: the car in front is timed at our distance, ours at the car behind's.
        double? InFront(FieldCar? car) => car is null ? null : this.Since(car.Id, myDistance, now);
        double? Behind(FieldCar? car) => car is null ? null : mine.Since(Distance(car), now);
        FieldCar? placeAhead = Place(field, player.Place - 1);
        FieldCar? classAhead = ClassPlace(field, player.CarClass, player.ClassPlace - 1);
        FieldCar? leader = Place(field, 1);
        FieldCar? classLeader = ClassPlace(field, player.CarClass, 1);
        MeasuredGaps gaps = new(
            Ahead: ahead,
            Behind: behind,
            PositionAhead: InFront(placeAhead) ?? fallbacks.PositionAhead,
            PositionBehind: Behind(Place(field, player.Place + 1)) ?? fallbacks.PositionBehind,
            ClassAhead: InFront(classAhead) ?? fallbacks.ClassAhead,
            ClassBehind: Behind(ClassPlace(field, player.CarClass, player.ClassPlace + 1)) ?? fallbacks.ClassBehind,
            Leader: InFront(leader is { IsPlayer: false } ? leader : null) ?? fallbacks.Leader,
            ClassLeader: InFront(classLeader is { IsPlayer: false } ? classLeader : null) ?? fallbacks.ClassLeader);
        return (measured, gaps);
    }

    /// <summary>Seconds since car <paramref name="id"/> was at <paramref name="distance"/>; null when its history does not reach.</summary>
    private double? Since(int id, double distance, double now) =>
        this._cars.TryGetValue(id, out CarHistory? history) ? history.Since(distance, now) : null;

    /// <summary>
    /// What the game itself says, for whatever the history cannot time yet: the field's gap to the
    /// car one place ahead and to the leader; within a class the difference of two gaps to the
    /// leader, which only holds while both cars are on the same lap as it. On the road it has none.
    /// </summary>
    private static MeasuredGaps Fallbacks(IReadOnlyList<FieldCar> field)
    {
        if (field.FirstOrDefault(car => car.IsPlayer) is not { } player || player.Place <= 0)
        {
            return MeasuredGaps.None;
        }

        double? Between(FieldCar? front, FieldCar back) =>
            front is not null && front.LapsToLeader == back.LapsToLeader && back.GapToLeader >= front.GapToLeader
                ? back.GapToLeader - front.GapToLeader
                : null;

        FieldCar? placeBehind = Place(field, player.Place + 1);
        FieldCar? classBehind = ClassPlace(field, player.CarClass, player.ClassPlace + 1);
        FieldCar? classLeader = ClassPlace(field, player.CarClass, 1);
        return new MeasuredGaps(
            Ahead: null,
            Behind: null,
            PositionAhead: player.Place > 1 ? player.GapToNext : null,
            PositionBehind: placeBehind?.GapToNext,
            ClassAhead: Between(ClassPlace(field, player.CarClass, player.ClassPlace - 1), player),
            ClassBehind: classBehind is null ? null : Between(player, classBehind),
            Leader: player.Place > 1 ? player.GapToLeader : null,
            ClassLeader: classLeader is { IsPlayer: false } ? Between(classLeader, player) : null);
    }

    private static FieldCar? Place(IReadOnlyList<FieldCar> field, int place) =>
        place <= 0 ? null : field.FirstOrDefault(car => car.Place == place);

    private static FieldCar? ClassPlace(IReadOnlyList<FieldCar> field, string carClass, int place) =>
        place <= 0 ? null : field.FirstOrDefault(car => car.ClassPlace == place && string.Equals(car.CarClass, carClass, StringComparison.Ordinal));

    private static double TotalDistance(FieldCar car, double trackLength) =>
        (car.LapsCompleted * trackLength) + car.LapDistanceMeters;

    /// <summary>A distance apart folded into (-half a lap, half a lap]: how far ahead on the road, whatever the laps.</summary>
    private static double OnRoad(double apart, double trackLength)
    {
        double folded = apart % trackLength;
        if (folded > trackLength / 2)
        {
            folded -= trackLength;
        }
        else if (folded <= -trackLength / 2)
        {
            folded += trackLength;
        }

        return folded;
    }

    /// <summary>The gaps as measured, each null where neither the history nor the game could say.</summary>
    private sealed record MeasuredGaps(
        double? Ahead,
        double? Behind,
        double? PositionAhead,
        double? PositionBehind,
        double? ClassAhead,
        double? ClassBehind,
        double? Leader,
        double? ClassLeader)
    {
        public static MeasuredGaps None { get; } = new(null, null, null, null, null, null, null, null);
    }

    /// <summary>One car's (session time, total distance) samples, oldest first, in a ring of <see cref="HistoryCapacity"/>.</summary>
    private sealed class CarHistory(string identity)
    {
        private readonly double[] _times = new double[HistoryCapacity];
        private readonly double[] _distances = new double[HistoryCapacity];
        private int _start;
        private int _count;

        // A sample that jumped away from the history, kept until the next one says whether the
        // car really moved there (it carries on from it) or it was a glitch (it carries on from before).
        private (double Time, double Distance)? _jump;

        /// <summary>Who the slot belonged to when this history began (driver and entry).</summary>
        public string Identity { get; } = identity;

        /// <summary>The newest sample's distance: where the car is, as far as its history goes.</summary>
        public double Latest => this.At(this._count - 1).Distance;

        public void Add(double time, double distance)
        {
            if (this._count == 0)
            {
                this.Append(time, distance);
                return;
            }

            (double lastTime, double lastDistance) = this.At(this._count - 1);
            if (time <= lastTime)
            {
                return; // the same scoring update again, or the clock stood still (paused)
            }

            if (Follows(lastTime, lastDistance, time, distance))
            {
                this._jump = null;
                this.Move(time, distance, lastDistance);
                return;
            }

            if (this._jump is { } jump && Follows(jump.Time, jump.Distance, time, distance))
            {
                this._jump = null;
                this._count = 0;
                this._start = 0;
                this.Append(jump.Time, jump.Distance);
                this.Move(time, distance, jump.Distance);
                return;
            }

            this._jump = (time, distance);
        }

        /// <summary>Seconds from when the car was at <paramref name="distance"/> to <paramref name="now"/>; null outside the history.</summary>
        public double? Since(double distance, double now) =>
            this.TimeAt(distance) is { } then ? Math.Max(0, now - then) : null;

        private double? TimeAt(double distance)
        {
            if (this._count < 2 || distance < this.At(0).Distance || distance > this.At(this._count - 1).Distance)
            {
                return null;
            }

            // The first sample past the distance; a standing car's samples share one distance, and
            // this takes the latest of them: when it left.
            int lo = 0;
            int hi = this._count;
            while (lo < hi)
            {
                int mid = (lo + hi) / 2;
                if (this.At(mid).Distance <= distance)
                {
                    lo = mid + 1;
                }
                else
                {
                    hi = mid;
                }
            }

            (double t0, double d0) = this.At(lo - 1);
            if (lo == this._count)
            {
                return t0; // exactly at the newest sample
            }

            (double t1, double d1) = this.At(lo);
            return t0 + ((t1 - t0) * ((distance - d0) / (d1 - d0)));
        }

        // Moving on adds a sample; standing (or a jitter back) keeps the arrival and refreshes the latest.
        private void Move(double time, double distance, double lastDistance)
        {
            if (distance > lastDistance)
            {
                this.Append(time, distance);
                return;
            }

            bool alreadyStanding = this._count >= 2 && this.At(this._count - 2).Distance == lastDistance;
            if (alreadyStanding)
            {
                this._times[this.Slot(this._count - 1)] = time;
            }
            else
            {
                this.Append(time, lastDistance);
            }
        }

        private void Append(double time, double distance)
        {
            if (this._count == HistoryCapacity)
            {
                this._start = (this._start + 1) % HistoryCapacity;
                this._count--;
            }

            int slot = this.Slot(this._count);
            this._times[slot] = time;
            this._distances[slot] = distance;
            this._count++;
        }

        private (double Time, double Distance) At(int index)
        {
            int slot = this.Slot(index);
            return (this._times[slot], this._distances[slot]);
        }

        private int Slot(int index) => (this._start + index) % HistoryCapacity;

        /// <summary>Whether a car could have got from one sample to the other: not backwards (beyond jitter), not faster than any car.</summary>
        private static bool Follows(double fromTime, double fromDistance, double toTime, double toDistance)
        {
            double moved = toDistance - fromDistance;
            return moved >= -StandingJitterMeters && moved <= (MaxSpeedMetersPerSecond * (toTime - fromTime)) + JumpSlackMeters;
        }
    }
}

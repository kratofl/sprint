using System.Text.Json;
using Sprint.Contracts;
using Sprint.Desktop.Api.Telemetry;

namespace Sprint.Desktop.Features.PitWall;

/// <summary>
/// The engineer's side of the pit wall: takes what arrives over the live link (boards, radar, the
/// shared plan, the target lap and the driver's samples) and keeps what a single board cannot
/// say — each car's best sectors, the track outline seen so far, the stint's pressures per lap,
/// the lap traces, which cars stand still on track, race control's feed (from the changes between
/// boards) and what a pit stop costs (from the stops it watched). A new session (another track or
/// session type) starts all of that over. Everything timed runs on the game's clock
/// (<see cref="PitWallSession.Elapsed"/>), so a paused game stops it too.
/// <para>
/// The link's worker feeds it; <see cref="State"/> and <see cref="Trace"/> are read from other
/// threads, so every member takes the lock. <see cref="State"/> is rebuilt only after a change.
/// </para>
/// </summary>
public sealed class PitWallAccumulator
{
    /// <summary>Slots of the track outline, by lap fraction, and so the most points it has.</summary>
    public const int OutlinePoints = 400;

    /// <summary>Radar older than this is shown as no cars around: the driver left the car or the link dropped it.</summary>
    public static readonly TimeSpan RadarLife = TimeSpan.FromSeconds(1);

    /// <summary>Seconds a racing car stands within <see cref="StoppedMeters"/> on track before it counts as stopped.</summary>
    public const double StoppedAfterSeconds = 10;

    private const double StoppedMeters = 5;
    private const int MaxPressureLaps = 200;
    private const int MaxEvents = 200;

    /// <summary>How far ahead of our car (a lap fraction) a car shown blue is taken to be shown it for us.</summary>
    private const double BlueForUs = 0.03;

    // A stop longer than this went to the garage; a lane loss outside these bounds was not a plain stop.
    private const double MaxStanding = 300;
    private const double MinLaneLoss = 2;
    private const double MaxLaneLoss = 120;

    private readonly Lock _gate = new();
    private readonly Dictionary<int, double?[]> _bestSectors = [];
    private readonly List<PitWallLapPressures> _pressures = [];
    private readonly PitWallLapTraces _traces = new();
    private PitWallPoint?[] _outline = new PitWallPoint?[OutlinePoints];
    private readonly List<PitWallEvent> _events = [];
    private readonly Dictionary<int, Still> _still = [];
    private readonly HashSet<int> _stopped = [];
    private readonly Dictionary<int, bool> _inPit = [];
    private readonly Dictionary<int, PitVisit> _visits = [];
    private readonly List<double> _laneLosses = [];
    private readonly List<StopTime> _standings = [];

    private PitWallBoard? _board;
    private long _receivedAt;
    private IReadOnlyList<PitWallRadarCar> _radar = [];
    private DateTimeOffset _radarAt;
    private JsonElement? _plan;
    private PitWallTrace? _target;

    private string _track = "";
    private SessionType _sessionType = SessionType.Unknown;
    private int? _lapsCompleted;
    private int? _stintStops;

    private PitWallState? _state;

    public void Board(PitWallBoard board, DateTimeOffset at)
    {
        ArgumentNullException.ThrowIfNull(board);
        lock (this._gate)
        {
            // A board with no track (the game still loading) says nothing about the session.
            bool known = board.Session.Track.Length > 0;
            if (known && (!string.Equals(board.Session.Track, this._track, StringComparison.Ordinal) || board.Session.SessionType != this._sessionType))
                this.NewSession(board.Session, trackChanged: !string.Equals(board.Session.Track, this._track, StringComparison.Ordinal));

            PitWallBoard? previous = this._board;
            HashSet<int> stoppedBefore = [.. this._stopped];
            double now = board.Session.Elapsed;
            bool racing = board.Session.Phase is SessionPhase.Green or SessionPhase.FullCourseYellow;
            foreach (PitWallCar car in board.Field)
            {
                this.KeepBestSectors(car);
                this.KeepOutline(car);
                this.FollowStill(car, now, racing, board.Session.TrackLengthMeters);
                this.FollowPit(car, now);
            }

            if (board.Field.FirstOrDefault(car => car.IsPlayer) is { } own)
                this.KeepPressures(own, board.Car);

            if (previous is not null)
                this.Note(previous, board, stoppedBefore);

            this._board = board;
            this._receivedAt = at.ToUnixTimeMilliseconds();
            this._state = null;
        }
    }

    public void Radar(IReadOnlyList<PitWallRadarCar> cars, DateTimeOffset at)
    {
        lock (this._gate)
        {
            this._radar = cars ?? [];
            this._radarAt = at;
            this._state = null;
        }
    }

    /// <summary>The plan the driver shares, or null when the driver stopped sharing it.</summary>
    public void Plan(JsonElement? plan)
    {
        lock (this._gate)
        {
            this._plan = plan;
            this._state = null;
        }
    }

    public void Target(PitWallTrace? target)
    {
        lock (this._gate)
            this._target = target;
    }

    public void Sample(LiveSample sample)
    {
        lock (this._gate)
            this._traces.Add(sample);
    }

    /// <summary>The pit wall at <paramref name="now"/>, or null before the first board.</summary>
    public PitWallState? State(DateTimeOffset now)
    {
        lock (this._gate)
        {
            if (this._board is not { } board)
                return null;

            if (this._radar.Count > 0 && now - this._radarAt > RadarLife)
            {
                this._radar = [];
                this._state = null;
            }

            return this._state ??= new PitWallState
            {
                Session = board.Session,
                Field = [.. board.Field.Select(car => car with
                {
                    BestSectors = this._bestSectors.TryGetValue(car.Id, out double?[]? best) ? [.. best] : car.BestSectors,
                    Stopped = this._stopped.Contains(car.Id),
                })],
                Car = board.Car,
                Radar = this._radar,
                Outline = [.. this._outline.OfType<PitWallPoint>()],
                Pressures = [.. this._pressures],
                Plan = this._plan,
                RaceControl = [.. this._events],
                PitLoss = this.PitLoss(board),
                ReceivedAt = this._receivedAt,
            };
        }
    }

    public PitWallTrace Trace(PitWallTraceLap lap)
    {
        lock (this._gate)
        {
            return lap switch
            {
                PitWallTraceLap.Current => this._traces.Current(),
                PitWallTraceLap.Last => this._traces.Last,
                PitWallTraceLap.Best => this._traces.Best,
                PitWallTraceLap.Target => this._target,
                _ => null,
            } ?? PitWallTrace.Empty;
        }
    }

    private void NewSession(PitWallSession session, bool trackChanged)
    {
        this._track = session.Track;
        this._sessionType = session.SessionType;
        this._bestSectors.Clear();
        this._pressures.Clear();
        this._lapsCompleted = null;
        this._stintStops = null;
        this._traces.Reset();
        this._board = null;
        this._events.Clear();
        this._still.Clear();
        this._stopped.Clear();
        this._inPit.Clear();
        this._visits.Clear();
        this._laneLosses.Clear();
        this._standings.Clear();
        if (trackChanged)
            this._outline = new PitWallPoint?[OutlinePoints];
    }

    private void KeepBestSectors(PitWallCar car)
    {
        if (!this._bestSectors.TryGetValue(car.Id, out double?[]? best))
        {
            best = new double?[3];
            this._bestSectors[car.Id] = best;
        }

        for (int sector = 0; sector < Math.Min(3, car.LastSectors.Count); sector++)
        {
            if (car.LastSectors[sector] is > 0 and { } time && (best[sector] is not { } held || time < held))
                best[sector] = time;
        }
    }

    /// <summary>The first position seen in each slot of the lap, from any car on track (the pit lane would draw a second line).</summary>
    private void KeepOutline(PitWallCar car)
    {
        if (car.InPit || car.LapFraction is <= 0 or >= 1 || (car.X == 0 && car.Z == 0))
            return;

        int slot = Math.Clamp((int)(car.LapFraction * OutlinePoints), 0, OutlinePoints - 1);
        this._outline[slot] ??= new PitWallPoint(car.X, car.Z);
    }

    /// <summary>Pressures as each lap is completed; a pit stop starts a new stint.</summary>
    private void KeepPressures(PitWallCar own, PitWallCarStatus car)
    {
        if (this._stintStops != own.PitStops)
        {
            this._stintStops = own.PitStops;
            this._pressures.Clear();
        }

        if (this._lapsCompleted is { } before && own.LapsCompleted > before && car.Tyres.Count == 4)
        {
            this._pressures.Add(new PitWallLapPressures(own.LapsCompleted, car.Tyres[0].PressureKPa, car.Tyres[1].PressureKPa, car.Tyres[2].PressureKPa, car.Tyres[3].PressureKPa));
            if (this._pressures.Count > MaxPressureLaps)
                this._pressures.RemoveAt(0);
        }

        this._lapsCompleted = own.LapsCompleted;
    }

    /// <summary>
    /// A racing car on track that stays within <see cref="StoppedMeters"/> of one spot for
    /// <see cref="StoppedAfterSeconds"/> is stopped. Outside green and full course yellow nobody
    /// is: the grid stands still too, and so does everyone after the flag.
    /// </summary>
    private void FollowStill(PitWallCar car, double now, bool racing, double? trackLength)
    {
        if (!racing || car.InPit || car.FinishStatus != FinishStatus.None)
        {
            this._still.Remove(car.Id);
            this._stopped.Remove(car.Id);
            return;
        }

        double near = trackLength is > 0 and { } meters ? StoppedMeters / meters : 0.001;
        if (this._still.TryGetValue(car.Id, out Still? still) && Apart(still.Fraction, car.LapFraction) <= near && now >= still.Since)
        {
            if (now - still.Since >= StoppedAfterSeconds)
                this._stopped.Add(car.Id);
            return;
        }

        this._still[car.Id] = new Still(car.LapFraction, now);
        this._stopped.Remove(car.Id);
    }

    /// <summary>
    /// Times each stop from pit entry to pit exit and how long the car stood in its box. The lane
    /// loss is the time in the lane, less the standing, less what the same stretch takes at the
    /// car's best lap; only stops seen from their entry count.
    /// </summary>
    private void FollowPit(PitWallCar car, double now)
    {
        bool seenOut = this._inPit.TryGetValue(car.Id, out bool wasInPit) && !wasInPit;
        this._inPit[car.Id] = car.InPit;
        if (car.InPit)
        {
            if (!this._visits.TryGetValue(car.Id, out PitVisit? visit))
            {
                if (!seenOut)
                    return;
                visit = new PitVisit(now, car.LapFraction, 0, null);
            }

            this._visits[car.Id] = car.PitState == PitState.Stopped
                ? visit with { StoppedSince = visit.StoppedSince ?? now }
                : visit with { Standing = visit.Standing + (visit.StoppedSince is { } since ? now - since : 0), StoppedSince = null };
            return;
        }

        if (!this._visits.Remove(car.Id, out PitVisit? done))
            return;

        double standing = done.Standing + (done.StoppedSince is { } stoodSince ? now - stoodSince : 0);
        if (standing > MaxStanding || now <= done.EntryTime)
            return;

        if (standing > 1)
            this._standings.Add(new StopTime(car.Id, car.CarClass, standing));

        if ((car.BestLap ?? car.LastLap) is > 0 and { } lap)
        {
            double forward = car.LapFraction - done.EntryFraction;
            double lane = now - done.EntryTime - standing - ((forward < 0 ? forward + 1 : forward) * lap);
            if (lane is >= MinLaneLoss and <= MaxLaneLoss)
                this._laneLosses.Add(lane);
        }
    }

    /// <summary>Adds to race control's feed what changed since <paramref name="previous"/>.</summary>
    private void Note(PitWallBoard previous, PitWallBoard board, HashSet<int> stoppedBefore)
    {
        double now = board.Session.Elapsed;
        if (board.Session.Phase != previous.Session.Phase)
        {
            PitWallEventKind? kind = board.Session.Phase switch
            {
                SessionPhase.Green => PitWallEventKind.Green,
                SessionPhase.FullCourseYellow => PitWallEventKind.FullCourseYellow,
                SessionPhase.Stopped => PitWallEventKind.Stopped,
                SessionPhase.Over => PitWallEventKind.Over,
                _ => null,
            };
            if (kind is { } phase)
                this.Add(new PitWallEvent(now, phase, null, "", "", null, null));
        }

        for (int sector = 0; sector < 3; sector++)
        {
            if (board.Session.YellowSectors[sector] != previous.Session.YellowSectors[sector])
                this.Add(new PitWallEvent(now, board.Session.YellowSectors[sector] ? PitWallEventKind.SectorYellow : PitWallEventKind.SectorClear, null, "", "", sector + 1, null));
        }

        Dictionary<int, PitWallCar> before = previous.Field.GroupBy(car => car.Id).ToDictionary(group => group.Key, group => group.First());
        PitWallCar? own = board.Field.FirstOrDefault(car => car.IsPlayer);
        foreach (PitWallCar car in board.Field)
        {
            if (!before.TryGetValue(car.Id, out PitWallCar? was))
                continue;

            PitWallEvent Event(PitWallEventKind kind, int? sector = null) =>
                new(now, kind, car.Id, car.Driver, car.Car, sector, car.LapsCompleted + 1);

            if (this._stopped.Contains(car.Id) && !stoppedBefore.Contains(car.Id))
                this.Add(Event(PitWallEventKind.CarStopped, car.Sector is >= 1 and <= 3 ? car.Sector : null));
            if (car.Penalties > was.Penalties)
                this.Add(Event(PitWallEventKind.Penalty));
            else if (car.Penalties < was.Penalties)
                this.Add(Event(PitWallEventKind.PenaltyServed));
            if (car.BlueFlag && !was.BlueFlag && (car.IsPlayer || ShownForUs(car, own)))
                this.Add(Event(PitWallEventKind.BlueFlag));
            if (car.FinishStatus != was.FinishStatus && car.FinishStatus is FinishStatus.Dnf or FinishStatus.Disqualified)
                this.Add(Event(car.FinishStatus == FinishStatus.Dnf ? PitWallEventKind.Retired : PitWallEventKind.Disqualified));
        }
    }

    /// <summary>A car shown blue just ahead of ours on the road is shown it for us.</summary>
    private static bool ShownForUs(PitWallCar car, PitWallCar? own)
    {
        if (own is null || own.InPit)
            return false;

        double ahead = car.LapFraction - own.LapFraction;
        return (ahead < 0 ? ahead + 1 : ahead) <= BlueForUs;
    }

    private void Add(PitWallEvent entry)
    {
        this._events.Add(entry);
        if (this._events.Count > MaxEvents)
            this._events.RemoveAt(0);
    }

    /// <summary>
    /// The median lane loss of every stop seen; the standing time from our own stops (their mean),
    /// else the median of our class's.
    /// </summary>
    private PitWallPitLoss PitLoss(PitWallBoard board)
    {
        PitWallCar? own = board.Field.FirstOrDefault(car => car.IsPlayer);
        List<double> ours = [.. this._standings.Where(stop => own is not null && stop.CarId == own.Id).Select(stop => stop.Seconds)];
        List<double> theirs = [.. this._standings.Where(stop => own is not null && stop.CarClass == own.CarClass).Select(stop => stop.Seconds)];
        double? standing = ours.Count > 0 ? ours.Average() : Median(theirs);
        return new PitWallPitLoss(
            Round(Median(this._laneLosses)),
            this._laneLosses.Count,
            Round(standing),
            ours.Count > 0 ? ours.Count : theirs.Count,
            ours.Count > 0);
    }

    private static double? Median(List<double> values)
    {
        if (values.Count == 0)
            return null;

        List<double> sorted = [.. values.Order()];
        int middle = sorted.Count / 2;
        return sorted.Count % 2 == 1 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
    }

    private static double? Round(double? value) => value is { } known ? Math.Round(known, 1) : null;

    /// <summary>How far apart two lap fractions are, either way round the lap.</summary>
    private static double Apart(double a, double b)
    {
        double distance = Math.Abs(a - b);
        return Math.Min(distance, 1 - distance);
    }

    /// <summary>Where a car was first seen standing, and when.</summary>
    private sealed record Still(double Fraction, double Since);

    /// <summary>A stop under way: when and where the car entered the lane, the time it stood so far, and since when it stands now.</summary>
    private sealed record PitVisit(double EntryTime, double EntryFraction, double Standing, double? StoppedSince);

    private sealed record StopTime(int CarId, string CarClass, double Seconds);
}

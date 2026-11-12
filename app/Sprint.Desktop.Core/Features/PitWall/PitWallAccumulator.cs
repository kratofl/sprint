using System.Text.Json;
using Sprint.Contracts;
using Sprint.Desktop.Api.Telemetry;

namespace Sprint.Desktop.Features.PitWall;

/// <summary>
/// The engineer's side of the pit wall: takes what arrives over the live link (boards, radar, the
/// shared plan, the target lap and the driver's samples) and keeps what a single board cannot
/// say — each car's best sectors, the track outline seen so far, the stint's pressures per lap and
/// the lap traces. A new session (another track or session type) starts all of that over.
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

    private const int MaxPressureLaps = 200;

    private readonly Lock _gate = new();
    private readonly Dictionary<int, double?[]> _bestSectors = [];
    private readonly List<PitWallLapPressures> _pressures = [];
    private readonly PitWallLapTraces _traces = new();
    private PitWallPoint?[] _outline = new PitWallPoint?[OutlinePoints];

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

            foreach (PitWallCar car in board.Field)
            {
                this.KeepBestSectors(car);
                this.KeepOutline(car);
            }

            if (board.Field.FirstOrDefault(car => car.IsPlayer) is { } own)
                this.KeepPressures(own, board.Car);

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
                Field = [.. board.Field.Select(car => this._bestSectors.TryGetValue(car.Id, out double?[]? best) ? car with { BestSectors = [.. best] } : car)],
                Car = board.Car,
                Radar = this._radar,
                Outline = [.. this._outline.OfType<PitWallPoint>()],
                Pressures = [.. this._pressures],
                Plan = this._plan,
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
}

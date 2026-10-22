using Sprint.Desktop.Api.Telemetry;
using Sprint.Desktop.Features.Diagnostics;
using Sprint.Desktop.Features.DrivingGuide;
using Sprint.Desktop.Features.SessionPlanning;
using Xunit;

namespace Sprint.Desktop.Tests;

/// <summary>
/// The driving guide's rules (docs/internals/driving-guide.md): which lap it draws, how the line
/// is coloured, where boards stand, and that a pose which contradicts the car's motion is caught.
/// </summary>
public sealed class DrivingGuideTests
{
    private const string Game = "LeMansUltimate";
    private const string Track = "Spa";
    private const string Car = "Peugeot 9X8";

    [Fact]
    public void A_trace_carries_world_positions_only_when_every_sample_had_one()
    {
        List<LapTraceSample> located = FullLap(sample => new LapTraceWorld((float)(sample.Position * 1000), 2, 0));
        List<LapTraceSample> gap = [.. located];
        gap[400] = gap[400] with { World = null };

        LapChannelTrace? withWorld = LapChannelTrace.FromSamples(located, 90, 1000);
        LapChannelTrace? withGap = LapChannelTrace.FromSamples(gap, 90, 1000);

        Assert.NotNull(withWorld);
        Assert.Equal(500, withWorld.ValueAt(LapTraceChannels.WorldX, 0.5) ?? double.NaN, precision: 1);
        Assert.NotNull(withGap);
        Assert.False(withGap.TryGetChannel(LapTraceChannels.WorldX, out float[] _));
    }

    [Fact]
    public void The_line_is_coloured_by_what_the_pedals_did()
    {
        DrivingGuideGeometry geometry = DrivingGuideBuilder.Build(StraightThenRightHander())!;

        Assert.Equal(GuidePedal.Throttle, geometry.Line[50].Pedal);
        Assert.Equal(GuidePedal.Brake, geometry.Line[100].Pedal);
        Assert.Equal(GuidePedal.Brake, geometry.Line[260].Pedal);
        Assert.Equal(GuidePedal.Coast, geometry.Line[350].Pedal);
    }

    [Fact]
    public void A_board_stands_at_the_braking_onset_on_the_outside_of_the_corner()
    {
        DrivingGuideGeometry geometry = DrivingGuideBuilder.Build(StraightThenRightHander())!;

        // The dab at 100 is too light, and the second application at 290 follows the first
        // too closely to be its own braking zone.
        GuideBoard board = Assert.Single(geometry.Boards);
        Assert.Equal(250, board.PointIndex);
        // Driving along -Z and turning right (+X), so the outside is -X.
        Assert.Equal(-6, board.X, precision: 3);
        Assert.Equal(-500, board.Z, precision: 3);
        // It faces back down the straight, toward the approaching car.
        Assert.Equal(0, board.FacingX, precision: 3);
        Assert.Equal(1, board.FacingZ, precision: 3);
    }

    [Fact]
    public void A_lap_without_positions_cannot_be_a_guide()
    {
        LapChannelTrace trace = StraightThenRightHander();
        trace.Channels.Remove(LapTraceChannels.WorldX);

        Assert.Null(DrivingGuideBuilder.Build(trace));
    }

    [Fact]
    public void The_guide_prefers_this_car_over_a_faster_lap_in_another()
    {
        Corpus corpus = new();
        corpus.Add(Car, 95, withWorld: true);
        corpus.Add(Car, 92, withWorld: false);
        corpus.Add("Toyota GR010", 90, withWorld: true);

        (DrivingGuideLap lap, DrivingGuideGeometry _) = new DrivingGuideLapPicker(corpus, corpus).Pick(Game, Track, Car)!.Value;

        Assert.Equal(95, lap.LapTimeSeconds);
        Assert.True(lap.SameCar);
    }

    [Fact]
    public void Another_cars_lap_stands_in_when_this_car_has_none()
    {
        Corpus corpus = new();
        corpus.Add("Toyota GR010", 90, withWorld: true);

        (DrivingGuideLap lap, DrivingGuideGeometry _) = new DrivingGuideLapPicker(corpus, corpus).Pick(Game, Track, Car)!.Value;

        Assert.Equal("Toyota GR010", lap.Car);
        Assert.False(lap.SameCar);
    }

    [Fact]
    public void The_service_reads_nothing_until_the_guide_is_wanted()
    {
        Corpus corpus = new();
        corpus.Add(Car, 95, withWorld: true);
        bool wanted = false;
        DrivingGuideService service = new(new DrivingGuideLapPicker(corpus, corpus), () => wanted, work => work());

        service.Observe(InCar(lap: 1));
        Assert.Equal(DrivingGuideStatus.Idle, service.State.Status);
        Assert.Equal(0, corpus.Loads);

        wanted = true;
        service.Observe(InCar(lap: 1));
        Assert.Equal(DrivingGuideStatus.Ready, service.State.Status);
        Assert.Equal(95.0, service.State.Lap?.LapTimeSeconds);
    }

    [Fact]
    public void A_new_best_becomes_the_guide_at_the_next_crossing()
    {
        Corpus corpus = new();
        corpus.Add(Car, 95, withWorld: true);
        DrivingGuideService service = new(new DrivingGuideLapPicker(corpus, corpus), () => true, work => work());
        service.Observe(InCar(lap: 1));
        int firstId = service.State.GeometryId;

        corpus.Add(Car, 93, withWorld: true);
        service.Observe(InCar(lap: 1));
        Assert.Equal(95.0, service.State.Lap?.LapTimeSeconds);

        service.Observe(InCar(lap: 2));
        Assert.Equal(93.0, service.State.Lap?.LapTimeSeconds);
        Assert.NotEqual(firstId, service.State.GeometryId);
    }

    [Fact]
    public void A_track_without_a_located_lap_reports_no_lap()
    {
        Corpus corpus = new();
        corpus.Add(Car, 95, withWorld: false);
        DrivingGuideService service = new(new DrivingGuideLapPicker(corpus, corpus), () => true, work => work());

        service.Observe(InCar(lap: 1));

        Assert.Equal(DrivingGuideStatus.NoLap, service.State.Status);
        Assert.Null(service.State.Geometry);
    }

    [Fact]
    public void The_pose_check_accepts_a_car_driving_where_it_points()
    {
        PoseConventionCheck check = new(NullLog.Instance);

        Drive(check, headingSign: 1);

        Assert.True(check.Consistent);
    }

    [Fact]
    public void The_pose_check_catches_a_car_driving_backwards_to_its_heading()
    {
        PoseConventionCheck check = new(NullLog.Instance);

        Drive(check, headingSign: -1);

        Assert.False(check.Consistent);
    }

    /// <summary>
    /// Drives along -Z at 50 m/s for two seconds. A heading sign of -1 reports the car facing
    /// +Z while it moves along -Z, which is what a mirrored matrix looks like.
    /// </summary>
    private static void Drive(PoseConventionCheck check, int headingSign)
    {
        // Identity faces -Z; a half turn about +Y faces +Z.
        float qy = headingSign > 0 ? 0 : 1;
        float qw = headingSign > 0 ? 1 : 0;
        for (int i = 0; i <= 20; i++)
        {
            check.Observe(new TelemetryFrame
            {
                Timestamp = DateTimeOffset.UnixEpoch.AddMilliseconds(i * 100),
                Session = new SessionInfo { InCar = true },
                Car = new CarState
                {
                    SpeedMetersPerSecond = 50,
                    Pose = new CarPose { PositionZ = -5.0 * i, OrientationY = qy, OrientationW = qw },
                },
            });
        }
    }

    private static TelemetryFrame InCar(int lap) => new()
    {
        Session = new SessionInfo { Game = Game, Track = Track, Car = Car, InCar = true },
        Lap = new LapState { CurrentLap = lap },
    };

    /// <summary>
    /// A 1000 m lap on a 2 m grid: 600 m flat out along -Z, braking hard from 250 to 280 with a
    /// dab at 100 and a second squeeze at 290, then a right-hand corner of radius 50 on part throttle.
    /// </summary>
    private static LapChannelTrace StraightThenRightHander()
    {
        const int count = 501;
        float[] x = new float[count];
        float[] y = new float[count];
        float[] z = new float[count];
        float[] brake = new float[count];
        float[] throttle = new float[count];
        for (int i = 0; i < count; i++)
        {
            if (i <= 300)
            {
                z[i] = -2f * i;
            }
            else
            {
                double angle = (i - 300) * 2.0 / 50;
                x[i] = (float)(50 - (50 * Math.Cos(angle)));
                z[i] = (float)(-600 - (50 * Math.Sin(angle)));
            }

            bool braking = (i >= 250 && i <= 280) || (i >= 290 && i <= 295);
            brake[i] = braking ? 0.8f : i == 100 ? 0.1f : 0;
            throttle[i] = braking ? 0 : i <= 300 ? 1 : 0.3f;
        }

        return new LapChannelTrace
        {
            PositionStep = 1.0 / (count - 1),
            TrackLengthMeters = 1000,
            Channels = new Dictionary<string, float[]>(StringComparer.Ordinal)
            {
                [LapTraceChannels.WorldX] = x,
                [LapTraceChannels.WorldY] = y,
                [LapTraceChannels.WorldZ] = z,
                [LapTraceChannels.Brake] = brake,
                [LapTraceChannels.Throttle] = throttle,
            },
        };
    }

    private static List<LapTraceSample> FullLap(Func<LapTraceSample, LapTraceWorld> world)
    {
        List<LapTraceSample> samples = [];
        for (int i = 0; i <= 1000; i++)
        {
            LapTraceSample sample = new(i / 1000.0, 200, 1, 0, 0, 5, 90.0 * i / 1000);
            samples.Add(sample with { World = world(sample) });
        }

        return samples;
    }

    /// <summary>History and traces in one, counting trace reads.</summary>
    private sealed class Corpus : ILapHistoryStore, ILapTraceStore
    {
        private readonly List<LapHistorySession> _sessions = [];
        private readonly Dictionary<string, LapChannelTrace> _traces = new(StringComparer.Ordinal);

        public int Loads { get; private set; }

        public void Add(string car, double lapTime, bool withWorld)
        {
            string id = $"s{this._sessions.Count}";
            LapChannelTrace trace = StraightThenRightHander();
            if (!withWorld)
            {
                trace.Channels.Remove(LapTraceChannels.WorldX);
            }

            this._traces[LapTraceId.For(id, 1)] = trace;
            this._sessions.Add(new LapHistorySession
            {
                Id = id,
                Context = new LapHistoryContext { Game = Game, TrackCourse = Track, CarModel = car },
                Laps = [new LapHistoryRecord { LapNumber = 1, LapTimeSeconds = lapTime, TraceId = LapTraceId.For(id, 1) }],
            });
        }

        public IReadOnlyList<LapHistorySession> LoadAll() => this._sessions;

        public void Save(LapHistorySession session) => this._sessions.Add(session);

        public void Delete(string sessionId) => this._sessions.RemoveAll(session => session.Id == sessionId);

        public void Save(string traceId, LapChannelTrace trace) => this._traces[traceId] = trace;

        public LapChannelTrace? Load(string traceId)
        {
            this.Loads++;
            return this._traces.TryGetValue(traceId, out LapChannelTrace? trace) ? trace : null;
        }

        void ILapTraceStore.Delete(string traceId) => this._traces.Remove(traceId);

        public IReadOnlyList<LapTraceInfo> List() => [];
    }
}

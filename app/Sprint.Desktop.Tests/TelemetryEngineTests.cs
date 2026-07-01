using System.Threading;
using Sprint.Desktop.Api.Telemetry;
using Sprint.Desktop.Features.Live;
using Sprint.Games.LeMansUltimate;
using Xunit;

namespace Sprint.Desktop.Tests;

/// <summary>
/// WS4 engine behaviour. The logic is driven through the synchronous <c>Step(now)</c>
/// seam with a scripted source and an injected clock (deterministic, no real thread),
/// plus one real-thread lifecycle smoke and one end-to-end pass through the real LMU
/// adapter over a synthetic shared-memory snapshot.
/// </summary>
public sealed class TelemetryEngineTests
{
    private static readonly DateTimeOffset T0 = new(2026, 1, 1, 12, 0, 0, TimeSpan.Zero);

    private static TelemetryFrame LapFrame(double pos, double lapTime, int lap, double lastLap = 0) => new()
    {
        Session = new SessionInfo { Track = "Spa", SessionType = SessionType.Race, InCar = true },
        Lap = new LapState
        {
            TrackPosition = (float)pos,
            CurrentLapTime = lapTime,
            CurrentLap = lap,
            LastLapTime = lastLap,
            IsValid = true
        }
    };

    [Fact]
    public void Connects_then_reads_and_measures_real_rate_over_steps()
    {
        var src = new ScriptedTelemetrySource { ReadFrame = n => LapFrame(0.01 * n, n, lap: 1) };
        using var engine = new TelemetryEngine(src);

        // Step 1: the source starts Disconnected ⇒ connect, no read yet (Hz 0).
        Assert.Equal(StepOutcome.JustConnected, engine.Step(T0));
        Assert.Equal(TelemetryConnectionState.Connected, engine.Snapshot.Status.State);
        Assert.Equal(0, engine.Snapshot.Hz);
        Assert.Equal(1, src.ConnectCount);

        // Step 2: first frame read; a single sample still yields 0 Hz.
        Assert.Equal(StepOutcome.ReadFrame, engine.Step(T0.AddMilliseconds(100)));
        Assert.Equal(0, engine.Snapshot.Hz);

        // Further reads at 100ms spacing converge toward 10 Hz.
        for (var i = 2; i <= 25; i++)
        {
            engine.Step(T0.AddMilliseconds(100 * i));
        }

        Assert.InRange(engine.Snapshot.Hz, 8, 12);
        Assert.Equal(1, src.ConnectCount); // never re-connected while the link stayed live
    }

    [Fact]
    public void Reconnect_loop_retries_until_a_link_is_established()
    {
        var src = new ScriptedTelemetrySource
        {
            ConnectState = attempt => attempt < 3
                ? TelemetryConnectionState.WaitingForGame
                : TelemetryConnectionState.Connected
        };
        using var engine = new TelemetryEngine(src);

        Assert.Equal(StepOutcome.Reconnecting, engine.Step(T0));
        Assert.Equal(TelemetryConnectionState.WaitingForGame, engine.Snapshot.Status.State);
        Assert.Equal(0, engine.Snapshot.Hz);

        Assert.Equal(StepOutcome.Reconnecting, engine.Step(T0)); // probe again
        Assert.Equal(StepOutcome.JustConnected, engine.Step(T0)); // 3rd attempt connects
        Assert.Equal(3, src.ConnectCount);
    }

    [Theory]
    [InlineData(TelemetryConnectionState.WaitingForGame)]
    [InlineData(TelemetryConnectionState.PermissionDenied)]
    [InlineData(TelemetryConnectionState.Unsupported)]
    [InlineData(TelemetryConnectionState.Faulted)]
    public void Degraded_link_states_are_published_unswallowed(TelemetryConnectionState state)
    {
        var src = new ScriptedTelemetrySource { ConnectState = _ => state };
        using var engine = new TelemetryEngine(src);

        Assert.Equal(StepOutcome.Reconnecting, engine.Step(T0));
        Assert.Equal(state, engine.Snapshot.Status.State);
        Assert.Equal(0, engine.Snapshot.Hz);
    }

    [Fact]
    public void No_new_frame_holds_the_last_augmented_frame_preserving_delta()
    {
        // Read a full reference lap + a slower lap so the held frame carries a computed
        // delta, then a read returns null (no new frame).
        var script = BuildReferenceThenSlowLapScript();
        var src = new ScriptedTelemetrySource { ReadFrame = n => n <= script.Count ? script[n - 1] : null };
        using var engine = new TelemetryEngine(src);

        engine.Step(T0); // connect
        for (var i = 1; i <= script.Count; i++)
        {
            engine.Step(T0.AddMilliseconds(20 * i));
        }

        var read = engine.Snapshot.Frame.Lap;
        Assert.Equal(100, read.TargetLapTime, precision: 3);
        Assert.True(read.Delta > 4 && read.Delta < 6, $"expected ~+5 delta, got {read.Delta}");
        Assert.Equal(1, src.ConnectCount);

        // A no-new-frame tick must HOLD the augmented values, not revert to the raw
        // adapter frame's zero Delta/TargetLapTime.
        Assert.Equal(StepOutcome.NoFrame, engine.Step(T0.AddMilliseconds(20 * (script.Count + 1))));
        var held = engine.Snapshot.Frame.Lap;
        Assert.Equal(read.TargetLapTime, held.TargetLapTime, precision: 6);
        Assert.Equal(read.Delta, held.Delta, precision: 6);
        Assert.Equal(1, src.ConnectCount); // NoFrame is not a reconnect
    }

    [Fact]
    public void Unexpected_read_exception_is_surfaced_as_faulted_not_thrown()
    {
        // An exception type outside the adapter's narrow catch list (US17): the loop
        // must survive and publish Faulted rather than letting the reader thread die.
        var src = new ScriptedTelemetrySource { ReadFrame = _ => throw new IndexOutOfRangeException("bad buffer") };
        using var engine = new TelemetryEngine(src);

        engine.Step(T0); // connect ⇒ Connected
        var outcome = engine.Step(T0.AddMilliseconds(10));

        Assert.Equal(StepOutcome.Reconnecting, outcome); // did not propagate out of Step
        Assert.Equal(TelemetryConnectionState.Faulted, engine.Snapshot.Status.State);
        Assert.Contains("bad buffer", engine.Snapshot.Status.Detail);
    }

    [Fact]
    public void Read_outcomes_pace_by_poll_interval_so_a_ready_source_cannot_busy_spin()
    {
        var opts = new EngineOptions
        {
            PollInterval = TimeSpan.FromMilliseconds(7),
            ReconnectInterval = TimeSpan.FromSeconds(9)
        };
        using var engine = new TelemetryEngine(new ScriptedTelemetrySource(), opts);

        Assert.Equal(opts.PollInterval, engine.WaitFor(StepOutcome.ReadFrame));
        Assert.Equal(opts.PollInterval, engine.WaitFor(StepOutcome.NoFrame));
        Assert.Equal(opts.PollInterval, engine.WaitFor(StepOutcome.JustConnected));
        Assert.Equal(opts.ReconnectInterval, engine.WaitFor(StepOutcome.Reconnecting));
    }

    [Fact]
    public void Engine_injects_lap_delta_into_the_published_frame()
    {
        var script = BuildReferenceThenSlowLapScript();
        var src = new ScriptedTelemetrySource { ReadFrame = n => n <= script.Count ? script[n - 1] : script[^1] };
        using var engine = new TelemetryEngine(src);

        for (var i = 0; i < 30; i++)
        {
            engine.Step(T0.AddMilliseconds(20 * i));
        }

        var lap = engine.Snapshot.Frame.Lap;
        Assert.Equal(100, lap.TargetLapTime, precision: 6);          // adopted reference total
        Assert.True(lap.Delta > 4 && lap.Delta < 6, $"expected ~+5s delta, got {lap.Delta}");
    }

    [Fact]
    public void Start_is_idempotent_and_dispose_is_safe_in_every_order()
    {
        // Dispose before Start: nothing to join, must not throw, source still released.
        var a = new ScriptedTelemetrySource();
        var beforeStart = new TelemetryEngine(a);
        beforeStart.Dispose();
        Assert.True(a.IsDisposed);

        // Double Start + double Dispose: no throw, clean teardown.
        var b = new ScriptedTelemetrySource();
        var twice = new TelemetryEngine(b, new EngineOptions { PollInterval = TimeSpan.FromMilliseconds(1) });
        twice.Start();
        twice.Start();   // idempotent no-op
        twice.Dispose();
        twice.Dispose(); // idempotent no-op
        Assert.True(b.IsDisposed);
    }

    [Fact]
    public void Background_reader_connects_on_start_and_dispose_tears_down_the_source()
    {
        var src = new ScriptedTelemetrySource { ReadFrame = n => LapFrame(0.01 * (n % 90), n, lap: 1) };
        var engine = new TelemetryEngine(src, new EngineOptions { PollInterval = TimeSpan.FromMilliseconds(1) });

        engine.Start(); // connects synchronously before spawning the reader thread
        Assert.Equal(TelemetryConnectionState.Connected, engine.Snapshot.Status.State);

        Thread.Sleep(50); // let the real background reader run

        engine.Dispose(); // cancels + joins + disposes the source, synchronously
        Assert.True(src.IsDisposed);
        Assert.Throws<ObjectDisposedException>(() => src.TryRead(out _));
    }

    [Fact]
    public void Engine_drives_the_real_lmu_adapter_through_a_synthetic_snapshot()
    {
        var buffer = BuildInCarLmuBuffer();
        using var source = new LeMansUltimateTelemetrySource(new InMemoryLmuSnapshotProvider(buffer));
        using var engine = new TelemetryEngine(source, clock: () => T0);

        engine.Step(T0);                      // connect (opens the in-memory provider)
        engine.Step(T0.AddMilliseconds(10));  // read + map a real LMU frame

        var snap = engine.Snapshot;
        Assert.Equal(TelemetryConnectionState.Connected, snap.Status.State);
        Assert.Equal("LeMansUltimate", snap.Frame.Session.Game);
        Assert.True(snap.Frame.Session.InCar);
        Assert.Equal("Spa", snap.Frame.Session.Track);
    }

    private static List<TelemetryFrame> BuildReferenceThenSlowLapScript()
    {
        var frames = new List<TelemetryFrame>();
        for (var i = 1; i <= 20; i++)
        {
            var p = (double)i / 21;
            frames.Add(LapFrame(p, p * 100, lap: 1)); // a clean 100s reference lap
        }

        frames.Add(LapFrame(0.001, 0, lap: 2, lastLap: 100)); // boundary ⇒ adopt lap 1
        frames.Add(LapFrame(0.5, 55, lap: 2));                 // 5s behind at half-distance
        return frames;
    }

    private static byte[] BuildInCarLmuBuffer()
    {
        var buffer = new byte[LmuBinary.TotalBufferSize];
        var scoringInfo = LmuBinary.ScoringStart;
        WriteString(buffer, scoringInfo, 64, "Spa");
        WriteInt32(buffer, scoringInfo + 64, 10);      // Session = Race
        WriteDouble(buffer, scoringInfo + 68, 200.0);  // CurrentElapsedTime
        WriteDouble(buffer, scoringInfo + 88, 7004.0); // track LapDistance (>0 so TrackPosition advances)
        WriteInt32(buffer, scoringInfo + 104, 1);      // NumVehicles
        WriteBool(buffer, scoringInfo + 114, true);    // InRealtime

        buffer[LmuBinary.PlayerIndexOffset] = 0;
        WriteBool(buffer, LmuBinary.PlayerHasVehicleOffset, true);

        var telemetry = LmuBinary.TelemetryInfoBase; // player index 0
        WriteString(buffer, telemetry + 32, 64, "Peugeot 9X8");
        WriteInt32(buffer, telemetry + 20, 5);   // LapNumber
        WriteDouble(buffer, telemetry + 524, 42.0); // FuelLiters
        WriteDouble(buffer, telemetry + 532, 8000.0); // EngineMaxRpm

        var vehicleScoring = LmuBinary.VehicleScoringBase; // player index 0
        WriteDouble(buffer, vehicleScoring + 104, 3502.0); // vehicle LapDistance
        buffer[vehicleScoring + 506] = 2;                  // CountLapFlag = 2 (lap + time count)
        return buffer;
    }

    private static void WriteInt32(byte[] buffer, int offset, int value) =>
        BitConverter.TryWriteBytes(buffer.AsSpan(offset, sizeof(int)), value);

    private static void WriteDouble(byte[] buffer, int offset, double value) =>
        BitConverter.TryWriteBytes(buffer.AsSpan(offset, sizeof(double)), value);

    private static void WriteBool(byte[] buffer, int offset, bool value) =>
        buffer[offset] = value ? (byte)1 : (byte)0;

    private static void WriteString(byte[] buffer, int offset, int length, string value)
    {
        var bytes = System.Text.Encoding.UTF8.GetBytes(value);
        bytes.AsSpan(0, Math.Min(bytes.Length, length)).CopyTo(buffer.AsSpan(offset, length));
    }
}

/// <summary>
/// A controllable <see cref="ITelemetrySource"/> for engine tests: scripts the state a
/// connect attempt reaches and the frame (or no-frame, or exception) each read yields.
/// Thread-safe enough for the background-reader smoke (atomic publishes + interlocked
/// counters), matching the real off-thread adapter contract.
/// </summary>
internal sealed class ScriptedTelemetrySource : ITelemetrySource
{
    private TelemetryStatus _status = TelemetryStatus.Disconnected("Scripted");
    private TelemetryFrame _current = new();
    private int _disposed;
    private int _connectCount;
    private int _tryReadCount;

    public string Name => "Scripted";

    public TelemetryStatus Status => Volatile.Read(ref _status);

    public TelemetryFrame Current => Volatile.Read(ref _current);

    public int ConnectCount => Volatile.Read(ref _connectCount);

    public bool IsDisposed => Volatile.Read(ref _disposed) == 1;

    /// <summary>The state a connect attempt (1-based) reaches. Defaults to Connected.</summary>
    public Func<int, TelemetryConnectionState> ConnectState { get; set; } = _ => TelemetryConnectionState.Connected;

    /// <summary>The frame a read (1-based) yields, or null for "no new frame". May throw.</summary>
    public Func<int, TelemetryFrame?> ReadFrame { get; set; } = _ => null;

    public void Connect()
    {
        ObjectDisposedException.ThrowIf(IsDisposed, this);
        var attempt = Interlocked.Increment(ref _connectCount);
        Volatile.Write(ref _status, new TelemetryStatus { State = ConnectState(attempt), SourceName = Name });
    }

    public void Disconnect()
    {
        if (IsDisposed)
        {
            return;
        }

        Volatile.Write(ref _status, TelemetryStatus.Disconnected(Name));
    }

    public bool TryRead(out TelemetryFrame frame)
    {
        ObjectDisposedException.ThrowIf(IsDisposed, this);
        var n = Interlocked.Increment(ref _tryReadCount);
        var next = ReadFrame(n);
        if (next is null)
        {
            frame = Current;
            return false;
        }

        Volatile.Write(ref _current, next);
        Volatile.Write(ref _status, Status with
        {
            State = TelemetryConnectionState.Connected,
            SourceName = Name,
            LastFrameAt = next.Timestamp,
            LastFrameValid = true
        });
        frame = next;
        return true;
    }

    public void Dispose()
    {
        Volatile.Write(ref _disposed, 1);
        Volatile.Write(ref _status, TelemetryStatus.Disconnected(Name));
    }
}

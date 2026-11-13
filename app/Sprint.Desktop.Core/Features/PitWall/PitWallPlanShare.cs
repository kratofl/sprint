using System.Text.Json;
using System.Text.Json.Nodes;
using Sprint.Desktop.Api.Telemetry;
using Sprint.Desktop.Features.SessionPlanning;

namespace Sprint.Desktop.Features.PitWall;

/// <summary>
/// What the driver's desktop offers its engineer from the session planner: the active (armed or
/// tracking) plan, as <c>state.plans</c> writes it, with its race fuel under <c>raceFuel</c> as
/// <c>state.planFuel</c> has it (so the pit wall's stints are the planner's), and the trace of the
/// lap it targets for the session being driven (its race target outside qualifying and the race,
/// then the other one). The live link asks about once a second; the trace is read from disk only
/// when the target changes.
/// </summary>
/// <param name="fuelHistory">The lap history the race fuel rests on, as the planner reads it.</param>
/// <param name="clock">The time, for retrying a trace that was missing; the system clock when omitted.</param>
public sealed class PitWallPlanShare(SessionPlannerService planner, ILapTraceStore traces, IFuelHistorySource fuelHistory, Func<DateTimeOffset>? clock = null)
{
    /// <summary>How long a target whose trace was missing waits before the disk is read again (the link repeats a target this often).</summary>
    public static readonly TimeSpan MissingRetry = TimeSpan.FromSeconds(10);

    private readonly Lock _gate = new();
    private readonly Func<DateTimeOffset> _clock = clock ?? (() => DateTimeOffset.UtcNow);
    private string? _traceKey;
    private PitWallTrace? _trace;
    private DateTimeOffset _traceReadAt;

    public PitWallShare? Snapshot(SessionType sessionType)
    {
        // The history is read outside the planner's lock (it can reach the disk), for the context
        // the active plan has now; a plan swapped in between goes out without its fuel until the next ask.
        if (planner.ReadActive(plan => new PlanContext(plan.Game, plan.Car, plan.Track)) is not { } context)
        {
            return null;
        }

        FuelHistoryFigures history = fuelHistory.ForRace(context);
        Read? read = planner.ReadActive(plan =>
        {
            SegmentKind first = sessionType == SessionType.Qualify ? SegmentKind.Qualifying : SegmentKind.Race;
            SegmentKind second = first == SegmentKind.Race ? SegmentKind.Qualifying : SegmentKind.Race;
            PlanTarget? target = plan.TargetsFor(first)?.LapTime ?? plan.TargetsFor(second)?.LapTime;
            JsonObject json = JsonSerializer.SerializeToNode(plan, PitWallWire.Json)?.AsObject() ?? new JsonObject();
            if (new PlanContext(plan.Game, plan.Car, plan.Track) == context)
            {
                json["raceFuel"] = JsonSerializer.SerializeToNode(RaceFuelEstimate.For(plan, history), PitWallWire.Json);
            }

            return new Read(
                plan.Id,
                plan.Name,
                json.ToJsonString(PitWallWire.Json),
                target is { LapSessionId: { } sessionId, LapNumber: { } lapNumber } ? new TargetLap(sessionId, lapNumber, target.LapTimeSeconds) : null);
        });

        return read is null ? null : new PitWallShare(read.Id, read.Name, read.Json, read.Target is { } lap ? this.TraceOf(lap) : null);
    }

    /// <summary>
    /// A stored lap's traces at no more than <see cref="PitWallLapTraces.Points"/> points; null
    /// when the lap has no usable trace (pruned, imported without channels).
    /// </summary>
    public static PitWallTrace? FromStored(LapChannelTrace stored, int lap, double lapTime)
    {
        ArgumentNullException.ThrowIfNull(stored);
        if (!stored.IsUsable
            || !stored.TryGetChannel(LapTraceChannels.SpeedKph, out float[] speed)
            || !stored.TryGetChannel(LapTraceChannels.Throttle, out float[] throttle)
            || !stored.TryGetChannel(LapTraceChannels.Brake, out float[] brake)
            || !stored.TryGetChannel(LapTraceChannels.Steering, out float[] steering))
        {
            return null;
        }

        int count = new[] { speed.Length, throttle.Length, brake.Length, steering.Length }.Min();
        int stride = Math.Max(1, (int)Math.Ceiling(count / (double)PitWallLapTraces.Points));
        List<int> indices = [.. Enumerable.Range(0, (count + stride - 1) / stride).Select(step => step * stride)];
        return new PitWallTrace(
            lap,
            lapTime > 0 ? Math.Round(lapTime, 3) : null,
            [.. indices.Select(index => Math.Round(Math.Min(index * stored.PositionStep, 1), 4))],
            [.. indices.Select(index => Math.Round(speed[index], 1))],
            [.. indices.Select(index => Math.Round(throttle[index], 3))],
            [.. indices.Select(index => Math.Round(brake[index], 3))],
            [.. indices.Select(index => Math.Round(steering[index], 3))]);
    }

    private PitWallTrace? TraceOf(TargetLap lap)
    {
        string key = $"{lap.SessionId}#{lap.LapNumber}";
        lock (this._gate)
        {
            DateTimeOffset now = this._clock();
            if (key != this._traceKey || (this._trace is null && now - this._traceReadAt >= MissingRetry))
            {
                this._traceKey = key;
                this._traceReadAt = now;
                this._trace = traces.Load(LapTraceId.For(lap.SessionId, lap.LapNumber)) is { } stored
                    ? FromStored(stored, lap.LapNumber, lap.LapTimeSeconds)
                    : null;
            }

            return this._trace;
        }
    }

    private sealed record Read(string Id, string Name, string Json, TargetLap? Target);

    private sealed record TargetLap(string SessionId, int LapNumber, double LapTimeSeconds);
}

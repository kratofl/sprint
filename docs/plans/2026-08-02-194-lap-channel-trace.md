# Per-lap channel trace (#194) Implementation Plan

> **For agentic workers:** Use `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Every valid lap the driver records also stores a position-gridded, named-channel trace (~2 m resolution) on disk, bounded by a configurable disk budget, so Live Compare, the Analysis view and lap sharing have real channel data to work with.

**Architecture:** A new `LapChannelTrace` value type sits *beside* the untouched `LapReferenceCurve`. Traces are **not** stored inside the session JSON — `LocalLapHistoryStore.Save` rewrites a whole session on every lap crossing, so a ~160 KB trace per lap would make each crossing an O(n²) disk write. Instead a separate `ILapTraceStore` writes one compressed binary file per lap under `%AppData%/Sprint/lap-traces/`, and `LapHistoryRecord` carries only a `TraceId` pointer. A `LapTraceRetention` service prunes that directory against a disk budget, oldest-first, protecting the best N laps per (game, track, car), and clears the pointer on any lap whose trace it deletes so the stored tier never lies.

**Tech Stack:** .NET 10, C#, xunit v2, `System.IO.Compression.DeflateStream` and `BinaryWriter` (both in-box — **no new dependencies**).

## Global Constraints

- **Spec:** `docs/specs/live-compare.md` §2.1 and §2.2. Issue: #194 under epic #193. The spec's decisions are settled; do not re-derive them.
- **`LapReferenceCurve` must not change on disk.** Every plan target, thumbnail and delta depends on it. Its JSON shape, its `PositionStepDefault` of `0.005` and its output values stay byte-identical.
- **Nothing may block the telemetry read.** The recorder polls at 200 Hz. All disk work goes through the recorder's existing `_dispatch` hand-off.
- **Target resolution:** ~2 m per sample, derived per track from `TrackLengthMeters`. 2–5 m is the defensible band.
- **Channels are named and the format is versioned** — adding a channel later must need no migration of stored traces.
- **Build clean:** `dotnet build app/Sprint.Desktop.slnx -warnaserror` must pass. If a bare `dotnet` reports no SDKs, use `& 'C:\Program Files (x86)\dotnet\dotnet.exe'`.
- **Test command:** `dotnet test app/Sprint.Desktop.Tests/Sprint.Desktop.Tests.csproj --filter <ClassName>`
- **No `packages/types` mirroring in this issue.** The corpus types are desktop-local; `LapHistoryRecord` is not mirrored today. Mirroring lands with the cloud work (#197).
- Commit after every task, referencing `(#194)`.

---

## File Structure

**Create**

| File | Responsibility |
| --- | --- |
| `app/Sprint.Desktop.Client/Features/SessionPlanning/LapChannelTrace.cs` | The trace value type: grid, named channels, step derivation, resampling factory, positional accessor. |
| `app/Sprint.Desktop.Client/Features/SessionPlanning/ILapTraceStore.cs` | Persistence boundary for traces plus `LapTraceInfo`. Separate from `ILapHistoryStore` because the volumes and write cadence differ by two orders of magnitude. |
| `app/Sprint.Desktop.Client/Features/SessionPlanning/LocalLapTraceStore.cs` | One Deflate-compressed binary file per lap under `lap-traces/`. |
| `app/Sprint.Desktop.Client/Features/SessionPlanning/LapTraceRetention.cs` | Disk-budget pruning, best-N protection, pointer clearing. |
| `app/Sprint.Desktop.Tests/LapChannelTraceTests.cs` | Grid derivation, resampling, completeness guards, accessor. |
| `app/Sprint.Desktop.Tests/LapTraceStoreTests.cs` | Binary round-trip, size budget, corruption isolation. |
| `app/Sprint.Desktop.Tests/LapTraceRetentionTests.cs` | Budget pruning, best-N protection, orphans, pointer clearing. |

**Modify**

| File | Change |
| --- | --- |
| `Features/SessionPlanning/LapHistoryModels.cs` | Extract shared completeness guards; add `LapHistoryRecord.TraceId` + `HasChannelTrace`; add `LapTargetTier`. |
| `Features/SessionPlanning/LapHistoryRecorder.cs` | Sample all six channels; build and persist a trace at each crossing. |
| `Features/SessionPlanning/PlanTargetResolver.cs` | Three-valued `TierNote`. |
| `Features/SessionPlanning/PlanTargetModels.cs` | `PlanTarget.HasChannelTrace`. |
| `Features/SessionPlanning/SessionPlanModels.cs` | Delete `CaptureManifest` and `SessionPlanSegment.Capture` — the rejected 60 Hz time-grid seam. |
| `Runtime/AppSettings.cs` | Drop `TraceCaptureHz`/`TraceCaptureRates`; add `TraceProtectedLapsPerContext`. |
| `MainWindow.cs` | Wire the trace store and retention; replace the trace-rate settings control. |

---

### Task 1: The `LapChannelTrace` value type

**Files:**
- Create: `app/Sprint.Desktop.Client/Features/SessionPlanning/LapChannelTrace.cs`
- Modify: `app/Sprint.Desktop.Client/Features/SessionPlanning/LapHistoryModels.cs` (extract completeness guards)
- Test: `app/Sprint.Desktop.Tests/LapChannelTraceTests.cs`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `readonly record struct LapTraceSample(double Position, float SpeedKph, float Throttle, float Brake, float Steering, int Gear, double ElapsedSeconds)`
  - `static class LapTraceChannels` with `const string SpeedKph = "speedKph"`, `Throttle = "throttle"`, `Brake = "brake"`, `Steering = "steering"`, `Gear = "gear"`, `ElapsedSeconds = "elapsedSeconds"`, and `static IReadOnlyList<string> Default`
  - `sealed class LapChannelTrace` with `int Version`, `double PositionStep`, `double? TrackLengthMeters`, `Dictionary<string, float[]> Channels`, `int SampleCount`, `bool IsUsable`, `bool TryGetChannel(string, out float[])`, `double? ValueAt(string, double position)`
  - `static double LapChannelTrace.StepForTrackLength(double? trackLengthMeters)`
  - `static LapChannelTrace? LapChannelTrace.FromSamples(IReadOnlyList<LapTraceSample> samples, double lapTimeSeconds, double? trackLengthMeters)`
  - `static class LapCompleteness` with `static bool IsComplete(IReadOnlyList<double> positions)`

- [ ] **Step 1: Write the failing tests**

Create `app/Sprint.Desktop.Tests/LapChannelTraceTests.cs`:

```csharp
using Sprint.Desktop.Features.SessionPlanning;
using Xunit;

namespace Sprint.Desktop.Tests;

/// <summary>
/// Acceptance-criteria tests for the per-lap channel trace (#194). The trace is the second,
/// richer tier beside <see cref="LapReferenceCurve"/>: a position grid sized in metres rather
/// than in lap fractions, carrying named channels.
/// </summary>
public sealed class LapChannelTraceTests
{
    [Theory]
    [InlineData(13626.0)] // Le Mans
    [InlineData(7004.0)]  // Spa
    [InlineData(4259.0)]  // Zandvoort
    public void TheGridLandsNearTwoMetresWhateverTheTrackLength(double trackLengthMeters)
    {
        var step = LapChannelTrace.StepForTrackLength(trackLengthMeters);

        var metresPerSample = step * trackLengthMeters;
        Assert.InRange(metresPerSample, 1.5, 5.0);
    }

    [Fact]
    public void AnUnknownTrackLengthStillYieldsADefensibleGrid()
    {
        var step = LapChannelTrace.StepForTrackLength(null);

        Assert.True(step > 0);
        // A typical GP circuit under the fallback assumption still lands in the band.
        Assert.InRange(step * 5000.0, 1.5, 5.0);
    }

    [Fact]
    public void AbsurdTrackLengthsAreClampedToASaneSampleCount()
    {
        // A 200 m karting loop and a 200 km fantasy layout must not produce two samples
        // or two million; the grid is a storage ceiling as much as a resolution.
        foreach (var length in new[] { 200.0, 200_000.0 })
        {
            var count = (int)Math.Round(1.0 / LapChannelTrace.StepForTrackLength(length)) + 1;
            Assert.InRange(count, LapChannelTrace.MinSamples, LapChannelTrace.MaxSamples);
        }
    }

    [Fact]
    public void EveryDefaultChannelIsCapturedOnTheSharedGrid()
    {
        var trace = LapChannelTrace.FromSamples(FullLap(), 90.0, 5000.0);

        Assert.NotNull(trace);
        foreach (var name in LapTraceChannels.Default)
        {
            Assert.True(trace!.TryGetChannel(name, out var values), $"missing channel {name}");
            Assert.Equal(trace.SampleCount, values.Length);
        }
    }

    [Fact]
    public void ChannelsAreInterpolatedOntoTheGridAndReadBackByPosition()
    {
        // Speed ramps linearly 100 -> 300 across the lap, so any position reads back its ramp.
        var trace = LapChannelTrace.FromSamples(FullLap(), 90.0, 5000.0);

        Assert.NotNull(trace);
        Assert.Equal(200.0, trace!.ValueAt(LapTraceChannels.SpeedKph, 0.5)!.Value, 1);
        Assert.Equal(100.0, trace.ValueAt(LapTraceChannels.SpeedKph, 0.0)!.Value, 1);
    }

    [Fact]
    public void TheLapTimeAtTheLineIsTheLapsOwnTime()
    {
        var trace = LapChannelTrace.FromSamples(FullLap(), 90.0, 5000.0);

        Assert.NotNull(trace);
        Assert.True(trace!.TryGetChannel(LapTraceChannels.ElapsedSeconds, out var elapsed));
        Assert.Equal(90.0, elapsed[^1], 2);
    }

    [Fact]
    public void GearIsCarriedWithoutRoundingToTheWrongRatio()
    {
        var trace = LapChannelTrace.FromSamples(FullLap(), 90.0, 5000.0);

        Assert.NotNull(trace);
        Assert.True(trace!.TryGetChannel(LapTraceChannels.Gear, out var gears));
        Assert.All(gears, gear => Assert.Equal(Math.Round(gear), gear));
    }

    [Fact]
    public void APartialLapProducesNoTraceRatherThanAMisleadingOne()
    {
        // Joined at half distance: the same guard the reference curve applies.
        var late = FullLap().Where(sample => sample.Position >= 0.5).ToList();

        Assert.Null(LapChannelTrace.FromSamples(late, 90.0, 5000.0));
    }

    [Fact]
    public void AHoleInTheMiddleOfTheLapProducesNoTrace()
    {
        var holed = FullLap().Where(sample => sample.Position is < 0.3 or > 0.6).ToList();

        Assert.Null(LapChannelTrace.FromSamples(holed, 90.0, 5000.0));
    }

    [Fact]
    public void ALapWithNoCompletedTimeProducesNoTrace()
    {
        Assert.Null(LapChannelTrace.FromSamples(FullLap(), 0.0, 5000.0));
    }

    [Fact]
    public void TheGuardsMatchTheReferenceCurveSoTheTwoTiersNeverDisagree()
    {
        // A lap the curve accepts must produce a trace, and one it rejects must not:
        // a lap that has a curve but no trace, or the reverse, is a tier the UI cannot explain.
        var samples = FullLap();
        var positionsAndTimes = samples
            .Select(sample => (sample.Position, (double)sample.ElapsedSeconds))
            .ToList();

        Assert.NotNull(LapReferenceCurve.FromSamples(positionsAndTimes, 90.0));
        Assert.NotNull(LapChannelTrace.FromSamples(samples, 90.0, 5000.0));
    }

    [Fact]
    public void ATraceStaysWithinItsStatedSizeBudget()
    {
        // ~24 bytes per sample across six channels is the budget the spec sized storage on.
        var trace = LapChannelTrace.FromSamples(FullLap(), 90.0, 13_626.0);

        Assert.NotNull(trace);
        var bytes = trace!.SampleCount * trace.Channels.Count * sizeof(float);
        Assert.InRange(bytes, 1, 400_000);
    }

    /// <summary>
    /// One synthetic lap sampled every 0.1 % of the track: speed ramps 100 -> 300, throttle
    /// falls 1 -> 0, brake rises 0 -> 1, steering ramps -1 -> 1, gear climbs 1 -> 8, and
    /// elapsed time is linear to 90 s.
    /// </summary>
    private static List<LapTraceSample> FullLap()
    {
        var samples = new List<LapTraceSample>();
        for (var i = 0; i <= 1000; i++)
        {
            var position = i / 1000.0;
            samples.Add(new LapTraceSample(
                position,
                (float)(100 + (200 * position)),
                (float)(1 - position),
                (float)position,
                (float)((2 * position) - 1),
                1 + (int)(position * 7),
                90.0 * position));
        }

        return samples;
    }
}
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `dotnet test app/Sprint.Desktop.Tests/Sprint.Desktop.Tests.csproj --filter LapChannelTraceTests`
Expected: build failure — `LapChannelTrace`, `LapTraceSample`, `LapTraceChannels` do not exist.

- [ ] **Step 3: Extract the completeness guards so both tiers share one definition**

In `LapHistoryModels.cs`, add above `LapReferenceCurve`:

```csharp
/// <summary>
/// Whether a lap's observed positions span enough of the lap to describe it honestly.
/// <para>
/// Shared by both stored tiers on purpose. A lap that produced a reference curve but no
/// channel trace — or the reverse — would be a tier the UI has no words for, so the two
/// must accept and reject exactly the same laps.
/// </para>
/// </summary>
public static class LapCompleteness
{
    /// <summary>A trace that starts later than this joined the lap in progress.</summary>
    public const double StartMax = 0.2;

    /// <summary>A trace that ends earlier than this describes an aborted lap.</summary>
    public const double EndMin = 0.8;

    public const int MinSamples = 8;

    /// <summary>
    /// The largest unobserved stretch tolerated, as a fraction of the lap. Sized against the
    /// reference curve's output interval rather than against a trace's much finer grid: the
    /// question is "was the driving seen", and seconds of unobserved driving is the same
    /// amount of missing lap whichever tier is being built from it.
    /// </summary>
    public const double MaxGap = LapReferenceCurve.PositionStepDefault * 10;

    /// <summary>Positions must be supplied in ascending order.</summary>
    public static bool IsComplete(IReadOnlyList<double> positions)
    {
        ArgumentNullException.ThrowIfNull(positions);
        if (positions.Count < MinSamples
            || positions[0] > StartMax
            || positions[^1] < EndMin)
        {
            return false;
        }

        for (var i = 1; i < positions.Count; i++)
        {
            if (positions[i] - positions[i - 1] > MaxGap)
            {
                return false;
            }
        }

        return true;
    }
}
```

Then in `LapReferenceCurve`, delete the `CompleteStartMax`, `CompleteEndMin`, `CompleteMinSamples` and `CompleteMaxGap` constants and the private `HasGap` method, and replace the guard block in `FromSamples` with:

```csharp
        // The recorder only files laps the game gave a completed time for, but this factory is
        // the seam a future trace source writes through too, and past the last sample the lap
        // total is the only time it can state — an absent one would be stated as zero.
        if (lapTimeSeconds <= 0
            || !LapCompleteness.IsComplete([.. samples.Select(sample => sample.Position)]))
        {
            return null;
        }
```

- [ ] **Step 4: Write the trace type**

Create `app/Sprint.Desktop.Client/Features/SessionPlanning/LapChannelTrace.cs`:

```csharp
namespace Sprint.Desktop.Features.SessionPlanning;

/// <summary>One observed instant of a lap, as the recorder saw it.</summary>
/// <param name="Position">Track position, 0–1.</param>
public readonly record struct LapTraceSample(
    double Position,
    float SpeedKph,
    float Throttle,
    float Brake,
    float Steering,
    int Gear,
    double ElapsedSeconds);

/// <summary>
/// The channel names a trace carries. Names rather than fields so a later feature can add a
/// channel without migrating every stored trace — a reader asks for what it needs and copes
/// with absence.
/// </summary>
public static class LapTraceChannels
{
    public const string SpeedKph = "speedKph";
    public const string Throttle = "throttle";
    public const string Brake = "brake";
    public const string Steering = "steering";
    public const string Gear = "gear";
    public const string ElapsedSeconds = "elapsedSeconds";

    /// <summary>What the recorder writes today.</summary>
    public static IReadOnlyList<string> Default { get; } =
        [SpeedKph, Throttle, Brake, Steering, Gear, ElapsedSeconds];
}

/// <summary>
/// How a lap was driven, channel by channel, on a fixed position grid (#194). The richer tier
/// beside <see cref="LapReferenceCurve"/>, which stays position→time only and stays cheap.
/// <para>
/// The grid is sized in <em>metres</em>, not in lap fractions. A fixed fraction would mean 68 m
/// of resolution at Le Mans and 25 m at Zandvoort, and the reading a driver needs — where they
/// lifted, where they hit the pedal — is a distance on track. The step is stored per instance,
/// the same convention <see cref="LapReferenceCurve"/> already uses, so a reader never assumes
/// a global one.
/// </para>
/// <para>
/// Values are <see cref="float"/>: 24 bytes per sample across the six default channels, which
/// is what the storage budget was sized on. Milliseconds and 0.1 km/h are both far inside a
/// float's precision at these magnitudes.
/// </para>
/// </summary>
public sealed class LapChannelTrace
{
    /// <summary>Bumped only when the on-disk layout changes. Adding a channel does not.</summary>
    public const int FormatVersion = 1;

    /// <summary>The resolution the grid aims for, in metres.</summary>
    public const double TargetSampleMeters = 2.0;

    /// <summary>Assumed track length when the game did not report one — a typical GP circuit.</summary>
    public const double FallbackTrackLengthMeters = 5000.0;

    /// <summary>Sample-count floor, so a very short layout still has a usable grid.</summary>
    public const int MinSamples = 200;

    /// <summary>Sample-count ceiling, so an implausible track length cannot size a huge file.</summary>
    public const int MaxSamples = 20_000;

    private const double PositionEpsilon = 1e-6;

    public int Version { get; set; } = FormatVersion;

    /// <summary>The sampling interval as a fraction of a lap. Index <c>i</c> is <c>i * PositionStep</c>.</summary>
    public double PositionStep { get; set; }

    /// <summary>
    /// The track length the grid was derived from, so a reader can convert the grid back into
    /// metres without guessing which layout produced it. Null when the game never said.
    /// </summary>
    public double? TrackLengthMeters { get; set; }

    /// <summary>Channel values by name, every array the same length.</summary>
    public Dictionary<string, float[]> Channels { get; set; } = new(StringComparer.Ordinal);

    public int SampleCount => Channels.Count == 0 ? 0 : Channels.Values.First().Length;

    /// <summary>Whether this trace can honestly drive a comparison.</summary>
    public bool IsUsable => PositionStep > 0 && Channels.Count > 0 && SampleCount > 1;

    /// <summary>
    /// The grid step for a track, as a fraction of a lap, sized to land near
    /// <see cref="TargetSampleMeters"/> and clamped so the sample count stays sane.
    /// </summary>
    public static double StepForTrackLength(double? trackLengthMeters)
    {
        var length = trackLengthMeters is { } reported && double.IsFinite(reported) && reported > 0
            ? reported
            : FallbackTrackLengthMeters;

        var count = (int)Math.Round(length / TargetSampleMeters);
        return 1.0 / Math.Clamp(count, MinSamples - 1, MaxSamples - 1);
    }

    public bool TryGetChannel(string name, out float[] values)
    {
        if (Channels.TryGetValue(name, out var stored) && stored.Length > 0)
        {
            values = stored;
            return true;
        }

        values = [];
        return false;
    }

    /// <summary>
    /// A channel's value at an arbitrary track position, linearly interpolated between grid
    /// points. Null when the channel is absent — the caller must be able to tell "the trace
    /// does not carry this" from "the value here is zero".
    /// </summary>
    public double? ValueAt(string name, double position)
    {
        if (!TryGetChannel(name, out var values) || PositionStep <= 0)
        {
            return null;
        }

        var exact = Math.Clamp(position, 0, 1) / PositionStep;
        var index = (int)Math.Floor(exact);
        if (index >= values.Length - 1)
        {
            return values[^1];
        }

        var fraction = exact - index;
        return values[index] + ((values[index + 1] - values[index]) * fraction);
    }

    /// <summary>
    /// Resamples one lap's observed samples onto the track's grid, or returns null when they
    /// do not span enough of the lap to describe it honestly. Rejects exactly the laps
    /// <see cref="LapReferenceCurve.FromSamples"/> rejects, so the two tiers never disagree.
    /// </summary>
    /// <param name="samples">The lap's observed samples, strictly ascending in position.</param>
    /// <param name="lapTimeSeconds">The lap's completed time — the only time known true at the line.</param>
    /// <param name="trackLengthMeters">Track length, for sizing the grid. Null when unknown.</param>
    public static LapChannelTrace? FromSamples(
        IReadOnlyList<LapTraceSample> samples,
        double lapTimeSeconds,
        double? trackLengthMeters)
    {
        ArgumentNullException.ThrowIfNull(samples);

        if (lapTimeSeconds <= 0
            || !LapCompleteness.IsComplete([.. samples.Select(sample => sample.Position)]))
        {
            return null;
        }

        var step = StepForTrackLength(trackLengthMeters);
        var count = (int)Math.Round(1.0 / step) + 1;

        var speed = new float[count];
        var throttle = new float[count];
        var brake = new float[count];
        var steering = new float[count];
        var gear = new float[count];
        var elapsed = new float[count];

        var index = 0;
        for (var i = 0; i < count; i++)
        {
            var position = Math.Min(i * step, 1.0);

            // Before the first observation nothing was seen; holding the first reading is what
            // the reference curve does at the same edge.
            if (position <= samples[0].Position)
            {
                Write(i, samples[0], samples[0].ElapsedSeconds);
                continue;
            }

            // Past the last observation the lap total is the only time known to be true, and
            // the last reading is the only state observed.
            if (position >= samples[^1].Position)
            {
                Write(i, samples[^1], lapTimeSeconds);
                continue;
            }

            // Both series ascend, so the bracketing sample only ever moves forward.
            while (samples[index + 1].Position <= position)
            {
                index++;
            }

            var start = samples[index];
            var end = samples[index + 1];
            var span = end.Position - start.Position;
            var t = span <= PositionEpsilon ? 0 : (position - start.Position) / span;

            speed[i] = Lerp(start.SpeedKph, end.SpeedKph, t);
            throttle[i] = Lerp(start.Throttle, end.Throttle, t);
            brake[i] = Lerp(start.Brake, end.Brake, t);
            steering[i] = Lerp(start.Steering, end.Steering, t);
            // Gear is a discrete selection, not a quantity: interpolating 3 and 4 into 3.5
            // would draw a ratio the car does not have. Hold the gear that was engaged.
            gear[i] = start.Gear;
            elapsed[i] = (float)(start.ElapsedSeconds + ((end.ElapsedSeconds - start.ElapsedSeconds) * t));
        }

        return new LapChannelTrace
        {
            Version = FormatVersion,
            PositionStep = step,
            TrackLengthMeters = trackLengthMeters,
            Channels = new Dictionary<string, float[]>(StringComparer.Ordinal)
            {
                [LapTraceChannels.SpeedKph] = speed,
                [LapTraceChannels.Throttle] = throttle,
                [LapTraceChannels.Brake] = brake,
                [LapTraceChannels.Steering] = steering,
                [LapTraceChannels.Gear] = gear,
                [LapTraceChannels.ElapsedSeconds] = elapsed,
            },
        };

        void Write(int i, LapTraceSample sample, double elapsedSeconds)
        {
            speed[i] = sample.SpeedKph;
            throttle[i] = sample.Throttle;
            brake[i] = sample.Brake;
            steering[i] = sample.Steering;
            gear[i] = sample.Gear;
            elapsed[i] = (float)elapsedSeconds;
        }
    }

    private static float Lerp(float start, float end, double t) =>
        (float)(start + ((end - start) * t));
}
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `dotnet test app/Sprint.Desktop.Tests/Sprint.Desktop.Tests.csproj --filter "LapChannelTraceTests|LapHistoryTests"`
Expected: PASS. `LapHistoryTests` is included because Step 3 refactored `LapReferenceCurve`'s guards — it must still accept and reject exactly the same laps as before.

- [ ] **Step 6: Commit**

```bash
git add app/Sprint.Desktop.Client/Features/SessionPlanning/LapChannelTrace.cs \
        app/Sprint.Desktop.Client/Features/SessionPlanning/LapHistoryModels.cs \
        app/Sprint.Desktop.Tests/LapChannelTraceTests.cs
git commit -m "feat(planner): per-lap channel trace on a metre-sized position grid (#194)"
```

---

### Task 2: The trace store

**Files:**
- Create: `app/Sprint.Desktop.Client/Features/SessionPlanning/ILapTraceStore.cs`
- Create: `app/Sprint.Desktop.Client/Features/SessionPlanning/LocalLapTraceStore.cs`
- Test: `app/Sprint.Desktop.Tests/LapTraceStoreTests.cs`

**Interfaces:**
- Consumes: `LapChannelTrace`, `LapTraceChannels` from Task 1.
- Produces:
  - `readonly record struct LapTraceInfo(string TraceId, long SizeBytes, DateTimeOffset WrittenAt)`
  - `interface ILapTraceStore` with `void Save(string traceId, LapChannelTrace trace)`, `LapChannelTrace? Load(string traceId)`, `void Delete(string traceId)`, `IReadOnlyList<LapTraceInfo> List()`, `long TotalBytes()`
  - `sealed class LocalLapTraceStore : ILapTraceStore` with `LocalLapTraceStore(string? dataRoot = null, ILog? log = null)`
  - `static string LapTraceId.For(string sessionId, int lapNumber)`

- [ ] **Step 1: Write the failing tests**

Create `app/Sprint.Desktop.Tests/LapTraceStoreTests.cs`:

```csharp
using Sprint.Desktop.Features.SessionPlanning;
using Xunit;

namespace Sprint.Desktop.Tests;

/// <summary>
/// Acceptance-criteria tests for trace persistence (#194). Traces live outside the session
/// JSON on purpose: the history store rewrites a whole session on every lap crossing, so a
/// trace stored inside one would make each crossing cost the whole session's traces again.
/// </summary>
public sealed class LapTraceStoreTests
{
    [Fact]
    public void ATraceRoundTripsThroughTheLocalStore()
    {
        WithStore((store, _) =>
        {
            var trace = Sample();

            store.Save("hs-1-3", trace);
            var loaded = store.Load("hs-1-3");

            Assert.NotNull(loaded);
            Assert.Equal(trace.Version, loaded!.Version);
            Assert.Equal(trace.PositionStep, loaded.PositionStep, 9);
            Assert.Equal(trace.TrackLengthMeters, loaded.TrackLengthMeters);
            Assert.Equal(trace.SampleCount, loaded.SampleCount);
            foreach (var (name, values) in trace.Channels)
            {
                Assert.True(loaded.TryGetChannel(name, out var round));
                Assert.Equal(values, round);
            }
        });
    }

    [Fact]
    public void AnUnknownTrackLengthSurvivesTheRoundTripAsUnknown()
    {
        WithStore((store, _) =>
        {
            var trace = Sample();
            trace.TrackLengthMeters = null;

            store.Save("hs-1-4", trace);

            Assert.Null(store.Load("hs-1-4")!.TrackLengthMeters);
        });
    }

    [Fact]
    public void AnUnknownChannelNameRoundTripsSoALaterChannelNeedsNoMigration()
    {
        WithStore((store, _) =>
        {
            var trace = Sample();
            trace.Channels["tyreTempFl"] = [80f, 81f, 82f];
            // Every channel must be the same length; pad the rest to match this one.
            foreach (var name in LapTraceChannels.Default)
            {
                trace.Channels[name] = [1f, 2f, 3f];
            }

            store.Save("hs-1-5", trace);
            var loaded = store.Load("hs-1-5");

            Assert.True(loaded!.TryGetChannel("tyreTempFl", out var values));
            Assert.Equal([80f, 81f, 82f], values);
        });
    }

    [Fact]
    public void ALeMansLapStaysInsideItsStatedStorageBudget()
    {
        WithStore((store, _) =>
        {
            var trace = LapChannelTrace.FromSamples(FullLap(), 200.0, 13_626.0);

            store.Save("hs-1-6", trace!);

            var info = Assert.Single(store.List());
            // ~160 KB uncompressed was the spec's budget; compression only helps.
            Assert.InRange(info.SizeBytes, 1, 200_000);
        });
    }

    [Fact]
    public void ACorruptTraceIsIsolatedWithoutLosingTheOthers()
    {
        WithStore((store, root) =>
        {
            store.Save("good", Sample());
            File.WriteAllText(Path.Combine(root, "bad.trace"), "not a trace");

            Assert.Null(store.Load("bad"));
            Assert.NotNull(store.Load("good"));
        });
    }

    [Fact]
    public void AMissingTraceReadsAsAbsentRatherThanThrowing()
    {
        WithStore((store, _) => Assert.Null(store.Load("never-written")));
    }

    [Fact]
    public void DeletingATraceRemovesItFromTheListingAndTheTotal()
    {
        WithStore((store, _) =>
        {
            store.Save("a", Sample());
            store.Save("b", Sample());
            var before = store.TotalBytes();

            store.Delete("a");

            Assert.Single(store.List());
            Assert.True(store.TotalBytes() < before);
            store.Delete("a"); // A second delete is a no-op, not a failure.
        });
    }

    [Fact]
    public void ATraceIdIsDerivedFromItsSessionAndLap()
    {
        Assert.NotEqual(LapTraceId.For("hs-1", 3), LapTraceId.For("hs-1", 4));
        Assert.NotEqual(LapTraceId.For("hs-1", 3), LapTraceId.For("hs-2", 3));
        Assert.Equal(LapTraceId.For("hs-1", 3), LapTraceId.For("hs-1", 3));
    }

    [Fact]
    public void ASessionIdWithPathSeparatorsCannotEscapeTheTraceDirectory()
    {
        WithStore((store, root) =>
        {
            store.Save(LapTraceId.For("../../evil", 1), Sample());

            Assert.All(
                Directory.EnumerateFiles(root, "*", SearchOption.AllDirectories),
                path => Assert.StartsWith(root, Path.GetFullPath(path), StringComparison.Ordinal));
        });
    }

    private static LapChannelTrace Sample() => new()
    {
        PositionStep = 0.25,
        TrackLengthMeters = 5000,
        Channels = new Dictionary<string, float[]>(StringComparer.Ordinal)
        {
            [LapTraceChannels.SpeedKph] = [100f, 150f, 200f, 250f, 300f],
            [LapTraceChannels.Throttle] = [1f, 1f, 0f, 0.5f, 1f],
            [LapTraceChannels.Brake] = [0f, 0f, 1f, 0.2f, 0f],
            [LapTraceChannels.Steering] = [0f, -0.5f, 0.5f, 0f, 0f],
            [LapTraceChannels.Gear] = [3f, 4f, 2f, 3f, 5f],
            [LapTraceChannels.ElapsedSeconds] = [0f, 20f, 45f, 70f, 90f],
        },
    };

    private static List<LapTraceSample> FullLap()
    {
        var samples = new List<LapTraceSample>();
        for (var i = 0; i <= 2000; i++)
        {
            var position = i / 2000.0;
            samples.Add(new LapTraceSample(
                position, (float)(100 + (200 * position)), (float)(1 - position),
                (float)position, 0f, 4, 200.0 * position));
        }

        return samples;
    }

    private static void WithStore(Action<LocalLapTraceStore, string> body)
    {
        var root = Path.Combine(Path.GetTempPath(), "sprint-traces-" + Guid.NewGuid().ToString("N"));
        try
        {
            body(new LocalLapTraceStore(root), root);
        }
        finally
        {
            if (Directory.Exists(root))
            {
                Directory.Delete(root, recursive: true);
            }
        }
    }
}
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `dotnet test app/Sprint.Desktop.Tests/Sprint.Desktop.Tests.csproj --filter LapTraceStoreTests`
Expected: build failure — `ILapTraceStore`, `LocalLapTraceStore`, `LapTraceId` do not exist.

- [ ] **Step 3: Write the boundary**

Create `app/Sprint.Desktop.Client/Features/SessionPlanning/ILapTraceStore.cs`:

```csharp
namespace Sprint.Desktop.Features.SessionPlanning;

/// <summary>What retention needs to know about a stored trace without reading it.</summary>
public readonly record struct LapTraceInfo(string TraceId, long SizeBytes, DateTimeOffset WrittenAt);

/// <summary>The id under which a lap's trace is filed.</summary>
public static class LapTraceId
{
    /// <summary>
    /// Derived from the owning session and lap rather than generated, so a lap and its trace
    /// can always find each other — including after a crash between the two writes.
    /// </summary>
    public static string For(string sessionId, int lapNumber) => $"{sessionId}-{lapNumber}";
}

/// <summary>
/// Persistence boundary for per-lap channel traces (#194). Deliberately separate from
/// <see cref="ILapHistoryStore"/>: a history session is a small document rewritten on every
/// lap crossing, while a trace is a large immutable blob written once and usually never read.
/// Storing traces inside the session document would make each crossing rewrite every trace
/// the session had already produced.
/// </summary>
public interface ILapTraceStore
{
    /// <summary>Creates or replaces the trace filed under <paramref name="traceId"/>.</summary>
    void Save(string traceId, LapChannelTrace trace);

    /// <summary>The trace, or null when it was never written, was pruned, or is unreadable.</summary>
    LapChannelTrace? Load(string traceId);

    /// <summary>Removes a trace. A no-op if it does not exist.</summary>
    void Delete(string traceId);

    /// <summary>Every stored trace's id, size and write time, without reading any of them.</summary>
    IReadOnlyList<LapTraceInfo> List();

    /// <summary>Total bytes on disk, for the retention budget.</summary>
    long TotalBytes() => List().Sum(info => info.SizeBytes);
}
```

> There is deliberately **no** `EmptyLapTraceStore` mirroring `EmptyLapHistoryStore`. A caller with no trace store passes null and the recorder skips the tier entirely; a no-op store would instead let a lap claim a trace that was thrown away.

- [ ] **Step 4: Write the local store**

Create `app/Sprint.Desktop.Client/Features/SessionPlanning/LocalLapTraceStore.cs`:

```csharp
using System.IO.Compression;
using System.Text;
using Sprint.Desktop.Features.Diagnostics;

namespace Sprint.Desktop.Features.SessionPlanning;

/// <summary>
/// Desktop-local <see cref="ILapTraceStore"/>: one Deflate-compressed binary file per lap under
/// <c>%AppData%/Sprint/lap-traces/</c>.
/// <para>
/// Binary rather than JSON because this is the largest thing Sprint stores. A Le Mans lap is
/// ~6,800 samples across six channels; as indented JSON that is megabytes of decimal text for
/// numbers that occupy 24 bytes in their natural form. Deflate is in-box, so this costs no
/// dependency.
/// </para>
/// <para>
/// The layout is length-prefixed and channel names are written into the file, so a trace
/// carrying a channel this build has never heard of still round-trips. That is what makes the
/// "named, versioned channels" decision real rather than nominal.
/// </para>
/// </summary>
public sealed class LocalLapTraceStore : ILapTraceStore
{
    private const string Extension = ".trace";

    // Identifies the format in a hex dump and rejects any other file that lands here.
    private static readonly byte[] Magic = "SPTR"u8.ToArray();

    private readonly string _root;
    private readonly ILog _log;

    public LocalLapTraceStore(string? dataRoot = null, ILog? log = null)
    {
        _root = dataRoot ?? Path.Combine(
            Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData),
            "Sprint",
            "lap-traces");
        _log = log ?? NullLog.Instance;
        Directory.CreateDirectory(_root);
    }

    public void Save(string traceId, LapChannelTrace trace)
    {
        ArgumentNullException.ThrowIfNull(trace);
        if (string.IsNullOrEmpty(traceId))
        {
            throw new ArgumentException("A trace must have an id before it can be saved.", nameof(traceId));
        }

        try
        {
            using var file = File.Create(TracePath(traceId));
            using var deflate = new DeflateStream(file, CompressionLevel.Fastest);
            using var writer = new BinaryWriter(deflate, Encoding.UTF8, leaveOpen: true);

            writer.Write(Magic);
            writer.Write(trace.Version);
            writer.Write(trace.PositionStep);
            // NaN carries "the game never said" through a fixed-width field without a flag byte.
            writer.Write(trace.TrackLengthMeters ?? double.NaN);
            writer.Write(trace.SampleCount);
            writer.Write(trace.Channels.Count);

            foreach (var (name, values) in trace.Channels)
            {
                writer.Write(name);
                writer.Write(values.Length);
                foreach (var value in values)
                {
                    writer.Write(value);
                }
            }
        }
        catch (Exception ex) when (ex is IOException or UnauthorizedAccessException)
        {
            // Losing one lap's trace must never take the lap record with it.
            _log.Error($"Failed to persist lap trace '{traceId}'", ex);
        }
    }

    public LapChannelTrace? Load(string traceId)
    {
        var path = TracePath(traceId);
        if (!File.Exists(path))
        {
            return null;
        }

        try
        {
            using var file = File.OpenRead(path);
            using var deflate = new DeflateStream(file, CompressionMode.Decompress);
            using var reader = new BinaryReader(deflate, Encoding.UTF8, leaveOpen: true);

            if (!reader.ReadBytes(Magic.Length).AsSpan().SequenceEqual(Magic))
            {
                _log.Warn($"Ignoring lap trace '{traceId}': not a Sprint trace file");
                return null;
            }

            var trace = new LapChannelTrace { Version = reader.ReadInt32() };
            trace.PositionStep = reader.ReadDouble();
            var length = reader.ReadDouble();
            trace.TrackLengthMeters = double.IsNaN(length) ? null : length;
            _ = reader.ReadInt32(); // Sample count: each channel carries its own length.
            var channelCount = reader.ReadInt32();

            for (var i = 0; i < channelCount; i++)
            {
                var name = reader.ReadString();
                var count = reader.ReadInt32();
                var values = new float[count];
                for (var j = 0; j < count; j++)
                {
                    values[j] = reader.ReadSingle();
                }

                trace.Channels[name] = values;
            }

            return trace;
        }
        catch (Exception ex) when (ex is IOException or InvalidDataException or EndOfStreamException)
        {
            // One unreadable trace must not cost the driver every other lap they have driven.
            _log.Warn($"Ignoring unreadable lap trace at {path}", ex);
            return null;
        }
    }

    public void Delete(string traceId)
    {
        if (string.IsNullOrEmpty(traceId))
        {
            return;
        }

        try
        {
            var path = TracePath(traceId);
            if (File.Exists(path))
            {
                File.Delete(path);
            }
        }
        catch (Exception ex) when (ex is IOException or UnauthorizedAccessException)
        {
            _log.Warn($"Failed to delete lap trace '{traceId}'", ex);
        }
    }

    public IReadOnlyList<LapTraceInfo> List()
    {
        var traces = new List<LapTraceInfo>();
        foreach (var path in Directory.EnumerateFiles(_root, "*" + Extension))
        {
            var info = new FileInfo(path);
            traces.Add(new LapTraceInfo(
                Path.GetFileNameWithoutExtension(path),
                info.Length,
                new DateTimeOffset(info.LastWriteTimeUtc, TimeSpan.Zero)));
        }

        return traces;
    }

    /// <summary>
    /// Declared rather than inherited from the interface default: a default interface member is
    /// only reachable through the interface, so a caller holding a <c>LocalLapTraceStore</c>
    /// could not call it at all.
    /// </summary>
    public long TotalBytes() => List().Sum(info => info.SizeBytes);

    private string TracePath(string traceId) =>
        Path.Combine(_root, SafeFileName(traceId) + Extension);

    // Ids are derived from a session id, which could carry separators from an import or a sync.
    private static string SafeFileName(string traceId)
    {
        Span<char> buffer = stackalloc char[traceId.Length];
        for (var i = 0; i < traceId.Length; i++)
        {
            var c = traceId[i];
            buffer[i] = Array.IndexOf(Path.GetInvalidFileNameChars(), c) >= 0 || c is '.' ? '_' : c;
        }

        return new string(buffer);
    }
}
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `dotnet test app/Sprint.Desktop.Tests/Sprint.Desktop.Tests.csproj --filter LapTraceStoreTests`
Expected: PASS.

> Note on `ASessionIdWithPathSeparatorsCannotEscapeTheTraceDirectory`: `Path.GetInvalidFileNameChars()` covers `/` and `\` on Windows but **not** `.`, so `..` alone would still traverse. `SafeFileName` therefore also replaces `.`, which is why the test checks the written file resolves inside the root.

- [ ] **Step 6: Commit**

```bash
git add app/Sprint.Desktop.Client/Features/SessionPlanning/ILapTraceStore.cs \
        app/Sprint.Desktop.Client/Features/SessionPlanning/LocalLapTraceStore.cs \
        app/Sprint.Desktop.Tests/LapTraceStoreTests.cs
git commit -m "feat(planner): compressed per-lap trace store outside the session document (#194)"
```

---

### Task 3: The recorder writes a trace for every valid lap

**Files:**
- Modify: `app/Sprint.Desktop.Client/Features/SessionPlanning/LapHistoryModels.cs`
- Modify: `app/Sprint.Desktop.Client/Features/SessionPlanning/LapHistoryRecorder.cs`
- Test: `app/Sprint.Desktop.Tests/LapHistoryTests.cs` (append)

**Interfaces:**
- Consumes: `LapChannelTrace`, `LapTraceSample`, `ILapTraceStore`, `LapTraceId` from Tasks 1–2.
- Produces:
  - `string? LapHistoryRecord.TraceId` (JSON `traceId`)
  - `bool LapHistoryRecord.HasChannelTrace` (`[JsonIgnore]`, true when `TraceId` is set)
  - `LapHistoryRecorder(ILapHistoryStore store, ILapTraceStore? traces = null, Func<DateTimeOffset>? clock = null, Func<string>? idFactory = null, Action<Action>? dispatch = null, ILog? log = null)`

**The trace store stays nullable inside the recorder.** Do *not* substitute `EmptyLapTraceStore` as a default: the recorder would still build a trace, still set `TraceId`, and the lap would then claim a tier whose data was silently discarded. A recorder with no trace store must record laps that honestly report no trace.

- [ ] **Step 1: Extend the existing test helpers**

`LapHistoryTests` already has `CollectingLapHistoryStore`, `NewRecorder`, `Frame`, `LapFrame`, `DriveLap` and `Crossing`. Extend those rather than adding parallel ones.

Give `Frame` a track length, since the grid is derived from it:

```csharp
    private static TelemetryFrame Frame(
        SessionType sessionType,
        int lap,
        double lastLapTime = 0,
        bool isValid = true,
        string track = "Spa-Francorchamps",
        string car = "Porsche 963",
        double? trackLengthMeters = 5000) => new()
        {
            Session = new SessionInfo
            {
                Game = "Le Mans Ultimate",
                Track = track,
                Car = car,
                CarClass = "Hypercar",
                TrackLengthMeters = trackLengthMeters,
                SessionType = sessionType,
                InCar = true,
            },
            Lap = new LapState { CurrentLap = lap, LastLapTime = lastLapTime, IsValid = isValid },
        };
```

Give `LapFrame` driver inputs that ramp with track position, so a resampled trace has an independently known expectation at every grid point — the same property `DriveLap` already gives elapsed time:

```csharp
    private static TelemetryFrame LapFrame(
        int lap,
        double position,
        double lapTime,
        double lastLapTime = 0,
        double? trackLengthMeters = 5000)
    {
        var frame = Frame(SessionType.Practice, lap, lastLapTime, trackLengthMeters: trackLengthMeters);
        var ramp = Math.Clamp(position, 0, 1);
        return frame with
        {
            Car = frame.Car with
            {
                SpeedMetersPerSecond = (float)(40 + (30 * ramp)),
                Throttle = (float)(1 - ramp),
                Brake = (float)ramp,
                Steering = (float)((2 * ramp) - 1),
                Gear = 1 + (int)(ramp * 6),
            },
            Lap = frame.Lap with
            {
                TrackPosition = (float)position,
                CurrentLapTime = lapTime,
            },
        };
    }
```

> One existing test passes `position: double.NaN`. `Math.Clamp(double.NaN, 0, 1)` is `NaN`, and .NET's saturating float→int conversion turns `(int)NaN` into `0`, so `Gear` stays valid. The recorder rejects that frame on its non-finite `TrackPosition` guard before it is ever sampled, so nothing downstream sees the NaN channels.

Thread the track length through `DriveLap` and `Crossing`:

```csharp
    private static void DriveLap(
        LapHistoryRecorder recorder,
        int lap,
        double lapTimeSeconds,
        double fromPosition = 0.0,
        double toPosition = 1.0,
        double sampleStep = 0.003,
        double? trackLengthMeters = 5000)
    {
        for (var i = 0; ; i++)
        {
            var position = fromPosition + (i * sampleStep);
            if (position >= toPosition)
            {
                return;
            }

            recorder.Ingest(LapFrame(lap, position, position * lapTimeSeconds, trackLengthMeters: trackLengthMeters));
        }
    }

    private static TelemetryFrame Crossing(int lap, double lastLapTime, double? trackLengthMeters = 5000) =>
        LapFrame(lap, position: 0, lapTime: 0, lastLapTime, trackLengthMeters);
```

Let `NewRecorder` take a trace store:

```csharp
    private static LapHistoryRecorder NewRecorder(ILapHistoryStore store, ILapTraceStore? traces = null)
    {
        var counter = 0;
        return new LapHistoryRecorder(
            store,
            traces,
            clock: () => Now,
            idFactory: () => $"hs-{++counter}",
            dispatch: work => work());
    }
```

And add an in-memory trace store beside `CollectingLapHistoryStore`:

```csharp
    /// <summary>An in-memory <see cref="ILapTraceStore"/>, so recorder tests never touch a disk.</summary>
    private sealed class CollectingLapTraceStore : ILapTraceStore
    {
        public Dictionary<string, LapChannelTrace> All { get; } = new(StringComparer.Ordinal);

        public void Save(string traceId, LapChannelTrace trace) => All[traceId] = trace;

        public LapChannelTrace? Load(string traceId) =>
            All.TryGetValue(traceId, out var trace) ? trace : null;

        public void Delete(string traceId) => All.Remove(traceId);

        public IReadOnlyList<LapTraceInfo> List() =>
            [.. All.Select(pair => new LapTraceInfo(pair.Key, 0, Now))];
    }
```

- [ ] **Step 2: Write the failing tests**

Append to `app/Sprint.Desktop.Tests/LapHistoryTests.cs`, inside the class:

```csharp
    [Fact]
    public void TheRecorderFilesAChannelTraceForACompletedLap()
    {
        var store = new CollectingLapHistoryStore();
        var traces = new CollectingLapTraceStore();
        var recorder = NewRecorder(store, traces);

        DriveLap(recorder, lap: 1, lapTimeSeconds: 120.0);
        recorder.Ingest(Crossing(lap: 2, lastLapTime: 120.0));

        var lap = Assert.Single(Assert.Single(store.Sessions).Laps);
        Assert.True(lap.HasChannelTrace);
        // Derived from the session and lap, so a lap and its trace can always find each other.
        Assert.Equal(LapTraceId.For("hs-1", 1), lap.TraceId);

        var trace = traces.Load(lap.TraceId!);
        Assert.NotNull(trace);
        Assert.True(trace!.IsUsable);
        foreach (var name in LapTraceChannels.Default)
        {
            Assert.True(trace.TryGetChannel(name, out var values), $"missing channel {name}");
            Assert.Equal(trace.SampleCount, values.Length);
        }
    }

    [Fact]
    public void TheRecordedChannelsAreTheOnesTheDriverActuallyProduced()
    {
        var traces = new CollectingLapTraceStore();
        var recorder = NewRecorder(new CollectingLapHistoryStore(), traces);

        // LapFrame ramps every input with track position, so mid-lap has a known answer:
        // speed 40 + 30*0.5 m/s = 55 m/s = 198 km/h, throttle 0.5, brake 0.5.
        DriveLap(recorder, lap: 1, lapTimeSeconds: 120.0);
        recorder.Ingest(Crossing(lap: 2, lastLapTime: 120.0));

        var trace = Assert.Single(traces.All).Value;
        Assert.Equal(198.0, trace.ValueAt(LapTraceChannels.SpeedKph, 0.5)!.Value, 0);
        Assert.Equal(0.5, trace.ValueAt(LapTraceChannels.Throttle, 0.5)!.Value, 2);
        Assert.Equal(0.5, trace.ValueAt(LapTraceChannels.Brake, 0.5)!.Value, 2);
        Assert.Equal(60.0, trace.ValueAt(LapTraceChannels.ElapsedSeconds, 0.5)!.Value, 1);
    }

    [Fact]
    public void TheTraceGridIsSizedFromTheTracksLength()
    {
        var traces = new CollectingLapTraceStore();
        var recorder = NewRecorder(new CollectingLapHistoryStore(), traces);

        DriveLap(recorder, lap: 1, lapTimeSeconds: 200.0, trackLengthMeters: 13_626);
        recorder.Ingest(Crossing(lap: 2, lastLapTime: 200.0, trackLengthMeters: 13_626));

        var trace = Assert.Single(traces.All).Value;
        Assert.InRange(trace.PositionStep * 13_626, 1.5, 5.0);
        Assert.Equal(13_626, trace.TrackLengthMeters);
    }

    [Fact]
    public void APracticeLapWithNoPlanArmedStillGetsATrace()
    {
        // The trace tier inherits the always-on recorder's reach: nothing here consults a plan,
        // and practice with no plan is precisely the case Live Compare exists for.
        var traces = new CollectingLapTraceStore();
        var recorder = NewRecorder(new CollectingLapHistoryStore(), traces);

        DriveLap(recorder, lap: 1, lapTimeSeconds: 120.0);
        recorder.Ingest(Crossing(lap: 2, lastLapTime: 120.0));

        Assert.Single(traces.All);
    }

    [Fact]
    public void APartialLapProducesNeitherACurveNorATrace()
    {
        var store = new CollectingLapHistoryStore();
        var traces = new CollectingLapTraceStore();
        var recorder = NewRecorder(store, traces);

        // Joined at half distance: the same guard both tiers apply, so neither tier appears.
        DriveLap(recorder, lap: 1, lapTimeSeconds: 120.0, fromPosition: 0.5);
        recorder.Ingest(Crossing(lap: 2, lastLapTime: 120.0));

        var lap = Assert.Single(Assert.Single(store.Sessions).Laps);
        Assert.False(lap.HasReferenceCurve);
        Assert.False(lap.HasChannelTrace);
        Assert.Empty(traces.All);
    }

    [Fact]
    public void ARecorderWithNoTraceStoreRecordsLapsThatHonestlyReportNoTrace()
    {
        var store = new CollectingLapHistoryStore();
        var recorder = NewRecorder(store);

        DriveLap(recorder, lap: 1, lapTimeSeconds: 120.0);
        recorder.Ingest(Crossing(lap: 2, lastLapTime: 120.0));

        var lap = Assert.Single(Assert.Single(store.Sessions).Laps);
        Assert.True(lap.HasReferenceCurve);
        // Not merely "no file": the record must not claim a tier nobody stored.
        Assert.False(lap.HasChannelTrace);
        Assert.Null(lap.TraceId);
    }

    [Fact]
    public void TraceWritingHappensOnTheDispatchHandOffNotTheTelemetryThread()
    {
        // Nothing may reach the disk on the thread that delivered the frame: the engine polls
        // at 200 Hz and a locked disk would stall the read that feeds the wheel screen.
        var traces = new CollectingLapTraceStore();
        var queued = new List<Action>();
        var recorder = new LapHistoryRecorder(
            new CollectingLapHistoryStore(),
            traces,
            clock: () => Now,
            idFactory: () => "hs-1",
            dispatch: queued.Add);

        DriveLap(recorder, lap: 1, lapTimeSeconds: 120.0);
        recorder.Ingest(Crossing(lap: 2, lastLapTime: 120.0));

        Assert.Empty(traces.All);
        Assert.NotEmpty(queued);
        foreach (var work in queued)
        {
            work();
        }

        Assert.Single(traces.All);
    }
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `dotnet test app/Sprint.Desktop.Tests/Sprint.Desktop.Tests.csproj --filter LapHistoryTests`
Expected: build failure — the `ILapTraceStore` recorder parameter and `LapHistoryRecord.TraceId` do not exist.

- [ ] **Step 4: Add the pointer to the lap record**

In `LapHistoryModels.cs`, inside `LapHistoryRecord`, immediately after the `ReferenceCurve` property:

```csharp
    /// <summary>
    /// The id of this lap's channel trace in the trace store, when one was written and has not
    /// been pruned. Null otherwise.
    /// <para>
    /// A pointer rather than the trace itself: a history session is rewritten on every lap
    /// crossing, and a trace is two orders of magnitude larger than everything else in the
    /// document put together. Retention clears this when it deletes the file, so the stored
    /// tier never claims a trace that is no longer there.
    /// </para>
    /// </summary>
    [JsonPropertyName("traceId")]
    public string? TraceId { get; set; }

    /// <summary>
    /// Whether this lap can drive a channel-by-channel comparison — the third and richest
    /// tier, above <see cref="HasReferenceCurve"/>.
    /// </summary>
    [JsonIgnore]
    public bool HasChannelTrace => !string.IsNullOrEmpty(TraceId);
```

- [ ] **Step 5: Teach the recorder to sample channels and write the trace**

In `LapHistoryRecorder.cs`, make these edits.

Change the sample buffer field and add the trace store:

```csharp
    private readonly ILapHistoryStore _store;

    // Nullable rather than defaulted to an empty store. A no-op store would still let the
    // recorder set a TraceId for a trace it then threw away, and the lap would advertise a
    // tier nothing can deliver — the exact lie the tier note exists to prevent.
    private readonly ILapTraceStore? _traces;
```

```csharp
    // The in-progress lap's observed samples. One list append per frame; both the reference
    // curve (#181) and the channel trace (#194) are resampled from it once, at the crossing,
    // so nothing touches the disk mid-lap.
    private readonly List<LapTraceSample> _samples = [];
```

Replace the constructor:

```csharp
    public LapHistoryRecorder(
        ILapHistoryStore store,
        ILapTraceStore? traces = null,
        Func<DateTimeOffset>? clock = null,
        Func<string>? idFactory = null,
        Action<Action>? dispatch = null,
        ILog? log = null)
    {
        _store = store ?? throw new ArgumentNullException(nameof(store));
        // Optional: a caller with no trace store still records laps and reference curves, and
        // those laps report the thinner tier honestly rather than not being recorded at all.
        _traces = traces;
        _clock = clock ?? (() => DateTimeOffset.UtcNow);
```

In `Ingest`, replace the `completed is not null` block:

```csharp
        LapChannelTrace? trace = null;
        var completed = CompletedLap(frame);
        if (completed is not null)
        {
            // The finished lap is resampled before this frame is sampled: at the line the
            // position has already wrapped and the lap timer has reseeded, so this frame's
            // sample belongs to the lap that is starting, not the one that just ended.
            completed.ReferenceCurve = LapReferenceCurve.FromSamples(
                [.. _samples.Select(sample => (sample.Position, sample.ElapsedSeconds))],
                completed.LapTimeSeconds);

            if (_traces is not null)
            {
                trace = LapChannelTrace.FromSamples(
                    _samples,
                    completed.LapTimeSeconds,
                    _session.Context.TrackLengthMeters);
                if (trace is not null)
                {
                    completed.TraceId = LapTraceId.For(_session.Id, completed.LapNumber);
                }
            }
        }
```

Then, after `_session.Laps.Add(completed);`:

```csharp
        _session.Laps.Add(completed);
        if (trace is not null && completed.TraceId is { } traceId)
        {
            PersistTrace(traceId, trace);
        }

        Persist(_session);
```

Replace `Sample`'s append with the full sample, leaving the guards above it unchanged:

```csharp
        var position = Math.Clamp((double)frame.Lap.TrackPosition, 0, 1);
        if (_samples.Count == 0 || position > _samples[^1].Position + PositionEpsilon)
        {
            _samples.Add(new LapTraceSample(
                position,
                // Stored in km/h: it is the unit the driver reads and the unit the HUD draws.
                frame.Car.SpeedMetersPerSecond * 3.6f,
                frame.Car.Throttle,
                frame.Car.Brake,
                frame.Car.Steering,
                frame.Car.Gear,
                Math.Max(frame.Lap.CurrentLapTime, 0)));
        }
```

Add beside `Persist`:

```csharp
    private void PersistTrace(string traceId, LapChannelTrace trace) => _dispatch(() =>
    {
        try
        {
            _traces?.Save(traceId, trace);
        }
        catch (Exception ex)
        {
            // A lost trace costs the lap its richest tier, never the lap itself.
            _log.Warn($"Failed to persist lap trace '{traceId}'", ex);
        }
    });
```

- [ ] **Step 6: Fix the existing call site**

`MainWindow.cs:212` passes `log:` by name already, so the new optional parameter does not break it. Verify with a build; if any call site passed `clock`/`idFactory`/`dispatch` positionally, convert it to named arguments.

Run: `dotnet build app/Sprint.Desktop.slnx -warnaserror`
Expected: success.

- [ ] **Step 7: Run the tests to verify they pass**

Run: `dotnet test app/Sprint.Desktop.Tests/Sprint.Desktop.Tests.csproj --filter LapHistoryTests`
Expected: PASS, including the pre-existing recorder and curve tests.

- [ ] **Step 8: Commit**

```bash
git add app/Sprint.Desktop.Client/Features/SessionPlanning/LapHistoryModels.cs \
        app/Sprint.Desktop.Client/Features/SessionPlanning/LapHistoryRecorder.cs \
        app/Sprint.Desktop.Tests/LapHistoryTests.cs
git commit -m "feat(planner): record a channel trace for every valid lap (#194)"
```

---

### Task 4: Retention against a disk budget

**Files:**
- Create: `app/Sprint.Desktop.Client/Features/SessionPlanning/LapTraceRetention.cs`
- Test: `app/Sprint.Desktop.Tests/LapTraceRetentionTests.cs`

**Interfaces:**
- Consumes: `ILapTraceStore`, `LapTraceInfo`, `LapTraceId`, `ILapHistoryStore` from Tasks 2–3.
- Produces:
  - `readonly record struct LapTraceBudget(long MaxTotalBytes, int ProtectedPerContext, int? MaxAgeDays)`
  - `readonly record struct LapTracePruneResult(int Deleted, long BytesFreed)`
  - `sealed class LapTraceRetention` with `LapTraceRetention(ILapTraceStore traces, ILapHistoryStore history, ILog? log = null)` and `LapTracePruneResult Prune(LapTraceBudget budget, DateTimeOffset now)`

- [ ] **Step 1: Write the failing tests**

Create `app/Sprint.Desktop.Tests/LapTraceRetentionTests.cs`:

```csharp
using Sprint.Desktop.Features.SessionPlanning;
using Xunit;

namespace Sprint.Desktop.Tests;

/// <summary>
/// Acceptance-criteria tests for trace retention (#194). Traces are written for every valid
/// lap, so the corpus is bounded by a disk budget rather than by refusing to record. What the
/// budget must never delete is a reference lap.
/// </summary>
public sealed class LapTraceRetentionTests
{
    private static readonly DateTimeOffset Now = new(2026, 8, 2, 12, 0, 0, TimeSpan.Zero);

    [Fact]
    public void NothingIsPrunedWhileTheCorpusIsInsideItsBudget()
    {
        var (traces, history) = Corpus(lapCount: 5);

        var result = Retention(traces, history).Prune(Budget(maxTotalBytes: 10_000), Now);

        Assert.Equal(0, result.Deleted);
        Assert.Equal(5, traces.All.Count);
    }

    [Fact]
    public void TheOldestUnprotectedTracesGoFirstUntilTheBudgetIsMet()
    {
        // 5 traces of 100 bytes; budget 250 leaves room for 2, and best-N protects the fastest.
        var (traces, history) = Corpus(lapCount: 5);

        var result = Retention(traces, history)
            .Prune(Budget(maxTotalBytes: 250, protectedPerContext: 1), Now);

        // Through the interface: TotalBytes is a default interface member, so the fake's own
        // type does not expose it.
        Assert.True(((ILapTraceStore)traces).TotalBytes() <= 250);
        Assert.True(result.Deleted > 0);
        Assert.Equal(result.Deleted * 100, result.BytesFreed);
    }

    [Fact]
    public void TheBestLapsPerContextAreNeverPruned()
    {
        // Lap 1 is the fastest and also the oldest — oldest-first must not reach it.
        var (traces, history) = Corpus(lapCount: 5);

        Retention(traces, history).Prune(Budget(maxTotalBytes: 100, protectedPerContext: 1), Now);

        Assert.True(traces.All.ContainsKey(LapTraceId.For("hs-1", 1)));
    }

    [Fact]
    public void ProtectionIsPerContextSoASecondTrackKeepsItsOwnBest()
    {
        var traces = new FakeTraceStore();
        var history = new FakeHistoryStore();
        history.Saved.Add(Session("hs-spa", "Spa-Francorchamps", traces, lapCount: 3, fastestFirst: true));
        history.Saved.Add(Session("hs-lm", "Le Mans", traces, lapCount: 3, fastestFirst: true));

        Retention(traces, history).Prune(Budget(maxTotalBytes: 200, protectedPerContext: 1), Now);

        Assert.True(traces.All.ContainsKey(LapTraceId.For("hs-spa", 1)));
        Assert.True(traces.All.ContainsKey(LapTraceId.For("hs-lm", 1)));
    }

    [Fact]
    public void AnInvalidLapIsNeverWhatProtectionSpendsItselfOn()
    {
        var traces = new FakeTraceStore();
        var history = new FakeHistoryStore();
        var session = Session("hs-1", "Spa-Francorchamps", traces, lapCount: 3, fastestFirst: true);
        // The fastest lap of the three is invalid — a cut corner is not a reference lap.
        session.Laps[0].IsValid = false;
        history.Saved.Add(session);

        Retention(traces, history).Prune(Budget(maxTotalBytes: 100, protectedPerContext: 1), Now);

        Assert.False(traces.All.ContainsKey(LapTraceId.For("hs-1", 1)));
        Assert.True(traces.All.ContainsKey(LapTraceId.For("hs-1", 2)));
    }

    [Fact]
    public void PruningALapClearsItsPointerSoTheStoredTierNeverLies()
    {
        var (traces, history) = Corpus(lapCount: 5);

        Retention(traces, history).Prune(Budget(maxTotalBytes: 100, protectedPerContext: 1), Now);

        foreach (var lap in history.Saved.SelectMany(session => session.Laps))
        {
            Assert.Equal(lap.HasChannelTrace, lap.TraceId is not null && traces.All.ContainsKey(lap.TraceId));
        }
    }

    [Fact]
    public void APrunedLapDegradesToTheReferenceCurveTierRatherThanVanishing()
    {
        var (traces, history) = Corpus(lapCount: 5);

        Retention(traces, history).Prune(Budget(maxTotalBytes: 100, protectedPerContext: 1), Now);

        var pruned = history.Saved.SelectMany(session => session.Laps).Where(lap => !lap.HasChannelTrace);
        Assert.NotEmpty(pruned);
        Assert.All(pruned, lap => Assert.True(lap.HasReferenceCurve));
    }

    [Fact]
    public void OrphanTracesAreDeletedBeforeAnyLapLosesItsOwn()
    {
        var (traces, history) = Corpus(lapCount: 2);
        traces.All["hs-gone-9"] = 100;

        Retention(traces, history).Prune(Budget(maxTotalBytes: 200, protectedPerContext: 1), Now);

        Assert.False(traces.All.ContainsKey("hs-gone-9"));
        Assert.Equal(2, traces.All.Count);
    }

    [Fact]
    public void TracesPastTheAgeLimitGoEvenWhenTheBudgetHasRoom()
    {
        var (traces, history) = Corpus(lapCount: 5, sessionStartedAt: Now.AddDays(-200));

        Retention(traces, history)
            .Prune(Budget(maxTotalBytes: long.MaxValue, protectedPerContext: 1, maxAgeDays: 90), Now);

        // Protection outranks age: the reference lap survives even at 200 days old.
        Assert.Single(traces.All);
        Assert.True(traces.All.ContainsKey(LapTraceId.For("hs-1", 1)));
    }

    [Fact]
    public void AnEmptyCorpusPrunesToNothingWithoutFailing()
    {
        var result = Retention(new FakeTraceStore(), new FakeHistoryStore()).Prune(Budget(), Now);

        Assert.Equal(0, result.Deleted);
        Assert.Equal(0, result.BytesFreed);
    }

    private static LapTraceRetention Retention(ILapTraceStore traces, ILapHistoryStore history) =>
        new(traces, history);

    private static LapTraceBudget Budget(
        long maxTotalBytes = long.MaxValue,
        int protectedPerContext = 3,
        int? maxAgeDays = null) => new(maxTotalBytes, protectedPerContext, maxAgeDays);

    private static (FakeTraceStore Traces, FakeHistoryStore History) Corpus(
        int lapCount,
        DateTimeOffset? sessionStartedAt = null)
    {
        var traces = new FakeTraceStore();
        var history = new FakeHistoryStore();
        history.Saved.Add(Session(
            "hs-1", "Spa-Francorchamps", traces, lapCount, fastestFirst: true, sessionStartedAt));
        return (traces, history);
    }

    /// <summary>
    /// One session of <paramref name="lapCount"/> laps, each with a 100-byte trace and a
    /// reference curve. With <paramref name="fastestFirst"/>, lap 1 is the fastest and lap N
    /// the slowest, so "oldest" and "best" point at the same lap and protection has to win.
    /// </summary>
    private static LapHistorySession Session(
        string id,
        string track,
        FakeTraceStore traces,
        int lapCount,
        bool fastestFirst,
        DateTimeOffset? startedAt = null)
    {
        var session = new LapHistorySession
        {
            Id = id,
            StartedAt = startedAt ?? Now.AddHours(-1),
            Context = new LapHistoryContext
            {
                Game = "Le Mans Ultimate",
                TrackCourse = track,
                CarModel = "Porsche 963",
            },
        };

        for (var lap = 1; lap <= lapCount; lap++)
        {
            var traceId = LapTraceId.For(id, lap);
            traces.All[traceId] = 100;
            session.Laps.Add(new LapHistoryRecord
            {
                LapNumber = lap,
                IsValid = true,
                LapTimeSeconds = fastestFirst ? 100 + lap : 100 - lap,
                TraceId = traceId,
                ReferenceCurve = new LapReferenceCurve { PositionStep = 0.5, TimesSeconds = [0, 50, 100] },
            });
        }

        return session;
    }

    private sealed class FakeTraceStore : ILapTraceStore
    {
        public Dictionary<string, long> All { get; } = new(StringComparer.Ordinal);

        public void Save(string traceId, LapChannelTrace trace) => All[traceId] = 100;

        public LapChannelTrace? Load(string traceId) => null;

        public void Delete(string traceId) => All.Remove(traceId);

        public IReadOnlyList<LapTraceInfo> List() =>
            [.. All.Select(pair => new LapTraceInfo(pair.Key, pair.Value, Now.AddHours(-1)))];
    }

    private sealed class FakeHistoryStore : ILapHistoryStore
    {
        public List<LapHistorySession> Saved { get; } = [];

        public IReadOnlyList<LapHistorySession> LoadAll() => Saved;

        public void Save(LapHistorySession session)
        {
            Saved.RemoveAll(existing => existing.Id == session.Id);
            Saved.Add(session);
        }

        public void Delete(string sessionId) => Saved.RemoveAll(session => session.Id == sessionId);
    }
}
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `dotnet test app/Sprint.Desktop.Tests/Sprint.Desktop.Tests.csproj --filter LapTraceRetentionTests`
Expected: build failure — `LapTraceRetention`, `LapTraceBudget`, `LapTracePruneResult` do not exist.

- [ ] **Step 3: Write the retention service**

Create `app/Sprint.Desktop.Client/Features/SessionPlanning/LapTraceRetention.cs`:

```csharp
using Sprint.Desktop.Features.Diagnostics;

namespace Sprint.Desktop.Features.SessionPlanning;

/// <summary>How much disk the trace tier may occupy, and what it must never delete.</summary>
/// <param name="MaxTotalBytes">Hard ceiling on the trace directory.</param>
/// <param name="ProtectedPerContext">
/// How many of the fastest valid laps per (game, track, car) are exempt. This is what makes
/// "write a trace for every lap" safe: the laps a driver would actually chase are the ones a
/// naive oldest-first policy would delete first, because a reference lap gets old.
/// </param>
/// <param name="MaxAgeDays">Age ceiling, or null for none. Protection outranks it.</param>
public readonly record struct LapTraceBudget(
    long MaxTotalBytes,
    int ProtectedPerContext,
    int? MaxAgeDays);

/// <summary>What a prune actually did, for the log and for the settings screen.</summary>
public readonly record struct LapTracePruneResult(int Deleted, long BytesFreed);

/// <summary>
/// Bounds the trace tier's disk use (#194). Traces are written for every valid lap because
/// skipping one is unrecoverable, so the corpus is bounded here instead — by deleting the
/// laps least likely to be wanted, never by refusing to record.
/// <para>
/// Deleting a trace also clears the owning lap's pointer. A record that still claimed a
/// trace the store no longer has would make the driver's target list offer a tier it cannot
/// deliver, which is exactly the lie the tier note exists to prevent.
/// </para>
/// </summary>
public sealed class LapTraceRetention
{
    private readonly ILapTraceStore _traces;
    private readonly ILapHistoryStore _history;
    private readonly ILog _log;

    public LapTraceRetention(ILapTraceStore traces, ILapHistoryStore history, ILog? log = null)
    {
        _traces = traces ?? throw new ArgumentNullException(nameof(traces));
        _history = history ?? throw new ArgumentNullException(nameof(history));
        _log = log ?? NullLog.Instance;
    }

    public LapTracePruneResult Prune(LapTraceBudget budget, DateTimeOffset now)
    {
        var stored = _traces.List();
        if (stored.Count == 0)
        {
            return new LapTracePruneResult(0, 0);
        }

        var sessions = _history.LoadAll();
        var owners = new Dictionary<string, (LapHistorySession Session, LapHistoryRecord Lap)>(StringComparer.Ordinal);
        foreach (var session in sessions)
        {
            foreach (var lap in session.Laps.Where(lap => lap.TraceId is { Length: > 0 }))
            {
                owners[lap.TraceId!] = (session, lap);
            }
        }

        var protectedIds = ProtectedIds(sessions, budget.ProtectedPerContext);
        var cutoff = budget.MaxAgeDays is { } days ? now.AddDays(-days) : (DateTimeOffset?)null;

        // Orphans first: a trace with no owning lap is unreachable by every reader, so it is
        // pure cost. Then oldest-first by the session that produced it — file timestamps move
        // when a corpus is copied between machines, but a session's start does not.
        var candidates = stored
            .Where(info => !protectedIds.Contains(info.TraceId))
            .OrderBy(info => owners.ContainsKey(info.TraceId))
            .ThenBy(info => owners.TryGetValue(info.TraceId, out var owner)
                ? owner.Session.StartedAt
                : info.WrittenAt)
            .ThenBy(info => owners.TryGetValue(info.TraceId, out var owner) ? owner.Lap.LapNumber : 0)
            .ToList();

        var total = stored.Sum(info => info.SizeBytes);
        var deleted = 0;
        var freed = 0L;
        var touched = new Dictionary<string, LapHistorySession>(StringComparer.Ordinal);

        foreach (var info in candidates)
        {
            var overBudget = total > budget.MaxTotalBytes;
            var tooOld = cutoff is { } limit
                && (owners.TryGetValue(info.TraceId, out var aged)
                    ? aged.Session.StartedAt < limit
                    : info.WrittenAt < limit);
            var orphaned = !owners.ContainsKey(info.TraceId);

            if (!overBudget && !tooOld && !orphaned)
            {
                continue;
            }

            _traces.Delete(info.TraceId);
            total -= info.SizeBytes;
            freed += info.SizeBytes;
            deleted++;

            if (owners.TryGetValue(info.TraceId, out var owner))
            {
                owner.Lap.TraceId = null;
                touched[owner.Session.Id] = owner.Session;
            }
        }

        foreach (var session in touched.Values)
        {
            try
            {
                _history.Save(session);
            }
            catch (Exception ex)
            {
                // A pointer left behind reads as a trace that is missing, which every reader
                // already has to survive. Failing the whole prune would be worse.
                _log.Warn($"Failed to clear pruned trace pointers on session '{session.Id}'", ex);
            }
        }

        if (deleted > 0)
        {
            _log.Info($"Pruned {deleted} lap trace(s), freeing {freed / 1024} KB");
        }

        return new LapTracePruneResult(deleted, freed);
    }

    /// <summary>
    /// The fastest <paramref name="perContext"/> valid laps in each (game, track, car) bucket.
    /// Invalid laps are excluded before ranking: a lap set by cutting the chicane is the last
    /// thing that should occupy a protection slot.
    /// </summary>
    private static HashSet<string> ProtectedIds(
        IReadOnlyList<LapHistorySession> sessions,
        int perContext)
    {
        var ids = new HashSet<string>(StringComparer.Ordinal);
        if (perContext <= 0)
        {
            return ids;
        }

        var byContext = sessions
            .SelectMany(session => session.Laps.Select(lap => (session.Context, Lap: lap)))
            .Where(entry => entry.Lap.IsValid
                && entry.Lap.LapTimeSeconds > 0
                && entry.Lap.TraceId is { Length: > 0 })
            .GroupBy(entry => (
                entry.Context.Game,
                entry.Context.TrackCourse,
                entry.Context.CarModel));

        foreach (var bucket in byContext)
        {
            foreach (var entry in bucket.OrderBy(entry => entry.Lap.LapTimeSeconds).Take(perContext))
            {
                ids.Add(entry.Lap.TraceId!);
            }
        }

        return ids;
    }
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `dotnet test app/Sprint.Desktop.Tests/Sprint.Desktop.Tests.csproj --filter LapTraceRetentionTests`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add app/Sprint.Desktop.Client/Features/SessionPlanning/LapTraceRetention.cs \
        app/Sprint.Desktop.Tests/LapTraceRetentionTests.cs
git commit -m "feat(planner): bound the trace tier with a disk budget that protects reference laps (#194)"
```

---

### Task 5: The target tier becomes three-valued

**Files:**
- Modify: `app/Sprint.Desktop.Client/Features/SessionPlanning/PlanTargetResolver.cs`
- Modify: `app/Sprint.Desktop.Client/Features/SessionPlanning/PlanTargetModels.cs`
- Test: `app/Sprint.Desktop.Tests/PlanTargetTests.cs` (append)

**Interfaces:**
- Consumes: `LapHistoryRecord.HasChannelTrace` from Task 3.
- Produces:
  - `enum LapTargetTier { TimeOnly, ReferenceCurve, FullTrace }` in `LapHistoryModels.cs`
  - `PlanTargetOption` gains a `bool HasChannelTrace` positional parameter, **after** `HasReferenceCurve`
  - `LapTargetTier PlanTargetOption.Tier`, and `TierNote` reads off it
  - `bool PlanTarget.HasChannelTrace` (JSON `hasChannelTrace`)

- [ ] **Step 1: Write the failing tests**

Append to `app/Sprint.Desktop.Tests/PlanTargetTests.cs`, inside the class:

```csharp
    [Fact]
    public void TheTierNoteNamesAllThreeTiers()
    {
        Assert.Equal("time only", Option(curve: false, trace: false).TierNote);
        Assert.Equal("reference curve", Option(curve: true, trace: false).TierNote);
        Assert.Equal("full trace", Option(curve: true, trace: true).TierNote);
    }

    [Fact]
    public void ATraceWithoutACurveIsStillOnlyTheCurveTier()
    {
        // The two tiers share their completeness guards, so this should not happen — but if a
        // pruned or half-written corpus produces it, the note must not promise what a target
        // consumer cannot use. Plan target delivery reads the curve, not the trace.
        Assert.Equal("time only", Option(curve: false, trace: true).TierNote);
    }

    [Fact]
    public void TheTierIsCarriedOntoTheStoredTarget()
    {
        var stored = Option(curve: true, trace: true).ToTarget(DateTimeOffset.UnixEpoch);

        Assert.True(stored.HasReferenceCurve);
        Assert.True(stored.HasChannelTrace);
    }

    private static PlanTargetOption Option(bool curve, bool trace) => new(
        PlanTargetScope.AllLaps,
        null,
        PlanTargetStatistic.Best,
        "Best",
        "1:30.500",
        "",
        90.5,
        1,
        "hs-1",
        3,
        curve,
        trace,
        null);
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `dotnet test app/Sprint.Desktop.Tests/Sprint.Desktop.Tests.csproj --filter PlanTargetTests`
Expected: build failure — `PlanTargetOption` has no `HasChannelTrace` parameter.

- [ ] **Step 3: Add the tier enum**

In `LapHistoryModels.cs`, after `LapHistoryOrigin`:

```csharp
/// <summary>
/// How much a stored lap can honestly tell a consumer. Ordered from thinnest to richest, so a
/// caller can compare tiers rather than enumerate them.
/// </summary>
public enum LapTargetTier
{
    /// <summary>A lap time and nothing else. An imported lap, or a recorded one too partial to resample.</summary>
    TimeOnly,

    /// <summary>Position→time, so a position-accurate delta is possible.</summary>
    ReferenceCurve,

    /// <summary>Named channels on a metre-sized grid, so a channel-by-channel comparison is possible.</summary>
    FullTrace,
}
```

- [ ] **Step 4: Widen the option and the stored target**

In `PlanTargetResolver.cs`, add `bool HasChannelTrace` to the `PlanTargetOption` record immediately after `bool HasReferenceCurve`, and replace `TierNote`:

```csharp
    /// <summary>
    /// Which tier this option delivers. A lap with channels can drive a channel-by-channel
    /// comparison; one with only a curve can drive a position-accurate delta; anything else is
    /// a single number, and presenting a pro-rata delta from one as if it were measured would
    /// be a lie on a driver's screen.
    /// <para>
    /// Read off the lap's own artifacts rather than its session's origin: a recorded lap whose
    /// samples failed the completeness guards has neither, and a lap whose trace was pruned to
    /// stay inside the disk budget has dropped a tier since it was driven.
    /// </para>
    /// <para>
    /// A trace without a curve is reported as the thinnest tier, not the richest. The two share
    /// their completeness guards so it should not arise, but every current consumer of a target
    /// reads the curve, and a note promising more than the consumer can use is the lie this
    /// property exists to prevent.
    /// </para>
    /// </summary>
    public LapTargetTier Tier => (HasReferenceCurve, HasChannelTrace) switch
    {
        (true, true) => LapTargetTier.FullTrace,
        (true, false) => LapTargetTier.ReferenceCurve,
        _ => LapTargetTier.TimeOnly,
    };

    /// <summary>The tier in the driver's words.</summary>
    public string TierNote => Tier switch
    {
        LapTargetTier.FullTrace => "full trace",
        LapTargetTier.ReferenceCurve => "reference curve",
        _ => "time only",
    };
```

And add to the `ToTarget` initialiser, after `HasReferenceCurve = HasReferenceCurve,`:

```csharp
        HasChannelTrace = HasChannelTrace,
```

In `PlanTargetModels.cs`, beside `PlanTarget.HasReferenceCurve`:

```csharp
    /// <summary>
    /// Whether the lap this target points at had a channel trace when it was chosen. Stored so
    /// the planner can say what tier the driver picked; a reader that needs the trace itself
    /// must still ask the trace store, because retention can prune one after the fact.
    /// </summary>
    [JsonPropertyName("hasChannelTrace")]
    public bool HasChannelTrace { get; set; }
```

- [ ] **Step 5: Fix every construction site**

Run: `dotnet build app/Sprint.Desktop.slnx -warnaserror`

Every `new PlanTargetOption(...)` now needs the extra argument. In `PlanTargetResolver`, the value is the lap's `HasChannelTrace`; pass it from the same lap the `HasReferenceCurve` argument already comes from. In tests and fakes that construct an option directly, pass `false` unless the test is about the trace tier.

Expected after fixing: success.

- [ ] **Step 6: Run the tests to verify they pass**

Run: `dotnet test app/Sprint.Desktop.Tests/Sprint.Desktop.Tests.csproj --filter "PlanTargetTests|PlanTargetDeliveryTests|LapHistoryStatisticsTests"`
Expected: PASS. Delivery is included because it rejects curve-less laps and must keep doing exactly that — the third tier adds a value, it does not change what delivery accepts.

- [ ] **Step 7: Commit**

```bash
git add app/Sprint.Desktop.Client/Features/SessionPlanning/PlanTargetResolver.cs \
        app/Sprint.Desktop.Client/Features/SessionPlanning/PlanTargetModels.cs \
        app/Sprint.Desktop.Client/Features/SessionPlanning/LapHistoryModels.cs \
        app/Sprint.Desktop.Tests/PlanTargetTests.cs
git commit -m "feat(planner): three-valued target tier now that a lap can carry channels (#194)"
```

---

### Task 6: Wire it up, and delete the rejected 60 Hz seam

**Files:**
- Modify: `app/Sprint.Desktop.Client/Runtime/AppSettings.cs:93-130`
- Modify: `app/Sprint.Desktop.Client/MainWindow.cs:210-212`, `:1090`, `:4795-4840`
- Modify: `app/Sprint.Desktop.Client/Features/SessionPlanning/SessionPlanModels.cs:212-270`
- Test: `app/Sprint.Desktop.Tests/AppSettingsChannelTests.cs` (append)

**Interfaces:**
- Consumes: everything from Tasks 1–5.
- Produces: `int SessionPlannerSettings.TraceProtectedLapsPerContext`, `LapTraceBudget SessionPlannerSettings.TraceBudget()`

- [ ] **Step 1: Write the failing test**

Append to `app/Sprint.Desktop.Tests/AppSettingsChannelTests.cs`, inside the class:

```csharp
    [Fact]
    public void ThePlannerSettingsDescribeATraceDiskBudgetRatherThanACaptureRate()
    {
        // #101's 60 Hz time grid was rejected: the corpus is position-gridded, and two laps
        // sampled by time never share an x-axis. What is configurable is how much disk the
        // trace tier may use, not how fast it samples.
        var budget = new SessionPlannerSettings().TraceBudget();

        Assert.True(budget.MaxTotalBytes > 0);
        Assert.True(budget.ProtectedPerContext > 0);
        Assert.Equal(90, budget.MaxAgeDays);
    }

    [Fact]
    public void TheTraceBudgetIsExpressedInBytesFromTheStoredMegabytes()
    {
        var settings = new SessionPlannerSettings { TraceMaxTotalMegabytes = 2 };

        Assert.Equal(2L * 1024 * 1024, settings.TraceBudget().MaxTotalBytes);
    }
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `dotnet test app/Sprint.Desktop.Tests/Sprint.Desktop.Tests.csproj --filter AppSettingsChannelTests`
Expected: build failure — `TraceBudget` does not exist.

- [ ] **Step 3: Replace the capture-rate settings with the budget**

In `AppSettings.cs`, inside `SessionPlannerSettings`, **delete**:

```csharp
    /// <summary>60 Hz is the default trace rate; higher rates are offered for sources and disks that keep up.</summary>
    public const int DefaultTraceCaptureHz = 60;

    /// <summary>The offered capture rates, ascending.</summary>
    public static readonly int[] TraceCaptureRates = [30, 60, 120, 240];
```

and

```csharp
    /// <summary>Detailed trace capture rate. Consumed by trace capture (#101), which is not built yet.</summary>
    [JsonPropertyName("traceCaptureHz")]
    public int TraceCaptureHz { get; set; } = DefaultTraceCaptureHz;
```

Then replace the two surviving trace settings with:

```csharp
    /// <summary>The offered trace storage ceilings in megabytes, ascending.</summary>
    public static readonly int[] TraceStorageBudgets = [1024, 2048, 4096, 8192, 16384];

    /// <summary>How long traces are kept. Bounds local disk use rather than growing forever.</summary>
    [JsonPropertyName("traceRetentionDays")]
    public int TraceRetentionDays { get; set; } = 90;

    /// <summary>A hard ceiling on trace storage, so a long stint cannot fill the disk.</summary>
    [JsonPropertyName("traceMaxTotalMegabytes")]
    public int TraceMaxTotalMegabytes { get; set; } = 4096;

    /// <summary>
    /// How many of the fastest valid laps per (game, track, car) are exempt from pruning. This
    /// is what makes recording a trace for every lap safe: a reference lap gets old, so an
    /// unqualified oldest-first policy would delete exactly the laps worth chasing.
    /// </summary>
    [JsonPropertyName("traceProtectedLapsPerContext")]
    public int TraceProtectedLapsPerContext { get; set; } = 5;

    /// <summary>These settings as the retention service's budget.</summary>
    public LapTraceBudget TraceBudget() => new(
        Math.Max(1, TraceMaxTotalMegabytes) * 1024L * 1024L,
        Math.Max(0, TraceProtectedLapsPerContext),
        TraceRetentionDays > 0 ? TraceRetentionDays : null);
```

Add `using Sprint.Desktop.Features.SessionPlanning;` to the file's usings if it is not already there.

- [ ] **Step 4: Delete the rejected capture manifest**

In `SessionPlanModels.cs`, delete the whole `CaptureManifest` class (lines ~247-270) and the property that references it:

```csharp
    [JsonPropertyName("capture")]
    public CaptureManifest? Capture { get; set; }
```

Nothing writes either one — the manifest was the seam for #101's time-gridded capture, which this issue replaces. Leaving a `captureRateHz` field on disk would invite someone to build the design the spec rejected.

`PlanSegment` has **no** `[JsonExtensionData]` today (the one at `SessionPlanModels.cs:166` belongs to the plan class above it), so add one while removing `Capture`, matching the convention the rest of this model already follows:

```csharp
    [JsonExtensionData]
    public Dictionary<string, JsonElement>? ExtensionData { get; set; }
```

Without it, a stored plan carrying an old `capture` object would have that field dropped on the next write rather than carried through.

- [ ] **Step 5: Replace the settings control**

In `MainWindow.cs`, in `PlannerSettingsForm`, replace:

```csharp
        var captureRate = SettingsCombo(
            SessionPlannerSettings.TraceCaptureRates.Select(rate => $"{rate} Hz").ToArray(),
            $"{planner.TraceCaptureHz} Hz");
```

with:

```csharp
        // Not a capture rate: the grid is fixed at ~2 m of track and the driver's choice is how
        // much disk the trace tier may occupy before it starts pruning.
        var storageBudget = SettingsCombo(
            SessionPlannerSettings.TraceStorageBudgets.Select(Megabytes).ToArray(),
            Megabytes(planner.TraceMaxTotalMegabytes));
```

Add beside the other local helpers in the same file:

```csharp
    private static string Megabytes(int megabytes) =>
        megabytes >= 1024 ? $"{megabytes / 1024} GB" : $"{megabytes} MB";
```

Then replace the `captureRate.SelectionChanged` handler (`MainWindow.cs:4863`):

```csharp
        captureRate.SelectionChanged += (_, _) =>
        {
            if (captureRate.SelectedItem is string label
                && int.TryParse(label.Replace(" Hz", "", StringComparison.Ordinal), out var hz))
            {
                planner.TraceCaptureHz = hz;
                markSaved();
            }
        };
```

with an index-based one — the labels are now "1 GB"/"512 MB" style, so parsing them back would mean undoing the formatting:

```csharp
        storageBudget.SelectionChanged += (_, _) =>
        {
            var index = storageBudget.SelectedIndex;
            if (index >= 0 && index < SessionPlannerSettings.TraceStorageBudgets.Length)
            {
                planner.TraceMaxTotalMegabytes = SessionPlannerSettings.TraceStorageBudgets[index];
                markSaved();
            }
        };
```

Finally, in the form rows below, change:

```csharp
        form.Children.Add(FormRow("Trace capture", captureRate));
```

to:

```csharp
        form.Children.Add(FormRow("Trace storage", storageBudget));
```

Leave the `"Keep traces for"` row as it is — retention days is now a real second bound rather than a promise nothing kept.

- [ ] **Step 6: Wire the store and retention**

In `MainWindow.cs` at ~line 210, replace the store construction:

```csharp
        var lapHistoryStore = new CachingLapHistoryStore(
            new LocalLapHistoryStore(System.IO.Path.Combine(_runtime.DataRoot, "lap-history"), _log));
        var lapTraceStore = new LocalLapTraceStore(
            System.IO.Path.Combine(_runtime.DataRoot, "lap-traces"), _log);
        _lapTraceRetention = new LapTraceRetention(lapTraceStore, lapHistoryStore, _log);
        _lapHistory = lapHistory ?? new LapHistoryRecorder(lapHistoryStore, lapTraceStore, log: _log);

        // Bring the trace directory inside its budget once, off the UI thread. Doing it at
        // startup rather than per lap keeps the crossing path free of a directory scan.
        ThreadPool.QueueUserWorkItem(_ => PruneLapTraces());
```

Add the field beside `_lapHistory`. Only retention is held: the store itself is reached through the recorder, and a second field nothing reads would be dead until #196 hosts the Analysis view.

```csharp
    private readonly LapTraceRetention _lapTraceRetention;
```

Add the method:

```csharp
    /// <summary>
    /// Brings the trace directory back inside its disk budget. Never on the telemetry path:
    /// it scans a directory and can rewrite history documents.
    /// </summary>
    private void PruneLapTraces()
    {
        try
        {
            _lapTraceRetention.Prune(_runtime.Settings.SessionPlanner.TraceBudget(), DateTimeOffset.UtcNow);
        }
        catch (Exception ex)
        {
            _log.Warn("Lap trace retention failed", ex);
        }
    }
```

**Startup only — do not also prune at `_lapHistory.Close()`.** That call site is `OnClosed`, so a background prune there races the process exit, and a synchronous one delays shutdown by a directory scan plus session rewrites. The overshoot it would prevent is not real: a 24-hour endurance run is roughly 700 laps at ~160 KB, about 112 MB against a 4 GB ceiling. One prune per start is enough.

- [ ] **Step 7: Build and run the full desktop suite**

Run: `dotnet build app/Sprint.Desktop.slnx -warnaserror`
Expected: success.

Run: `dotnet test app/Sprint.Desktop.Tests/Sprint.Desktop.Tests.csproj`
Expected: PASS, all tests.

- [ ] **Step 8: Visual smoke and UI review**

The planner settings form changed, so per AGENTS.md:

Run: `dotnet test app/Sprint.Desktop.Tests/Sprint.Desktop.Tests.csproj --filter VisualSmokeTests`
Run: `dotnet test app/Sprint.Desktop.Tests/Sprint.Desktop.Tests.csproj --filter AgentUiReview`

Inspect the PNGs under `app/Sprint.Desktop.Tests/artifacts/ui-review/latest/`. Confirm the Session Planner settings section reads "Trace storage — 4 GB" with no leftover "Hz" control, and that the row alignment still matches its neighbours. **Do not claim this task complete until those images have been looked at.**

- [ ] **Step 9: Commit**

```bash
git add app/Sprint.Desktop.Client/Runtime/AppSettings.cs \
        app/Sprint.Desktop.Client/MainWindow.cs \
        app/Sprint.Desktop.Client/Features/SessionPlanning/SessionPlanModels.cs \
        app/Sprint.Desktop.Tests/AppSettingsChannelTests.cs
git commit -m "feat(planner): wire the trace store and disk budget, drop the 60 Hz capture seam (#194)"
```

---

## Follow-ups this plan deliberately does not do

- **Settle the exact position step against a real trace** (spec §5). 2 m is implemented as `LapChannelTrace.TargetSampleMeters`; it is one constant and one test band to change. This is the item flagged on #193 for the manual driver testing outstanding on #8.
- **Surface the tier in the UI.** `TierNote` now says "full trace"; whether the target picker shows it differently is #195/#196's problem.
- **Say something when pruning drops a lap a tier** (spec §5, open). The result struct carries the count; nothing shows it yet.
- **Mirror to `packages/types`.** Not needed until the cloud work (#197).
- **Close #101.** Worth doing once this lands; it is currently marked superseded and left open.

using Sprint.Desktop.Features.SessionPlanning;
using Xunit;

namespace Sprint.Desktop.Tests;

/// <summary>
/// Acceptance-criteria tests for trace persistence (#194). Traces live outside the session
/// JSON on purpose: the history store rewrites a whole session on every lap crossing, so a
/// trace stored inside one would make each crossing cost every trace the session had already
/// produced.
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
                Assert.True(loaded.TryGetChannel(name, out var round), $"missing channel {name}");
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
            // The point of naming channels rather than fixing fields: a trace written by a
            // later build must still read back whole on this one.
            var trace = Sample();
            trace.Channels["tyreTempFl"] = [80f, 81f, 82f, 83f, 84f];

            store.Save("hs-1-5", trace);
            var loaded = store.Load("hs-1-5");

            Assert.True(loaded!.TryGetChannel("tyreTempFl", out var values));
            Assert.Equal([80f, 81f, 82f, 83f, 84f], values);
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
            // ~160 KB uncompressed was the budget the spec sized storage on; Deflate only helps.
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
    public void AFileThatIsNotATraceAtAllIsRejectedRatherThanMisread()
    {
        WithStore((store, root) =>
        {
            // Valid Deflate, wrong payload: the magic is what stops this being read as floats.
            using (var file = File.Create(Path.Combine(root, "wrong.trace")))
            using (var deflate = new System.IO.Compression.DeflateStream(
                file, System.IO.Compression.CompressionLevel.Fastest))
            {
                deflate.Write("JUNKJUNKJUNKJUNKJUNKJUNKJUNKJUNK"u8);
            }

            Assert.Null(store.Load("wrong"));
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

            // A second delete is a no-op, not a failure.
            store.Delete("a");
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

            var written = Directory.EnumerateFiles(root, "*", SearchOption.AllDirectories).ToList();
            Assert.NotEmpty(written);
            Assert.All(
                written,
                path => Assert.StartsWith(
                    Path.GetFullPath(root),
                    Path.GetFullPath(path),
                    StringComparison.Ordinal));
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
                position,
                (float)(100 + (200 * position)),
                (float)(1 - position),
                (float)position,
                0f,
                4,
                200.0 * position));
        }

        return samples;
    }

    private static void WithStore(Action<LocalLapTraceStore, string> body)
    {
        var root = TestEnv.NewTempDataRoot();
        try
        {
            body(new LocalLapTraceStore(root), root);
        }
        finally
        {
            Directory.Delete(root, recursive: true);
        }
    }
}

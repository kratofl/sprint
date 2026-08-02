using Sprint.Desktop.Features.SessionPlanning;
using Sprint.Desktop.Features.Sharing;
using Xunit;

namespace Sprint.Desktop.Tests;

/// <summary>
/// Lap files and the one path a lap from somebody else takes into the corpus (#198, shared with
/// #197). Trading files is how sim communities already work, so this is not a stopgap for the
/// cloud — both ship, through the same format and the same importer.
/// </summary>
public sealed class SharedLapTests
{
    private static readonly DateTimeOffset Now = new(2026, 8, 2, 12, 0, 0, TimeSpan.Zero);
    private const double TrackLength = 5000;

    [Fact]
    public void ALapRoundTripsThroughAFileWithItsProvenance()
    {
        var lap = Lap();

        var result = SharedLapFile.Read(Written(lap));

        Assert.True(result.Ok);
        var read = result.Lap!;
        Assert.Equal("Ada", read.Provenance.SharedBy);
        Assert.Equal(SharedLapSources.File, read.Provenance.SourceKind);
        Assert.Equal("Spa-Francorchamps", read.Context.TrackCourse);
        Assert.Equal(4, read.LapNumber);
        Assert.Equal(101.5, read.LapTimeSeconds, 3);
        Assert.Equal(lap.Trace.SampleCount, read.Trace.SampleCount);
    }

    [Fact]
    public void AChannelThisBuildDoesNotKnowSurvivesTheRoundTrip()
    {
        // The point of naming channels: a file written by a later Sprint must still read whole.
        var lap = Lap();
        lap.Trace.Channels["tyreTempFl"] = Enumerable.Repeat(82f, lap.Trace.SampleCount).ToArray();

        var read = SharedLapFile.Read(Written(lap)).Lap!;

        Assert.True(read.Trace.TryGetChannel("tyreTempFl", out var values));
        Assert.Equal(82f, values[0]);
    }

    [Fact]
    public void AFileThatIsNotALapFileIsNamedAsSuch()
    {
        using var stream = new MemoryStream("hello"u8.ToArray());

        var result = SharedLapFile.Read(stream);

        Assert.False(result.Ok);
        Assert.Equal(SharedLapReadError.Damaged, result.Error);
        Assert.NotEmpty(result.Message);
    }

    [Fact]
    public void AWellFormedFileWithTheWrongMagicIsRejectedAsNotALapFile()
    {
        using var stream = new MemoryStream();
        using (var deflate = new System.IO.Compression.DeflateStream(
            stream, System.IO.Compression.CompressionLevel.Fastest, leaveOpen: true))
        {
            deflate.Write("NOPE!nonsense payload here"u8);
        }

        stream.Position = 0;
        Assert.Equal(SharedLapReadError.NotALapFile, SharedLapFile.Read(stream).Error);
    }

    [Fact]
    public void ATruncatedFileIsReportedAsDamagedRatherThanThrowing()
    {
        var full = Written(Lap()).ToArray();
        using var truncated = new MemoryStream(full[..(full.Length / 2)]);

        var result = SharedLapFile.Read(truncated);

        Assert.False(result.Ok);
        Assert.Equal(SharedLapReadError.Damaged, result.Error);
    }

    [Fact]
    public void TheSuggestedNameSaysWhichLapItIs()
    {
        var name = SharedLapFile.SuggestedFileName(Lap());

        Assert.EndsWith(SharedLapFile.Extension, name, StringComparison.Ordinal);
        Assert.Contains("Spa-Francorchamps", name, StringComparison.Ordinal);
        Assert.Contains("lap4", name, StringComparison.Ordinal);
        Assert.DoesNotContain(' ', name);
    }

    [Fact]
    public void ImportingFilesTheLapAsAThirdPartySessionWithItsTrace()
    {
        var (history, traces, importer) = Corpus();

        var result = importer.Import(Lap());

        Assert.True(result.Added);
        var session = Assert.Single(history.Saved);
        Assert.Equal(LapHistoryOrigin.Shared, session.Origin);
        Assert.Equal("Ada", session.SharedFrom);
        var lap = Assert.Single(session.Laps);
        Assert.True(lap.HasChannelTrace);
        Assert.NotNull(traces.Load(lap.TraceId!));
    }

    [Fact]
    public void AnImportedLapCanDriveAPositionAccurateDeltaLikeOneOfYourOwn()
    {
        // The reference curve is regenerated from the trace's elapsed-time channel, which is
        // exactly why that channel is stored.
        var (history, _, importer) = Corpus();

        importer.Import(Lap());

        var lap = history.Saved[0].Laps[0];
        Assert.True(lap.HasReferenceCurve);
        Assert.Equal(101.5, lap.ReferenceCurve!.TimesSeconds[^1], 1);
    }

    [Fact]
    public void ImportingTheSameLapTwiceDoesNotDuplicateIt()
    {
        // The same lap legitimately arrives as a file from one friend and by code from another.
        var (history, _, importer) = Corpus();
        importer.Import(Lap());

        var second = importer.Import(Lap());

        Assert.False(second.Added);
        Assert.True(second.AlreadyPresent);
        Assert.Single(history.Saved);
    }

    [Fact]
    public void TwoDifferentLapsFromTheSameDriverAreBothKept()
    {
        var (history, _, importer) = Corpus();

        importer.Import(Lap());
        importer.Import(Lap() with { LapNumber = 7, LapTimeSeconds = 99.2 });

        Assert.Equal(2, history.Saved.Count);
    }

    [Fact]
    public void TheSameLapFromADifferentDriverIsADifferentLap()
    {
        var (history, _, importer) = Corpus();

        importer.Import(Lap());
        importer.Import(Lap() with { Provenance = Provenance() with { SharedBy = "Grace" } });

        Assert.Equal(2, history.Saved.Count);
    }

    [Fact]
    public void ALapSharedWithoutANameIsStillAttributedHonestly()
    {
        var (history, _, importer) = Corpus();

        importer.Import(Lap() with { Provenance = Provenance() with { SharedBy = null } });

        Assert.Equal("Unknown driver", history.Saved[0].SharedFrom);
    }

    [Fact]
    public void ACloudLapRecordsTheCodeItWasPulledWith()
    {
        var (history, _, importer) = Corpus();

        importer.Import(Lap() with
        {
            Provenance = Provenance() with { SourceKind = SharedLapSources.Cloud, ShareCode = "ABC123" },
        });

        Assert.Equal("ABC123", history.Saved[0].ShareCode);
    }

    [Fact]
    public void AnImportedLapShowsUpInTheCorpusBrowserAsSelectable()
    {
        var (history, traces, importer) = Corpus();
        importer.Import(Lap());

        var browser = new Sprint.Desktop.Features.Analysis.LapCorpusBrowser(history, traces);
        var context = Assert.Single(browser.Contexts());
        var lap = Assert.Single(browser.Laps(context));

        Assert.True(lap.HasChannels);
        Assert.Equal(LapTargetTier.FullTrace, lap.Tier);
        Assert.Contains("Shared by Ada", lap.Detail, StringComparison.Ordinal);
    }

    private static (FakeHistory History, FakeTraces Traces, SharedLapImporter Importer) Corpus()
    {
        var history = new FakeHistory();
        var traces = new FakeTraces();
        return (history, traces, new SharedLapImporter(history, traces, () => Now));
    }

    private static MemoryStream Written(SharedLap lap)
    {
        var stream = new MemoryStream();
        SharedLapFile.Write(stream, lap);
        stream.Position = 0;
        return stream;
    }

    private static LapProvenance Provenance() => new()
    {
        SourceKind = SharedLapSources.File,
        SharedBy = "Ada",
        DrivenAt = Now.AddDays(-1),
        SharedAt = Now,
    };

    private static SharedLap Lap() => new(
        Provenance(),
        new LapHistoryContext
        {
            Game = "Le Mans Ultimate",
            TrackCourse = "Spa-Francorchamps",
            CarModel = "Porsche 963",
            TrackLengthMeters = TrackLength,
        },
        4,
        101.5,
        Trace());

    private static LapChannelTrace Trace()
    {
        const int Count = 501;
        var speed = new float[Count];
        var elapsed = new float[Count];
        for (var i = 0; i < Count; i++)
        {
            var t = i / (double)(Count - 1);
            speed[i] = (float)(100 + (200 * t));
            elapsed[i] = (float)(101.5 * t);
        }

        return new LapChannelTrace
        {
            PositionStep = 1.0 / (Count - 1),
            TrackLengthMeters = TrackLength,
            Channels = new Dictionary<string, float[]>(StringComparer.Ordinal)
            {
                [LapTraceChannels.SpeedKph] = speed,
                [LapTraceChannels.ElapsedSeconds] = elapsed,
            },
        };
    }

    private sealed class FakeHistory : ILapHistoryStore
    {
        public List<LapHistorySession> Saved { get; } = [];

        public IReadOnlyList<LapHistorySession> LoadAll() => Saved;

        public void Save(LapHistorySession session)
        {
            Saved.RemoveAll(existing => existing.Id == session.Id);
            Saved.Add(session);
        }

        public void Delete(string sessionId) => Saved.RemoveAll(s => s.Id == sessionId);
    }

    private sealed class FakeTraces : ILapTraceStore
    {
        private readonly Dictionary<string, LapChannelTrace> _all = new(StringComparer.Ordinal);

        public void Save(string traceId, LapChannelTrace trace) => _all[traceId] = trace;

        public LapChannelTrace? Load(string traceId) =>
            _all.TryGetValue(traceId, out var trace) ? trace : null;

        public void Delete(string traceId) => _all.Remove(traceId);

        public IReadOnlyList<LapTraceInfo> List() =>
            [.. _all.Select(pair => new LapTraceInfo(pair.Key, 0, Now))];
    }
}

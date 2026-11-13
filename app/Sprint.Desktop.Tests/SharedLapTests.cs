using System.IO.Compression;
using Sprint.Desktop.Features.Analysis;
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
        SharedLap lap = Lap();

        SharedLapReadResult result = SharedLapFile.Read(Written(lap));

        Assert.True(result.Ok);
        SharedLap read = result.Lap!;
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
        SharedLap lap = Lap();
        lap.Trace.Channels["tyreTempFl"] = Enumerable.Repeat(82f, lap.Trace.SampleCount).ToArray();

        SharedLap read = SharedLapFile.Read(Written(lap)).Lap!;

        Assert.True(read.Trace.TryGetChannel("tyreTempFl", out float[]? values));
        Assert.Equal(82f, values[0]);
    }

    [Fact]
    public void AFileThatIsNotALapFileIsNamedAsSuch()
    {
        using MemoryStream stream = new MemoryStream("hello"u8.ToArray());

        SharedLapReadResult result = SharedLapFile.Read(stream);

        Assert.False(result.Ok);
        Assert.Equal(SharedLapReadError.Damaged, result.Error);
        Assert.NotEmpty(result.Message);
    }

    [Fact]
    public void AWellFormedFileWithTheWrongMagicIsRejectedAsNotALapFile()
    {
        using MemoryStream stream = new MemoryStream();
        using (DeflateStream deflate = new System.IO.Compression.DeflateStream(
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
        byte[] full = Written(Lap()).ToArray();
        using MemoryStream truncated = new MemoryStream(full[..(full.Length / 2)]);

        SharedLapReadResult result = SharedLapFile.Read(truncated);

        Assert.False(result.Ok);
        Assert.Equal(SharedLapReadError.Damaged, result.Error);
    }

    [Fact]
    public void TheSuggestedNameSaysWhichLapItIs()
    {
        string name = SharedLapFile.SuggestedFileName(Lap());

        Assert.EndsWith(SharedLapFile.Extension, name, StringComparison.Ordinal);
        Assert.Contains("Spa-Francorchamps", name, StringComparison.Ordinal);
        Assert.Contains("lap4", name, StringComparison.Ordinal);
        Assert.DoesNotContain(' ', name);
    }

    [Fact]
    public void ImportingFilesTheLapAsAThirdPartySessionWithItsTrace()
    {
        (FakeHistory? history, FakeTraces? traces, SharedLapImporter? importer) = Corpus();

        SharedLapImportResult result = importer.Import(Lap());

        Assert.True(result.Added);
        LapHistorySession session = Assert.Single(history.Saved);
        Assert.Equal(LapHistoryOrigin.Shared, session.Origin);
        Assert.Equal("Ada", session.SharedFrom);
        LapHistoryRecord lap = Assert.Single(session.Laps);
        Assert.True(lap.HasChannelTrace);
        Assert.NotNull(traces.Load(lap.TraceId!));
    }

    [Fact]
    public void AnImportedLapCanDriveAPositionAccurateDeltaLikeOneOfYourOwn()
    {
        // The reference curve is regenerated from the trace's elapsed-time channel, which is
        // exactly why that channel is stored.
        (FakeHistory? history, FakeTraces _, SharedLapImporter? importer) = Corpus();

        importer.Import(Lap());

        LapHistoryRecord lap = history.Saved[0].Laps[0];
        Assert.True(lap.HasReferenceCurve);
        Assert.Equal(101.5, lap.ReferenceCurve!.TimesSeconds[^1], 1);
    }

    [Fact]
    public void A_lap_sent_by_an_older_and_a_newer_Sprint_is_filed_once()
    {
        // An older Sprint sent the livery as the car; a newer one sends the class name and the livery beside it.
        (FakeHistory history, _, SharedLapImporter importer) = Corpus();
        SharedLap older = Lap() with { Context = new LapHistoryContext { Game = "LeMansUltimate", TrackCourse = "Spa-Francorchamps", CarModel = "Porsche 963:#6 Penske" } };
        SharedLap newer = Lap() with { Context = new LapHistoryContext { Game = "LeMansUltimate", TrackCourse = "Spa-Francorchamps", CarModel = "Hypercar Porsche", Livery = "Porsche 963:#6 Penske" } };
        importer.Import(older);

        SharedLapImportResult second = importer.Import(newer);

        Assert.True(second.AlreadyPresent);
        Assert.Single(history.Saved);
    }

    [Fact]
    public void ImportingTheSameLapTwiceDoesNotDuplicateIt()
    {
        // The same lap legitimately arrives as a file from one friend and by code from another.
        (FakeHistory? history, FakeTraces _, SharedLapImporter? importer) = Corpus();
        importer.Import(Lap());

        SharedLapImportResult second = importer.Import(Lap());

        Assert.False(second.Added);
        Assert.True(second.AlreadyPresent);
        Assert.Single(history.Saved);
    }

    [Fact]
    public void ALapCanBeCheckedForBeingAlreadyHereWithoutFilingIt()
    {
        // The import dialog says "already in your laps" before the driver confirms anything.
        (FakeHistory history, FakeTraces _, SharedLapImporter importer) = Corpus();

        Assert.False(importer.IsPresent(Lap()));
        Assert.Empty(history.Saved);

        importer.Import(Lap());

        Assert.True(importer.IsPresent(Lap()));
        Assert.False(importer.IsPresent(Lap() with { LapNumber = 7, LapTimeSeconds = 99.2 }));
    }

    [Fact]
    public void TwoDifferentLapsFromTheSameDriverAreBothKept()
    {
        (FakeHistory? history, FakeTraces _, SharedLapImporter? importer) = Corpus();

        importer.Import(Lap());
        importer.Import(Lap() with { LapNumber = 7, LapTimeSeconds = 99.2 });

        Assert.Equal(2, history.Saved.Count);
    }

    [Fact]
    public void TheSameLapFromADifferentDriverIsADifferentLap()
    {
        (FakeHistory? history, FakeTraces _, SharedLapImporter? importer) = Corpus();

        importer.Import(Lap());
        importer.Import(Lap() with { Provenance = Provenance() with { SharedBy = "Grace" } });

        Assert.Equal(2, history.Saved.Count);
    }

    [Fact]
    public void ALapSharedWithoutANameIsStillAttributedHonestly()
    {
        (FakeHistory? history, FakeTraces _, SharedLapImporter? importer) = Corpus();

        importer.Import(Lap() with { Provenance = Provenance() with { SharedBy = null } });

        Assert.Equal("Unknown driver", history.Saved[0].SharedFrom);
    }

    [Fact]
    public void ACloudLapRecordsTheCodeItWasPulledWith()
    {
        (FakeHistory? history, FakeTraces _, SharedLapImporter? importer) = Corpus();

        importer.Import(Lap() with
        {
            Provenance = Provenance() with { SourceKind = SharedLapSources.Cloud, ShareCode = "ABC123" },
        });

        Assert.Equal("ABC123", history.Saved[0].ShareCode);
    }

    [Fact]
    public void AnImportedLapShowsUpInTheCorpusBrowserAsSelectable()
    {
        (FakeHistory? history, FakeTraces? traces, SharedLapImporter? importer) = Corpus();
        importer.Import(Lap());

        LapCorpusBrowser browser = new Sprint.Desktop.Features.Analysis.LapCorpusBrowser(history, traces);
        CorpusSession session = Assert.Single(browser.Sessions());
        CorpusLap lap = Assert.Single(browser.Laps(session));

        Assert.True(lap.HasChannels);
        Assert.Equal(LapTargetTier.FullTrace, lap.Tier);
        Assert.Contains("Shared by Ada", lap.Detail, StringComparison.Ordinal);
    }

    [Fact]
    public void AnExportedLapCarriesItsPositionsIntoTheFriendsCorpus()
    {
        (FakeHistory mine, FakeTraces myTraces, SharedLapImporter _) = Corpus();
        LapChannelTrace driven = Trace();
        AddWorldChannels(driven);
        myTraces.Save("trace-4", driven);
        mine.Save(Recorded("mine", lapNumber: 4, traceId: "trace-4"));

        SharedLapExportResult export = SharedLapExport.Build(mine, myTraces, "mine", 4, " Alex Morgan ", Now, []);

        Assert.True(export.HasPositions);
        Assert.NotNull(export.Lap);
        Assert.Equal("Alex Morgan", export.Lap.Provenance.SharedBy);
        SharedLapReadResult read = SharedLapFile.Read(Written(export.Lap));
        Assert.NotNull(read.Lap);
        (FakeHistory friend, FakeTraces friendTraces, SharedLapImporter friendImporter) = Corpus();
        Assert.True(friendImporter.Import(read.Lap).Added);

        LapTraceInfo imported = Assert.Single(friendTraces.List());
        LapChannelTrace? trace = friendTraces.Load(imported.TraceId);
        Assert.NotNull(trace);
        Assert.True(trace.TryGetChannel(LapTraceChannels.WorldX, out float[] _));
        Assert.Equal(101.5, Assert.Single(Assert.Single(friend.Saved).Laps).LapTimeSeconds);
    }

    [Fact]
    public void ALapWithoutChannelsOrNoLongerInHistoryCannotBeExported()
    {
        (FakeHistory history, FakeTraces traces, SharedLapImporter _) = Corpus();
        history.Save(Recorded("mine", lapNumber: 4, traceId: null));

        SharedLapExportResult timeOnly = SharedLapExport.Build(history, traces, "mine", 4, "Alex Morgan", Now, []);
        SharedLapExportResult gone = SharedLapExport.Build(history, traces, "mine", 9, "Alex Morgan", Now, []);

        Assert.Null(timeOnly.Lap);
        Assert.Contains("only a time", timeOnly.Error);
        Assert.Null(gone.Lap);
        Assert.Contains("no longer", gone.Error);
    }

    [Fact]
    public void PassingOnASharedLapKeepsItsOriginalDriver()
    {
        (FakeHistory history, FakeTraces traces, SharedLapImporter importer) = Corpus();
        SharedLapImportResult imported = importer.Import(Lap());
        int lapNumber = Assert.Single(Assert.Single(history.Saved).Laps).LapNumber;

        SharedLapExportResult export = SharedLapExport.Build(history, traces, imported.SessionId, lapNumber, "Alex Morgan", Now, []);

        Assert.Equal("Ada", export.Lap?.Provenance.SharedBy);
        Assert.False(export.HasPositions);
    }

    private static LapHistorySession Recorded(string id, int lapNumber, string? traceId) => new()
    {
        Id = id,
        Context = Lap().Context,
        StartedAt = Now.AddDays(-1),
        Laps = [new LapHistoryRecord { LapNumber = lapNumber, LapTimeSeconds = 101.5, TraceId = traceId }],
    };

    /// <summary>A circular track with one braking zone and throttle elsewhere.</summary>
    private static void AddWorldChannels(LapChannelTrace trace)
    {
        int count = trace.SampleCount;
        double radius = TrackLength / (2 * Math.PI);
        float[] xs = new float[count];
        float[] ys = new float[count];
        float[] zs = new float[count];
        float[] brake = new float[count];
        float[] throttle = new float[count];
        for (int i = 0; i < count; i++)
        {
            double angle = 2 * Math.PI * i / (count - 1);
            xs[i] = (float)(radius * Math.Cos(angle));
            zs[i] = (float)(radius * Math.Sin(angle));
            bool braking = i is >= 200 and < 220;
            brake[i] = braking ? 0.8f : 0f;
            throttle[i] = braking ? 0f : 1f;
        }

        trace.Channels[LapTraceChannels.WorldX] = xs;
        trace.Channels[LapTraceChannels.WorldY] = ys;
        trace.Channels[LapTraceChannels.WorldZ] = zs;
        trace.Channels[LapTraceChannels.Brake] = brake;
        trace.Channels[LapTraceChannels.Throttle] = throttle;
    }

    private static (FakeHistory History, FakeTraces Traces, SharedLapImporter Importer) Corpus()
    {
        FakeHistory history = new FakeHistory();
        FakeTraces traces = new FakeTraces();
        return (history, traces, new SharedLapImporter(history, traces, () => Now));
    }

    private static MemoryStream Written(SharedLap lap)
    {
        MemoryStream stream = new MemoryStream();
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
        const int count = 501;
        float[] speed = new float[count];
        float[] elapsed = new float[count];
        for (int i = 0; i < count; i++)
        {
            double t = i / (double)(count - 1);
            speed[i] = (float)(100 + (200 * t));
            elapsed[i] = (float)(101.5 * t);
        }

        return new LapChannelTrace
        {
            PositionStep = 1.0 / (count - 1),
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

        public IReadOnlyList<LapHistorySession> LoadAll() => this.Saved;

        public void Save(LapHistorySession session)
        {
            this.Saved.RemoveAll(existing => existing.Id == session.Id);
            this.Saved.Add(session);
        }

        public void Delete(string sessionId) => this.Saved.RemoveAll(s => s.Id == sessionId);
    }

    private sealed class FakeTraces : ILapTraceStore
    {
        private readonly Dictionary<string, LapChannelTrace> _all = new(StringComparer.Ordinal);

        public void Save(string traceId, LapChannelTrace trace) => this._all[traceId] = trace;

        public LapChannelTrace? Load(string traceId) =>
            this._all.TryGetValue(traceId, out LapChannelTrace? trace) ? trace : null;

        public void Delete(string traceId) => this._all.Remove(traceId);

        public IReadOnlyList<LapTraceInfo> List() =>
            [.. this._all.Select(pair => new LapTraceInfo(pair.Key, 0, Now))];
    }
}

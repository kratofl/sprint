using System.IO.Compression;
using System.Text;
using System.Text.Json;
using Sprint.Desktop.Features.Analysis;
using Sprint.Desktop.Features.SessionPlanning;
using Sprint.Desktop.Features.Sharing;
using Xunit;

namespace Sprint.Desktop.Tests;

/// <summary>
/// Notes on a lap: written afterwards in Analysis at a place on the lap, kept apart from the
/// session files the recorder rewrites, and carried in the shared lap file, where they arrive
/// read-only with their author's name.
/// </summary>
public sealed class LapNotesTests : IDisposable
{
    private static readonly DateTimeOffset Now = new(2026, 11, 8, 18, 0, 0, TimeSpan.Zero);
    private const double TrackLength = 7004;

    private readonly string _folder = Path.Combine(Path.GetTempPath(), "Sprint.LapNotesTests", Guid.NewGuid().ToString("N"));

    public void Dispose()
    {
        if (Directory.Exists(this._folder))
        {
            Directory.Delete(this._folder, recursive: true);
        }
    }

    [Fact]
    public void ANoteIsKeptAtItsPlaceWithItsAuthorAndSurvivesARestart()
    {
        (AnalysisController analysis, LapCorpusBrowser browser, _, _) = this.Corpus();

        Assert.True(analysis.AddNote("mine", 5, 3200, "  Lift earlier into C3  ", " Luca ", out string error), error);

        CorpusLapNote note = Assert.Single(Assert.IsType<CorpusLap>(browser.Find("mine", 5)).Notes);
        Assert.Equal(3200, note.DistanceMeters);
        Assert.Equal("Lift earlier into C3", note.Text);
        Assert.Equal("Luca", note.Author);
        Assert.Equal(Now, note.CreatedAt);
        Assert.True(note.Mine);

        LapNote reread = Assert.Single(new LapNotes(this.NotesPath).For("mine", 5));
        Assert.Equal(note.Id, reread.Id);
        Assert.Equal("Lift earlier into C3", reread.Text);
    }

    [Fact]
    public void ADriverEditsAndDeletesTheirOwnNote()
    {
        (AnalysisController analysis, LapCorpusBrowser browser, _, _) = this.Corpus();
        Assert.True(analysis.AddNote("mine", 5, 100, "TC 5 here", "Luca", out _));
        string id = Assert.Single(Assert.IsType<CorpusLap>(browser.Find("mine", 5)).Notes).Id;

        Assert.True(analysis.UpdateNote("mine", 5, id, "TC 6 here", out string updateError), updateError);
        CorpusLapNote edited = Assert.Single(Assert.IsType<CorpusLap>(browser.Find("mine", 5)).Notes);
        Assert.Equal("TC 6 here", edited.Text);
        Assert.Equal(100, edited.DistanceMeters);

        Assert.True(analysis.DeleteNote("mine", 5, id, out string deleteError), deleteError);
        Assert.Empty(Assert.IsType<CorpusLap>(browser.Find("mine", 5)).Notes);
        Assert.False(analysis.DeleteNote("mine", 5, id, out string again));
        Assert.Equal("no such note on that lap", again);
    }

    [Theory]
    [InlineData("mine", 9, 100, "Brake later", "no such lap")]
    [InlineData("mine", 5, 100, "   ", "Write something first.")]
    [InlineData("mine", 5, -1, "Brake later", "distanceMeters must be a place on the lap")]
    [InlineData("mine", 5, 9000, "Brake later", "distanceMeters must be a place on the lap")]
    public void ANoteThePageCouldNeverPlaceIsRefused(string sessionId, int lapNumber, double distance, string text, string expected)
    {
        (AnalysisController analysis, _, _, _) = this.Corpus();

        Assert.False(analysis.AddNote(sessionId, lapNumber, distance, text, "Luca", out string error));
        Assert.Equal(expected, error);
    }

    [Fact]
    public void AnOversizedNoteIsRefused()
    {
        (AnalysisController analysis, _, _, _) = this.Corpus();

        Assert.False(analysis.AddNote("mine", 5, 100, new string('x', LapNote.MaxTextLength + 1), "Luca", out string error));
        Assert.Contains("500", error, StringComparison.Ordinal);
    }

    [Fact]
    public void NotesTravelInTheLapFileAndArriveReadOnlyWithTheirAuthor()
    {
        (AnalysisController analysis, _, FakeHistory history, FakeTraces traces) = this.Corpus();
        Assert.True(analysis.AddNote("mine", 5, 3200, "TC 5 from here", "Luca", out _));

        SharedLapExportResult export = SharedLapExport.Build(history, traces, "mine", 5, "Luca", Now, new LapNotes(this.NotesPath).For("mine", 5));
        Assert.NotNull(export.Lap);
        SharedLap? received = SharedLapFile.Read(Written(export.Lap)).Lap;
        Assert.NotNull(received);

        FakeHistory friendHistory = new();
        FakeTraces friendTraces = new();
        SharedLapImportResult imported = new SharedLapImporter(friendHistory, friendTraces, () => Now).Import(received);
        LapCorpusBrowser friendBrowser = new(friendHistory, friendTraces, new LapNotes(Path.Combine(this._folder, "friend-notes.json")));
        AnalysisController friend = new(friendBrowser);

        CorpusLapNote note = Assert.Single(Assert.IsType<CorpusLap>(friendBrowser.Find(imported.SessionId, 5)).Notes);
        Assert.Equal("TC 5 from here", note.Text);
        Assert.Equal("Luca", note.Author);
        Assert.Equal(3200, note.DistanceMeters);
        Assert.False(note.Mine);
        Assert.False(friend.UpdateNote(imported.SessionId, 5, note.Id, "Mine now", out string error));
        Assert.Contains("shared lap", error, StringComparison.Ordinal);
        Assert.False(friend.DeleteNote(imported.SessionId, 5, note.Id, out _));

        // The friend's own note on that lap is theirs, beside the one it came with.
        Assert.True(friend.AddNote(imported.SessionId, 5, 50, "Late apex", "Ada", out string addError), addError);
        Assert.Equal([true, false], Assert.IsType<CorpusLap>(friendBrowser.Find(imported.SessionId, 5)).Notes.Select(candidate => candidate.Mine));
    }

    [Fact]
    public void ALapFileFromBeforeNotesStillImports()
    {
        SharedLap lap = new(
            new LapProvenance { SharedBy = "Ada", SharedAt = Now },
            Context(),
            5,
            125.263,
            Trace());

        SharedLapReadResult read = SharedLapFile.Read(WrittenWithoutNotes(lap));

        Assert.True(read.Ok, read.Message);
        Assert.NotNull(read.Lap);
        Assert.Empty(read.Lap.Notes);
    }

    private string NotesPath => Path.Combine(this._folder, "lap-notes.json");

    private (AnalysisController Analysis, LapCorpusBrowser Browser, FakeHistory History, FakeTraces Traces) Corpus()
    {
        FakeHistory history = new();
        FakeTraces traces = new();
        traces.Save("trace-5", Trace());
        history.Save(new LapHistorySession
        {
            Id = "mine",
            Context = Context(),
            StartedAt = Now.AddHours(-1),
            Laps =
            [
                new LapHistoryRecord
                {
                    LapNumber = 5,
                    LapTimeSeconds = 125.263,
                    TraceId = "trace-5",
                    ReferenceCurve = new LapReferenceCurve { PositionStep = 0.5, TimesSeconds = [0, 60, 125.263] },
                },
            ],
        });
        LapCorpusBrowser browser = new(history, traces, new LapNotes(this.NotesPath, clock: () => Now));
        return (new AnalysisController(browser), browser, history, traces);
    }

    private static LapHistoryContext Context() => new()
    {
        Game = "Le Mans Ultimate",
        TrackCourse = "Spa",
        CarModel = "Hypercar Porsche",
        TrackLengthMeters = TrackLength,
    };

    private static LapChannelTrace Trace()
    {
        const int count = 201;
        float[] speed = new float[count];
        float[] elapsed = new float[count];
        for (int i = 0; i < count; i++)
        {
            double t = i / (double)(count - 1);
            speed[i] = (float)(150 + (100 * t));
            elapsed[i] = (float)(125.263 * t);
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

    private static MemoryStream Written(SharedLap lap)
    {
        MemoryStream stream = new();
        SharedLapFile.Write(stream, lap);
        stream.Position = 0;
        return stream;
    }

    /// <summary>A lap file as Sprint wrote it before notes: the same container, a header with no notes field.</summary>
    private static MemoryStream WrittenWithoutNotes(SharedLap lap)
    {
        MemoryStream stream = new();
        using (DeflateStream deflate = new(stream, CompressionLevel.Optimal, leaveOpen: true))
        using (BinaryWriter writer = new(deflate, Encoding.UTF8, leaveOpen: true))
        {
            writer.Write("SPLAP"u8.ToArray());
            writer.Write(1);
            writer.Write(JsonSerializer.Serialize(new
            {
                provenance = new { sourceKind = "file", sharedBy = lap.Provenance.SharedBy, sharedAt = lap.Provenance.SharedAt },
                context = new { game = lap.Context.Game, trackCourse = lap.Context.TrackCourse, carModel = lap.Context.CarModel },
                lapNumber = lap.LapNumber,
                lapTimeSeconds = lap.LapTimeSeconds,
            }));
            writer.Flush();
            LapTraceCodec.Write(deflate, lap.Trace);
        }

        stream.Position = 0;
        return stream;
    }

    private sealed class FakeHistory : ILapHistoryStore
    {
        private readonly List<LapHistorySession> _sessions = [];

        public IReadOnlyList<LapHistorySession> LoadAll() => this._sessions;

        public void Save(LapHistorySession session)
        {
            this._sessions.RemoveAll(existing => existing.Id == session.Id);
            this._sessions.Add(session);
        }

        public void Delete(string sessionId) => this._sessions.RemoveAll(session => session.Id == sessionId);
    }

    private sealed class FakeTraces : ILapTraceStore
    {
        private readonly Dictionary<string, LapChannelTrace> _all = new(StringComparer.Ordinal);

        public void Save(string traceId, LapChannelTrace trace) => this._all[traceId] = trace;

        public LapChannelTrace? Load(string traceId) => this._all.TryGetValue(traceId, out LapChannelTrace? trace) ? trace : null;

        public void Delete(string traceId) => this._all.Remove(traceId);

        public IReadOnlyList<LapTraceInfo> List() => [.. this._all.Select(pair => new LapTraceInfo(pair.Key, 0, Now))];
    }
}

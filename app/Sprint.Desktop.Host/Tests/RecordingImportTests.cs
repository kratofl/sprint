using Sprint.Desktop.Api.Telemetry;
using Sprint.Desktop.Features.SessionPlanning;
using Sprint.Games.Recording;
using Xunit;

namespace Sprint.Desktop.Host.Tests;

/// <summary>
/// <c>make dev-data</c>'s import of telemetry recordings into lap history: laps land as driven,
/// a second import rewrites rather than duplicates, and it never writes without a dev data root.
/// </summary>
public sealed class RecordingImportTests : IDisposable
{
    private static readonly DateTimeOffset DrivenAt = new(2026, 11, 14, 17, 0, 0, TimeSpan.Zero);

    private readonly string _root = Path.Combine(Path.GetTempPath(), "sprint-recording-import-" + Guid.NewGuid().ToString("N"));

    public RecordingImportTests() => Directory.CreateDirectory(this._root);

    public void Dispose() => Directory.Delete(this._root, recursive: true);

    [Fact]
    public void Import_FilesTheLapsAsDriven_AndAgainRewritesRatherThanCopies()
    {
        string recording = this.WriteRecording(
            (0, Frame(currentLap: 1)),
            (90, Frame(currentLap: 2, lastLapTime: 90.5)),
            (181, Frame(currentLap: 3, lastLapTime: 91.25)));
        LocalLapHistoryStore history = new(Path.Combine(this._root, "lap-history"));
        LocalLapTraceStore traces = new(Path.Combine(this._root, "lap-traces"));

        RecordingImportResult first = RecordingImport.Import(recording, history, traces);
        RecordingImportResult again = RecordingImport.Import(recording, history, traces);

        Assert.Equal(new RecordingImportResult(Sessions: 1, Laps: 2), first);
        Assert.Equal(first, again);
        LapHistorySession session = Assert.Single(history.LoadAll());
        Assert.Equal([90.5, 91.25], session.Laps.Select(lap => lap.LapTimeSeconds));
        Assert.Equal(DrivenAt, session.StartedAt);
        Assert.Equal(DrivenAt.AddSeconds(181), session.EndedAt);
    }

    [Fact]
    public void Run_WithoutADataRoot_WritesNothing()
    {
        string recording = this.WriteRecording((0, Frame(currentLap: 1)));
        StringWriter output = new();

        int exitCode = RecordingImport.Run([recording], dataRoot: null, output);

        Assert.Equal(1, exitCode);
        Assert.Contains("SPRINT_DESKTOP_DATA_ROOT", output.ToString());
        Assert.Equal([recording], Directory.GetFileSystemEntries(this._root));
    }

    private string WriteRecording(params (double Seconds, TelemetryFrame Frame)[] frames)
    {
        string path = Path.Combine(this._root, "test" + TelemetryRecording.FileExtension);
        using TelemetryRecordingWriter writer = TelemetryRecordingWriter.Create(path, new RecordingHeader(TelemetryRecording.FormatVersion, "LMU", DrivenAt));
        foreach ((double seconds, TelemetryFrame frame) in frames)
        {
            writer.Write(new RecordedFrame(seconds, frame));
        }

        return path;
    }

    private static TelemetryFrame Frame(int currentLap, double lastLapTime = 0) => new()
    {
        Session = new SessionInfo { Game = "LMU", Track = "Monza", Car = "GT3", SessionType = SessionType.Practice, InCar = true },
        Lap = new LapState { CurrentLap = currentLap, LastLapTime = lastLapTime },
    };
}

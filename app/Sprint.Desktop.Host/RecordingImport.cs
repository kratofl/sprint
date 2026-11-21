using System.Security.Cryptography;
using System.Text;
using Sprint.Desktop.Api.Telemetry;
using Sprint.Desktop.Features.SessionPlanning;
using Sprint.Games.Recording;

namespace Sprint.Desktop.Host;

/// <summary>What one recording added to lap history.</summary>
public sealed record RecordingImportResult(int Sessions, int Laps);

/// <summary>
/// Files the laps of telemetry recordings (<c>make dev-app RECORD=1</c>) into lap history all at
/// once instead of replaying them in real time, so a checkout without the game still has history
/// to show: <c>make dev-data</c> runs the host as <c>import-recordings &lt;file&gt;…</c> (Debug
/// builds only) over <c>app/recordings</c>. Laps go through the same
/// <see cref="LapHistoryRecorder"/> the live app uses. It runs on the time each frame was driven
/// (the recording's start plus the frame's offset), so sessions read as driven when they were.
/// Session ids come from the file name, so a second import of a recording rewrites its sessions
/// instead of adding copies.
/// </summary>
public static class RecordingImport
{
    /// <summary>
    /// The host's <c>import-recordings</c> mode. Writes only below <paramref name="dataRoot"/>
    /// (<c>SPRINT_DESKTOP_DATA_ROOT</c>), and refuses without it, so it never touches the installed
    /// app's data. Returns the process exit code: 0 when every recording was imported.
    /// </summary>
    public static int Run(IReadOnlyList<string> recordings, string? dataRoot, TextWriter output)
    {
        if (string.IsNullOrWhiteSpace(dataRoot))
        {
            output.WriteLine("import-recordings: SPRINT_DESKTOP_DATA_ROOT is not set; refusing to write into the installed app's data.");
            return 1;
        }

        if (recordings.Count == 0)
        {
            output.WriteLine("usage: import-recordings <recording>…");
            return 1;
        }

        // The folders Program.cs keeps lap history and traces in.
        LocalLapHistoryStore history = new(Path.Combine(dataRoot, "lap-history"));
        LocalLapTraceStore traces = new(Path.Combine(dataRoot, "lap-traces"));
        int failed = 0;
        foreach (string recording in recordings)
        {
            string name = Path.GetFileName(recording);
            try
            {
                RecordingImportResult result = Import(recording, history, traces);
                output.WriteLine($"{name}: {result.Laps} laps in {result.Sessions} sessions");
            }
            catch (Exception ex) when (ex is IOException or UnauthorizedAccessException or InvalidDataException)
            {
                output.WriteLine($"{name}: skipped, {ex.Message}");
                failed++;
            }
        }

        return failed == 0 ? 0 : 1;
    }

    /// <summary>
    /// Files every lap of one recording into <paramref name="history"/> and <paramref name="traces"/>.
    /// Throws <see cref="IOException"/> or <see cref="InvalidDataException"/> when the file is not a
    /// readable recording.
    /// </summary>
    public static RecordingImportResult Import(string recording, ILapHistoryStore history, ILapTraceStore traces)
    {
        using TelemetryRecordingReader reader = TelemetryRecordingReader.Open(recording);
        DateTimeOffset now = reader.Header.StartedAt;
        string fileName = Path.GetFileName(recording);
        List<string> sessionIds = [];
        LapHistoryRecorder recorder = new(
            history,
            traces,
            clock: () => now,
            idFactory: () =>
            {
                string id = SessionId(fileName, sessionIds.Count);
                sessionIds.Add(id);
                return id;
            },
            // In order, on this thread: there is no telemetry loop to keep free.
            dispatch: write => write());

        while (reader.ReadNext() is { } recorded)
        {
            // Status changes (the game closing, a link drop) do not end a session live either.
            if (recorded is RecordedFrame { Frame: TelemetryFrame frame })
            {
                now = reader.Header.StartedAt + TimeSpan.FromSeconds(recorded.Seconds);
                recorder.Ingest(frame with { Timestamp = now });
            }
        }

        recorder.Close();
        // A session with no finished lap is never written, so only the ids that landed count.
        LapHistorySession[] filed = [.. history.LoadAll().Where(session => sessionIds.Contains(session.Id))];
        return new RecordingImportResult(filed.Length, filed.Sum(session => session.Laps.Count));
    }

    // Shaped like the recorder's own ids (32 hex digits), but the same on every import.
    private static string SessionId(string fileName, int index) =>
        new Guid(MD5.HashData(Encoding.UTF8.GetBytes($"{fileName}#{index}"))).ToString("N");
}

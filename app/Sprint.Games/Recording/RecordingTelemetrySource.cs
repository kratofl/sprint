using System.Diagnostics;
using System.Text.Json;
using Sprint.Desktop.Api.Telemetry;

namespace Sprint.Games.Recording;

/// <summary>
/// Wraps a live source and writes everything it reports to recording files, one per session
/// (track, car and session type), while passing every call straight through. Dev only: the
/// host wraps the game's source in it when <c>SPRINT_TELEMETRY_RECORD</c> names a folder
/// (<c>make record-app</c>), and <see cref="ReplayTelemetrySource"/> plays the files back.
/// </summary>
/// <remarks>
/// Writing happens on the engine's reader thread, inside the calls it wraps. A write failure
/// never reaches the engine: recording stops, <c>onError</c> hears about it once, and the
/// wrapped source keeps working.
/// </remarks>
public sealed class RecordingTelemetrySource : ITelemetrySource
{
    private static readonly TimeSpan FlushEvery = TimeSpan.FromSeconds(1);

    private readonly ITelemetrySource _inner;
    private readonly string _directory;
    private readonly Action<Exception> _onError;
    private readonly Func<TimeSpan> _elapsed;

    private TelemetryRecordingWriter? _writer;
    private string? _sessionKey;
    private TimeSpan _fileStartedAt;
    private TimeSpan _lastFlush;
    private TelemetryStatus _noted;
    private bool _failed;

    /// <param name="elapsed">A monotonic clock; tests pass a scripted one.</param>
    public RecordingTelemetrySource(
        ITelemetrySource inner,
        string directory,
        Action<Exception> onError,
        Func<TimeSpan>? elapsed = null)
    {
        this._inner = inner;
        this._directory = directory;
        this._onError = onError;
        Stopwatch stopwatch = Stopwatch.StartNew();
        this._elapsed = elapsed ?? (() => stopwatch.Elapsed);
        this._noted = inner.Status;
    }

    /// <summary>The file being written, or null before the first frame and after a failure.</summary>
    public string? CurrentFile { get; private set; }

    public string Name => this._inner.Name;

    public TelemetryStatus Status => this._inner.Status;

    public TelemetryFrame Current => this._inner.Current;

    public void Connect()
    {
        this._inner.Connect();
        this.NoteStatus();
    }

    public void Disconnect()
    {
        this._inner.Disconnect();
        this.NoteStatus();
        this.Guard(() => this._writer?.Flush());
    }

    public bool TryRead(out TelemetryFrame frame)
    {
        bool read = this._inner.TryRead(out frame);
        this.NoteStatus();
        if (read)
        {
            TelemetryFrame recorded = frame;
            this.Guard(() => this.WriteFrame(recorded));
        }

        return read;
    }

    public void Dispose()
    {
        this.CloseFile();
        this._inner.Dispose();
    }

    // A file per session, so practice, qualifying and the race land in separate recordings.
    // Frames without a track (menus, loading) belong to whatever file is open.
    private static string? SessionKeyOf(TelemetryFrame frame) =>
        string.IsNullOrEmpty(frame.Session.Track)
            ? null
            : $"{frame.Session.Track}|{frame.Session.Car}|{frame.Session.SessionType}";

    private void WriteFrame(TelemetryFrame frame)
    {
        string? key = SessionKeyOf(frame);
        if (this._writer is not null && key is not null && this._sessionKey is not null && key != this._sessionKey)
        {
            this.CloseFile();
        }

        TelemetryRecordingWriter writer = this._writer ?? this.OpenFile(frame);
        if (key is not null)
        {
            this._sessionKey = key;
        }

        TimeSpan now = this._elapsed();
        writer.Write(new RecordedFrame(this.SecondsAt(now), frame));
        if (now - this._lastFlush >= FlushEvery)
        {
            writer.Flush();
            this._lastFlush = now;
        }
    }

    // Only a change of link state is worth a line; the detail text and timestamps are not.
    private void NoteStatus()
    {
        TelemetryStatus status = this._inner.Status;
        if (status.State == this._noted.State)
        {
            return;
        }

        this._noted = status;
        this.Guard(() => this._writer?.Write(new RecordedStatus(this.SecondsAt(this._elapsed()), status)));
    }

    private TelemetryRecordingWriter OpenFile(TelemetryFrame frame)
    {
        Directory.CreateDirectory(this._directory);
        DateTimeOffset startedAt = DateTimeOffset.Now;
        string path = this.FreePath(startedAt, frame.Session);

        TelemetryRecordingWriter writer = TelemetryRecordingWriter.Create(
            path,
            new RecordingHeader(TelemetryRecording.FormatVersion, this._inner.Name, startedAt));
        this._writer = writer;
        this.CurrentFile = path;
        this._fileStartedAt = this._elapsed();
        this._lastFlush = this._fileStartedAt;
        this._sessionKey = null;

        // A replay starts from the link state the session started in.
        writer.Write(new RecordedStatus(0, this._noted));
        return writer;
    }

    private void CloseFile()
    {
        TelemetryRecordingWriter? writer = this._writer;
        this._writer = null;
        this.CurrentFile = null;
        if (writer is not null)
        {
            this.Guard(writer.Dispose);
        }
    }

    private double SecondsAt(TimeSpan now) => (now - this._fileStartedAt).TotalSeconds;

    // e.g. 20261107-201500-Spa-Francorchamps-Race.jsonl.gz, numbered when two land in one second.
    private string FreePath(DateTimeOffset startedAt, SessionInfo session)
    {
        string track = string.IsNullOrEmpty(session.Track) ? "session" : session.Track;
        string stem = $"{startedAt:yyyyMMdd-HHmmss}-{track}-{session.SessionType}";
        foreach (char invalid in Path.GetInvalidFileNameChars().Append(' '))
        {
            stem = stem.Replace(invalid, '-');
        }

        string path = Path.Combine(this._directory, stem + TelemetryRecording.FileExtension);
        for (int n = 2; File.Exists(path); n++)
        {
            path = Path.Combine(this._directory, $"{stem}-{n}{TelemetryRecording.FileExtension}");
        }

        return path;
    }

    private void Guard(Action write)
    {
        if (this._failed)
        {
            return;
        }

        try
        {
            write();
        }
        catch (Exception ex) when (IsWriteFailure(ex))
        {
            this._failed = true;
            TelemetryRecordingWriter? writer = this._writer;
            this._writer = null;
            this.CurrentFile = null;
            try
            {
                writer?.Dispose();
            }
            catch (Exception disposeFailure) when (IsWriteFailure(disposeFailure))
            {
                // The file is already broken; releasing the handle is all that is left to try.
            }

            this._onError(ex);
        }
    }

    private static bool IsWriteFailure(Exception ex) =>
        ex is IOException or UnauthorizedAccessException or JsonException or NotSupportedException;
}

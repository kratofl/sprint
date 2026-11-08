using System.Diagnostics;
using Sprint.Desktop.Api.Telemetry;

namespace Sprint.Games.Recording;

/// <summary>
/// Plays a recording made by <see cref="RecordingTelemetrySource"/> back as a live source, at
/// the speed it was driven, looping at the end. Dev only: the host uses it instead of the game
/// when <c>SPRINT_TELEMETRY_REPLAY</c> names a file (<c>make replay-app</c>), so dashes, the
/// HUD and the planner can be checked end to end without the game running.
/// </summary>
/// <remarks>
/// Recorded link drops replay as drops: while the recorded state is not
/// <see cref="TelemetryConnectionState.Connected"/>, the engine probes <see cref="Connect"/>
/// on its reconnect interval instead of reading, as it would against the game, and the
/// timeline keeps moving on each probe. Frames are restamped with the current time so
/// freshness reads them as live. The status names the replay, never the game.
/// </remarks>
public sealed class ReplayTelemetrySource : ITelemetrySource
{
    private readonly string _path;
    private readonly Func<TimeSpan> _elapsed;

    private TelemetryRecordingReader? _reader;
    private RecordedEvent? _due;
    private TimeSpan _passStartedAt;
    private double _lastSeconds;
    private bool _passHadFrame;
    private bool _frameWaiting;
    private bool _disposed;
    private TelemetryFrame _current = new();
    private TelemetryStatus _status;

    /// <param name="elapsed">A monotonic clock; tests pass a scripted one.</param>
    public ReplayTelemetrySource(string path, Func<TimeSpan>? elapsed = null)
    {
        this._path = path;
        Stopwatch stopwatch = Stopwatch.StartNew();
        this._elapsed = elapsed ?? (() => stopwatch.Elapsed);
        this.Name = $"Replay · {Path.GetFileName(path)}";
        this._status = TelemetryStatus.Disconnected(this.Name);
    }

    public string Name { get; }

    public TelemetryStatus Status => Volatile.Read(ref this._status);

    public TelemetryFrame Current => Volatile.Read(ref this._current);

    public void Connect()
    {
        ObjectDisposedException.ThrowIf(this._disposed, this);
        if (this._reader is null && !this.StartPass())
        {
            return;
        }

        this.Advance();
    }

    public bool TryRead(out TelemetryFrame frame)
    {
        ObjectDisposedException.ThrowIf(this._disposed, this);
        if (this._reader is not null)
        {
            this.Advance();
        }

        frame = this.Current;
        bool fresh = this._frameWaiting;
        this._frameWaiting = false;
        return fresh;
    }

    public void Disconnect()
    {
        this._reader?.Dispose();
        this._reader = null;
        this._due = null;
        this.Publish(TelemetryStatus.Disconnected(this.Name));
    }

    public void Dispose()
    {
        if (this._disposed)
        {
            return;
        }

        this.Disconnect();
        this._disposed = true;
    }

    // Opens the file from the top. A missing or foreign file is a Faulted link, never a throw.
    private bool StartPass()
    {
        try
        {
            this._reader = TelemetryRecordingReader.Open(this._path);
        }
        catch (Exception ex) when (ex is IOException or UnauthorizedAccessException or InvalidDataException)
        {
            this.Publish(this.StatusOf(TelemetryConnectionState.Faulted, ex.Message));
            return false;
        }

        this._passStartedAt = this._elapsed();
        this._lastSeconds = 0;
        this._passHadFrame = false;
        this._due = null;
        if (!this.Status.IsLive)
        {
            this.Publish(this.StatusOf(TelemetryConnectionState.Connected, detail: null));
        }

        return true;
    }

    // Applies every event whose time has come. At the end of the file it starts over, once the
    // last event has had its moment, so the final frame is read before the first replaces it.
    private void Advance()
    {
        bool restarted = false;
        while (this._reader is not null)
        {
            double now = (this._elapsed() - this._passStartedAt).TotalSeconds;
            this._due ??= this._reader.ReadNext();
            if (this._due is null)
            {
                if (this._passHadFrame && now <= this._lastSeconds)
                {
                    return;
                }

                if (restarted || !this._passHadFrame)
                {
                    if (!this._passHadFrame)
                    {
                        this.Disconnect();
                        this.Publish(this.StatusOf(TelemetryConnectionState.Faulted, "The recording holds no frames."));
                    }

                    return;
                }

                this._reader.Dispose();
                this._reader = null;
                restarted = true;
                if (!this.StartPass())
                {
                    return;
                }

                continue;
            }

            if (this._due.Seconds > now)
            {
                return;
            }

            this.Apply(this._due);
            this._lastSeconds = this._due.Seconds;
            this._due = null;
        }
    }

    private void Apply(RecordedEvent recorded)
    {
        DateTimeOffset now = DateTimeOffset.UtcNow;
        switch (recorded)
        {
            case RecordedFrame { Frame: TelemetryFrame frame }:
                Volatile.Write(ref this._current, frame with { Timestamp = now });
                this.Publish(this.Status with { LastFrameAt = now });
                this._frameWaiting = true;
                this._passHadFrame = true;
                break;
            case RecordedStatus { Status: TelemetryStatus status }:
                this.Publish(status with { SourceName = this.Name, LastFrameAt = this.Status.LastFrameAt });
                break;
        }
    }

    private TelemetryStatus StatusOf(TelemetryConnectionState state, string? detail) =>
        this.Status with { State = state, SourceName = this.Name, Detail = detail };

    private void Publish(TelemetryStatus status) => Volatile.Write(ref this._status, status);
}

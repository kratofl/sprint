using System.Text.Json;
using Sprint.Desktop.Api.Telemetry;
using Sprint.Games.Recording;
using Xunit;

namespace Sprint.Desktop.Tests;

/// <summary>
/// Dev telemetry recording and replay: what <see cref="RecordingTelemetrySource"/> writes is
/// what <see cref="ReplayTelemetrySource"/> plays back, on the recorded timeline.
/// </summary>
public sealed class TelemetryRecordingTests : IDisposable
{
    private static readonly DateTimeOffset RecordedAt = new(2000, 1, 1, 0, 0, 0, TimeSpan.Zero);

    private readonly string _directory = Path.Combine(Path.GetTempPath(), "sprint-recording-" + Guid.NewGuid().ToString("N"));
    private TimeSpan _now = TimeSpan.Zero;

    public void Dispose()
    {
        if (Directory.Exists(this._directory))
        {
            Directory.Delete(this._directory, recursive: true);
        }
    }

    [Fact]
    public void Records_frames_and_link_changes_and_reads_them_back()
    {
        TelemetryFrame[] frames = [Frame("Spa", SessionType.Practice, 1), Frame("Spa", SessionType.Practice, 2)];
        ScriptedTelemetrySource game = new() { ReadFrame = n => n <= frames.Length ? frames[n - 1] : null };
        string file;
        using (RecordingTelemetrySource recorder = this.Recorder(game))
        {
            recorder.Connect();
            Assert.True(recorder.TryRead(out _));
            file = Assert.IsType<string>(recorder.CurrentFile);
            this._now = TimeSpan.FromSeconds(0.5);
            Assert.True(recorder.TryRead(out _));
            Assert.False(recorder.TryRead(out _));
            this._now = TimeSpan.FromSeconds(1);
            recorder.Disconnect();
        }

        using TelemetryRecordingReader reader = TelemetryRecordingReader.Open(file);
        List<RecordedEvent> events = ReadAll(reader);

        Assert.Equal("Scripted", reader.Header.Source);
        Assert.Collection(
            events,
            e => Assert.Equal(TelemetryConnectionState.Connected, Assert.IsType<RecordedStatus>(e).Status.State),
            e => AssertFrame(frames[0], 0, e),
            e => AssertFrame(frames[1], 0.5, e),
            e =>
            {
                RecordedStatus status = Assert.IsType<RecordedStatus>(e);
                Assert.Equal(TelemetryConnectionState.Disconnected, status.Status.State);
                Assert.Equal(1, status.Seconds);
            });
    }

    [Fact]
    public void Starts_a_new_file_when_the_session_changes()
    {
        TelemetryFrame[] frames =
        [
            Frame("Spa", SessionType.Practice, 1),
            Frame("", SessionType.Unknown, 0), // loading: stays with the open session
            Frame("Spa", SessionType.Practice, 2),
            Frame("Spa", SessionType.Race, 1),
        ];
        ScriptedTelemetrySource game = new() { ReadFrame = n => frames[n - 1] };
        using (RecordingTelemetrySource recorder = this.Recorder(game))
        {
            recorder.Connect();
            for (int i = 0; i < frames.Length; i++)
            {
                recorder.TryRead(out _);
            }
        }

        string[] files = Directory.GetFiles(this._directory).Order().ToArray();
        Assert.Equal(2, files.Length);
        Assert.Contains("-Spa-Practice", files[0]);
        Assert.Contains("-Spa-Race", files[1]);
        using TelemetryRecordingReader practice = TelemetryRecordingReader.Open(files[0]);
        Assert.Equal(3, ReadAll(practice).OfType<RecordedFrame>().Count());
    }

    [Fact]
    public void Replay_plays_each_frame_when_it_is_due_and_loops_at_the_end()
    {
        string file = this.WriteRecording(
            new RecordedStatus(0, new TelemetryStatus { State = TelemetryConnectionState.Connected }),
            new RecordedFrame(0, Frame("Spa", SessionType.Race, 1)),
            new RecordedFrame(1, Frame("Spa", SessionType.Race, 2)));
        using ReplayTelemetrySource replay = new(file, () => this._now);

        replay.Connect();
        Assert.True(replay.Status.IsLive);
        Assert.StartsWith("Replay", replay.Status.SourceName);
        Assert.Equal(1, ReadLap(replay));
        Assert.True(replay.Current.Timestamp > RecordedAt, "Frames are restamped so freshness reads them as live.");

        this._now = TimeSpan.FromSeconds(0.5);
        Assert.False(replay.TryRead(out _));

        this._now = TimeSpan.FromSeconds(1);
        Assert.Equal(2, ReadLap(replay));

        this._now = TimeSpan.FromSeconds(1.5);
        Assert.Equal(1, ReadLap(replay));
    }

    [Fact]
    public void Replay_reproduces_a_recorded_drop()
    {
        string file = this.WriteRecording(
            new RecordedStatus(0, new TelemetryStatus { State = TelemetryConnectionState.Connected }),
            new RecordedFrame(0, Frame("Spa", SessionType.Race, 1)),
            new RecordedStatus(1, new TelemetryStatus { State = TelemetryConnectionState.WaitingForGame }),
            new RecordedStatus(2, new TelemetryStatus { State = TelemetryConnectionState.Connected }),
            new RecordedFrame(2, Frame("Spa", SessionType.Race, 2)));
        using ReplayTelemetrySource replay = new(file, () => this._now);
        replay.Connect();
        replay.TryRead(out _);

        this._now = TimeSpan.FromSeconds(1);
        Assert.False(replay.TryRead(out _));
        Assert.Equal(TelemetryConnectionState.WaitingForGame, replay.Status.State);

        // The engine probes Connect while the link is down; the timeline moves on with it.
        this._now = TimeSpan.FromSeconds(2);
        replay.Connect();
        Assert.True(replay.Status.IsLive);
        Assert.Equal(2, ReadLap(replay));
    }

    [Fact]
    public void A_recording_cut_off_mid_write_reads_up_to_the_cut()
    {
        Directory.CreateDirectory(this._directory);
        string file = Path.Combine(this._directory, "cut" + TelemetryRecording.FileExtension);
        using (TelemetryRecordingWriter writer = TelemetryRecordingWriter.Create(file, Header()))
        {
            for (int lap = 1; lap <= 10; lap++)
            {
                writer.Write(new RecordedFrame(lap, Frame("Spa", SessionType.Race, lap)));
            }

            writer.Flush();
            for (int lap = 11; lap <= 20; lap++)
            {
                writer.Write(new RecordedFrame(lap, Frame("Spa", SessionType.Race, lap)));
            }
        }

        byte[] bytes = File.ReadAllBytes(file);
        File.WriteAllBytes(file, bytes[..^24]);

        using TelemetryRecordingReader reader = TelemetryRecordingReader.Open(file);
        List<RecordedEvent> events = ReadAll(reader);
        Assert.InRange(events.Count, 10, 19);
        Assert.Null(reader.ReadNext());
    }

    [Fact]
    public void Replaying_a_missing_file_faults_instead_of_throwing()
    {
        using ReplayTelemetrySource replay = new(Path.Combine(this._directory, "missing" + TelemetryRecording.FileExtension));

        replay.Connect();

        Assert.Equal(TelemetryConnectionState.Faulted, replay.Status.State);
        Assert.False(replay.TryRead(out _));
    }

    private RecordingTelemetrySource Recorder(ScriptedTelemetrySource game) =>
        new(game, this._directory, ex => throw new Xunit.Sdk.XunitException($"Recording failed: {ex}"), () => this._now);

    private string WriteRecording(params RecordedEvent[] events)
    {
        Directory.CreateDirectory(this._directory);
        string file = Path.Combine(this._directory, "replay" + TelemetryRecording.FileExtension);
        using TelemetryRecordingWriter writer = TelemetryRecordingWriter.Create(file, Header());
        foreach (RecordedEvent recorded in events)
        {
            writer.Write(recorded);
        }

        return file;
    }

    private static RecordingHeader Header() => new(TelemetryRecording.FormatVersion, "Test", RecordedAt);

    private static TelemetryFrame Frame(string track, SessionType session, int lap) => new()
    {
        Timestamp = RecordedAt,
        Session = new SessionInfo { Track = track, Car = "Porsche 963", SessionType = session },
        Lap = new LapState { CurrentLap = lap, LastLapSectorsSeconds = [31.2, 44.9, 29.7] },
        Car = new CarState { SpeedMetersPerSecond = 71.5f, Gear = 5, FuelLiters = 42.25f },
    };

    private static int ReadLap(ReplayTelemetrySource replay)
    {
        Assert.True(replay.TryRead(out TelemetryFrame frame));
        return frame.Lap.CurrentLap;
    }

    private static List<RecordedEvent> ReadAll(TelemetryRecordingReader reader)
    {
        List<RecordedEvent> events = [];
        for (RecordedEvent? next = reader.ReadNext(); next is not null; next = reader.ReadNext())
        {
            events.Add(next);
        }

        return events;
    }

    // Frames hold lists, which records compare by reference, so compare what was written.
    private static void AssertFrame(TelemetryFrame expected, double seconds, RecordedEvent actual)
    {
        RecordedFrame frame = Assert.IsType<RecordedFrame>(actual);
        Assert.Equal(seconds, frame.Seconds);
        Assert.Equal(JsonSerializer.Serialize(expected), JsonSerializer.Serialize(frame.Frame));
    }
}

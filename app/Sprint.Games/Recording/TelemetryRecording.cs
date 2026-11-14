using System.IO.Compression;
using System.Text;
using System.Text.Json;
using System.Text.Json.Serialization;
using Sprint.Desktop.Api.Telemetry;

namespace Sprint.Games.Recording;

/// <summary>The first line of a recording: what wrote it and when.</summary>
public sealed record RecordingHeader(int Format, string Source, DateTimeOffset StartedAt);

/// <summary>
/// One thing the telemetry link reported, <see cref="Seconds"/> after the recording started.
/// A recording holds every frame plus each change of link state, so a replay reproduces drops
/// (game paused, back to the menu) as well as driving.
/// </summary>
[JsonPolymorphic(TypeDiscriminatorPropertyName = "kind")]
[JsonDerivedType(typeof(RecordedFrame), "frame")]
[JsonDerivedType(typeof(RecordedStatus), "status")]
public abstract record RecordedEvent(double Seconds);

/// <summary>A frame the source read.</summary>
public sealed record RecordedFrame(double Seconds, TelemetryFrame Frame) : RecordedEvent(Seconds);

/// <summary>The link state changed.</summary>
public sealed record RecordedStatus(double Seconds, TelemetryStatus Status) : RecordedEvent(Seconds);

/// <summary>
/// The on-disk recording format: gzip-compressed JSON Lines, a <see cref="RecordingHeader"/>
/// line followed by one <see cref="RecordedEvent"/> per line. It stores the mapped
/// <see cref="TelemetryFrame"/>, not the game's raw memory (LMU's is ~325 KB per read), so a
/// recording only carries the fields the contract had when it was made.
/// </summary>
/// <remarks>
/// <see cref="TelemetryFrame.Field"/> is written only on the frames where it changed; every other
/// frame stores null there, and the reader puts the last field back. A field that disappears is
/// written as an empty one. Files from before the field existed simply read without one, and
/// readers from before it ignore the property, so the format did not need a new version.
/// </remarks>
public static class TelemetryRecording
{
    /// <summary>Bumped when a reader could no longer understand an older file.</summary>
    public const int FormatVersion = 1;

    public const string FileExtension = ".jsonl.gz";

    internal static JsonSerializerOptions Json { get; } = CreateJsonOptions();

    private static JsonSerializerOptions CreateJsonOptions()
    {
        JsonSerializerOptions options = new(JsonSerializerDefaults.Web)
        {
            // A frame that failed the adapter's validation can still carry NaN; record it as read.
            NumberHandling = JsonNumberHandling.AllowNamedFloatingPointLiterals,
        };
        options.Converters.Add(new JsonStringEnumConverter());
        return options;
    }
}

/// <summary>Appends events to one recording file. Not thread-safe; one writer per file.</summary>
public sealed class TelemetryRecordingWriter : IDisposable
{
    private readonly StreamWriter _writer;
    private readonly GZipStream _gzip;
    private IReadOnlyList<FieldCar>? _field;

    private TelemetryRecordingWriter(StreamWriter writer, GZipStream gzip)
    {
        this._writer = writer;
        this._gzip = gzip;
    }

    /// <summary>Creates <paramref name="path"/> (it must not exist) and writes the header.</summary>
    public static TelemetryRecordingWriter Create(string path, RecordingHeader header)
    {
        FileStream file = new(path, FileMode.CreateNew, FileAccess.Write, FileShare.Read);
        GZipStream gzip = new(file, CompressionLevel.Fastest);
        StreamWriter writer = new(gzip, new UTF8Encoding(encoderShouldEmitUTF8Identifier: false));
        writer.WriteLine(JsonSerializer.Serialize(header, TelemetryRecording.Json));
        return new TelemetryRecordingWriter(writer, gzip);
    }

    public void Write(RecordedEvent recorded)
    {
        RecordedEvent written = recorded is RecordedFrame frame ? this.WithFieldOnChange(frame) : recorded;
        // Serialized as the base type, so the "kind" discriminator is written.
        this._writer.WriteLine(JsonSerializer.Serialize(written, TelemetryRecording.Json));
    }

    // The field changes a few times a second and is most of a frame's size, so it is written
    // only when it differs from the last one written; the reader carries it forward.
    private RecordedFrame WithFieldOnChange(RecordedFrame recorded)
    {
        // Null on disk means "unchanged", so a field that disappears is written as empty.
        IReadOnlyList<FieldCar>? field = recorded.Frame.Field;
        if (field is null && this._field is not null)
        {
            field = [];
        }

        if (SameField(field, this._field))
        {
            return recorded with { Frame = recorded.Frame with { Field = null } };
        }

        this._field = field;
        return recorded with { Frame = recorded.Frame with { Field = field } };
    }

    private static bool SameField(IReadOnlyList<FieldCar>? field, IReadOnlyList<FieldCar>? last) =>
        ReferenceEquals(field, last)
        || (field is not null && last is not null && field.SequenceEqual(last));

    /// <summary>
    /// Pushes everything written so far to disk as a complete gzip block, so a process that is
    /// killed loses only what came after the last flush and the file stays readable up to it.
    /// </summary>
    public void Flush()
    {
        this._writer.Flush();
        this._gzip.Flush();
    }

    public void Dispose() => this._writer.Dispose();
}

/// <summary>Reads a recording front to back. A file cut off mid-write reads up to the cut.</summary>
public sealed class TelemetryRecordingReader : IDisposable
{
    private readonly StreamReader _reader;
    private IReadOnlyList<FieldCar>? _field;
    private bool _ended;

    private TelemetryRecordingReader(StreamReader reader, RecordingHeader header)
    {
        this._reader = reader;
        this.Header = header;
    }

    public RecordingHeader Header { get; }

    /// <summary>
    /// Opens <paramref name="path"/> and reads its header. Throws <see cref="IOException"/> when
    /// the file cannot be read and <see cref="InvalidDataException"/> when it is not a recording
    /// this version understands.
    /// </summary>
    public static TelemetryRecordingReader Open(string path)
    {
        FileStream file = new(path, FileMode.Open, FileAccess.Read, FileShare.ReadWrite);
        StreamReader reader = new(new GZipStream(file, CompressionMode.Decompress), Encoding.UTF8);
        try
        {
            RecordingHeader header = ParseHeader(reader.ReadLine());
            return new TelemetryRecordingReader(reader, header);
        }
        catch
        {
            reader.Dispose();
            throw;
        }
    }

    /// <summary>The next event, or null at the end of the recording.</summary>
    public RecordedEvent? ReadNext()
    {
        if (this._ended)
        {
            return null;
        }

        try
        {
            string? line = this._reader.ReadLine();
            if (line is not null)
            {
                RecordedEvent recorded = JsonSerializer.Deserialize<RecordedEvent>(line, TelemetryRecording.Json)
                    ?? throw new JsonException("Empty event line.");
                return recorded is RecordedFrame frame ? this.WithField(frame) : recorded;
            }
        }
        catch (Exception ex) when (ex is InvalidDataException or JsonException or EndOfStreamException)
        {
            // The writer was killed between flushes: the last block or line is incomplete.
            // Everything before it is intact, so the recording simply ends here.
        }

        this._ended = true;
        return null;
    }

    public void Dispose() => this._reader.Dispose();

    // A frame stores its field only when it changed; the rest get the last one back.
    private RecordedFrame WithField(RecordedFrame recorded)
    {
        if (recorded.Frame.Field is { } field)
        {
            this._field = field;
            return recorded;
        }

        return this._field is null ? recorded : recorded with { Frame = recorded.Frame with { Field = this._field } };
    }

    private static RecordingHeader ParseHeader(string? line)
    {
        RecordingHeader? header;
        try
        {
            header = line is null ? null : JsonSerializer.Deserialize<RecordingHeader>(line, TelemetryRecording.Json);
        }
        catch (JsonException ex)
        {
            throw new InvalidDataException("Not a Sprint telemetry recording.", ex);
        }

        if (header is null || header.Format != TelemetryRecording.FormatVersion)
        {
            throw new InvalidDataException(
                $"Not a Sprint telemetry recording of format {TelemetryRecording.FormatVersion}.");
        }

        return header;
    }
}

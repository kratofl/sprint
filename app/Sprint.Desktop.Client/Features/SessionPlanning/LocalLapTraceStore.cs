using System.IO.Compression;
using System.Text;
using Sprint.Desktop.Features.Diagnostics;

namespace Sprint.Desktop.Features.SessionPlanning;

/// <summary>
/// Desktop-local <see cref="ILapTraceStore"/>: one Deflate-compressed binary file per lap under
/// <c>%AppData%/Sprint/lap-traces/</c>.
/// <para>
/// Binary rather than JSON because this is the largest thing Sprint stores. A Le Mans lap is
/// ~6,800 samples across six channels; as indented JSON that is megabytes of decimal text for
/// numbers that occupy 24 bytes in their natural form. Deflate is in-box, so this costs no
/// dependency.
/// </para>
/// <para>
/// The layout is length-prefixed and channel names are written into the file, so a trace
/// carrying a channel this build has never heard of still round-trips. That is what makes the
/// named-and-versioned channel decision real rather than nominal.
/// </para>
/// </summary>
public sealed class LocalLapTraceStore : ILapTraceStore
{
    private const string Extension = ".trace";

    // Identifies the format in a hex dump, and rejects any other file that lands here.
    private static readonly byte[] Magic = "SPTR"u8.ToArray();

    private readonly string _root;
    private readonly ILog _log;

    public LocalLapTraceStore(string? dataRoot = null, ILog? log = null)
    {
        _root = dataRoot ?? Path.Combine(
            Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData),
            "Sprint",
            "lap-traces");
        _log = log ?? NullLog.Instance;
        Directory.CreateDirectory(_root);
    }

    public void Save(string traceId, LapChannelTrace trace)
    {
        ArgumentNullException.ThrowIfNull(trace);
        if (string.IsNullOrEmpty(traceId))
        {
            throw new ArgumentException(
                "A trace must have an id before it can be saved.",
                nameof(traceId));
        }

        try
        {
            using var file = File.Create(TracePath(traceId));
            using var deflate = new DeflateStream(file, CompressionLevel.Fastest);
            using var writer = new BinaryWriter(deflate, Encoding.UTF8, leaveOpen: true);

            writer.Write(Magic);
            writer.Write(trace.Version);
            writer.Write(trace.PositionStep);
            // NaN carries "the game never said" through a fixed-width field without a flag byte.
            writer.Write(trace.TrackLengthMeters ?? double.NaN);
            writer.Write(trace.SampleCount);
            writer.Write(trace.Channels.Count);

            foreach (var (name, values) in trace.Channels)
            {
                writer.Write(name);
                writer.Write(values.Length);
                foreach (var value in values)
                {
                    writer.Write(value);
                }
            }
        }
        catch (Exception ex) when (ex is IOException or UnauthorizedAccessException)
        {
            // Losing one lap's trace must never take the lap record with it.
            _log.Error($"Failed to persist lap trace '{traceId}'", ex);
        }
    }

    public LapChannelTrace? Load(string traceId)
    {
        var path = TracePath(traceId);
        if (!File.Exists(path))
        {
            return null;
        }

        try
        {
            using var file = File.OpenRead(path);
            using var deflate = new DeflateStream(file, CompressionMode.Decompress);
            using var reader = new BinaryReader(deflate, Encoding.UTF8, leaveOpen: true);

            if (!reader.ReadBytes(Magic.Length).AsSpan().SequenceEqual(Magic))
            {
                _log.Warn($"Ignoring lap trace '{traceId}': not a Sprint trace file");
                return null;
            }

            var trace = new LapChannelTrace { Version = reader.ReadInt32() };
            trace.PositionStep = reader.ReadDouble();
            var length = reader.ReadDouble();
            trace.TrackLengthMeters = double.IsNaN(length) ? null : length;
            _ = reader.ReadInt32(); // Sample count: each channel carries its own length.
            var channelCount = reader.ReadInt32();

            for (var i = 0; i < channelCount; i++)
            {
                var name = reader.ReadString();
                var count = reader.ReadInt32();
                var values = new float[count];
                for (var j = 0; j < count; j++)
                {
                    values[j] = reader.ReadSingle();
                }

                trace.Channels[name] = values;
            }

            return trace;
        }
        catch (Exception ex) when (ex is IOException or InvalidDataException or EndOfStreamException)
        {
            // One unreadable trace must not cost the driver every other lap they have driven.
            _log.Warn($"Ignoring unreadable lap trace at {path}", ex);
            return null;
        }
    }

    public void Delete(string traceId)
    {
        if (string.IsNullOrEmpty(traceId))
        {
            return;
        }

        try
        {
            var path = TracePath(traceId);
            if (File.Exists(path))
            {
                File.Delete(path);
            }
        }
        catch (Exception ex) when (ex is IOException or UnauthorizedAccessException)
        {
            _log.Warn($"Failed to delete lap trace '{traceId}'", ex);
        }
    }

    public IReadOnlyList<LapTraceInfo> List()
    {
        var traces = new List<LapTraceInfo>();
        foreach (var path in Directory.EnumerateFiles(_root, "*" + Extension))
        {
            var info = new FileInfo(path);
            traces.Add(new LapTraceInfo(
                Path.GetFileNameWithoutExtension(path),
                info.Length,
                new DateTimeOffset(info.LastWriteTimeUtc, TimeSpan.Zero)));
        }

        return traces;
    }

    /// <summary>
    /// Declared rather than inherited from the interface default: a default interface member is
    /// only reachable through the interface, so a caller holding a concrete store could not
    /// call it at all.
    /// </summary>
    public long TotalBytes() => List().Sum(info => info.SizeBytes);

    private string TracePath(string traceId) =>
        Path.Combine(_root, SafeFileName(traceId) + Extension);

    // Ids are derived from a session id, which could carry separators from an import or a sync.
    // '.' is replaced as well as the platform's invalid characters: it is legal in a file name,
    // so on its own it would still let ".." climb out of the trace directory.
    private static string SafeFileName(string traceId)
    {
        Span<char> buffer = stackalloc char[traceId.Length];
        for (var i = 0; i < traceId.Length; i++)
        {
            var c = traceId[i];
            var unsafeChar = c is '.' or '/' or '\\'
                || Array.IndexOf(Path.GetInvalidFileNameChars(), c) >= 0;
            buffer[i] = unsafeChar ? '_' : c;
        }

        return new string(buffer);
    }
}

using System.IO.Compression;
using System.Text;
using System.Text.Json;
using System.Text.Json.Serialization;
using Sprint.Desktop.Features.SessionPlanning;

namespace Sprint.Desktop.Features.Sharing;

/// <summary>Why a lap file could not be read. Distinct cases, because the fixes differ.</summary>
public enum SharedLapReadError
{
    None,

    /// <summary>Not a Sprint lap file at all.</summary>
    NotALapFile,

    /// <summary>Written by a newer Sprint than this one.</summary>
    UnsupportedVersion,

    /// <summary>Truncated or corrupt.</summary>
    Damaged,
}

/// <summary>The outcome of reading a lap file.</summary>
public sealed record SharedLapReadResult(SharedLap? Lap, SharedLapReadError Error)
{
    public bool Ok => Lap is not null;

    /// <summary>What to put in front of the driver. Names which of the failures it was.</summary>
    public string Message => Error switch
    {
        SharedLapReadError.None => "",
        SharedLapReadError.NotALapFile => "That is not a Sprint lap file.",
        SharedLapReadError.UnsupportedVersion =>
            "That lap file was written by a newer version of Sprint. Update Sprint and try again.",
        _ => "That lap file is damaged and could not be read.",
    };
}

/// <summary>
/// A lap as a single self-describing file (#198).
/// <para>
/// Not a stopgap for the cloud path: trading files is how sim communities already work, it
/// needs no account and no server, and the format falls out of the trace design almost free
/// (spec §2.7). Both paths ship.
/// </para>
/// <para>
/// Layout is magic, version, a length-prefixed JSON header, then
/// <see cref="LapTraceCodec"/>'s payload — all Deflate-compressed. JSON for the header because
/// it is small, inspectable and versionable; binary for the trace because it is neither.
/// </para>
/// </summary>
public static class SharedLapFile
{
    public const string Extension = ".sprintlap";

    /// <summary>Bumped only when the container changes. Adding a channel does not touch it.</summary>
    public const int FormatVersion = 1;

    private static readonly byte[] Magic = "SPLAP"u8.ToArray();

    private static readonly JsonSerializerOptions JsonOptions = new()
    {
        PropertyNameCaseInsensitive = true,
        Converters = { new JsonStringEnumConverter() },
    };

    /// <summary>A filename a driver will recognise in their downloads folder.</summary>
    public static string SuggestedFileName(SharedLap lap)
    {
        ArgumentNullException.ThrowIfNull(lap);

        var stem = $"{lap.Context.TrackCourse}-{lap.Context.CarModel}-lap{lap.LapNumber}";
        var safe = new StringBuilder(stem.Length);
        foreach (var c in stem)
        {
            safe.Append(Array.IndexOf(Path.GetInvalidFileNameChars(), c) >= 0 || c == ' ' ? '-' : c);
        }

        return safe.ToString() + Extension;
    }

    public static void Write(Stream stream, SharedLap lap)
    {
        ArgumentNullException.ThrowIfNull(stream);
        ArgumentNullException.ThrowIfNull(lap);

        using var deflate = new DeflateStream(stream, CompressionLevel.Optimal, leaveOpen: true);
        using var writer = new BinaryWriter(deflate, Encoding.UTF8, leaveOpen: true);

        writer.Write(Magic);
        writer.Write(FormatVersion);
        writer.Write(JsonSerializer.Serialize(new Header(lap), JsonOptions));
        writer.Flush();
        LapTraceCodec.Write(deflate, lap.Trace);
    }

    /// <summary>
    /// Reads a lap file. Never throws for bad input: a malformed file is a thing drivers hand
    /// each other, not an exceptional condition, and the caller has to be able to say which
    /// kind of malformed it was.
    /// </summary>
    public static SharedLapReadResult Read(Stream stream)
    {
        ArgumentNullException.ThrowIfNull(stream);

        try
        {
            using var deflate = new DeflateStream(stream, CompressionMode.Decompress, leaveOpen: true);
            using var reader = new BinaryReader(deflate, Encoding.UTF8, leaveOpen: true);

            if (!reader.ReadBytes(Magic.Length).AsSpan().SequenceEqual(Magic))
            {
                return new SharedLapReadResult(null, SharedLapReadError.NotALapFile);
            }

            var version = reader.ReadInt32();
            if (version > FormatVersion)
            {
                return new SharedLapReadResult(null, SharedLapReadError.UnsupportedVersion);
            }

            var header = JsonSerializer.Deserialize<Header>(reader.ReadString(), JsonOptions);
            if (header is null)
            {
                return new SharedLapReadResult(null, SharedLapReadError.Damaged);
            }

            var trace = LapTraceCodec.Read(deflate);
            return trace is null
                ? new SharedLapReadResult(null, SharedLapReadError.Damaged)
                : new SharedLapReadResult(header.ToLap(trace), SharedLapReadError.None);
        }
        catch (Exception ex) when (ex is EndOfStreamException or InvalidDataException or IOException or JsonException)
        {
            return new SharedLapReadResult(null, SharedLapReadError.Damaged);
        }
    }

    /// <summary>The JSON half of the container. A record so its shape is the file's shape.</summary>
    private sealed record Header
    {
        public Header()
        {
        }

        public Header(SharedLap lap)
        {
            Provenance = lap.Provenance;
            Context = lap.Context;
            LapNumber = lap.LapNumber;
            LapTimeSeconds = lap.LapTimeSeconds;
        }

        [JsonPropertyName("provenance")]
        public LapProvenance Provenance { get; init; } = new();

        [JsonPropertyName("context")]
        public LapHistoryContext Context { get; init; } = new();

        [JsonPropertyName("lapNumber")]
        public int LapNumber { get; init; }

        [JsonPropertyName("lapTimeSeconds")]
        public double LapTimeSeconds { get; init; }

        public SharedLap ToLap(LapChannelTrace trace) =>
            new(Provenance, Context, LapNumber, LapTimeSeconds, trace);
    }
}

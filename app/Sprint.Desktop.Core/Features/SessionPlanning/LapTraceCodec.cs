using System.Text;

namespace Sprint.Desktop.Features.SessionPlanning;

/// <summary>
/// The wire and disk form of a <see cref="LapChannelTrace"/> (#194).
/// <para>
/// One codec, three callers: the local trace store, the shareable lap file (#198), and the
/// cloud blob (#197) all carry the same bytes. Two implementations of this layout would drift,
/// and the drift would only ever show up on somebody else's machine.
/// </para>
/// <para>
/// The layout is length-prefixed and channel names are written into the payload, so a trace
/// carrying a channel this build has never heard of still round-trips whole. That is what makes
/// "named, versioned channels" real rather than nominal.
/// </para>
/// </summary>
public static class LapTraceCodec
{
    /// <summary>Identifies the payload in a hex dump and rejects anything else.</summary>
    private static readonly byte[] Magic = "SPTR"u8.ToArray();

    /// <summary>
    /// Writes the trace. Leaves <paramref name="stream"/> open, so a container format can put
    /// its own header in front of this.
    /// </summary>
    public static void Write(Stream stream, LapChannelTrace trace)
    {
        ArgumentNullException.ThrowIfNull(stream);
        ArgumentNullException.ThrowIfNull(trace);

        using var writer = new BinaryWriter(stream, Encoding.UTF8, leaveOpen: true);

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

    /// <summary>
    /// Reads a trace, or null when the payload is not one. Throws nothing a caller has to
    /// catch for malformed input — a corrupt trace is an expected outcome, not an exception.
    /// </summary>
    public static LapChannelTrace? Read(Stream stream)
    {
        ArgumentNullException.ThrowIfNull(stream);

        try
        {
            using var reader = new BinaryReader(stream, Encoding.UTF8, leaveOpen: true);

            if (!reader.ReadBytes(Magic.Length).AsSpan().SequenceEqual(Magic))
            {
                return null;
            }

            var trace = new LapChannelTrace { Version = reader.ReadInt32() };
            trace.PositionStep = reader.ReadDouble();
            var length = reader.ReadDouble();
            trace.TrackLengthMeters = double.IsNaN(length) ? null : length;
            _ = reader.ReadInt32(); // Sample count: each channel carries its own length.
            var channelCount = reader.ReadInt32();

            // A corrupt length prefix would otherwise ask for an arbitrary allocation before
            // anything has a chance to notice the file is nonsense.
            if (channelCount is < 0 or > 512)
            {
                return null;
            }

            for (var i = 0; i < channelCount; i++)
            {
                var name = reader.ReadString();
                var count = reader.ReadInt32();
                if (count is < 0 or > (LapChannelTrace.MaxSamples * 2))
                {
                    return null;
                }

                var values = new float[count];
                for (var j = 0; j < count; j++)
                {
                    values[j] = reader.ReadSingle();
                }

                trace.Channels[name] = values;
            }

            return trace;
        }
        catch (Exception ex) when (ex is EndOfStreamException or IOException or InvalidDataException)
        {
            return null;
        }
    }
}

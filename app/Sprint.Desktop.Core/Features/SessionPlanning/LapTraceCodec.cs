using System.Text;

namespace Sprint.Desktop.Features.SessionPlanning;

/// <summary>
/// The wire and disk form of a <see cref="LapChannelTrace"/> (#194).
/// <para>
/// One codec, two callers: the local trace store and the shareable lap file (#198) carry the
/// same bytes. Two implementations of this layout would drift, and the drift would only ever
/// show up on somebody else's machine.
/// </para>
/// <para>
/// The layout is length-prefixed and channel names are written into the payload, so a trace
/// carrying a channel this build has never heard of still round-trips whole. That is what makes
/// "named, versioned channels" real rather than nominal.
/// </para>
/// <para>
/// Both callers deflate the payload, so the layout's job is to give Deflate something it can
/// shrink, losslessly. Since layout 2 a channel that holds one value all lap (a flat tyre that
/// never came, a TC setting never touched — about a quarter of a car's channels) is written once,
/// and every other channel as the change from one sample to the next, byte planes apart: the
/// high bytes of neighbouring samples barely differ, so they deflate to almost nothing. That
/// stores a real lap in well under half the bytes of layout 1, which wrote raw floats; layout 1
/// still reads.
/// </para>
/// </summary>
public static class LapTraceCodec
{
    /// <summary>Identifies the payload in a hex dump and rejects anything else.</summary>
    private static readonly byte[] Magic = "SPTR"u8.ToArray();

    /// <summary>Layout 2's channel kinds: one value for every sample, or a value per sample.</summary>
    private const byte ConstantChannel = 0;
    private const byte SeriesChannel = 1;

    /// <summary>
    /// Writes the trace in the current layout. Leaves <paramref name="stream"/> open, so a
    /// container format can put its own header in front of this.
    /// </summary>
    public static void Write(Stream stream, LapChannelTrace trace)
    {
        ArgumentNullException.ThrowIfNull(stream);
        ArgumentNullException.ThrowIfNull(trace);

        using BinaryWriter writer = new BinaryWriter(stream, Encoding.UTF8, leaveOpen: true);

        writer.Write(Magic);
        // Always the current layout: a trace read from layout 1 is written back as this one.
        writer.Write(LapChannelTrace.FormatVersion);
        writer.Write(trace.PositionStep);
        // NaN carries "the game never said" through a fixed-width field without a flag byte.
        writer.Write(trace.TrackLengthMeters ?? double.NaN);
        writer.Write(trace.SampleCount);
        writer.Write(trace.Channels.Count);

        foreach ((string? name, float[]? values) in trace.Channels)
        {
            writer.Write(name);
            writer.Write(values.Length);
            if (IsConstant(values))
            {
                writer.Write(ConstantChannel);
                writer.Write(values[0]);
            }
            else
            {
                writer.Write(SeriesChannel);
                writer.Write(ToPlanes(values));
            }
        }
    }

    /// <summary>
    /// Reads a trace, or null when the payload is not one or uses a newer layout than this build
    /// knows. Throws nothing a caller has to
    /// catch for malformed input — a corrupt trace is an expected outcome, not an exception.
    /// </summary>
    public static LapChannelTrace? Read(Stream stream)
    {
        ArgumentNullException.ThrowIfNull(stream);

        try
        {
            using BinaryReader reader = new BinaryReader(stream, Encoding.UTF8, leaveOpen: true);

            if (!reader.ReadBytes(Magic.Length).AsSpan().SequenceEqual(Magic))
            {
                return null;
            }

            // A newer layout read as this one would be garbage that happens to parse. That is
            // the case after a rollback, or when a newer Sprint shared the lap.
            int version = reader.ReadInt32();
            if (version is < 1 or > LapChannelTrace.FormatVersion)
            {
                return null;
            }

            LapChannelTrace trace = new LapChannelTrace { Version = version };
            trace.PositionStep = reader.ReadDouble();
            double length = reader.ReadDouble();
            trace.TrackLengthMeters = double.IsNaN(length) ? null : length;
            _ = reader.ReadInt32(); // Sample count: each channel carries its own length.
            int channelCount = reader.ReadInt32();

            // A corrupt length prefix would otherwise ask for an arbitrary allocation before
            // anything has a chance to notice the file is nonsense.
            if (channelCount is < 0 or > 512)
            {
                return null;
            }

            for (int i = 0; i < channelCount; i++)
            {
                string name = reader.ReadString();
                int count = reader.ReadInt32();
                if (count is < 0 or > (LapChannelTrace.MaxSamples * 2))
                {
                    return null;
                }

                float[]? values = version == 1 ? ReadFloats(reader, count) : ReadChannel(reader, count);
                if (values is null)
                {
                    return null;
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

    /// <summary>Whether every sample carries the same value, bit for bit (so NaN counts too).</summary>
    private static bool IsConstant(float[] values)
    {
        if (values.Length == 0)
        {
            return false;
        }

        uint first = BitConverter.SingleToUInt32Bits(values[0]);
        foreach (float value in values)
        {
            if (BitConverter.SingleToUInt32Bits(value) != first)
            {
                return false;
            }
        }

        return true;
    }

    /// <summary>
    /// A series as layout 2 stores it: each sample's bits minus the previous sample's (wrapping,
    /// so it is exact for any float, NaN included), then all the low bytes, all the next bytes,
    /// and so on up to all the high bytes.
    /// </summary>
    private static byte[] ToPlanes(float[] values)
    {
        int count = values.Length;
        byte[] planes = new byte[count * sizeof(float)];
        uint previous = 0;
        for (int i = 0; i < count; i++)
        {
            uint bits = BitConverter.SingleToUInt32Bits(values[i]);
            uint delta = unchecked(bits - previous);
            previous = bits;
            for (int b = 0; b < sizeof(float); b++)
            {
                planes[(b * count) + i] = (byte)(delta >> (8 * b));
            }
        }

        return planes;
    }

    /// <summary>One layout 2 channel, or null when it is cut short or of a kind this build does not know.</summary>
    private static float[]? ReadChannel(BinaryReader reader, int count)
    {
        byte kind = reader.ReadByte();
        if (kind == ConstantChannel)
        {
            float[] constant = new float[count];
            Array.Fill(constant, reader.ReadSingle());
            return constant;
        }

        if (kind != SeriesChannel)
        {
            return null;
        }

        byte[] planes = reader.ReadBytes(count * sizeof(float));
        if (planes.Length != count * sizeof(float))
        {
            return null;
        }

        float[] values = new float[count];
        uint previous = 0;
        for (int i = 0; i < count; i++)
        {
            uint delta = 0;
            for (int b = 0; b < sizeof(float); b++)
            {
                delta |= (uint)planes[(b * count) + i] << (8 * b);
            }

            previous = unchecked(previous + delta);
            values[i] = BitConverter.UInt32BitsToSingle(previous);
        }

        return values;
    }

    /// <summary>One layout 1 channel: the samples as plain floats.</summary>
    private static float[] ReadFloats(BinaryReader reader, int count)
    {
        float[] values = new float[count];
        for (int j = 0; j < count; j++)
        {
            values[j] = reader.ReadSingle();
        }

        return values;
    }
}

using System.Buffers.Text;
using System.IO.Compression;

namespace Sprint.Desktop.Features.Peer;

/// <summary>
/// Sends a payload larger than one datagram as numbered <see cref="PeerBlobMessage"/> parts: the
/// bytes are deflated, base64url-encoded (no character JSON has to escape) and cut into
/// <see cref="PartChars"/>-character parts, so every sealed part stays under 1200 bytes.
/// <para>
/// A sender bumps <c>version</c> whenever the payload changes and may repeat a version to fill in
/// parts the network lost; <see cref="PeerBlobAssembler"/> keeps one version per kind and drops it
/// for any newer one.
/// </para>
/// </summary>
public static class PeerBlobs
{
    /// <summary>Characters of encoded payload per part; with the message's own JSON and the seal, a part is about 1050 bytes.</summary>
    public const int PartChars = 900;

    /// <summary>The most parts one version may have (about 600 KB deflated). A peer claiming more is refused.</summary>
    public const int MaxParts = 640;

    /// <summary>The most a payload may inflate to, so a hostile part set cannot exhaust memory.</summary>
    public const int MaxPayloadBytes = 8 * 1024 * 1024;

    /// <summary>The parts of <paramref name="payload"/> as version <paramref name="version"/> of <paramref name="kind"/>; empty when it would need more than <see cref="MaxParts"/>.</summary>
    public static IReadOnlyList<PeerBlobMessage> Split(string kind, long version, ReadOnlySpan<byte> payload)
    {
        using MemoryStream deflated = new();
        using (DeflateStream deflate = new(deflated, CompressionLevel.Fastest, leaveOpen: true))
            deflate.Write(payload);

        string encoded = Base64Url.EncodeToString(deflated.GetBuffer().AsSpan(0, (int)deflated.Length));
        int count = Math.Max(1, (encoded.Length + PartChars - 1) / PartChars);
        if (count > MaxParts)
            return [];

        PeerBlobMessage[] parts = new PeerBlobMessage[count];
        for (int index = 0; index < count; index++)
        {
            int start = index * PartChars;
            parts[index] = new PeerBlobMessage(kind, version, index, count, encoded.Substring(start, Math.Min(PartChars, encoded.Length - start)));
        }

        return parts;
    }

    /// <summary>The payload the joined parts carry, or null when they do not decode or inflate past <see cref="MaxPayloadBytes"/>.</summary>
    public static byte[]? Join(IEnumerable<string> parts)
    {
        try
        {
            byte[] deflated = Base64Url.DecodeFromChars(string.Concat(parts));
            using DeflateStream inflate = new(new MemoryStream(deflated), CompressionMode.Decompress);
            using MemoryStream payload = new();
            byte[] buffer = new byte[16 * 1024];
            int read;
            while ((read = inflate.Read(buffer)) > 0)
            {
                if (payload.Length + read > MaxPayloadBytes)
                    return null;
                payload.Write(buffer, 0, read);
            }

            return payload.ToArray();
        }
        catch (Exception ex) when (ex is FormatException or InvalidDataException)
        {
            return null;
        }
    }
}

/// <summary>
/// Puts <see cref="PeerBlobMessage"/> parts back together on the receiving side: one version per
/// kind at a time. A part of a newer version drops the one being collected (it is stale now); a
/// part of an older version, or of a version already completed, is ignored. Worker-thread only.
/// </summary>
public sealed class PeerBlobAssembler
{
    /// <summary>The kinds a driver sends; anything else is dropped before it takes any memory.</summary>
    public static IReadOnlySet<string> Kinds { get; } = new HashSet<string>(StringComparer.Ordinal) { "board", "plan", "target" };

    private readonly Dictionary<string, Pending> _kinds = new(StringComparer.Ordinal);

    /// <summary>Takes one part; returns the payload when this part completed its version, else null.</summary>
    public byte[]? Accept(PeerBlobMessage part)
    {
        if (part.Count is < 1 or > PeerBlobs.MaxParts || part.Index < 0 || part.Index >= part.Count || part.Kind is null || !Kinds.Contains(part.Kind))
            return null;

        if (!this._kinds.TryGetValue(part.Kind, out Pending? pending) || part.Version > pending.Version)
        {
            pending = new Pending(part.Version, part.Count);
            this._kinds[part.Kind] = pending;
        }

        if (part.Version < pending.Version || pending.Done || pending.Parts.Length != part.Count || pending.Parts[part.Index] is not null)
            return null;

        pending.Parts[part.Index] = part.Part ?? "";
        pending.Received++;
        if (pending.Received < pending.Parts.Length)
            return null;

        pending.Done = true;
        return PeerBlobs.Join(pending.Parts.Select(text => text ?? ""));
    }

    private sealed class Pending(long version, int count)
    {
        public long Version { get; } = version;

        public string?[] Parts { get; } = new string?[count];

        public int Received { get; set; }

        public bool Done { get; set; }
    }
}

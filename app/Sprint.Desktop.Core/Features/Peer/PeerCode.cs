using System.Buffers.Binary;
using System.Buffers.Text;
using System.Net;
using System.Net.Sockets;

namespace Sprint.Desktop.Features.Peer;

/// <summary>Which half of the handshake a code is: the driver's invite or the engineer's reply.</summary>
public enum PeerCodeKind : byte
{
    Invite = 1,
    Reply = 2,
}

/// <summary>
/// A code the two people paste to each other (Discord, a message) to set up a live link without a
/// server: the link it belongs to, the sender's public key and where the sender can be reached.
/// Whoever holds both codes can talk to both PCs, so the codes are the link's only credential.
/// <para>
/// Text form: <c>SPRINT-INVITE-</c> or <c>SPRINT-REPLY-</c>, then base64url of version 1,
/// the kind, the 8-byte link id, the 64-byte P-256 public key (X then Y), a candidate count and
/// per candidate its family (4 or 6), address and port (big-endian).
/// </para>
/// </summary>
public sealed record PeerCode(PeerCodeKind Kind, ulong LinkId, byte[] PublicKey, IReadOnlyList<IPEndPoint> Candidates)
{
    public const int PublicKeyLength = 64;
    public const int MaxCandidates = 8;

    private const byte Version = 1;
    private const string InvitePrefix = "SPRINT-INVITE-";
    private const string ReplyPrefix = "SPRINT-REPLY-";

    public override string ToString()
    {
        using MemoryStream bytes = new();
        bytes.WriteByte(Version);
        bytes.WriteByte((byte)this.Kind);
        Span<byte> id = stackalloc byte[8];
        BinaryPrimitives.WriteUInt64BigEndian(id, this.LinkId);
        bytes.Write(id);
        bytes.Write(this.PublicKey);
        IReadOnlyList<IPEndPoint> candidates = this.Candidates.Take(MaxCandidates).ToList();
        bytes.WriteByte((byte)candidates.Count);
        Span<byte> port = stackalloc byte[2];
        foreach (IPEndPoint candidate in candidates)
        {
            bytes.WriteByte(candidate.AddressFamily == AddressFamily.InterNetworkV6 ? (byte)6 : (byte)4);
            bytes.Write(candidate.Address.GetAddressBytes());
            BinaryPrimitives.WriteUInt16BigEndian(port, (ushort)candidate.Port);
            bytes.Write(port);
        }

        string prefix = this.Kind == PeerCodeKind.Invite ? InvitePrefix : ReplyPrefix;
        return prefix + Base64Url.EncodeToString(bytes.ToArray());
    }

    /// <summary>
    /// Reads a pasted code. Whitespace anywhere is ignored (chat apps wrap long words); anything
    /// else malformed fails with a message fit to show next to the paste field.
    /// </summary>
    public static bool TryParse(string? text, out PeerCode? code, out string error)
    {
        code = null;
        string compact = string.Concat((text ?? "").Where(character => !char.IsWhiteSpace(character)));
        PeerCodeKind kind;
        string body;
        if (compact.StartsWith(InvitePrefix, StringComparison.OrdinalIgnoreCase))
        {
            kind = PeerCodeKind.Invite;
            body = compact[InvitePrefix.Length..];
        }
        else if (compact.StartsWith(ReplyPrefix, StringComparison.OrdinalIgnoreCase))
        {
            kind = PeerCodeKind.Reply;
            body = compact[ReplyPrefix.Length..];
        }
        else
        {
            error = "That is not a Sprint link code. Codes start with SPRINT-INVITE- or SPRINT-REPLY-.";
            return false;
        }

        error = "The code is incomplete. Copy the whole code and paste it again.";
        byte[] bytes;
        try
        {
            bytes = Base64Url.DecodeFromChars(body);
        }
        catch (FormatException)
        {
            return false;
        }

        ReadOnlySpan<byte> rest = bytes;
        if (rest.Length < 2 + 8 + PublicKeyLength + 1)
            return false;
        if (rest[0] != Version)
        {
            error = "This code comes from a different version of Sprint. Both of you need the same version.";
            return false;
        }

        if (rest[1] != (byte)kind)
            return false;

        ulong linkId = BinaryPrimitives.ReadUInt64BigEndian(rest[2..]);
        byte[] publicKey = rest.Slice(10, PublicKeyLength).ToArray();
        if (!PeerKeys.IsValidPublicKey(publicKey))
            return false;
        rest = rest[(10 + PublicKeyLength)..];
        int count = rest[0];
        rest = rest[1..];
        if (count > MaxCandidates)
            return false;

        List<IPEndPoint> candidates = [];
        for (int index = 0; index < count; index++)
        {
            int addressLength = rest.IsEmpty ? 0 : rest[0] switch { 4 => 4, 6 => 16, _ => 0 };
            if (addressLength == 0 || rest.Length < 1 + addressLength + 2)
                return false;
            IPAddress address = new(rest.Slice(1, addressLength));
            int port = BinaryPrimitives.ReadUInt16BigEndian(rest[(1 + addressLength)..]);
            if (port == 0)
                return false;
            candidates.Add(new IPEndPoint(address, port));
            rest = rest[(1 + addressLength + 2)..];
        }

        if (!rest.IsEmpty)
            return false;

        code = new PeerCode(kind, linkId, publicKey, candidates);
        error = "";
        return true;
    }
}

using System.Buffers.Binary;
using System.Security.Cryptography;
using System.Text;

namespace Sprint.Desktop.Features.Peer;

/// <summary>Which side of a live link this PC is.</summary>
public enum PeerRole
{
    /// <summary>Drives and shares telemetry; creates the invite.</summary>
    Driver,

    /// <summary>Watches the driver's telemetry; answers the invite with a reply.</summary>
    Engineer,
}

/// <summary>
/// This PC's key pair for one link: ephemeral P-256, made when the link starts and dropped with
/// it. The public half travels in the pasted code; the private half never leaves the process.
/// </summary>
public sealed class PeerKeys : IDisposable
{
    private readonly ECDiffieHellman _key = ECDiffieHellman.Create(ECCurve.NamedCurves.nistP256);

    /// <summary>The public key as the code carries it: X then Y, 32 bytes each.</summary>
    public byte[] PublicKey
    {
        get
        {
            ECPoint q = this._key.ExportParameters(includePrivateParameters: false).Q;
            if (q.X is not { Length: 32 } x || q.Y is not { Length: 32 } y)
                throw new CryptographicException("The platform exported a P-256 public key of an unexpected shape.");
            return [.. x, .. y];
        }
    }

    /// <summary>Whether <paramref name="publicKey"/> is a point on P-256, so a pasted code with a damaged key fails at the paste.</summary>
    public static bool IsValidPublicKey(byte[] publicKey)
    {
        try
        {
            using ECDiffieHellman peer = Import(publicKey);
            return true;
        }
        catch (CryptographicException)
        {
            return false;
        }
    }

    /// <summary>
    /// The link's channel with the peer behind <paramref name="peerPublicKey"/>. Both sides arrive
    /// at the same two keys: ECDH, hashed, then HKDF with the link id as salt, one key per direction.
    /// </summary>
    public PeerChannel Agree(byte[] peerPublicKey, ulong linkId, PeerRole role)
    {
        using ECDiffieHellman peer = Import(peerPublicKey);
        byte[] shared = this._key.DeriveKeyFromHash(peer.PublicKey, HashAlgorithmName.SHA256);
        byte[] salt = new byte[8];
        BinaryPrimitives.WriteUInt64BigEndian(salt, linkId);
        byte[] fromDriver = HKDF.DeriveKey(HashAlgorithmName.SHA256, shared, 32, salt, Encoding.ASCII.GetBytes("sprint link driver"));
        byte[] fromEngineer = HKDF.DeriveKey(HashAlgorithmName.SHA256, shared, 32, salt, Encoding.ASCII.GetBytes("sprint link engineer"));
        CryptographicOperations.ZeroMemory(shared);
        return role == PeerRole.Driver ? new PeerChannel(fromDriver, fromEngineer) : new PeerChannel(fromEngineer, fromDriver);
    }

    public void Dispose() => this._key.Dispose();

    private static ECDiffieHellman Import(byte[] publicKey)
    {
        if (publicKey.Length != PeerCode.PublicKeyLength)
            throw new CryptographicException("A public key is 64 bytes.");

        return ECDiffieHellman.Create(new ECParameters
        {
            Curve = ECCurve.NamedCurves.nistP256,
            Q = new ECPoint { X = publicKey[..32], Y = publicKey[32..] },
        });
    }
}

/// <summary>
/// Seals and opens the link's datagrams with AES-256-GCM. A packet is a marker byte, an 8-byte
/// counter (big-endian, also the nonce) and the ciphertext with its 16-byte tag; the first nine
/// bytes are authenticated too. Each direction has its own key, so the counters never share a nonce.
/// <para>
/// Only packets newer than every packet opened so far are accepted: a replay or a late,
/// reordered packet is dropped. For a stream where only the latest sample matters that costs nothing.
/// </para>
/// Used by the link's worker only; not thread-safe.
/// </summary>
public sealed class PeerChannel : IDisposable
{
    /// <summary>Overhead of a sealed packet over its plaintext.</summary>
    public const int Overhead = HeaderLength + TagLength;

    private const byte Marker = 0xA5;
    private const int HeaderLength = 9;
    private const int TagLength = 16;

    private readonly AesGcm _send;
    private readonly AesGcm _receive;
    private ulong _sent;
    private ulong _newest;

    public PeerChannel(byte[] sendKey, byte[] receiveKey)
    {
        this._send = new AesGcm(sendKey, TagLength);
        this._receive = new AesGcm(receiveKey, TagLength);
        CryptographicOperations.ZeroMemory(sendKey);
        CryptographicOperations.ZeroMemory(receiveKey);
    }

    /// <summary>Whether a datagram is shaped like a link packet (STUN answers share the socket).</summary>
    public static bool IsPacket(ReadOnlySpan<byte> datagram) => datagram.Length >= Overhead && datagram[0] == Marker;

    public byte[] Seal(ReadOnlySpan<byte> plaintext)
    {
        byte[] packet = new byte[Overhead + plaintext.Length];
        packet[0] = Marker;
        BinaryPrimitives.WriteUInt64BigEndian(packet.AsSpan(1, 8), ++this._sent);
        this._send.Encrypt(
            Nonce(this._sent),
            plaintext,
            packet.AsSpan(HeaderLength, plaintext.Length),
            packet.AsSpan(HeaderLength + plaintext.Length, TagLength),
            packet.AsSpan(0, HeaderLength));
        return packet;
    }

    /// <summary>Opens a packet sealed by the peer; false when it is forged, damaged, replayed or older than the newest one.</summary>
    public bool TryOpen(ReadOnlySpan<byte> packet, out byte[] plaintext, out ulong counter)
    {
        plaintext = [];
        counter = 0;
        if (!IsPacket(packet))
            return false;

        ulong received = BinaryPrimitives.ReadUInt64BigEndian(packet.Slice(1, 8));
        if (received <= this._newest)
            return false;

        byte[] opened = new byte[packet.Length - Overhead];
        try
        {
            this._receive.Decrypt(
                Nonce(received),
                packet.Slice(HeaderLength, opened.Length),
                packet[^TagLength..],
                opened,
                packet[..HeaderLength]);
        }
        catch (AuthenticationTagMismatchException)
        {
            return false;
        }

        this._newest = received;
        plaintext = opened;
        counter = received;
        return true;
    }

    public void Dispose()
    {
        this._send.Dispose();
        this._receive.Dispose();
    }

    private static byte[] Nonce(ulong counter)
    {
        byte[] nonce = new byte[12];
        BinaryPrimitives.WriteUInt64BigEndian(nonce.AsSpan(4), counter);
        return nonce;
    }
}

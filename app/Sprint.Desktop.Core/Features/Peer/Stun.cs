using System.Buffers.Binary;
using System.Net;
using System.Security.Cryptography;

namespace Sprint.Desktop.Features.Peer;

/// <summary>
/// The one STUN exchange the link needs (RFC 5389 Binding): "what address and port do you see me
/// at?". Asked from the link's own socket, so the answer is the router's mapping for that socket,
/// the address the other PC has to send to.
/// </summary>
public static class Stun
{
    private const ushort BindingRequestType = 0x0001;
    private const ushort BindingSuccessType = 0x0101;
    private const ushort MappedAddress = 0x0001;
    private const ushort XorMappedAddress = 0x0020;
    private const uint MagicCookie = 0x2112A442;
    private const int HeaderLength = 20;

    /// <summary>A Binding request and its transaction id, which the answer must echo.</summary>
    public static byte[] BindingRequest(out byte[] transactionId)
    {
        transactionId = RandomNumberGenerator.GetBytes(12);
        byte[] request = new byte[HeaderLength];
        BinaryPrimitives.WriteUInt16BigEndian(request, BindingRequestType);
        BinaryPrimitives.WriteUInt32BigEndian(request.AsSpan(4), MagicCookie);
        transactionId.CopyTo(request, 8);
        return request;
    }

    /// <summary>Whether a datagram is a STUN message (the first two bits are zero and the cookie is in place).</summary>
    public static bool IsMessage(ReadOnlySpan<byte> datagram) =>
        datagram.Length >= HeaderLength
        && (datagram[0] & 0xC0) == 0
        && BinaryPrimitives.ReadUInt32BigEndian(datagram[4..]) == MagicCookie;

    /// <summary>The transaction id of a STUN message; call after <see cref="IsMessage"/>.</summary>
    public static ReadOnlySpan<byte> TransactionId(ReadOnlySpan<byte> message) => message.Slice(8, 12);

    /// <summary>Reads the mapped address from a Binding success answer. Anything malformed is false, never an exception.</summary>
    public static bool TryParseBindingSuccess(ReadOnlySpan<byte> datagram, out IPEndPoint? mapped)
    {
        mapped = null;
        if (!IsMessage(datagram) || BinaryPrimitives.ReadUInt16BigEndian(datagram) != BindingSuccessType)
            return false;

        int length = BinaryPrimitives.ReadUInt16BigEndian(datagram[2..]);
        if (HeaderLength + length > datagram.Length)
            return false;

        ReadOnlySpan<byte> transactionId = TransactionId(datagram);
        ReadOnlySpan<byte> attributes = datagram.Slice(HeaderLength, length);
        IPEndPoint? plain = null;
        while (attributes.Length >= 4)
        {
            ushort type = BinaryPrimitives.ReadUInt16BigEndian(attributes);
            int valueLength = BinaryPrimitives.ReadUInt16BigEndian(attributes[2..]);
            if (4 + valueLength > attributes.Length)
                return false;

            ReadOnlySpan<byte> value = attributes.Slice(4, valueLength);
            if (type == XorMappedAddress && TryReadAddress(value, transactionId, xor: true, out IPEndPoint? xored))
            {
                mapped = xored;
                return true;
            }

            if (type == MappedAddress && TryReadAddress(value, transactionId, xor: false, out IPEndPoint? address))
                plain = address;

            // Values are padded to a multiple of four bytes.
            int padded = 4 + ((valueLength + 3) & ~3);
            attributes = attributes[Math.Min(padded, attributes.Length)..];
        }

        mapped = plain;
        return plain is not null;
    }

    private static bool TryReadAddress(ReadOnlySpan<byte> value, ReadOnlySpan<byte> transactionId, bool xor, out IPEndPoint? endpoint)
    {
        endpoint = null;
        int addressLength = value.Length >= 4 ? value[1] switch { 0x01 => 4, 0x02 => 16, _ => 0 } : 0;
        if (addressLength == 0 || value.Length < 4 + addressLength)
            return false;

        int port = BinaryPrimitives.ReadUInt16BigEndian(value[2..]);
        byte[] address = value.Slice(4, addressLength).ToArray();
        if (xor)
        {
            port ^= (int)(MagicCookie >> 16);
            Span<byte> mask = stackalloc byte[16];
            BinaryPrimitives.WriteUInt32BigEndian(mask, MagicCookie);
            transactionId.CopyTo(mask[4..]);
            for (int index = 0; index < address.Length; index++)
                address[index] ^= mask[index];
        }

        if (port == 0)
            return false;
        endpoint = new IPEndPoint(new IPAddress(address), port);
        return true;
    }
}

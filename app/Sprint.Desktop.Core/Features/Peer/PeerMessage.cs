using System.Text.Json;
using System.Text.Json.Serialization;
using Sprint.Contracts;
using Sprint.Desktop.Features.Sharing;

namespace Sprint.Desktop.Features.Peer;

/// <summary>
/// What the two PCs say to each other inside the sealed packets, one message per datagram. JSON
/// names are the contract between two desktops, which may run different builds.
/// <para>
/// Serialize as <see cref="PeerMessage"/> (the base type) so the <c>type</c> discriminator is written.
/// </para>
/// </summary>
[JsonPolymorphic(TypeDiscriminatorPropertyName = "type")]
[JsonDerivedType(typeof(PeerPing), "ping")]
[JsonDerivedType(typeof(PeerPong), "pong")]
[JsonDerivedType(typeof(PeerSessionMessage), "session")]
[JsonDerivedType(typeof(PeerSampleMessage), "sample")]
[JsonDerivedType(typeof(PeerBye), "bye")]
public abstract record PeerMessage
{
    private static readonly JsonSerializerOptions Options = new(JsonSerializerDefaults.Web);

    public static byte[] Serialize(PeerMessage message) => JsonSerializer.SerializeToUtf8Bytes(message, Options);

    /// <summary>Reads a message the peer sealed. The peer runs code we do not control, so a bad one is null, not an exception.</summary>
    public static PeerMessage? Deserialize(ReadOnlySpan<byte> json)
    {
        try
        {
            return JsonSerializer.Deserialize<PeerMessage>(json, Options);
        }
        catch (Exception ex) when (ex is JsonException or NotSupportedException)
        {
            return null;
        }
    }
}

/// <summary>Probe while connecting, keepalive once connected. <c>sent</c> (Unix ms) comes back in the pong, for the round trip.</summary>
public sealed record PeerPing(long Sent) : PeerMessage;

/// <summary>Answers a ping. <c>held</c> is how many ms the ping waited on this side before the answer, which the round trip leaves out.</summary>
public sealed record PeerPong(long Sent, long Held) : PeerMessage;

/// <summary>Driver to engineer, every second: the session being driven, or null while not on track.</summary>
public sealed record PeerSessionMessage(LiveTarget? Session) : PeerMessage;

/// <summary>Driver to engineer: one telemetry sample, at up to 20 a second.</summary>
public sealed record PeerSampleMessage(LiveSample Sample) : PeerMessage;

/// <summary>The sender closed the link.</summary>
public sealed record PeerBye : PeerMessage;

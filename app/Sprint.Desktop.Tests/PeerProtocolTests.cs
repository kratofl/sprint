using System.Net;
using Sprint.Contracts;
using Sprint.Desktop.Features.Peer;
using Xunit;

namespace Sprint.Desktop.Tests;

/// <summary>The live link's wire pieces: the pasted codes, the sealed packets and the STUN answer.</summary>
public sealed class PeerProtocolTests
{
    private static readonly IPEndPoint Public = IPEndPoint.Parse("203.0.113.7:51820");
    private static readonly IPEndPoint Lan = IPEndPoint.Parse("192.168.1.20:51820");
    private static readonly IPEndPoint V6 = IPEndPoint.Parse("[2001:db8::7]:51820");

    [Fact]
    public void ACodeSurvivesBeingPastedThroughAChatThatWrapsIt()
    {
        using PeerKeys keys = new();
        PeerCode invite = new(PeerCodeKind.Invite, 0xFEEDBEEF12345678, keys.PublicKey, [Public, V6, Lan]);
        string text = invite.ToString();
        string wrapped = string.Join("\n ", text.Chunk(40).Select(chunk => new string(chunk)));

        Assert.True(PeerCode.TryParse(wrapped, out PeerCode? parsed, out _));
        Assert.NotNull(parsed);
        Assert.StartsWith("SPRINT-INVITE-", text, StringComparison.Ordinal);
        Assert.Equal(PeerCodeKind.Invite, parsed.Kind);
        Assert.Equal(invite.LinkId, parsed.LinkId);
        Assert.Equal(invite.PublicKey, parsed.PublicKey);
        Assert.Equal([Public, V6, Lan], parsed.Candidates);
    }

    [Theory]
    [InlineData("", "not a Sprint link code")]
    [InlineData("hello there", "not a Sprint link code")]
    [InlineData("SPRINT-INVITE-AAAA", "incomplete")]
    [InlineData("SPRINT-REPLY-!!!", "incomplete")]
    public void AMangledCodeIsRefusedWithAReasonToShow(string text, string reason)
    {
        Assert.False(PeerCode.TryParse(text, out PeerCode? code, out string error));
        Assert.Null(code);
        Assert.Contains(reason, error, StringComparison.Ordinal);
    }

    [Fact]
    public void ACutOffCodeIsRefused()
    {
        using PeerKeys keys = new();
        string text = new PeerCode(PeerCodeKind.Reply, 1, keys.PublicKey, [Public]).ToString();

        Assert.False(PeerCode.TryParse(text[..^4], out _, out string error));
        Assert.Contains("incomplete", error, StringComparison.Ordinal);
    }

    [Fact]
    public void BothSidesOfALinkDeriveTheSameKeysAndOnlyThem()
    {
        using PeerKeys driverKeys = new();
        using PeerKeys engineerKeys = new();
        using PeerKeys strangerKeys = new();
        using PeerChannel driver = driverKeys.Agree(engineerKeys.PublicKey, 42, PeerRole.Driver);
        using PeerChannel engineer = engineerKeys.Agree(driverKeys.PublicKey, 42, PeerRole.Engineer);
        using PeerChannel stranger = strangerKeys.Agree(driverKeys.PublicKey, 42, PeerRole.Engineer);

        byte[] packet = driver.Seal("lap 7"u8);

        Assert.False(stranger.TryOpen(packet, out _, out _));
        Assert.True(engineer.TryOpen(packet, out byte[] opened, out ulong counter));
        Assert.Equal("lap 7"u8.ToArray(), opened);
        Assert.Equal(1UL, counter);
        // The engineer's own direction uses the other key.
        Assert.False(driver.TryOpen(packet, out _, out _));
    }

    [Fact]
    public void ATamperedReplayedOrOlderPacketIsDropped()
    {
        using PeerKeys driverKeys = new();
        using PeerKeys engineerKeys = new();
        using PeerChannel driver = driverKeys.Agree(engineerKeys.PublicKey, 42, PeerRole.Driver);
        using PeerChannel engineer = engineerKeys.Agree(driverKeys.PublicKey, 42, PeerRole.Engineer);
        byte[] first = driver.Seal("one"u8);
        byte[] second = driver.Seal("two"u8);
        byte[] tampered = (byte[])second.Clone();
        tampered[^1] ^= 1;

        Assert.False(engineer.TryOpen(tampered, out _, out _));
        Assert.True(engineer.TryOpen(second, out _, out _));
        Assert.False(engineer.TryOpen(second, out _, out _));
        Assert.False(engineer.TryOpen(first, out _, out _));
    }

    [Fact]
    public void TheMappedAddressIsReadFromTheRfc5769SampleAnswer()
    {
        // RFC 5769 section 2.2: a Binding success with SOFTWARE, XOR-MAPPED-ADDRESS,
        // MESSAGE-INTEGRITY and FINGERPRINT. Mapped address 192.0.2.1:32853.
        byte[] answer = Convert.FromHexString(
            "0101003c2112a442b7e7a701bc34d686fa87dfae" +
            "8022000b7465737420766563746f7220" +
            "00200008" + "0001a147e112a643" +
            "000800142b91f599fd9e90c38c7489f92af9ba53f06be7d7" +
            "80280004c07d4c96");

        Assert.True(Stun.IsMessage(answer));
        Assert.True(Stun.TryParseBindingSuccess(answer, out IPEndPoint? mapped));
        Assert.Equal(IPEndPoint.Parse("192.0.2.1:32853"), mapped);
    }

    [Fact]
    public void ASealedSampleFitsInOneDatagramOnAnyPath()
    {
        // 1200 bytes clears the smallest common path MTU with tunnels and IPv6 headers, so a
        // sample is never fragmented (one lost fragment loses the whole sample).
        LiveSample busiest = new()
        {
            Timestamp = long.MaxValue, Lap = 999, Sector = 3, CurrentLapTime = -123456.789012, LastLapTime = -123456.789012,
            BestLapTime = -123456.789012, Delta = -123456.789012, Position = 99, SpeedKph = -123456.789012, Rpm = -123456.789012,
            MaxRpm = -123456.789012, Gear = -1, Throttle = -0.123456789012, Brake = -0.123456789012, Steering = -0.123456789012,
            Fuel = -123456.789012, TrackPosition = -0.123456789012, TyreTempFl = -123456.789012, TyreTempFr = -123456.789012,
            TyreTempRl = -123456.789012, TyreTempRr = -123456.789012, TyreWearFl = -123456.789012, TyreWearFr = -123456.789012,
            TyreWearRl = -123456.789012, TyreWearRr = -123456.789012,
        };

        int size = PeerMessage.Serialize(new PeerSampleMessage(busiest)).Length + PeerChannel.Overhead;

        Assert.True(size <= 1200, $"{size} bytes");
    }

    [Fact]
    public void LinkPacketsAndStunMessagesAreToldApart()
    {
        using PeerKeys keys = new();
        using PeerKeys other = new();
        using PeerChannel channel = keys.Agree(other.PublicKey, 1, PeerRole.Driver);
        byte[] request = Stun.BindingRequest(out _);
        byte[] packet = channel.Seal("{}"u8);

        Assert.True(Stun.IsMessage(request));
        Assert.False(PeerChannel.IsPacket(request));
        Assert.True(PeerChannel.IsPacket(packet));
        Assert.False(Stun.IsMessage(packet));
    }
}

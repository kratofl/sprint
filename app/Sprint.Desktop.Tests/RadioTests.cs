using Sprint.Desktop.Features.Peer;
using Xunit;

namespace Sprint.Desktop.Tests;

/// <summary>The engineer's radio apart from the link: what is sent again, what shows on the wheel and what a press marks seen.</summary>
public sealed class RadioTests
{
    private static readonly DateTimeOffset T0 = new(2026, 11, 15, 14, 0, 0, TimeSpan.Zero);

    [Fact]
    public void AMessageIsSentAgainUntilItsEndIsKnownOrTheEngineerGivesUp()
    {
        RadioOutbox outbox = new();
        RadioSent box = outbox.Add("Box now", null, T0);
        Assert.Single(outbox.Due(T0));
        Assert.Empty(outbox.Due(T0 + TimeSpan.FromMilliseconds(100)));
        Assert.Single(outbox.Due(T0 + RadioRules.Resend));

        outbox.Answer(box.Id, RadioDelivery.OnWheel);
        Assert.Single(outbox.Due(T0 + (RadioRules.Resend * 2)));
        outbox.Answer(box.Id, RadioDelivery.Seen);
        outbox.Answer(box.Id, RadioDelivery.OnWheel);
        Assert.Equal(RadioDelivery.Seen, Assert.Single(outbox.Sent).Delivery);
        Assert.Empty(outbox.Due(T0 + (RadioRules.Resend * 3)));

        outbox.Add("Push", null, T0);
        Assert.Empty(outbox.Due(T0 + RadioRules.GiveUp + TimeSpan.FromSeconds(1)));
    }

    [Fact]
    public void TheNewestMessageShowsUntilAPressOrItsTimeIsUpAndAPressMarksTheOlderOnesSeenToo()
    {
        RadioInbox inbox = new();
        Assert.Equal(RadioDelivery.OnWheel, inbox.Receive(1, "Save fuel", null, T0));
        Assert.Equal(RadioDelivery.OnWheel, inbox.Receive(2, "Box now", null, T0 + TimeSpan.FromSeconds(1)));
        Assert.Equal("Box now", inbox.Showing(T0 + TimeSpan.FromSeconds(2))?.Text);
        Assert.Equal(RadioDelivery.Unanswered, inbox.Receive(1, "Save fuel", null, T0 + TimeSpan.FromSeconds(2)));

        Assert.Equal([2L, 1L], inbox.Acknowledge(T0 + TimeSpan.FromSeconds(3)));
        Assert.Null(inbox.Showing(T0 + TimeSpan.FromSeconds(3)));
        Assert.Equal(RadioDelivery.Seen, inbox.Receive(1, "Save fuel", null, T0 + TimeSpan.FromSeconds(4)));
        Assert.Empty(inbox.Acknowledge(T0 + TimeSpan.FromSeconds(4)));

        inbox.Receive(3, "Push", null, T0 + TimeSpan.FromSeconds(10));
        Assert.Null(inbox.Showing(T0 + TimeSpan.FromSeconds(10) + RadioRules.OnWheel));
        Assert.Empty(inbox.Acknowledge(T0 + TimeSpan.FromSeconds(10) + RadioRules.OnWheel));
    }

    [Fact]
    public void WhatArrivesIsCheckedLikeWhatIsSentAndTheNewestTargetCounts()
    {
        RadioInbox inbox = new();
        Assert.Null(inbox.Receive(1, "two\nlines", null, T0));
        Assert.Null(inbox.Receive(2, "Target", double.NaN, T0));
        Assert.Empty(inbox.Received);

        inbox.Receive(3, "Target lap 2:05.0", 125.0, T0);
        inbox.Receive(4, "Push", null, T0);
        Assert.Equal(125.0, inbox.TargetLapSeconds);
        inbox.Receive(5, "Target lap 2:04.5", 124.5, T0);
        Assert.Equal(124.5, inbox.TargetLapSeconds);
    }

    [Theory]
    [InlineData(124.5, "2:04.5")]
    [InlineData(59.96, "1:00.0")]
    [InlineData(58.34, "58.3")]
    public void ALapTimeReadsTheWayTheRadioWritesIt(double seconds, string expected) => Assert.Equal(expected, RadioRules.FormatLap(seconds));
}

using System.Globalization;
using System.Text.Json.Serialization;

namespace Sprint.Desktop.Features.Peer;

/// <summary>What became of a radio message the engineer sent. Crosses to the renderer by name.</summary>
[JsonConverter(typeof(JsonStringEnumConverter<RadioDelivery>))]
public enum RadioDelivery
{
    /// <summary>Not confirmed by the driver's PC yet; it is sent again until it is.</summary>
    Sending,

    /// <summary>On the driver's wheel now.</summary>
    OnWheel,

    /// <summary>The driver pressed a wheel button while it showed.</summary>
    Seen,

    /// <summary>It left the wheel without a press.</summary>
    Unanswered,
}

/// <summary>A message the engineer sent, as the pit wall lists it. <c>TargetLapSeconds</c> is set when it gave the driver a new target lap.</summary>
public sealed record RadioSent(long Id, string Text, double? TargetLapSeconds, DateTimeOffset SentAt, RadioDelivery Delivery);

/// <summary>A message from the engineer, as the driver's PC holds it.</summary>
public sealed record RadioReceived(long Id, string Text, double? TargetLapSeconds, DateTimeOffset ReceivedAt, bool Seen);

/// <summary>
/// The radio's share of <see cref="PeerLinkState"/>. The engineer's side fills <see cref="Sent"/>
/// and <see cref="CanSend"/>; the driver's side the rest.
/// </summary>
public sealed record PeerRadioState
{
    public static readonly PeerRadioState Empty = new();

    /// <summary>Engineer: what was sent this link, newest first.</summary>
    public IReadOnlyList<RadioSent> Sent { get; init; } = [];

    /// <summary>Engineer: whether the driver's Sprint understands the radio (it runs this build's link level or newer).</summary>
    public bool CanSend { get; init; }

    /// <summary>Driver: what arrived this link, newest first.</summary>
    public IReadOnlyList<RadioReceived> Received { get; init; } = [];

    /// <summary>Driver: the message on the wheel right now, or null.</summary>
    public RadioReceived? Showing { get; init; }

    /// <summary>Driver: the newest target lap the engineer gave, or null. It replaces the plan's target lap from the next line.</summary>
    public double? TargetLapSeconds { get; init; }
}

/// <summary>The radio's limits and timings, apart from any socket or clock.</summary>
public static class RadioRules
{
    public const int MaxText = 48;
    public const double MinTargetLap = 20;
    public const double MaxTargetLap = 3600;

    /// <summary>How many messages each side keeps for its lists.</summary>
    public const int Kept = 20;

    /// <summary>How often the engineer sends a message again until the driver's PC says how it ended.</summary>
    public static readonly TimeSpan Resend = TimeSpan.FromMilliseconds(500);

    /// <summary>After this the engineer stops sending a message the driver's PC never answered.</summary>
    public static readonly TimeSpan GiveUp = TimeSpan.FromMinutes(2);

    /// <summary>How long a message stays on the wheel without a button press.</summary>
    public static readonly TimeSpan OnWheel = TimeSpan.FromSeconds(15);

    /// <summary>
    /// The text as it is sent and shown: trimmed, one line, at most <see cref="MaxText"/> characters.
    /// The driver's PC runs this on what arrives too, since the peer runs code we do not control.
    /// </summary>
    public static bool TryText(string? raw, out string text, out string error)
    {
        text = raw?.Trim() ?? "";
        if (text.Length == 0)
        {
            error = "A message needs some text.";
            return false;
        }

        if (text.Length > MaxText)
        {
            error = $"A message is at most {MaxText} characters.";
            return false;
        }

        if (text.Any(char.IsControl))
        {
            error = "A message is one line of text.";
            return false;
        }

        error = "";
        return true;
    }

    /// <summary>A target lap a driver can be given: a finite time between <see cref="MinTargetLap"/> and <see cref="MaxTargetLap"/> seconds.</summary>
    public static bool IsTargetLap(double seconds) => double.IsFinite(seconds) && seconds is >= MinTargetLap and <= MaxTargetLap;

    /// <summary>A lap time as the radio writes it: 2:04.5, or 58.3 under a minute.</summary>
    public static string FormatLap(double seconds)
    {
        double tenths = Math.Round(seconds * 10) / 10;
        int minutes = (int)(tenths / 60);
        double rest = tenths - (minutes * 60);
        return minutes > 0
            ? string.Create(CultureInfo.InvariantCulture, $"{minutes}:{rest:00.0}")
            : rest.ToString("0.0", CultureInfo.InvariantCulture);
    }
}

/// <summary>
/// The engineer's side of the radio: what was sent and what became of it. A message is sent
/// again every <see cref="RadioRules.Resend"/> until the driver's PC says it was seen or left the
/// wheel unanswered, or <see cref="RadioRules.GiveUp"/> passes. Each answer to a resend carries
/// the message's state, so a lost answer costs only a moment. Not thread-safe: the link's worker owns it.
/// </summary>
public sealed class RadioOutbox
{
    private readonly List<RadioSent> _sent = [];
    private readonly Dictionary<long, DateTimeOffset> _lastSent = [];
    private long _nextId;

    /// <summary>Newest first.</summary>
    public IReadOnlyList<RadioSent> Sent => this._sent;

    public RadioSent Add(string text, double? targetLapSeconds, DateTimeOffset now)
    {
        RadioSent sent = new(++this._nextId, text, targetLapSeconds, now, RadioDelivery.Sending);
        this._sent.Insert(0, sent);
        if (this._sent.Count > RadioRules.Kept)
        {
            this._lastSent.Remove(this._sent[^1].Id);
            this._sent.RemoveAt(this._sent.Count - 1);
        }

        return sent;
    }

    /// <summary>The messages to send now: unfinished, not given up, and not sent within <see cref="RadioRules.Resend"/>.</summary>
    public IReadOnlyList<RadioSent> Due(DateTimeOffset now)
    {
        List<RadioSent> due = [];
        foreach (RadioSent sent in this._sent)
        {
            if (sent.Delivery is RadioDelivery.Seen or RadioDelivery.Unanswered || now - sent.SentAt > RadioRules.GiveUp)
                continue;
            if (this._lastSent.TryGetValue(sent.Id, out DateTimeOffset last) && now - last < RadioRules.Resend)
                continue;
            this._lastSent[sent.Id] = now;
            due.Add(sent);
        }

        return due;
    }

    /// <summary>The driver's PC says how a message stands. A state never goes back (a late "on the wheel" after "seen" is ignored).</summary>
    public void Answer(long id, RadioDelivery delivery)
    {
        int index = this._sent.FindIndex(sent => sent.Id == id);
        if (index < 0 || delivery == RadioDelivery.Sending)
            return;
        RadioSent sent = this._sent[index];
        if (sent.Delivery is RadioDelivery.Seen or RadioDelivery.Unanswered || (sent.Delivery == RadioDelivery.OnWheel && delivery == RadioDelivery.OnWheel))
            return;
        this._sent[index] = sent with { Delivery = delivery };
    }
}

/// <summary>
/// The driver's side of the radio. The newest unseen message shows on the wheel for
/// <see cref="RadioRules.OnWheel"/>; a wheel button press while it shows marks it, and any older
/// unseen ones, seen. Not thread-safe: the link's worker owns it.
/// </summary>
public sealed class RadioInbox
{
    private readonly List<RadioReceived> _received = [];

    /// <summary>Newest first.</summary>
    public IReadOnlyList<RadioReceived> Received => this._received;

    /// <summary>The newest target lap the engineer gave, or null.</summary>
    public double? TargetLapSeconds => this._received.FirstOrDefault(message => message.TargetLapSeconds is not null)?.TargetLapSeconds;

    /// <summary>
    /// A message as it arrived (a resend of one already here changes nothing). Returns how it stands,
    /// for the answer; null when it is not one to take (bad text or target), which is not answered.
    /// </summary>
    public RadioDelivery? Receive(long id, string? text, double? targetLapSeconds, DateTimeOffset now)
    {
        if (this._received.Find(message => message.Id == id) is { } known)
            return this.StateOf(known, now);
        if (!RadioRules.TryText(text, out string clean, out _) || (targetLapSeconds is { } target && !RadioRules.IsTargetLap(target)))
            return null;

        RadioReceived received = new(id, clean, targetLapSeconds, now, Seen: false);
        this._received.Insert(0, received);
        if (this._received.Count > RadioRules.Kept)
            this._received.RemoveAt(this._received.Count - 1);
        return this.StateOf(received, now);
    }

    /// <summary>The message on the wheel at <paramref name="now"/>: the newest, while unseen and within <see cref="RadioRules.OnWheel"/>.</summary>
    public RadioReceived? Showing(DateTimeOffset now) =>
        this._received.Count > 0 && this._received[0] is { Seen: false } newest && now - newest.ReceivedAt < RadioRules.OnWheel ? newest : null;

    /// <summary>A wheel button pressed: the message showing and every older unseen one become seen. Returns their ids; empty when none showed.</summary>
    public IReadOnlyList<long> Acknowledge(DateTimeOffset now)
    {
        if (this.Showing(now) is null)
            return [];
        List<long> seen = [];
        for (int index = 0; index < this._received.Count; index++)
        {
            RadioReceived message = this._received[index];
            if (message.Seen || now - message.ReceivedAt >= RadioRules.OnWheel)
                continue;
            this._received[index] = message with { Seen = true };
            seen.Add(message.Id);
        }

        return seen;
    }

    private RadioDelivery StateOf(RadioReceived message, DateTimeOffset now) =>
        message.Seen ? RadioDelivery.Seen
        : ReferenceEquals(this.Showing(now), message) ? RadioDelivery.OnWheel
        : RadioDelivery.Unanswered;
}

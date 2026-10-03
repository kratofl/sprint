using System.Globalization;
using Sprint.Desktop.Features.SessionPlanning;

namespace Sprint.Desktop.Features.Analysis;

/// <summary>
/// One lap as the Analysis view lists it: enough to choose between laps without loading a
/// single trace off disk.
/// </summary>
public sealed record CorpusLap(
    string SessionId,
    int LapNumber,
    string Label,
    string Detail,
    double LapTimeSeconds,
    LapTargetTier Tier,
    LapHistoryContext Context,
    DateTimeOffset? SessionStartedAt,
    string? SharedFrom)
{
    /// <summary>Where this lap's channels live, when it has any.</summary>
    public string TraceId => LapTraceId.For(SessionId, LapNumber);

    /// <summary>Whether this lap can be overlaid channel by channel, or only named.</summary>
    public bool HasChannels => Tier == LapTargetTier.FullTrace;

    /// <summary>Why a lap cannot be overlaid, in the driver's words. Null when it can.</summary>
    public string? UnavailableReason => Tier switch
    {
        LapTargetTier.FullTrace => null,
        LapTargetTier.ReferenceCurve => "No channels — recorded before traces, or pruned to stay inside the disk budget.",
        _ => "Lap time only — imported laps carry no shape.",
    };
}

/// <summary>
/// Reads the lap-history corpus for the Analysis view and the Live Compare target picker
/// (#196). Avalonia-free, so "which laps can I compare" is a unit test.
/// <para>
/// Sessions in, laps out. <see cref="LapCorpusFilter"/> narrows the sessions; this only knows
/// how to read them.
/// </para>
/// <para>
/// Laps that cannot be overlaid are listed anyway, carrying their tier and the reason. Hiding
/// them would read as "that lap is gone", which is a different and false claim — the lap is
/// there, it is its channels that are not.
/// </para>
/// </summary>
public sealed class LapCorpusBrowser
{
    private readonly ILapHistoryStore _history;
    private readonly ILapTraceStore _traces;

    public LapCorpusBrowser(ILapHistoryStore history, ILapTraceStore traces)
    {
        _history = history ?? throw new ArgumentNullException(nameof(history));
        _traces = traces ?? throw new ArgumentNullException(nameof(traces));
    }

    /// <summary>
    /// Every session that holds at least one valid lap, for the picker to narrow down. Sessions
    /// rather than (track, car) buckets: a driver looks for "the run I did yesterday evening",
    /// and a bucket spanning months of them cannot be asked that question.
    /// </summary>
    public IReadOnlyList<CorpusSession> Sessions()
    {
        List<CorpusSession> sessions = [];
        IReadOnlyList<LapHistorySession> stored = this._history.LoadAll();
        foreach (LapHistorySession session in stored)
        {
            // Older builds could import the XML copy of a session Sprint had already recorded.
            // Keep both files, but list only the richer recorded session in Analysis.
            if (LapHistoryImportService.HasRecordedEquivalent(session, stored))
            {
                continue;
            }

            List<LapHistoryRecord> valid = session.Laps
                .Where(lap => Usable(session, lap, stored))
                .ToList();
            if (valid.Count == 0)
            {
                continue;
            }

            sessions.Add(new CorpusSession(
                session.Id,
                session.Context,
                session.Kind,
                session.Origin,
                session.StartedAt,
                valid.Count,
                valid.Count(lap => lap.HasChannelTrace),
                valid.Min(lap => lap.LapTimeSeconds),
                session.SharedFrom));
        }

        return [.. sessions.OrderByDescending(session => session.StartedAt)];
    }

    /// <summary>
    /// Every valid lap in one session, fastest first. Invalid laps are left out: a lap set by
    /// cutting a corner is not something to shape a braking zone against.
    /// </summary>
    public IReadOnlyList<CorpusLap> Laps(CorpusSession? session)
    {
        if (session is null)
        {
            return [];
        }

        IReadOnlyList<LapHistorySession> all = this._history.LoadAll();
        LapHistorySession? stored = all
            .FirstOrDefault(candidate => string.Equals(candidate.Id, session.Id, StringComparison.Ordinal));

        return stored is null
            ? []
            : [.. stored.Laps
                .Where(lap => Usable(stored, lap, all))
                .Select(lap => Describe(stored, lap))
                .OrderBy(lap => lap.LapTimeSeconds)];
    }

    private static bool Usable(
        LapHistorySession session,
        LapHistoryRecord lap,
        IReadOnlyList<LapHistorySession> stored) =>
        lap.LapTimeSeconds > 0
        && (lap.IsValid || LapHistoryImportService.HasImportedEquivalent(session, lap, stored));

    /// <summary>
    /// The lap's channels, or null when there is no lap, it has none, or they could not be
    /// read. Null in, null out: "nothing is selected" is a normal state on this page, not a
    /// caller error.
    /// </summary>
    public LapChannelTrace? Trace(CorpusLap? lap) =>
        lap is { HasChannels: true } ? _traces.Load(lap.TraceId) : null;

    /// <summary>
    /// The channels both laps carry. A comparison can only honestly draw a channel that exists
    /// on both sides; the caller states the difference rather than drawing one line alone in a
    /// panel titled as a comparison.
    /// </summary>
    public static IReadOnlyList<string> SharedChannels(LapChannelTrace? left, LapChannelTrace? right)
    {
        if (left is null)
        {
            return right is null ? [] : [.. right.Channels.Keys.Order(StringComparer.Ordinal)];
        }

        if (right is null)
        {
            return [.. left.Channels.Keys.Order(StringComparer.Ordinal)];
        }

        return [.. left.Channels.Keys.Where(right.Channels.ContainsKey).Order(StringComparer.Ordinal)];
    }

    private static CorpusLap Describe(LapHistorySession session, LapHistoryRecord lap)
    {
        var tier = (lap.HasReferenceCurve, lap.HasChannelTrace) switch
        {
            (true, true) => LapTargetTier.FullTrace,
            (true, false) => LapTargetTier.ReferenceCurve,
            _ => LapTargetTier.TimeOnly,
        };

        var when = session.StartedAt.ToLocalTime().ToString("HH:mm", CultureInfo.InvariantCulture);
        var origin = session.SharedFrom is { Length: > 0 } from
            ? $"Shared by {from}"
            : session.Kind.ToString();

        return new CorpusLap(
            session.Id,
            lap.LapNumber,
            $"Lap {lap.LapNumber} · {PlanTargetResolver.FormatLapTime(lap.LapTimeSeconds)}",
            $"{origin} · {when}",
            lap.LapTimeSeconds,
            tier,
            session.Context,
            session.StartedAt,
            session.SharedFrom);
    }
}

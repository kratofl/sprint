using Sprint.Desktop.Features.Diagnostics;
using Sprint.Desktop.Features.SessionPlanning;

namespace Sprint.Desktop.Features.Sharing;

/// <summary>What happened when a shared lap was offered to the corpus.</summary>
/// <param name="SessionId">The history session it became, existing or new.</param>
public sealed record SharedLapImportResult(bool Added, bool AlreadyPresent, string SessionId)
{
    public static SharedLapImportResult Duplicate(string sessionId) => new(false, true, sessionId);
}

/// <summary>
/// The one path a lap from somebody else takes into the corpus (#197, #198).
/// <para>
/// A file import and a cloud fetch share it rather than each filing their own session: the two
/// produce the same thing, and two writers would be two chances to record provenance
/// differently for the same lap.
/// </para>
/// <para>
/// A shared lap becomes its own single-lap history session with
/// <see cref="LapHistoryOrigin.Shared"/>, so every existing corpus reader — statistics, the
/// target resolver, the Analysis browser — handles it without learning a new concept, while
/// its provenance stays attached (spec §2.7).
/// </para>
/// </summary>
public sealed class SharedLapImporter
{
    private readonly ILapHistoryStore _history;
    private readonly ILapTraceStore _traces;
    private readonly Func<DateTimeOffset> _clock;
    private readonly ILog _log;

    public SharedLapImporter(
        ILapHistoryStore history,
        ILapTraceStore traces,
        Func<DateTimeOffset>? clock = null,
        ILog? log = null)
    {
        _history = history ?? throw new ArgumentNullException(nameof(history));
        _traces = traces ?? throw new ArgumentNullException(nameof(traces));
        _clock = clock ?? (() => DateTimeOffset.UtcNow);
        _log = log ?? NullLog.Instance;
    }

    /// <summary>
    /// Files the lap, or reports that it is already here. Importing the same lap twice must not
    /// duplicate it — the same lap legitimately arrives as a file from one friend and by code
    /// from another.
    /// </summary>
    public SharedLapImportResult Import(SharedLap lap)
    {
        ArgumentNullException.ThrowIfNull(lap);

        var fingerprint = lap.Fingerprint;
        if (_history.LoadAll().FirstOrDefault(session =>
                string.Equals(session.SharedFingerprint, fingerprint, StringComparison.Ordinal))
            is { } existing)
        {
            return SharedLapImportResult.Duplicate(existing.Id);
        }

        var sessionId = $"shared-{fingerprint}";
        var traceId = LapTraceId.For(sessionId, lap.LapNumber);

        // The trace goes down first. A record pointing at a trace that is not there yet would
        // advertise a tier the store cannot deliver — the lie the corpus works to avoid — and
        // the reverse (an orphan trace) is something retention already cleans up.
        _traces.Save(traceId, lap.Trace);

        var session = new LapHistorySession
        {
            Id = sessionId,
            Context = lap.Context,
            // Practice is the honest guess: nothing about a shared lap says which session it
            // came from, and Unknown would drop it out of every scope the planner offers.
            Kind = HistorySessionKind.Practice,
            Origin = LapHistoryOrigin.Shared,
            StartedAt = lap.Provenance.DrivenAt ?? lap.Provenance.SharedAt,
            EndedAt = lap.Provenance.DrivenAt ?? lap.Provenance.SharedAt,
            SharedFrom = lap.Attribution,
            SharedAt = _clock(),
            ShareCode = lap.Provenance.ShareCode,
            SharedFingerprint = fingerprint,
            Laps =
            [
                new LapHistoryRecord
                {
                    LapNumber = lap.LapNumber,
                    IsValid = true,
                    LapTimeSeconds = lap.LapTimeSeconds,
                    TraceId = traceId,
                    // Regenerated from the trace's own elapsed-time channel, so a shared lap can
                    // drive a position-accurate delta exactly like one of the driver's own. This
                    // is why elapsed time is a stored channel at all (spec §2.1).
                    ReferenceCurve = CurveFrom(lap.Trace),
                },
            ],
        };

        _history.Save(session);
        _log.Info($"Imported a shared lap from {lap.Attribution} at {lap.Context.TrackCourse}");
        return new SharedLapImportResult(true, false, sessionId);
    }

    /// <summary>
    /// The position→time curve implied by the trace's elapsed-time channel. Null when the trace
    /// does not carry one, which leaves the lap at the channel tier without a delta rather than
    /// inventing times nobody drove.
    /// </summary>
    private static LapReferenceCurve? CurveFrom(LapChannelTrace trace)
    {
        if (!trace.TryGetChannel(LapTraceChannels.ElapsedSeconds, out var elapsed) || elapsed.Length < 2)
        {
            return null;
        }

        var count = (int)Math.Round(1.0 / LapReferenceCurve.PositionStepDefault) + 1;
        var times = new List<double>(count);
        for (var i = 0; i < count; i++)
        {
            var position = i * LapReferenceCurve.PositionStepDefault;
            times.Add(Math.Round(trace.ValueAt(LapTraceChannels.ElapsedSeconds, position) ?? 0, 3));
        }

        return new LapReferenceCurve
        {
            PositionStep = LapReferenceCurve.PositionStepDefault,
            TimesSeconds = times,
        };
    }
}

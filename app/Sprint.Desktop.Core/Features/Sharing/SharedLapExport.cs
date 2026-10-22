using Sprint.Desktop.Features.SessionPlanning;

namespace Sprint.Desktop.Features.Sharing;

/// <summary>A lap ready to write to a file, or why it cannot be shared.</summary>
/// <param name="HasPositions">Whether it carries world positions, so it can be somebody's driving guide.</param>
public sealed record SharedLapExportResult(SharedLap? Lap, string? Error, bool HasPositions);

/// <summary>
/// Turns a lap in the corpus into a <see cref="SharedLap"/> (#198), the export half of the lap
/// file. Only a lap with channels can go: a time on its own tells the receiver nothing they
/// could drive against.
/// </summary>
public static class SharedLapExport
{
    /// <param name="driverName">Who to credit for the driver's own laps. A lap that was itself shared keeps its original driver.</param>
    public static SharedLapExportResult Build(
        ILapHistoryStore history,
        ILapTraceStore traces,
        string sessionId,
        int lapNumber,
        string driverName,
        DateTimeOffset now)
    {
        ArgumentNullException.ThrowIfNull(history);
        ArgumentNullException.ThrowIfNull(traces);

        LapHistorySession? session = history.LoadAll()
            .FirstOrDefault(candidate => string.Equals(candidate.Id, sessionId, StringComparison.Ordinal));
        LapHistoryRecord? record = session?.Laps.FirstOrDefault(lap => lap.LapNumber == lapNumber);
        if (session is null || record is null)
        {
            return new SharedLapExportResult(null, "That lap is no longer in your history.", false);
        }

        if (record.TraceId is not { } traceId || traces.Load(traceId) is not { IsUsable: true } trace)
        {
            return new SharedLapExportResult(null, "This lap has only a time, no channels, so there is nothing to share.", false);
        }

        bool shared = session.Origin == LapHistoryOrigin.Shared;
        SharedLap lap = new(
            new LapProvenance
            {
                SourceKind = SharedLapSources.File,
                SharedBy = shared ? session.SharedFrom : NameOrNull(driverName),
                DrivenAt = session.StartedAt == default ? null : session.StartedAt,
                SharedAt = now,
            },
            session.Context,
            record.LapNumber,
            record.LapTimeSeconds,
            trace);
        return new SharedLapExportResult(lap, null, trace.TryGetChannel(LapTraceChannels.WorldX, out float[] _));
    }

    private static string? NameOrNull(string name) => string.IsNullOrWhiteSpace(name) ? null : name.Trim();
}

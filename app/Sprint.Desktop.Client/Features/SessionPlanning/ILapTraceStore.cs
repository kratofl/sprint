namespace Sprint.Desktop.Features.SessionPlanning;

/// <summary>What retention needs to know about a stored trace without reading it.</summary>
public readonly record struct LapTraceInfo(string TraceId, long SizeBytes, DateTimeOffset WrittenAt);

/// <summary>The id under which a lap's trace is filed.</summary>
public static class LapTraceId
{
    /// <summary>
    /// Derived from the owning session and lap rather than generated, so a lap and its trace
    /// can always find each other — including after a crash between the two writes.
    /// </summary>
    public static string For(string sessionId, int lapNumber) => $"{sessionId}-{lapNumber}";
}

/// <summary>
/// Persistence boundary for per-lap channel traces (#194). Deliberately separate from
/// <see cref="ILapHistoryStore"/>: a history session is a small document rewritten on every lap
/// crossing, while a trace is a large immutable blob written once and usually never read.
/// Storing traces inside the session document would make each crossing rewrite every trace the
/// session had already produced.
/// <para>
/// There is deliberately no empty implementation mirroring <see cref="EmptyLapHistoryStore"/>.
/// A caller with nowhere to put traces passes null and the recorder skips the tier entirely; a
/// no-op store would instead let a lap advertise a trace that was thrown away.
/// </para>
/// </summary>
public interface ILapTraceStore
{
    /// <summary>Creates or replaces the trace filed under <paramref name="traceId"/>.</summary>
    void Save(string traceId, LapChannelTrace trace);

    /// <summary>The trace, or null when it was never written, was pruned, or is unreadable.</summary>
    LapChannelTrace? Load(string traceId);

    /// <summary>Removes a trace. A no-op if it does not exist.</summary>
    void Delete(string traceId);

    /// <summary>Every stored trace's id, size and write time, without reading any of them.</summary>
    IReadOnlyList<LapTraceInfo> List();

    /// <summary>Total bytes on disk, for the retention budget.</summary>
    long TotalBytes() => List().Sum(info => info.SizeBytes);
}

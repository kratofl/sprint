using Sprint.Desktop.Features.SessionPlanning;

namespace Sprint.Desktop.Features.LiveCompare;

/// <summary>
/// The lap the HUD is chasing (#195).
/// <para>
/// Live Compare owns this and it is never linked to the armed plan target (spec §2.4). The
/// HUD's main use is practice with no plan armed, and a plan target routinely resolves to the
/// <c>time only</c> tier, which carries no channels and cannot feed a curve at all.
/// </para>
/// <para>
/// The accepted consequence is that during a race the wheel delta and the HUD can be measuring
/// against different laps. That is mitigated by <see cref="Label"/> — the HUD always names the
/// lap it is chasing — never by quietly linking the two.
/// </para>
/// </summary>
public sealed record LiveCompareTarget(
    string SessionId,
    int LapNumber,
    string Label,
    double LapTimeSeconds,
    LapHistoryContext Context)
{
    /// <summary>Where the lap's channels live in the trace store.</summary>
    public string TraceId => LapTraceId.For(SessionId, LapNumber);
}

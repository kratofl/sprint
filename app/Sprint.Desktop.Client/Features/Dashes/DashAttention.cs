namespace Sprint.Desktop.Features.Dashes;

public enum DashCondition
{
    Neutral,
    GoodOnTarget,
    ColdLow,
    AssistActive,
    Warning,
    Critical,
    Fault,
    RaceControl,
}

public static class DashAttention
{
    // Two complete cycles per second: each stable/inverted phase lasts 250ms.
    private static readonly TimeSpan CriticalInversionPhase = TimeSpan.FromMilliseconds(250);

    public static bool AllowsInversion(DashCondition condition) => condition == DashCondition.Critical;

    public static bool IsInverted(DashCondition condition, bool requested, TimeSpan activeFor)
    {
        if (!requested || !AllowsInversion(condition) || activeFor < TimeSpan.Zero)
        {
            return false;
        }

        return (long)(activeFor.TotalMilliseconds / CriticalInversionPhase.TotalMilliseconds) % 2 == 1;
    }
}

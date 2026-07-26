namespace Sprint.Desktop.Features.Notifications;

internal sealed record ToastAnimationFrame(
    double Opacity,
    double TranslateX,
    double ProgressPercent,
    bool Complete);

/// <summary>
/// Pure timeline for runtime toasts. A single clock drives entry, remaining-time
/// progress, and exit so the visual motion cannot drift from auto-dismissal.
/// </summary>
internal static class ToastTimeline
{
    public static readonly TimeSpan Lifetime = TimeSpan.FromSeconds(12);
    public static readonly TimeSpan EnterDuration = TimeSpan.FromMilliseconds(160);
    public static readonly TimeSpan ExitDuration = TimeSpan.FromMilliseconds(160);

    public static ToastAnimationFrame Sample(TimeSpan elapsed, bool spatialMotion = true)
    {
        var total = Math.Clamp(elapsed.TotalMilliseconds / Lifetime.TotalMilliseconds, 0, 1);
        var progress = 100 * (1 - total);

        if (elapsed <= EnterDuration)
        {
            var entered = EaseOutCubic(elapsed.TotalMilliseconds / EnterDuration.TotalMilliseconds);
            return new ToastAnimationFrame(
                Opacity: entered,
                TranslateX: spatialMotion ? 18 * (1 - entered) : 0,
                ProgressPercent: progress,
                Complete: false);
        }

        var exitStartsAt = Lifetime - ExitDuration;
        if (elapsed >= exitStartsAt)
        {
            var exited = EaseOutCubic(
                (elapsed - exitStartsAt).TotalMilliseconds / ExitDuration.TotalMilliseconds);
            return new ToastAnimationFrame(
                Opacity: 1 - exited,
                TranslateX: spatialMotion ? 12 * exited : 0,
                ProgressPercent: progress,
                Complete: elapsed >= Lifetime);
        }

        return new ToastAnimationFrame(
            Opacity: 1,
            TranslateX: 0,
            ProgressPercent: progress,
            Complete: false);
    }

    private static double EaseOutCubic(double value)
    {
        var t = Math.Clamp(value, 0, 1);
        return 1 - Math.Pow(1 - t, 3);
    }
}

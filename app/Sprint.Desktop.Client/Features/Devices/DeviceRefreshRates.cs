namespace Sprint.Desktop.Features.Devices;

/// <summary>
/// The screen refresh rates a device can be set to (issue #75). One rate drives both
/// the hardware publisher and the on-screen live preview, so what the user sees while
/// tuning is what the panel gets — the preview used to animate at the shell's fixed
/// tick regardless of the setting.
///
/// <para>Rates are a small fixed set rather than a free number: panels are driven over
/// USB at a few tens of frames per second, and an arbitrary value invites 500 Hz
/// requests that only burn CPU.</para>
/// </summary>
public static class DeviceRefreshRates
{
    public const int Default = 30;

    /// <summary>Selectable rates in Hz, ascending.</summary>
    public static IReadOnlyList<int> All { get; } = [5, 10, 15, 20, 30, 60];

    /// <summary>Labels for a rate dropdown, in the same order as <see cref="All"/>.</summary>
    public static IReadOnlyList<string> Labels { get; } = All.Select(Label).ToArray();

    public static string Label(int hz) => $"{hz} Hz";

    /// <summary>The rate for a dropdown label, or <c>null</c> when unknown.</summary>
    public static int? ForLabel(string? label) =>
        All.Where(hz => string.Equals(Label(hz), label?.Trim(), StringComparison.OrdinalIgnoreCase))
            .Select(hz => (int?)hz)
            .FirstOrDefault();

    /// <summary>
    /// Snaps a persisted or user-supplied rate onto the supported set: 0/unset and
    /// anything unrecognised become <see cref="Default"/>, out-of-range values clamp
    /// to the nearest supported rate rather than being silently honoured.
    /// </summary>
    public static int Normalize(int hz)
    {
        if (hz <= 0)
        {
            return Default;
        }

        if (All.Contains(hz))
        {
            return hz;
        }

        // Ties round down (All is ascending and OrderBy is stable): halfway between two
        // rates, the cheaper one is the safer default for USB bandwidth and CPU.
        return All.OrderBy(candidate => Math.Abs(candidate - hz)).First();
    }

    /// <summary>The frame interval for a rate, used to pace the preview.</summary>
    public static TimeSpan Interval(int hz) => TimeSpan.FromSeconds(1.0 / Normalize(hz));
}

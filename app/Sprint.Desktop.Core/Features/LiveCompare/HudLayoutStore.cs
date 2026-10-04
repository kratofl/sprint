using Sprint.Desktop.Runtime;

namespace Sprint.Desktop.Features.LiveCompare;

/// <summary>
/// A monitor as the layout store cares about it: where it sits, how big it is, and what a
/// device-independent pixel is worth on it.
/// </summary>
/// <param name="Scaling">
/// Physical pixels per device-independent pixel. Avalonia gives a window's position in physical
/// pixels and its size in device-independent ones, so a store that lays windows out against
/// <c>Screen.Bounds</c> has to know the conversion. Without it a column computed at 100% opens
/// with every window overlapping the one above it at 150%.
/// </param>
public readonly record struct HudScreen(int X, int Y, int Width, int Height, double Scaling = 1);

/// <summary>
/// Where each overlay window sits, remembered per (window, monitor, resolution) — spec §2.3.
/// <para>
/// Avalonia-free so the placement rules are unit tests. The window shell converts Avalonia
/// screens into <see cref="HudScreen"/> and back.
/// </para>
/// </summary>
public static class HudLayoutStore
{
    /// <summary>Margin from the screen edge for the first placement, in device-independent pixels.</summary>
    private const int DefaultMargin = 48;

    /// <summary>Clear air between two windows of the first column, so none opens on another.</summary>
    private const int ColumnGap = 12;

    /// <summary>
    /// The floor a stored rectangle is restored at, in physical pixels.
    /// <para>
    /// Deliberately below any window's own minimum: this guards a corrupt or hand-edited
    /// settings file from restoring a sliver, while each window kind states its real minimum
    /// through <see cref="HudWindowSpec.MinWidth"/>, which is what actually stops a resize.
    /// </para>
    /// </summary>
    public const int MinWidth = 160;
    public const int MinHeight = 64;

    /// <summary>
    /// The identity of a monitor for layout purposes.
    /// <para>
    /// Position and size rather than a device index: an index shifts when a monitor is
    /// unplugged, which would silently restore the HUD onto the wrong screen. Resolution is
    /// part of the key on purpose — a layout placed at 3840×2160 is the wrong shape at
    /// 1920×1080, and reusing it is exactly the case spec §2.3 wants keyed apart.
    /// </para>
    /// </summary>
    public static string ScreenKey(HudScreen screen) =>
        $"{screen.X},{screen.Y}@{screen.Width}x{screen.Height}";

    /// <summary>
    /// The identity of one overlay window on one monitor. The window id leads, because the
    /// driver's mental model is "my brake window lives here" — the monitor is the qualifier.
    /// </summary>
    public static string KeyFor(string windowId, HudScreen screen) =>
        $"{windowId}#{ScreenKey(screen)}";

    /// <summary>
    /// The stored layout for <paramref name="windowId"/> on one of the monitors attached right
    /// now, or null when none applies.
    /// <para>
    /// A layout is discarded when the monitor it names is gone, and when its rectangle no
    /// longer overlaps that monitor. Restoring either would put a window somewhere the driver
    /// cannot see or reach — and it is click-through when locked, so an off-screen overlay is
    /// not something they can drag back.
    /// </para>
    /// </summary>
    public static HudWindowLayout? Restore(
        LiveCompareSettings settings,
        string windowId,
        IReadOnlyList<HudScreen> screens)
    {
        ArgumentNullException.ThrowIfNull(settings);
        ArgumentNullException.ThrowIfNull(screens);

        foreach (var screen in screens)
        {
            var key = KeyFor(windowId, screen);
            var stored = settings.Layouts.FirstOrDefault(layout =>
                string.Equals(layout.Key, key, StringComparison.Ordinal));

            if (stored is not null && Overlaps(stored, screen))
            {
                return stored;
            }
        }

        return null;
    }

    /// <summary>Records where the driver left <paramref name="windowId"/> on <paramref name="screen"/>.</summary>
    public static void Save(
        LiveCompareSettings settings,
        string windowId,
        HudScreen screen,
        int x,
        int y,
        int width,
        int height)
    {
        ArgumentNullException.ThrowIfNull(settings);

        var key = KeyFor(windowId, screen);
        settings.Layouts.RemoveAll(layout => string.Equals(layout.Key, key, StringComparison.Ordinal));
        settings.Layouts.Add(new HudWindowLayout
        {
            Key = key,
            X = x,
            Y = y,
            Width = Math.Max(MinWidth, width),
            Height = Math.Max(MinHeight, height),
        });
    }

    /// <summary>
    /// The first placement for a whole set: a single column down the left of the screen, in
    /// <paramref name="specs"/> order, one entry per spec, in physical pixels.
    /// <para>
    /// A column, and on the left, because a driver's eyes live on the racing line in the middle
    /// of the frame — a reference trace parked there would be the one thing guaranteed to be in
    /// the way. Placing the set as a column rather than each window independently is the only
    /// way to guarantee the thing a first open must get right: none of them lands on another.
    /// </para>
    /// <para>
    /// The spec sizes are device-independent — they describe how much chart a driver can read,
    /// which is a physical size on the glass, not a pixel count. They are converted here so the
    /// column can be laid out in the same units <c>Screen.Bounds</c> and a window's position
    /// use, and converted back when a window applies its rectangle.
    /// </para>
    /// </summary>
    public static IReadOnlyList<HudWindowLayout> DefaultColumn(
        IReadOnlyList<HudWindowSpec> specs,
        HudScreen screen)
    {
        ArgumentNullException.ThrowIfNull(specs);
        if (specs.Count == 0)
        {
            return [];
        }

        var scaling = screen.Scaling > 0 ? screen.Scaling : 1;
        var margin = (int)Math.Round(DefaultMargin * scaling);
        var gap = (int)Math.Round(ColumnGap * scaling);

        var maxWidth = Math.Max(MinWidth, screen.Width - (2 * margin));
        var maxHeight = Math.Max(MinHeight, screen.Height - (2 * margin));
        var available = maxHeight - (gap * (specs.Count - 1));
        var wanted = specs.Sum(spec => Physical(spec.DefaultHeight, scaling));

        // On a short screen the column is scaled down rather than allowed to run off the
        // bottom or overlap. What is left over on a display too small even for that is handled
        // by the bottom-edge clamp below.
        var fit = wanted > available && wanted > 0
            ? Math.Max(0.0, available / (double)wanted)
            : 1.0;

        var layouts = new List<HudWindowLayout>(specs.Count);
        var y = screen.Y + margin;

        foreach (var spec in specs)
        {
            var width = Math.Clamp(Physical(spec.DefaultWidth, scaling), MinWidth, maxWidth);
            var height = Math.Clamp(
                (int)Math.Round(Physical(spec.DefaultHeight, scaling) * fit),
                Math.Min(Physical(spec.MinHeight, scaling), maxHeight),
                maxHeight);

            layouts.Add(new HudWindowLayout
            {
                Key = KeyFor(spec.Id, screen),
                X = screen.X + margin,
                // Never past the bottom edge. On a display too small for the whole column this
                // is what stacks the tail rather than losing it off-screen.
                Y = Math.Min(y, screen.Y + Math.Max(0, screen.Height - height)),
                Width = width,
                Height = height,
            });

            y += height + gap;
        }

        return layouts;
    }

    /// <summary>A device-independent length in physical pixels on a given monitor.</summary>
    private static int Physical(int deviceIndependent, double scaling) =>
        (int)Math.Round(deviceIndependent * scaling);

    private static bool Overlaps(HudWindowLayout layout, HudScreen screen) =>
        layout.X < screen.X + screen.Width
        && layout.X + layout.Width > screen.X
        && layout.Y < screen.Y + screen.Height
        && layout.Y + layout.Height > screen.Y;
}

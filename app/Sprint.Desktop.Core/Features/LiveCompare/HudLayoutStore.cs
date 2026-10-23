using Sprint.Desktop.Runtime;

namespace Sprint.Desktop.Features.LiveCompare;

/// <summary>
/// A monitor as the layout store cares about it: where it sits and how big it is, in
/// device-independent pixels — the units Electron gives both a display and a window in.
/// </summary>
public readonly record struct HudScreen(int X, int Y, int Width, int Height);

/// <summary>
/// Where each overlay window sits, remembered per (window, monitor, resolution) — spec §2.3.
/// <para>
/// Free of any UI so the placement rules are unit tests. Electron hands over its displays and
/// applies the rectangles (<c>app/desktop/electron/hud.ts</c>).
/// </para>
/// </summary>
public static class HudLayoutStore
{
    /// <summary>Margin from the screen edge for the first placement.</summary>
    private const int DefaultMargin = 48;

    /// <summary>Clear air between two windows of the first column, so none opens on another.</summary>
    private const int ColumnGap = 12;

    /// <summary>
    /// The floor a stored rectangle is restored at.
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
    /// Where each window of a set opens: where the driver left it on a monitor attached right
    /// now, else its place in the first-run column on <paramref name="screens"/>' first entry,
    /// the primary display. One entry per spec, in spec order; empty with no screens.
    /// </summary>
    public static IReadOnlyList<HudWindowLayout> Arrange(
        LiveCompareSettings settings,
        IReadOnlyList<HudWindowSpec> specs,
        IReadOnlyList<HudScreen> screens)
    {
        ArgumentNullException.ThrowIfNull(settings);
        ArgumentNullException.ThrowIfNull(specs);
        ArgumentNullException.ThrowIfNull(screens);
        if (screens.Count == 0)
        {
            return [];
        }

        IReadOnlyList<HudWindowLayout> column = DefaultColumn(specs, screens[0]);
        return [.. specs.Select((spec, index) => Restore(settings, spec.Id, screens) ?? column[index])];
    }

    /// <summary>
    /// The first placement for a whole set: a single column down the left of the screen, in
    /// <paramref name="specs"/> order, one entry per spec.
    /// <para>
    /// A column, and on the left, because a driver's eyes live on the racing line in the middle
    /// of the frame — a reference trace parked there would be the one thing guaranteed to be in
    /// the way. Placing the set as a column rather than each window independently is the only
    /// way to guarantee the thing a first open must get right: none of them lands on another.
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

        int maxWidth = Math.Max(MinWidth, screen.Width - (2 * DefaultMargin));
        int maxHeight = Math.Max(MinHeight, screen.Height - (2 * DefaultMargin));
        int available = maxHeight - (ColumnGap * (specs.Count - 1));
        int wanted = specs.Sum(spec => spec.DefaultHeight);

        // On a short screen the column is scaled down rather than allowed to run off the
        // bottom or overlap. What is left over on a display too small even for that is handled
        // by the bottom-edge clamp below.
        double fit = wanted > available && wanted > 0
            ? Math.Max(0.0, available / (double)wanted)
            : 1.0;

        List<HudWindowLayout> layouts = new(specs.Count);
        int y = screen.Y + DefaultMargin;

        foreach (HudWindowSpec spec in specs)
        {
            int width = Math.Clamp(spec.DefaultWidth, MinWidth, maxWidth);
            int height = Math.Clamp(
                (int)Math.Round(spec.DefaultHeight * fit),
                Math.Min(spec.MinHeight, maxHeight),
                maxHeight);

            layouts.Add(new HudWindowLayout
            {
                Key = KeyFor(spec.Id, screen),
                X = screen.X + DefaultMargin,
                // Never past the bottom edge. On a display too small for the whole column this
                // is what stacks the tail rather than losing it off-screen.
                Y = Math.Min(y, screen.Y + Math.Max(0, screen.Height - height)),
                Width = width,
                Height = height,
            });

            y += height + ColumnGap;
        }

        return layouts;
    }

    private static bool Overlaps(HudWindowLayout layout, HudScreen screen) =>
        layout.X < screen.X + screen.Width
        && layout.X + layout.Width > screen.X
        && layout.Y < screen.Y + screen.Height
        && layout.Y + layout.Height > screen.Y;
}

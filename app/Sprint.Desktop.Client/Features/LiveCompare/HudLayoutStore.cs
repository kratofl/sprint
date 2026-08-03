using Sprint.Desktop.Runtime;

namespace Sprint.Desktop.Features.LiveCompare;

/// <summary>A monitor as the layout store cares about it: where it sits and how big it is.</summary>
public readonly record struct HudScreen(int X, int Y, int Width, int Height);

/// <summary>
/// Where the HUD sits, remembered per (monitor, resolution) — spec §2.3.
/// <para>
/// Avalonia-free so the placement rules are unit tests. The window shell converts Avalonia
/// screens into <see cref="HudScreen"/> and back.
/// </para>
/// </summary>
public static class HudLayoutStore
{
    /// <summary>
    /// The first size, in pixels rather than a fraction of the screen.
    /// <para>
    /// A fraction was wrong: 34% of a 2560-wide monitor is 870 px of overlay sitting on top of
    /// the game, which is not a HUD, it is a second window. This is sized for what it holds —
    /// three small stacked charts and a delta — and the driver resizes from there.
    /// </para>
    /// </summary>
    private const int DefaultWidth = 460;
    private const int DefaultHeight = 340;

    /// <summary>Margin from the screen edge for the first placement.</summary>
    private const int DefaultMargin = 48;

    public const int MinWidth = 280;
    public const int MinHeight = 180;

    /// <summary>
    /// The identity of a monitor for layout purposes.
    /// <para>
    /// Position and size rather than a device index: an index shifts when a monitor is
    /// unplugged, which would silently restore the HUD onto the wrong screen. Resolution is
    /// part of the key on purpose — a layout placed at 3840×2160 is the wrong shape at
    /// 1920×1080, and reusing it is exactly the case spec §2.3 wants keyed apart.
    /// </para>
    /// </summary>
    public static string KeyFor(HudScreen screen) =>
        $"{screen.X},{screen.Y}@{screen.Width}x{screen.Height}";

    /// <summary>
    /// The stored layout for one of the monitors attached right now, or null when none applies.
    /// <para>
    /// A layout is discarded when the monitor it names is gone, and when its rectangle no
    /// longer overlaps that monitor. Restoring either would put the HUD somewhere the driver
    /// cannot see or reach — and it is click-through when locked, so an off-screen HUD is not
    /// something they can drag back.
    /// </para>
    /// </summary>
    public static HudWindowLayout? Restore(
        LiveCompareSettings settings,
        IReadOnlyList<HudScreen> screens)
    {
        ArgumentNullException.ThrowIfNull(settings);
        ArgumentNullException.ThrowIfNull(screens);

        foreach (var screen in screens)
        {
            var key = KeyFor(screen);
            var stored = settings.Layouts.FirstOrDefault(layout =>
                string.Equals(layout.Key, key, StringComparison.Ordinal));

            if (stored is not null && Overlaps(stored, screen))
            {
                return stored;
            }
        }

        return null;
    }

    /// <summary>Records where the driver left the HUD on <paramref name="screen"/>.</summary>
    public static void Save(
        LiveCompareSettings settings,
        HudScreen screen,
        int x,
        int y,
        int width,
        int height)
    {
        ArgumentNullException.ThrowIfNull(settings);

        var key = KeyFor(screen);
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
    /// The first placement: upper-left area of the screen, clear of the centre. A driver's eyes
    /// live on the racing line in the middle of the frame, and a reference trace parked there
    /// would be the one thing guaranteed to be in the way.
    /// </summary>
    public static HudWindowLayout Default(HudScreen screen) => new()
    {
        Key = KeyFor(screen),
        X = screen.X + DefaultMargin,
        Y = screen.Y + DefaultMargin,
        // Never larger than the screen it is placed on, for a very small display.
        Width = Math.Clamp(DefaultWidth, MinWidth, Math.Max(MinWidth, screen.Width - (2 * DefaultMargin))),
        Height = Math.Clamp(DefaultHeight, MinHeight, Math.Max(MinHeight, screen.Height - (2 * DefaultMargin))),
    };

    private static bool Overlaps(HudWindowLayout layout, HudScreen screen) =>
        layout.X < screen.X + screen.Width
        && layout.X + layout.Width > screen.X
        && layout.Y < screen.Y + screen.Height
        && layout.Y + layout.Height > screen.Y;
}

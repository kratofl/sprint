using Avalonia;
using Avalonia.Controls;
using Avalonia.Layout;
using Avalonia.Media;
using Sprint.Desktop.Features.Charts;
using Sprint.Desktop.Runtime;

namespace Sprint.Desktop.Features.LiveCompare;

/// <summary>
/// One chart of the Live Compare overlay, in its own small window: throttle, or brake, or
/// speed — your lap in ember against the target's in blue.
/// <para>
/// One chart per window, not a stack. The driver asked for small windows they place and size
/// one by one, and a stack cannot express that at any size: every panel in it shares one
/// position, one width and one aspect ratio.
/// </para>
/// <para>
/// It carries no header of its own. <c>ChartStackPainter</c> already draws the panel title and
/// a legend naming both laps, so a second title row would spend this window's scarcest
/// resource — height — restating what is a pixel below it.
/// </para>
/// </summary>
public sealed class CompareHudWindow : HudOverlayWindow
{
    private readonly ContentControl _host = new();

    private ChartStackView? _surface;

    public CompareHudWindow(
        HudWindowSpec spec,
        LiveCompareSettings settings,
        Action persist,
        HudWindowLayout initial)
        : base(spec, settings, persist, initial)
    {
        ArgumentNullException.ThrowIfNull(spec);
        if (spec.Panel is null)
        {
            throw new ArgumentException("A chart window needs a panel to draw.", nameof(spec));
        }

        SetBody(_host);
    }

    /// <summary>
    /// Draws the next frame, or states that there is nothing to chase.
    /// <para>
    /// The stack is handed in by the host rather than pulled from the controller here: one
    /// resample per frame feeds every window in the set, where four windows each asking for
    /// their own would resample the rolling window four times for one repaint.
    /// </para>
    /// </summary>
    public void Update(ChartStack? stack)
    {
        if (stack is null)
        {
            _surface = null;
            if (_host.Content is not TextBlock)
            {
                var empty = Graphite.TextBlock(
                    "Pick a lap to chase in Analysis.",
                    11.5,
                    brush: Graphite.Text3Brush,
                    wrapping: TextWrapping.Wrap);
                empty.TextAlignment = TextAlignment.Center;
                empty.HorizontalAlignment = HorizontalAlignment.Center;
                empty.VerticalAlignment = VerticalAlignment.Center;
                empty.Margin = new Thickness(14, 0);
                _host.Content = empty;
            }

            return;
        }

        if (_surface is null)
        {
            _surface = new ChartStackView(stack, ChartPalette.HudSurface);
            _host.Content = _surface;
        }
        else
        {
            _surface.SetStack(stack);
        }
    }
}

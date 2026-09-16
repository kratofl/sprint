using Avalonia;
using Avalonia.Controls;
using Avalonia.Layout;
using Avalonia.Media;
using Sprint.Desktop.Runtime;

namespace Sprint.Desktop.Features.LiveCompare;

/// <summary>
/// The smallest window of the Live Compare set: the lap being chased, and how far ahead of it
/// you are.
/// <para>
/// Its own window rather than a strip inside each chart. Spec §2.4 requires the HUD to always
/// name the lap it is chasing — during a race with a plan armed the wheel delta and the HUD
/// can legitimately be measuring against different laps, and that disagreement must never be
/// silent. Repeating the name and the delta in every chart window would say it three times;
/// leaving it out would say it nowhere.
/// </para>
/// </summary>
public sealed class CompareDeltaWindow : HudOverlayWindow
{
    private readonly TextBlock _targetName;
    private readonly TextBlock _delta;

    public CompareDeltaWindow(
        HudWindowSpec spec,
        LiveCompareSettings settings,
        Action persist,
        HudWindowLayout initial)
        : base(spec, settings, persist, initial)
    {
        _targetName = Graphite.TextBlock("No target", 11.5, FontWeight.SemiBold);
        _targetName.TextTrimming = TextTrimming.CharacterEllipsis;
        _delta = Graphite.TextBlock("—", 22, FontWeight.SemiBold, Graphite.Text2Brush);

        var name = new StackPanel { Spacing = 1 };
        name.Children.Add(Graphite.TextBlock("CHASING", 9, FontWeight.SemiBold, Graphite.Text3Brush));
        name.Children.Add(_targetName);

        var body = new StackPanel
        {
            Spacing = 4,
            Margin = new Thickness(12, 9),
            VerticalAlignment = VerticalAlignment.Center,
        };
        body.Children.Add(name);
        body.Children.Add(_delta);

        SetBody(body);
    }

    /// <summary>Shows the current frame, or states that nothing is being chased.</summary>
    public void Update(LiveCompareFrame? frame)
    {
        _targetName.Text = frame?.TargetName ?? "No target";
        ShowDelta(frame?.DeltaSeconds);
    }

    private void ShowDelta(double? seconds)
    {
        if (seconds is not { } delta)
        {
            _delta.Text = "—";
            _delta.Foreground = Graphite.Text2Brush;
            return;
        }

        // Ahead is the good direction and reads green; behind reads ember, the colour this app
        // already uses for "your attention belongs here".
        _delta.Text = delta <= 0
            ? $"−{Math.Abs(delta):0.00}"
            : $"+{delta:0.00}";
        _delta.Foreground = delta <= 0 ? Graphite.GreenBrush : Graphite.AccentBrush;
    }
}

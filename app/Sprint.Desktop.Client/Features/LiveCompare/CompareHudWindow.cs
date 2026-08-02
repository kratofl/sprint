using Avalonia;
using Avalonia.Automation;
using Avalonia.Controls;
using Avalonia.Layout;
using Avalonia.Media;
using Avalonia.Media.Immutable;
using Avalonia.Platform;
using Avalonia.Threading;
using Sprint.Desktop.Features.Charts;
using Sprint.Desktop.Runtime;

namespace Sprint.Desktop.Features.LiveCompare;

/// <summary>
/// The Live Compare HUD (#195): a transparent, topmost, borderless window that draws the target
/// lap's trace and yours over the stretch of track you are approaching.
/// <para>
/// No injection. An injected overlay is a large dependency, an anti-cheat risk against an
/// online sim and a per-game maintenance burden, for placement that is nicer but not necessary
/// (spec §2.3). It follows <c>CaptureRegionWindow</c>, which already established this window
/// shape in this codebase.
/// </para>
/// <para>
/// Lock and target selection deliberately live in the Sprint window, not here: locked, this
/// window is click-through, so a control on it would be unreachable.
/// </para>
/// </summary>
public sealed class CompareHudWindow : Window
{
    /// <summary>
    /// Repaint rate. Matched to the UI's snapshot drain, not to the 200 Hz telemetry poll —
    /// resampling the window is real work and nobody can see frames a monitor never shows.
    /// </summary>
    private static readonly TimeSpan FrameInterval = TimeSpan.FromMilliseconds(33);

    /// <summary>How often the exclusive-fullscreen state is re-checked. It changes rarely.</summary>
    private static readonly TimeSpan FullscreenCheckInterval = TimeSpan.FromSeconds(2);

    private readonly LiveCompareController _controller;
    private readonly LiveCompareSettings _settings;
    private readonly Action _persist;
    private readonly DispatcherTimer _timer;

    private readonly TextBlock _targetName;
    private readonly TextBlock _delta;
    private readonly TextBlock _notice;
    private readonly Border _noticeHost;
    private readonly ContentControl _surfaceHost;

    private ChartStackView? _surface;
    private DateTimeOffset _lastFullscreenCheck = DateTimeOffset.MinValue;
    private bool _locked;

    public CompareHudWindow(
        LiveCompareController controller,
        LiveCompareSettings settings,
        Action persist)
    {
        _controller = controller ?? throw new ArgumentNullException(nameof(controller));
        _settings = settings ?? throw new ArgumentNullException(nameof(settings));
        _persist = persist ?? throw new ArgumentNullException(nameof(persist));

        Title = "Live Compare";
        WindowDecorations = WindowDecorations.None;
        Background = Brushes.Transparent;
        TransparencyBackgroundFallback = Brushes.Transparent;
        TransparencyLevelHint = [WindowTransparencyLevel.Transparent, WindowTransparencyLevel.None];
        CanResize = true;
        ShowInTaskbar = false;
        Topmost = true;
        WindowStartupLocation = WindowStartupLocation.Manual;
        MinWidth = HudLayoutStore.MinWidth;
        MinHeight = HudLayoutStore.MinHeight;
        FontFamily = Graphite.FontStack;
        AutomationProperties.SetName(this, "Live Compare overlay");

        _targetName = Graphite.TextBlock("No target", 12, FontWeight.SemiBold);
        _delta = Graphite.TextBlock("—", 15, FontWeight.SemiBold, Graphite.Text2Brush);
        _notice = Graphite.TextBlock("", 11.5, brush: Graphite.YellowBrush, wrapping: TextWrapping.Wrap);
        _noticeHost = new Border
        {
            Background = Graphite.Panel3Brush,
            BorderBrush = Graphite.LineBrush,
            BorderThickness = new Thickness(1),
            CornerRadius = new CornerRadius(Graphite.RadiusSm),
            Padding = new Thickness(10, 6),
            Margin = new Thickness(0, 0, 0, 6),
            IsVisible = false,
            Child = _notice,
        };
        _surfaceHost = new ContentControl();

        Content = BuildContent();

        _timer = new DispatcherTimer { Interval = FrameInterval };
        _timer.Tick += (_, _) => Tick();

        Opened += (_, _) =>
        {
            RestoreLayout();
            ApplyLock(_settings.Locked);
            _timer.Start();
        };
        Closed += (_, _) => _timer.Stop();
        PositionChanged += (_, _) => RememberLayout();
        Resized += (_, _) => RememberLayout();
    }

    /// <summary>Whether the HUD is click-through and unfocusable.</summary>
    public bool Locked => _locked;

    /// <summary>
    /// The message shown when the driver's game has taken the screen exclusively. Public so the
    /// Sprint window can say the same thing where the driver is actually looking — they cannot
    /// see this window, which is the entire problem.
    /// </summary>
    public const string FullscreenNotice =
        "Your game is running in exclusive fullscreen, so this overlay cannot be shown. "
        + "Switch the game to borderless or windowed mode.";

    /// <summary>Turns click-through on or off. Called from the Sprint window, never from here.</summary>
    public void SetLocked(bool locked)
    {
        ApplyLock(locked);
        _settings.Locked = locked;
        _persist();
    }

    private void ApplyLock(bool locked)
    {
        _locked = locked;
        if (TryGetPlatformHandle()?.Handle is { } handle)
        {
            HudInterop.SetClickThrough(handle, locked);
        }

        // Unlocked, the whole surface is a drag handle and the border says so; locked, the
        // chrome recedes so the only thing left over the game is the data.
        if (Content is Border root)
        {
            root.BorderBrush = locked ? Graphite.LineBrush : Graphite.AccentBorderBrush;
            root.BorderThickness = new Thickness(locked ? 1 : 2);
        }
    }

    private Control BuildContent()
    {
        var header = new Grid
        {
            ColumnDefinitions = new ColumnDefinitions("*,Auto"),
            Margin = new Thickness(0, 0, 0, 6),
        };

        var name = new StackPanel { Spacing = 1 };
        name.Children.Add(Graphite.TextBlock("CHASING", 9, FontWeight.SemiBold, Graphite.Text3Brush));
        name.Children.Add(_targetName);
        Grid.SetColumn(name, 0);
        header.Children.Add(name);

        var delta = new StackPanel { Spacing = 1, HorizontalAlignment = HorizontalAlignment.Right };
        delta.Children.Add(Graphite.TextBlock("DELTA", 9, FontWeight.SemiBold, Graphite.Text3Brush));
        delta.Children.Add(_delta);
        Grid.SetColumn(delta, 1);
        header.Children.Add(delta);

        var body = new DockPanel { LastChildFill = true };
        DockPanel.SetDock(header, Dock.Top);
        body.Children.Add(header);
        DockPanel.SetDock(_noticeHost, Dock.Top);
        body.Children.Add(_noticeHost);
        body.Children.Add(_surfaceHost);

        return new Border
        {
            // The panel colour at partial alpha: the game reads through, but every mark still
            // has a stable ground. Full transparency loses the traces over a bright kerb.
            Background = new ImmutableSolidColorBrush(Graphite.Panel, 0.82),
            BorderBrush = Graphite.LineBrush,
            BorderThickness = new Thickness(1),
            CornerRadius = new CornerRadius(Graphite.RadiusMd),
            Padding = new Thickness(12, 10),
            Child = body,
        };
    }

    private void Tick()
    {
        CheckFullscreen();

        var frame = _controller.Snapshot();
        if (frame is null)
        {
            _targetName.Text = "No target";
            _delta.Text = "—";
            _delta.Foreground = Graphite.Text2Brush;
            _surfaceHost.Content ??= Graphite.TextBlock(
                "Pick a lap to chase in Analysis.",
                12,
                brush: Graphite.Text3Brush,
                wrapping: TextWrapping.Wrap);
            return;
        }

        _targetName.Text = frame.TargetName;
        ShowDelta(frame.DeltaSeconds);

        if (_surface is null)
        {
            _surface = new ChartStackView(frame.Stack, ChartPalette.HudSurface);
            _surfaceHost.Content = _surface;
        }
        else
        {
            _surface.SetStack(frame.Stack);
        }
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

    private void CheckFullscreen()
    {
        var now = DateTimeOffset.UtcNow;
        if (now - _lastFullscreenCheck < FullscreenCheckInterval)
        {
            return;
        }

        _lastFullscreenCheck = now;
        var blocked = HudInterop.IsExclusiveFullscreenActive();
        _notice.Text = blocked ? FullscreenNotice : "";
        _noticeHost.IsVisible = blocked;
    }

    private void RestoreLayout()
    {
        var screens = CurrentScreens();
        if (screens.Count == 0)
        {
            return;
        }

        var layout = HudLayoutStore.Restore(_settings, screens) ?? HudLayoutStore.Default(screens[0]);
        Position = new PixelPoint(layout.X, layout.Y);
        Width = layout.Width;
        Height = layout.Height;
    }

    private void RememberLayout()
    {
        if (!IsVisible || CurrentScreen() is not { } screen)
        {
            return;
        }

        HudLayoutStore.Save(
            _settings,
            screen,
            Position.X,
            Position.Y,
            (int)Math.Round(Width),
            (int)Math.Round(Height));
        _persist();
    }

    private IReadOnlyList<HudScreen> CurrentScreens()
    {
        var all = Screens?.All;
        if (all is null || all.Count == 0)
        {
            return [];
        }

        // The screen the window is actually on comes first, so Restore prefers its layout over
        // one saved for a different monitor.
        var here = CurrentScreen();
        var ordered = all.Select(ToHudScreen).ToList();
        if (here is { } current)
        {
            ordered.Remove(current);
            ordered.Insert(0, current);
        }

        return ordered;
    }

    private HudScreen? CurrentScreen() =>
        Screens?.ScreenFromWindow(this) is { } screen ? ToHudScreen(screen) : null;

    private static HudScreen ToHudScreen(Screen screen) => new(
        screen.Bounds.X,
        screen.Bounds.Y,
        screen.Bounds.Width,
        screen.Bounds.Height);
}

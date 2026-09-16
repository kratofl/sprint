using Avalonia;
using Avalonia.Automation;
using Avalonia.Controls;
using Avalonia.Input;
using Avalonia.Layout;
using Avalonia.Media;
using Avalonia.Media.Immutable;
using Avalonia.Platform;
using Avalonia.VisualTree;
using Sprint.Desktop.Runtime;

namespace Sprint.Desktop.Features.LiveCompare;

/// <summary>
/// One window of the Live Compare overlay set (#195): transparent, topmost, borderless, and
/// draggable and resizable on its own.
/// <para>
/// No injection. An injected overlay is a large dependency, an anti-cheat risk against an
/// online sim and a per-game maintenance burden, for placement that is nicer but not necessary
/// (spec §2.3). It follows <c>CaptureRegionWindow</c>, which already established this window
/// shape in this codebase.
/// </para>
/// <para>
/// This base owns everything that is true of every overlay window — the window flags, the
/// lock, the drag, the layout memory — and nothing about what is drawn inside it.
/// <see cref="CompareHudWindow"/> puts one chart in it and <see cref="CompareDeltaWindow"/>
/// puts the target and the delta in it.
/// </para>
/// <para>
/// Lock and target selection deliberately live in the Sprint window, not here: locked, these
/// windows are click-through, so a control on one would be unreachable.
/// </para>
/// </summary>
public abstract class HudOverlayWindow : Window
{
    private readonly HudWindowSpec _spec;
    private readonly LiveCompareSettings _settings;
    private readonly Action _persist;
    private readonly HudWindowLayout _initial;

    private readonly Panel _layers;
    private readonly Border _root;
    private readonly Border _noticeHost;
    private readonly TextBlock _notice;
    private readonly Button _close;

    private bool _locked;
    private bool _placed;

    protected HudOverlayWindow(
        HudWindowSpec spec,
        LiveCompareSettings settings,
        Action persist,
        HudWindowLayout initial)
    {
        _spec = spec ?? throw new ArgumentNullException(nameof(spec));
        _settings = settings ?? throw new ArgumentNullException(nameof(settings));
        _persist = persist ?? throw new ArgumentNullException(nameof(persist));
        _initial = initial ?? throw new ArgumentNullException(nameof(initial));

        Title = $"Live Compare · {spec.Title}";
        WindowDecorations = WindowDecorations.None;
        Background = Brushes.Transparent;
        TransparencyBackgroundFallback = Brushes.Transparent;
        TransparencyLevelHint = [WindowTransparencyLevel.Transparent, WindowTransparencyLevel.None];
        CanResize = true;
        // Deliberately IN the taskbar, unlike CaptureRegionWindow. A borderless, topmost,
        // taskbar-less window with no title bar has no way out if anything goes wrong with the
        // app that owns it — which is exactly what happened the first time this shipped. While
        // driving the taskbar is not on screen anyway, so the entry costs nothing and is the
        // last resort that has to exist. Windows groups the set under one Sprint icon.
        ShowInTaskbar = true;
        Topmost = true;
        WindowStartupLocation = WindowStartupLocation.Manual;
        MinWidth = spec.MinWidth;
        MinHeight = spec.MinHeight;
        FontFamily = Graphite.FontStack;
        AutomationProperties.SetName(this, $"Live Compare {spec.Title} overlay");

        _notice = Graphite.TextBlock("", 11, brush: Graphite.YellowBrush, wrapping: TextWrapping.Wrap);
        _noticeHost = new Border
        {
            Background = Graphite.Panel3Brush,
            BorderBrush = Graphite.LineBrush,
            BorderThickness = new Thickness(1),
            CornerRadius = new CornerRadius(Graphite.RadiusSm),
            Padding = new Thickness(10, 6),
            Margin = new Thickness(6),
            VerticalAlignment = VerticalAlignment.Top,
            IsVisible = false,
            Child = _notice,
        };

        // Only while unlocked. Locked, the window is click-through and this could not be hit
        // anyway, so showing it would be a control that lies about being usable. It floats over
        // the content rather than reserving a row: these windows are small, and a chart's own
        // title row is the reading, not chrome to be pushed aside.
        _close = Graphite.IconButton("x", "Close this overlay window (Esc)", Close);
        _close.HorizontalAlignment = HorizontalAlignment.Right;
        _close.VerticalAlignment = VerticalAlignment.Top;
        _close.Margin = new Thickness(4);

        _layers = new Panel();
        _layers.Children.Add(_noticeHost);
        _layers.Children.Add(_close);

        _root = new Border
        {
            // The panel colour at partial alpha: the game reads through, but every mark still
            // has a stable ground. Full transparency loses the traces over a bright kerb.
            Background = new ImmutableSolidColorBrush(Graphite.Panel, 0.82),
            BorderBrush = Graphite.LineBrush,
            BorderThickness = new Thickness(1),
            CornerRadius = new CornerRadius(Graphite.RadiusMd),
            Child = _layers,
        };

        // The whole surface is the drag handle. A borderless window has no title bar to grab,
        // and reserving a strip for one would spend the overlay's scarcest resource — height —
        // on chrome. Dragging from anywhere is also what a driver reaching for it expects.
        _root.PointerPressed += (_, e) =>
        {
            if (_locked || e.Source is Button || (e.Source is Visual visual && visual.FindAncestorOfType<Button>() is not null))
            {
                return;
            }

            BeginMoveDrag(e);
        };

        Content = _root;

        Opened += (_, _) =>
        {
            Place();
            ApplyLock(_settings.Locked);
        };
        PositionChanged += (_, _) => RememberLayout();
        Resized += (_, _) => RememberLayout();

        // Escape closes it. A borderless overlay has no close button of the window manager's,
        // so the keyboard is the one affordance every desktop user already expects to work.
        KeyDown += (_, e) =>
        {
            if (e.Key == Key.Escape)
            {
                Close();
                e.Handled = true;
            }
        };
    }

    /// <summary>Which window this is, for the layout key and the host's bookkeeping.</summary>
    public HudWindowSpec Spec => _spec;

    /// <summary>Whether this window is click-through and unfocusable.</summary>
    public bool Locked => _locked;

    /// <summary>Turns click-through on or off. Called from the host, never from here.</summary>
    public void SetLocked(bool locked) => ApplyLock(locked);

    /// <summary>
    /// Shows or clears a message over this window. The host puts it on exactly one window of
    /// the set: it is one fact about the desktop, and saying it four times would turn the
    /// overlay into a wall of the same warning.
    /// </summary>
    public void SetNotice(string? message)
    {
        _notice.Text = message ?? "";
        _noticeHost.IsVisible = !string.IsNullOrEmpty(message);
    }

    /// <summary>Fills the window. Called by the derived constructor, once.</summary>
    protected void SetBody(Control body)
    {
        ArgumentNullException.ThrowIfNull(body);
        _layers.Children.Insert(0, body);
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
        _root.BorderBrush = locked ? Graphite.LineBrush : Graphite.AccentBorderBrush;
        _root.BorderThickness = new Thickness(locked ? 1 : 2);
        _close.IsVisible = !locked;
    }

    /// <summary>
    /// Applies the rectangle this window opens at.
    /// <para>
    /// A stored layout is in physical pixels, because that is the unit a position and a
    /// monitor's bounds are already in and mixing the two is what would let a set laid out at
    /// 100% open overlapping at 150%. <see cref="Window.Width"/> is device-independent, so the
    /// size — and only the size — converts here.
    /// </para>
    /// </summary>
    private void Place()
    {
        Position = new PixelPoint(_initial.X, _initial.Y);
        var scaling = ScalingAt(Position);
        Width = _initial.Width / scaling;
        Height = _initial.Height / scaling;
        _placed = true;
    }

    private void RememberLayout()
    {
        // Before Place() runs, Position and Size are whatever the platform opened the window
        // at. Saving that would overwrite the layout being restored with a default one.
        if (!_placed || !IsVisible || CurrentScreen() is not { } screen)
        {
            return;
        }

        var scaling = screen.Scaling > 0 ? screen.Scaling : 1;
        HudLayoutStore.Save(
            _settings,
            _spec.Id,
            screen,
            Position.X,
            Position.Y,
            (int)Math.Round(Width * scaling),
            (int)Math.Round(Height * scaling));
        _persist();
    }

    private double ScalingAt(PixelPoint point) =>
        Screens?.ScreenFromPoint(point)?.Scaling is { } scaling && scaling > 0 ? scaling : 1;

    private HudScreen? CurrentScreen() =>
        Screens?.ScreenFromWindow(this) is { } screen ? ToHudScreen(screen) : null;

    internal static HudScreen ToHudScreen(Screen screen) => new(
        screen.Bounds.X,
        screen.Bounds.Y,
        screen.Bounds.Width,
        screen.Bounds.Height,
        screen.Scaling);
}

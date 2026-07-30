using Avalonia;
using Avalonia.Automation;
using Avalonia.Controls;
using Avalonia.Input;
using Avalonia.Interactivity;
using Avalonia.Layout;
using Avalonia.Media;
using Avalonia.Controls.Shapes;
using Sprint.Desktop.Features.Devices;
using Sprint.Desktop.Shell;

namespace Sprint.Desktop;

/// <summary>
/// Borderless desktop-region selector for rear-view screen output. Its transparent
/// client bounds are the captured area; move and resize operations remain locked
/// to the target device's effective aspect ratio.
/// </summary>
public sealed class CaptureRegionWindow : Window
{
    private readonly double _aspectRatio;
    private CaptureSelectionSize _lastSize;
    private bool _enforcingAspect;
    private ScreenCaptureRegion? _confirmedRegion;

    public CaptureRegionWindow(SavedDevice device)
    {
        ArgumentNullException.ThrowIfNull(device);
        _aspectRatio = CaptureSelectionGeometry.AspectRatio(device);

        Title = "Select capture area";
        WindowDecorations = WindowDecorations.None;
        Background = Brushes.Transparent;
        TransparencyBackgroundFallback = Brushes.Transparent;
        TransparencyLevelHint = [WindowTransparencyLevel.Transparent, WindowTransparencyLevel.None];
        CanResize = true;
        ShowInTaskbar = false;
        Topmost = true;
        WindowStartupLocation = WindowStartupLocation.Manual;
        MinWidth = 160;
        MinHeight = 90;
        FontFamily = Graphite.FontStack;
        AutomationProperties.SetName(this, "Rear-view capture area selector");
        AutomationProperties.SetHelpText(
            this,
            "Use arrow keys to move. Hold Shift and use arrow keys to resize. Press Enter to use the area or Escape to cancel.");

        var initial = device.CaptureRegion;
        var initialSize = InitialSize(_aspectRatio);
        Width = initialSize.Width;
        Height = initialSize.Height;
        _lastSize = initialSize;

        Content = BuildContent();
        Resized += OnResized;
        Opened += (_, _) =>
        {
            if (initial is { IsValid: true })
            {
                RestorePhysicalRegion(initial);
            }
            else if (Owner is Window owner)
            {
                var scale = SafeScale();
                Position = new PixelPoint(
                    owner.Position.X + (int)Math.Round(64 * scale),
                    owner.Position.Y + (int)Math.Round(96 * scale));
            }
        };
    }

    public event EventHandler<ScreenCaptureRegion>? SelectionConfirmed;

    public double SelectionAspectRatio => _aspectRatio;

    public ScreenCaptureRegion SelectedRegion
    {
        get
        {
            var scale = SafeScale();
            var width = ClientSize.Width > 0 ? ClientSize.Width : Width;
            var height = ClientSize.Height > 0 ? ClientSize.Height : Height;
            return new ScreenCaptureRegion(
                Position.X,
                Position.Y,
                Math.Max(1, (int)Math.Round(width * scale)),
                Math.Max(1, (int)Math.Round(height * scale)));
        }
    }

    protected override void OnClosed(EventArgs e)
    {
        base.OnClosed(e);
        if (_confirmedRegion is { } region)
        {
            SelectionConfirmed?.Invoke(this, region);
        }
    }

    protected override void OnKeyDown(KeyEventArgs e)
    {
        if (HandleSelectorKey(e))
        {
            return;
        }

        base.OnKeyDown(e);
    }

    private Control BuildContent()
    {
        var root = new Grid
        {
            Cursor = new Cursor(StandardCursorType.SizeAll),
        };
        root.PointerPressed += (_, args) =>
        {
            if (args.GetCurrentPoint(this).Properties.IsLeftButtonPressed
                && WindowDragPolicy.ShouldBeginDrag(args.Source))
            {
                BeginMoveDrag(args);
                args.Handled = true;
            }
        };
        root.Children.Add(new Border
        {
            Tag = "capture-drag-surface",
            BorderBrush = Graphite.AccentBrush,
            BorderThickness = new Thickness(3),
            Background = Graphite.CaptureSelectionFillBrush,
        });

        var toolbar = new Border
        {
            HorizontalAlignment = HorizontalAlignment.Stretch,
            VerticalAlignment = VerticalAlignment.Top,
            Background = Graphite.OverlayChromeBrush,
            BorderBrush = Graphite.Line2Brush,
            BorderThickness = new Thickness(0, 0, 0, 1),
            Padding = new Thickness(12, 9),
        };
        var toolbarGrid = new Grid { ColumnDefinitions = new ColumnDefinitions("*,Auto") };
        var dragSurface = new StackPanel
        {
            Spacing = 2,
            Cursor = new Cursor(StandardCursorType.SizeAll),
            VerticalAlignment = VerticalAlignment.Center,
        };
        var titleRow = new StackPanel { Orientation = Orientation.Horizontal, Spacing = 8 };
        titleRow.Children.Add(Graphite.TextBlock("✥", 16, FontWeight.Bold, Graphite.Text2Brush));
        titleRow.Children.Add(Graphite.TextBlock(
            "Move and resize to frame the rear view",
            12,
            FontWeight.SemiBold,
            Graphite.TextBrush));
        dragSurface.Children.Add(titleRow);
        dragSurface.Children.Add(Graphite.TextBlock(
            "Arrow keys move · Shift + arrows resize · Enter uses area · Esc cancels",
            10,
            FontWeight.Normal,
            Graphite.Text3Brush));
        Grid.SetColumn(dragSurface, 0);
        toolbarGrid.Children.Add(dragSurface);

        var actions = new StackPanel
        {
            Orientation = Orientation.Horizontal,
            Spacing = 8,
            VerticalAlignment = VerticalAlignment.Center,
        };
        var cancel = Graphite.Button("Cancel", ButtonTone.Ghost);
        cancel.Click += (_, _) => Close();
        actions.Children.Add(cancel);
        var confirm = Graphite.Button("Use this area", ButtonTone.Primary);
        confirm.Click += (_, _) => ConfirmSelection();
        actions.Children.Add(confirm);
        Grid.SetColumn(actions, 1);
        toolbarGrid.Children.Add(actions);
        toolbar.Child = toolbarGrid;
        root.Children.Add(toolbar);

        AddResizeHandle(root, WindowEdge.North, HorizontalAlignment.Stretch, VerticalAlignment.Top, null, 10, StandardCursorType.TopSide);
        AddResizeHandle(root, WindowEdge.South, HorizontalAlignment.Stretch, VerticalAlignment.Bottom, null, 10, StandardCursorType.BottomSide);
        AddResizeHandle(root, WindowEdge.West, HorizontalAlignment.Left, VerticalAlignment.Stretch, 10, null, StandardCursorType.LeftSide);
        AddResizeHandle(root, WindowEdge.East, HorizontalAlignment.Right, VerticalAlignment.Stretch, 10, null, StandardCursorType.RightSide);
        AddResizeHandle(root, WindowEdge.NorthWest, HorizontalAlignment.Left, VerticalAlignment.Top, 18, 18, StandardCursorType.TopLeftCorner);
        AddResizeHandle(root, WindowEdge.NorthEast, HorizontalAlignment.Right, VerticalAlignment.Top, 18, 18, StandardCursorType.TopRightCorner);
        AddResizeHandle(root, WindowEdge.SouthWest, HorizontalAlignment.Left, VerticalAlignment.Bottom, 18, 18, StandardCursorType.BottomLeftCorner);
        AddResizeHandle(root, WindowEdge.SouthEast, HorizontalAlignment.Right, VerticalAlignment.Bottom, 18, 18, StandardCursorType.BottomRightCorner);
        return root;
    }

    private void AddResizeHandle(
        Grid root,
        WindowEdge edge,
        HorizontalAlignment horizontal,
        VerticalAlignment vertical,
        double? width,
        double? height,
        StandardCursorType cursor)
    {
        var handle = new Border
        {
            HorizontalAlignment = horizontal,
            VerticalAlignment = vertical,
            Width = width ?? double.NaN,
            Height = height ?? double.NaN,
            Background = Brushes.Transparent,
            Cursor = new Cursor(cursor),
            Child = new Ellipse
            {
                Tag = $"capture-resize-handle:{edge}",
                Width = 12,
                Height = 12,
                Fill = Graphite.AccentBrush,
                Stroke = Graphite.PanelBrush,
                StrokeThickness = 2,
                HorizontalAlignment = HorizontalAlignment.Center,
                VerticalAlignment = VerticalAlignment.Center,
                IsHitTestVisible = false,
            },
        };
        handle.PointerPressed += (_, args) =>
        {
            if (args.GetCurrentPoint(this).Properties.IsLeftButtonPressed)
            {
                BeginResizeDrag(edge, args);
                args.Handled = true;
            }
        };
        root.Children.Add(handle);
    }

    private void OnResized(object? sender, WindowResizedEventArgs e)
    {
        if (_enforcingAspect || e.ClientSize.Width <= 0 || e.ClientSize.Height <= 0)
        {
            return;
        }

        var requested = new CaptureSelectionSize(e.ClientSize.Width, e.ClientSize.Height);
        var constrained = CaptureSelectionGeometry.ConstrainResize(_lastSize, requested, _aspectRatio);
        _lastSize = constrained;
        if (Math.Abs(constrained.Width - requested.Width) < 0.5
            && Math.Abs(constrained.Height - requested.Height) < 0.5)
        {
            return;
        }

        _enforcingAspect = true;
        Width = constrained.Width;
        Height = constrained.Height;
        _enforcingAspect = false;
    }

    private bool HandleSelectorKey(KeyEventArgs e)
    {
        if (e.Key == Key.Escape)
        {
            Close();
            e.Handled = true;
            return true;
        }

        if (e.Key == Key.Enter && e.Source is not Button)
        {
            ConfirmSelection();
            e.Handled = true;
            return true;
        }

        if (e.Key is not (Key.Left or Key.Right or Key.Up or Key.Down))
        {
            return false;
        }

        var step = e.KeyModifiers.HasFlag(KeyModifiers.Control) ? 1d : 10d;
        if (e.KeyModifiers.HasFlag(KeyModifiers.Shift))
        {
            var current = new CaptureSelectionSize(
                ClientSize.Width > 0 ? ClientSize.Width : Width,
                ClientSize.Height > 0 ? ClientSize.Height : Height);
            var requested = e.Key switch
            {
                Key.Left => current with { Width = current.Width - step },
                Key.Right => current with { Width = current.Width + step },
                Key.Up => current with { Height = current.Height - step },
                _ => current with { Height = current.Height + step },
            };
            var constrained = CaptureSelectionGeometry.ConstrainResize(
                current,
                requested,
                _aspectRatio);
            _lastSize = constrained;
            _enforcingAspect = true;
            Width = constrained.Width;
            Height = constrained.Height;
            _enforcingAspect = false;
        }
        else
        {
            var physicalStep = Math.Max(1, (int)Math.Round(step * SafeScale()));
            Position = e.Key switch
            {
                Key.Left => Position.WithX(Position.X - physicalStep),
                Key.Right => Position.WithX(Position.X + physicalStep),
                Key.Up => Position.WithY(Position.Y - physicalStep),
                _ => Position.WithY(Position.Y + physicalStep),
            };
        }

        e.Handled = true;
        return true;
    }

    private void ConfirmSelection()
    {
        _confirmedRegion = SelectedRegion;
        Close();
    }

    private void RestorePhysicalRegion(ScreenCaptureRegion region)
    {
        region = CaptureSelectionGeometry.NormalizeRegionAspect(region, _aspectRatio);
        var requestedBounds = new PixelRect(region.X, region.Y, region.Width, region.Height);
        var targetScreen = Screens.All
            .Select(screen => new
            {
                Screen = screen,
                Intersection = IntersectionArea(requestedBounds, screen.Bounds),
            })
            .Where(candidate => candidate.Intersection > 0)
            .OrderByDescending(candidate => candidate.Intersection)
            .Select(candidate => candidate.Screen)
            .FirstOrDefault();
        if (targetScreen is not null)
        {
            ApplyPhysicalRegion(region, targetScreen.Scaling);
            return;
        }

        var fallbackScreen = Owner is { } owner
            ? Screens.ScreenFromWindow(owner)
            : Screens.ScreenFromWindow(this);
        fallbackScreen ??= Screens.Primary;
        if (fallbackScreen is null)
        {
            ApplyPhysicalRegion(region, SafeScale());
            return;
        }

        var bounds = fallbackScreen.WorkingArea;
        var recovered = CaptureSelectionGeometry.RecoverToVisibleBounds(
            region,
            new ScreenCaptureRegion(bounds.X, bounds.Y, bounds.Width, bounds.Height),
            _aspectRatio);
        ApplyPhysicalRegion(recovered, fallbackScreen.Scaling);
    }

    private static long IntersectionArea(PixelRect left, PixelRect right)
    {
        var width = Math.Max(
            0,
            Math.Min(left.X + left.Width, right.X + right.Width) - Math.Max(left.X, right.X));
        var height = Math.Max(
            0,
            Math.Min(left.Y + left.Height, right.Y + right.Height) - Math.Max(left.Y, right.Y));
        return (long)width * height;
    }

    private void ApplyPhysicalRegion(ScreenCaptureRegion region, double scale)
    {
        scale = scale > 0 ? scale : 1;
        Position = new PixelPoint(region.X, region.Y);
        Width = region.Width / scale;
        Height = region.Height / scale;
        _lastSize = new CaptureSelectionSize(Width, Height);
    }

    private double SafeScale() => RenderScaling > 0 ? RenderScaling : 1;

    private static CaptureSelectionSize InitialSize(double aspectRatio)
    {
        const double longEdge = 800;
        return aspectRatio >= 1
            ? new CaptureSelectionSize(longEdge, longEdge / aspectRatio)
            : new CaptureSelectionSize(longEdge * aspectRatio, longEdge);
    }
}

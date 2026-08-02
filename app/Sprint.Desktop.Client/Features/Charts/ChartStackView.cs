using Avalonia;
using Avalonia.Controls;
using Avalonia.Input;
using Avalonia.Media;
using Avalonia.Media.Imaging;
using Avalonia.Platform;
using Avalonia.VisualTree;
using SkiaSharp;
using Sprint.Desktop.Features.Dashes;

namespace Sprint.Desktop.Features.Charts;

/// <summary>
/// The Avalonia surface for a chart stack: it turns a pointer position into a domain
/// coordinate for <see cref="ChartStackController"/> and blits what
/// <see cref="ChartStackPainter"/> drew.
/// <para>
/// This is the only chart file that references Avalonia, mirroring how the dash keeps its
/// painter UI-free. Where a stack is <em>hosted</em> is deliberately not decided here — this
/// control takes a stack and can be dropped into any page later.
/// </para>
/// </summary>
public sealed class ChartStackView : Control
{
    private static readonly Vector Dpi = new(96, 96);

    // Arrow keys nudge the cursor by a hundredth of a continuous domain; a discrete domain
    // steps by the thing it counts.
    private const double ContinuousKeyStepFraction = 0.01;

    private readonly SKColor? _background;

    private ChartStackPainter? _painter;
    private WriteableBitmap? _bitmap;
    private byte[]? _staging;

    /// <param name="background">
    /// What the surface is cleared to, or null for the opaque Graphite card. The Live Compare
    /// HUD passes a translucent colour so the game reads through the chart.
    /// </param>
    public ChartStackView(ChartStack stack, SKColor? background = null)
    {
        ArgumentNullException.ThrowIfNull(stack);
        _background = background;
        Controller = new ChartStackController(stack);
        Focusable = true;
        ClipToBounds = true;
        Cursor = new Cursor(StandardCursorType.Cross);
    }

    public ChartStackController Controller { get; private set; }

    /// <summary>
    /// Swaps in a new stack — a different pair of laps, or the next frame of a live window.
    /// <para>
    /// The cursor is dropped with the old controller. That is correct rather than merely
    /// convenient: a crosshair carried onto a different lap's data would keep reporting the
    /// coordinate it was placed at while the values under it silently became someone else's.
    /// </para>
    /// </summary>
    public void SetStack(ChartStack stack)
    {
        ArgumentNullException.ThrowIfNull(stack);
        Controller = new ChartStackController(stack);
        InvalidateVisual();
    }

    /// <summary>The device scale the surface is rendered at (1.0 at 100%).</summary>
    public double Scaling => TopLevel.GetTopLevel(this)?.RenderScaling ?? 1.0;

    /// <summary>
    /// The stack's geometry in device pixels — the same mapping the painter draws through,
    /// so a caller placing or reading the cursor never computes a second one.
    /// </summary>
    public ChartStackLayout Layout => new(
        Controller.Stack,
        (float)(Bounds.Width * Scaling),
        (float)(Bounds.Height * Scaling));

    protected override void OnPointerMoved(PointerEventArgs e)
    {
        base.OnPointerMoved(e);
        var position = e.GetPosition(this);
        if (Controller.MoveCursor(Layout.DomainAt((float)(position.X * Scaling))))
        {
            InvalidateVisual();
        }
    }

    protected override void OnPointerExited(PointerEventArgs e)
    {
        base.OnPointerExited(e);
        if (Controller.ClearCursor())
        {
            InvalidateVisual();
        }
    }

    protected override void OnKeyDown(KeyEventArgs e)
    {
        base.OnKeyDown(e);
        var direction = e.Key switch
        {
            Key.Left => -1,
            Key.Right => 1,
            _ => 0,
        };
        if (direction == 0)
        {
            return;
        }

        // Focus reads the same values as hover: a tooltip must never be the only way to a
        // number.
        var domain = Controller.Stack.Domain;
        var step = domain.Kind == ChartDomainKind.LapNumber
            ? 1
            : domain.Span * ContinuousKeyStepFraction;
        var from = Controller.Cursor ?? domain.Min;
        if (Controller.MoveCursor(Math.Clamp(from + (direction * step), domain.Min, domain.Max)))
        {
            InvalidateVisual();
        }

        e.Handled = true;
    }

    public override void Render(DrawingContext context)
    {
        base.Render(context);

        var width = (int)Math.Round(Bounds.Width * Scaling);
        var height = (int)Math.Round(Bounds.Height * Scaling);
        if (width <= 0 || height <= 0)
        {
            return;
        }

        if (_painter is null || _painter.Width != width || _painter.Height != height)
        {
            _painter?.Dispose();
            _painter = new ChartStackPainter(width, height, _background);
            _bitmap?.Dispose();
            _bitmap = new WriteableBitmap(new PixelSize(width, height), Dpi, PixelFormat.Bgra8888, AlphaFormat.Premul);
        }

        _painter.Render(Controller);
        Copy(_painter);
        context.DrawImage(_bitmap!, new Rect(0, 0, Bounds.Width, Bounds.Height));
    }

    protected override void OnDetachedFromVisualTree(VisualTreeAttachmentEventArgs e)
    {
        base.OnDetachedFromVisualTree(e);
        _painter?.Dispose();
        _painter = null;
        _bitmap?.Dispose();
        _bitmap = null;
    }

    // The painter's BGRA buffer reaches Avalonia through the dash renderer's existing blit:
    // it is the generic pixel bridge for this app's Skia painters, and a second copy of it
    // here would be one more place for a stride bug to live.
    private void Copy(ChartStackPainter painter)
    {
        var required = checked(painter.Width * painter.Height * 4);
        if (_staging is null || _staging.Length < required)
        {
            _staging = new byte[required];
        }

        painter.PixelSpanBgra.CopyTo(_staging);
        DashImageRenderer.CopyBgra(_staging, painter.Width, painter.Height, _bitmap!);
    }
}

using Avalonia;
using Avalonia.Automation;
using Avalonia.Controls;
using Avalonia.Media;
using Avalonia.Platform;
using System.Xml.Linq;

namespace Sprint.Desktop.Features.Analysis;

/// <summary>
/// Draws one circuit outline at a fixed on-screen line weight, whatever the source map's units
/// were.
/// <para>
/// Avalonia's <c>Path</c> with <see cref="Stretch.Uniform"/> scales the pen along with the
/// geometry, so the same <c>StrokeThickness</c> came out hairline on a 300-unit drawing and heavy
/// on a 1400-unit one — the "too thick on Daytona, too thin elsewhere" the driver reported. This
/// control fits the geometry itself and divides the pen by that scale, so every circuit is drawn
/// with the same line.
/// </para>
/// </summary>
internal sealed class TrackLayoutView : Control
{
    private static readonly Dictionary<string, Geometry> Cache = new(StringComparer.Ordinal);

    private readonly Geometry _geometry;
    private readonly IBrush _brush;
    private readonly double _lineWidth;
    private readonly double _inset;

    public TrackLayoutView(Geometry geometry, IBrush brush, double lineWidth = 3, double inset = 12)
    {
        _geometry = geometry ?? throw new ArgumentNullException(nameof(geometry));
        _brush = brush ?? throw new ArgumentNullException(nameof(brush));
        _lineWidth = lineWidth;
        _inset = inset;
    }

    /// <summary>
    /// The single circuit path in an analysis track asset. The assets hold exactly one path so
    /// this cannot pick the pit lane, a kerb or a label outline by accident.
    /// </summary>
    public static Geometry Load(string assetFileName)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(assetFileName);
        if (Cache.TryGetValue(assetFileName, out var cached))
        {
            return cached;
        }

        using var stream = AssetLoader.Open(
            new Uri($"avares://Sprint.Desktop.Client/Assets/Analysis/{assetFileName}"));
        var document = XDocument.Load(stream);
        var data = document.Descendants()
            .Where(element => element.Name.LocalName == "path")
            .Select(element => (string?)element.Attribute("d"))
            .SingleOrDefault(value => !string.IsNullOrWhiteSpace(value))
            ?? throw new InvalidOperationException(
                $"Track layout '{assetFileName}' must hold exactly one circuit path.");

        var geometry = Geometry.Parse(data);
        Cache[assetFileName] = geometry;
        return geometry;
    }

    /// <summary>The card-sized presentation, named for tests and screen readers.</summary>
    public static Control Card(string assetFileName, string name, IBrush brush)
    {
        var view = new TrackLayoutView(Load(assetFileName), brush)
        {
            Tag = "analysis-track-layout",
        };
        AutomationProperties.SetName(view, $"{name} circuit layout");
        return view;
    }

    protected override Size MeasureOverride(Size availableSize)
    {
        // The card decides the box; the outline fills whatever it is given.
        var width = double.IsFinite(availableSize.Width) ? availableSize.Width : 0;
        var height = double.IsFinite(availableSize.Height) ? availableSize.Height : 0;
        return new Size(width, height);
    }

    public override void Render(DrawingContext context)
    {
        var bounds = _geometry.Bounds;
        var box = Bounds.Size;
        var usable = new Size(
            Math.Max(0, box.Width - (2 * _inset)),
            Math.Max(0, box.Height - (2 * _inset)));
        if (bounds.Width <= 0 || bounds.Height <= 0 || usable.Width <= 0 || usable.Height <= 0)
        {
            return;
        }

        var scale = Math.Min(usable.Width / bounds.Width, usable.Height / bounds.Height);
        var matrix =
            Matrix.CreateTranslation(-bounds.X - (bounds.Width / 2), -bounds.Y - (bounds.Height / 2))
            * Matrix.CreateScale(scale, scale)
            * Matrix.CreateTranslation(box.Width / 2, box.Height / 2);

        // The pen is divided by the fit so the drawn line is _lineWidth device pixels wide for
        // every asset, and joins stay round instead of spiking on tight hairpins.
        var pen = new Pen(_brush, _lineWidth / scale)
        {
            LineCap = PenLineCap.Round,
            LineJoin = PenLineJoin.Round,
        };

        using (context.PushTransform(matrix))
        {
            context.DrawGeometry(null, pen, _geometry);
        }
    }
}

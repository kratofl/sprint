using Avalonia;
using Avalonia.Controls;
using Avalonia.Headless;
using Avalonia.Input;
using Avalonia.Media.Imaging;
using SkiaSharp;
using Sprint.Desktop.Features.Charts;
using Xunit;

namespace Sprint.Desktop.Tests;

/// <summary>
/// The drawn half of the chart stack (#187): the shared geometry every chart maps X
/// through, and the SkiaSharp render itself. Pixel assertions live here; value lookup is
/// the controller's job and is tested in <see cref="ChartStackTests"/>.
/// </summary>
public sealed class ChartRenderTests
{
    private static ChartStack ThreeChartsOverTrackPosition() => new(
        ChartDomain.TrackPosition(),
        [
            new ChartPanel("Speed", [new ChartSeries("Lap 14", [new(0, 0), new(0.5, 100), new(1, 200)])]) { Unit = "km/h" },
            new ChartPanel("Throttle", [new ChartSeries("Lap 14", [new(0, 1), new(0.5, 0), new(1, 1)])]),
            new ChartPanel("Brake", [new ChartSeries("Lap 14", [new(0, 0), new(0.5, 1), new(1, 0)])]),
        ]);

    [Fact]
    public void Every_chart_in_a_stack_maps_the_domain_through_the_same_x_columns()
    {
        var layout = new ChartStackLayout(ThreeChartsOverTrackPosition(), 800, 600);

        var first = layout.Plot(0);
        for (var i = 1; i < 3; i++)
        {
            var plot = layout.Plot(i);
            Assert.Equal(first.Left, plot.Left, 3);
            Assert.Equal(first.Right, plot.Right, 3);

            // Stacked downward in order, never overlapping.
            Assert.True(plot.Top >= layout.Plot(i - 1).Bottom, $"Chart {i} overlaps chart {i - 1}.");
        }

        // The one shared axis sits under every plot.
        Assert.True(layout.AxisBand.Top >= layout.Plot(2).Bottom);

        // A pointer at the middle of the plot is the middle of the domain, and the mapping
        // round-trips both ways.
        Assert.Equal(0, layout.DomainAt(first.Left), 6);
        Assert.Equal(1, layout.DomainAt(first.Right), 6);
        Assert.Equal(0.5, layout.DomainAt((first.Left + first.Right) / 2f), 6);
        Assert.Equal((first.Left + first.Right) / 2f, layout.PixelAt(0.5), 3);

        // Outside the plot the pointer reads as the nearest edge of the domain: the cursor
        // is a position, and refusing to invent values stays the series lookup's job.
        Assert.Equal(0, layout.DomainAt(first.Left - 40), 6);
        Assert.Equal(1, layout.DomainAt(first.Right + 40), 6);
    }

    [Fact]
    public void A_chart_scale_rounds_to_clean_numbers_it_can_label()
    {
        // Speed 0..200 keeps its own ends rather than a padded 216 / -16, which would put a
        // negative floor under a value that cannot be negative.
        var speed = ChartScale.For(0, 200);
        Assert.Equal(0, speed.Min, 9);
        Assert.Equal(200, speed.Max, 9);
        Assert.Equal(100, speed.Step, 9);

        var throttle = ChartScale.For(0, 1);
        Assert.Equal(0, throttle.Min, 9);
        Assert.Equal(1, throttle.Max, 9);

        // A stint's fuel use, 3.0 L to 3.7 L, rounds out to half-litre ends.
        var fuel = ChartScale.For(3.0, 3.7);
        Assert.Equal(3.0, fuel.Min, 9);
        Assert.Equal(4.0, fuel.Max, 9);
        Assert.Equal(0.5, fuel.Step, 9);
        Assert.Equal("3.0", fuel.Format(fuel.Min));

        // A flat series still gets somewhere to sit rather than a zero-height scale.
        var flat = ChartScale.For(42, 42);
        Assert.True(flat.Max > flat.Min);
        Assert.True(flat.Min <= 42 && flat.Max >= 42);
    }

    [Fact]
    public void A_discrete_axis_only_ticks_where_its_coordinates_exist()
    {
        // Evenly spacing five ticks over laps 1..8 would label position 2.75 as "Lap 3" —
        // a tick that points at a coordinate the domain does not have.
        var laps = ChartDomain.LapNumbers(1, 8).Ticks(5);

        Assert.True(laps.Count <= 5);
        Assert.Equal(1d, laps[0]);
        Assert.All(laps, lap =>
        {
            Assert.Equal(lap, Math.Round(lap), 9);
            Assert.InRange(lap, 1, 8);
        });

        // A continuous axis has a coordinate everywhere, so it spreads ticks evenly.
        var position = ChartDomain.TrackPosition().Ticks(5);
        Assert.Equal(5, position.Count);
        Assert.Equal(0, position[0], 9);
        Assert.Equal(0.5, position[2], 9);
        Assert.Equal(1, position[4], 9);
    }

    [Fact]
    public void One_cursor_reaches_every_chart_and_the_shared_axis()
    {
        const int width = 900;
        const int height = 560;
        var controller = new ChartStackController(ThreeChartsOverTrackPosition());
        using var painter = new ChartStackPainter(width, height);

        var idle = painter.Render(controller).Pixels;
        controller.MoveCursor(0.62);
        var hovered = painter.Render(controller).Pixels;
        SaveArtifact("chart-stack-track-position.png", painter.RenderPng(controller));

        var layout = new ChartStackLayout(controller.Stack, width, height);
        var cursorX = (int)Math.Round(layout.PixelAt(0.62));
        for (var i = 0; i < 3; i++)
        {
            var plot = layout.Plot(i);
            Assert.True(
                ChangedNearColumn(idle, hovered, width, cursorX, plot),
                $"Chart {i} shows nothing at the shared cursor.");
            Assert.True(
                EmberPixels(hovered, width, plot) > 20,
                $"Chart {i} draws no ember series line.");
        }

        Assert.True(
            ChangedNearColumn(idle, hovered, width, cursorX, layout.AxisBand),
            "The shared axis does not report the cursor's coordinate.");
    }

    [Fact]
    public void A_comparison_series_draws_blue_beside_the_current_one_on_a_lap_domain()
    {
        // A stint trend on lap number: this stint in ember, the reference stint in blue.
        var stack = new ChartStack(
            ChartDomain.LapNumbers(1, 8),
            [
                new ChartPanel(
                    "Lap time",
                    [
                        new ChartSeries("This stint", [new(1, 95.4), new(2, 94.8), new(3, 94.9), new(4, 95.6), new(5, 95.9), new(6, 96.4), new(7, 96.8), new(8, 97.3)]),
                        new ChartSeries("Reference", [new(1, 94.9), new(2, 94.6), new(3, 94.7), new(4, 94.9), new(5, 95.2), new(6, 95.4), new(7, 95.7), new(8, 96.0)])
                        {
                            Role = ChartSeriesRole.Comparison,
                        },
                    ])
                {
                    Unit = "s",
                },
                new ChartPanel(
                    "Fuel used",
                    [
                        new ChartSeries("This stint", [new(1, 3.4), new(2, 3.3), new(3, 3.3), new(4, 3.2), new(5, 3.2), new(6, 3.1), new(7, 3.1), new(8, 3.0)])
                        {
                            // A per-lap figure is one number for the whole lap, not a slope
                            // towards the next lap's.
                            Interpolation = ChartInterpolation.Stepped,
                            FillArea = true,
                        },
                    ])
                {
                    Unit = "L",
                },
            ]);
        var controller = new ChartStackController(stack);
        controller.MoveCursor(5.4);
        using var painter = new ChartStackPainter(900, 460);

        var pixels = painter.Render(controller).Pixels;
        SaveArtifact("chart-stack-lap-number.png", painter.RenderPng(controller));

        var layout = new ChartStackLayout(stack, 900, 460);
        Assert.True(BluePixels(pixels, 900, layout.Plot(0)) > 20, "The comparison series is not drawn in blue.");
        Assert.True(EmberPixels(pixels, 900, layout.Plot(0)) > 20, "The current series is not drawn in ember.");

        // The cursor snapped to lap 5, so that is what the axis reports.
        Assert.Equal("Lap 5", controller.Readout!.DomainText);
    }

    [Fact]
    public void Charts_without_enough_data_state_it_instead_of_drawing_bare_axes()
    {
        const int width = 900;
        const int height = 460;
        var stack = new ChartStack(
            ChartDomain.LapNumbers(1, 6),
            [
                new ChartPanel("Fuel used", [new ChartSeries("Stint 2", [new(1, 3.4), new(2, 3.3), new(3, 3.2), new(4, 3.2), new(5, 3.1), new(6, 3.0)])]) { Unit = "L" },
                new ChartPanel("Virtual energy", [new ChartSeries("Stint 2", [])]) { Unit = "%" },
                new ChartPanel("Tyre wear", [new ChartSeries("Front left", [new(3, 12.0)])]) { Unit = "%" },

                // Recorded from lap 4 on, so at lap 3 this chart has a line but no reading.
                new ChartPanel("Tyre temp", [new ChartSeries("Front left", [new(4, 88.0), new(5, 91.0), new(6, 93.0)])]) { Unit = "C" },
            ]);
        var controller = new ChartStackController(stack);
        controller.MoveCursor(3);
        using var painter = new ChartStackPainter(width, height);

        var pixels = painter.Render(controller).Pixels;
        SaveArtifact("chart-stack-states.png", painter.RenderPng(controller));

        var layout = new ChartStackLayout(stack, width, height);
        Assert.True(EmberPixels(pixels, width, layout.Plot(0)) > 20, "The chart with data lost its series.");

        // Neither thin chart draws a line, a marker or a grid it cannot justify — it says what
        // is missing instead.
        Assert.Equal(0, EmberPixels(pixels, width, layout.Plot(1)));
        Assert.Equal(0, EmberPixels(pixels, width, layout.Plot(2)));
        Assert.True(InkPixels(pixels, width, layout.Plot(1)) > 100, "The empty chart says nothing at all.");
        Assert.True(InkPixels(pixels, width, layout.Plot(2)) > 100, "The single-sample chart says nothing at all.");

        // A drawable chart the cursor has run off the front of reports the absence rather
        // than leaving the reader to guess whether they missed the line.
        Assert.Null(Assert.Single(controller.Readout!.Charts[3].Series).Value);
        Assert.True(
            InkPixels(pixels, width, layout.Plot(3)) > 100,
            "The out-of-range chart shows no readout at the cursor.");

        // A stack with nothing anywhere states it once instead of down every chart.
        var barren = new ChartStackController(new ChartStack(
            stack.Domain,
            [new ChartPanel("Virtual energy", [new ChartSeries("Stint 2", [])])]));
        SaveArtifact("chart-stack-empty.png", painter.RenderPng(barren));
    }

    [Fact]
    public async Task Hovering_the_view_drives_the_shared_cursor_and_arrow_keys_do_the_same()
    {
        var session = HeadlessUnitTestSession.GetOrStartForAssembly(typeof(ChartRenderTests).Assembly);
        await session.Dispatch(
            () =>
            {
                var view = new ChartStackView(ThreeChartsOverTrackPosition());
                var window = new Window
                {
                    Width = 900,
                    Height = 560,
                    Content = view,
                };
                window.Show();
                window.CaptureRenderedFrame();

                var target = new Point(view.Layout.PixelAt(0.62) / view.Scaling, 120);
                window.MouseMove(view.TranslatePoint(target, window)!.Value);

                Assert.Equal(0.62, view.Controller.Cursor!.Value, 2);

                // Keyboard reaches the same cursor as the pointer, so the readout is not
                // gated behind hovering.
                view.Focus();
                window.KeyPress(Key.Right, RawInputModifiers.None, PhysicalKey.ArrowRight, string.Empty);
                Assert.True(
                    view.Controller.Cursor > 0.62,
                    $"Arrow-right left the cursor at {view.Controller.Cursor}.");

                var frame = window.CaptureRenderedFrame();
                Assert.NotNull(frame);
                var root = Path.Combine(TestEnv.RepoRoot, "app", "Sprint.Desktop.Tests", "artifacts", "visual");
                Directory.CreateDirectory(root);
                frame!.Save(Path.Combine(root, "chart-stack-hovered-view.png"), new PngBitmapEncoderOptions());
            },
            CancellationToken.None);
    }

    /// <summary>Pixels within 8px of the cursor column that the cursor changed.</summary>
    private static bool ChangedNearColumn(SKColor[] idle, SKColor[] hovered, int width, int cursorX, SKRect band)
    {
        for (var y = (int)band.Top; y < (int)band.Bottom; y++)
        {
            for (var x = Math.Max(0, cursorX - 8); x < Math.Min(width, cursorX + 9); x++)
            {
                if (idle[(y * width) + x] != hovered[(y * width) + x])
                {
                    return true;
                }
            }
        }

        return false;
    }

    // Ember (#FF6A00) after antialiasing: red dominant, mid green, almost no blue.
    private static int EmberPixels(SKColor[] pixels, int width, SKRect band)
    {
        var count = 0;
        for (var y = (int)band.Top; y < (int)band.Bottom; y++)
        {
            for (var x = (int)band.Left; x < (int)band.Right; x++)
            {
                var pixel = pixels[(y * width) + x];
                if (pixel.Red > 180 && pixel.Green is > 40 and < 170 && pixel.Blue < 90)
                {
                    count++;
                }
            }
        }

        return count;
    }

    // Graphite blue (#1F7FE6) after antialiasing: blue dominant over red.
    private static int BluePixels(SKColor[] pixels, int width, SKRect band)
    {
        var count = 0;
        for (var y = (int)band.Top; y < (int)band.Bottom; y++)
        {
            for (var x = (int)band.Left; x < (int)band.Right; x++)
            {
                var pixel = pixels[(y * width) + x];
                if (pixel.Blue > 150 && pixel.Red < 110 && pixel.Green is > 60 and < 180)
                {
                    count++;
                }
            }
        }

        return count;
    }

    /// <summary>Pixels that are neither the chart surface nor a hairline over it — drawn text.</summary>
    private static int InkPixels(SKColor[] pixels, int width, SKRect band)
    {
        var count = 0;
        for (var y = (int)band.Top; y < (int)band.Bottom; y++)
        {
            for (var x = (int)band.Left; x < (int)band.Right; x++)
            {
                if (pixels[(y * width) + x].Red > 90)
                {
                    count++;
                }
            }
        }

        return count;
    }

    private static void SaveArtifact(string fileName, byte[] png)
    {
        var root = Path.Combine(TestEnv.RepoRoot, "app", "Sprint.Desktop.Tests", "artifacts", "visual");
        Directory.CreateDirectory(root);
        var path = Path.Combine(root, fileName);
        File.WriteAllBytes(path, png);
        Assert.True(new FileInfo(path).Length > 0, $"Expected a non-empty chart artifact at {path}.");
    }
}

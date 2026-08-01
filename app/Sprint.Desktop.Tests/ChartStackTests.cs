using Sprint.Desktop.Features.Charts;
using Sprint.Desktop.Features.SessionPlanning;
using Xunit;

namespace Sprint.Desktop.Tests;

/// <summary>
/// The Avalonia-free chart seam (#187): a cursor at one domain coordinate, every chart
/// in the stack reporting its value there.
/// <para>
/// Fixtures are deliberately closed-form — speed is exactly <c>200 * position</c> and
/// brake exactly <c>4 * position</c> — so an expected value is arithmetic a reader can do
/// by hand rather than a second copy of the interpolator.
/// </para>
/// </summary>
public sealed class ChartStackTests
{
    private static ChartStack TwoChartsOverTrackPosition() => new(
        ChartDomain.TrackPosition(),
        [
            new ChartPanel("Speed", [new ChartSeries("Lap 14", [new(0, 0), new(0.5, 100), new(1, 200)])])
            {
                Unit = "km/h",
            },
            new ChartPanel("Brake", [new ChartSeries("Lap 14", [new(0, 0), new(0.25, 1), new(0.5, 2), new(0.75, 3), new(1, 4)])]),
        ]);

    [Fact]
    public void Cursor_on_the_shared_domain_reports_a_value_for_every_chart()
    {
        var controller = new ChartStackController(TwoChartsOverTrackPosition());

        Assert.True(controller.MoveCursor(0.62));

        var readout = controller.Readout;
        Assert.NotNull(readout);
        Assert.Equal(0.62, readout.Domain, 6);
        Assert.Equal(2, readout.Charts.Count);

        // 200 * 0.62 and 4 * 0.62.
        Assert.Equal(124d, Assert.Single(readout.Charts[0].Series).Value!.Value, 6);
        Assert.Equal(2.48d, Assert.Single(readout.Charts[1].Series).Value!.Value, 6);
    }

    [Fact]
    public void Each_domain_kind_names_itself_for_a_host_and_for_its_own_axis()
    {
        // The three kinds a stack can be plotted over, each with the descriptive name a host
        // would put in a selector and the short one that fits the axis gutter.
        Assert.Equal(ChartDomainKind.TrackPosition, ChartDomain.TrackPosition().Kind);
        Assert.Equal("Track position", ChartDomain.TrackPosition().Label);
        Assert.Equal("Position", ChartDomain.TrackPosition().AxisLabel);

        Assert.Equal(ChartDomainKind.LapNumber, ChartDomain.LapNumbers(1, 10).Kind);
        Assert.Equal("Lap number", ChartDomain.LapNumbers(1, 10).Label);
        Assert.Equal("Lap", ChartDomain.LapNumbers(1, 10).AxisLabel);

        Assert.Equal(ChartDomainKind.SessionTime, ChartDomain.SessionTime(0, 60).Kind);
        Assert.Equal("Session time", ChartDomain.SessionTime(0, 60).Label);
        Assert.Equal("Time", ChartDomain.SessionTime(0, 60).AxisLabel);
    }

    [Fact]
    public void Moving_to_the_same_coordinate_changes_nothing_and_leaving_clears_the_readout()
    {
        var controller = new ChartStackController(TwoChartsOverTrackPosition());

        Assert.True(controller.MoveCursor(0.62));
        Assert.False(controller.MoveCursor(0.62));

        Assert.True(controller.ClearCursor());
        Assert.Null(controller.Cursor);
        Assert.Null(controller.Readout);
        Assert.False(controller.ClearCursor());
    }

    [Fact]
    public void Lap_number_domain_snaps_the_cursor_to_a_whole_lap_and_holds_discrete_values()
    {
        // A stint's fuel use. Lap 4 was invalid and never recorded, so there is a hole.
        var controller = new ChartStackController(new ChartStack(
            ChartDomain.LapNumbers(1, 6),
            [
                new ChartPanel(
                    "Fuel used",
                    [
                        new ChartSeries("Stint 2", [new(1, 3.0), new(2, 3.1), new(3, 3.2), new(5, 3.6), new(6, 3.7)])
                        {
                            Interpolation = ChartInterpolation.Stepped,
                        },
                    ])
                {
                    Unit = "L",
                },
            ]));

        Assert.True(controller.MoveCursor(3.4));

        // There is no lap 3.4, so a discrete domain snaps the cursor to the lap itself.
        Assert.Equal(3d, controller.Cursor);
        Assert.Equal("Lap 3", controller.Readout!.DomainText);
        Assert.Equal(3.2, Assert.Single(controller.Readout!.Charts[0].Series).Value!.Value, 9);

        // Over the unrecorded lap the stepped series holds lap 3's reading instead of
        // inventing a value between 3.2 and 3.6.
        controller.MoveCursor(4);
        Assert.Equal(3.2, Assert.Single(controller.Readout!.Charts[0].Series).Value!.Value, 9);
    }

    [Fact]
    public void Session_time_domain_stays_continuous_and_labels_the_clock()
    {
        // Track temperature over an hour: exactly 20 + seconds / 200.
        var controller = new ChartStackController(new ChartStack(
            ChartDomain.SessionTime(0, 3600),
            [new ChartPanel("Track temp", [new ChartSeries("Session", [new(0, 20), new(3600, 38)])]) { Unit = "C" }]));

        Assert.True(controller.MoveCursor(1800.5));

        // Session time is continuous, so the cursor is not rounded to anything.
        Assert.Equal(1800.5, controller.Cursor);
        Assert.Equal("30:01", controller.Readout!.DomainText);
        Assert.Equal(29.0025, Assert.Single(controller.Readout!.Charts[0].Series).Value!.Value, 6);

        // Past an hour the label grows an hours field rather than counting to minute 61.
        controller.MoveCursor(3661);
        Assert.Equal("1:01:01", controller.Readout!.DomainText);
    }

    [Fact]
    public void Cursor_exactly_on_a_sample_reports_the_recorded_value()
    {
        var controller = new ChartStackController(TwoChartsOverTrackPosition());

        controller.MoveCursor(0.5);

        var readout = controller.Readout!;
        Assert.Equal(100d, Assert.Single(readout.Charts[0].Series).Value!.Value, 9);
        Assert.Equal(2d, Assert.Single(readout.Charts[1].Series).Value!.Value, 9);

        // The last sample is inside the series, not past its end.
        controller.MoveCursor(1);
        Assert.Equal(200d, Assert.Single(controller.Readout!.Charts[0].Series).Value!.Value, 9);
    }

    [Fact]
    public void A_single_sample_chart_is_insufficient_data_and_reads_only_at_its_own_coordinate()
    {
        // One recorded lap cannot be a line, and it says nothing about the laps around it.
        var panel = new ChartPanel("Fuel used", [new ChartSeries("Stint 1", [new(2, 3.4)])]);
        var controller = new ChartStackController(new ChartStack(ChartDomain.LapNumbers(1, 3), [panel]));

        Assert.Equal(ChartPanelState.InsufficientData, panel.State);

        controller.MoveCursor(2);
        Assert.Equal(3.4, Assert.Single(controller.Readout!.Charts[0].Series).Value!.Value, 9);

        controller.MoveCursor(1);
        Assert.Null(Assert.Single(controller.Readout!.Charts[0].Series).Value);

        controller.MoveCursor(3);
        Assert.Null(Assert.Single(controller.Readout!.Charts[0].Series).Value);
    }

    [Fact]
    public void An_empty_chart_reports_no_value_at_any_coordinate()
    {
        var panel = new ChartPanel("Tyre wear", [new ChartSeries("Front left", [])]);
        var controller = new ChartStackController(new ChartStack(ChartDomain.TrackPosition(), [panel]));

        Assert.Equal(ChartPanelState.Empty, panel.State);
        Assert.Equal(ChartPanelState.Empty, new ChartPanel("Tyre wear", []).State);

        controller.MoveCursor(0.5);
        Assert.Null(Assert.Single(controller.Readout!.Charts[0].Series).Value);
    }

    [Fact]
    public void One_populated_chart_keeps_the_stack_readable_beside_an_empty_one()
    {
        // Fuel is recorded for every lap; virtual energy only exists in some games, so its
        // chart has to be able to stand there stating that rather than faking a flat line.
        var fuel = new ChartPanel("Fuel used", [new ChartSeries("Stint 2", [new(1, 3.0), new(2, 3.2)])]);
        var energy = new ChartPanel("Virtual energy", [new ChartSeries("Stint 2", [])]);
        var stack = new ChartStack(ChartDomain.LapNumbers(1, 2), [fuel, energy]);
        var controller = new ChartStackController(stack);

        Assert.False(stack.IsEmpty);
        Assert.Equal(ChartPanelState.Ready, fuel.State);
        Assert.Equal(ChartPanelState.Empty, energy.State);

        controller.MoveCursor(2);
        var readout = controller.Readout!;
        Assert.Equal(3.2, Assert.Single(readout.Charts[0].Series).Value!.Value, 9);
        Assert.Null(Assert.Single(readout.Charts[1].Series).Value);

        // A stack where nothing was recorded is empty as a whole, so a host can say it once
        // instead of repeating the same message down every chart.
        Assert.True(new ChartStack(ChartDomain.LapNumbers(1, 2), [energy]).IsEmpty);
    }

    [Fact]
    public void A_recorded_lap_reference_curve_plots_on_track_position()
    {
        // A quarter-lap step with five stored times, so index i sits at position i * 0.25 and
        // elapsed time is exactly 80 * position.
        var curve = new LapReferenceCurve { PositionStep = 0.25, TimesSeconds = [0, 20, 40, 60, 80] };

        var series = LapReferenceCurveSeries.Create(curve, "Lap 14");

        Assert.Equal(5, series.Samples.Count);
        Assert.Equal(0.75, series.Samples[3].X, 9);
        Assert.Equal(60d, series.Samples[3].Y, 9);
        Assert.Equal(ChartInterpolation.Linear, series.Interpolation);

        var controller = new ChartStackController(new ChartStack(
            ChartDomain.TrackPosition(),
            [new ChartPanel("Elapsed", [series]) { Unit = "s" }]));
        controller.MoveCursor(0.62);

        // 80 * 0.62.
        Assert.Equal(49.6, Assert.Single(controller.Readout!.Charts[0].Series).Value!.Value, 6);

        // A curve that came back off disk unusable yields no samples, so the chart states
        // that rather than plotting one point as though it were a lap.
        Assert.Equal(
            ChartPanelState.Empty,
            new ChartPanel("Elapsed", [LapReferenceCurveSeries.Create(new LapReferenceCurve(), "Lap 15")]).State);
    }

    [Fact]
    public void Cursor_outside_a_series_reports_no_value_on_either_side()
    {
        // The series covers the middle of the lap only, so both edges of the shared domain
        // fall outside it. Holding the nearest sample would state a measurement at a
        // position nobody drove.
        var controller = new ChartStackController(new ChartStack(
            ChartDomain.TrackPosition(),
            [new ChartPanel("Speed", [new ChartSeries("Lap 14", [new(0.25, 50), new(0.75, 150)])])]));

        controller.MoveCursor(0.1);
        Assert.Null(Assert.Single(controller.Readout!.Charts[0].Series).Value);

        controller.MoveCursor(0.9);
        Assert.Null(Assert.Single(controller.Readout!.Charts[0].Series).Value);

        // Inside, the same series still reads: 100 * position + 25.
        controller.MoveCursor(0.5);
        Assert.Equal(100d, Assert.Single(controller.Readout!.Charts[0].Series).Value!.Value, 6);
    }
}

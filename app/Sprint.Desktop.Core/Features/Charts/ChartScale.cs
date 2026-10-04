using System.Globalization;

namespace Sprint.Desktop.Features.Charts;

/// <summary>
/// One chart's value scale: the range its plot covers and the step its labels land on.
/// <para>
/// The ends are rounded outward to a clean step instead of the data's own extremes plus a
/// percentage of padding. Padding produces axis labels like "216" and "-16" for a speed
/// trace — numbers nothing measured, and a floor below zero for a value that cannot go
/// there. A stable, clean scale is also what lets a live chart take new samples without
/// its axis moving under the reader.
/// </para>
/// </summary>
public sealed record ChartScale(double Min, double Max, double Step)
{
    private static readonly CultureInfo Inv = CultureInfo.InvariantCulture;

    /// <summary>The clean scale covering <paramref name="min"/>..<paramref name="max"/>.</summary>
    public static ChartScale For(double min, double max)
    {
        if (max < min)
        {
            (min, max) = (max, min);
        }

        if (max - min <= 0)
        {
            // A flat series still has to sit somewhere. Ten percent of its own magnitude keeps
            // the line off the frame without implying a range it never covered.
            var reach = Math.Max(Math.Abs(max) * 0.1, 1.0) / 2;
            min -= reach;
            max += reach;
        }

        // Two intervals is the target: three grid lines is as much chrome as a stacked chart
        // can carry before the grid competes with the data.
        var step = NiceStep((max - min) / 2);
        return new ChartScale(
            Math.Floor((min / step) + 1e-9) * step,
            Math.Ceiling((max / step) - 1e-9) * step,
            step);
    }

    public double Span => Max - Min;

    /// <summary>An axis label for a value on this scale, at the resolution the step supports.</summary>
    public string Format(double value) =>
        value.ToString("F" + Decimals().ToString(Inv), Inv);

    private int Decimals() => Step switch
    {
        >= 1 => 0,
        >= 0.1 => 1,
        _ => 2,
    };

    // The 1 / 2 / 5 ladder: the only multipliers whose multiples a reader adds up at a glance.
    private static double NiceStep(double raw)
    {
        if (raw <= 0 || double.IsNaN(raw) || double.IsInfinity(raw))
        {
            return 1;
        }

        var magnitude = Math.Pow(10, Math.Floor(Math.Log10(raw)));
        var normalized = raw / magnitude;
        var nice = normalized switch
        {
            <= 1 => 1,
            <= 2 => 2,
            <= 5 => 5,
            _ => 10,
        };
        return nice * magnitude;
    }
}

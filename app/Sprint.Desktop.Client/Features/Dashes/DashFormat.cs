using System.Globalization;

namespace Sprint.Desktop.Features.Dashes;

/// <summary>
/// Pure value formatters for the dash painter, ported from the Go
/// <c>widgets/format.go</c> defaults (metric units). Kept separate from the
/// painter so the formatting rules are unit-testable in isolation.
/// </summary>
public static class DashFormat
{
    private static readonly CultureInfo Inv = CultureInfo.InvariantCulture;

    /// <summary>Lap/best/last time in seconds → <c>m:ss.mmm</c>, or a placeholder when not set.</summary>
    public static string Lap(double seconds)
    {
        if (seconds <= 0 || double.IsNaN(seconds) || double.IsInfinity(seconds))
        {
            return "--:--.---";
        }

        // Round to whole milliseconds FIRST, then split — otherwise truncating
        // minutes and rounding the seconds remainder can yield ":60.000" for a
        // value a fraction of a millisecond below a whole minute.
        var totalMs = (long)Math.Round(seconds * 1000.0, MidpointRounding.AwayFromZero);
        var minutes = totalMs / 60_000;
        var secs = totalMs % 60_000 / 1000;
        var millis = totalMs % 1000;
        return string.Create(Inv, $"{minutes}:{secs:00}.{millis:000}");
    }

    /// <summary>Signed lap delta in seconds → <c>+0.000</c> / <c>-0.000</c> / <c>0.000</c> (3dp, dead-band rounded).</summary>
    public static string Delta(double seconds)
    {
        if (double.IsNaN(seconds) || double.IsInfinity(seconds))
        {
            return "0.000";
        }

        var rounded = Math.Round(seconds, 3, MidpointRounding.AwayFromZero);
        if (Math.Abs(rounded) < 0.001)
        {
            return "0.000";
        }

        return rounded > 0
            ? string.Create(Inv, $"+{rounded:0.000}")
            : string.Create(Inv, $"{rounded:0.000}");
    }

    /// <summary>Speed in m/s → integer km/h.</summary>
    public static string SpeedKph(double metersPerSecond) =>
        ((int)Math.Round(metersPerSecond * 3.6)).ToString(Inv);

    /// <summary>Celsius → one decimal place.</summary>
    public static string Temp(double celsius) => celsius.ToString("0.#", Inv);

    /// <summary>Gear index → driver-facing glyph (N neutral, R reverse, otherwise the number).</summary>
    public static string Gear(int gear) => gear switch
    {
        0 => "N",
        < 0 => "R",
        _ => gear.ToString(Inv),
    };

    public static string Int(double value) => ((long)value).ToString(Inv);

    public static string Fuel(double liters) => liters.ToString("0.0", Inv);

    public static string FuelPerLap(double liters) => liters.ToString("0.00", Inv);
}

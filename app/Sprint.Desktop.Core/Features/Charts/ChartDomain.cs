using System.Globalization;

namespace Sprint.Desktop.Features.Charts;

/// <summary>What a chart stack's shared X axis measures.</summary>
public enum ChartDomainKind
{
    /// <summary>Fraction of a lap, 0..1. The domain lap comparisons belong on.</summary>
    TrackPosition,

    /// <summary>Completed lap number. The domain stint trends belong on.</summary>
    LapNumber,

    /// <summary>Elapsed session time in seconds.</summary>
    SessionTime,

    /// <summary>
    /// Metres along the lap. The domain a <em>stretch</em> of track belongs on: where a driver
    /// lifted and where they got back on is a distance, and over a 600 m window a lap fraction
    /// reads as four indistinguishable decimal places.
    /// </summary>
    TrackDistance,
}

/// <summary>
/// The shared X axis of one chart stack: what it measures and the span it covers.
/// <para>
/// Pluggable rather than fixed because the same stacking mechanics serve two different
/// readings. A lap comparison must sit on <see cref="ChartDomainKind.TrackPosition"/>: two
/// laps drift apart in time, so on a time axis the same corner lands at a different X in
/// each chart and the shared crosshair stops meaning anything. A stint trend belongs on
/// <see cref="ChartDomainKind.LapNumber"/>.
/// </para>
/// </summary>
public sealed record ChartDomain(ChartDomainKind Kind, double Min, double Max)
{
    private static readonly CultureInfo Inv = CultureInfo.InvariantCulture;

    /// <summary>A whole lap as a fraction of the track, matching <c>LapReferenceCurve</c> positions.</summary>
    public static ChartDomain TrackPosition() => new(ChartDomainKind.TrackPosition, 0, 1);

    /// <summary>A run of completed laps, inclusive of both ends.</summary>
    public static ChartDomain LapNumbers(int first, int last) =>
        new(ChartDomainKind.LapNumber, first, Math.Max(first, last));

    /// <summary>A span of elapsed session time, in seconds.</summary>
    public static ChartDomain SessionTime(double fromSeconds, double toSeconds) =>
        new(ChartDomainKind.SessionTime, fromSeconds, Math.Max(fromSeconds, toSeconds));

    /// <summary>
    /// A stretch of track in metres. Deliberately not clamped to the lap: the Live Compare
    /// window runs from behind the car to ahead of it, and past the start/finish line the
    /// stretch ahead is the next lap's opening metres. Clamping there would stall the window
    /// exactly where the driver most needs it to keep scrolling.
    /// </summary>
    public static ChartDomain TrackDistance(double fromMeters, double toMeters) =>
        new(ChartDomainKind.TrackDistance, fromMeters, Math.Max(fromMeters, toMeters));

    /// <summary>The descriptive name of the axis, for a host's heading or selector.</summary>
    public string Label => Kind switch
    {
        ChartDomainKind.TrackPosition => "Track position",
        ChartDomainKind.LapNumber => "Lap number",
        ChartDomainKind.TrackDistance => "Track distance",
        _ => "Session time",
    };

    /// <summary>
    /// The name drawn in the axis band itself. Short because it shares a narrow gutter with
    /// the value labels, and a title long enough to be clipped there says less than one that
    /// fits beside ticks already carrying the unit.
    /// </summary>
    public string AxisLabel => Kind switch
    {
        ChartDomainKind.TrackPosition => "Position",
        ChartDomainKind.LapNumber => "Lap",
        ChartDomainKind.TrackDistance => "Distance",
        _ => "Time",
    };

    /// <summary>The span the axis covers. Zero for a degenerate single-coordinate domain.</summary>
    public double Span => Max - Min;

    /// <summary>
    /// The coordinate a raw pointer position reads as. A lap number is whole by
    /// construction, so a cursor between two laps has to resolve to one of them rather than
    /// report a lap 3.4 that never existed.
    /// </summary>
    public double Snap(double value) => Kind == ChartDomainKind.LapNumber
        ? Math.Round(value, MidpointRounding.AwayFromZero)
        : value;

    /// <summary>
    /// Up to <paramref name="max"/> coordinates to label the axis at. A discrete domain only
    /// ticks on coordinates it actually has: an evenly spaced tick over laps 1..8 would sit
    /// at 2.75 and be labelled "Lap 3", pointing at a lap that is somewhere else.
    /// </summary>
    public IReadOnlyList<double> Ticks(int max)
    {
        if (max < 2 || Span <= 0)
        {
            return [Min];
        }

        if (Kind == ChartDomainKind.LapNumber)
        {
            var laps = (int)Math.Round(Span) + 1;
            var stride = Math.Max(1, (int)Math.Ceiling((double)laps / max));
            var ticks = new List<double>();
            for (var lap = Min; lap <= Max + 1e-9; lap += stride)
            {
                ticks.Add(lap);
            }

            return ticks;
        }

        return [.. Enumerable.Range(0, max).Select(i => Min + (Span * i / (max - 1)))];
    }

    /// <summary>The cursor/tick label for a coordinate on this axis.</summary>
    public string Format(double value) => Kind switch
    {
        ChartDomainKind.TrackPosition => string.Create(Inv, $"{value * 100:0.0}%"),
        ChartDomainKind.LapNumber => string.Create(Inv, $"Lap {value:0}"),
        // Whole metres: the window is a few hundred long, so a decimal would be noise, and a
        // negative reading before the line is honest — that stretch is behind the car.
        ChartDomainKind.TrackDistance => string.Create(Inv, $"{value:0} m"),
        _ => FormatSessionTime(value),
    };

    // Endurance sessions run for hours, so minutes-and-seconds alone would collapse hour
    // three onto hour one. The hour field only appears once there is one.
    private static string FormatSessionTime(double seconds)
    {
        var total = (long)Math.Round(Math.Max(0, seconds), MidpointRounding.AwayFromZero);
        var hours = total / 3600;
        var minutes = total % 3600 / 60;
        var secs = total % 60;
        return hours > 0
            ? string.Create(Inv, $"{hours}:{minutes:00}:{secs:00}")
            : string.Create(Inv, $"{minutes}:{secs:00}");
    }
}

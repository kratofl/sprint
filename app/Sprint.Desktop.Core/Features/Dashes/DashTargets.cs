namespace Sprint.Desktop.Features.Dashes;

/// <summary>
/// What the driver planned to be aiming at, as the dash reads it (#189): the third member of
/// <see cref="DashBindingContext"/>, surfaced as the <c>target.*</c> bindings.
/// <para>
/// These describe a <em>plan</em>, not a car, which is why they are here and not on
/// <c>TelemetryFrame</c>: putting them there would force the game adapter, the demo source,
/// <c>packages/types</c> and the API to carry fields no telemetry source can ever fill.
/// </para>
/// <para>
/// Every member is nullable and every unset one means <b>no target</b> — never zero. A widget
/// bound to an absent target shows its no-data state, because "aim at 0.00 L/lap" and "you
/// did not plan a fuel figure" are different claims.
/// </para>
/// <para>
/// The lap reference is deliberately <em>not</em> here. A position-relative delta can only be
/// computed inside <c>DeltaTracker</c>, so a chosen lap's curve goes there and keeps surfacing
/// through the existing <c>lap.delta</c> / <c>lap.target</c> bindings.
/// </para>
/// </summary>
public sealed record DashTargets
{
    /// <summary>Nothing planned — every binding resolves to absent.</summary>
    public static DashTargets None { get; } = new();

    /// <summary>The planned lap time in seconds, from the target lap of either tier.</summary>
    public double? LapTimeSeconds { get; init; }

    /// <summary>The planned fuel use per lap in litres — a target, never the current burn.</summary>
    public double? FuelPerLapLiters { get; init; }

    /// <summary>True when no target at all is set, so the dash can say so once rather than per binding.</summary>
    public bool IsEmpty => LapTimeSeconds is null && FuelPerLapLiters is null;
}

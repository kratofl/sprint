using Sprint.Desktop.Api.Telemetry;
using Sprint.Desktop.Features.SessionPlanning;
using Xunit;

namespace Sprint.Desktop.Tests;

/// <summary>
/// The car's own readings in a lap's trace: engine, fuel and energy, each wheel corner, damage.
/// They ride on the same grid as the driver's inputs, and only what the game reported is written.
/// </summary>
public sealed class LapTraceCarTests
{
    [Fact]
    public void WhatTheCarReportedIsOnTheLapsGridAndWhatItNeverReportedIsNot()
    {
        // A GT3 in a game without damage: no hybrid, so its energy channels stay zero all lap.
        LapChannelTrace? trace = LapChannelTrace.FromSamples(Lap(_ => null), 90.0, 5000.0);

        Assert.NotNull(trace);
        Assert.Equal(7000.0, trace.ValueAt("rpm", 0.5) ?? double.NaN, 1.0);
        Assert.Equal(40.0, trace.ValueAt("fuel", 0.5) ?? double.NaN, 0.1);
        Assert.Equal(85.0, trace.ValueAt("tyreTempInnerFL", 0.5) ?? double.NaN, 0.1);
        Assert.Equal(425.0, trace.ValueAt("brakeTempRR", 0.5) ?? double.NaN, 0.5);
        Assert.True(trace.TryGetChannel("suspensionRL", out float[] _));
        // A lap without touching the clutch is still a reading.
        Assert.Equal([0f], trace.Channels["clutch"].Distinct());

        Assert.False(trace.TryGetChannel("virtualEnergy", out float[] _));
        Assert.False(trace.TryGetChannel("battery", out float[] _));
        Assert.False(trace.TryGetChannel("dent0", out float[] _));
        Assert.False(trace.TryGetChannel("flatFL", out float[] _));
        Assert.Equal(trace.SampleCount, trace.Channels["rpm"].Length);
    }

    [Fact]
    public void AStateIsHeldUntilItChangesNeverBlended()
    {
        // A hit at 60 % of the lap dents the front, and the left front runs over a kerb from 40 %.
        LapChannelTrace? trace = LapChannelTrace.FromSamples(
            Lap(
                position => new DamageState
                {
                    Dents = position < 0.6 ? [0, 0, 0, 0, 0, 0, 0, 0] : [2, 0, 0, 0, 0, 0, 0, 0],
                    LastImpactMagnitude = position < 0.6 ? 0 : 5200,
                },
                position => position < 0.4 ? TireSurface.Dry : TireSurface.RumbleStrip),
            90.0,
            5000.0);

        Assert.NotNull(trace);
        Assert.Equal([0f, 2f], trace.Channels["dent0"].Distinct());
        Assert.Equal([0f, 5200f], trace.Channels["impactMagnitude"].Distinct());
        Assert.Equal([(float)TireSurface.Dry, (float)TireSurface.RumbleStrip], trace.Channels["surfaceFL"].Distinct());
        // A wheel that stayed on is a reading once the game reports damage at all.
        Assert.Equal([0f], trace.Channels["detachedFR"].Distinct());
    }

    [Fact]
    public void ThePagesReadTheTraceWithoutTheCarsReadings()
    {
        LapChannelTrace? trace = LapChannelTrace.FromSamples(Lap(_ => new DamageState()), 90.0, 5000.0);
        LapChannelTrace? plain = LapChannelTrace.FromSamples([.. Lap(_ => null).Select(sample => sample with { Car = null })], 90.0, 5000.0);

        Assert.NotNull(trace);
        Assert.NotNull(plain);
        Assert.True(trace.Channels.Count > plain.Channels.Count + 30);

        LapChannelTrace drawn = LapTraceCar.Without(trace);

        Assert.Equal(plain.Channels.Keys.Order(StringComparer.Ordinal), drawn.Channels.Keys.Order(StringComparer.Ordinal));
        Assert.Equal(trace.PositionStep, drawn.PositionStep);
        // A car channel named like one the pages draw would be dropped with the rest.
        Assert.DoesNotContain(plain.Channels.Keys, LapTraceCar.Has);
    }

    /// <summary>
    /// One synthetic lap sampled every 0.1 % of the track, the car's readings read off a frame as
    /// the recorder does: rpm 4000 -> 10000, fuel 50 -> 30 l, tyres 80 -> 90 °C, brakes 400 -> 450 °C.
    /// </summary>
    private static List<LapTraceSample> Lap(
        Func<double, DamageState?> damage,
        Func<double, TireSurface>? frontLeftSurface = null)
    {
        List<LapTraceSample> samples = [];
        for (int i = 0; i <= 1000; i++)
        {
            double position = i / 1000.0;
            TelemetryFrame frame = new()
            {
                Car = new CarState
                {
                    Rpm = (float)(4000 + (6000 * position)),
                    FuelLiters = (float)(50 - (20 * position)),
                },
                Tires =
                [
                    .. Enum.GetValues<TirePosition>().Select(corner => new TireState
                    {
                        Position = corner,
                        TempInnerCelsius = (float)(80 + (10 * position)),
                        BrakeTempCelsius = (float)(400 + (50 * position)),
                        SuspensionDeflectionMeters = 0.03f,
                        Surface = corner == TirePosition.FrontLeft && frontLeftSurface is not null
                            ? frontLeftSurface(position)
                            : TireSurface.Dry,
                    }),
                ],
                Damage = damage(position),
            };

            samples.Add(new LapTraceSample(
                position,
                (float)(100 + (200 * position)),
                (float)(1 - position),
                (float)position,
                (float)((2 * position) - 1),
                1 + (int)(position * 7),
                90.0 * position,
                Car: LapTraceCar.Read(frame)));
        }

        return samples;
    }
}

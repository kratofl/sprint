using Sprint.Desktop.Api.Telemetry;
using Sprint.Games.LeMansUltimate;
using Xunit;

namespace Sprint.Desktop.Tests;

/// <summary>
/// The LMU fields the pit wall added: weather, the car's damage and tank, and every car's
/// compound. Offsets come from walking the game's InternalsPlugin.hpp under #pragma pack(4); a
/// synthetic buffer proves the parser reads where that walk says, not that the game writes there.
/// </summary>
public sealed class LmuPitWallTelemetryTests
{
    [Fact]
    public void Lmu_source_reads_weather_damage_tank_and_each_cars_compound()
    {
        byte[] buffer = new byte[LmuBinary.TotalBufferSize];
        int scoring = LmuBinary.ScoringStart;
        buffer[scoring + 115] = 1; // mInRealtime
        buffer[LmuBinary.PlayerHasVehicleOffset] = 1;
        BitConverter.TryWriteBytes(buffer.AsSpan(scoring + 104), 2); // mNumVehicles
        // ScoringInfoV01: mDarkCloud@212, mRaining@220, mAmbientTemp@228, mTrackTemp@236.
        BitConverter.TryWriteBytes(buffer.AsSpan(scoring + 220), 0.4);
        BitConverter.TryWriteBytes(buffer.AsSpan(scoring + 228), 21.5);
        BitConverter.TryWriteBytes(buffer.AsSpan(scoring + 236), 33.0);
        BitConverter.TryWriteBytes(buffer.AsSpan(LmuBinary.VehicleScoringBase), 11);
        BitConverter.TryWriteBytes(buffer.AsSpan(LmuBinary.VehicleScoringBase + LmuBinary.VehicleScoringSize), 22);

        // SharedMemoryTelemetryData: activeVehicles, then the entries in their own order (not scoring's).
        buffer[LmuBinary.TelemetryStart] = 2;
        int player = LmuBinary.TelemetryInfoBase;
        int other = player + LmuBinary.VehicleTelemetrySize;
        BitConverter.TryWriteBytes(buffer.AsSpan(player), 22);
        BitConverter.TryWriteBytes(buffer.AsSpan(other), 11);
        "Soft"u8.CopyTo(buffer.AsSpan(player + 620));
        "Medium"u8.CopyTo(buffer.AsSpan(other + 620));
        // TelemInfoV01: mOverheating@541, mDetached@542, mDentSeverity[8]@544, mLastImpactET@552,
        // mLastImpactMagnitude@560, mFuelCapacity@608.
        buffer[player + 541] = 1;
        buffer[player + 542] = 1;
        new byte[] { 0, 1, 2, 0, 0, 0, 0, 1 }.CopyTo(buffer.AsSpan(player + 544));
        BitConverter.TryWriteBytes(buffer.AsSpan(player + 552), 512.25);
        BitConverter.TryWriteBytes(buffer.AsSpan(player + 560), 3.5);
        BitConverter.TryWriteBytes(buffer.AsSpan(player + 608), 90.0);

        using LeMansUltimateTelemetrySource source = new(new InMemoryLmuSnapshotProvider(buffer));
        source.Connect();

        Assert.True(source.TryRead(out TelemetryFrame? frame));
        Assert.Equal(0.4, frame.Conditions.Raining);
        Assert.Equal(21.5, frame.Conditions.AirTemperatureCelsius);
        Assert.Equal(33.0, frame.Conditions.TrackTemperatureCelsius);
        Assert.Equal(90f, frame.Car.FuelCapacityLiters);
        DamageState damage = Assert.IsType<DamageState>(frame.Damage);
        Assert.Equal(new[] { 0, 1, 2, 0, 0, 0, 0, 1 }, damage.Dents);
        Assert.Equal(512.25, damage.LastImpactSessionTime);
        Assert.Equal(3.5, damage.LastImpactMagnitude);
        Assert.True(damage.Overheating && damage.DetachedParts);
        Assert.Equal(
            new Dictionary<int, string?> { [11] = "Medium", [22] = "Soft" },
            (frame.Field ?? []).ToDictionary(car => car.Id, car => car.Compound));
    }

    [Fact]
    public void Lmu_source_reports_no_weather_before_a_track_is_loaded()
    {
        using LeMansUltimateTelemetrySource source = new(new InMemoryLmuSnapshotProvider(new byte[LmuBinary.TotalBufferSize]));
        source.Connect();

        Assert.True(source.TryRead(out TelemetryFrame? frame));
        Assert.Null(frame.Conditions.AirTemperatureCelsius);
        Assert.Null(frame.Conditions.TrackTemperatureCelsius);
        Assert.Null(frame.Damage);
    }
}

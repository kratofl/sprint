using System.Text;
using System.Text.Json;
using Sprint.Desktop.Api.Telemetry;
using Xunit;

namespace Sprint.Desktop.Host.Tests;

/// <summary>
/// Pins the telemetry JSON the dash renderer reads. The renderer (Rust) narrows each field
/// leniently, so a renamed C# property would silently read as 0 on the wheel. This test keeps
/// packages/dashboard/renderer/tests/fixtures/host-frame.json equal to what
/// <see cref="DashFrameJson"/> writes for a frame in which every field the renderer reads has a
/// distinctive value; the crate's tests/host_frame.rs then checks that each of those values arrives.
/// Renaming a property changes the fixture here, and the Rust test fails until model.rs follows.
/// </summary>
public sealed class HostFrameFixtureTests
{
    /// <summary>Set to 1 to rewrite the fixture from the current serializer instead of failing.</summary>
    private const string UpdateVariable = "SPRINT_UPDATE_HOST_FRAME_FIXTURE";

    [Fact]
    public void TheRenderersFixtureIsWhatTheHostWritesForADashFrame()
    {
        string expected = Serialize(Frame());
        string path = Path.Combine(FixtureDirectory, "host-frame.json");
        if (Environment.GetEnvironmentVariable(UpdateVariable) == "1")
        {
            Directory.CreateDirectory(FixtureDirectory);
            File.WriteAllText(path, expected);
        }

        string actual = File.Exists(path) ? File.ReadAllText(path).Replace("\r\n", "\n", StringComparison.Ordinal) : "";
        Assert.True(
            expected == actual,
            $"{path} is not what the host writes for a dash frame (DashFrameJson). If the change to TelemetryFrame is intended, "
            + $"run this test with {UpdateVariable}=1 to rewrite the fixture, then make packages/dashboard/renderer/src/model.rs "
            + "read the new names until `cargo test` (tests/host_frame.rs) passes.");
    }

    [Fact]
    public void ADashFrameLeavesTheOtherCarsOut()
    {
        using JsonDocument written = JsonDocument.Parse(Serialize(Frame()));

        Assert.Equal(JsonValueKind.Null, written.RootElement.GetProperty("field").ValueKind);
        Assert.Equal("Qualify", written.RootElement.GetProperty("session").GetProperty("sessionType").GetString());
    }

    // The exact DashFrameJson output, re-indented so the fixture reads (and diffs) by line; the
    // names, order and values are the wire's.
    private static string Serialize(TelemetryFrame frame)
    {
        using MemoryStream compact = new();
        using (Utf8JsonWriter writer = new(compact))
        {
            DashFrameJson.Write(writer, frame, HostJson.Create());
        }

        using JsonDocument document = JsonDocument.Parse(compact.ToArray());
        using MemoryStream indented = new();
        using (Utf8JsonWriter writer = new(indented, new JsonWriterOptions { Indented = true, NewLine = "\n" }))
        {
            document.WriteTo(writer);
        }

        return Encoding.UTF8.GetString(indented.ToArray()) + "\n";
    }

    /// <summary>
    /// Every field the renderer reads, set to a value no other field has and no default matches:
    /// flags that default to false are true (and <c>IsValid</c>, which defaults to true, is false),
    /// enums are not their first member, and the tyres are listed out of order so their placement
    /// by position name is pinned too. The other cars and the damage are set to show what is left out.
    /// </summary>
    private static TelemetryFrame Frame() => new()
    {
        Timestamp = new DateTimeOffset(2026, 6, 14, 15, 2, 0, TimeSpan.Zero),
        Session = new SessionInfo
        {
            Game = "Fixture Game",
            Track = "Fixture Track",
            TrackLengthMeters = 5001.5,
            Car = "Fixture Car",
            CarClass = "Fixture Class",
            CarType = "Fixture Type",
            CarChampionship = "Fixture Championship",
            SessionType = SessionType.Qualify,
            SessionTime = 101.5,
            TotalSessionTime = 3600.5,
            SessionTimeRemaining = 1800.25,
            BestLapTime = 99.25,
            MaxLaps = 27,
            InCar = true,
        },
        Car = new CarState
        {
            SpeedMetersPerSecond = 61.5f,
            Gear = 1,
            Rpm = 7250,
            MaxRpm = 8750,
            Throttle = 0.75f,
            Brake = 0.25f,
            Clutch = 0.125f,
            Steering = -0.375f,
            FuelLiters = 42.5f,
            FuelPerLapLiters = 2.75f,
            PositionX = 11.5f,
            PositionY = 12.5f,
            PositionZ = 13.5f,
            BrakeBiasRear = 0.5625f,
            InGarage = true,
            InPitLane = true,
            PitState = PitState.Stopped,
            PitLimiter = true,
        },
        Tires = [Tire(TirePosition.RearRight, 3), Tire(TirePosition.FrontLeft, 0), Tire(TirePosition.RearLeft, 2), Tire(TirePosition.FrontRight, 1)],
        Lap = new LapState
        {
            CurrentLap = 26,
            CurrentLapTime = 48.5,
            LastLapTime = 104.25,
            BestLapTime = 103.75,
            TargetLapTime = 103.5,
            Delta = -0.125,
            Sector = 2,
            LastLapSectorsSeconds = [31.5, 35.25, 37.5],
            IsValid = false,
            TrackPosition = 0.4375f,
        },
        Flags = new RaceFlags { Yellow = true, DoubleYellow = true, Red = true, SafetyCar = true, VirtualSafetyCar = true, Checkered = true },
        Electronics = new ElectronicsState
        {
            TractionControlActive = true,
            TractionControl = 3,
            TractionControlMax = 11,
            TractionControlSlip = 4,
            TractionControlSlipMax = 12,
            TractionControlCut = 5,
            TractionControlCutMax = 13,
            Abs = 6,
            AbsMax = 14,
            MotorMap = 7,
            MotorMapMax = 15,
            Migration = 8,
            MigrationMax = 16,
            FrontAntiRollBar = 9,
            FrontAntiRollBarMax = 17,
            RearAntiRollBar = 10,
            RearAntiRollBarMax = 18,
            DrsActive = true,
        },
        Race = new RaceState { Position = 25, TotalPositions = 31, GapAhead = 1.5f, GapBehind = 2.25f },
        Energy = new EnergyState { VirtualEnergy = 68.5f, VirtualEnergyPerLap = 3.375f, StateOfCharge = 0.625f, RegenPower = 18.5f, DeployPower = 92.5f },
        Penalties = new PenaltiesState { Incidents = 19, TrackLimitSteps = 20, PitStops = 22 },
        Conditions = new SessionConditions
        {
            PathWetness = 0.3125,
            TrackGripLevel = 0.875,
            FuelMultiplier = 1.75,
            TireMultiplier = 2.125,
            FixedSetup = true,
            AirTemperatureCelsius = 21.5,
            TrackTemperatureCelsius = 33.5,
            Raining = 0.5,
        },
        Damage = new DamageState { Dents = [0, 1, 2, 0, 1, 2, 0, 1], LastImpactSessionTime = 95.5, LastImpactMagnitude = 1250.5, Overheating = true, DetachedParts = true },
        Field = [new FieldCar { Id = 9, Driver = "Someone Else", Car = "Other Car", CarClass = "Fixture Class", Place = 4, ClassPlace = 4 }],
    };

    // Tyre n of the four (FrontLeft = 0): temperatures 8n1..8n5 °C, pressure 16n.5 kPa, wear 1n.25 %.
    private static TireState Tire(TirePosition position, int n) => new()
    {
        Position = position,
        TempInnerCelsius = 81 + (10 * n),
        TempMiddleCelsius = 82 + (10 * n),
        TempOuterCelsius = 83 + (10 * n),
        TempSurfaceCelsius = 84 + (10 * n),
        TempCoreCelsius = 85 + (10 * n),
        PressureKPa = 160.5f + (10 * n),
        WearPercent = 10.25f + n,
        Compound = $"Compound {position}",
        LoadNewtons = 3000.5f + n,
        Surface = TireSurface.Dry,
    };

    private static string FixtureDirectory =>
        Path.Combine(RepoRoot, "packages", "dashboard", "renderer", "tests", "fixtures");

    private static string RepoRoot
    {
        get
        {
            for (DirectoryInfo? dir = new(AppContext.BaseDirectory); dir is not null; dir = dir.Parent)
            {
                if (Directory.Exists(Path.Combine(dir.FullName, "packages", "dashboard", "renderer")))
                {
                    return dir.FullName;
                }
            }

            throw new DirectoryNotFoundException("Could not find the repository root containing packages/dashboard/renderer.");
        }
    }
}

using Sprint.Desktop.Api.Games;
using Sprint.Desktop.Api.Telemetry;
using Sprint.Desktop.Features.Setup;
using Sprint.Games.LeMansUltimate.Setups;
using Xunit;

namespace Sprint.Desktop.Tests;

/// <summary>
/// The Setups pages' reading of the game's setups: how a value reads and where it sits, what
/// a setup's name says, and the versions kept when the game overwrites a file. Fixtures live
/// in a temp folder; the game's own directory is never read.
/// </summary>
public sealed class SetupLibraryTests : IDisposable
{
    private readonly string _root = Path.Combine(Path.GetTempPath(), "sprint-setup-library-" + Guid.NewGuid().ToString("N"));

    public SetupLibraryTests() => Directory.CreateDirectory(this._root);

    public void Dispose()
    {
        try
        {
            Directory.Delete(this._root, recursive: true);
        }
        catch (IOException)
        {
            // Best-effort temp cleanup; a locked file must not fail the test run.
        }
    }

    /// <summary>Lines shaped like the ones Le Mans Ultimate writes: an index, then the value it reads as.</summary>
    private static string Svm(int frontCamber, string camber) => $"""
        VehicleClassSetting="Hypercar Porsche_963 WEC2024"
        UpgradeSetting=(924,0,0,0)
        //Note: settings commented out if using the default

        [GENERAL]
        Notes=""
        CGHeightSetting=0//Non-adjustable
        FuelCapacitySetting=0//17.0L (5.1 laps)

        [REARWING]
        RWSetting=11//P12

        [SUSPENSION]
        FrontAntiSwaySetting=1//P1
        Front3rdSlowBumpSetting=5//6
        LeftCasterSetting=0//N/V

        [CONTROLS]
        RearBrakeSetting=18//51.9:48.1

        [FRONTLEFT]
        CamberSetting={frontCamber}//{camber}
        PressureSetting=0//131 kPa
        FastReboundSetting=3//4

        [BASIC]
        Downforce=0.500000
        """;

    [Fact]
    public void A_value_reads_as_the_game_wrote_it_on_the_tab_it_belongs_to()
    {
        this.Write("Spa", "Race v3", Svm(30, "-1.0 deg"), new DateTime(2026, 10, 30, 19, 12, 0, DateTimeKind.Utc));
        LmuSetupRepository repository = new(Path.Combine(this._root, "game"));
        GameSetupSnapshot read = repository.Read(Assert.Single(repository.ListSetups()))!;

        List<GameSetupReading> readings = [.. read.Values.Select(repository.Describe).OfType<GameSetupReading>()];

        // Headers, notes, the BASIC sliders and settings the car cannot change ("N/V" is the
        // German game's "N/A") are not values the driver sets.
        Assert.Equal(
            [
                (SetupTab.Power, "Fuel and energy", "Fuel", "17.0L (5.1 laps)", 0),
                (SetupTab.ChassisAndAero, "Aero", "Rear wing", "P12", 11),
                (SetupTab.Suspension, "Front", "Anti-roll bar", "P1", 1),
                (SetupTab.Dampers, "Front", "Third slow bump", "6", 5),
                (SetupTab.WheelsAndBrakes, "Brakes", "Brake bias", "51.9:48.1", 18),
                (SetupTab.Suspension, "Front left", "Camber", "-1.0 deg", 30),
                (SetupTab.WheelsAndBrakes, "Front left", "Tyre pressure", "131 kPa", 0),
                (SetupTab.Dampers, "Front left", "Fast rebound", "4", 3),
            ],
            readings.Select(reading => (reading.Tab, reading.Group, reading.Label, reading.Display, reading.Step ?? -1)));
    }

    [Theory]
    [InlineData("Hypercar Porsche_963 WEC2024", "Porsche 963", "Hypercar", "WEC 2024")]
    [InlineData("ELMS2025 LMP2_ELMS Oreca_07", "Oreca 07", "LMP2", "ELMS 2025")]
    [InlineData("BMW_M4_LMGT3 GT3 WEC2026", "BMW M4 LMGT3", "GT3", "WEC 2026")]
    public void A_vehicle_descriptor_splits_into_car_class_and_season(string descriptor, string car, string carClass, string season)
    {
        Assert.Equal(new GameSetupVehicle(car, carClass, season), new LmuSetupRepository(this._root).DescribeVehicle(descriptor));
    }

    [Theory]
    [InlineData("bA2_963_BAHE_E_Q_V2_0_0", SetupSession.Quali, SetupStyle.Esport, "2.0.0")]
    [InlineData("bA2_911_GT3_R_SPA_W_R_V1_1_0", SetupSession.Race, SetupStyle.Wet, "1.1.0")]
    [InlineData("bA_963_SPA_S_R06", SetupSession.Race, SetupStyle.Safe, "6")]
    [InlineData("Race wet", SetupSession.Race, SetupStyle.Wet, null)]
    [InlineData("Quali v3", SetupSession.Quali, null, "3")]
    public void A_setup_name_says_its_session_style_and_version(string name, SetupSession session, SetupStyle? style, string? version)
    {
        Assert.Equal(new SetupNameParts(session, style, version), SetupNaming.Read(name));
    }

    [Fact]
    public void A_name_that_says_nothing_has_no_parts()
    {
        Assert.Equal(new SetupNameParts(null, null, null), SetupNaming.Read("Low drag"));
    }

    [Fact]
    public void A_file_the_game_overwrote_keeps_its_old_version()
    {
        string path = this.Write("Spa", "Race v3", Svm(30, "-1.0 deg"), new DateTime(2026, 10, 28, 9, 0, 0, DateTimeKind.Utc));
        SetupLibrary library = this.Library();

        SetupListItem first = Assert.Single(library.List());
        Assert.Equal(1, first.Versions);
        Assert.Equal("Porsche 963", first.Car);
        Assert.Equal(SetupSession.Race, first.Session);

        File.WriteAllText(path, Svm(28, "-1.2 deg"));
        File.SetLastWriteTimeUtc(path, new DateTime(2026, 10, 30, 19, 12, 0, DateTimeKind.Utc));

        SetupSheet now = library.Sheet(first.Id)!;
        Assert.Equal(2, now.Setup.Versions);
        Assert.Equal("-1.2 deg", Camber(now));
        Assert.Equal([true, false], now.Versions.Select(version => version.IsCurrent));

        SetupSheet before = library.Sheet(first.Id, now.Versions[1].Id)!;
        Assert.Equal("-1.0 deg", Camber(before));

        // A new library over the same store still knows the old version.
        Assert.Equal(2, Assert.Single(this.Library().List()).Versions);
    }

    [Fact]
    public void Saving_the_same_contents_again_is_not_a_new_version()
    {
        string path = this.Write("Spa", "Quali", Svm(30, "-1.0 deg"), new DateTime(2026, 10, 28, 9, 0, 0, DateTimeKind.Utc));
        SetupLibrary library = this.Library();
        Assert.Single(library.List());

        File.SetLastWriteTimeUtc(path, new DateTime(2026, 10, 29, 9, 0, 0, DateTimeKind.Utc));

        Assert.Equal(1, Assert.Single(library.List()).Versions);
    }

    private static string Camber(SetupSheet sheet) => sheet.Readings.Single(reading => reading.Label == "Camber").Display;

    private SetupLibrary Library() =>
        new(new SetupGame(new LmuSetupRepository(Path.Combine(this._root, "game"))), new LocalSetupSnapshotStore(Path.Combine(this._root, "versions")));

    private string Write(string track, string name, string content, DateTime lastWriteUtc)
    {
        string directory = Path.Combine(this._root, "game", track);
        Directory.CreateDirectory(directory);
        string path = Path.Combine(directory, name + ".svm");
        File.WriteAllText(path, content);
        File.SetLastWriteTimeUtc(path, lastWriteUtc);
        return path;
    }

    /// <summary>A game that stores setups and nothing else.</summary>
    private sealed class SetupGame(ISetupRepository setups) : IGameProvider
    {
        public GameDescriptor Descriptor { get; } = new(Id: "lemansultimate", Name: "Le Mans Ultimate", Transport: "shared-memory", Available: false);

        public IResultsImporter? Results => null;

        public ISetupRepository? Setups { get; } = setups;

        public IScheduleSource? Schedule => null;

        public ITelemetrySource CreateTelemetrySource() => throw new NotSupportedException();
    }
}

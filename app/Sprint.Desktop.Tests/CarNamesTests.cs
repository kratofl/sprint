using Sprint.Desktop.Api.Games;
using Sprint.Desktop.Features.SessionPlanning;
using Xunit;

namespace Sprint.Desktop.Tests;

/// <summary>
/// Cars are named by what they are, not by the livery: class and make, and LMP2 — every car the
/// Oreca 07 — by championship. History filed under the old names is renamed once.
/// </summary>
public sealed class CarNamesTests
{
    [Theory]
    [InlineData("LMP2_ELMS", "ELMS 2026", "Oreca 07", "LMP2 ELMS")]
    [InlineData("LMP2", "WEC 2025", "Oreca 07", "LMP2 WEC")]
    [InlineData("Hyper", "WEC 2026", "BMW M Hybrid V8", "Hypercar BMW")]
    [InlineData("Hypercar", null, "Porsche 963", "Hypercar Porsche")]
    [InlineData("GT3", "WEC 2025", "Porsche 911 GT3 R LMGT3", "LMGT3 Porsche")]
    [InlineData("GT3", "ELMS 2025", "McLaren 720S LMGT3 Evo", "LMGT3 McLaren")]
    [InlineData("LMP3", "ELMS 2025", "Ligier JS P325", "LMP3 Ligier")]
    [InlineData("GTE", "WEC 2023", "Ferrari 488 GTE EVO", "LMGTE Ferrari")]
    [InlineData("Hyper", null, "Aston Martin Valkyrie LMH", "Hypercar Aston Martin")]
    [InlineData("Hyper", null, "Isotta Fraschini Tipo6-C", "Hypercar Isotta Fraschini")]
    [InlineData("GT3", null, "Mercedes-AMG LMGT3", "LMGT3 Mercedes-AMG")]
    public void ACarIsNamedByClassAndMakeAndLmp2ByChampionship(string carClass, string? championship, string carType, string expected)
    {
        Assert.Equal(expected, CarNames.Name(carClass, championship, carType));
    }

    [Theory]
    [InlineData("LMP2_ELMS", "ELMS 2025")]
    [InlineData("LMP2", "WEC 2024")]
    public void AnLmp2WithNoChampionshipIsNamedByTheSpecItsClassNames(string carClass, string championship)
    {
        // The championship outranks the class; without one, LMU's two LMP2 classes still say which car it is.
        string expected = CarNames.Name(carClass, championship, null) ?? "";

        Assert.Equal(expected, CarNames.Name(carClass, null, null));
        Assert.Equal(expected, CarNames.Name(carClass, "Unknown", null));
    }

    [Theory]
    [InlineData("PaceCar", "WEC 2026", "Safety Car")]
    [InlineData(null, "WEC 2026", "Porsche 963")]
    [InlineData("Hyper", "WEC 2026", null)]
    [InlineData("GT3", null, "  ")]
    public void ACarWithAnUnknownClassOrNoModelHasNoName(string? carClass, string? championship, string? carType)
    {
        Assert.Null(CarNames.Name(carClass, championship, carType));
    }

    [Fact]
    public void Former_names_map_a_recorded_livery_and_an_imported_model_to_the_current_name()
    {
        LapHistorySession recorded = new()
        {
            Context = new LapHistoryContext { CarModel = "LMP2 ELMS", CarType = "Oreca 07", Livery = "Oreca 07:#22 United Autosports" },
        };
        LapHistorySession imported = new()
        {
            Origin = LapHistoryOrigin.Imported,
            Context = new LapHistoryContext { CarModel = "LMP2 ELMS", CarType = "Oreca 07" },
        };

        IReadOnlyDictionary<string, string> names = StoredCarNames.FormerNames([recorded, imported]);

        Assert.Equal("LMP2 ELMS", names["Oreca 07:#22 United Autosports"]);
        Assert.Equal("LMP2 ELMS", names["Oreca 07"]);
    }

    [Fact]
    public void AStoredLmp2IsNamedByItsClassEvenWhenTheArchiveNeverSawItsLivery()
    {
        LapHistorySession session = Recorded("DKR Engineering #3:ELMS26", "LMP2_ELMS");
        StoredCarNames names = new(() => []);

        Assert.True(names.Rename(session.Context, session.Origin));

        Assert.Equal("LMP2 ELMS", session.Context.CarModel);
        Assert.Equal("DKR Engineering #3:ELMS26", session.Context.Livery);
        Assert.Null(session.Context.CarType);
    }

    [Fact]
    public void AStoredLiveryIsNamedThroughTheResultsArchive()
    {
        LapHistorySession session = Recorded("BMW M Team WRT 2026 #15:LM", "Hyper");
        StoredCarNames names = new(() =>
            [new ResultsCar("BMW M Team WRT 2026 #15:LM", "BMW M Hybrid V8", "Hyper", "WEC 2026")]);

        Assert.True(names.Rename(session.Context, session.Origin));

        Assert.Equal("Hypercar BMW", session.Context.CarModel);
        Assert.Equal("BMW M Hybrid V8", session.Context.CarType);
        Assert.Equal("BMW M Team WRT 2026 #15:LM", session.Context.Livery);
    }

    [Fact]
    public void AStoredLiveryTheArchiveDoesNotKnowKeepsItsNameAndIsNotLookedUpAgain()
    {
        LapHistorySession unknown = Recorded("Some Team 2024 #99:LM", "Hyper");
        LapHistorySession imported = new()
        {
            Id = "imported",
            Origin = LapHistoryOrigin.Imported,
            Context = new LapHistoryContext { Game = "LeMansUltimate", TrackCourse = "Spa", CarModel = "Porsche 911 GT3 R LMGT3", CarClass = "GT3" },
        };
        InMemoryStore store = new([unknown, imported]);
        int lookups = 0;
        StoredCarNames names = new(() =>
        {
            lookups++;
            return [];
        });

        Assert.Equal(2, names.RenameAll(store));
        Assert.Equal(0, names.RenameAll(store));

        Assert.Equal("Some Team 2024 #99:LM", unknown.Context.CarModel);
        Assert.Equal("Some Team 2024 #99:LM", unknown.Context.Livery);
        Assert.Null(unknown.Context.CarType);
        // An imported session stored the archive's model, so it needs no lookup to be named.
        Assert.Equal("LMGT3 Porsche", imported.Context.CarModel);
        Assert.Equal("Porsche 911 GT3 R LMGT3", imported.Context.CarType);
        Assert.Equal(1, lookups);
    }

    private static LapHistorySession Recorded(string livery, string carClass) => new()
    {
        Id = "recorded",
        Origin = LapHistoryOrigin.Recorded,
        Context = new LapHistoryContext { Game = "LeMansUltimate", TrackCourse = "Spa", CarModel = livery, CarClass = carClass },
    };

    private sealed class InMemoryStore(IEnumerable<LapHistorySession> sessions) : ILapHistoryStore
    {
        private readonly Dictionary<string, LapHistorySession> _sessions = sessions.ToDictionary(session => session.Id);

        public IReadOnlyList<LapHistorySession> LoadAll() => [.. this._sessions.Values];

        public void Save(LapHistorySession session) => this._sessions[session.Id] = session;

        public void Delete(string sessionId) => this._sessions.Remove(sessionId);
    }
}

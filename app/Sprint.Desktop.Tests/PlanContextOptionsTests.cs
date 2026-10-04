using Sprint.Desktop.Features.SessionPlanning;
using Xunit;

namespace Sprint.Desktop.Tests;

/// <summary>
/// The values the creation sheet offers for game, car and track. They come from what Sprint
/// has actually recorded, because the corpus is keyed on this triple: a typed
/// "Spa Francorchamps" beside a recorded "Spa-Francorchamps" is a second bucket, and every
/// statistic drawn from it silently uses half the laps.
/// </summary>
public sealed class PlanContextOptionsTests
{
    [Fact]
    public void OptionsComeFromWhatHasActuallyBeenDriven()
    {
        var options = PlanContextOptions.From(
            Store(
                ("Le Mans Ultimate", "Spa-Francorchamps", "Porsche 963"),
                ("Le Mans Ultimate", "Monza", "Ferrari 499P")),
            PlanContext.Empty);

        Assert.Equal(["Le Mans Ultimate"], options.Games);
        Assert.Equal(["Monza", "Spa-Francorchamps"], options.Tracks);
        Assert.Equal(["Ferrari 499P", "Porsche 963"], options.Cars);
    }

    [Fact]
    public void CarsAndTracksNarrowToTheChosenGame()
    {
        var options = PlanContextOptions.From(
            Store(
                ("Le Mans Ultimate", "Spa-Francorchamps", "Porsche 963"),
                ("Assetto Corsa", "Brands Hatch", "Mazda MX-5")),
            PlanContext.Empty);

        // Offering another sim's cars would invite exactly the mismatch this list prevents.
        Assert.Equal(["Spa-Francorchamps"], options.For("Le Mans Ultimate").Tracks);
        Assert.Equal(["Porsche 963"], options.For("Le Mans Ultimate").Cars);
        Assert.Equal(["Mazda MX-5"], options.For("Assetto Corsa").Cars);
    }

    [Fact]
    public void AnUnknownGameStillOffersEverythingRatherThanNothing()
    {
        var options = PlanContextOptions.From(
            Store(("Le Mans Ultimate", "Spa-Francorchamps", "Porsche 963")),
            PlanContext.Empty);

        // A game with no history yet must not present an empty car list as if the driver had
        // nothing to choose from.
        var narrowed = options.For("iRacing");
        Assert.Equal(["Spa-Francorchamps"], narrowed.Tracks);
        Assert.Equal(["Porsche 963"], narrowed.Cars);
    }

    [Fact]
    public void TheLiveContextIsOfferedEvenBeforeItHasBeenDriven()
    {
        var options = PlanContextOptions.From(
            Store(("Le Mans Ultimate", "Spa-Francorchamps", "Porsche 963")),
            new PlanContext("Le Mans Ultimate", "Peugeot 9X8", "Monza"));

        // The sim is sitting in a car and on a track with no recorded laps: that is precisely
        // the context the driver is about to plan for.
        Assert.Contains("Peugeot 9X8", options.Cars);
        Assert.Contains("Monza", options.Tracks);
    }

    [Fact]
    public void ValuesAreDeduplicatedAndSortedSoTheListIsScannable()
    {
        var options = PlanContextOptions.From(
            Store(
                ("Le Mans Ultimate", "Monza", "Porsche 963"),
                ("Le Mans Ultimate", "Monza", "Porsche 963"),
                ("Le Mans Ultimate", "Bahrain", "Porsche 963")),
            PlanContext.Empty);

        Assert.Equal(["Bahrain", "Monza"], options.Tracks);
        Assert.Equal(["Porsche 963"], options.Cars);
    }

    [Fact]
    public void AnEmptyCorpusOffersNothingRatherThanBlanks()
    {
        var options = PlanContextOptions.From(Store(), PlanContext.Empty);

        Assert.Empty(options.Games);
        Assert.Empty(options.Tracks);
        Assert.Empty(options.Cars);
    }

    private static ILapHistoryStore Store(params (string Game, string Track, string Car)[] contexts) =>
        new FakeStore([.. contexts.Select(context => new LapHistorySession
        {
            Id = $"hs-{context.Game}-{context.Track}-{context.Car}",
            Context = new LapHistoryContext
            {
                Game = context.Game,
                TrackCourse = context.Track,
                CarModel = context.Car,
            },
        })]);

    private sealed class FakeStore(IReadOnlyList<LapHistorySession> sessions) : ILapHistoryStore
    {
        public IReadOnlyList<LapHistorySession> LoadAll() => sessions;

        public void Save(LapHistorySession session) => throw new NotSupportedException();

        public void Delete(string sessionId) => throw new NotSupportedException();
    }
}

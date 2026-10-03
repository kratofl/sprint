using Sprint.Desktop.Features.SessionPlanning;
using Xunit;

namespace Sprint.Desktop.Host.Tests;

/// <summary>
/// The New plan dialog's choices (<c>GET /api/planner/context</c>): every recorded game carries
/// its own narrowed tracks and cars, so the renderer never offers another sim's car.
/// </summary>
public sealed class PlanContextChoicesTests
{
    [Fact]
    public void From_NarrowsTracksAndCarsPerRecordedGame()
    {
        ContextStore store = new(
            ("Le Mans Ultimate", "Spa-Francorchamps", "Porsche 963"),
            ("Le Mans Ultimate", "Monza", "Ferrari 499P"),
            ("iRacing", "Road Atlanta", "Mazda MX-5"));
        PlanContext live = new("Le Mans Ultimate", "Porsche 963", "Spa-Francorchamps");

        PlanContextChoices choices = PlanContextChoices.From(live, PlanContextOptions.From(store, live));

        Assert.Equal(live, choices.Prefill);
        Assert.Equal(["iRacing", "Le Mans Ultimate"], choices.Games);
        Assert.Equal(["Ferrari 499P", "Mazda MX-5", "Porsche 963"], choices.Cars);
        PlanGameChoices lmu = Assert.Single(choices.ByGame, game => game.Game == "Le Mans Ultimate");
        Assert.Equal(["Monza", "Spa-Francorchamps"], lmu.Tracks);
        Assert.Equal(["Ferrari 499P", "Porsche 963"], lmu.Cars);
    }

    private sealed class ContextStore : ILapHistoryStore
    {
        private readonly (string Game, string Track, string Car)[] _contexts;

        public ContextStore(params (string Game, string Track, string Car)[] contexts)
        {
            this._contexts = contexts;
        }

        public IReadOnlyList<LapHistorySession> LoadAll() =>
            [.. this._contexts.Select(context => new LapHistorySession
            {
                Context = new LapHistoryContext { Game = context.Game, TrackCourse = context.Track, CarModel = context.Car },
            })];

        public void Save(LapHistorySession session)
        {
        }

        public void Delete(string sessionId)
        {
        }
    }
}

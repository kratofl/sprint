using Sprint.Games;
using Xunit;

namespace Sprint.Desktop.Tests;

/// <summary>
/// The bundled typical pit loss (<see cref="GamePitLossCatalog"/>): how a session's game, track and
/// class find it. The figures themselves come from the bundled track data and change with each refresh.
/// </summary>
public sealed class GamePitLossCatalogTests
{
    [Fact]
    public void AnLmuTrackHasATypicalStopPerClassInLaneAndStandingTime()
    {
        TypicalPitLoss? typical = GamePitLossCatalog.Typical("LeMansUltimate", "Circuit de la Sarthe", "GT3");

        Assert.NotNull(typical);
        Assert.True(typical.Lane > 0 && typical.Standing > 0);
        // LMU's own track name in any case and its other spellings of the game and the class.
        Assert.Equal(typical, GamePitLossCatalog.Typical("Le Mans Ultimate", " circuit de la sarthe ", "LMGT3"));
        Assert.Equal(
            GamePitLossCatalog.Typical("LeMansUltimate", "Circuit de la Sarthe", "LMP2"),
            GamePitLossCatalog.Typical("LeMansUltimate", "Circuit de la Sarthe", "LMP2_ELMS"));
    }

    [Theory]
    [InlineData("Demo", "Circuit de la Sarthe", "GT3")]
    [InlineData("LeMansUltimate", "Nürburgring Nordschleife", "GT3")]
    [InlineData("LeMansUltimate", "Circuit de la Sarthe", "Formula")]
    [InlineData("LeMansUltimate", "", "GT3")]
    public void AGameTrackOrClassTheDataLacksHasNone(string game, string track, string carClass)
    {
        Assert.Null(GamePitLossCatalog.Typical(game, track, carClass));
    }
}

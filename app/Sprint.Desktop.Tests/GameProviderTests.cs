using System.Linq;
using Sprint.Desktop.Api.Games;
using Sprint.Desktop.Api.Telemetry;
using Sprint.Games;
using Xunit;

namespace Sprint.Desktop.Tests;

/// <summary>
/// The game-provider layer (#180): one provider per game carrying a descriptor,
/// telemetry-source creation, and optional results/setup/schedule capabilities. A
/// capability a game lacks is null, so discovery is a null check and callers gate on it.
/// </summary>
public sealed class GameProviderTests
{
    [Fact]
    public void Registers_a_provider_for_every_supported_game()
    {
        var ids = GameProviders.All.Select(provider => provider.Descriptor.Id).ToArray();

        Assert.Equal(new[] { "lemansultimate", "demo" }, ids);
    }

    [Fact]
    public void Finds_a_registered_provider_by_game_id()
    {
        var provider = GameProviders.Find("lemansultimate");

        Assert.NotNull(provider);
        Assert.Equal("Le Mans Ultimate", provider.Descriptor.Name);
    }

    [Fact]
    public void Has_no_provider_for_an_unregistered_game()
    {
        Assert.Null(GameProviders.Find("nope"));
    }

    [Theory]
    [InlineData("demo", "Sprint Demo")]
    [InlineData("lemansultimate", "Le Mans Ultimate")]
    public void Creates_the_telemetry_source_of_the_game_it_speaks_for(string gameId, string expectedSourceName)
    {
        var provider = GameProviders.Find(gameId);
        Assert.NotNull(provider);

        using var source = provider.CreateTelemetrySource();

        Assert.Equal(expectedSourceName, source.Name);
    }

    [Fact]
    public void Default_game_is_a_real_game_never_the_dev_simulation()
    {
        Assert.Equal("lemansultimate", GameProviders.Default.Descriptor.Id);
    }

    [Fact]
    public void Demo_game_has_none_of_the_optional_capabilities()
    {
        var demo = GameProviders.Find("demo");
        Assert.NotNull(demo);

        // A simulation archives no results, stores no setups and publishes no schedule, so
        // every capability-gated surface must hide itself while the demo is active.
        Assert.Null(demo.Results);
        Assert.Null(demo.Setups);
        Assert.Null(demo.Schedule);
    }

    [Fact]
    public void A_new_game_implements_only_the_capabilities_it_has()
    {
        IGameProvider archiveOnlyGame = new ArchiveOnlyGameProvider();

        Assert.NotNull(archiveOnlyGame.Results);
        Assert.Null(archiveOnlyGame.Setups);
        Assert.Null(archiveOnlyGame.Schedule);
    }

    [Fact]
    public void A_capability_hands_the_caller_sprint_records_without_naming_the_game()
    {
        IGameProvider archiveOnlyGame = new ArchiveOnlyGameProvider();
        var importer = archiveOnlyGame.Results;
        Assert.NotNull(importer);

        var entry = Assert.Single(importer.ListEntries());
        var session = importer.Read(entry);

        // A consumer discovers, reads and buckets a session through the shared records only —
        // nothing game-native reaches it, which is what lets one importer path serve any game.
        Assert.NotNull(session);
        Assert.Equal("archive-only", session.Game);
        Assert.Equal(ImportedSessionKind.TestDay, session.Kind);
        Assert.Equal(2, session.Laps.Count);
    }

    /// <summary>
    /// A hypothetical game that archives results but stores no setups and publishes no
    /// schedule: the partial-implementation case the provider layer exists for.
    /// </summary>
    private sealed class ArchiveOnlyGameProvider : IGameProvider
    {
        public GameDescriptor Descriptor { get; } = new(
            Id: "archive-only",
            Name: "Archive Only",
            Transport: "none",
            Available: false);

        public IResultsImporter? Results { get; } = new StubResultsImporter();

        public ISetupRepository? Setups => null;

        public IScheduleSource? Schedule => null;

        public ITelemetrySource CreateTelemetrySource() => throw new NotSupportedException();
    }

    private sealed class StubResultsImporter : IResultsImporter
    {
        private static readonly ResultsArchiveEntry Entry =
            new("session-1", SizeBytes: 1024, LastWriteUtc: DateTimeOffset.UnixEpoch);

        public string SourceDescription => "in-memory archive";

        public IReadOnlyList<ResultsArchiveEntry> ListEntries() => [Entry];

        public ImportedSession? Read(ResultsArchiveEntry entry)
        {
            if (entry.Id != Entry.Id)
            {
                return null;
            }

            return new ImportedSession(
                Game: "archive-only",
                TrackCourse: "Sebring International Raceway",
                CarModel: "Porsche 963",
                Kind: ImportedSessionKind.TestDay,
                SessionTimeUtc: DateTimeOffset.UnixEpoch,
                PlayerName: "Driver",
                Laps:
                [
                    new ImportedLap(1, LapTimeSeconds: null, SectorsSeconds: []),
                    new ImportedLap(2, LapTimeSeconds: 108.421, SectorsSeconds: [35.1, 36.2, 37.121])
                ]);
        }
    }
}

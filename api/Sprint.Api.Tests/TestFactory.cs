using Microsoft.EntityFrameworkCore;
using Sprint.Api.Data;

namespace Sprint.Api.Tests;

/// <summary>Builds isolated in-memory <see cref="SprintDbContext"/> factories so tests never touch a live database.</summary>
internal static class TestFactory
{
    public static IDbContextFactory<SprintDbContext> NewDb() =>
        new InMemoryDbFactory($"sprint-tests-{Guid.NewGuid():N}");

    private sealed class InMemoryDbFactory(string name) : IDbContextFactory<SprintDbContext>
    {
        private readonly DbContextOptions<SprintDbContext> _options =
            new DbContextOptionsBuilder<SprintDbContext>().UseInMemoryDatabase(name).Options;

        public SprintDbContext CreateDbContext() => new(_options);
    }
}

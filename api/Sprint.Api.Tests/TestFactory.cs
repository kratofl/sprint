using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Diagnostics;
using Sprint.Api.Data;

namespace Sprint.Api.Tests;

/// <summary>Builds isolated in-memory <see cref="SprintDbContext"/> factories so tests never touch a live database.</summary>
internal static class TestFactory
{
    /// <summary>A fresh database; <paramref name="interceptors"/> let a test step into a save.</summary>
    public static IDbContextFactory<SprintDbContext> NewDb(params IInterceptor[] interceptors) =>
        new InMemoryDbFactory($"sprint-tests-{Guid.NewGuid():N}", interceptors);

    private sealed class InMemoryDbFactory(string name, IInterceptor[] interceptors) : IDbContextFactory<SprintDbContext>
    {
        private readonly DbContextOptions<SprintDbContext> _options =
            new DbContextOptionsBuilder<SprintDbContext>().UseInMemoryDatabase(name).AddInterceptors(interceptors).Options;

        public SprintDbContext CreateDbContext() => new(this._options);
    }
}

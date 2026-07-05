using HotChocolate.Execution;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Sprint.Api;
using Sprint.Api.Auth;
using Sprint.Api.Data;
using Sprint.Api.GraphQL;
using Sprint.Api.Services;
using Sprint.Api.Telemetry;
using Xunit;

namespace Sprint.Api.Tests;

public class GraphQLSmokeTests
{
    private static async Task<IRequestExecutor> BuildExecutorAsync()
    {
        var services = new ServiceCollection();
        services.AddLogging();
        services.AddAuthorizationCore();

        services.AddSingleton(new ServerInfo("test"));
        services.AddSingleton(new JwtTokenService(
            JwtTokenService.KeyFromSecret("test-secret-long-enough-for-hs256-aaaaaa")));
        services.AddSingleton<PasswordHasher>();
        services.AddSingleton<IDbContextFactory<SprintDbContext>>(TestFactory.NewDb());
        services.AddSingleton<ITelemetryStore, NullTelemetryStore>();
        services.AddSingleton<UserService>();
        services.AddSingleton<InviteService>();
        services.AddSingleton<CatalogService>();

        return await services
            .AddGraphQLServer()
            .AddAuthorization()
            .AddQueryType<Query>()
            .AddMutationType<Mutation>()
            .AddSubscriptionType<Subscription>()
            .AddInMemorySubscriptions()
            .BuildRequestExecutorAsync();
    }

    [Fact]
    public async Task Schema_builds_with_query_mutation_and_subscription()
    {
        var executor = await BuildExecutorAsync();
        var sdl = executor.Schema.ToString();

        Assert.Contains("type Query", sdl);
        Assert.Contains("type Mutation", sdl);
        Assert.Contains("type Subscription", sdl);
        // The relay surface survived schema generation.
        Assert.Contains("engineerEvents", sdl);
    }

    [Fact]
    public async Task Health_query_succeeds()
    {
        var executor = await BuildExecutorAsync();
        var op = (await executor.ExecuteAsync("{ health { status version } }")).ExpectOperationResult();
        Assert.True(op.Errors is null or { Count: 0 });
    }

    [Fact]
    public async Task Register_then_login_over_graphql_succeed()
    {
        var executor = await BuildExecutorAsync();

        var reg = (await executor.ExecuteAsync(
            "mutation { register(input: { email: \"a@b.c\", password: \"pw123456\" }) { token } }")).ExpectOperationResult();
        Assert.True(reg.Errors is null or { Count: 0 });

        var login = (await executor.ExecuteAsync(
            "mutation { login(input: { email: \"a@b.c\", password: \"pw123456\" }) { token } }")).ExpectOperationResult();
        Assert.True(login.Errors is null or { Count: 0 });
    }

    [Fact]
    public async Task Me_query_without_auth_is_rejected()
    {
        var executor = await BuildExecutorAsync();
        var op = (await executor.ExecuteAsync("{ me { id email } }")).ExpectOperationResult();
        Assert.NotNull(op.Errors);
        Assert.NotEmpty(op.Errors!);
    }
}

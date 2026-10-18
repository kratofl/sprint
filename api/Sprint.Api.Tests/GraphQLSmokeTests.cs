using HotChocolate.Execution;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Sprint.Api;
using Sprint.Api.Auth;
using Sprint.Api.Auth.Discord;
using Sprint.Api.Data;
using Sprint.Api.GraphQL;
using Sprint.Api.Live;
using Sprint.Api.Services;
using Sprint.Api.Telemetry;
using Xunit;

namespace Sprint.Api.Tests;

public class GraphQLSmokeTests
{
    private static async Task<IRequestExecutor> BuildExecutorAsync()
    {
        ServiceCollection services = new();
        services.AddLogging();
        services.AddAuthorizationCore();

        services.AddSingleton(new ServerInfo("test"));
        services.AddSingleton(new JwtTokenService(
            JwtTokenService.KeyFromSecret("test-secret-long-enough-for-hs256-aaaaaa")));
        services.AddSingleton<PasswordHasher>();
        services.AddSingleton<IDbContextFactory<SprintDbContext>>(TestFactory.NewDb());
        services.AddSingleton<ITelemetryStore, NullTelemetryStore>();
        services.AddSingleton(new PublicUrls(null, null));
        services.AddSingleton(TimeProvider.System);
        services.AddSingleton(DiscordOptions.Disabled);
        services.AddSingleton<IDiscordClient>(new FakeDiscord());
        services.AddSingleton<DiscordSignIn>();
        services.AddSingleton(new LiveHub(TimeProvider.System, LiveHub.DefaultReconnectGrace));
        services.AddSingleton<ServerSettingsService>();
        services.AddSingleton<UserService>();
        services.AddSingleton<CatalogService>();
        services.AddSingleton<EngineerService>();

        return await services
            .AddGraphQLServer()
            .AddAuthorization()
            .AddQueryType<Query>()
            .AddMutationType<Mutation>()
            .BuildRequestExecutorAsync();
    }

    [Fact]
    public async Task Schema_builds_with_the_engineer_and_sign_in_surface()
    {
        IRequestExecutor executor = await BuildExecutorAsync();
        string sdl = executor.Schema.ToString();

        Assert.Contains("type Query", sdl);
        Assert.Contains("type Mutation", sdl);
        Assert.Contains("visibleSessions", sdl);
        Assert.Contains("redeemSignInTicket", sdl);
    }

    [Fact]
    public async Task An_invite_preview_is_readable_without_signing_in()
    {
        IRequestExecutor executor = await BuildExecutorAsync();
        OperationResult op = (await executor.ExecuteAsync("{ engineerInvite(token: \"nope\") { status } }")).ExpectOperationResult();
        Assert.True(op.Errors is null or { Count: 0 });
    }

    [Fact]
    public async Task Health_query_succeeds()
    {
        IRequestExecutor executor = await BuildExecutorAsync();
        OperationResult op = (await executor.ExecuteAsync("{ health { status version } }")).ExpectOperationResult();
        Assert.True(op.Errors is null or { Count: 0 });
    }

    [Fact]
    public async Task Register_then_login_over_graphql_succeed()
    {
        IRequestExecutor executor = await BuildExecutorAsync();

        OperationResult reg = (await executor.ExecuteAsync(
            "mutation { register(input: { email: \"a@b.c\", password: \"pw123456\" }) { token } }")).ExpectOperationResult();
        Assert.True(reg.Errors is null or { Count: 0 });

        OperationResult login = (await executor.ExecuteAsync(
            "mutation { login(input: { email: \"a@b.c\", password: \"pw123456\" }) { token } }")).ExpectOperationResult();
        Assert.True(login.Errors is null or { Count: 0 });
    }

    [Fact]
    public async Task Me_query_without_auth_is_rejected()
    {
        IRequestExecutor executor = await BuildExecutorAsync();
        OperationResult op = (await executor.ExecuteAsync("{ me { id email } }")).ExpectOperationResult();
        Assert.NotNull(op.Errors);
        Assert.NotEmpty(op.Errors);
    }
}

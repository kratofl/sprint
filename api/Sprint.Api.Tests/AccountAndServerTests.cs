using HotChocolate;
using Microsoft.EntityFrameworkCore;
using Sprint.Api.Auth;
using Sprint.Api.Data;
using Sprint.Api.Services;
using Sprint.Contracts;
using Xunit;

namespace Sprint.Api.Tests;

public class AccountAndServerTests
{
    private static readonly JwtTokenService Tokens = new(JwtTokenService.KeyFromSecret("test-secret-long-enough-for-hs256-aaaaaa"));

    private sealed record Server(UserService Users, ServerSettingsService Settings);

    private static Server NewServer()
    {
        IDbContextFactory<SprintDbContext> db = TestFactory.NewDb();
        ServerSettingsService settings = new(db);
        return new Server(new UserService(db, new PasswordHasher(), Tokens, settings), settings);
    }

    private static async Task<UserProfile> Register(Server server, string email)
    {
        AuthResponse response = await server.Users.RegisterAsync(new AuthRequest { Email = email, Password = "pw123456" });
        string id = Tokens.ValidateAndGetUserId(response.Token);
        return await server.Users.GetProfileAsync(id) ?? throw new InvalidOperationException("no profile");
    }

    [Fact]
    public async Task The_first_account_on_a_server_is_its_admin_and_later_ones_are_not()
    {
        Server server = NewServer();

        UserProfile first = await Register(server, "owner@sprint.gg");
        UserProfile second = await Register(server, "friend@sprint.gg");

        Assert.True(first.IsAdmin);
        Assert.False(second.IsAdmin);
    }

    [Fact]
    public async Task Closed_registration_turns_new_accounts_away()
    {
        Server server = NewServer();
        UserProfile admin = await Register(server, "owner@sprint.gg");

        await server.Settings.UpdateAsync(admin.Id, new UpdateServerSettingsInput { InstanceName = "Garage", AllowRegistration = false });

        GraphQLException error = await Assert.ThrowsAsync<GraphQLException>(() => Register(server, "stranger@sprint.gg"));
        Assert.Contains("closed", error.Message, StringComparison.OrdinalIgnoreCase);
        Assert.Equal(new ServerSettingsDto { InstanceName = "Garage", AllowRegistration = false }, await server.Settings.GetAsync());
    }

    [Fact]
    public async Task Only_an_admin_can_change_the_server_settings()
    {
        Server server = NewServer();
        await Register(server, "owner@sprint.gg");
        UserProfile friend = await Register(server, "friend@sprint.gg");

        await Assert.ThrowsAsync<GraphQLException>(() =>
            server.Settings.UpdateAsync(friend.Id, new UpdateServerSettingsInput { InstanceName = "Mine now", AllowRegistration = true }));

        Assert.Equal("Sprint", (await server.Settings.GetAsync()).InstanceName);
    }

    [Fact]
    public async Task A_changed_password_is_the_one_that_signs_in()
    {
        Server server = NewServer();
        UserProfile user = await Register(server, "ada@sprint.gg");

        await server.Users.ChangePasswordAsync(user.Id, "pw123456", "new-secret-1");

        await Assert.ThrowsAsync<GraphQLException>(() => server.Users.LoginAsync(new AuthRequest { Email = "ada@sprint.gg", Password = "pw123456" }));
        AuthResponse login = await server.Users.LoginAsync(new AuthRequest { Email = "ada@sprint.gg", Password = "new-secret-1" });
        Assert.False(string.IsNullOrEmpty(login.Token));
    }

    [Fact]
    public async Task Changing_the_password_needs_the_current_one()
    {
        Server server = NewServer();
        UserProfile user = await Register(server, "ada@sprint.gg");

        await Assert.ThrowsAsync<GraphQLException>(() => server.Users.ChangePasswordAsync(user.Id, "wrong", "new-secret-1"));
    }

    [Fact]
    public async Task An_uploaded_session_keeps_its_data_and_a_second_upload_updates_it()
    {
        CatalogService catalog = new(TestFactory.NewDb());
        DateTimeOffset started = new(2026, 10, 1, 18, 0, 0, TimeSpan.Zero);

        SessionSummary created = await catalog.SaveSessionAsync("owner-A", new SaveSessionInput
        {
            Game = "Le Mans Ultimate", Track = "Spa", Car = "Porsche 963", SessionType = "Practice", StartedAt = started, Data = "{\"laps\":3}",
        });
        SessionSummary updated = await catalog.SaveSessionAsync("owner-A", new SaveSessionInput
        {
            Id = created.Id, Game = "Le Mans Ultimate", Track = "Spa", Car = "Porsche 963", SessionType = "Practice", StartedAt = started, Data = "{\"laps\":5}",
        });

        IReadOnlyList<SessionSummary> list = await catalog.ListSessionsAsync("owner-A");
        Assert.Equal(created.Id, updated.Id);
        Assert.Single(list);
        Assert.Equal("{\"laps\":5}", list[0].Data);
        Assert.Equal(started, list[0].StartedAt);
    }
}

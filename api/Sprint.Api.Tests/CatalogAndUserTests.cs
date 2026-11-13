using HotChocolate;
using Microsoft.EntityFrameworkCore;
using Sprint.Api.Auth;
using Sprint.Api.Auth.Discord;
using Sprint.Api.Data;
using Sprint.Api.Services;
using Sprint.Contracts;
using Xunit;

namespace Sprint.Api.Tests;

public class UserServiceTests
{
    private static UserService NewUsers(out JwtTokenService tokens)
    {
        tokens = new JwtTokenService(JwtTokenService.KeyFromSecret("test-secret-long-enough-for-hs256-aaaaaa"));
        IDbContextFactory<SprintDbContext> db = TestFactory.NewDb();
        return new UserService(db, new PasswordHasher(), tokens, new ServerSettingsService(db, DiscordOptions.Disabled));
    }

    [Fact]
    public async Task Register_then_login_yields_a_token_for_the_same_user()
    {
        UserService users = NewUsers(out JwtTokenService? tokens);
        AuthRequest req = new AuthRequest { Email = "driver@sprint.gg", Password = "pw123456" };

        AuthResponse registered = await users.RegisterAsync(req);
        AuthResponse loggedIn = await users.LoginAsync(req);

        string idFromRegister = tokens.ValidateAndGetUserId(registered.Token);
        string idFromLogin = tokens.ValidateAndGetUserId(loggedIn.Token);
        Assert.Equal(idFromRegister, idFromLogin);
    }

    [Fact]
    public async Task Duplicate_email_registration_is_rejected()
    {
        UserService users = NewUsers(out _);
        AuthRequest req = new AuthRequest { Email = "dupe@sprint.gg", Password = "pw123456" };
        await users.RegisterAsync(req);
        await Assert.ThrowsAsync<GraphQLException>(() => users.RegisterAsync(req));
    }

    [Fact]
    public async Task Login_with_wrong_password_is_rejected()
    {
        UserService users = NewUsers(out _);
        await users.RegisterAsync(new AuthRequest { Email = "x@sprint.gg", Password = "correct-horse" });
        await Assert.ThrowsAsync<GraphQLException>(() =>
            users.LoginAsync(new AuthRequest { Email = "x@sprint.gg", Password = "wrong" }));
    }

    [Fact]
    public async Task Setting_a_display_name_round_trips_and_is_bounded()
    {
        UserService users = NewUsers(out JwtTokenService tokens);
        AuthResponse registered = await users.RegisterAsync(new AuthRequest { Email = "a@b.c", Password = "pw123456" });
        string id = tokens.ValidateAndGetUserId(registered.Token);

        UserProfile profile = await users.SetDisplayNameAsync(id, "  Ada Lovelace  ");

        Assert.Equal("Ada Lovelace", profile.DisplayName);
        UserProfile? reloaded = await users.GetProfileAsync(id);
        Assert.Equal("Ada Lovelace", reloaded?.DisplayName);
        await Assert.ThrowsAsync<GraphQLException>(() => users.SetDisplayNameAsync(id, "   "));
        await Assert.ThrowsAsync<GraphQLException>(() => users.SetDisplayNameAsync(id, new string('x', 41)));
    }
}

public class CatalogServiceTests
{
    [Fact]
    public async Task Setups_are_owner_scoped()
    {
        CatalogService catalog = new CatalogService(TestFactory.NewDb());
        SetupSummary mine = await catalog.SaveSetupAsync("owner-A", new SaveSetupInput { Name = "Monza Low DF" });
        await catalog.SaveSetupAsync("owner-B", new SaveSetupInput { Name = "Spa" });

        IReadOnlyList<SetupSummary> listA = await catalog.ListSetupsAsync("owner-A");
        Assert.Single(listA);
        Assert.Equal("Monza Low DF", listA[0].Name);

        // Owner B cannot read owner A's setup by id.
        Assert.Null(await catalog.GetSetupAsync("owner-B", mine.Id));
        Assert.NotNull(await catalog.GetSetupAsync("owner-A", mine.Id));
    }

    [Fact]
    public async Task Save_setup_with_existing_id_updates_in_place()
    {
        CatalogService catalog = new CatalogService(TestFactory.NewDb());
        SetupSummary created = await catalog.SaveSetupAsync("owner-A", new SaveSetupInput { Name = "v1", Data = "{\"wing\":5}" });
        SetupSummary updated = await catalog.SaveSetupAsync("owner-A", new SaveSetupInput { Id = created.Id, Name = "v2", Data = "{\"wing\":7}" });

        Assert.Equal(created.Id, updated.Id);
        IReadOnlyList<SetupSummary> list = await catalog.ListSetupsAsync("owner-A");
        Assert.Single(list);
        Assert.Equal("v2", list[0].Name);
    }

    [Fact]
    public async Task Layouts_round_trip_opaque_json()
    {
        CatalogService catalog = new CatalogService(TestFactory.NewDb());
        LayoutSummary saved = await catalog.SaveLayoutAsync("owner-A",
            new SaveLayoutInput { Name = "Race", Data = "{\"widgets\":[{\"idlePage\":true}]}" });

        LayoutSummary? fetched = await catalog.GetLayoutAsync("owner-A", saved.Id);
        Assert.NotNull(fetched);
        Assert.Equal("{\"widgets\":[{\"idlePage\":true}]}", fetched!.Data);
    }
}

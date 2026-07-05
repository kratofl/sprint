using HotChocolate;
using Sprint.Api.Auth;
using Sprint.Api.Services;
using Sprint.Contracts;
using Xunit;

namespace Sprint.Api.Tests;

public class UserServiceTests
{
    private static UserService NewUsers(out JwtTokenService tokens)
    {
        tokens = new JwtTokenService(JwtTokenService.KeyFromSecret("test-secret-long-enough-for-hs256-aaaaaa"));
        return new UserService(TestFactory.NewDb(), new PasswordHasher(), tokens);
    }

    [Fact]
    public async Task Register_then_login_yields_a_token_for_the_same_user()
    {
        var users = NewUsers(out var tokens);
        var req = new AuthRequest { Email = "driver@sprint.gg", Password = "pw123456" };

        var registered = await users.RegisterAsync(req);
        var loggedIn = await users.LoginAsync(req);

        var idFromRegister = tokens.ValidateAndGetUserId(registered.Token);
        var idFromLogin = tokens.ValidateAndGetUserId(loggedIn.Token);
        Assert.Equal(idFromRegister, idFromLogin);
    }

    [Fact]
    public async Task Duplicate_email_registration_is_rejected()
    {
        var users = NewUsers(out _);
        var req = new AuthRequest { Email = "dupe@sprint.gg", Password = "pw123456" };
        await users.RegisterAsync(req);
        await Assert.ThrowsAsync<GraphQLException>(() => users.RegisterAsync(req));
    }

    [Fact]
    public async Task Login_with_wrong_password_is_rejected()
    {
        var users = NewUsers(out _);
        await users.RegisterAsync(new AuthRequest { Email = "x@sprint.gg", Password = "correct-horse" });
        await Assert.ThrowsAsync<GraphQLException>(() =>
            users.LoginAsync(new AuthRequest { Email = "x@sprint.gg", Password = "wrong" }));
    }
}

public class CatalogServiceTests
{
    [Fact]
    public async Task Setups_are_owner_scoped()
    {
        var catalog = new CatalogService(TestFactory.NewDb());
        var mine = await catalog.SaveSetupAsync("owner-A", new SaveSetupInput { Name = "Monza Low DF" });
        await catalog.SaveSetupAsync("owner-B", new SaveSetupInput { Name = "Spa" });

        var listA = await catalog.ListSetupsAsync("owner-A");
        Assert.Single(listA);
        Assert.Equal("Monza Low DF", listA[0].Name);

        // Owner B cannot read owner A's setup by id.
        Assert.Null(await catalog.GetSetupAsync("owner-B", mine.Id));
        Assert.NotNull(await catalog.GetSetupAsync("owner-A", mine.Id));
    }

    [Fact]
    public async Task Save_setup_with_existing_id_updates_in_place()
    {
        var catalog = new CatalogService(TestFactory.NewDb());
        var created = await catalog.SaveSetupAsync("owner-A", new SaveSetupInput { Name = "v1", Data = "{\"wing\":5}" });
        var updated = await catalog.SaveSetupAsync("owner-A", new SaveSetupInput { Id = created.Id, Name = "v2", Data = "{\"wing\":7}" });

        Assert.Equal(created.Id, updated.Id);
        var list = await catalog.ListSetupsAsync("owner-A");
        Assert.Single(list);
        Assert.Equal("v2", list[0].Name);
    }

    [Fact]
    public async Task Layouts_round_trip_opaque_json()
    {
        var catalog = new CatalogService(TestFactory.NewDb());
        var saved = await catalog.SaveLayoutAsync("owner-A",
            new SaveLayoutInput { Name = "Race", Data = "{\"widgets\":[{\"idlePage\":true}]}" });

        var fetched = await catalog.GetLayoutAsync("owner-A", saved.Id);
        Assert.NotNull(fetched);
        Assert.Equal("{\"widgets\":[{\"idlePage\":true}]}", fetched!.Data);
    }
}

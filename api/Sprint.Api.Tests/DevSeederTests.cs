using Microsoft.EntityFrameworkCore;
using Sprint.Api.Auth;
using Sprint.Api.Data;
using Sprint.Api.Services;
using Sprint.Contracts;
using Xunit;

namespace Sprint.Api.Tests;

public class DevSeederTests
{
    private static readonly AuthRequest AdminLogin = new() { Email = "admin@sprint.local", Password = "admin" };

    [Fact]
    public async Task Seeded_admin_can_sign_in()
    {
        IDbContextFactory<SprintDbContext> db = TestFactory.NewDb();
        PasswordHasher hasher = new();
        UserService users = new(db, hasher, NewTokens(), new ServerSettingsService(db));

        await new DevSeeder(db, hasher).SeedAsync();

        AuthResponse response = await users.LoginAsync(AdminLogin);
        Assert.False(string.IsNullOrEmpty(response.Token));
    }

    [Fact]
    public async Task The_next_start_does_not_create_a_second_admin()
    {
        IDbContextFactory<SprintDbContext> db = TestFactory.NewDb();
        DevSeeder seeder = new(db, new PasswordHasher());

        bool firstStart = await seeder.SeedAsync();
        bool nextStart = await seeder.SeedAsync();

        Assert.True(firstStart);
        Assert.False(nextStart);
    }

    [Fact]
    public async Task The_seeded_admin_is_an_admin()
    {
        IDbContextFactory<SprintDbContext> db = TestFactory.NewDb();
        PasswordHasher hasher = new();
        JwtTokenService tokens = NewTokens();
        UserService users = new(db, hasher, tokens, new ServerSettingsService(db));

        await new DevSeeder(db, hasher).SeedAsync();

        AuthResponse login = await users.LoginAsync(AdminLogin);
        UserProfile? profile = await users.GetProfileAsync(tokens.ValidateAndGetUserId(login.Token));
        Assert.True(profile?.IsAdmin);
    }

    private static JwtTokenService NewTokens() =>
        new(JwtTokenService.KeyFromSecret("test-secret-long-enough-for-hs256-aaaaaa"));
}

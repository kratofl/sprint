using System.Web;
using HotChocolate;
using Microsoft.AspNetCore.Http;
using Microsoft.EntityFrameworkCore;
using Sprint.Api.Auth;
using Sprint.Api.Auth.Discord;
using Sprint.Api.Data;
using Sprint.Api.Services;
using Sprint.Contracts;
using Xunit;

namespace Sprint.Api.Tests;

/// <summary>Discord sign-in end to end below HTTP: start → (fake) Discord → callback → ticket → JWT.</summary>
public class DiscordSignInTests
{
    private const string Callback = "https://api.sprint.example/api/auth/discord/callback";
    private static readonly JwtTokenService Tokens = new(JwtTokenService.KeyFromSecret("test-secret-long-enough-for-hs256-aaaaaa"));

    private sealed record World(DiscordSignIn SignIn, FakeDiscord Discord, IDbContextFactory<SprintDbContext> Db, ServerSettingsService Settings, TestClock Clock);

    private static World NewWorld()
    {
        IDbContextFactory<SprintDbContext> db = TestFactory.NewDb();
        DiscordOptions options = new("client", "secret");
        ServerSettingsService settings = new(db, options);
        FakeDiscord discord = new();
        TestClock clock = new();
        PublicUrls urls = new(new Uri("https://api.sprint.example"), new Uri("https://sprint.example"));
        return new World(new DiscordSignIn(options, urls, discord, db, settings, Tokens, clock), discord, db, settings, clock);
    }

    private static DiscordIdentity Ada() => new("1001", "ada", "Ada L", "abc123");

    /// <summary>Runs a web sign-in for <paramref name="identity"/> and returns the query of where the browser ends up.</summary>
    private static async Task<System.Collections.Specialized.NameValueCollection> SignInAsync(World w, DiscordIdentity identity, SignInTarget? target = null)
    {
        w.Discord.Identities["code"] = identity;
        (string state, _) = w.SignIn.Start(target ?? new WebSignIn("/sessions"), Callback);
        Uri back = await w.SignIn.CompleteAsync(state, "code", null, Callback, CancellationToken.None) ?? throw new InvalidOperationException("no redirect");
        return HttpUtility.ParseQueryString(back.Query);
    }

    private static async Task<UserEntity> OnlyUserAsync(World w)
    {
        await using SprintDbContext db = await w.Db.CreateDbContextAsync();
        return Assert.Single(await db.Users.ToListAsync());
    }

    [Fact]
    public async Task A_first_discord_sign_in_creates_the_admin_account_and_a_ticket_trades_for_a_jwt()
    {
        World w = NewWorld();

        System.Collections.Specialized.NameValueCollection query = await SignInAsync(w, Ada());
        AuthResponse auth = await w.SignIn.RedeemAsync(query["ticket"] ?? throw new InvalidOperationException("no ticket"), CancellationToken.None);

        UserEntity user = await OnlyUserAsync(w);
        Assert.Equal(user.Id, Tokens.ValidateAndGetUserId(auth.Token));
        Assert.True(user.IsAdmin);
        Assert.Equal("1001", user.DiscordId);
        Assert.Equal("Ada L", user.DisplayName);
        Assert.Null(user.Email);
        Assert.Equal("https://cdn.discordapp.com/avatars/1001/abc123.png", user.AvatarUrl);
        Assert.Equal("", user.PasswordHash);
        Assert.Equal("/sessions", query["next"]);
    }

    [Fact]
    public async Task Signing_in_again_finds_the_same_account()
    {
        World w = NewWorld();

        await SignInAsync(w, Ada());
        await SignInAsync(w, Ada() with { AvatarHash = "new" });

        Assert.EndsWith("/new.png", (await OnlyUserAsync(w)).AvatarUrl);
    }

    [Fact]
    public async Task A_password_account_is_never_linked_to_discord_and_stays_its_own()
    {
        World w = NewWorld();
        string existing = await TestUsers.AddAsync(w.Db, "Ada", email: "ada@sprint.gg");

        SignedIn signedIn = Assert.IsType<SignedIn>(await w.SignIn.ResolveAccountAsync(Ada(), CancellationToken.None));

        Assert.NotEqual(existing, signedIn.UserId);
        await using SprintDbContext db = await w.Db.CreateDbContextAsync();
        Assert.Null((await db.Users.SingleAsync(u => u.Id == existing)).DiscordId);
    }

    [Fact]
    public async Task Closed_registration_refuses_a_new_discord_account_but_not_a_linked_one()
    {
        World w = NewWorld();
        string admin = await TestUsers.AddAsync(w.Db, "Admin", email: "admin@sprint.gg");
        await using (SprintDbContext db = await w.Db.CreateDbContextAsync())
        {
            (await db.Users.SingleAsync(u => u.Id == admin)).IsAdmin = true;
            await db.SaveChangesAsync();
        }

        await w.Settings.UpdateAsync(admin, new UpdateServerSettingsInput { InstanceName = "Garage", AllowRegistration = false });

        SignInRefused refused = Assert.IsType<SignInRefused>(await w.SignIn.ResolveAccountAsync(Ada(), CancellationToken.None));
        Assert.Contains("closed", refused.Reason);
        string linked = await TestUsers.AddAsync(w.Db, "Ada", discordId: "1001", passwordHash: "");
        Assert.Equal(new SignedIn(linked), await w.SignIn.ResolveAccountAsync(Ada(), CancellationToken.None));
    }

    [Fact]
    public async Task A_refusal_or_a_discord_failure_reaches_the_caller_as_an_error_not_a_ticket()
    {
        World w = NewWorld();

        (string state, _) = w.SignIn.Start(new DesktopSignIn(new Uri("http://127.0.0.1:5123/cb"), "nonce-1"), Callback);
        Uri back = await w.SignIn.CompleteAsync(state, "unknown-code", null, Callback, CancellationToken.None) ?? throw new InvalidOperationException();

        System.Collections.Specialized.NameValueCollection query = HttpUtility.ParseQueryString(back.Query);
        Assert.Equal("127.0.0.1", back.Host);
        Assert.Equal(5123, back.Port);
        Assert.Equal("nonce-1", query["state"]);
        Assert.Null(query["ticket"]);
        Assert.False(string.IsNullOrEmpty(query["error"]));
    }

    [Fact]
    public async Task A_desktop_sign_in_ends_at_its_loopback_with_ticket_and_nonce()
    {
        World w = NewWorld();

        System.Collections.Specialized.NameValueCollection query = await SignInAsync(w, Ada(), new DesktopSignIn(new Uri("http://127.0.0.1:5123/cb"), "nonce-1"));

        Assert.Equal("nonce-1", query["state"]);
        Assert.False(string.IsNullOrEmpty(query["ticket"]));
    }

    [Fact]
    public async Task An_oauth_state_works_once()
    {
        World w = NewWorld();
        w.Discord.Identities["code"] = Ada();
        (string state, _) = w.SignIn.Start(new WebSignIn("/"), Callback);

        Assert.NotNull(await w.SignIn.CompleteAsync(state, "code", null, Callback, CancellationToken.None));
        Assert.Null(await w.SignIn.CompleteAsync(state, "code", null, Callback, CancellationToken.None));
    }

    [Fact]
    public async Task A_ticket_works_once()
    {
        World w = NewWorld();
        string ticket = (await SignInAsync(w, Ada()))["ticket"] ?? throw new InvalidOperationException("no ticket");

        await w.SignIn.RedeemAsync(ticket, CancellationToken.None);

        await Assert.ThrowsAsync<GraphQLException>(() => w.SignIn.RedeemAsync(ticket, CancellationToken.None));
    }

    [Fact]
    public async Task A_ticket_expires_after_a_minute()
    {
        World w = NewWorld();
        string ticket = (await SignInAsync(w, Ada()))["ticket"] ?? throw new InvalidOperationException("no ticket");

        w.Clock.Advance(TimeSpan.FromSeconds(61));

        await Assert.ThrowsAsync<GraphQLException>(() => w.SignIn.RedeemAsync(ticket, CancellationToken.None));
    }

    [Fact]
    public async Task The_authorize_url_asks_discord_for_identify_only_with_our_callback()
    {
        World w = NewWorld();

        (string state, Uri authorize) = w.SignIn.Start(new WebSignIn("/"), Callback);
        System.Collections.Specialized.NameValueCollection query = HttpUtility.ParseQueryString(authorize.Query);

        Assert.Equal("discord.com", authorize.Host);
        Assert.Equal("identify", query["scope"]);
        Assert.Equal(Callback, query["redirect_uri"]);
        Assert.Equal(state, query["state"]);
        Assert.Equal("client", query["client_id"]);
    }
}

/// <summary>Password sign-in for accounts that came from Discord.</summary>
public class DiscordOnlyAccountTests
{
    private static readonly JwtTokenService Tokens = new(JwtTokenService.KeyFromSecret("test-secret-long-enough-for-hs256-aaaaaa"));

    private static UserService Users(IDbContextFactory<SprintDbContext> db) =>
        new(db, new PasswordHasher(), Tokens, new ServerSettingsService(db, DiscordOptions.Disabled));

    [Fact]
    public async Task Password_sign_in_turns_a_discord_only_account_away_by_name()
    {
        IDbContextFactory<SprintDbContext> db = TestFactory.NewDb();
        await TestUsers.AddAsync(db, "Ada", email: "ada@sprint.gg", discordId: "1001", passwordHash: "");

        GraphQLException error = await Assert.ThrowsAsync<GraphQLException>(() =>
            Users(db).LoginAsync(new AuthRequest { Email = "ada@sprint.gg", Password = "" }));
        Assert.Contains("Discord", error.Message);
    }

    [Fact]
    public async Task A_discord_account_with_an_email_can_set_its_first_password_and_then_use_it()
    {
        IDbContextFactory<SprintDbContext> db = TestFactory.NewDb();
        string id = await TestUsers.AddAsync(db, "Ada", email: "ada@sprint.gg", discordId: "1001", passwordHash: "");
        UserService users = Users(db);

        await users.ChangePasswordAsync(id, "", "first-password");

        Assert.True((await users.GetProfileAsync(id))?.HasPassword);
        AuthResponse login = await users.LoginAsync(new AuthRequest { Email = "ada@sprint.gg", Password = "first-password" });
        Assert.Equal(id, Tokens.ValidateAndGetUserId(login.Token));
    }

    [Fact]
    public async Task An_email_registers_once_whatever_its_case_and_signs_in_in_any_case()
    {
        IDbContextFactory<SprintDbContext> db = TestFactory.NewDb();
        UserService users = Users(db);

        AuthResponse registered = await users.RegisterAsync(new AuthRequest { Email = " Ada@Sprint.gg ", Password = "password-1" });
        GraphQLException again = await Assert.ThrowsAsync<GraphQLException>(() =>
            users.RegisterAsync(new AuthRequest { Email = "ada@sprint.gg", Password = "password-2" }));

        Assert.Contains("already registered", again.Message);
        AuthResponse login = await users.LoginAsync(new AuthRequest { Email = "ADA@sprint.gg", Password = "password-1" });
        Assert.Equal(Tokens.ValidateAndGetUserId(registered.Token), Tokens.ValidateAndGetUserId(login.Token));
    }

    [Fact]
    public async Task A_discord_account_without_an_email_is_told_it_signs_in_with_discord()
    {
        IDbContextFactory<SprintDbContext> db = TestFactory.NewDb();
        string id = await TestUsers.AddAsync(db, "Ada", email: null, discordId: "1001", passwordHash: "");

        GraphQLException error = await Assert.ThrowsAsync<GraphQLException>(() => Users(db).ChangePasswordAsync(id, "", "first-password"));
        Assert.Contains("Discord", error.Message);
    }
}

/// <summary>Where a sign-in may send the browser back to.</summary>
public class SignInRedirectTests
{
    [Theory]
    [InlineData("http://127.0.0.1:5123/callback")]
    [InlineData("http://localhost:80/cb?x=1")]
    [InlineData("http://[::1]:9000/")]
    public void Loopback_http_on_any_port_is_accepted(string redirect) =>
        Assert.True(SignInRedirects.TryLoopback(redirect, out _));

    [Theory]
    [InlineData("https://127.0.0.1:5123/callback")]
    [InlineData("http://evil.example/cb")]
    [InlineData("http://127.0.0.1.evil.example/cb")]
    [InlineData("http://user@127.0.0.1:5123/cb")]
    [InlineData("http://192.168.1.10:5123/cb")]
    [InlineData("http://127.0.0.2:5123/cb")]
    [InlineData("/relative")]
    [InlineData("")]
    public void Anything_but_this_machine_over_http_is_rejected(string redirect) =>
        Assert.False(SignInRedirects.TryLoopback(redirect, out _));

    [Theory]
    [InlineData(null, "/")]
    [InlineData("", "/")]
    [InlineData("/sessions/abc?tab=laps", "/sessions/abc?tab=laps")]
    public void A_relative_next_is_kept(string? next, string expected) =>
        Assert.Equal(expected, SignInRedirects.SafeNext(next));

    [Theory]
    [InlineData("//evil.example")]
    [InlineData("/\\evil.example")]
    [InlineData("https://evil.example")]
    [InlineData("sessions")]
    [InlineData("/a\nb")]
    public void A_next_that_could_leave_the_web_app_is_rejected(string next) =>
        Assert.Null(SignInRedirects.SafeNext(next));

    [Theory]
    [InlineData("http", "192.168.1.10:8080", "", "https://api.sprint.example/api/auth/discord/start?client=desktop&state=n-1&hopped=1")]
    [InlineData("https", "api.sprint.example", "", null)]
    [InlineData("http", "192.168.1.10:8080", "&hopped=1", null)]
    public void A_start_off_the_public_api_host_moves_there_once_so_the_cookie_meets_the_callback(string scheme, string host, string extra, string? expected)
    {
        DefaultHttpContext http = new();
        http.Request.Scheme = scheme;
        http.Request.Host = new HostString(host);
        http.Request.QueryString = new QueryString("?client=desktop&state=n-1" + extra);

        Uri? moved = DiscordEndpoints.PublicStartUrl(http, new PublicUrls(new Uri("https://api.sprint.example"), null));

        Assert.Equal(expected, moved?.AbsoluteUri);
        Assert.Null(DiscordEndpoints.PublicStartUrl(http, new PublicUrls(null, null)));
    }

    [Fact]
    public void A_web_sign_in_needs_the_public_web_url_and_a_desktop_one_needs_a_nonce()
    {
        PublicUrls noWeb = new(null, null);
        PublicUrls urls = new(null, new Uri("https://sprint.example"));

        Assert.Null(DiscordEndpoints.TargetFrom("web", "/", null, null, noWeb));
        Assert.Equal(new WebSignIn("/"), DiscordEndpoints.TargetFrom("web", null, null, null, urls));
        Assert.Null(DiscordEndpoints.TargetFrom("desktop", null, "http://127.0.0.1:5000/cb", null, urls));
        Assert.Null(DiscordEndpoints.TargetFrom("desktop", null, "http://127.0.0.1:5000/cb", "bad nonce", urls));
        Assert.IsType<DesktopSignIn>(DiscordEndpoints.TargetFrom("desktop", null, "http://127.0.0.1:5000/cb", "n-1", urls));
        Assert.Null(DiscordEndpoints.TargetFrom("other", "/", null, null, urls));
    }
}

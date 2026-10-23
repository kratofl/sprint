using HotChocolate;
using Microsoft.EntityFrameworkCore;
using Sprint.Api.Data;
using Sprint.Api.Services;
using Sprint.Contracts;

namespace Sprint.Api.Auth.Discord;

/// <summary>Who started a Discord sign-in, and so where its ticket goes.</summary>
public abstract record SignInTarget;

/// <summary>The web app: back to <c>${SPRINT_PUBLIC_WEB_URL}/auth/complete</c>, then to <see cref="Next"/>.</summary>
public sealed record WebSignIn(string Next) : SignInTarget;

/// <summary>The desktop: back to its loopback listener, echoing its own nonce.</summary>
public sealed record DesktopSignIn(Uri Redirect, string State) : SignInTarget;

/// <summary>How a Discord identity resolved to a Sprint account.</summary>
public abstract record SignInOutcome;

public sealed record SignedIn(string UserId) : SignInOutcome;

public sealed record SignInRefused(string Reason) : SignInOutcome;

/// <summary>
/// "Sign in with Discord" for the web and the desktop alike. The browser goes
/// <c>/start</c> → Discord → <c>/callback</c>, which ends at the caller with a single-use ticket;
/// the caller trades the ticket for a JWT with <c>redeemSignInTicket</c>. The JWT never appears
/// in a URL, where it would land in browser history and proxy logs.
/// </summary>
public sealed class DiscordSignIn(
    DiscordOptions options,
    PublicUrls urls,
    IDiscordClient discord,
    IDbContextFactory<SprintDbContext> dbFactory,
    ServerSettingsService settings,
    JwtTokenService tokens,
    TimeProvider time)
{
    public static readonly TimeSpan TicketTtl = TimeSpan.FromSeconds(60);
    private static readonly TimeSpan PendingTtl = TimeSpan.FromMinutes(10);

    private readonly OneTimeTokens<SignInTarget> _pending = new(PendingTtl, time);
    private readonly OneTimeTokens<string> _tickets = new(TicketTtl, time);

    public bool Enabled => options.Enabled;

    /// <summary>Records a sign-in in progress and returns its OAuth state and Discord's authorize URL.</summary>
    public (string State, Uri AuthorizeUrl) Start(SignInTarget target, string redirectUri)
    {
        string state = this._pending.Issue(target);
        Uri authorize = SignInRedirects.WithQuery(new Uri(DiscordHttpClient.AuthorizeUrl),
            ("response_type", "code"),
            ("client_id", options.ClientId),
            ("scope", "identify"),
            ("redirect_uri", redirectUri),
            ("state", state));
        return (state, authorize);
    }

    /// <summary>
    /// Finishes a sign-in Discord sent back. Returns where to send the browser — with a ticket, or
    /// with an error — or null when the state is unknown or expired and there is nobody to send it to.
    /// </summary>
    public async Task<Uri?> CompleteAsync(string? state, string? code, string? discordError, string redirectUri, CancellationToken ct)
    {
        SignInTarget? target = this._pending.Redeem(state);
        if (target is null)
            return null;
        if (!string.IsNullOrEmpty(discordError) || string.IsNullOrEmpty(code))
            return this.Back(target, error: "Discord sign-in was cancelled.");

        DiscordIdentity identity;
        try
        {
            identity = await discord.IdentifyAsync(code, redirectUri, ct);
        }
        catch (DiscordException ex)
        {
            return this.Back(target, error: ex.Message);
        }

        return await this.ResolveAccountAsync(identity, ct) switch
        {
            SignedIn signedIn => this.Back(target, ticket: this._tickets.Issue(signedIn.UserId)),
            SignInRefused refused => this.Back(target, error: refused.Reason),
            _ => throw new InvalidOperationException("Unknown sign-in outcome."),
        };
    }

    /// <summary>Trades a ticket for a JWT. Each ticket works once, for <see cref="TicketTtl"/>.</summary>
    public async Task<AuthResponse> RedeemAsync(string ticket, CancellationToken ct)
    {
        string userId = this._tickets.Redeem(ticket)
            ?? throw new GraphQLException("This sign-in link has expired. Sign in again.");
        await using SprintDbContext db = await dbFactory.CreateDbContextAsync(ct);
        UserEntity user = await db.Users.FindAsync([userId], ct)
            ?? throw new GraphQLException("That account no longer exists.");
        return new AuthResponse { Token = tokens.Issue(user.Id, user.Email ?? "") };
    }

    /// <summary>
    /// The Sprint account for a Discord identity: the one already linked to it; else a new account,
    /// if the server takes new accounts. The server's first account is its admin, however it signed
    /// up. Sprint asks Discord for no email, so a Discord account has none and an existing password
    /// account is never linked to Discord by guesswork.
    /// </summary>
    public async Task<SignInOutcome> ResolveAccountAsync(DiscordIdentity identity, CancellationToken ct)
    {
        await using SprintDbContext db = await dbFactory.CreateDbContextAsync(ct);

        UserEntity? user = await db.Users.FirstOrDefaultAsync(u => u.DiscordId == identity.Id, ct);
        if (user is null)
        {
            bool first = !await db.Users.AnyAsync(ct);
            if (!first && !(await settings.GetAsync(ct)).AllowRegistration)
                return new SignInRefused("Registration is closed on this server. Ask its admin for an account.");

            user = new UserEntity
            {
                Id = Ids.New(),
                Email = null,
                PasswordHash = "",
                IsAdmin = first,
                CreatedAt = time.GetUtcNow(),
            };
            db.Users.Add(user);
        }

        user.DiscordId = identity.Id;
        user.AvatarUrl = identity.AvatarUrl;
        if (user.DisplayName.Length == 0)
            user.DisplayName = Truncate(identity.DisplayName.Trim(), UserService.MaxDisplayNameLength);
        await db.SaveChangesAsync(ct);
        return new SignedIn(user.Id);
    }

    /// <summary>The URL the callback sends the browser to: <paramref name="ticket"/> on success, <paramref name="error"/> otherwise.</summary>
    private Uri Back(SignInTarget target, string? ticket = null, string? error = null)
    {
        (string, string) outcome = ticket is not null ? ("ticket", ticket) : ("error", error ?? "Sign-in failed.");
        return target switch
        {
            DesktopSignIn desktop => SignInRedirects.WithQuery(desktop.Redirect, outcome, ("state", desktop.State)),
            WebSignIn web => SignInRedirects.WithQuery(new Uri(urls.WebLink("/auth/complete")), outcome, ("next", web.Next)),
            _ => throw new InvalidOperationException("Unknown sign-in target."),
        };
    }

    private static string Truncate(string value, int length) => value.Length <= length ? value : value[..length];
}

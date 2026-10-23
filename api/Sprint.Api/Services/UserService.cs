using HotChocolate;
using Microsoft.EntityFrameworkCore;
using Sprint.Api.Auth;
using Sprint.Api.Data;
using Sprint.Contracts;

namespace Sprint.Api.Services;

/// <summary>Registration + login, backed by Postgres. Faithful port of the Go <c>authhandler</c> (now persisted, not in-memory).</summary>
public sealed class UserService(
    IDbContextFactory<SprintDbContext> dbFactory,
    PasswordHasher hasher,
    JwtTokenService tokens,
    ServerSettingsService settings)
{
    public const int MaxDisplayNameLength = 40;

    /// <summary>
    /// Creates a user and returns a signed token. Throws if the email is already registered, or
    /// when the admin closed registration. The server's first account is always allowed and is
    /// its admin — a fresh self-hosted server has nobody else to hand that to.
    /// </summary>
    public async Task<AuthResponse> RegisterAsync(AuthRequest request, CancellationToken ct = default)
    {
        if (string.IsNullOrWhiteSpace(request.Email) || string.IsNullOrEmpty(request.Password))
            throw new GraphQLException("Email and password are required.");

        string email = NormalizeEmail(request.Email) ?? "";
        await using SprintDbContext db = await dbFactory.CreateDbContextAsync(ct);

        if (await db.Users.AnyAsync(u => u.Email != null && u.Email.ToLower() == email, ct))
            throw new GraphQLException("Email already registered.");

        bool first = !await db.Users.AnyAsync(ct);
        if (!first && !(await settings.GetAsync(ct)).AllowRegistration)
            throw new GraphQLException("Registration is closed on this server. Ask its admin for an account.");

        UserEntity user = new()
        {
            Id = Ids.New(),
            Email = email,
            PasswordHash = hasher.Hash(request.Password),
            IsAdmin = first,
            CreatedAt = DateTimeOffset.UtcNow
        };
        db.Users.Add(user);
        await db.SaveChangesAsync(ct);

        return new AuthResponse { Token = tokens.Issue(user.Id, email) };
    }

    /// <summary>
    /// Verifies credentials and returns a signed token. Throws on invalid credentials, and with its
    /// own message for an account that only signs in with Discord.
    /// </summary>
    public async Task<AuthResponse> LoginAsync(AuthRequest request, CancellationToken ct = default)
    {
        string email = NormalizeEmail(request.Email) ?? "";
        await using SprintDbContext db = await dbFactory.CreateDbContextAsync(ct);
        UserEntity? user = await db.Users.FirstOrDefaultAsync(u => u.Email != null && u.Email.ToLower() == email, ct);

        if (user is { PasswordHash.Length: 0, DiscordId: not null })
            throw new GraphQLException("This account signs in with Discord.");
        if (user is null || !hasher.Verify(request.Password, user.PasswordHash))
            throw new GraphQLException("Invalid credentials.");

        return new AuthResponse { Token = tokens.Issue(user.Id, user.Email ?? "") };
    }

    /// <summary>Loads the profile for an authenticated user id, or null if the user no longer exists.</summary>
    public async Task<UserProfile?> GetProfileAsync(string userId, CancellationToken ct = default)
    {
        await using SprintDbContext db = await dbFactory.CreateDbContextAsync(ct);
        UserEntity? user = await db.Users.FindAsync([userId], ct);
        return user is null ? null : Profile(user);
    }

    /// <summary>
    /// Sets the name other drivers see. Trimmed and bounded: this is the one field of a user
    /// that strangers read, so it cannot be blank-but-not-empty or a paragraph.
    /// </summary>
    public async Task<UserProfile> SetDisplayNameAsync(string userId, string displayName, CancellationToken ct = default)
    {
        string trimmed = (displayName ?? "").Trim();
        if (trimmed.Length is 0 or > MaxDisplayNameLength)
        {
            throw new GraphQLException($"A display name must be between 1 and {MaxDisplayNameLength} characters.");
        }

        await using SprintDbContext db = await dbFactory.CreateDbContextAsync(ct);
        UserEntity user = await db.Users.FindAsync([userId], ct)
            ?? throw new GraphQLException("That user no longer exists.");

        user.DisplayName = trimmed;
        await db.SaveChangesAsync(ct);
        return Profile(user);
    }

    /// <summary>
    /// Replaces the password after checking the current one. An account created through Discord
    /// has none yet, so it sets its first one without — but only when it has an email to sign in
    /// with; without one, a password could never be used.
    /// </summary>
    public async Task<bool> ChangePasswordAsync(string userId, string currentPassword, string newPassword, CancellationToken ct = default)
    {
        if (string.IsNullOrEmpty(newPassword) || newPassword.Length < 8)
            throw new GraphQLException("The new password needs at least 8 characters.");

        await using SprintDbContext db = await dbFactory.CreateDbContextAsync(ct);
        UserEntity user = await db.Users.FindAsync([userId], ct)
            ?? throw new GraphQLException("That user no longer exists.");
        if (user.PasswordHash.Length == 0)
        {
            if (string.IsNullOrEmpty(user.Email))
                throw new GraphQLException("Your account signs in with Discord and has no email address to sign in with a password.");
        }
        else if (!hasher.Verify(currentPassword ?? "", user.PasswordHash))
        {
            throw new GraphQLException("The current password is not right.");
        }

        user.PasswordHash = hasher.Hash(newPassword);
        await db.SaveChangesAsync(ct);
        return true;
    }

    /// <summary>
    /// An email as accounts store and compare it: trimmed and lower-cased, so that
    /// <c>Ada@x.gg</c> and <c>ada@x.gg</c> are one account. Null for a blank one.
    /// </summary>
    public static string? NormalizeEmail(string? email) =>
        string.IsNullOrWhiteSpace(email) ? null : email.Trim().ToLowerInvariant();

    private static UserProfile Profile(UserEntity user) => new()
    {
        Id = user.Id,
        Email = user.Email ?? "",
        DisplayName = user.DisplayName,
        IsAdmin = user.IsAdmin,
        AvatarUrl = user.AvatarUrl,
        HasPassword = user.PasswordHash.Length > 0,
        DiscordLinked = user.DiscordId is not null,
        CreatedAt = user.CreatedAt,
    };
}

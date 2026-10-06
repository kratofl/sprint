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
    /// <summary>
    /// Creates a user and returns a signed token. Throws if the email is already registered, or
    /// when the admin closed registration. The server's first account is always allowed and is
    /// its admin — a fresh self-hosted server has nobody else to hand that to.
    /// </summary>
    public async Task<AuthResponse> RegisterAsync(AuthRequest request, CancellationToken ct = default)
    {
        if (string.IsNullOrWhiteSpace(request.Email) || string.IsNullOrEmpty(request.Password))
            throw new GraphQLException("Email and password are required.");

        await using var db = await dbFactory.CreateDbContextAsync(ct);

        if (await db.Users.AnyAsync(u => u.Email == request.Email, ct))
            throw new GraphQLException("Email already registered.");

        bool first = !await db.Users.AnyAsync(ct);
        if (!first && !(await settings.GetAsync(ct)).AllowRegistration)
            throw new GraphQLException("Registration is closed on this server. Ask its admin for an account.");

        var user = new UserEntity
        {
            Id = Ids.New(),
            Email = request.Email,
            PasswordHash = hasher.Hash(request.Password),
            IsAdmin = first,
            CreatedAt = DateTimeOffset.UtcNow
        };
        db.Users.Add(user);
        await db.SaveChangesAsync(ct);

        return new AuthResponse { Token = tokens.Issue(user.Id, user.Email) };
    }

    /// <summary>Verifies credentials and returns a signed token. Throws on invalid credentials.</summary>
    public async Task<AuthResponse> LoginAsync(AuthRequest request, CancellationToken ct = default)
    {
        await using var db = await dbFactory.CreateDbContextAsync(ct);
        var user = await db.Users.FirstOrDefaultAsync(u => u.Email == request.Email, ct);

        if (user is null || !hasher.Verify(request.Password, user.PasswordHash))
            throw new GraphQLException("Invalid credentials.");

        return new AuthResponse { Token = tokens.Issue(user.Id, user.Email) };
    }

    /// <summary>Loads the profile for an authenticated user id, or null if the user no longer exists.</summary>
    public async Task<UserProfile?> GetProfileAsync(string userId, CancellationToken ct = default)
    {
        await using var db = await dbFactory.CreateDbContextAsync(ct);
        var user = await db.Users.FindAsync([userId], ct);
        return user is null ? null : Profile(user);
    }

    /// <summary>
    /// Sets the name other drivers see. Trimmed and bounded: this is the one field of a user
    /// that strangers read, so it cannot be blank-but-not-empty or a paragraph.
    /// </summary>
    public async Task<UserProfile> SetDisplayNameAsync(string userId, string displayName, CancellationToken ct = default)
    {
        var trimmed = (displayName ?? "").Trim();
        if (trimmed.Length is 0 or > 40)
        {
            throw new GraphQLException("A display name must be between 1 and 40 characters.");
        }

        await using var db = await dbFactory.CreateDbContextAsync(ct);
        var user = await db.Users.FindAsync([userId], ct)
            ?? throw new GraphQLException("That user no longer exists.");

        user.DisplayName = trimmed;
        await db.SaveChangesAsync(ct);
        return Profile(user);
    }

    /// <summary>Replaces the password after checking the current one.</summary>
    public async Task<bool> ChangePasswordAsync(string userId, string currentPassword, string newPassword, CancellationToken ct = default)
    {
        if (string.IsNullOrEmpty(newPassword) || newPassword.Length < 8)
            throw new GraphQLException("The new password needs at least 8 characters.");

        await using SprintDbContext db = await dbFactory.CreateDbContextAsync(ct);
        UserEntity user = await db.Users.FindAsync([userId], ct)
            ?? throw new GraphQLException("That user no longer exists.");
        if (!hasher.Verify(currentPassword ?? "", user.PasswordHash))
            throw new GraphQLException("The current password is not right.");

        user.PasswordHash = hasher.Hash(newPassword);
        await db.SaveChangesAsync(ct);
        return true;
    }

    private static UserProfile Profile(UserEntity user) => new()
    {
        Id = user.Id,
        Email = user.Email,
        DisplayName = user.DisplayName,
        IsAdmin = user.IsAdmin,
        CreatedAt = user.CreatedAt,
    };
}

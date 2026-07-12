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
    JwtTokenService tokens)
{
    /// <summary>Creates a user and returns a signed token. Throws if the email is already registered.</summary>
    public async Task<AuthResponse> RegisterAsync(AuthRequest request, CancellationToken ct = default)
    {
        if (string.IsNullOrWhiteSpace(request.Email) || string.IsNullOrEmpty(request.Password))
            throw new GraphQLException("Email and password are required.");

        await using var db = await dbFactory.CreateDbContextAsync(ct);

        if (await db.Users.AnyAsync(u => u.Email == request.Email, ct))
            throw new GraphQLException("Email already registered.");

        var user = new UserEntity
        {
            Id = Ids.New(),
            Email = request.Email,
            PasswordHash = hasher.Hash(request.Password),
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
        return user is null
            ? null
            : new UserProfile { Id = user.Id, Email = user.Email, CreatedAt = user.CreatedAt };
    }
}

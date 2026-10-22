using Microsoft.EntityFrameworkCore;
using Sprint.Api.Auth;
using Sprint.Api.Data;

namespace Sprint.Api.Services;

/// <summary>
/// Creates a fixed local sign-in so a fresh dev database is usable without registering.
/// Development only: Program.cs runs it when the host environment is Development, which
/// <c>Properties/launchSettings.json</c> sets for <c>make dev-api</c> and never ships.
/// The account is the server's admin, so the admin settings can be tried locally.
/// </summary>
public sealed class DevSeeder(IDbContextFactory<SprintDbContext> dbFactory, PasswordHasher hasher)
{
    public const string AdminEmail = "admin@sprint.local";
    public const string AdminPassword = "admin";

    /// <summary>
    /// Adds the admin account unless it exists, and makes sure an existing one is an admin
    /// (it may predate roles). Returns whether it was created.
    /// </summary>
    public async Task<bool> SeedAsync(CancellationToken ct = default)
    {
        await using SprintDbContext db = await dbFactory.CreateDbContextAsync(ct);
        if (await db.Users.FirstOrDefaultAsync(u => u.Email == AdminEmail, ct) is { } existing)
        {
            if (!existing.IsAdmin)
            {
                existing.IsAdmin = true;
                await db.SaveChangesAsync(ct);
            }
            return false;
        }

        db.Users.Add(new UserEntity
        {
            Id = Ids.New(),
            Email = AdminEmail,
            DisplayName = "Admin",
            PasswordHash = hasher.Hash(AdminPassword),
            IsAdmin = true,
            CreatedAt = DateTimeOffset.UtcNow
        });
        await db.SaveChangesAsync(ct);
        return true;
    }
}

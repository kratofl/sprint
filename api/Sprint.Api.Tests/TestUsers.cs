using Microsoft.EntityFrameworkCore;
using Sprint.Api.Data;

namespace Sprint.Api.Tests;

internal static class TestUsers
{
    /// <summary>Adds an account straight to the store and returns its id.</summary>
    public static async Task<string> AddAsync(IDbContextFactory<SprintDbContext> db, string displayName, string? email = null, string? discordId = null, string passwordHash = "x")
    {
        await using SprintDbContext ctx = await db.CreateDbContextAsync();
        UserEntity user = new()
        {
            Id = Guid.NewGuid().ToString("N"),
            Email = email,
            DisplayName = displayName,
            DiscordId = discordId,
            PasswordHash = passwordHash,
            CreatedAt = DateTimeOffset.UtcNow,
        };
        ctx.Users.Add(user);
        await ctx.SaveChangesAsync();
        return user.Id;
    }
}

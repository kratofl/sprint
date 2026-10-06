using HotChocolate;
using Microsoft.EntityFrameworkCore;
using Sprint.Api.Data;
using Sprint.Contracts;

namespace Sprint.Api.Services;

/// <summary>Server-wide settings: read by anyone, changed only by an admin.</summary>
public sealed class ServerSettingsService(IDbContextFactory<SprintDbContext> dbFactory)
{
    /// <summary>The saved settings, or the defaults when an admin never saved any.</summary>
    public async Task<ServerSettingsDto> GetAsync(CancellationToken ct = default)
    {
        await using SprintDbContext db = await dbFactory.CreateDbContextAsync(ct);
        ServerSettingsEntity? row = await db.ServerSettings.FindAsync([ServerSettingsEntity.SingletonId], ct);
        return row is null ? new ServerSettingsDto() : ToDto(row);
    }

    /// <summary>Saves the settings. Throws unless <paramref name="userId"/> is an admin.</summary>
    public async Task<ServerSettingsDto> UpdateAsync(string userId, UpdateServerSettingsInput input, CancellationToken ct = default)
    {
        string name = (input.InstanceName ?? "").Trim();
        if (name.Length is 0 or > 60)
            throw new GraphQLException("The server name must be between 1 and 60 characters.");

        await using SprintDbContext db = await dbFactory.CreateDbContextAsync(ct);
        UserEntity? user = await db.Users.FindAsync([userId], ct);
        if (user is not { IsAdmin: true })
            throw new GraphQLException("Only an admin can change the server settings.");

        ServerSettingsEntity? row = await db.ServerSettings.FindAsync([ServerSettingsEntity.SingletonId], ct);
        if (row is null)
        {
            row = new ServerSettingsEntity();
            db.ServerSettings.Add(row);
        }

        row.InstanceName = name;
        row.AllowRegistration = input.AllowRegistration;
        row.UpdatedAt = DateTimeOffset.UtcNow;
        await db.SaveChangesAsync(ct);
        return ToDto(row);
    }

    private static ServerSettingsDto ToDto(ServerSettingsEntity row) =>
        new() { InstanceName = row.InstanceName, AllowRegistration = row.AllowRegistration };
}

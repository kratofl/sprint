using Microsoft.EntityFrameworkCore;

namespace Sprint.Api.Data;

public sealed class SprintDbContext(DbContextOptions<SprintDbContext> options) : DbContext(options)
{
    public DbSet<UserEntity> Users => Set<UserEntity>();
    public DbSet<InviteCodeEntity> InviteCodes => Set<InviteCodeEntity>();
    public DbSet<SessionEntity> Sessions => Set<SessionEntity>();
    public DbSet<SetupEntity> Setups => Set<SetupEntity>();
    public DbSet<LayoutEntity> Layouts => Set<LayoutEntity>();
    public DbSet<LapTraceEntity> LapTraces => Set<LapTraceEntity>();
    public DbSet<ServerSettingsEntity> ServerSettings => Set<ServerSettingsEntity>();

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        modelBuilder.Entity<UserEntity>().HasIndex(u => u.Email).IsUnique();
        modelBuilder.Entity<SessionEntity>().HasIndex(s => s.OwnerId);
        modelBuilder.Entity<SetupEntity>().HasIndex(s => s.OwnerId);
        modelBuilder.Entity<LayoutEntity>().HasIndex(l => l.OwnerId);
        modelBuilder.Entity<InviteCodeEntity>().HasIndex(c => c.ExpiresAt);
        // A fetch is always by code, and a code must resolve to exactly one lap.
        modelBuilder.Entity<LapTraceEntity>().HasIndex(t => t.ShareCode).IsUnique();
        modelBuilder.Entity<LapTraceEntity>().HasIndex(t => t.OwnerId);
    }
}

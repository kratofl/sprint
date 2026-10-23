using Microsoft.EntityFrameworkCore;

namespace Sprint.Api.Data;

public sealed class SprintDbContext(DbContextOptions<SprintDbContext> options) : DbContext(options)
{
    public DbSet<UserEntity> Users => this.Set<UserEntity>();
    public DbSet<SessionEntity> Sessions => this.Set<SessionEntity>();
    public DbSet<SetupEntity> Setups => this.Set<SetupEntity>();
    public DbSet<LayoutEntity> Layouts => this.Set<LayoutEntity>();
    public DbSet<LapTraceEntity> LapTraces => this.Set<LapTraceEntity>();
    public DbSet<ServerSettingsEntity> ServerSettings => this.Set<ServerSettingsEntity>();
    public DbSet<EngineerInviteEntity> EngineerInvites => this.Set<EngineerInviteEntity>();
    public DbSet<EngineerLinkEntity> EngineerLinks => this.Set<EngineerLinkEntity>();
    public DbSet<SessionEngineerExclusionEntity> SessionEngineerExclusions => this.Set<SessionEngineerExclusionEntity>();

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        modelBuilder.Entity<UserEntity>().HasIndex(u => u.Email).IsUnique();
        modelBuilder.Entity<UserEntity>().HasIndex(u => u.DiscordId).IsUnique();
        modelBuilder.Entity<SessionEntity>().HasIndex(s => s.OwnerId);
        modelBuilder.Entity<SessionEntity>().HasIndex(s => new { s.OwnerId, s.SessionKey }).IsUnique();
        modelBuilder.Entity<SetupEntity>().HasIndex(s => s.OwnerId);
        modelBuilder.Entity<LayoutEntity>().HasIndex(l => l.OwnerId);
        modelBuilder.Entity<EngineerInviteEntity>().HasIndex(i => i.DriverId);
        // Single use: of two accepts racing on one link, the second fails to save.
        modelBuilder.Entity<EngineerInviteEntity>().Property(i => i.UsedAt).IsConcurrencyToken();
        modelBuilder.Entity<EngineerLinkEntity>().HasKey(l => new { l.DriverId, l.EngineerId });
        modelBuilder.Entity<EngineerLinkEntity>().HasIndex(l => l.EngineerId);
        modelBuilder.Entity<SessionEngineerExclusionEntity>().HasKey(x => new { x.DriverId, x.SessionKey, x.EngineerId });
        // A fetch is always by code, and a code must resolve to exactly one lap.
        modelBuilder.Entity<LapTraceEntity>().HasIndex(t => t.ShareCode).IsUnique();
        modelBuilder.Entity<LapTraceEntity>().HasIndex(t => t.OwnerId);
    }
}

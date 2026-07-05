using Microsoft.EntityFrameworkCore;

namespace Sprint.Api.Data;

public sealed class SprintDbContext(DbContextOptions<SprintDbContext> options) : DbContext(options)
{
    public DbSet<UserEntity> Users => Set<UserEntity>();
    public DbSet<InviteCodeEntity> InviteCodes => Set<InviteCodeEntity>();
    public DbSet<SessionEntity> Sessions => Set<SessionEntity>();
    public DbSet<SetupEntity> Setups => Set<SetupEntity>();
    public DbSet<LayoutEntity> Layouts => Set<LayoutEntity>();

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        modelBuilder.Entity<UserEntity>().HasIndex(u => u.Email).IsUnique();
        modelBuilder.Entity<SessionEntity>().HasIndex(s => s.OwnerId);
        modelBuilder.Entity<SetupEntity>().HasIndex(s => s.OwnerId);
        modelBuilder.Entity<LayoutEntity>().HasIndex(l => l.OwnerId);
        modelBuilder.Entity<InviteCodeEntity>().HasIndex(c => c.ExpiresAt);
    }
}

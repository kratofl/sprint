using HotChocolate;
using Sprint.Api.Data;
using Sprint.Api.Services;
using Xunit;

namespace Sprint.Api.Tests;

public class InviteServiceTests
{
    [Fact]
    public async Task Created_code_validates_and_carries_driver()
    {
        var db = TestFactory.NewDb();
        var invites = new InviteService(db);

        var created = await invites.CreateAsync("driver-1", "session-9");
        var validated = await invites.ValidateAsync(created.Value);

        Assert.Equal("driver-1", validated.DriverId);
        Assert.Equal("session-9", validated.SessionId);
        Assert.False(validated.DriverJoined);
    }

    [Fact]
    public async Task Unknown_code_is_rejected()
    {
        var invites = new InviteService(TestFactory.NewDb());
        await Assert.ThrowsAsync<GraphQLException>(() => invites.ValidateAsync("nope"));
    }

    [Fact]
    public async Task Expired_code_is_rejected()
    {
        var db = TestFactory.NewDb();
        await using (var ctx = await db.CreateDbContextAsync())
        {
            ctx.InviteCodes.Add(new InviteCodeEntity
            {
                Value = "old",
                DriverId = "d",
                CreatedAt = DateTimeOffset.UtcNow.AddHours(-48),
                ExpiresAt = DateTimeOffset.UtcNow.AddHours(-24)
            });
            await ctx.SaveChangesAsync();
        }

        var invites = new InviteService(db);
        await Assert.ThrowsAsync<GraphQLException>(() => invites.ValidateAsync("old"));
    }

    [Fact]
    public async Task Second_driver_join_is_rejected_anti_hijack()
    {
        var db = TestFactory.NewDb();
        var invites = new InviteService(db);
        var code = await invites.CreateAsync("driver-1", null);

        await invites.MarkDriverJoinedAsync(code.Value); // first join ok
        await Assert.ThrowsAsync<GraphQLException>(() => invites.MarkDriverJoinedAsync(code.Value));
    }

    [Fact]
    public async Task Reaper_removes_only_expired_codes()
    {
        var db = TestFactory.NewDb();
        var invites = new InviteService(db);
        var live = await invites.CreateAsync("driver-1", null);

        await using (var ctx = await db.CreateDbContextAsync())
        {
            ctx.InviteCodes.Add(new InviteCodeEntity
            {
                Value = "expired",
                DriverId = "d",
                CreatedAt = DateTimeOffset.UtcNow.AddHours(-48),
                ExpiresAt = DateTimeOffset.UtcNow.AddHours(-1)
            });
            await ctx.SaveChangesAsync();
        }

        var removed = await invites.ReapExpiredAsync();
        Assert.Equal(1, removed);
        Assert.NotNull(await invites.ValidateAsync(live.Value)); // survivor still valid
    }
}

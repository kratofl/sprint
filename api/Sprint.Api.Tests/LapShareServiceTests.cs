using HotChocolate;
using Microsoft.EntityFrameworkCore;
using Sprint.Api.Auth;
using Sprint.Api.Auth.Discord;
using Sprint.Api.Data;
using Sprint.Api.Services;
using Sprint.Contracts;
using Xunit;

namespace Sprint.Api.Tests;

/// <summary>
/// Per-lap share codes (#197). No friend graph: holding the code is the whole permission, and
/// the owner can withdraw it.
/// </summary>
public class LapShareServiceTests
{
    private static readonly byte[] Payload = [1, 2, 3, 4, 5];

    [Fact]
    public async Task Sharing_a_lap_mints_a_code_that_fetches_it_back()
    {
        (LapShareService? laps, IDbContextFactory<SprintDbContext>? db) = New();
        string owner = await NewUser(db, "Ada");

        SharedLapSummary shared = await laps.ShareAsync(owner, Input());
        SharedLapDto fetched = await laps.FetchAsync(shared.ShareCode);

        Assert.NotEmpty(shared.ShareCode);
        Assert.Equal("Spa-Francorchamps", fetched.TrackCourse);
        Assert.Equal(Payload, Convert.FromBase64String(fetched.PayloadBase64));
    }

    [Fact]
    public async Task A_shared_lap_is_attributed_to_a_display_name_never_an_email()
    {
        (LapShareService? laps, IDbContextFactory<SprintDbContext>? db) = New();
        string owner = await NewUser(db, "Ada");

        SharedLapDto fetched = await laps.FetchAsync((await laps.ShareAsync(owner, Input())).ShareCode);

        Assert.Equal("Ada", fetched.SharedBy);
        Assert.DoesNotContain("@", fetched.SharedBy, StringComparison.Ordinal);
    }

    [Fact]
    public async Task A_driver_who_never_set_a_name_is_credited_neutrally_not_by_email()
    {
        (LapShareService? laps, IDbContextFactory<SprintDbContext>? db) = New();
        string owner = await NewUser(db, displayName: "");

        SharedLapDto fetched = await laps.FetchAsync((await laps.ShareAsync(owner, Input())).ShareCode);

        Assert.Equal("Unknown driver", fetched.SharedBy);
    }

    [Fact]
    public async Task Two_shares_never_collide_on_a_code()
    {
        (LapShareService? laps, IDbContextFactory<SprintDbContext>? db) = New();
        string owner = await NewUser(db, "Ada");

        HashSet<string> codes = new HashSet<string>(StringComparer.Ordinal);
        for (int i = 0; i < 25; i++)
        {
            codes.Add((await laps.ShareAsync(owner, Input())).ShareCode);
        }

        Assert.Equal(25, codes.Count);
    }

    [Fact]
    public async Task A_code_is_hard_to_misread_off_a_chat_message()
    {
        (LapShareService? laps, IDbContextFactory<SprintDbContext>? db) = New();
        SharedLapSummary shared = await laps.ShareAsync(await NewUser(db, "Ada"), Input());

        // No 0/O or 1/I to confuse, and no vowels so no code spells anything.
        Assert.DoesNotContain(shared.ShareCode, c => "OI01AEU".Contains(c, StringComparison.Ordinal));
        Assert.True(shared.ShareCode.Length >= 10);
    }

    [Fact]
    public async Task An_unknown_code_and_a_revoked_code_are_different_answers()
    {
        (LapShareService? laps, IDbContextFactory<SprintDbContext>? db) = New();
        string owner = await NewUser(db, "Ada");
        SharedLapSummary shared = await laps.ShareAsync(owner, Input());
        await laps.RevokeAsync(owner, shared.ShareCode);

        GraphQLException revoked = await Assert.ThrowsAsync<GraphQLException>(() => laps.FetchAsync(shared.ShareCode));
        GraphQLException unknown = await Assert.ThrowsAsync<GraphQLException>(() => laps.FetchAsync("NOSUCHCODE22"));

        Assert.Contains("revoked", revoked.Message, StringComparison.OrdinalIgnoreCase);
        Assert.DoesNotContain("revoked", unknown.Message, StringComparison.OrdinalIgnoreCase);
    }

    [Fact]
    public async Task Revocation_outlives_no_session_and_needs_no_expiry()
    {
        // A lap code is not an engineer invite: it does not expire with a running session, so
        // the only thing that stops it working is the owner withdrawing it.
        (LapShareService? laps, IDbContextFactory<SprintDbContext>? db) = New();
        string owner = await NewUser(db, "Ada");
        SharedLapSummary shared = await laps.ShareAsync(owner, Input());

        await laps.FetchAsync(shared.ShareCode);
        SharedLapSummary revoked = await laps.RevokeAsync(owner, shared.ShareCode);

        Assert.True(revoked.Revoked);
    }

    [Fact]
    public async Task Another_driver_cannot_revoke_your_code_and_is_not_told_it_exists()
    {
        (LapShareService? laps, IDbContextFactory<SprintDbContext>? db) = New();
        string owner = await NewUser(db, "Ada");
        string stranger = await NewUser(db, "Grace");
        SharedLapSummary shared = await laps.ShareAsync(owner, Input());

        GraphQLException error = await Assert.ThrowsAsync<GraphQLException>(() => laps.RevokeAsync(stranger, shared.ShareCode));

        // Same message an unknown code gets: confirming it exists would confirm a code they
        // should not be holding.
        Assert.Equal("No lap exists for that code.", error.Message);
        await laps.FetchAsync(shared.ShareCode);
    }

    [Fact]
    public async Task A_revoked_lap_stays_listed_to_its_owner()
    {
        (LapShareService? laps, IDbContextFactory<SprintDbContext>? db) = New();
        string owner = await NewUser(db, "Ada");
        SharedLapSummary shared = await laps.ShareAsync(owner, Input());
        await laps.RevokeAsync(owner, shared.ShareCode);

        IReadOnlyList<SharedLapSummary> mine = await laps.ListMineAsync(owner);

        Assert.True(Assert.Single(mine).Revoked);
    }

    [Fact]
    public async Task You_only_see_your_own_shared_laps()
    {
        (LapShareService? laps, IDbContextFactory<SprintDbContext>? db) = New();
        string owner = await NewUser(db, "Ada");
        string other = await NewUser(db, "Grace");
        await laps.ShareAsync(owner, Input());

        Assert.Empty(await laps.ListMineAsync(other));
    }

    [Fact]
    public async Task A_lap_with_no_payload_is_rejected()
    {
        (LapShareService? laps, IDbContextFactory<SprintDbContext>? db) = New();
        string owner = await NewUser(db, "Ada");

        await Assert.ThrowsAsync<GraphQLException>(() =>
            laps.ShareAsync(owner, Input() with { PayloadBase64 = "" }));
    }

    [Fact]
    public async Task A_payload_that_is_not_base64_is_rejected_with_a_reason()
    {
        (LapShareService? laps, IDbContextFactory<SprintDbContext>? db) = New();
        string owner = await NewUser(db, "Ada");

        GraphQLException error = await Assert.ThrowsAsync<GraphQLException>(() =>
            laps.ShareAsync(owner, Input() with { PayloadBase64 = "not base64 !!" }));

        Assert.Contains("base64", error.Message, StringComparison.OrdinalIgnoreCase);
    }

    [Fact]
    public async Task A_lap_without_a_track_or_car_is_rejected()
    {
        (LapShareService? laps, IDbContextFactory<SprintDbContext>? db) = New();
        string owner = await NewUser(db, "Ada");

        await Assert.ThrowsAsync<GraphQLException>(() =>
            laps.ShareAsync(owner, Input() with { TrackCourse = "" }));
    }

    [Fact]
    public async Task Setting_a_display_name_round_trips_and_is_bounded()
    {
        IDbContextFactory<SprintDbContext> db = TestFactory.NewDb();
        JwtTokenService tokens = new JwtTokenService(JwtTokenService.KeyFromSecret("test-secret-long-enough-for-hs256-aaaaaa"));
        UserService users = new(db, new PasswordHasher(), tokens, new ServerSettingsService(db, DiscordOptions.Disabled));
        AuthResponse registered = await users.RegisterAsync(new AuthRequest { Email = "a@b.c", Password = "pw123456" });
        string id = tokens.ValidateAndGetUserId(registered.Token)!;

        UserProfile profile = await users.SetDisplayNameAsync(id, "  Ada Lovelace  ");

        Assert.Equal("Ada Lovelace", profile.DisplayName);
        Assert.Equal("Ada Lovelace", (await users.GetProfileAsync(id))!.DisplayName);
        await Assert.ThrowsAsync<GraphQLException>(() => users.SetDisplayNameAsync(id, "   "));
        await Assert.ThrowsAsync<GraphQLException>(() => users.SetDisplayNameAsync(id, new string('x', 41)));
    }

    private static (LapShareService Laps, IDbContextFactory<SprintDbContext> Db) New()
    {
        IDbContextFactory<SprintDbContext> db = TestFactory.NewDb();
        return (new LapShareService(db), db);
    }

    private static async Task<string> NewUser(IDbContextFactory<SprintDbContext> factory, string displayName)
    {
        await using SprintDbContext db = await factory.CreateDbContextAsync();
        string id = Ids.New();
        db.Users.Add(new UserEntity
        {
            Id = id,
            Email = $"{id}@sprint.gg",
            DisplayName = displayName,
            PasswordHash = "x",
            CreatedAt = DateTimeOffset.UtcNow,
        });
        await db.SaveChangesAsync();
        return id;
    }

    private static ShareLapInput Input() => new()
    {
        Game = "Le Mans Ultimate",
        TrackCourse = "Spa-Francorchamps",
        CarModel = "Porsche 963",
        LapNumber = 4,
        LapTimeSeconds = 101.5,
        DrivenAt = DateTimeOffset.UnixEpoch,
        PayloadBase64 = Convert.ToBase64String(Payload),
    };
}

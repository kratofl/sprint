using HotChocolate;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Diagnostics;
using Sprint.Api.Data;
using Sprint.Api.Live;
using Sprint.Api.Services;
using Sprint.Contracts;
using Xunit;

namespace Sprint.Api.Tests;

/// <summary>Invite links, driver–engineer links and per-session exclusions, through the service the GraphQL surface calls.</summary>
public class EngineerServiceTests
{
    private sealed record World(EngineerService Engineers, CatalogService Catalog, TestClock Clock, string Driver, string Engineer, string Stranger);

    private static async Task<World> NewWorld()
    {
        IDbContextFactory<SprintDbContext> db = TestFactory.NewDb();
        TestClock clock = new();
        EngineerService engineers = new(db, new PublicUrls(null, new Uri("https://sprint.example/")), new LiveHub(clock, TimeSpan.FromSeconds(30)), clock);
        return new World(engineers, new CatalogService(db), clock,
            await TestUsers.AddAsync(db, "Alex"), await TestUsers.AddAsync(db, "Sam"), await TestUsers.AddAsync(db, ""));
    }

    private static async Task<string> LinkAsync(World w)
    {
        EngineerInviteDto invite = await w.Engineers.CreateInviteAsync(w.Driver);
        await w.Engineers.AcceptInviteAsync(w.Engineer, invite.Token);
        return invite.Token;
    }

    private static Task<SessionSummary> SessionAsync(World w, string key) =>
        w.Catalog.SaveSessionAsync(w.Driver, new SaveSessionInput { SessionKey = key, Game = "Le Mans Ultimate", Track = "Spa", Car = "963" });

    [Fact]
    public async Task An_invite_is_a_web_link_that_names_the_driver()
    {
        World w = await NewWorld();

        EngineerInviteDto invite = await w.Engineers.CreateInviteAsync(w.Driver);
        EngineerInvitePreview preview = await w.Engineers.PreviewAsync(invite.Token);

        Assert.Equal($"https://sprint.example/engineer/invite/{invite.Token}", invite.Url);
        Assert.Equal(w.Clock.Now.AddDays(7), invite.ExpiresAt);
        Assert.Equal(EngineerInviteStatus.Valid, preview.Status);
        Assert.Equal("Alex", preview.Driver?.DisplayName);
    }

    [Fact]
    public async Task Accepting_links_both_sides_and_uses_the_invite_up()
    {
        World w = await NewWorld();
        string token = await LinkAsync(w);

        Assert.Equal("Sam", Assert.Single(await w.Engineers.EngineersOfAsync(w.Driver)).Engineer.DisplayName);
        Assert.Equal("Alex", Assert.Single(await w.Engineers.DriversOfAsync(w.Engineer)).Driver.DisplayName);
        Assert.Equal(EngineerInviteStatus.Used, (await w.Engineers.PreviewAsync(token)).Status);
        Assert.Empty(await w.Engineers.OpenInvitesAsync(w.Driver));
        GraphQLException second = await Assert.ThrowsAsync<GraphQLException>(() => w.Engineers.AcceptInviteAsync(w.Stranger, token));
        Assert.Contains("already used", second.Message);
    }

    [Theory]
    [InlineData(true)]
    [InlineData(false)]
    public async Task Two_accepts_of_one_invite_at_once_link_once_and_a_double_submit_succeeds(bool sameAccount)
    {
        SaveRace race = new();
        IDbContextFactory<SprintDbContext> db = TestFactory.NewDb(race);
        TestClock clock = new();
        EngineerService engineers = new(db, new PublicUrls(null, null), new LiveHub(clock, TimeSpan.FromSeconds(30)), clock);
        string driver = await TestUsers.AddAsync(db, "Alex");
        string engineer = await TestUsers.AddAsync(db, "Sam");
        string rival = sameAccount ? engineer : await TestUsers.AddAsync(db, "Kim");
        string token = (await engineers.CreateInviteAsync(driver)).Token;

        // The rival's accept lands between this accept's checks and its save, which then fails the
        // way Postgres fails it: the same link again is a unique violation (23505); the invite
        // already used by somebody else matches no row on its UsedAt token.
        race.First = () => engineers.AcceptInviteAsync(rival, token);
        race.Failure = sameAccount
            ? new DbUpdateException("23505: duplicate key value violates unique constraint \"PK_EngineerLinks\"")
            : new DbUpdateConcurrencyException("The invite was modified.");
        Task<EngineerLinkDto> accept = engineers.AcceptInviteAsync(engineer, token);

        if (sameAccount)
            Assert.Equal("Alex", (await accept).Driver.DisplayName);
        else
            Assert.Contains("already used", (await Assert.ThrowsAsync<GraphQLException>(() => accept)).Message);
        Assert.Equal(rival, Assert.Single(await engineers.EngineersOfAsync(driver)).Engineer.Id);
    }

    /// <summary>
    /// The first save that adds an engineer link runs <see cref="First"/> to completion, then fails
    /// with <see cref="Failure"/>. InMemory itself raises neither of Postgres's exceptions.
    /// </summary>
    private sealed class SaveRace : SaveChangesInterceptor
    {
        public Func<Task>? First { get; set; }
        public Exception? Failure { get; set; }

        public override async ValueTask<InterceptionResult<int>> SavingChangesAsync(
            DbContextEventData eventData, InterceptionResult<int> result, CancellationToken cancellationToken = default)
        {
            if (this.First is { } first && eventData.Context?.ChangeTracker.Entries<EngineerLinkEntity>().Any() == true)
            {
                this.First = null;
                await first();
                throw this.Failure ?? new InvalidOperationException("No failure to raise.");
            }

            return await base.SavingChangesAsync(eventData, result, cancellationToken);
        }
    }

    [Fact]
    public async Task An_invite_stops_working_after_seven_days()
    {
        World w = await NewWorld();
        EngineerInviteDto invite = await w.Engineers.CreateInviteAsync(w.Driver);

        w.Clock.Advance(TimeSpan.FromDays(7));

        Assert.Equal(EngineerInviteStatus.Expired, (await w.Engineers.PreviewAsync(invite.Token)).Status);
        GraphQLException error = await Assert.ThrowsAsync<GraphQLException>(() => w.Engineers.AcceptInviteAsync(w.Engineer, invite.Token));
        Assert.Contains("expired", error.Message);
    }

    [Fact]
    public async Task A_revoked_invite_cannot_be_accepted_and_leaves_the_open_list()
    {
        World w = await NewWorld();
        EngineerInviteDto invite = await w.Engineers.CreateInviteAsync(w.Driver);
        Assert.Single(await w.Engineers.OpenInvitesAsync(w.Driver));

        await w.Engineers.RevokeInviteAsync(w.Driver, invite.Token);

        Assert.Empty(await w.Engineers.OpenInvitesAsync(w.Driver));
        Assert.Equal(EngineerInviteStatus.Revoked, (await w.Engineers.PreviewAsync(invite.Token)).Status);
        await Assert.ThrowsAsync<GraphQLException>(() => w.Engineers.AcceptInviteAsync(w.Engineer, invite.Token));
    }

    [Fact]
    public async Task Only_its_driver_can_revoke_an_invite()
    {
        World w = await NewWorld();
        EngineerInviteDto invite = await w.Engineers.CreateInviteAsync(w.Driver);

        await Assert.ThrowsAsync<GraphQLException>(() => w.Engineers.RevokeInviteAsync(w.Engineer, invite.Token));
        Assert.Equal(EngineerInviteStatus.Valid, (await w.Engineers.PreviewAsync(invite.Token)).Status);
    }

    [Fact]
    public async Task A_driver_cannot_engineer_themselves_and_the_link_stays_usable()
    {
        World w = await NewWorld();
        EngineerInviteDto invite = await w.Engineers.CreateInviteAsync(w.Driver);

        await Assert.ThrowsAsync<GraphQLException>(() => w.Engineers.AcceptInviteAsync(w.Driver, invite.Token));

        Assert.Empty(await w.Engineers.EngineersOfAsync(w.Driver));
        Assert.Equal(EngineerInviteStatus.Valid, (await w.Engineers.PreviewAsync(invite.Token)).Status);
    }

    [Fact]
    public async Task An_unknown_token_previews_as_not_found()
    {
        World w = await NewWorld();

        EngineerInvitePreview preview = await w.Engineers.PreviewAsync("nope");

        Assert.Equal(EngineerInviteStatus.NotFound, preview.Status);
        Assert.Null(preview.Driver);
    }

    [Fact]
    public async Task An_engineer_sees_every_session_of_the_driver_and_strangers_see_none()
    {
        World w = await NewWorld();
        await SessionAsync(w, "s1");
        await SessionAsync(w, "s2");
        await LinkAsync(w);

        IReadOnlyList<VisibleSession> engineerView = await w.Engineers.VisibleSessionsAsync(w.Engineer);

        Assert.Equal(["s1", "s2"], engineerView.Select(s => s.SessionKey).Order());
        Assert.All(engineerView, s => Assert.False(s.IsMine));
        Assert.All(engineerView, s => Assert.Empty(s.EngineerAccess));
        Assert.Empty(await w.Engineers.VisibleSessionsAsync(w.Stranger));
    }

    [Fact]
    public async Task Excluding_hides_one_session_from_the_engineer_and_including_shows_it_again()
    {
        World w = await NewWorld();
        SessionSummary hidden = await SessionAsync(w, "s1");
        await SessionAsync(w, "s2");
        await LinkAsync(w);

        await w.Engineers.SetSessionAccessAsync(w.Driver, hidden.Id, w.Engineer, hasAccess: false);

        Assert.Equal(["s2"], (await w.Engineers.VisibleSessionsAsync(w.Engineer)).Select(s => s.SessionKey));
        Assert.Null(await w.Engineers.VisibleSessionAsync(w.Engineer, hidden.Id));
        VisibleSession mine = Assert.Single(await w.Engineers.VisibleSessionsAsync(w.Driver), s => s.Id == hidden.Id);
        Assert.False(Assert.Single(mine.EngineerAccess).HasAccess);

        await w.Engineers.SetSessionAccessAsync(w.Driver, hidden.Id, w.Engineer, hasAccess: true);

        Assert.Equal(2, (await w.Engineers.VisibleSessionsAsync(w.Engineer)).Count);
        Assert.NotNull(await w.Engineers.VisibleSessionAsync(w.Engineer, hidden.Id));
    }

    [Fact]
    public async Task Only_the_driver_can_exclude_and_only_their_own_engineers()
    {
        World w = await NewWorld();
        SessionSummary session = await SessionAsync(w, "s1");

        await Assert.ThrowsAsync<GraphQLException>(() => w.Engineers.SetSessionAccessAsync(w.Driver, session.Id, w.Stranger, hasAccess: false));
        await LinkAsync(w);
        await Assert.ThrowsAsync<GraphQLException>(() => w.Engineers.SetSessionAccessAsync(w.Engineer, session.Id, w.Engineer, hasAccess: false));
    }

    [Fact]
    public async Task Removing_an_engineer_or_leaving_a_driver_ends_all_access()
    {
        World w = await NewWorld();
        await SessionAsync(w, "s1");

        await LinkAsync(w);
        await w.Engineers.RemoveEngineerAsync(w.Driver, w.Engineer);
        Assert.Empty(await w.Engineers.VisibleSessionsAsync(w.Engineer));
        Assert.Empty(await w.Engineers.EngineersOfAsync(w.Driver));

        await LinkAsync(w);
        await w.Engineers.LeaveDriverAsync(w.Engineer, w.Driver);
        Assert.Empty(await w.Engineers.VisibleSessionsAsync(w.Engineer));
        Assert.Empty(await w.Engineers.DriversOfAsync(w.Engineer));
    }

    [Fact]
    public async Task A_driver_may_have_several_engineers_and_an_engineer_several_drivers()
    {
        World w = await NewWorld();
        await LinkAsync(w);
        await w.Engineers.AcceptInviteAsync(w.Stranger, (await w.Engineers.CreateInviteAsync(w.Driver)).Token);
        await w.Engineers.AcceptInviteAsync(w.Engineer, (await w.Engineers.CreateInviteAsync(w.Stranger)).Token);

        Assert.Equal(2, (await w.Engineers.EngineersOfAsync(w.Driver)).Count);
        Assert.Equal(2, (await w.Engineers.DriversOfAsync(w.Engineer)).Count);
        Assert.Contains(await w.Engineers.EngineersOfAsync(w.Driver), l => l.Engineer.DisplayName == "Sprint user");
    }
}

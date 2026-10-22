using Sprint.Api.Services;
using Sprint.Contracts;
using Xunit;

namespace Sprint.Api.Tests;

/// <summary>A synced session and its live stream join up through the desktop's session id.</summary>
public class SessionKeyTests
{
    private static readonly DateTimeOffset Now = new(2026, 10, 1, 18, 0, 0, TimeSpan.Zero);

    [Fact]
    public async Task The_upload_after_a_live_stream_fills_in_the_same_session()
    {
        CatalogService catalog = new(TestFactory.NewDb());
        SessionSummary live = await catalog.EnsureLiveSessionAsync("owner", new LiveStartMessage { SessionKey = "abc", Track = "Spa" }, Now);

        SessionSummary uploaded = await catalog.SaveSessionAsync("owner", new SaveSessionInput { SessionKey = "abc", Track = "Spa", Data = "{\"id\":\"abc\",\"laps\":[]}" });

        Assert.Equal(live.Id, uploaded.Id);
        Assert.Single(await catalog.ListSessionsAsync("owner"));
        Assert.Equal("{\"id\":\"abc\",\"laps\":[]}", uploaded.Data);
    }

    [Fact]
    public async Task An_upload_without_a_key_takes_it_from_the_payload_id()
    {
        CatalogService catalog = new(TestFactory.NewDb());

        SessionSummary uploaded = await catalog.SaveSessionAsync("owner", new SaveSessionInput { Data = "{\"id\":\"desktop-42\"}" });

        Assert.Equal("desktop-42", uploaded.SessionKey);
    }

    [Fact]
    public async Task A_session_with_no_desktop_id_is_keyed_by_its_own_id_and_keeps_it()
    {
        CatalogService catalog = new(TestFactory.NewDb());
        SessionSummary created = await catalog.SaveSessionAsync("owner", new SaveSessionInput { Data = "{}" });

        SessionSummary updated = await catalog.SaveSessionAsync("owner", new SaveSessionInput { Id = created.Id, SessionKey = "late", Data = "{}" });

        Assert.Equal(created.Id, created.SessionKey);
        Assert.Equal(created.Id, updated.SessionKey);
    }

    [Fact]
    public async Task The_same_key_under_two_owners_is_two_sessions()
    {
        CatalogService catalog = new(TestFactory.NewDb());

        SessionSummary a = await catalog.SaveSessionAsync("owner-a", new SaveSessionInput { SessionKey = "abc" });
        SessionSummary b = await catalog.SaveSessionAsync("owner-b", new SaveSessionInput { SessionKey = "abc" });

        Assert.NotEqual(a.Id, b.Id);
    }
}

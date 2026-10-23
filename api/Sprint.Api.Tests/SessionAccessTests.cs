using Sprint.Api.Services;
using Xunit;

namespace Sprint.Api.Tests;

/// <summary>The one access rule: the driver sees their own; a linked engineer sees the driver's unless excluded from that session.</summary>
public class SessionAccessTests
{
    private static ViewerGrants Engineer(params (string Driver, string Session)[] excluded) =>
        new("eng", new HashSet<string> { "driver-a" }, excluded.ToHashSet());

    [Fact]
    public void A_driver_sees_their_own_sessions_without_any_link()
    {
        ViewerGrants grants = new("driver-a", new HashSet<string>(), new HashSet<(string, string)>());

        Assert.True(grants.CanView("driver-a", "s1"));
    }

    [Fact]
    public void A_linked_engineer_sees_every_session_of_the_driver()
    {
        Assert.True(Engineer().CanView("driver-a", "s1"));
        Assert.True(Engineer().CanView("driver-a", "s2"));
    }

    [Fact]
    public void An_excluded_session_is_hidden_from_that_engineer_only_for_that_session()
    {
        ViewerGrants grants = Engineer(("driver-a", "s1"));

        Assert.False(grants.CanView("driver-a", "s1"));
        Assert.True(grants.CanView("driver-a", "s2"));
    }

    [Fact]
    public void Nobody_sees_a_driver_they_are_not_linked_to()
    {
        Assert.False(Engineer().CanView("driver-b", "s1"));
    }

    [Fact]
    public void An_exclusion_under_another_driver_does_not_hide_a_same_keyed_session()
    {
        ViewerGrants grants = new("eng", new HashSet<string> { "driver-a", "driver-b" }, new HashSet<(string, string)> { ("driver-b", "s1") });

        Assert.True(grants.CanView("driver-a", "s1"));
    }
}

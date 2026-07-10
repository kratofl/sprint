using Sprint.Desktop.Shell;
using Xunit;

namespace Sprint.Desktop.Tests;

public sealed class ShellCommandTests
{
    [Fact]
    public void SearchMatchesTitlesAndKeywordsCaseInsensitively()
    {
        var registry = new ShellCommandRegistry(
        [
            new ShellCommand("nav.dashes", "Go to Dashes", "dash layouts dashboard", "Alt+2", () => { }),
            new ShellCommand("dash.create", "Create dash", "new layout", null, () => { }),
        ]);

        Assert.Equal(["nav.dashes", "dash.create"], registry.Search("dash").Select(command => command.Id));
        Assert.Equal(["nav.dashes", "dash.create"], registry.Search("DASH").Select(command => command.Id));
    }

    [Fact]
    public void ExecuteRunsOnlyRegisteredCommands()
    {
        var executions = 0;
        var registry = new ShellCommandRegistry(
        [
            new ShellCommand("safe", "Safe action", "", null, () => executions++),
        ]);

        Assert.True(registry.Execute("safe"));
        Assert.False(registry.Execute("missing"));
        Assert.Equal(1, executions);
    }
}

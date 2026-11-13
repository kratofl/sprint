using System.Text.Json;
using System.Text.RegularExpressions;
using Sprint.Desktop.Core;
using Xunit;

namespace Sprint.Desktop.Host.Tests;

/// <summary>
/// Every command the desktop UI can send is one the host handles. A button whose command the
/// host does not know fails only when someone clicks it, so this reads the command names out of
/// the renderer and Electron sources and puts each through the real <see cref="RuntimeCoordinator"/>.
/// A command sent with nothing but its name may fail its own validation; that still proves it is
/// handled. Only "unknown command type" fails the test.
/// </summary>
public sealed partial class UiCommandCoverageTests
{
    // Commands are plain object literals at the call site (`send({ type: 'dash.create', ... })`),
    // and every command name has at least one dot.
    [GeneratedRegex("""type:\s*['"]([a-zA-Z]+(?:\.[a-zA-Z]+)+)['"]""")]
    private static partial Regex CommandType();

    [Fact]
    public void The_host_handles_every_command_the_ui_sends()
    {
        SortedSet<string> sent = CommandsSentByTheUi();
        // A scan that finds nothing (the sources moved) must not pass as "nothing unhandled".
        Assert.True(sent.Count > 20, $"Found only {sent.Count} command names in the desktop sources.");

        string dataRoot = Path.Combine(Path.GetTempPath(), "Sprint.Desktop.Host.Tests", Guid.NewGuid().ToString("N"));
        Directory.CreateDirectory(dataRoot);
        try
        {
            DesktopRuntime runtime = new(dataRoot, Path.Combine(RepoRoot, "app", "Sprint.Desktop.Host", "presets"));
            RuntimeCoordinator coordinator = new(runtime);
            List<string> unknown = [];
            foreach (string type in sent)
            {
                using JsonDocument command = JsonDocument.Parse(JsonSerializer.Serialize(new { type }));
                coordinator.Execute(command.RootElement, out string error);
                if (error.StartsWith("unknown command type", StringComparison.Ordinal))
                {
                    unknown.Add(type);
                }
            }

            Assert.True(unknown.Count == 0, $"The UI sends commands the host does not handle: {string.Join(", ", unknown)}");
        }
        finally
        {
            Directory.Delete(dataRoot, recursive: true);
        }
    }

    private static SortedSet<string> CommandsSentByTheUi()
    {
        SortedSet<string> types = new(StringComparer.Ordinal);
        string desktop = Path.Combine(RepoRoot, "app", "desktop");
        foreach (string folder in new[] { "src", "electron" })
        {
            foreach (string file in Directory.EnumerateFiles(Path.Combine(desktop, folder), "*.ts*", SearchOption.AllDirectories))
            {
                if (file.Contains(".test.", StringComparison.Ordinal))
                {
                    continue;
                }

                foreach (Match match in CommandType().Matches(File.ReadAllText(file)))
                {
                    types.Add(match.Groups[1].Value);
                }
            }
        }

        return types;
    }

    private static string RepoRoot
    {
        get
        {
            for (DirectoryInfo? dir = new(AppContext.BaseDirectory); dir is not null; dir = dir.Parent)
            {
                if (Directory.Exists(Path.Combine(dir.FullName, "app", "desktop", "src")))
                {
                    return dir.FullName;
                }
            }

            throw new DirectoryNotFoundException("Could not find the repository root containing app/desktop/src.");
        }
    }
}

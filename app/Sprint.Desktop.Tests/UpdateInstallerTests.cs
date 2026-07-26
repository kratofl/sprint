using Sprint.Desktop.Features.Updates;
using Xunit;

namespace Sprint.Desktop.Tests;

public sealed class UpdateInstallerTests
{
    [Fact]
    public void WritableInstallDirectoryPassesPreflightWithoutLeavingFiles()
    {
        var installDir = Path.Combine(Path.GetTempPath(), $"sprint-update-access-{Guid.NewGuid():N}");
        Directory.CreateDirectory(installDir);

        try
        {
            UpdateInstaller.EnsureInstallDirectoryWritable(installDir);
            Assert.Empty(Directory.EnumerateFileSystemEntries(installDir));
        }
        finally
        {
            Directory.Delete(installDir);
        }
    }

    [Fact]
    public void BlockedInstallPathFailsPreflightBeforeShutdown()
    {
        var root = Path.Combine(Path.GetTempPath(), $"sprint-update-access-{Guid.NewGuid():N}");
        Directory.CreateDirectory(root);
        var blockedPath = Path.Combine(root, "not-a-directory");
        File.WriteAllText(blockedPath, "");

        try
        {
            var error = Assert.Throws<InvalidOperationException>(
                () => UpdateInstaller.EnsureInstallDirectoryWritable(blockedPath));
            Assert.Contains("cannot replace files", error.Message, StringComparison.OrdinalIgnoreCase);
        }
        finally
        {
            Directory.Delete(root, recursive: true);
        }
    }
}

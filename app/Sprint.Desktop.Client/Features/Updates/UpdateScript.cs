using System.Text;

namespace Sprint.Desktop.Features.Updates;

/// <summary>
/// Builds the Windows helper batch that performs the self-replacing install. A
/// running single-file executable cannot overwrite itself, so the updater stages
/// the extracted new build in a temp folder, writes this batch, launches it
/// detached, and exits. The batch waits for the app process to exit, mirrors the
/// staged files over the install directory, relaunches the app, then deletes
/// itself. Kept as a pure string builder so the generated commands (pid wait,
/// robocopy, relaunch, self-delete) are unit-testable without touching disk.
/// </summary>
public static class UpdateScript
{
    /// <summary>
    /// Generates the helper-batch text that replaces <paramref name="installDir"/> with the
    /// contents of <paramref name="stagingDir"/> once process <paramref name="pid"/> exits,
    /// then relaunches <paramref name="exeName"/> from the install directory.
    /// </summary>
    public static string BuildWindowsBatch(int pid, string stagingDir, string installDir, string exeName)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(stagingDir);
        ArgumentException.ThrowIfNullOrWhiteSpace(installDir);
        ArgumentException.ThrowIfNullOrWhiteSpace(exeName);

        var sb = new StringBuilder();
        void Line(string text) => sb.Append(text).Append("\r\n");

        Line("@echo off");
        Line("setlocal");
        Line($"set \"PID={pid}\"");
        // Wait for the running app to exit so its files are no longer locked.
        Line(":waitloop");
        Line("tasklist /FI \"PID eq %PID%\" 2>nul | find \"%PID%\" >nul");
        Line("if not errorlevel 1 (");
        Line("  timeout /t 1 /nobreak >nul");
        Line("  goto waitloop");
        Line(")");
        // Copy the staged build over the install directory (retry on transient locks).
        Line($"robocopy \"{stagingDir}\" \"{installDir}\" /E /R:3 /W:2 >nul");
        // Relaunch the updated app, then remove this helper.
        Line($"start \"\" \"{installDir}\\{exeName}\"");
        Line("del \"%~f0\"");

        return sb.ToString();
    }
}

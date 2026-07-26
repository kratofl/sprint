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
    public static string BuildWindowsBatch(
        int pid,
        string stagingDir,
        string installDir,
        string exeName,
        string? completionPath = null)
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
        // Antivirus/image scanning can retain the closed executable's file lock for
        // several seconds after tasklist stops reporting the process. Keep retrying
        // transient copy failures long enough for that post-exit lock to clear.
        Line("if not exist \"%TEMP%\\Sprint\" mkdir \"%TEMP%\\Sprint\"");
        Line("set \"UPDATE_LOG=%TEMP%\\Sprint\\apply-update-%PID%.log\"");
        // Copy support files first and the primary executable last. If support-file
        // copying fails, the old executable is still intact and safe to relaunch.
        Line($"robocopy \"{stagingDir}\" \"{installDir}\" /E /XF \"{exeName}\" /R:30 /W:1 /IS /LOG:\"%UPDATE_LOG%\"");
        Line("if errorlevel 8 goto updatefailed");
        Line("set /a EXE_COPY_ATTEMPTS=0");
        Line(":copyexe");
        Line($"copy /Y \"{stagingDir}\\{exeName}\" \"{installDir}\\{exeName}\" >>\"%UPDATE_LOG%\" 2>&1");
        Line($"fc /B \"{stagingDir}\\{exeName}\" \"{installDir}\\{exeName}\" >nul 2>&1");
        Line("if not errorlevel 1 goto updatecopied");
        Line("set /a EXE_COPY_ATTEMPTS+=1");
        Line("if %EXE_COPY_ATTEMPTS% GEQ 30 goto updatefailed");
        Line("timeout /t 1 /nobreak >nul");
        Line("goto copyexe");
        Line(":updatecopied");
        // A non-elevated helper can relaunch directly. An elevated helper signals
        // the separate watcher that was started by the current user process, so the
        // updated app does not inherit an administrator token.
        if (completionPath is null)
        {
            Line($"start \"\" \"{installDir}\\{exeName}\"");
        }
        else
        {
            Line($"echo success>\"{completionPath}\"");
        }

        Line("del \"%UPDATE_LOG%\" >nul 2>&1");
        Line("goto cleanup");
        // A permanent permissions/copy failure must be visible. Preserve robocopy's
        // diagnostic log, reveal the staged executable for manual recovery, and only
        // then relaunch the still-working old build.
        Line(":updatefailed");
        Line($"start \"\" explorer.exe /select,\"{stagingDir}\\{exeName}\"");
        if (completionPath is null)
        {
            Line($"start \"\" \"{installDir}\\{exeName}\"");
        }
        else
        {
            Line($"echo failure>\"{completionPath}\"");
        }

        Line(":cleanup");
        Line("del \"%~f0\"");

        return sb.ToString();
    }

    /// <summary>
    /// Generates the non-elevated watcher used when the copy helper needs UAC. It
    /// waits for either success or failure to be signalled, relaunches Sprint with
    /// the original user's token, then removes the signal and itself.
    /// </summary>
    public static string BuildWindowsRelaunchBatch(
        string completionPath,
        string installDir,
        string exeName)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(completionPath);
        ArgumentException.ThrowIfNullOrWhiteSpace(installDir);
        ArgumentException.ThrowIfNullOrWhiteSpace(exeName);

        var sb = new StringBuilder();
        void Line(string text) => sb.Append(text).Append("\r\n");

        Line("@echo off");
        Line("setlocal");
        Line($"set \"RESULT={completionPath}\"");
        Line(":waitloop");
        Line("if exist \"%RESULT%\" goto relaunch");
        Line("timeout /t 1 /nobreak >nul");
        Line("goto waitloop");
        Line(":relaunch");
        Line($"start \"\" \"{installDir}\\{exeName}\"");
        Line("del \"%RESULT%\" >nul 2>&1");
        Line("del \"%~f0\"");

        return sb.ToString();
    }
}

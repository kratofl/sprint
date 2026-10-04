using System.Diagnostics.CodeAnalysis;

namespace Sprint.Desktop.Features.Updates;

/// <summary>
/// The process/install location a one-click self-replace must target. In the Electron/.NET
/// host split the running host process lives under <c>resources/host/</c> -- not the app
/// install directory -- so it cannot derive these from its own <see cref="Environment.ProcessPath"/>
/// the way the deleted Avalonia client did. Only the Electron main process (the host's parent,
/// and the process that must exit for the batch to swap the install) knows its own pid, install
/// directory, and executable name, so it supplies them explicitly on the install request.
/// </summary>
public sealed record UpdateInstallTarget(int Pid, string InstallDir, string ExeName);

/// <summary>
/// Strict boundary validation for an <see cref="UpdateInstallTarget"/>. A valid target makes the
/// host overwrite <c>InstallDir</c> and launch a batch file there, so every field is treated as
/// hostile input rather than trusted caller data.
/// </summary>
public static class UpdateInstallTargetValidator
{
    /// <summary>
    /// Validates the raw, caller-supplied fields. Returns false with a human-readable
    /// <paramref name="error"/> describing the first rule violated; <paramref name="target"/> is
    /// only set when every rule passes.
    /// </summary>
    public static bool TryValidate(
        int pid,
        string? installDir,
        string? exeName,
        [NotNullWhen(true)] out UpdateInstallTarget? target,
        [NotNullWhen(false)] out string? error)
    {
        if (pid <= 0)
        {
            return Reject(out target, out error, "pid must be a positive integer.");
        }

        if (string.IsNullOrWhiteSpace(installDir))
        {
            return Reject(out target, out error, "installDir is required.");
        }

        if (!Path.IsPathRooted(installDir))
        {
            return Reject(out target, out error, "installDir must be an absolute path.");
        }

        if (!Directory.Exists(installDir))
        {
            return Reject(out target, out error, "installDir does not exist.");
        }

        if (string.IsNullOrWhiteSpace(exeName))
        {
            return Reject(out target, out error, "exeName is required.");
        }

        if (exeName.Contains('/') || exeName.Contains('\\') || exeName.Contains(".."))
        {
            return Reject(out target, out error, "exeName must be a bare file name.");
        }

        if (!exeName.EndsWith(".exe", StringComparison.OrdinalIgnoreCase))
        {
            return Reject(out target, out error, "exeName must end in .exe.");
        }

        if (!File.Exists(Path.Combine(installDir, exeName)))
        {
            return Reject(out target, out error, "exeName was not found inside installDir.");
        }

        target = new UpdateInstallTarget(pid, installDir, exeName);
        error = null;
        return true;
    }

    private static bool Reject(
        [NotNullWhen(true)] out UpdateInstallTarget? target,
        [NotNullWhen(false)] out string? error,
        string message)
    {
        target = null;
        error = message;
        return false;
    }
}

/// <summary>The outcome of one <c>POST /api/updates/install</c> attempt.</summary>
public enum UpdateInstallOutcome
{
    /// <summary>The update was downloaded, staged, and the self-replace helper was launched.</summary>
    Staged,

    /// <summary>No release newer than the running build is visible on the configured channel.</summary>
    NoUpdate,

    /// <summary>The request was valid but the install itself could not complete.</summary>
    Failed,
}

/// <summary>
/// Result returned to the caller (the Electron main process) so it knows whether to quit and let
/// the staged batch proceed, or to surface a failure. <see cref="Version"/> is the release
/// involved (staged or attempted); <see cref="Reason"/> is set only for <see cref="UpdateInstallOutcome.Failed"/>.
/// </summary>
public sealed record UpdateInstallResult(UpdateInstallOutcome Outcome, string? Version = null, string? Reason = null);

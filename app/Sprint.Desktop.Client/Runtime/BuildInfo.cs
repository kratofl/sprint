using System.Reflection;

namespace Sprint.Desktop.Runtime;

/// <summary>
/// Version + build-channel reporting for the desktop app (matrix 4.9 US38, the
/// .NET analogue of the Go <c>GetVersion</c>/<c>GetBuildChannel</c>). The version
/// comes from the assembly's informational version (set via
/// <c>-p:InformationalVersion</c> in <c>make build-app</c>, else the
/// <c>Directory.Build.props</c> <c>Version</c>); the channel is the user's
/// update-channel setting.
/// </summary>
public static class BuildInfo
{
    /// <summary>The build version string, e.g. "0.1.0" or a CI-stamped "1.2.3+sha".</summary>
    public static string Version { get; } = ResolveVersion();

    public static string DisplayChannel(string updateChannel) =>
        string.IsNullOrWhiteSpace(updateChannel) ? "stable" : updateChannel.Trim().ToLowerInvariant();

    private static string ResolveVersion()
    {
        var assembly = typeof(BuildInfo).Assembly;
        var informational = assembly.GetCustomAttribute<AssemblyInformationalVersionAttribute>()?.InformationalVersion;
        if (!string.IsNullOrWhiteSpace(informational))
        {
            // Strip the "+<sourceRevisionId>" suffix the SDK appends when SourceLink is on.
            var plus = informational.IndexOf('+');
            return plus > 0 ? informational[..plus] : informational;
        }

        return assembly.GetName().Version?.ToString(3) ?? "0.0.0";
    }
}

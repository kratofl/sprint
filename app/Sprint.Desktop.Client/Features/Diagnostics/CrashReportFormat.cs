using System.Runtime.InteropServices;
using System.Text;

namespace Sprint.Desktop.Features.Diagnostics;

/// <summary>
/// Pure rendering of a crash report: a human-readable header with the app and
/// environment context a bug report needs, followed by the full exception dump.
/// Side-effect free so the layout can be asserted in tests.
/// </summary>
public static class CrashReportFormat
{
    public static string Build(DateTimeOffset timestamp, string appVersion, string source, Exception exception)
    {
        var builder = new StringBuilder();
        builder.AppendLine("Sprint Desktop crash report");
        builder.AppendLine("===========================");
        builder.Append("Time (UTC): ").AppendLine(timestamp.ToUniversalTime().ToString("yyyy-MM-ddTHH:mm:ss.fffZ"));
        builder.Append("App version: ").AppendLine(appVersion);
        builder.Append("Source: ").AppendLine(source);
        builder.Append("OS: ").AppendLine(RuntimeInformation.OSDescription.Trim());
        builder.Append("Architecture: ").AppendLine(RuntimeInformation.OSArchitecture.ToString());
        builder.Append(".NET: ").AppendLine(RuntimeInformation.FrameworkDescription.Trim());
        builder.Append("Exception type: ").AppendLine(exception.GetType().FullName);
        builder.AppendLine();
        builder.AppendLine("Exception detail");
        builder.AppendLine("----------------");
        builder.AppendLine(exception.ToString());
        return builder.ToString();
    }
}

using System.Text;

namespace Sprint.Desktop.Features.Diagnostics;

/// <summary>
/// Pure formatting of a log record into a single self-contained text block.
/// Kept side-effect free so line layout is unit-testable without touching disk.
/// </summary>
public static class LogFormat
{
    private static readonly string[] LevelTags = ["DEBUG", "INFO ", "WARN ", "ERROR", "FATAL"];

    /// <summary>
    /// Renders one record as <c>2026-07-13T09:41:02.123Z [LEVEL] message</c>,
    /// with the exception (if any) appended on indented continuation lines so a
    /// multi-line stack trace still belongs unambiguously to its record.
    /// </summary>
    public static string Line(DateTimeOffset timestamp, LogLevel level, string message, Exception? exception)
    {
        var builder = new StringBuilder();
        builder.Append(timestamp.ToUniversalTime().ToString("yyyy-MM-ddTHH:mm:ss.fffZ"));
        builder.Append(" [").Append(Tag(level)).Append("] ");
        builder.Append(Collapse(message));

        if (exception is not null)
        {
            foreach (var raw in exception.ToString().Split('\n'))
            {
                builder.Append('\n').Append("    ").Append(raw.TrimEnd('\r'));
            }
        }

        return builder.ToString();
    }

    private static string Tag(LogLevel level)
    {
        var index = (int)level;
        return index >= 0 && index < LevelTags.Length ? LevelTags[index] : level.ToString().ToUpperInvariant();
    }

    // Keep the timestamp/level prefix meaningful: a record's own message stays on
    // one line; embedded newlines would masquerade as separate records on read-back.
    private static string Collapse(string message) =>
        string.IsNullOrEmpty(message) ? string.Empty : message.Replace("\r\n", " ").Replace('\n', ' ').Replace('\r', ' ');
}

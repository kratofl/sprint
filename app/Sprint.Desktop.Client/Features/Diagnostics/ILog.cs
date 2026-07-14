namespace Sprint.Desktop.Features.Diagnostics;

/// <summary>
/// Minimal structured log sink for the desktop app. Kept deliberately small so a
/// file sink, a no-op, or a test double are all trivial to provide, and so no
/// third-party logging dependency is pulled into the single-file publish.
/// </summary>
public interface ILog
{
    /// <summary>Write one record. Implementations must be safe to call from any thread.</summary>
    void Write(LogLevel level, string message, Exception? exception = null);
}

/// <summary>Convenience level shortcuts over <see cref="ILog.Write"/>.</summary>
public static class LogExtensions
{
    public static void Debug(this ILog log, string message) => log.Write(LogLevel.Debug, message);

    public static void Info(this ILog log, string message) => log.Write(LogLevel.Info, message);

    public static void Warn(this ILog log, string message, Exception? exception = null) =>
        log.Write(LogLevel.Warn, message, exception);

    public static void Error(this ILog log, string message, Exception? exception = null) =>
        log.Write(LogLevel.Error, message, exception);
}

/// <summary>
/// Discards every record. The safe default before diagnostics are installed and
/// the injectable default for callers (e.g. tests) that do not care about logs.
/// </summary>
public sealed class NullLog : ILog
{
    public static readonly NullLog Instance = new();

    private NullLog()
    {
    }

    public void Write(LogLevel level, string message, Exception? exception = null)
    {
    }
}

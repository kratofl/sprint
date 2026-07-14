namespace Sprint.Desktop.Features.Diagnostics;

/// <summary>
/// Severity of a diagnostic log record, ordered from most verbose to most
/// severe. A logger drops records below its configured minimum level.
/// </summary>
public enum LogLevel
{
    Debug = 0,
    Info = 1,
    Warn = 2,
    Error = 3,
    Fatal = 4,
}

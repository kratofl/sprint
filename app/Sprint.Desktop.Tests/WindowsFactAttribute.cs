using Xunit;

namespace Sprint.Desktop.Tests;

/// <summary>
/// A <see cref="FactAttribute"/> for tests that exercise a real Windows API (a raw-input
/// message loop, a cmd.exe batch). Off Windows the test is reported as skipped with that
/// reason, rather than returning early and counting as a pass.
/// </summary>
public sealed class WindowsFactAttribute : FactAttribute
{
    public WindowsFactAttribute()
    {
        if (!OperatingSystem.IsWindows())
        {
            base.Skip = "Exercises a Windows-only API; runs on Windows only.";
        }
    }
}

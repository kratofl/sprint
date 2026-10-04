using System.Diagnostics;

namespace Sprint.Desktop.Runtime;

/// <summary>
/// The gate for everything Sprint does <em>outside its own process</em>: opening USB screens,
/// and asking the OS to show a folder.
/// <para>
/// It exists because a test run is not a user session. Tests exercise hardware publishers
/// against saved screen devices — on a developer's machine that is a wheel screen physically
/// attached to the desk, and an ungated suite would drive it. The update paths could likewise
/// pop file-manager windows onto the desktop. Neither is something an assertion can justify.
/// </para>
/// <para>
/// Enabled by default, so the shipped app behaves normally; the test assembly disables it once
/// from a module initializer, which means a test added later inherits the protection instead of
/// having to remember to inject a fake.
/// </para>
/// </summary>
public static class HostEffects
{
    /// <summary>Whether this process may touch hardware and the shell. False under test.</summary>
    public static bool Enabled { get; private set; } = true;

    /// <summary>
    /// Disables every out-of-process effect for the lifetime of the process. Deliberately
    /// one-way: a test that could switch it back on could also switch it on by accident.
    /// </summary>
    public static void DisableForTestRun() => Enabled = false;

    /// <summary>
    /// Asks the OS to show <paramref name="path"/>, returning whether it did. Callers show
    /// their own fallback when it does not, so a disabled gate reads the same as a shell that
    /// refused.
    /// </summary>
    public static bool TryRevealInFileManager(string path)
    {
        if (!Enabled || string.IsNullOrWhiteSpace(path))
        {
            return false;
        }

        try
        {
            Process.Start(new ProcessStartInfo { FileName = path, UseShellExecute = true });
            return true;
        }
        catch (Exception ex) when (ex is System.ComponentModel.Win32Exception or InvalidOperationException)
        {
            return false;
        }
    }
}

using System.Runtime.CompilerServices;
using Sprint.Desktop.Runtime;

namespace Sprint.Desktop.Tests;

/// <summary>
/// Shuts off every out-of-process effect for the whole test run, once, before any test body
/// executes.
/// <para>
/// A module initializer rather than a fixture on purpose: tests exercise hardware publishers
/// against saved screen devices, so an ungated suite would drive the wheel screen physically
/// attached to the developer's machine — and the update paths could pop file-manager windows.
/// Making it the assembly's default means a test added later inherits the protection instead
/// of having to remember a fake.
/// </para>
/// </summary>
internal static class TestHostEffects
{
    [ModuleInitializer]
    internal static void DisableHostEffects() => HostEffects.DisableForTestRun();
}

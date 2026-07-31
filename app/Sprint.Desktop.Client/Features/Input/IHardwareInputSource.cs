namespace Sprint.Desktop.Features.Input;

using Sprint.Desktop.Features.Diagnostics;

/// <summary>
/// Emits normalized rising-edge inputs from steering wheels, button boxes, and
/// other HID game controllers. Implementations may raise events from a worker
/// thread; consumers are responsible for marshalling UI work.
/// </summary>
internal interface IHardwareInputSource : IDisposable
{
    event EventHandler<HardwareInputEvent>? InputPressed;

    bool IsAvailable { get; }
}

internal sealed record HardwareInputEvent(ushort Vid, ushort Pid, string Input);

internal static class HardwareInputSourceFactory
{
    public static IHardwareInputSource Create(ILog log) =>
        OperatingSystem.IsWindows()
            ? new WindowsRawInputSource(log)
            : NullHardwareInputSource.Instance;
}

internal sealed class NullHardwareInputSource : IHardwareInputSource
{
    public static NullHardwareInputSource Instance { get; } = new();

    private NullHardwareInputSource()
    {
    }

    public event EventHandler<HardwareInputEvent>? InputPressed
    {
        add { }
        remove { }
    }

    public bool IsAvailable => false;

    public void Dispose()
    {
    }
}

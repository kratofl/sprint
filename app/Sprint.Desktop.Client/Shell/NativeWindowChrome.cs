using System.Runtime.InteropServices;
using Avalonia.Controls;

namespace Sprint.Desktop.Shell;

internal static class NativeWindowChrome
{
    // Used only before Windows has created an HWND. DWM replaces it with the
    // measured caption-button bounds as soon as the window opens.
    internal const double StartupCaptionInset = 144;
    private const double CaptionBreathingRoom = 8;
    private const int DwmCaptionButtonBounds = 5;

    public static double CaptionButtonInset(Window window)
    {
        if (!OperatingSystem.IsWindows())
        {
            return 0;
        }

        var handle = window.TryGetPlatformHandle();
        if (handle is null || !string.Equals(handle.HandleDescriptor, "HWND", StringComparison.OrdinalIgnoreCase))
        {
            return StartupCaptionInset;
        }

        var result = DwmGetWindowAttribute(
            handle.Handle,
            DwmCaptionButtonBounds,
            out var bounds,
            Marshal.SizeOf<NativeRect>());
        if (result != 0 || bounds.Right <= bounds.Left)
        {
            return StartupCaptionInset;
        }

        var physicalWidth = bounds.Right - bounds.Left;
        return Math.Ceiling(physicalWidth / window.DesktopScaling) + CaptionBreathingRoom;
    }

    [DllImport("dwmapi.dll")]
    private static extern int DwmGetWindowAttribute(
        IntPtr window,
        int attribute,
        out NativeRect value,
        int valueSize);

    [StructLayout(LayoutKind.Sequential)]
    private struct NativeRect
    {
        public int Left;
        public int Top;
        public int Right;
        public int Bottom;
    }
}

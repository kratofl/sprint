using System.Runtime.InteropServices;
using System.Runtime.Versioning;

namespace Sprint.Desktop.Features.LiveCompare;

/// <summary>
/// The two Win32 facts the Live Compare HUD rests on: making a window click-through, and
/// knowing when a game has taken the screen in a way no topmost window can share.
/// <para>
/// Callers must guard every use with <see cref="OperatingSystem.IsWindows"/>, the same
/// convention <c>WinUsbInterop</c> and <c>WindowsRawInputSource</c> already follow. Every entry
/// point here answers safely on other platforms rather than throwing, so the HUD degrades to
/// "always interactive, never warns" instead of failing to open.
/// </para>
/// </summary>
internal static class HudInterop
{
    private const int GwlExStyle = -20;

    /// <summary>Mouse input passes through to whatever is underneath.</summary>
    private const int WsExTransparent = 0x00000020;

    /// <summary>Clicking the window does not focus it — the game keeps the keyboard mid-corner.</summary>
    private const int WsExNoActivate = 0x08000000;

    /// <summary>
    /// A D3D application is running in exclusive fullscreen.
    /// <para>
    /// This is the state that matters, and it is why the check is not "does the foreground
    /// window fill the monitor". Borderless fullscreen also fills the monitor, and the HUD
    /// works perfectly over it — a rect comparison would fire a warning on the exact
    /// configuration the feature supports.
    /// </para>
    /// </summary>
    private const int QunsRunningD3dFullScreen = 3;

    /// <summary>
    /// Turns click-through on or off. Returns whether the style was actually applied, so a
    /// caller can say "locked, but the click-through could not be set" rather than claim a
    /// protection the driver does not have.
    /// </summary>
    public static bool SetClickThrough(IntPtr handle, bool enabled)
    {
        if (!OperatingSystem.IsWindows() || handle == IntPtr.Zero)
        {
            return false;
        }

        try
        {
            var current = GetExStyle(handle);
            var updated = enabled
                ? current | WsExTransparent | WsExNoActivate
                : current & ~WsExTransparent & ~WsExNoActivate;

            return current == updated || SetExStyle(handle, updated);
        }
        catch (Exception ex) when (ex is EntryPointNotFoundException or DllNotFoundException)
        {
            return false;
        }
    }

    /// <summary>
    /// Whether a game currently holds the screen in exclusive fullscreen, where a topmost
    /// window is simply not composited. Reported to the driver rather than worked around: a
    /// HUD that silently shows nothing is the worst outcome (spec §2.3).
    /// </summary>
    public static bool IsExclusiveFullscreenActive()
    {
        if (!OperatingSystem.IsWindows())
        {
            return false;
        }

        try
        {
            return QueryUserNotificationState(out var state) == 0
                && state == QunsRunningD3dFullScreen;
        }
        catch (Exception ex) when (ex is EntryPointNotFoundException or DllNotFoundException)
        {
            // Without the answer, claiming fullscreen would put a warning on screen for a
            // driver whose HUD is working fine.
            return false;
        }
    }

    // 32-bit Windows exports GetWindowLongW, 64-bit exports GetWindowLongPtrW; the "Ptr" form
    // is a macro on 32-bit, not an export, so importing only it would fail on the x86 host this
    // repo can build against.
    [SupportedOSPlatform("windows")]
    private static int GetExStyle(IntPtr handle) => IntPtr.Size == 8
        ? (int)GetWindowLongPtrW(handle, GwlExStyle).ToInt64()
        : GetWindowLongW(handle, GwlExStyle);

    [SupportedOSPlatform("windows")]
    private static bool SetExStyle(IntPtr handle, int style)
    {
        Marshal.SetLastSystemError(0);
        var previous = IntPtr.Size == 8
            ? (int)SetWindowLongPtrW(handle, GwlExStyle, new IntPtr(style)).ToInt64()
            : SetWindowLongW(handle, GwlExStyle, style);

        // Zero is a legitimate previous style, so success is only distinguishable from failure
        // through the last error — the documented pattern for this call.
        return previous != 0 || Marshal.GetLastSystemError() == 0;
    }

    [DllImport("user32.dll", EntryPoint = "GetWindowLongW", SetLastError = true)]
    private static extern int GetWindowLongW(IntPtr hWnd, int nIndex);

    [DllImport("user32.dll", EntryPoint = "SetWindowLongW", SetLastError = true)]
    private static extern int SetWindowLongW(IntPtr hWnd, int nIndex, int dwNewLong);

    [DllImport("user32.dll", EntryPoint = "GetWindowLongPtrW", SetLastError = true)]
    private static extern IntPtr GetWindowLongPtrW(IntPtr hWnd, int nIndex);

    [DllImport("user32.dll", EntryPoint = "SetWindowLongPtrW", SetLastError = true)]
    private static extern IntPtr SetWindowLongPtrW(IntPtr hWnd, int nIndex, IntPtr dwNewLong);

    [DllImport("shell32.dll", EntryPoint = "SHQueryUserNotificationState")]
    private static extern int QueryUserNotificationState(out int state);
}

using System.Runtime.InteropServices;

namespace Sprint.Desktop.Features.LiveCompare;

/// <summary>
/// The one Win32 fact the training HUD needs that Electron cannot tell it: whether a game has
/// taken the screen in a way no topmost window can share. Click-through and never taking focus
/// are Electron's (<c>app/desktop/electron/hud.ts</c>).
/// <para>
/// Answers safely on other platforms rather than throwing, so the HUD degrades to "never warns"
/// instead of failing to open.
/// </para>
/// </summary>
public static class HudInterop
{
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
            return QueryUserNotificationState(out int state) == 0
                && state == QunsRunningD3dFullScreen;
        }
        catch (Exception ex) when (ex is EntryPointNotFoundException or DllNotFoundException)
        {
            // Without the answer, claiming fullscreen would put a warning on screen for a
            // driver whose HUD is working fine.
            return false;
        }
    }

    [DllImport("shell32.dll", EntryPoint = "SHQueryUserNotificationState")]
    private static extern int QueryUserNotificationState(out int state);
}

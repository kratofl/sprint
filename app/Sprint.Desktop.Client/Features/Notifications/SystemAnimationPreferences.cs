using System.Runtime.InteropServices;

namespace Sprint.Desktop.Features.Notifications;

/// <summary>Reads the Windows client-area animation accessibility preference.</summary>
internal static class SystemAnimationPreferences
{
    private const uint SpiGetClientAreaAnimation = 0x1042;

    public static bool ClientAreaAnimationsEnabled
    {
        get
        {
            if (!OperatingSystem.IsWindows())
            {
                return true;
            }

            return SystemParametersInfo(
                SpiGetClientAreaAnimation,
                0,
                out var enabled,
                0)
                ? enabled
                : true;
        }
    }

    [DllImport("user32.dll", EntryPoint = "SystemParametersInfoW", SetLastError = true)]
    [return: MarshalAs(UnmanagedType.Bool)]
    private static extern bool SystemParametersInfo(
        uint action,
        uint parameter,
        [MarshalAs(UnmanagedType.Bool)] out bool value,
        uint update);
}

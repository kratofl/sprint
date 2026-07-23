using System.Runtime.InteropServices;
using System.Runtime.Versioning;

namespace Sprint.Desktop.Features.Hardware;

/// <summary>
/// Minimal P/Invoke surface for talking to a WinUSB-bound screen (SetupAPI device
/// enumeration + WinUSB bulk/control transfers). Ported from the Go
/// <c>hardware/vocore_usb.go</c> / <c>usbd480_usb.go</c> native path.
///
/// <para><b>Hardware-verification pending (Open Question #3).</b> These signatures
/// compile and follow the documented WinUSB/SetupAPI contract, but the runtime
/// path cannot be exercised in CI without a physical VoCore/USBD480 attached.
/// Callers must guard every use with <see cref="OperatingSystem.IsWindows"/> and
/// treat all failures as recoverable status, never crashes (US33).</para>
/// </summary>
[SupportedOSPlatform("windows")]
internal static class WinUsbInterop
{
    private const int DigcfPresent = 0x02;
    private const int DigcfDeviceInterface = 0x10;
    private const uint GenericRead = 0x80000000;
    private const uint GenericWrite = 0x40000000;
    private const uint OpenExisting = 3;
    private const uint FileFlagOverlapped = 0x40000000;
    private static readonly nint InvalidHandle = -1;

    [StructLayout(LayoutKind.Sequential)]
    private struct Guid16
    {
        public uint Data1;
        public ushort Data2;
        public ushort Data3;
        [MarshalAs(UnmanagedType.ByValArray, SizeConst = 8)]
        public byte[] Data4;
    }

    [StructLayout(LayoutKind.Sequential)]
    private struct SpDeviceInterfaceData
    {
        public int CbSize;
        public Guid InterfaceClassGuid;
        public int Flags;
        public nint Reserved;
    }

    [DllImport("setupapi.dll", SetLastError = true, CharSet = CharSet.Unicode)]
    private static extern nint SetupDiGetClassDevs(ref Guid classGuid, nint enumerator, nint hwndParent, int flags);

    [DllImport("setupapi.dll", SetLastError = true)]
    private static extern bool SetupDiEnumDeviceInterfaces(nint deviceInfoSet, nint deviceInfoData, ref Guid interfaceClassGuid, int memberIndex, ref SpDeviceInterfaceData deviceInterfaceData);

    [DllImport("setupapi.dll", SetLastError = true, CharSet = CharSet.Unicode)]
    private static extern bool SetupDiGetDeviceInterfaceDetail(nint deviceInfoSet, ref SpDeviceInterfaceData deviceInterfaceData, nint detailData, int detailDataSize, out int requiredSize, nint deviceInfoData);

    [DllImport("setupapi.dll", SetLastError = true)]
    private static extern bool SetupDiDestroyDeviceInfoList(nint deviceInfoSet);

    [DllImport("kernel32.dll", SetLastError = true, CharSet = CharSet.Unicode)]
    private static extern nint CreateFile(string fileName, uint desiredAccess, uint shareMode, nint securityAttributes, uint creationDisposition, uint flagsAndAttributes, nint templateFile);

    [DllImport("kernel32.dll", SetLastError = true)]
    internal static extern bool CloseHandle(nint handle);

    [DllImport("kernel32.dll", SetLastError = true)]
    internal static extern nint CreateEvent(
        nint eventAttributes,
        bool manualReset,
        bool initialState,
        string? name);

    [DllImport("kernel32.dll", SetLastError = true)]
    internal static extern uint WaitForSingleObject(nint handle, uint milliseconds);

    [DllImport("kernel32.dll", SetLastError = true)]
    internal static extern bool CancelIoEx(nint handle, nint overlapped);

    [DllImport("winusb.dll", SetLastError = true)]
    internal static extern bool WinUsb_Initialize(nint deviceHandle, out nint interfaceHandle);

    [DllImport("winusb.dll", SetLastError = true)]
    internal static extern bool WinUsb_Free(nint interfaceHandle);

    [DllImport("winusb.dll", SetLastError = true)]
    internal static extern bool WinUsb_WritePipe(nint interfaceHandle, byte pipeId, byte[] buffer, int bufferLength, out int transferred, nint overlapped);

    [DllImport("winusb.dll", SetLastError = true)]
    internal static extern bool WinUsb_ResetPipe(nint interfaceHandle, byte pipeId);

    [DllImport("winusb.dll", SetLastError = true)]
    internal static extern bool WinUsb_SetPowerPolicy(nint interfaceHandle, uint policyType, uint valueLength, byte[] value);

    [StructLayout(LayoutKind.Sequential, Pack = 1)]
    internal struct WinUsbSetupPacket
    {
        public byte RequestType;
        public byte Request;
        public ushort Value;
        public ushort Index;
        public ushort Length;
    }

    [DllImport("winusb.dll", SetLastError = true)]
    internal static extern bool WinUsb_ControlTransfer(nint interfaceHandle, WinUsbSetupPacket setupPacket, byte[]? buffer, int bufferLength, out int transferred, nint overlapped);

    [DllImport("winusb.dll", SetLastError = true)]
    internal static extern bool WinUsb_GetOverlappedResult(
        nint interfaceHandle,
        nint overlapped,
        out int transferred,
        bool wait);

    [StructLayout(LayoutKind.Sequential)]
    internal struct NativeOverlapped
    {
        public nint Internal;
        public nint InternalHigh;
        public uint Offset;
        public uint OffsetHigh;
        public nint EventHandle;
    }

    /// <summary>
    /// Finds the device path for the first interface under <paramref name="interfaceGuid"/>
    /// whose path contains the given VID/PID. Returns null when no match is present.
    /// </summary>
    internal static string? FindDevicePath(Guid interfaceGuid, ushort vid, ushort pid)
    {
        var set = SetupDiGetClassDevs(ref interfaceGuid, nint.Zero, nint.Zero, DigcfPresent | DigcfDeviceInterface);
        if (set == InvalidHandle)
        {
            return null;
        }

        try
        {
            string? interfaceFallback = null;
            for (var index = 0; ; index++)
            {
                var data = new SpDeviceInterfaceData { CbSize = Marshal.SizeOf<SpDeviceInterfaceData>() };
                if (!SetupDiEnumDeviceInterfaces(set, nint.Zero, ref interfaceGuid, index, ref data))
                {
                    return interfaceFallback; // ERROR_NO_MORE_ITEMS
                }

                SetupDiGetDeviceInterfaceDetail(set, ref data, nint.Zero, 0, out var required, nint.Zero);
                if (required <= 0)
                {
                    continue;
                }

                var detail = Marshal.AllocHGlobal(required);
                try
                {
                    // SP_DEVICE_INTERFACE_DETAIL_DATA_W.cbSize is 8 on 64-bit, 6 on 32-bit.
                    Marshal.WriteInt32(detail, nint.Size == 8 ? 8 : 6);
                    if (!SetupDiGetDeviceInterfaceDetail(set, ref data, detail, required, out _, nint.Zero))
                    {
                        continue;
                    }

                    var path = Marshal.PtrToStringUni(detail + 4);
                    if (path is null || !new ScreenUsbIdentity(vid, pid).MatchesDevicePath(path))
                    {
                        continue;
                    }

                    if (!path.Contains("&mi_", StringComparison.OrdinalIgnoreCase))
                    {
                        return path;
                    }

                    interfaceFallback ??= path;
                }
                finally
                {
                    Marshal.FreeHGlobal(detail);
                }
            }
        }
        finally
        {
            SetupDiDestroyDeviceInfoList(set);
        }
    }

    /// <summary>Opens a WinUSB interface handle for the device at <paramref name="devicePath"/>, or null on failure.</summary>
    internal static (nint File, nint Winusb)? Open(
        string devicePath,
        out ScreenOpenFailureStage failureStage,
        out int nativeError)
    {
        failureStage = ScreenOpenFailureStage.None;
        nativeError = 0;
        var file = CreateFile(
            devicePath,
            GenericRead | GenericWrite,
            // WinUSB does not support two applications driving the same interface.
            // Denying all sharing makes an
            // existing SimHub/Ref owner fail fast with ERROR_SHARING_VIOLATION
            // instead of hanging later in ResetPipe or a frame transfer.
            0,
            nint.Zero,
            OpenExisting,
            FileFlagOverlapped,
            nint.Zero);
        if (file == InvalidHandle)
        {
            failureStage = ScreenOpenFailureStage.CreateFile;
            nativeError = Marshal.GetLastWin32Error();
            return null;
        }

        if (!WinUsb_Initialize(file, out var winusb))
        {
            failureStage = ScreenOpenFailureStage.WinUsbInitialize;
            nativeError = Marshal.GetLastWin32Error();
            CloseHandle(file);
            return null;
        }

        return (file, winusb);
    }
}

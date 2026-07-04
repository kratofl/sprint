using System.Runtime.Versioning;

namespace Sprint.Desktop.Features.Hardware;

/// <summary>
/// A thin WinUSB transport over <see cref="WinUsbInterop"/>: enumerate → open →
/// bulk-write / control-out → free. Shared by the VoCore and USBD480 drivers.
/// <b>Runtime-unverified pending hardware (Open Question #3).</b>
/// </summary>
[SupportedOSPlatform("windows")]
internal sealed class WinUsbScreenTransport : IDisposable
{
    private nint _file;
    private nint _winusb;

    private WinUsbScreenTransport(nint file, nint winusb)
    {
        _file = file;
        _winusb = winusb;
    }

    /// <summary>Opens the first WinUSB device matching <paramref name="interfaceGuid"/> + VID/PID, or null if unavailable.</summary>
    public static WinUsbScreenTransport? TryOpen(Guid interfaceGuid, ushort vid, ushort pid)
    {
        var path = WinUsbInterop.FindDevicePath(interfaceGuid, vid, pid);
        if (path is null)
        {
            return null;
        }

        var handles = WinUsbInterop.Open(path);
        return handles is { } h ? new WinUsbScreenTransport(h.File, h.Winusb) : null;
    }

    public bool BulkWrite(byte endpoint, byte[] data) =>
        WinUsbInterop.WinUsb_WritePipe(_winusb, endpoint, data, data.Length, out _, nint.Zero);

    public bool ControlOut(byte requestType, byte request, ushort value, ushort index, byte[]? data)
    {
        var packet = new WinUsbInterop.WinUsbSetupPacket
        {
            RequestType = requestType,
            Request = request,
            Value = value,
            Index = index,
            Length = (ushort)(data?.Length ?? 0),
        };
        return WinUsbInterop.WinUsb_ControlTransfer(_winusb, packet, data, data?.Length ?? 0, out _, nint.Zero);
    }

    public void Dispose()
    {
        if (_winusb != nint.Zero)
        {
            WinUsbInterop.WinUsb_Free(_winusb);
            _winusb = nint.Zero;
        }

        if (_file != nint.Zero && _file != -1)
        {
            WinUsbInterop.CloseHandle(_file);
            _file = nint.Zero;
        }
    }
}

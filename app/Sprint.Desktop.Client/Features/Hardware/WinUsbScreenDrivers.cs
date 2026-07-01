using System.Runtime.Versioning;

namespace Sprint.Desktop.Features.Hardware;

/// <summary>
/// Base for the Windows WinUSB screen drivers. Handles the <see cref="IScreenDriver"/>
/// lifecycle + never-throw status mapping; concrete drivers supply the device
/// interface GUID, connect init sequence, and per-frame write.
///
/// <para><b>Runtime-unverified (Open Question #3):</b> the WinUSB transfer sequence
/// is a faithful port of the Go native path but cannot be exercised in CI without a
/// physical screen. Every native failure is caught and surfaced as
/// <see cref="ScreenStatus"/> so a missing driver / absent device never crashes the
/// app — it shows PermissionDenied/Disconnected in the Devices UI (US33).</para>
/// </summary>
[SupportedOSPlatform("windows")]
internal abstract class WinUsbScreenDriverBase : IScreenDriver
{
    private ScreenConfig _config = new();
    private ScreenStatus _status = ScreenStatus.Disconnected();
    private WinUsbScreenTransport? _transport;

    public abstract string Name { get; }

    protected abstract Guid InterfaceGuid { get; }

    public ScreenStatus Status => _status;

    public void Configure(ScreenConfig config) => _config = config;

    public bool Connect()
    {
        if (!OperatingSystem.IsWindows())
        {
            _status = new ScreenStatus { State = ScreenConnectionState.Unsupported, Detail = "WinUSB screens are Windows-only." };
            return false;
        }

        try
        {
            _status = new ScreenStatus { State = ScreenConnectionState.Connecting };
            var transport = WinUsbScreenTransport.TryOpen(InterfaceGuid, _config.Vid, _config.Pid);
            if (transport is null)
            {
                _status = new ScreenStatus
                {
                    State = ScreenConnectionState.PermissionDenied,
                    Detail = $"Screen VID={_config.Vid:X4} PID={_config.Pid:X4} not found or WinUSB driver not bound (install via Zadig).",
                };
                return false;
            }

            _transport = transport;
            Initialize(transport, _config);
            _status = new ScreenStatus { State = ScreenConnectionState.Connected };
            return true;
        }
        catch (Exception ex)
        {
            _status = new ScreenStatus { State = ScreenConnectionState.Faulted, Detail = ex.Message };
            DisposeTransport();
            return false;
        }
    }

    public bool TrySendFrame(ReadOnlySpan<byte> rgb565)
    {
        if (_transport is null || !_status.IsConnected)
        {
            return false;
        }

        try
        {
            return WriteFrame(_transport, rgb565.ToArray());
        }
        catch (Exception ex)
        {
            _status = new ScreenStatus { State = ScreenConnectionState.Faulted, Detail = ex.Message };
            DisposeTransport();
            return false;
        }
    }

    public void Disconnect()
    {
        DisposeTransport();
        _status = ScreenStatus.Disconnected();
    }

    public void Dispose() => Disconnect();

    protected abstract void Initialize(WinUsbScreenTransport transport, ScreenConfig config);

    protected abstract bool WriteFrame(WinUsbScreenTransport transport, byte[] rgb565);

    private void DisposeTransport()
    {
        _transport?.Dispose();
        _transport = null;
    }
}

/// <summary>VoCore M-PRO WinUSB driver (bulk endpoint 0x02, ILI-style memory-write). Runtime-unverified.</summary>
[SupportedOSPlatform("windows")]
internal sealed class VoCoreScreenDriver : WinUsbScreenDriverBase
{
    private const byte BulkEndpoint = 0x02;

    public override string Name => "VoCore Screen";

    // GUID_DEVINTERFACE_USB_DEVICE (VoCore binds generic WinUSB).
    protected override Guid InterfaceGuid { get; } =
        new(0xA5DCBF10, 0x6530, 0x11D2, 0x90, 0x1F, 0x00, 0xC0, 0x4F, 0xB9, 0x51, 0xED);

    protected override void Initialize(WinUsbScreenTransport transport, ScreenConfig config)
    {
        // Wake the panel (cmd_quit_sleep 0x29) then restore full backlight (0x51).
        transport.BulkWrite(BulkEndpoint, [0x00, 0x29, 0x00, 0x00, 0x00, 0x00]);
        transport.BulkWrite(BulkEndpoint, [0x00, 0x51, 0x02, 0x00, 0x00, 0x00, 0xFF, 0x00]);
    }

    protected override bool WriteFrame(WinUsbScreenTransport transport, byte[] rgb565)
    {
        // RGB565 mode (0x00) + Memory Write (0x2C) command header, then pixel data.
        byte[] header = [0x00, 0x2C, 0x00, 0x00, 0x00, 0x00];
        return transport.BulkWrite(BulkEndpoint, header) && transport.BulkWrite(BulkEndpoint, rgb565);
    }
}

/// <summary>USBD480 NX WinUSB driver (control SET_ADDRESS then bulk pixel write). Runtime-unverified.</summary>
[SupportedOSPlatform("windows")]
internal sealed class Usbd480ScreenDriver : WinUsbScreenDriverBase
{
    private const byte BulkEndpoint = 0x02;
    private const byte ReqTypeOut = 0x40;
    private const byte ReqSetAddress = 0xC0;
    private const byte ReqBrightness = 0x81;

    public override string Name => "USBD480 Screen";

    protected override Guid InterfaceGuid { get; } =
        new(0xDEE824EF, 0x729B, 0x4A0E, 0x9C, 0x14, 0xB7, 0x11, 0x7D, 0x33, 0xA8, 0x17);

    protected override void Initialize(WinUsbScreenTransport transport, ScreenConfig config)
    {
        // Full brightness (wValue = level, no data payload).
        transport.ControlOut(ReqTypeOut, ReqBrightness, value: 255, index: 0, data: null);
    }

    protected override bool WriteFrame(WinUsbScreenTransport transport, byte[] rgb565)
    {
        // Set framebuffer write address to 0, then bulk-write the RGB565 frame.
        return transport.ControlOut(ReqTypeOut, ReqSetAddress, value: 0, index: 0, data: null)
            && transport.BulkWrite(BulkEndpoint, rgb565);
    }
}

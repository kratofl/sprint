using System.Runtime.Versioning;
using Sprint.Desktop.Features.Diagnostics;

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
    private readonly ILog _log;
    private ScreenConfig _config = new();
    private ScreenStatus _status = ScreenStatus.Disconnected();
    private ScreenNativeSize? _nativeSize;
    private WinUsbScreenTransport? _transport;

    protected WinUsbScreenDriverBase(ILog? log = null)
    {
        _log = log ?? NullLog.Instance;
    }

    public abstract string Name { get; }

    protected abstract Guid InterfaceGuid { get; }

    public ScreenStatus Status => _status;

    public ScreenNativeSize? NativeSize => _nativeSize;

    protected ILog Log => _log;

    public void Configure(ScreenConfig config)
    {
        _config = config;
        _nativeSize = new ScreenNativeSize(config.Width, config.Height);
    }

    public bool Connect()
    {
        var identity = ScreenUsbIdentity.ForDriver(_config.Driver, _config.Vid, _config.Pid);
        if (identity.Vid == 0)
        {
            _status = new ScreenStatus
            {
                State = ScreenConnectionState.ConfigurationRequired,
                Detail = "The saved screen has no USB vendor identity and its driver cannot infer one.",
            };
            _log.Warn($"{Name} connection blocked: USB vendor identity is not configured.");
            return false;
        }

        if (!OperatingSystem.IsWindows())
        {
            _status = new ScreenStatus { State = ScreenConnectionState.Unsupported, Detail = "WinUSB screens are Windows-only." };
            return false;
        }

        try
        {
            _status = new ScreenStatus { State = ScreenConnectionState.Connecting };
            var pid = identity.Pid == 0 ? "any" : $"0x{identity.Pid:X4}";
            _log.Debug(
                $"{Name} enumeration started: configured=0x{_config.Vid:X4}:0x{_config.Pid:X4} " +
                $"search=0x{identity.Vid:X4}:{pid}.");
            var transport = WinUsbScreenTransport.TryOpen(
                InterfaceGuid,
                identity.Vid,
                identity.Pid,
                _log,
                out var failureStatus);
            if (transport is null)
            {
                _status = failureStatus;
                _log.Warn($"{Name} open failed: {_status.Detail}");
                return false;
            }

            _transport = transport;
            Initialize(transport, _config);
            _status = new ScreenStatus { State = ScreenConnectionState.Connected };
            _log.Info($"{Name} connected: search=0x{identity.Vid:X4}:{pid}.");
            return true;
        }
        catch (Exception ex)
        {
            _status = new ScreenStatus { State = ScreenConnectionState.Faulted, Detail = ex.Message };
            _log.Error($"{Name} connection failed.", ex);
            DisposeTransport();
            return false;
        }
    }

    public bool TrySendFrame(byte[] rgb565)
    {
        if (_transport is null || !_status.IsConnected)
        {
            return false;
        }

        try
        {
            if (WriteFrame(_transport, rgb565))
            {
                return true;
            }

            _status = new ScreenStatus
            {
                State = ScreenConnectionState.Faulted,
                Detail = _transport.LastFailure ?? "The screen rejected the frame transfer.",
            };
            _log.Warn($"{Name} frame transfer failed: {_status.Detail}");
            DisposeTransport();
            return false;
        }
        catch (Exception ex)
        {
            _status = new ScreenStatus { State = ScreenConnectionState.Faulted, Detail = ex.Message };
            _log.Error($"{Name} frame transfer threw.", ex);
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

    protected void SetNativeSize(int width, int height)
    {
        var size = new ScreenNativeSize(width, height);
        if (!size.IsValid
            || width > 4096
            || height > 4096
            || (long)width * height * 2 > 0xFFFFFF)
        {
            throw new ArgumentOutOfRangeException(
                nameof(width),
                $"Native screen size {width}x{height} is outside the supported RGB565 range.");
        }

        _nativeSize = size;
    }

    protected virtual void Shutdown(WinUsbScreenTransport transport)
    {
    }

    protected static void Require(bool succeeded, WinUsbScreenTransport transport, string operation)
    {
        if (!succeeded)
        {
            throw new InvalidOperationException(
                $"{operation}: {transport.LastFailure ?? "native WinUSB operation failed"}");
        }
    }

    private void DisposeTransport()
    {
        if (_transport is { } transport)
        {
            try
            {
                Shutdown(transport);
            }
            catch (Exception ex)
            {
                _log.Warn($"{Name} shutdown transfer failed.", ex);
            }

            transport.Dispose();
        }

        _transport = null;
    }
}

/// <summary>VoCore M-PRO WinUSB driver (bulk endpoint 0x02, ILI-style memory-write). Runtime-unverified.</summary>
[SupportedOSPlatform("windows")]
internal sealed class VoCoreScreenDriver : WinUsbScreenDriverBase
{
    private bool _loggedFirstWrite;

    public override string Name => "VoCore Screen";

    public VoCoreScreenDriver(ILog? log = null)
        : base(log)
    {
    }

    // GUID_DEVINTERFACE_USB_DEVICE (VoCore binds generic WinUSB).
    protected override Guid InterfaceGuid { get; } =
        new(0xA5DCBF10, 0x6530, 0x11D2, 0x90, 0x1F, 0x00, 0xC0, 0x4F, 0xB9, 0x51, 0xED);

    protected override void Initialize(WinUsbScreenTransport transport, ScreenConfig config)
    {
        var native = VoCoreProtocol.NativeDimensionsForPid(
            transport.MatchedPid,
            config.Width,
            config.Height);
        SetNativeSize(native.Width, native.Height);
        Log.Info(
            $"VoCore dimensions resolved without blocking firmware query: " +
            $"pid=0x{transport.MatchedPid:X4} native={native.Width}x{native.Height} " +
            $"configured={config.Width}x{config.Height}.");

        Log.Debug(
            "VoCore initialization complete; firmware idle is already awake, " +
            "so the first USB command is the actual draw request.");
    }

    protected override bool WriteFrame(WinUsbScreenTransport transport, byte[] rgb565)
    {
        var drawCommand = VoCoreProtocol.BuildDrawCommand(rgb565.Length);
        if (!_loggedFirstWrite)
        {
            _loggedFirstWrite = true;
            Log.Debug(
                $"VoCore first frame transfer starting: control=0xB0 " +
                $"drawBytes={drawCommand.Length} bulkBytes={rgb565.Length} endpoint=0x02.");
        }

        return transport.ControlOut(
                VoCoreProtocol.RequestTypeOut,
                VoCoreProtocol.VendorRequest,
                value: 0,
                index: 0,
                drawCommand)
            && transport.BulkWrite(VoCoreProtocol.BulkEndpoint, rgb565);
    }

    protected override void Shutdown(WinUsbScreenTransport transport)
    {
        // Closing the handle returns the display to firmware ownership. Avoid a
        // separate brightness control transfer here: firmware variants that do
        // not acknowledge that command can otherwise stall application shutdown.
    }

}

/// <summary>USBD480 NX WinUSB driver (control SET_ADDRESS then bulk pixel write). Runtime-unverified.</summary>
[SupportedOSPlatform("windows")]
internal sealed class Usbd480ScreenDriver : WinUsbScreenDriverBase
{
    private const byte BulkEndpoint = 0x02;
    private const byte ReqTypeOut = 0x40;
    private const byte ReqSetAddress = 0xC0;
    private const byte ReqSetFrameStartAddress = 0xC4;
    private const byte ReqBrightness = 0x81;
    private const byte ReqTypeIn = 0xC0;
    private const byte ReqGetDetails = 0x80;

    public override string Name => "USBD480 Screen";

    public Usbd480ScreenDriver(ILog? log = null)
        : base(log)
    {
    }

    protected override Guid InterfaceGuid { get; } =
        new(0xDEE824EF, 0x729B, 0x4A0E, 0x9C, 0x14, 0xB7, 0x11, 0x7D, 0x33, 0xA8, 0x17);

    protected override void Initialize(WinUsbScreenTransport transport, ScreenConfig config)
    {
        Log.Debug("USBD480 initialization: disabling WinUSB AUTO_SUSPEND.");
        Require(transport.DisableAutoSuspend(), transport, "USBD480 wake");

        Log.Debug("USBD480 initialization: querying device details with request 0x80.");
        var details = new byte[64];
        if (transport.ControlIn(ReqTypeIn, ReqGetDetails, details, out var transferred)
            && transferred >= 24)
        {
            var width = details[20] | details[21] << 8;
            var height = details[22] | details[23] << 8;
            SetNativeSize(width, height);
            var nameLength = Array.IndexOf(details, (byte)0, 0, 20);
            if (nameLength < 0)
            {
                nameLength = 20;
            }

            var name = System.Text.Encoding.ASCII.GetString(details, 0, nameLength);
            Log.Info(
                $"USBD480 identified: name={name} native={width}x{height} " +
                $"configured={config.Width}x{config.Height}.");
        }
        else
        {
            Log.Warn(
                $"USBD480 details query failed; using configured dimensions " +
                $"{config.Width}x{config.Height}. {transport.LastFailure}");
        }

        Log.Debug("USBD480 initialization: restoring brightness with request 0x81.");
        Require(
            transport.ControlOut(ReqTypeOut, ReqBrightness, value: 255, index: 0, data: null),
            transport,
            "USBD480 brightness restore");
    }

    protected override bool WriteFrame(WinUsbScreenTransport transport, byte[] rgb565)
    {
        // Set framebuffer write address to 0, then bulk-write the RGB565 frame.
        return transport.ControlOut(ReqTypeOut, ReqSetAddress, value: 0, index: 0, data: null)
            && transport.BulkWrite(BulkEndpoint, rgb565)
            && transport.ControlOut(
                ReqTypeOut,
                ReqSetFrameStartAddress,
                value: 0,
                index: 0,
                data: null);
    }

    protected override void Shutdown(WinUsbScreenTransport transport)
    {
        transport.ControlOut(ReqTypeOut, ReqBrightness, value: 0, index: 0, data: null);
    }
}

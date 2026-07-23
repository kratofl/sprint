using System.Runtime.Versioning;
using System.Runtime.InteropServices;
using System.Globalization;
using Sprint.Desktop.Features.Diagnostics;

namespace Sprint.Desktop.Features.Hardware;

/// <summary>
/// A thin WinUSB transport over <see cref="WinUsbInterop"/>: enumerate → open →
/// bulk-write / control-out → free. Shared by the VoCore and USBD480 drivers.
/// <b>Runtime-unverified pending hardware (Open Question #3).</b>
/// </summary>
[SupportedOSPlatform("windows")]
internal sealed class WinUsbScreenTransport : IDisposable
{
    private const uint AutoSuspendPolicy = 0x81;
    private const int ErrorIoPending = 997;
    private const uint WaitObject0 = 0;
    private const uint WaitTimeout = 258;
    private const uint ControlTransferTimeoutMs = 2_000;
    private const uint CancelDrainTimeoutMs = 1_000;
    private const uint CloseDrainTimeoutMs = 5_000;
    private static readonly object AbandonedTransfersLock = new();
    private static readonly List<ControlTransferResources> AbandonedTransfers = [];
    private readonly List<ControlTransferResources> _pendingControlTransfers = [];
    private nint _file;
    private nint _winusb;

    private WinUsbScreenTransport(nint file, nint winusb, ushort matchedPid)
    {
        _file = file;
        _winusb = winusb;
        MatchedPid = matchedPid;
    }

    public ushort MatchedPid { get; }

    /// <summary>Opens the first WinUSB device matching <paramref name="interfaceGuid"/> + VID/PID, or null if unavailable.</summary>
    public static WinUsbScreenTransport? TryOpen(
        Guid interfaceGuid,
        ushort vid,
        ushort pid,
        ILog log,
        out ScreenStatus failureStatus)
    {
        failureStatus = ScreenStatus.Disconnected();
        var path = WinUsbInterop.FindDevicePath(interfaceGuid, vid, pid);
        if (path is null)
        {
            var pidLabel = pid == 0 ? "any" : $"0x{pid:X4}";
            failureStatus = ScreenStatus.Disconnected(
                $"No USB interface matched VID=0x{vid:X4} PID={pidLabel}.");
            log.Warn($"Screen enumeration found no match: vid=0x{vid:X4} pid={pidLabel}.");
            return null;
        }

        var matchedPid = pid == 0 ? "any" : $"0x{pid:X4}";
        log.Debug($"Screen USB interface found: vid=0x{vid:X4} pid={matchedPid} path={path}.");
        log.Debug($"Screen CreateFile starting: path={path}.");
        var handles = WinUsbInterop.Open(path, out var stage, out var nativeError);
        if (handles is { } h)
        {
            log.Debug($"Screen WinUsb_Initialize completed: path={path}.");
            return new WinUsbScreenTransport(
                h.File,
                h.Winusb,
                ReadPid(path) ?? pid);
        }

        failureStatus = ScreenOpenFailureStatus.Describe(stage, nativeError, vid, pid);
        log.Warn(
            $"Screen USB open failed: vid=0x{vid:X4} pid={matchedPid} " +
            $"stage={stage} win32={nativeError} state={failureStatus.State}.");
        return null;
    }

    public string? LastFailure { get; private set; }

    public bool BulkWrite(byte endpoint, byte[] data)
    {
        var succeeded = WinUsbInterop.WinUsb_WritePipe(
            _winusb,
            endpoint,
            data,
            data.Length,
            out var transferred,
            nint.Zero);
        return RecordTransferResult(
            succeeded && transferred == data.Length,
            $"bulk OUT 0x{endpoint:X2}",
            transferred,
            data.Length);
    }

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
        var expected = data?.Length ?? 0;
        // Some composite WinUSB drivers reject a null buffer even for wLength=0.
        var buffer = data ?? [0x00];
        return ControlTransfer(
            packet,
            buffer,
            expected,
            $"control OUT 0x{request:X2}",
            requireExactLength: true,
            out _);
    }

    public bool ControlIn(byte requestType, byte request, byte[] data, out int transferred)
    {
        var packet = new WinUsbInterop.WinUsbSetupPacket
        {
            RequestType = requestType,
            Request = request,
            Value = 0,
            Index = 0,
            Length = (ushort)data.Length,
        };
        return ControlTransfer(
            packet,
            data,
            data.Length,
            $"control IN 0x{request:X2}",
            requireExactLength: false,
            out transferred);
    }

    public bool ResetPipe(byte endpoint)
    {
        var succeeded = WinUsbInterop.WinUsb_ResetPipe(_winusb, endpoint);
        return RecordResult(succeeded, $"reset pipe 0x{endpoint:X2}");
    }

    public bool DisableAutoSuspend()
    {
        var succeeded = WinUsbInterop.WinUsb_SetPowerPolicy(
            _winusb,
            AutoSuspendPolicy,
            valueLength: 1,
            [0x00]);
        return RecordResult(succeeded, "disable AUTO_SUSPEND");
    }

    public void Dispose()
    {
        CancelAndDrainPendingTransfers(CancelDrainTimeoutMs);

        if (_pendingControlTransfers.Count > 0 && IsValidFileHandle(_file))
        {
            WinUsbInterop.CloseHandle(_file);
            _file = nint.Zero;
            DrainPendingTransfers(CloseDrainTimeoutMs);
        }

        if (_pendingControlTransfers.Count > 0)
        {
            // Windows still has references to these OVERLAPPED structures and
            // pinned buffers. Retaining them until process exit is preferable
            // to freeing memory that a delayed kernel completion may touch.
            lock (AbandonedTransfersLock)
            {
                AbandonedTransfers.AddRange(_pendingControlTransfers);
            }

            LastFailure =
                $"{LastFailure} Native control-transfer resources were retained " +
                "because cancellation did not complete before the device closed.";
            _pendingControlTransfers.Clear();
            _winusb = nint.Zero;
            return;
        }

        if (_winusb != nint.Zero)
        {
            WinUsbInterop.WinUsb_Free(_winusb);
            _winusb = nint.Zero;
        }

        if (IsValidFileHandle(_file))
        {
            WinUsbInterop.CloseHandle(_file);
            _file = nint.Zero;
        }
    }

    private bool RecordTransferResult(
        bool succeeded,
        string operation,
        int transferred,
        int expected,
        bool requireExactLength = true)
    {
        if (succeeded && (!requireExactLength || transferred == expected))
        {
            LastFailure = null;
            return true;
        }

        var nativeError = Marshal.GetLastWin32Error();
        LastFailure =
            $"{operation} failed with Win32 error {nativeError}; " +
            $"transferred {transferred} of {expected} bytes.";
        return false;
    }

    private bool RecordResult(bool succeeded, string operation)
    {
        if (succeeded)
        {
            LastFailure = null;
            return true;
        }

        LastFailure = $"{operation} failed with Win32 error {Marshal.GetLastWin32Error()}.";
        return false;
    }

    private bool ControlTransfer(
        WinUsbInterop.WinUsbSetupPacket packet,
        byte[] buffer,
        int bufferLength,
        string operation,
        bool requireExactLength,
        out int transferred)
    {
        transferred = 0;
        var eventHandle = WinUsbInterop.CreateEvent(
            nint.Zero,
            manualReset: true,
            initialState: false,
            name: null);
        if (eventHandle == nint.Zero)
        {
            LastFailure =
                $"{operation} could not create an overlapped event " +
                $"(Win32 error {Marshal.GetLastWin32Error()}).";
            return false;
        }

        var resources = new ControlTransferResources(eventHandle, buffer);
        var releaseResources = true;
        try
        {
            Marshal.StructureToPtr(
                new WinUsbInterop.NativeOverlapped { EventHandle = eventHandle },
                resources.OverlappedPointer,
                fDeleteOld: false);

            var started = WinUsbInterop.WinUsb_ControlTransfer(
                _winusb,
                packet,
                buffer,
                bufferLength,
                out _,
                resources.OverlappedPointer);
            var nativeError = started ? 0 : Marshal.GetLastWin32Error();
            if (!started && nativeError != ErrorIoPending)
            {
                LastFailure = $"{operation} failed with Win32 error {nativeError}.";
                return false;
            }

            if (!started)
            {
                var wait = WinUsbInterop.WaitForSingleObject(eventHandle, ControlTransferTimeoutMs);
                if (wait == WaitTimeout)
                {
                    releaseResources = CancelAndDrain(resources);
                    LastFailure =
                        $"{operation} timed out after {ControlTransferTimeoutMs} ms. " +
                        "Another screen-output process may still own or block the USB interface.";
                    return false;
                }

                if (wait != WaitObject0)
                {
                    var waitError = Marshal.GetLastWin32Error();
                    releaseResources = CancelAndDrain(resources);
                    LastFailure =
                        $"{operation} wait failed with Win32 error {waitError}.";
                    return false;
                }
            }

            var completed = WinUsbInterop.WinUsb_GetOverlappedResult(
                _winusb,
                resources.OverlappedPointer,
                out transferred,
                wait: false);
            return RecordTransferResult(
                completed && (!requireExactLength || transferred == bufferLength),
                operation,
                transferred,
                bufferLength,
                requireExactLength);
        }
        finally
        {
            if (releaseResources)
            {
                resources.Release();
            }
        }
    }

    private bool CancelAndDrain(ControlTransferResources resources)
    {
        if (IsValidFileHandle(_file))
        {
            WinUsbInterop.CancelIoEx(_file, resources.OverlappedPointer);
        }

        if (WinUsbInterop.WaitForSingleObject(resources.EventHandle, CancelDrainTimeoutMs) == WaitObject0)
        {
            return true;
        }

        _pendingControlTransfers.Add(resources);
        return false;
    }

    private void CancelAndDrainPendingTransfers(uint timeoutMs)
    {
        if (IsValidFileHandle(_file))
        {
            foreach (var resources in _pendingControlTransfers)
            {
                WinUsbInterop.CancelIoEx(_file, resources.OverlappedPointer);
            }
        }

        DrainPendingTransfers(timeoutMs);
    }

    private void DrainPendingTransfers(uint timeoutMs)
    {
        foreach (var resources in _pendingControlTransfers.ToArray())
        {
            if (WinUsbInterop.WaitForSingleObject(resources.EventHandle, timeoutMs) != WaitObject0)
            {
                continue;
            }

            resources.Release();
            _pendingControlTransfers.Remove(resources);
        }
    }

    private static bool IsValidFileHandle(nint handle) =>
        handle != nint.Zero && handle != -1;

    private static ushort? ReadPid(string path)
    {
        const string marker = "pid_";
        var start = path.IndexOf(marker, StringComparison.OrdinalIgnoreCase);
        if (start < 0 || start + marker.Length + 4 > path.Length)
        {
            return null;
        }

        return ushort.TryParse(
            path.AsSpan(start + marker.Length, 4),
            NumberStyles.HexNumber,
            CultureInfo.InvariantCulture,
            out var pid)
            ? pid
            : null;
    }

    private sealed class ControlTransferResources
    {
        private GCHandle _pinnedBuffer;
        private bool _released;

        public ControlTransferResources(nint eventHandle, byte[] buffer)
        {
            EventHandle = eventHandle;
            try
            {
                OverlappedPointer =
                    Marshal.AllocHGlobal(Marshal.SizeOf<WinUsbInterop.NativeOverlapped>());
                _pinnedBuffer = GCHandle.Alloc(buffer, GCHandleType.Pinned);
            }
            catch
            {
                if (OverlappedPointer != nint.Zero)
                {
                    Marshal.FreeHGlobal(OverlappedPointer);
                }

                WinUsbInterop.CloseHandle(EventHandle);
                throw;
            }
        }

        public nint EventHandle { get; }

        public nint OverlappedPointer { get; }

        public void Release()
        {
            if (_released)
            {
                return;
            }

            _released = true;
            if (_pinnedBuffer.IsAllocated)
            {
                _pinnedBuffer.Free();
            }

            Marshal.FreeHGlobal(OverlappedPointer);
            WinUsbInterop.CloseHandle(EventHandle);
        }
    }
}

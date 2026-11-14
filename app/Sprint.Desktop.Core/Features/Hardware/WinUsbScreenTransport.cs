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
    private const uint PipeTransferTimeoutPolicy = 0x03;

    // A full 800x480 frame takes about 30 ms; a write still pending after this is a stuck panel.
    private const uint BulkTransferTimeoutMs = 1_000;
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

    private WinUsbScreenTransport(nint file, nint winusb, ushort matchedPid, string devicePath)
    {
        this._file = file;
        this._winusb = winusb;
        this.MatchedPid = matchedPid;
        this.DevicePath = devicePath;
    }

    public ushort MatchedPid { get; }

    public string DevicePath { get; }

    /// <summary>Opens the first WinUSB device matching <paramref name="interfaceGuid"/> + VID/PID, or null if unavailable.</summary>
    public static WinUsbScreenTransport? TryOpen(
        Guid interfaceGuid,
        ushort vid,
        ushort pid,
        ILog log,
        out ScreenStatus failureStatus)
    {
        failureStatus = ScreenStatus.Disconnected();
        string? path = WinUsbInterop.FindDevicePath(interfaceGuid, vid, pid);
        if (path is null)
        {
            string pidLabel = pid == 0 ? "any" : $"0x{pid:X4}";
            failureStatus = ScreenStatus.Disconnected(
                $"No USB interface matched VID=0x{vid:X4} PID={pidLabel}.");
            log.Warn($"Screen enumeration found no match: vid=0x{vid:X4} pid={pidLabel}.");
            return null;
        }

        string matchedPid = pid == 0 ? "any" : $"0x{pid:X4}";
        log.Debug($"Screen USB interface found: vid=0x{vid:X4} pid={matchedPid} path={path}.");
        log.Debug($"Screen CreateFile starting: path={path}.");
        (nint File, nint Winusb)? handles = WinUsbInterop.Open(path, out ScreenOpenFailureStage stage, out int nativeError);
        if (handles is { } h)
        {
            log.Debug($"Screen WinUsb_Initialize completed: path={path}.");
            return new WinUsbScreenTransport(
                h.File,
                h.Winusb,
                ReadPid(path) ?? pid,
                path);
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
        bool succeeded = WinUsbInterop.WinUsb_WritePipe(
            this._winusb,
            endpoint,
            data,
            data.Length,
            out int transferred,
            nint.Zero);
        return this.RecordTransferResult(
            succeeded && transferred == data.Length,
            $"bulk OUT 0x{endpoint:X2}",
            transferred,
            data.Length);
    }

    public bool ControlOut(byte requestType, byte request, ushort value, ushort index, byte[]? data)
    {
        WinUsbInterop.WinUsbSetupPacket packet = new WinUsbInterop.WinUsbSetupPacket
        {
            RequestType = requestType,
            Request = request,
            Value = value,
            Index = index,
            Length = (ushort)(data?.Length ?? 0),
        };
        int expected = data?.Length ?? 0;
        // Some composite WinUSB drivers reject a null buffer even for wLength=0.
        byte[] buffer = data ?? [0x00];
        return this.ControlTransfer(
            packet,
            buffer,
            expected,
            $"control OUT 0x{request:X2}",
            requireExactLength: true,
            out _);
    }

    public bool ControlIn(byte requestType, byte request, byte[] data, out int transferred)
    {
        WinUsbInterop.WinUsbSetupPacket packet = new WinUsbInterop.WinUsbSetupPacket
        {
            RequestType = requestType,
            Request = request,
            Value = 0,
            Index = 0,
            Length = (ushort)data.Length,
        };
        return this.ControlTransfer(
            packet,
            data,
            data.Length,
            $"control IN 0x{request:X2}",
            requireExactLength: false,
            out transferred);
    }

    /// <summary>
    /// Bounds every <see cref="BulkWrite"/> on <paramref name="endpoint"/>. WinUSB waits forever by
    /// default, so a panel that stops taking data would hold the publisher, and the device handle,
    /// until the process is killed: the screen stays frozen and no other app can open it.
    /// </summary>
    public bool LimitBulkWrites(byte endpoint)
    {
        bool succeeded = WinUsbInterop.WinUsb_SetPipePolicy(
            this._winusb,
            endpoint,
            PipeTransferTimeoutPolicy,
            valueLength: sizeof(uint),
            BitConverter.GetBytes(BulkTransferTimeoutMs));
        return this.RecordResult(succeeded, $"set bulk 0x{endpoint:X2} timeout");
    }

    public bool ResetPipe(byte endpoint)
    {
        bool succeeded = WinUsbInterop.WinUsb_ResetPipe(this._winusb, endpoint);
        return this.RecordResult(succeeded, $"reset pipe 0x{endpoint:X2}");
    }

    public bool DisableAutoSuspend()
    {
        bool succeeded = WinUsbInterop.WinUsb_SetPowerPolicy(
            this._winusb,
            AutoSuspendPolicy,
            valueLength: 1,
            [0x00]);
        return this.RecordResult(succeeded, "disable AUTO_SUSPEND");
    }

    public void Dispose()
    {
        this.CancelAndDrainPendingTransfers(CancelDrainTimeoutMs);

        if (this._pendingControlTransfers.Count > 0 && IsValidFileHandle(this._file))
        {
            WinUsbInterop.CloseHandle(this._file);
            this._file = nint.Zero;
            this.DrainPendingTransfers(CloseDrainTimeoutMs);
        }

        if (this._pendingControlTransfers.Count > 0)
        {
            // Windows still has references to these OVERLAPPED structures and
            // pinned buffers. Retaining them until process exit is preferable
            // to freeing memory that a delayed kernel completion may touch.
            lock (AbandonedTransfersLock)
            {
                AbandonedTransfers.AddRange(this._pendingControlTransfers);
            }

            this.LastFailure =
                $"{this.LastFailure} Native control-transfer resources were retained " +
                "because cancellation did not complete before the device closed.";
            this._pendingControlTransfers.Clear();
            this._winusb = nint.Zero;
            return;
        }

        if (this._winusb != nint.Zero)
        {
            WinUsbInterop.WinUsb_Free(this._winusb);
            this._winusb = nint.Zero;
        }

        if (IsValidFileHandle(this._file))
        {
            WinUsbInterop.CloseHandle(this._file);
            this._file = nint.Zero;
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
            this.LastFailure = null;
            return true;
        }

        int nativeError = Marshal.GetLastWin32Error();
        this.LastFailure =
            $"{operation} failed with Win32 error {nativeError}; " +
            $"transferred {transferred} of {expected} bytes.";
        return false;
    }

    private bool RecordResult(bool succeeded, string operation)
    {
        if (succeeded)
        {
            this.LastFailure = null;
            return true;
        }

        this.LastFailure = $"{operation} failed with Win32 error {Marshal.GetLastWin32Error()}.";
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
        nint eventHandle = WinUsbInterop.CreateEvent(
            nint.Zero,
            manualReset: true,
            initialState: false,
            name: null);
        if (eventHandle == nint.Zero)
        {
            this.LastFailure =
                $"{operation} could not create an overlapped event " +
                $"(Win32 error {Marshal.GetLastWin32Error()}).";
            return false;
        }

        ControlTransferResources resources = new ControlTransferResources(eventHandle, buffer);
        bool releaseResources = true;
        try
        {
            Marshal.StructureToPtr(
                new WinUsbInterop.NativeOverlapped { EventHandle = eventHandle },
                resources.OverlappedPointer,
                fDeleteOld: false);

            bool started = WinUsbInterop.WinUsb_ControlTransfer(
                this._winusb,
                packet,
                buffer,
                bufferLength,
                out _,
                resources.OverlappedPointer);
            int nativeError = started ? 0 : Marshal.GetLastWin32Error();
            if (!started && nativeError != ErrorIoPending)
            {
                this.LastFailure = $"{operation} failed with Win32 error {nativeError}.";
                return false;
            }

            if (!started)
            {
                uint wait = WinUsbInterop.WaitForSingleObject(eventHandle, ControlTransferTimeoutMs);
                if (wait == WaitTimeout)
                {
                    releaseResources = this.CancelAndDrain(resources);
                    this.LastFailure = ScreenTransferFailure.DescribeControlTimeout(
                        operation,
                        this.DevicePath,
                        ControlTransferTimeoutMs);
                    return false;
                }

                if (wait != WaitObject0)
                {
                    int waitError = Marshal.GetLastWin32Error();
                    releaseResources = this.CancelAndDrain(resources);
                    this.LastFailure =
                        $"{operation} wait failed with Win32 error {waitError}.";
                    return false;
                }
            }

            bool completed = WinUsbInterop.WinUsb_GetOverlappedResult(
                this._winusb,
                resources.OverlappedPointer,
                out transferred,
                wait: false);
            return this.RecordTransferResult(
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
        if (IsValidFileHandle(this._file))
        {
            WinUsbInterop.CancelIoEx(this._file, resources.OverlappedPointer);
        }

        if (WinUsbInterop.WaitForSingleObject(resources.EventHandle, CancelDrainTimeoutMs) == WaitObject0)
        {
            return true;
        }

        this._pendingControlTransfers.Add(resources);
        return false;
    }

    private void CancelAndDrainPendingTransfers(uint timeoutMs)
    {
        if (IsValidFileHandle(this._file))
        {
            foreach (ControlTransferResources resources in this._pendingControlTransfers)
            {
                WinUsbInterop.CancelIoEx(this._file, resources.OverlappedPointer);
            }
        }

        this.DrainPendingTransfers(timeoutMs);
    }

    private void DrainPendingTransfers(uint timeoutMs)
    {
        foreach (ControlTransferResources resources in this._pendingControlTransfers.ToArray())
        {
            if (WinUsbInterop.WaitForSingleObject(resources.EventHandle, timeoutMs) != WaitObject0)
            {
                continue;
            }

            resources.Release();
            this._pendingControlTransfers.Remove(resources);
        }
    }

    private static bool IsValidFileHandle(nint handle) =>
        handle != nint.Zero && handle != -1;

    private static ushort? ReadPid(string path)
    {
        const string marker = "pid_";
        int start = path.IndexOf(marker, StringComparison.OrdinalIgnoreCase);
        if (start < 0 || start + marker.Length + 4 > path.Length)
        {
            return null;
        }

        return ushort.TryParse(
            path.AsSpan(start + marker.Length, 4),
            NumberStyles.HexNumber,
            CultureInfo.InvariantCulture,
            out ushort pid)
            ? pid
            : null;
    }

    private sealed class ControlTransferResources
    {
        private GCHandle _pinnedBuffer;
        private bool _released;

        public ControlTransferResources(nint eventHandle, byte[] buffer)
        {
            this.EventHandle = eventHandle;
            try
            {
                this.OverlappedPointer =
                    Marshal.AllocHGlobal(Marshal.SizeOf<WinUsbInterop.NativeOverlapped>());
                this._pinnedBuffer = GCHandle.Alloc(buffer, GCHandleType.Pinned);
            }
            catch
            {
                if (this.OverlappedPointer != nint.Zero)
                {
                    Marshal.FreeHGlobal(this.OverlappedPointer);
                }

                WinUsbInterop.CloseHandle(this.EventHandle);
                throw;
            }
        }

        public nint EventHandle { get; }

        public nint OverlappedPointer { get; }

        public void Release()
        {
            if (this._released)
            {
                return;
            }

            this._released = true;
            if (this._pinnedBuffer.IsAllocated)
            {
                this._pinnedBuffer.Free();
            }

            Marshal.FreeHGlobal(this.OverlappedPointer);
            WinUsbInterop.CloseHandle(this.EventHandle);
        }
    }
}

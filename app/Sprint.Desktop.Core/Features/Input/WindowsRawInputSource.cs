using System.Runtime.InteropServices;
using Microsoft.Win32.SafeHandles;
using Sprint.Desktop.Features.Diagnostics;

namespace Sprint.Desktop.Features.Input;

/// <summary>
/// Receives steering-wheel, button-box, and game-controller inputs through the
/// Windows Raw Input HID pipeline. This is the .NET counterpart of Sprint's
/// retired Go detector: it listens to the complete Generic Desktop usage page,
/// preserves usages above 64, and emits only button press edges.
/// </summary>
internal sealed class WindowsRawInputSource : IHardwareInputSource
{
    private const uint GenericDesktopUsagePage = 0x01;
    private const uint UsagePageButton = 0x09;
    private const uint RidevInputSink = 0x00000100;
    private const uint RidevDevNotify = 0x00002000;
    private const uint RidevPageOnly = 0x00000020;
    private const uint RidInput = 0x10000003;
    private const uint RidiPreparsedData = 0x20000005;
    private const uint RidiDeviceInfo = 0x2000000b;
    private const uint RimTypeHid = 2;
    private const uint WmInputDeviceChange = 0x00fe;
    private const uint WmInput = 0x00ff;
    private const uint WmQuit = 0x0012;
    private const nuint GidcArrival = 1;
    private const nuint GidcRemoval = 2;
    private const uint RidiDeviceName = 0x20000007;
    private const ushort UsageJoystick = 0x04;
    private const ushort UsageGamepad = 0x05;
    private const ushort UsageMultiAxisController = 0x08;
    private const uint GenericRead = 0x80000000;
    private const uint FileShareReadWrite = 0x00000003;
    private const uint OpenExisting = 3;
    private const uint FileFlagOverlapped = 0x40000000;
    private const int ErrorIoPending = 997;
    private static readonly int OverlappedEventOffset = (2 * IntPtr.Size) + 8;
    private static readonly int OverlappedSize = OverlappedEventOffset + IntPtr.Size;
    private static readonly TimeSpan HeldButtonsReadTimeout = TimeSpan.FromMilliseconds(250);
    private const int HidpInput = 0;
    private const int HidpStatusSuccess = 0x00110000;
    private const int HidpCapsSize = 64;
    private const int HidpValueCapsSize = 72;
    private static readonly nint HwndMessage = new(-3);

    private readonly ILog _log;
    private readonly Thread _thread;
    private readonly ManualResetEventSlim _ready = new();
    private readonly Dictionary<nint, DeviceState> _devices = [];
    private readonly HashSet<nint> _heldButtonsRead = [];
    private nint _window;
    private uint _threadId;
    private int _running;
    private int _disposed;

    public WindowsRawInputSource(ILog log)
    {
        this._log = log;
        this._thread = new Thread(this.RunMessageLoop)
        {
            IsBackground = true,
            Name = "Sprint Raw Input",
        };
        this._thread.Start();

        if (!this._ready.Wait(TimeSpan.FromSeconds(2)))
        {
            this._log.Warn("Raw Input listener did not initialize within two seconds.");
        }
    }

    public event EventHandler<HardwareInputEvent>? InputPressed;

    public bool IsAvailable => this.IsRunning;

    internal bool IsRunning => Volatile.Read(ref this._running) != 0;

    public void Dispose()
    {
        if (Interlocked.Exchange(ref this._disposed, 1) != 0)
        {
            return;
        }

        this._ready.Wait(TimeSpan.FromSeconds(2));
        uint threadId = Volatile.Read(ref this._threadId);
        if (threadId != 0)
        {
            Native.PostThreadMessage(threadId, WmQuit, nint.Zero, nint.Zero);
        }

        if (Thread.CurrentThread != this._thread && !this._thread.Join(TimeSpan.FromSeconds(2)))
        {
            this._log.Warn("Raw Input listener did not stop within two seconds.");
        }

    }

    private void RunMessageLoop()
    {
        try
        {
            this._threadId = Native.GetCurrentThreadId();
            this._window = Native.CreateWindowEx(
                0,
                "STATIC",
                null,
                0,
                0,
                0,
                0,
                0,
                HwndMessage,
                nint.Zero,
                nint.Zero,
                nint.Zero);
            if (this._window == nint.Zero)
            {
                this._log.Warn($"Raw Input message window could not be created (Win32 {Marshal.GetLastWin32Error()}).");
                return;
            }

            RawInputDevice[] registrations = new[]
            {
                new RawInputDevice
                {
                    UsagePage = (ushort)GenericDesktopUsagePage,
                    Usage = 0,
                    Flags = RidevInputSink | RidevPageOnly | RidevDevNotify,
                    Target = this._window,
                },
            };
            if (!Native.RegisterRawInputDevices(
                    registrations,
                    (uint)registrations.Length,
                    (uint)Marshal.SizeOf<RawInputDevice>()))
            {
                this._log.Warn($"Steering-wheel Raw Input registration failed (Win32 {Marshal.GetLastWin32Error()}).");
                return;
            }

            Volatile.Write(ref this._running, 1);
            this._log.Info("Steering-wheel Raw Input listener started.");
            this._ready.Set();
            this.ReadHeldButtonsOfAllControllers();

            while (Native.GetMessage(out NativeMessage message, nint.Zero, 0, 0) > 0)
            {
                if (message.Message == WmInputDeviceChange)
                {
                    nuint change = unchecked((nuint)message.WParam);
                    if (change == GidcRemoval)
                    {
                        this.RemoveDevice(message.LParam);
                    }
                    else if (change == GidcArrival)
                    {
                        this.ReadHeldButtons(message.LParam);
                    }
                }
                else if (message.Message == WmInput)
                {
                    this.HandleRawInput(message.LParam);
                }

                Native.DispatchMessage(ref message);
            }
        }
        catch (Exception ex)
        {
            this._log.Warn("Steering-wheel Raw Input listener stopped after an unexpected error.", ex);
        }
        finally
        {
            this._ready.Set();
            foreach (DeviceState device in this._devices.Values)
            {
                device.Dispose();
            }

            this._devices.Clear();
            if (this._window != nint.Zero)
            {
                Native.DestroyWindow(this._window);
                this._window = nint.Zero;
            }

            this._threadId = 0;
            Volatile.Write(ref this._running, 0);
            this._log.Info("Steering-wheel Raw Input listener stopped.");
        }
    }

    private void RemoveDevice(nint handle)
    {
        this._heldButtonsRead.Remove(handle);
        if (!this._devices.Remove(handle, out DeviceState? device))
        {
            return;
        }

        device.Dispose();
        this._log.Debug($"Raw Input HID removed: vid={device.Vid:x4} pid={device.Pid:x4}.");
    }

    /// <summary>
    /// Raw Input only reports a controller when something on it changes, so a button that is
    /// already held when Sprint starts -- a multi-position switch reports its position that way --
    /// stays invisible until the driver touches the wheel. Reading one report straight from each
    /// game controller fills that gap: its held buttons go through the same edge tracker as any
    /// other report, so they are emitted once, as presses, and never again while they stay held.
    /// </summary>
    private void ReadHeldButtonsOfAllControllers()
    {
        uint count = 0;
        uint entrySize = (uint)Marshal.SizeOf<RawInputDeviceListEntry>();
        if (Native.GetRawInputDeviceList(null, ref count, entrySize) == uint.MaxValue || count == 0)
        {
            return;
        }

        RawInputDeviceListEntry[] entries = new RawInputDeviceListEntry[count];
        uint listed = Native.GetRawInputDeviceList(entries, ref count, entrySize);
        if (listed == uint.MaxValue)
        {
            return;
        }

        foreach (RawInputDeviceListEntry entry in entries.Take(checked((int)listed)))
        {
            if (entry.Type == RimTypeHid)
            {
                this.ReadHeldButtons(entry.Device);
            }
        }
    }

    /// <summary>
    /// Reads one input report from a game controller and feeds it to the edge tracker. Gives up
    /// after a short timeout: a controller that only reports on change says nothing, and its
    /// held buttons then stay unknown until the first change -- the honest fallback.
    /// </summary>
    private void ReadHeldButtons(nint handle)
    {
        if (!this._heldButtonsRead.Add(handle))
        {
            return;
        }

        RawInputDeviceInfo info = ReadDeviceInfo(handle);
        if (info.Type != RimTypeHid
            || info.UsagePage != GenericDesktopUsagePage
            || info.Usage is not (UsageJoystick or UsageGamepad or UsageMultiAxisController))
        {
            return;
        }

        DeviceState? device = this.GetOrCreateDevice(handle);
        string? path = ReadDevicePath(handle);
        if (device is null || path is null || device.InputReportLength == 0)
        {
            return;
        }

        using SafeFileHandle file = Native.CreateFile(path, GenericRead, FileShareReadWrite, nint.Zero, OpenExisting, FileFlagOverlapped, nint.Zero);
        if (file.IsInvalid)
        {
            this._log.Debug($"Held buttons not read: vid={device.Vid:x4} pid={device.Pid:x4} could not be opened (Win32 {Marshal.GetLastWin32Error()}).");
            return;
        }

        nint report = Marshal.AllocHGlobal(device.InputReportLength);
        nint overlapped = Marshal.AllocHGlobal(OverlappedSize);
        using ManualResetEvent completed = new(false);
        try
        {
            // OVERLAPPED: Internal, InternalHigh, Offset, OffsetHigh (all zero), then hEvent.
            for (int offset = 0; offset < OverlappedSize; offset++)
            {
                Marshal.WriteByte(overlapped, offset, 0);
            }

            Marshal.WriteIntPtr(overlapped, OverlappedEventOffset, completed.SafeWaitHandle.DangerousGetHandle());
            if (!Native.ReadFile(file, report, (uint)device.InputReportLength, nint.Zero, overlapped)
                && Marshal.GetLastWin32Error() != ErrorIoPending)
            {
                return;
            }

            if (!completed.WaitOne(HeldButtonsReadTimeout))
            {
                // The buffers stay allocated until the cancelled read has really finished.
                Native.CancelIoEx(file, overlapped);
                Native.GetOverlappedResult(file, overlapped, out uint _, true);
                this._log.Debug($"Held buttons not read: vid={device.Vid:x4} pid={device.Pid:x4} sent no report.");
                return;
            }

            if (Native.GetOverlappedResult(file, overlapped, out uint read, false) && read > 0)
            {
                this.ReadButtonPresses(device, report, read);
            }
        }
        finally
        {
            Marshal.FreeHGlobal(overlapped);
            Marshal.FreeHGlobal(report);
        }
    }

    private static RawInputDeviceInfo ReadDeviceInfo(nint handle)
    {
        RawInputDeviceInfo info = new()
        {
            Size = (uint)Marshal.SizeOf<RawInputDeviceInfo>(),
        };
        uint infoSize = info.Size;
        return Native.GetRawInputDeviceInfo(handle, RidiDeviceInfo, ref info, ref infoSize) == uint.MaxValue
            ? default
            : info;
    }

    private static string? ReadDevicePath(nint handle)
    {
        uint length = 0;
        if (Native.GetRawInputDeviceInfo(handle, RidiDeviceName, nint.Zero, ref length) == uint.MaxValue || length == 0)
        {
            return null;
        }

        nint buffer = Marshal.AllocHGlobal(checked((int)length * sizeof(char)));
        try
        {
            return Native.GetRawInputDeviceInfo(handle, RidiDeviceName, buffer, ref length) == uint.MaxValue
                ? null
                : Marshal.PtrToStringUni(buffer);
        }
        finally
        {
            Marshal.FreeHGlobal(buffer);
        }
    }

    private void HandleRawInput(nint rawInputHandle)
    {
        uint headerSize = (uint)Marshal.SizeOf<RawInputHeader>();
        uint size = 0;
        if (Native.GetRawInputData(rawInputHandle, RidInput, nint.Zero, ref size, headerSize) == uint.MaxValue
            || size < headerSize + 8)
        {
            return;
        }

        nint buffer = Marshal.AllocHGlobal(checked((int)size));
        try
        {
            uint readSize = size;
            if (Native.GetRawInputData(rawInputHandle, RidInput, buffer, ref readSize, headerSize) == uint.MaxValue)
            {
                return;
            }

            RawInputHeader header = Marshal.PtrToStructure<RawInputHeader>(buffer);
            if (header.Type != RimTypeHid)
            {
                return;
            }

            nint rawHid = nint.Add(buffer, checked((int)headerSize));
            uint reportSize = unchecked((uint)Marshal.ReadInt32(rawHid));
            uint reportCount = unchecked((uint)Marshal.ReadInt32(rawHid, 4));
            if (reportSize == 0 || reportCount == 0)
            {
                return;
            }

            ulong reportsSize = (ulong)reportSize * reportCount;
            if (reportsSize > readSize - headerSize - 8)
            {
                return;
            }

            DeviceState? device = this.GetOrCreateDevice(header.Device);
            if (device is null)
            {
                return;
            }

            for (uint index = 0; index < reportCount; index++)
            {
                nint report = nint.Add(rawHid, checked(8 + (int)(index * reportSize)));
                this.ReadButtonPresses(device, report, reportSize);
                this.ReadEncoderTicks(device, report, reportSize);
            }
        }
        finally
        {
            Marshal.FreeHGlobal(buffer);
        }
    }

    private DeviceState? GetOrCreateDevice(nint handle)
    {
        if (this._devices.TryGetValue(handle, out DeviceState? cached))
        {
            return cached;
        }

        uint preparsedSize = 0;
        if (Native.GetRawInputDeviceInfo(handle, RidiPreparsedData, nint.Zero, ref preparsedSize) == uint.MaxValue
            || preparsedSize == 0)
        {
            return null;
        }

        nint preparsed = Marshal.AllocHGlobal(checked((int)preparsedSize));
        uint actualSize = preparsedSize;
        if (Native.GetRawInputDeviceInfo(handle, RidiPreparsedData, preparsed, ref actualSize) == uint.MaxValue)
        {
            Marshal.FreeHGlobal(preparsed);
            return null;
        }

        (ushort Vid, ushort Pid) identity = ReadIdentity(handle);
        DeviceState device = new(identity.Vid, identity.Pid, preparsed, ReadInputReportLength(preparsed));
        device.RelativeAxes.AddRange(ReadRelativeAxes(preparsed));
        this._devices[handle] = device;
        this._log.Debug(
            $"Raw Input HID ready: vid={device.Vid:x4} pid={device.Pid:x4} " +
            $"relativeAxes={device.RelativeAxes.Count}.");
        return device;
    }

    /// <summary>The size of one input report, report id included (HIDP_CAPS.InputReportByteLength); 0 when unknown.</summary>
    private static int ReadInputReportLength(nint preparsedData)
    {
        nint caps = Marshal.AllocHGlobal(HidpCapsSize);
        try
        {
            return Native.HidPGetCaps(preparsedData, caps) == HidpStatusSuccess
                ? unchecked((ushort)Marshal.ReadInt16(caps, 4))
                : 0;
        }
        finally
        {
            Marshal.FreeHGlobal(caps);
        }
    }

    private static (ushort Vid, ushort Pid) ReadIdentity(nint handle)
    {
        RawInputDeviceInfo info = new RawInputDeviceInfo
        {
            Size = (uint)Marshal.SizeOf<RawInputDeviceInfo>(),
        };
        uint infoSize = info.Size;
        if (Native.GetRawInputDeviceInfo(handle, RidiDeviceInfo, ref info, ref infoSize) == uint.MaxValue
            || info.Type != RimTypeHid)
        {
            return default;
        }

        return (unchecked((ushort)info.VendorId), unchecked((ushort)info.ProductId));
    }

    private void ReadButtonPresses(DeviceState device, nint report, uint reportSize)
    {
        uint maxUsageCount = Native.HidPMaxUsageListLength(HidpInput, UsagePageButton, device.PreparsedData);
        if (maxUsageCount == 0 || maxUsageCount > ushort.MaxValue)
        {
            return;
        }

        ushort[] usages = new ushort[maxUsageCount];
        GCHandle pinned = GCHandle.Alloc(usages, GCHandleType.Pinned);
        try
        {
            uint usageCount = maxUsageCount;
            int status = Native.HidPGetUsages(
                HidpInput,
                (ushort)UsagePageButton,
                0,
                pinned.AddrOfPinnedObject(),
                ref usageCount,
                device.PreparsedData,
                report,
                reportSize);
            if (status != HidpStatusSuccess)
            {
                return;
            }

            HashSet<ushort> pressed = usages
                .Take(checked((int)usageCount))
                .Where(usage => usage > 0)
                .ToHashSet();
            foreach (ushort button in device.Buttons.Update(pressed))
            {
                this.Emit(device, $"button:{button}");
            }
        }
        finally
        {
            pinned.Free();
        }
    }

    private void ReadEncoderTicks(DeviceState device, nint report, uint reportSize)
    {
        for (int index = 0; index < device.RelativeAxes.Count; index++)
        {
            RelativeAxis axis = device.RelativeAxes[index];
            int status = Native.HidPGetUsageValue(
                HidpInput,
                axis.UsagePage,
                axis.LinkCollection,
                axis.Usage,
                out uint rawValue,
                device.PreparsedData,
                report,
                reportSize);
            if (status != HidpStatusSuccess)
            {
                continue;
            }

            int delta = axis.IsSigned
                ? SignExtend(rawValue, axis.BitSize)
                : unchecked((int)rawValue);
            if (delta != 0)
            {
                this.Emit(device, $"encoder:{index + 1}{(delta > 0 ? "+" : "-")}");
            }
        }
    }

    private static IReadOnlyList<RelativeAxis> ReadRelativeAxes(nint preparsedData)
    {
        nint caps = Marshal.AllocHGlobal(HidpCapsSize);
        try
        {
            if (Native.HidPGetCaps(preparsedData, caps) != HidpStatusSuccess)
            {
                return [];
            }

            ushort count = unchecked((ushort)Marshal.ReadInt16(caps, 48));
            if (count == 0)
            {
                return [];
            }

            nint valueCaps = Marshal.AllocHGlobal(checked(count * HidpValueCapsSize));
            try
            {
                ushort actualCount = count;
                if (Native.HidPGetValueCaps(HidpInput, valueCaps, ref actualCount, preparsedData) != HidpStatusSuccess)
                {
                    return [];
                }

                List<RelativeAxis> result = new List<RelativeAxis>(actualCount);
                for (int index = 0; index < actualCount; index++)
                {
                    nint cap = nint.Add(valueCaps, index * HidpValueCapsSize);
                    bool isAbsolute = Marshal.ReadByte(cap, 15) != 0;
                    if (isAbsolute)
                    {
                        continue;
                    }

                    ushort usagePage = unchecked((ushort)Marshal.ReadInt16(cap, 0));
                    ushort linkCollection = unchecked((ushort)Marshal.ReadInt16(cap, 6));
                    ushort usage = unchecked((ushort)Marshal.ReadInt16(cap, 56));
                    ushort bitSize = unchecked((ushort)Marshal.ReadInt16(cap, 18));
                    int logicalMinimum = Marshal.ReadInt32(cap, 40);
                    result.Add(new RelativeAxis(
                        usagePage,
                        linkCollection,
                        usage,
                        bitSize,
                        logicalMinimum < 0));
                }

                return result;
            }
            finally
            {
                Marshal.FreeHGlobal(valueCaps);
            }
        }
        finally
        {
            Marshal.FreeHGlobal(caps);
        }
    }

    internal static int SignExtend(uint value, ushort bitSize)
    {
        if (bitSize is 0 or >= 32)
        {
            return unchecked((int)value);
        }

        uint mask = (1u << bitSize) - 1;
        value &= mask;
        uint signBit = 1u << (bitSize - 1);
        return (value & signBit) == 0
            ? unchecked((int)value)
            : unchecked((int)(value | ~mask));
    }

    private void Emit(DeviceState device, string input)
    {
        try
        {
            InputPressed?.Invoke(this, new HardwareInputEvent(device.Vid, device.Pid, input));
        }
        catch (Exception ex)
        {
            this._log.Warn($"Hardware input subscriber failed for {input}.", ex);
        }
    }

    private sealed class DeviceState(ushort vid, ushort pid, nint preparsedData, int inputReportLength) : IDisposable
    {
        public ushort Vid { get; } = vid;
        public ushort Pid { get; } = pid;
        public nint PreparsedData { get; } = preparsedData;
        public int InputReportLength { get; } = inputReportLength;
        public ButtonEdgeTracker Buttons { get; } = new();
        public List<RelativeAxis> RelativeAxes { get; } = [];

        public void Dispose() => Marshal.FreeHGlobal(this.PreparsedData);
    }

    private sealed record RelativeAxis(
        ushort UsagePage,
        ushort LinkCollection,
        ushort Usage,
        ushort BitSize,
        bool IsSigned);

    [StructLayout(LayoutKind.Sequential)]
    private struct RawInputDevice
    {
        public ushort UsagePage;
        public ushort Usage;
        public uint Flags;
        public nint Target;
    }

    [StructLayout(LayoutKind.Sequential)]
    private struct RawInputHeader
    {
        public uint Type;
        public uint Size;
        public nint Device;
        public nint WParam;
    }

    [StructLayout(LayoutKind.Sequential)]
    private struct NativeMessage
    {
        public nint Hwnd;
        public uint Message;
        public nint WParam;
        public nint LParam;
        public uint Time;
        public int PointX;
        public int PointY;
        public uint Private;
    }

    [StructLayout(LayoutKind.Explicit, Size = 32)]
    private struct RawInputDeviceInfo
    {
        [FieldOffset(0)]
        public uint Size;

        [FieldOffset(4)]
        public uint Type;

        [FieldOffset(8)]
        public uint VendorId;

        [FieldOffset(12)]
        public uint ProductId;

        [FieldOffset(20)]
        public ushort UsagePage;

        [FieldOffset(22)]
        public ushort Usage;
    }

    [StructLayout(LayoutKind.Sequential)]
    private struct RawInputDeviceListEntry
    {
        public nint Device;
        public uint Type;
    }

    private static class Native
    {
        [DllImport("user32.dll", SetLastError = true)]
        [return: MarshalAs(UnmanagedType.Bool)]
        public static extern bool RegisterRawInputDevices(
            [In] RawInputDevice[] devices,
            uint numberOfDevices,
            uint size);

        [DllImport("user32.dll", SetLastError = true)]
        public static extern uint GetRawInputData(
            nint rawInput,
            uint command,
            nint data,
            ref uint size,
            uint headerSize);

        [DllImport("user32.dll", EntryPoint = "GetRawInputDeviceInfoW", SetLastError = true)]
        public static extern uint GetRawInputDeviceInfo(
            nint device,
            uint command,
            nint data,
            ref uint size);

        [DllImport("user32.dll", EntryPoint = "GetRawInputDeviceInfoW", SetLastError = true)]
        public static extern uint GetRawInputDeviceInfo(
            nint device,
            uint command,
            ref RawInputDeviceInfo data,
            ref uint size);

        [DllImport("user32.dll", EntryPoint = "CreateWindowExW", CharSet = CharSet.Unicode, SetLastError = true)]
        public static extern nint CreateWindowEx(
            uint extendedStyle,
            string className,
            string? windowName,
            uint style,
            int x,
            int y,
            int width,
            int height,
            nint parent,
            nint menu,
            nint instance,
            nint parameter);

        [DllImport("user32.dll", SetLastError = true)]
        [return: MarshalAs(UnmanagedType.Bool)]
        public static extern bool DestroyWindow(nint window);

        [DllImport("user32.dll", EntryPoint = "GetMessageW")]
        public static extern int GetMessage(out NativeMessage message, nint window, uint min, uint max);

        [DllImport("user32.dll", EntryPoint = "DispatchMessageW")]
        public static extern nint DispatchMessage(ref NativeMessage message);

        [DllImport("user32.dll", EntryPoint = "PostThreadMessageW", SetLastError = true)]
        [return: MarshalAs(UnmanagedType.Bool)]
        public static extern bool PostThreadMessage(uint threadId, uint message, nint wParam, nint lParam);

        [DllImport("kernel32.dll")]
        public static extern uint GetCurrentThreadId();

        [DllImport("user32.dll", SetLastError = true)]
        public static extern uint GetRawInputDeviceList(
            [Out] RawInputDeviceListEntry[]? devices,
            ref uint count,
            uint size);

        [DllImport("kernel32.dll", EntryPoint = "CreateFileW", CharSet = CharSet.Unicode, SetLastError = true)]
        public static extern SafeFileHandle CreateFile(
            string path,
            uint access,
            uint share,
            nint security,
            uint creation,
            uint flags,
            nint template);

        [DllImport("kernel32.dll", SetLastError = true)]
        [return: MarshalAs(UnmanagedType.Bool)]
        public static extern bool ReadFile(SafeFileHandle file, nint buffer, uint length, nint read, nint overlapped);

        [DllImport("kernel32.dll", SetLastError = true)]
        [return: MarshalAs(UnmanagedType.Bool)]
        public static extern bool GetOverlappedResult(SafeFileHandle file, nint overlapped, out uint transferred, [MarshalAs(UnmanagedType.Bool)] bool wait);

        [DllImport("kernel32.dll", SetLastError = true)]
        [return: MarshalAs(UnmanagedType.Bool)]
        public static extern bool CancelIoEx(SafeFileHandle file, nint overlapped);

        [DllImport("hid.dll", EntryPoint = "HidP_MaxUsageListLength")]
        public static extern uint HidPMaxUsageListLength(int reportType, uint usagePage, nint preparsedData);

        [DllImport("hid.dll", EntryPoint = "HidP_GetUsages")]
        public static extern int HidPGetUsages(
            int reportType,
            ushort usagePage,
            ushort linkCollection,
            nint usageList,
            ref uint usageLength,
            nint preparsedData,
            nint report,
            uint reportLength);

        [DllImport("hid.dll", EntryPoint = "HidP_GetCaps")]
        public static extern int HidPGetCaps(nint preparsedData, nint capabilities);

        [DllImport("hid.dll", EntryPoint = "HidP_GetValueCaps")]
        public static extern int HidPGetValueCaps(
            int reportType,
            nint valueCapabilities,
            ref ushort valueCapabilitiesLength,
            nint preparsedData);

        [DllImport("hid.dll", EntryPoint = "HidP_GetUsageValue")]
        public static extern int HidPGetUsageValue(
            int reportType,
            ushort usagePage,
            ushort linkCollection,
            ushort usage,
            out uint usageValue,
            nint preparsedData,
            nint report,
            uint reportLength);
    }
}

/// <summary>Tracks per-device button state and returns only 0→1 transitions.</summary>
internal sealed class ButtonEdgeTracker
{
    private HashSet<ushort> _pressed = [];

    public IReadOnlyList<ushort> Update(IEnumerable<ushort> pressed)
    {
        HashSet<ushort> next = pressed.ToHashSet();
        ushort[] newPresses = next.Where(button => !this._pressed.Contains(button)).Order().ToArray();
        this._pressed = next;
        return newPresses;
    }
}

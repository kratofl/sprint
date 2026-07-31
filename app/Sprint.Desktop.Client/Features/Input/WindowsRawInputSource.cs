using System.Runtime.InteropServices;
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
    private const nuint GidcRemoval = 2;
    private const int HidpInput = 0;
    private const int HidpStatusSuccess = 0x00110000;
    private const int HidpCapsSize = 64;
    private const int HidpValueCapsSize = 72;
    private static readonly nint HwndMessage = new(-3);

    private readonly ILog _log;
    private readonly Thread _thread;
    private readonly ManualResetEventSlim _ready = new();
    private readonly Dictionary<nint, DeviceState> _devices = [];
    private nint _window;
    private uint _threadId;
    private int _running;
    private int _disposed;

    public WindowsRawInputSource(ILog log)
    {
        _log = log;
        _thread = new Thread(RunMessageLoop)
        {
            IsBackground = true,
            Name = "Sprint Raw Input",
        };
        _thread.Start();

        if (!_ready.Wait(TimeSpan.FromSeconds(2)))
        {
            _log.Warn("Raw Input listener did not initialize within two seconds.");
        }
    }

    public event EventHandler<HardwareInputEvent>? InputPressed;

    public bool IsAvailable => IsRunning;

    internal bool IsRunning => Volatile.Read(ref _running) != 0;

    public void Dispose()
    {
        if (Interlocked.Exchange(ref _disposed, 1) != 0)
        {
            return;
        }

        _ready.Wait(TimeSpan.FromSeconds(2));
        var threadId = Volatile.Read(ref _threadId);
        if (threadId != 0)
        {
            Native.PostThreadMessage(threadId, WmQuit, nint.Zero, nint.Zero);
        }

        if (Thread.CurrentThread != _thread && !_thread.Join(TimeSpan.FromSeconds(2)))
        {
            _log.Warn("Raw Input listener did not stop within two seconds.");
        }

    }

    private void RunMessageLoop()
    {
        try
        {
            _threadId = Native.GetCurrentThreadId();
            _window = Native.CreateWindowEx(
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
            if (_window == nint.Zero)
            {
                _log.Warn($"Raw Input message window could not be created (Win32 {Marshal.GetLastWin32Error()}).");
                return;
            }

            var registrations = new[]
            {
                new RawInputDevice
                {
                    UsagePage = (ushort)GenericDesktopUsagePage,
                    Usage = 0,
                    Flags = RidevInputSink | RidevPageOnly | RidevDevNotify,
                    Target = _window,
                },
            };
            if (!Native.RegisterRawInputDevices(
                    registrations,
                    (uint)registrations.Length,
                    (uint)Marshal.SizeOf<RawInputDevice>()))
            {
                _log.Warn($"Steering-wheel Raw Input registration failed (Win32 {Marshal.GetLastWin32Error()}).");
                return;
            }

            Volatile.Write(ref _running, 1);
            _log.Info("Steering-wheel Raw Input listener started.");
            _ready.Set();

            while (Native.GetMessage(out var message, nint.Zero, 0, 0) > 0)
            {
                if (message.Message == WmInputDeviceChange
                    && unchecked((nuint)message.WParam) == GidcRemoval)
                {
                    RemoveDevice(message.LParam);
                }
                else if (message.Message == WmInput)
                {
                    HandleRawInput(message.LParam);
                }

                Native.DispatchMessage(ref message);
            }
        }
        catch (Exception ex)
        {
            _log.Warn("Steering-wheel Raw Input listener stopped after an unexpected error.", ex);
        }
        finally
        {
            _ready.Set();
            foreach (var device in _devices.Values)
            {
                device.Dispose();
            }

            _devices.Clear();
            if (_window != nint.Zero)
            {
                Native.DestroyWindow(_window);
                _window = nint.Zero;
            }

            _threadId = 0;
            Volatile.Write(ref _running, 0);
            _log.Info("Steering-wheel Raw Input listener stopped.");
        }
    }

    private void RemoveDevice(nint handle)
    {
        if (!_devices.Remove(handle, out var device))
        {
            return;
        }

        device.Dispose();
        _log.Debug($"Raw Input HID removed: vid={device.Vid:x4} pid={device.Pid:x4}.");
    }

    private void HandleRawInput(nint rawInputHandle)
    {
        var headerSize = (uint)Marshal.SizeOf<RawInputHeader>();
        uint size = 0;
        if (Native.GetRawInputData(rawInputHandle, RidInput, nint.Zero, ref size, headerSize) == uint.MaxValue
            || size < headerSize + 8)
        {
            return;
        }

        var buffer = Marshal.AllocHGlobal(checked((int)size));
        try
        {
            var readSize = size;
            if (Native.GetRawInputData(rawInputHandle, RidInput, buffer, ref readSize, headerSize) == uint.MaxValue)
            {
                return;
            }

            var header = Marshal.PtrToStructure<RawInputHeader>(buffer);
            if (header.Type != RimTypeHid)
            {
                return;
            }

            var rawHid = nint.Add(buffer, checked((int)headerSize));
            var reportSize = unchecked((uint)Marshal.ReadInt32(rawHid));
            var reportCount = unchecked((uint)Marshal.ReadInt32(rawHid, 4));
            if (reportSize == 0 || reportCount == 0)
            {
                return;
            }

            var reportsSize = (ulong)reportSize * reportCount;
            if (reportsSize > readSize - headerSize - 8)
            {
                return;
            }

            var device = GetOrCreateDevice(header.Device);
            if (device is null)
            {
                return;
            }

            for (uint index = 0; index < reportCount; index++)
            {
                var report = nint.Add(rawHid, checked(8 + (int)(index * reportSize)));
                ReadButtonPresses(device, report, reportSize);
                ReadEncoderTicks(device, report, reportSize);
            }
        }
        finally
        {
            Marshal.FreeHGlobal(buffer);
        }
    }

    private DeviceState? GetOrCreateDevice(nint handle)
    {
        if (_devices.TryGetValue(handle, out var cached))
        {
            return cached;
        }

        uint preparsedSize = 0;
        if (Native.GetRawInputDeviceInfo(handle, RidiPreparsedData, nint.Zero, ref preparsedSize) == uint.MaxValue
            || preparsedSize == 0)
        {
            return null;
        }

        var preparsed = Marshal.AllocHGlobal(checked((int)preparsedSize));
        var actualSize = preparsedSize;
        if (Native.GetRawInputDeviceInfo(handle, RidiPreparsedData, preparsed, ref actualSize) == uint.MaxValue)
        {
            Marshal.FreeHGlobal(preparsed);
            return null;
        }

        var identity = ReadIdentity(handle);
        var device = new DeviceState(identity.Vid, identity.Pid, preparsed);
        device.RelativeAxes.AddRange(ReadRelativeAxes(preparsed));
        _devices[handle] = device;
        _log.Debug(
            $"Raw Input HID ready: vid={device.Vid:x4} pid={device.Pid:x4} " +
            $"relativeAxes={device.RelativeAxes.Count}.");
        return device;
    }

    private static (ushort Vid, ushort Pid) ReadIdentity(nint handle)
    {
        var info = new RawInputDeviceInfo
        {
            Size = (uint)Marshal.SizeOf<RawInputDeviceInfo>(),
        };
        var infoSize = info.Size;
        if (Native.GetRawInputDeviceInfo(handle, RidiDeviceInfo, ref info, ref infoSize) == uint.MaxValue
            || info.Type != RimTypeHid)
        {
            return default;
        }

        return (unchecked((ushort)info.VendorId), unchecked((ushort)info.ProductId));
    }

    private void ReadButtonPresses(DeviceState device, nint report, uint reportSize)
    {
        var maxUsageCount = Native.HidPMaxUsageListLength(HidpInput, UsagePageButton, device.PreparsedData);
        if (maxUsageCount == 0 || maxUsageCount > ushort.MaxValue)
        {
            return;
        }

        var usages = new ushort[maxUsageCount];
        var pinned = GCHandle.Alloc(usages, GCHandleType.Pinned);
        try
        {
            var usageCount = maxUsageCount;
            var status = Native.HidPGetUsages(
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

            var pressed = usages
                .Take(checked((int)usageCount))
                .Where(usage => usage > 0)
                .ToHashSet();
            foreach (var button in device.Buttons.Update(pressed))
            {
                Emit(device, $"button:{button}");
            }
        }
        finally
        {
            pinned.Free();
        }
    }

    private void ReadEncoderTicks(DeviceState device, nint report, uint reportSize)
    {
        for (var index = 0; index < device.RelativeAxes.Count; index++)
        {
            var axis = device.RelativeAxes[index];
            var status = Native.HidPGetUsageValue(
                HidpInput,
                axis.UsagePage,
                axis.LinkCollection,
                axis.Usage,
                out var rawValue,
                device.PreparsedData,
                report,
                reportSize);
            if (status != HidpStatusSuccess)
            {
                continue;
            }

            var delta = axis.IsSigned
                ? SignExtend(rawValue, axis.BitSize)
                : unchecked((int)rawValue);
            if (delta != 0)
            {
                Emit(device, $"encoder:{index + 1}{(delta > 0 ? "+" : "-")}");
            }
        }
    }

    private static IReadOnlyList<RelativeAxis> ReadRelativeAxes(nint preparsedData)
    {
        var caps = Marshal.AllocHGlobal(HidpCapsSize);
        try
        {
            if (Native.HidPGetCaps(preparsedData, caps) != HidpStatusSuccess)
            {
                return [];
            }

            var count = unchecked((ushort)Marshal.ReadInt16(caps, 48));
            if (count == 0)
            {
                return [];
            }

            var valueCaps = Marshal.AllocHGlobal(checked(count * HidpValueCapsSize));
            try
            {
                var actualCount = count;
                if (Native.HidPGetValueCaps(HidpInput, valueCaps, ref actualCount, preparsedData) != HidpStatusSuccess)
                {
                    return [];
                }

                var result = new List<RelativeAxis>(actualCount);
                for (var index = 0; index < actualCount; index++)
                {
                    var cap = nint.Add(valueCaps, index * HidpValueCapsSize);
                    var isAbsolute = Marshal.ReadByte(cap, 15) != 0;
                    if (isAbsolute)
                    {
                        continue;
                    }

                    var usagePage = unchecked((ushort)Marshal.ReadInt16(cap, 0));
                    var linkCollection = unchecked((ushort)Marshal.ReadInt16(cap, 6));
                    var usage = unchecked((ushort)Marshal.ReadInt16(cap, 56));
                    var bitSize = unchecked((ushort)Marshal.ReadInt16(cap, 18));
                    var logicalMinimum = Marshal.ReadInt32(cap, 40);
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

        var mask = (1u << bitSize) - 1;
        value &= mask;
        var signBit = 1u << (bitSize - 1);
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
            _log.Warn($"Hardware input subscriber failed for {input}.", ex);
        }
    }

    private sealed class DeviceState(ushort vid, ushort pid, nint preparsedData) : IDisposable
    {
        public ushort Vid { get; } = vid;
        public ushort Pid { get; } = pid;
        public nint PreparsedData { get; } = preparsedData;
        public ButtonEdgeTracker Buttons { get; } = new();
        public List<RelativeAxis> RelativeAxes { get; } = [];

        public void Dispose() => Marshal.FreeHGlobal(PreparsedData);
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
        var next = pressed.ToHashSet();
        var newPresses = next.Where(button => !_pressed.Contains(button)).Order().ToArray();
        _pressed = next;
        return newPresses;
    }
}

using Sprint.Desktop.Features.Input;
using Sprint.Desktop.Features.Devices;
using Sprint.Desktop.Features.Diagnostics;
using Xunit;

namespace Sprint.Desktop.Tests;

public sealed class InputBindingTests
{
    [Fact]
    public void CommandBusDispatchesRegisteredHandler()
    {
        CommandBus bus = new CommandBus();
        SprintCommands.RegisterDefaults(bus);
        object? received = "sentinel";
        bus.Handle(SprintCommands.DashPageNext, payload => received = payload);

        Assert.True(bus.Dispatch(SprintCommands.DashPageNext, 42));
        Assert.Equal(42, received);
        Assert.False(bus.Dispatch("nonexistent.command"));
    }

    [Fact]
    public void CommandBusCatalogListsStaticThenDynamic()
    {
        CommandBus bus = new CommandBus();
        SprintCommands.RegisterDefaults(bus);
        bus.ReplaceDynamic([
            new DynamicCommand(new CommandMeta("dash.page.1", "Page 1", "Dashboard", true, true), _ => { }),
        ]);

        IReadOnlyList<CommandMeta> catalog = bus.Catalog();
        Assert.Equal(SprintCommands.DashPageNext, catalog[0].Id);
        Assert.Contains(catalog, meta => meta.Id == "dash.page.1");
    }

    [Fact]
    public void ReplaceDynamicSwapsOutPreviousDynamicSet()
    {
        CommandBus bus = new CommandBus();
        bus.ReplaceDynamic([new DynamicCommand(new CommandMeta("a", "A", "c", true, false), _ => { })]);
        bus.ReplaceDynamic([new DynamicCommand(new CommandMeta("b", "B", "c", true, false), _ => { })]);

        string[] ids = bus.Catalog().Select(meta => meta.Id).ToArray();
        Assert.DoesNotContain("a", ids);
        Assert.Contains("b", ids);
        Assert.False(bus.Dispatch("a"));
    }

    [Fact]
    public void BindingResolverPrefersDeviceLayerOverGlobal()
    {
        InputBinding[] device = new[] { new InputBinding { Input = "button:5", Command = "dash.page.next" } };
        InputBinding[] global = new[] { new InputBinding { Input = "button:5", Command = "dash.page.prev" } };

        Assert.Equal("dash.page.next", BindingResolver.Resolve("button:5", device, global));
        Assert.Equal("dash.page.prev", BindingResolver.Resolve("button:5", [], global));
        Assert.Null(BindingResolver.Resolve("button:9", device, global));
    }

    [Fact]
    public void HardwareBindingResolverUsesDeviceBindingAcrossSeparateHidIdentity()
    {
        SavedDevice wheel = new SavedDevice
        {
            Id = "omega",
            Vid = 0xc872,
            Pid = 0x1004,
            Type = "wheel",
            Driver = "vocore",
            Width = 480,
            Height = 800,
            Bindings = [new DeviceBinding { Input = "button:68", Command = "device.command" }],
        };
        InputBinding[] global = new[] { new InputBinding { Input = "button:68", Command = "global.command" } };

        ResolvedHardwareBinding? resolved = HardwareBindingResolver.Resolve(
            new HardwareInputEvent(0x3412, 0x7856, "button:68"),
            [wheel],
            global);

        Assert.Equal(new ResolvedHardwareBinding("device.command", "omega"), resolved);
    }

    [Fact]
    public void RawInputButtonTrackerSupportsHighUsagesAndRisingEdges()
    {
        ButtonEdgeTracker tracker = new ButtonEdgeTracker();

        Assert.Equal([68, 129], tracker.Update([68, 129]));
        Assert.Empty(tracker.Update([68, 129]));
        Assert.Empty(tracker.Update([]));
        Assert.Equal([68], tracker.Update([68]));
    }

    [Theory]
    [InlineData(0x01u, 8, 1)]
    [InlineData(0xffu, 8, -1)]
    [InlineData(0xfeu, 8, -2)]
    public void RawInputEncoderValuesAreSignExtended(uint raw, ushort bits, int expected)
    {
        Assert.Equal(expected, WindowsRawInputSource.SignExtend(raw, bits));
    }

    [WindowsFact]
    public void WindowsRawInputSourceStartsAndStopsMessageLoop()
    {
        WindowsRawInputSource source = new(NullLog.Instance);
        Assert.True(source.IsRunning);

        source.Dispose();
        Assert.False(source.IsRunning);
    }

    [Fact]
    public void CaptureReducerCompletesOnButtonAndBuildsBinding()
    {
        DateTimeOffset now = DateTimeOffset.UnixEpoch;
        InputCaptureState state = InputCaptureReducer.Start("dash.target.set", now);
        Assert.True(state.IsListening);

        state = InputCaptureReducer.Capture(state, "key:F1");
        Assert.Equal(InputCapturePhase.Captured, state.Phase);

        InputBinding? binding = InputCaptureReducer.ToBinding(state);
        Assert.NotNull(binding);
        Assert.Equal("key:F1", binding!.Input);
        Assert.Equal("dash.target.set", binding.Command);
    }

    [Fact]
    public void CaptureReducerIsSingleFlightAndTimesOut()
    {
        DateTimeOffset now = DateTimeOffset.UnixEpoch;
        InputCaptureState listening = InputCaptureReducer.Start("dash.target.set", now);

        // Single-flight: a second capture attempt after completion is ignored.
        InputCaptureState captured = InputCaptureReducer.Capture(listening, "key:A");
        InputCaptureState again = InputCaptureReducer.Capture(captured, "key:B");
        Assert.Equal("key:A", again.CapturedInput);

        // Timeout only fires while still listening.
        InputCaptureState timedOut = InputCaptureReducer.Tick(listening, now.AddSeconds(6), TimeSpan.FromSeconds(5));
        Assert.Equal(InputCapturePhase.TimedOut, timedOut.Phase);
        Assert.Null(InputCaptureReducer.ToBinding(timedOut));
    }

    [Fact]
    public void RuntimePersistsControlsAcrossReload()
    {
        string dataRoot = TestEnv.NewTempDataRoot();
        try
        {
            DesktopRuntime runtime = new DesktopRuntime(dataRoot, TestEnv.PresetRoot);
            runtime.Controls.Bindings.Add(new InputBinding { Input = "key:F2", Command = "dash.target.set" });
            runtime.SaveControls();

            DesktopRuntime reloaded = new DesktopRuntime(dataRoot, TestEnv.PresetRoot);
            Assert.Contains(reloaded.Controls.Bindings, binding => binding.Input == "key:F2" && binding.Command == "dash.target.set");
        }
        finally
        {
            Directory.Delete(dataRoot, recursive: true);
        }
    }
}

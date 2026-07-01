using Sprint.Desktop.Features.Input;
using Xunit;

namespace Sprint.Desktop.Tests;

public sealed class InputBindingTests
{
    [Fact]
    public void CommandBusDispatchesRegisteredHandler()
    {
        var bus = new CommandBus();
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
        var bus = new CommandBus();
        SprintCommands.RegisterDefaults(bus);
        bus.ReplaceDynamic([
            new DynamicCommand(new CommandMeta("dash.page.1", "Page 1", "Dashboard", true, true), _ => { }),
        ]);

        var catalog = bus.Catalog();
        Assert.Equal(SprintCommands.DashPageNext, catalog[0].Id);
        Assert.Contains(catalog, meta => meta.Id == "dash.page.1");
    }

    [Fact]
    public void ReplaceDynamicSwapsOutPreviousDynamicSet()
    {
        var bus = new CommandBus();
        bus.ReplaceDynamic([new DynamicCommand(new CommandMeta("a", "A", "c", true, false), _ => { })]);
        bus.ReplaceDynamic([new DynamicCommand(new CommandMeta("b", "B", "c", true, false), _ => { })]);

        var ids = bus.Catalog().Select(meta => meta.Id).ToArray();
        Assert.DoesNotContain("a", ids);
        Assert.Contains("b", ids);
        Assert.False(bus.Dispatch("a"));
    }

    [Fact]
    public void BindingResolverPrefersDeviceLayerOverGlobal()
    {
        var device = new[] { new InputBinding { Input = "button:5", Command = "dash.page.next" } };
        var global = new[] { new InputBinding { Input = "button:5", Command = "dash.page.prev" } };

        Assert.Equal("dash.page.next", BindingResolver.Resolve("button:5", device, global));
        Assert.Equal("dash.page.prev", BindingResolver.Resolve("button:5", [], global));
        Assert.Null(BindingResolver.Resolve("button:9", device, global));
    }

    [Fact]
    public void CaptureReducerCompletesOnButtonAndBuildsBinding()
    {
        var now = DateTimeOffset.UnixEpoch;
        var state = InputCaptureReducer.Start("dash.target.set", now);
        Assert.True(state.IsListening);

        state = InputCaptureReducer.Capture(state, "key:F1");
        Assert.Equal(InputCapturePhase.Captured, state.Phase);

        var binding = InputCaptureReducer.ToBinding(state);
        Assert.NotNull(binding);
        Assert.Equal("key:F1", binding!.Input);
        Assert.Equal("dash.target.set", binding.Command);
    }

    [Fact]
    public void CaptureReducerIsSingleFlightAndTimesOut()
    {
        var now = DateTimeOffset.UnixEpoch;
        var listening = InputCaptureReducer.Start("dash.target.set", now);

        // Single-flight: a second capture attempt after completion is ignored.
        var captured = InputCaptureReducer.Capture(listening, "key:A");
        var again = InputCaptureReducer.Capture(captured, "key:B");
        Assert.Equal("key:A", again.CapturedInput);

        // Timeout only fires while still listening.
        var timedOut = InputCaptureReducer.Tick(listening, now.AddSeconds(6), TimeSpan.FromSeconds(5));
        Assert.Equal(InputCapturePhase.TimedOut, timedOut.Phase);
        Assert.Null(InputCaptureReducer.ToBinding(timedOut));
    }

    [Fact]
    public void ControlsStoreRoundTripsBindings()
    {
        var dataRoot = TestEnv.NewTempDataRoot();
        try
        {
            var store = new InputBindingStore(dataRoot);
            Assert.Empty(store.Load().Bindings);

            var config = new ControlsConfig { Bindings = [new InputBinding { Input = "button:3", Command = "dash.page.next" }] };
            store.Save(config);

            var reloaded = new InputBindingStore(dataRoot).Load();
            var binding = Assert.Single(reloaded.Bindings);
            Assert.Equal("button:3", binding.Input);
            Assert.Equal("dash.page.next", binding.Command);
        }
        finally
        {
            Directory.Delete(dataRoot, recursive: true);
        }
    }

    [Fact]
    public void RuntimePersistsControlsAcrossReload()
    {
        var dataRoot = TestEnv.NewTempDataRoot();
        try
        {
            var runtime = new DesktopRuntime(dataRoot, TestEnv.PresetRoot);
            runtime.Controls.Bindings.Add(new InputBinding { Input = "key:F2", Command = "dash.target.set" });
            runtime.SaveControls();

            var reloaded = new DesktopRuntime(dataRoot, TestEnv.PresetRoot);
            Assert.Contains(reloaded.Controls.Bindings, binding => binding.Input == "key:F2" && binding.Command == "dash.target.set");
        }
        finally
        {
            Directory.Delete(dataRoot, recursive: true);
        }
    }
}

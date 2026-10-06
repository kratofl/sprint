using System.Text.Json;
using Sprint.Desktop;
using Sprint.Desktop.Core;
using Sprint.Desktop.Features.Analysis;
using Sprint.Desktop.Features.Dashes;
using Sprint.Desktop.Features.Devices;
using Sprint.Desktop.Features.Diagnostics;
using Sprint.Desktop.Features.SessionPlanning;
using Sprint.Desktop.Runtime;
using Xunit;

namespace Sprint.Desktop.Host.Tests;

/// <summary>
/// Focused tests for <see cref="RuntimeCoordinator"/>: does a command validate its own
/// arguments and return a clear error on bad input, and does a valid command actually
/// reach the runtime and persist. Not a smoke test of every command — one representative
/// case per validation boundary this task added.
/// </summary>
public sealed class RuntimeCoordinatorTests
{
    [Fact]
    public void MissingType_ReturnsError()
    {
        RuntimeCoordinator coordinator = NewCoordinator(out DesktopRuntime runtime, out string dataRoot);
        try
        {
            bool ok = coordinator.Execute(Command("{}"), out string error);
            Assert.False(ok);
            Assert.Equal("command type is required", error);
        }
        finally
        {
            Cleanup(dataRoot);
        }
    }

    [Fact]
    public void UnknownCommandType_ReturnsError()
    {
        RuntimeCoordinator coordinator = NewCoordinator(out DesktopRuntime runtime, out string dataRoot);
        try
        {
            bool ok = coordinator.Execute(Command("""{"type":"nonsense.command"}"""), out string error);
            Assert.False(ok);
            Assert.Contains("unknown command type", error);
        }
        finally
        {
            Cleanup(dataRoot);
        }
    }

    [Fact]
    public void SettingsUpdate_AppliesPatchAndPersistsAcrossReload()
    {
        RuntimeCoordinator coordinator = NewCoordinator(out DesktopRuntime runtime, out string dataRoot);
        try
        {
            bool ok = coordinator.Execute(
                Command("""{"type":"settings.update","driverName":"Ada Lovelace","sidebarCollapsed":true}"""),
                out string error);

            Assert.True(ok, error);
            Assert.Equal("Ada Lovelace", runtime.Settings.DriverName);
            Assert.True(runtime.Settings.SidebarCollapsed);

            DesktopRuntime reloaded = new(dataRoot, PresetRoot);
            Assert.Equal("Ada Lovelace", reloaded.Settings.DriverName);
            Assert.True(reloaded.Settings.SidebarCollapsed);
        }
        finally
        {
            Cleanup(dataRoot);
        }
    }

    [Fact]
    public void CloudConfigure_RecordsTheFirstRunAnswerAndPersistsIt()
    {
        RuntimeCoordinator coordinator = NewCoordinator(out DesktopRuntime runtime, out string dataRoot);
        try
        {
            Assert.False(runtime.Settings.Cloud.SetupDone);

            bool ok = coordinator.Execute(Command("""{"type":"cloud.configure","server":"SelfHosted","storage":"Both"}"""), out string error);

            Assert.True(ok, error);
            DesktopRuntime reloaded = new(dataRoot, PresetRoot);
            Assert.True(reloaded.Settings.Cloud.SetupDone);
            Assert.Equal(CloudServerChoice.SelfHosted, reloaded.Settings.Cloud.Server);
            Assert.Equal(CloudStorageMode.Both, reloaded.Settings.Cloud.Storage);
        }
        finally
        {
            Cleanup(dataRoot);
        }
    }

    [Fact]
    public void CloudConfigure_RejectsAnUnknownStorageMode()
    {
        RuntimeCoordinator coordinator = NewCoordinator(out DesktopRuntime runtime, out string dataRoot);
        try
        {
            bool ok = coordinator.Execute(Command("""{"type":"cloud.configure","storage":"Everywhere"}"""), out string error);

            Assert.False(ok);
            Assert.Contains("storage", error);
            Assert.False(runtime.Settings.Cloud.SetupDone);
        }
        finally
        {
            Cleanup(dataRoot);
        }
    }

    [Fact]
    public void SettingsUpdate_NoRecognizedFields_ReturnsError()
    {
        RuntimeCoordinator coordinator = NewCoordinator(out DesktopRuntime runtime, out string dataRoot);
        try
        {
            bool ok = coordinator.Execute(Command("""{"type":"settings.update","unknownField":123}"""), out string error);
            Assert.False(ok);
            Assert.Equal("no recognized settings fields were provided", error);
        }
        finally
        {
            Cleanup(dataRoot);
        }
    }

    [Fact]
    public void ControlsUpdate_RejectsBindingMissingCommand()
    {
        RuntimeCoordinator coordinator = NewCoordinator(out DesktopRuntime runtime, out string dataRoot);
        try
        {
            bool ok = coordinator.Execute(
                Command("""{"type":"controls.update","bindings":[{"input":"button:1"}]}"""),
                out string error);

            Assert.False(ok);
            Assert.Empty(runtime.Controls.Bindings);
        }
        finally
        {
            Cleanup(dataRoot);
        }
    }

    [Fact]
    public void ControlsUpdate_ReplacesBindingsAndPersists()
    {
        RuntimeCoordinator coordinator = NewCoordinator(out DesktopRuntime runtime, out string dataRoot);
        try
        {
            bool ok = coordinator.Execute(
                Command("""{"type":"controls.update","bindings":[{"input":"button:1","command":"push-to-talk"}]}"""),
                out string error);

            Assert.True(ok, error);
            Sprint.Desktop.Features.Input.InputBinding binding = Assert.Single(runtime.Controls.Bindings);
            Assert.Equal("button:1", binding.Input);
            Assert.Equal("push-to-talk", binding.Command);
        }
        finally
        {
            Cleanup(dataRoot);
        }
    }

    [Fact]
    public void DevicesAdd_UnknownCatalogId_ReturnsError()
    {
        RuntimeCoordinator coordinator = NewCoordinator(out DesktopRuntime runtime, out string dataRoot);
        try
        {
            bool ok = coordinator.Execute(Command("""{"type":"devices.add","catalogId":"does-not-exist"}"""), out string error);
            Assert.False(ok);
            Assert.Equal("catalog device not found", error);
        }
        finally
        {
            Cleanup(dataRoot);
        }
    }

    [Fact]
    public void DevicesAddThenUpdate_RoundTripsFields()
    {
        RuntimeCoordinator coordinator = NewCoordinator(out DesktopRuntime runtime, out string dataRoot);
        try
        {
            Assert.True(coordinator.Execute(Command("""{"type":"devices.add","catalogId":"generic-vocore"}"""), out string addError), addError);
            SavedDevice device = Assert.Single(runtime.Devices);

            bool ok = coordinator.Execute(
                Command($$"""
                {"type":"devices.update","deviceId":"{{device.Id}}","name":"Mirror","rotation":90,"offsetX":3,"offsetY":4,"margin":2,"dashId":"default"}
                """),
                out string error);

            Assert.True(ok, error);
            Assert.Equal("Mirror", device.Name);
            Assert.Equal(DeviceOrientation.Landscape, device.Orientation);
            Assert.Equal(3, device.OffsetX);
            Assert.Equal(4, device.OffsetY);
        }
        finally
        {
            Cleanup(dataRoot);
        }
    }

    [Fact]
    public void DevicesUpdate_RotationChangeReorientsTheStoredCaptureRegion()
    {
        RuntimeCoordinator coordinator = NewCoordinator(out DesktopRuntime runtime, out string dataRoot);
        try
        {
            Assert.True(coordinator.Execute(Command("""{"type":"devices.add","catalogId":"generic-vocore"}"""), out _));
            SavedDevice device = Assert.Single(runtime.Devices);
            Assert.Equal(DeviceOrientation.Portrait, device.Orientation);

            Assert.True(
                coordinator.Execute(
                    Command($$"""{"type":"devices.captureRegion","deviceId":"{{device.Id}}","x":10,"y":20,"width":200,"height":100}"""),
                    out string captureError),
                captureError);

            // Portrait -> Landscape flips which axis is "wide", so the saved capture region -- a
            // rectangle in the panel's own axes -- has to swap with it or it keeps describing the
            // wrong shape (mirrors the deleted Avalonia client's MainWindow.SetDeviceRotation).
            bool ok = coordinator.Execute(
                Command($$"""
                {"type":"devices.update","deviceId":"{{device.Id}}","name":"{{device.Name}}","rotation":90,"offsetX":0,"offsetY":0,"margin":0,"dashId":"default"}
                """),
                out string error);

            Assert.True(ok, error);
            Assert.Equal(DeviceOrientation.Landscape, device.Orientation);
            Assert.NotNull(device.CaptureRegion);
            Assert.Equal(100, device.CaptureRegion!.Width);
            Assert.Equal(200, device.CaptureRegion!.Height);

            DesktopRuntime reloaded = new(dataRoot, PresetRoot);
            SavedDevice reloadedDevice = reloaded.Devices.Single();
            Assert.Equal(100, reloadedDevice.CaptureRegion!.Width);
            Assert.Equal(200, reloadedDevice.CaptureRegion!.Height);
        }
        finally
        {
            Cleanup(dataRoot);
        }
    }

    [Fact]
    public void DevicesUpdate_RotationChangeWithoutACaptureRegionLeavesItUnset()
    {
        RuntimeCoordinator coordinator = NewCoordinator(out DesktopRuntime runtime, out string dataRoot);
        try
        {
            Assert.True(coordinator.Execute(Command("""{"type":"devices.add","catalogId":"generic-vocore"}"""), out _));
            SavedDevice device = Assert.Single(runtime.Devices);

            bool ok = coordinator.Execute(
                Command($$"""
                {"type":"devices.update","deviceId":"{{device.Id}}","name":"{{device.Name}}","rotation":90,"offsetX":0,"offsetY":0,"margin":0,"dashId":"default"}
                """),
                out string error);

            Assert.True(ok, error);
            Assert.Null(device.CaptureRegion);
        }
        finally
        {
            Cleanup(dataRoot);
        }
    }

    [Fact]
    public void DevicesCaptureRegion_RejectsNonPositiveSize()
    {
        RuntimeCoordinator coordinator = NewCoordinator(out DesktopRuntime runtime, out string dataRoot);
        try
        {
            Assert.True(coordinator.Execute(Command("""{"type":"devices.add","catalogId":"generic-vocore"}"""), out _));
            SavedDevice device = Assert.Single(runtime.Devices);

            bool ok = coordinator.Execute(
                Command($$"""{"type":"devices.captureRegion","deviceId":"{{device.Id}}","x":0,"y":0,"width":0,"height":100}"""),
                out string error);

            Assert.False(ok);
            Assert.Equal("a capture region needs a positive size", error);
            Assert.Null(device.CaptureRegion);
        }
        finally
        {
            Cleanup(dataRoot);
        }
    }

    [Fact]
    public void DevicesSave_TogglesDisabledAndPersists()
    {
        RuntimeCoordinator coordinator = NewCoordinator(out DesktopRuntime runtime, out string dataRoot);
        try
        {
            Assert.True(coordinator.Execute(Command("""{"type":"devices.add","catalogId":"generic-vocore"}"""), out _));
            SavedDevice device = Assert.Single(runtime.Devices);

            bool ok = coordinator.Execute(
                Command($$"""{"type":"devices.save","deviceId":"{{device.Id}}","disabled":true}"""),
                out string error);

            Assert.True(ok, error);
            Assert.True(device.Disabled);

            DesktopRuntime reloaded = new(dataRoot, PresetRoot);
            Assert.True(reloaded.Devices.Single().Disabled);
        }
        finally
        {
            Cleanup(dataRoot);
        }
    }

    [Fact]
    public void DashCreate_UnknownProfile_ReturnsError()
    {
        RuntimeCoordinator coordinator = NewCoordinator(out DesktopRuntime runtime, out string dataRoot);
        try
        {
            bool ok = coordinator.Execute(Command("""{"type":"dash.create","profileId":"does-not-exist"}"""), out string error);
            Assert.False(ok);
            Assert.Equal("unknown screen profile", error);
        }
        finally
        {
            Cleanup(dataRoot);
        }
    }

    [Fact]
    public void DashSave_PinsIdAndDefaultRegardlessOfPayload()
    {
        RuntimeCoordinator coordinator = NewCoordinator(out DesktopRuntime runtime, out string dataRoot);
        try
        {
            DashLayout created = runtime.CreateDashLayout();
            Assert.False(created.IsDefault);

            string maliciousLayout = $$"""
                {"id":"default","default":true,"name":"Hijacked","gridCols":20,"gridRows":12,"pages":[{"id":"main","name":"Main","widgets":[]}]}
                """;

            bool ok = coordinator.Execute(
                Command($$"""{"type":"dash.save","dashId":"{{created.Id}}","layout":{{maliciousLayout}} }"""),
                out string error);

            Assert.True(ok, error);
            DashLayout saved = runtime.DashLayouts.Single(layout => string.Equals(layout.Name, "Hijacked", StringComparison.Ordinal));
            Assert.Equal(created.Id, saved.Id);
            Assert.False(saved.IsDefault);
        }
        finally
        {
            Cleanup(dataRoot);
        }
    }

    [Fact]
    public void DashDelete_RefusesToDeleteTheDefaultDash()
    {
        RuntimeCoordinator coordinator = NewCoordinator(out DesktopRuntime runtime, out string dataRoot);
        try
        {
            DashLayout defaultLayout = runtime.DashLayouts.Single(layout => layout.IsDefault);

            bool ok = coordinator.Execute(Command($$"""{"type":"dash.delete","dashId":"{{defaultLayout.Id}}"}"""), out string error);

            Assert.False(ok);
            Assert.Equal("cannot delete the default dash", error);
            Assert.Contains(runtime.DashLayouts, layout => layout.Id == defaultLayout.Id);
        }
        finally
        {
            Cleanup(dataRoot);
        }
    }

    [Fact]
    public void SetupDuplicateThenSave_RejectsOutOfRangeValue()
    {
        RuntimeCoordinator coordinator = NewCoordinator(out DesktopRuntime runtime, out string dataRoot);
        try
        {
            Assert.True(coordinator.Execute(Command("""{"type":"setup.duplicate","setupId":"setup-baseline"}"""), out string duplicateError), duplicateError);
            string copyId = runtime.SetupPrograms.Single().Id;

            bool ok = coordinator.Execute(
                Command($$"""{"type":"setup.save","setupId":"{{copyId}}","values":{"fuelLoad":9999} }"""),
                out string error);

            Assert.False(ok);
            Assert.Contains("fuelLoad must be between", error);
        }
        finally
        {
            Cleanup(dataRoot);
        }
    }

    [Fact]
    public void EngineerAcknowledge_RequiresSucceededField()
    {
        RuntimeCoordinator coordinator = NewCoordinator(out DesktopRuntime runtime, out string dataRoot);
        try
        {
            bool ok = coordinator.Execute(Command("""{"type":"engineer.acknowledge"}"""), out string error);
            Assert.False(ok);
            Assert.Equal("succeeded is required", error);
        }
        finally
        {
            Cleanup(dataRoot);
        }
    }

    [Fact]
    public void EngineerStage_ClampsValueToControlRange()
    {
        RuntimeCoordinator coordinator = NewCoordinator(out DesktopRuntime runtime, out string dataRoot);
        try
        {
            string key = runtime.EngineerControls.First().Key;
            double max = runtime.EngineerControls.First().Max;

            bool ok = coordinator.Execute(
                Command($$"""{"type":"engineer.stage","key":"{{key}}","value":{{max + 1000}} }"""),
                out string error);

            Assert.True(ok, error);
            Assert.Equal(max, runtime.EngineerControls.First().StagedValue);
        }
        finally
        {
            Cleanup(dataRoot);
        }
    }

    [Fact]
    public void SetupDelete_UnknownId_ReturnsError()
    {
        RuntimeCoordinator coordinator = NewCoordinator(out DesktopRuntime runtime, out string dataRoot);
        try
        {
            bool ok = coordinator.Execute(Command("""{"type":"setup.delete","setupId":"does-not-exist"}"""), out string error);
            Assert.False(ok);
            Assert.Equal("setup not found", error);
        }
        finally
        {
            Cleanup(dataRoot);
        }
    }

    [Fact]
    public void SetupDelete_RemovesDuplicatedSetupAndPersists()
    {
        RuntimeCoordinator coordinator = NewCoordinator(out DesktopRuntime runtime, out string dataRoot);
        try
        {
            Assert.True(coordinator.Execute(Command("""{"type":"setup.duplicate","setupId":"setup-baseline"}"""), out string duplicateError), duplicateError);
            string copyId = runtime.SetupPrograms.Single().Id;

            bool ok = coordinator.Execute(Command($$"""{"type":"setup.delete","setupId":"{{copyId}}"}"""), out string error);

            Assert.True(ok, error);
            Assert.Empty(runtime.SetupPrograms);

            DesktopRuntime reloaded = new(dataRoot, PresetRoot);
            Assert.Empty(reloaded.SetupPrograms);
        }
        finally
        {
            Cleanup(dataRoot);
        }
    }

    [Fact]
    public void SetupDelete_CannotDeleteATemplate()
    {
        RuntimeCoordinator coordinator = NewCoordinator(out DesktopRuntime runtime, out string dataRoot);
        try
        {
            // Templates live in SetupTemplates, never SetupPrograms, so a template id is
            // indistinguishable from an unknown one here — which is exactly the point.
            bool ok = coordinator.Execute(Command("""{"type":"setup.delete","setupId":"setup-baseline"}"""), out string error);
            Assert.False(ok);
            Assert.Equal("setup not found", error);
            Assert.Contains(runtime.SetupTemplates, template => template.Id == "setup-baseline");
        }
        finally
        {
            Cleanup(dataRoot);
        }
    }

    [Fact]
    public void DevicesAddCustom_MissingName_ReturnsError()
    {
        RuntimeCoordinator coordinator = NewCoordinator(out DesktopRuntime runtime, out string dataRoot);
        try
        {
            bool ok = coordinator.Execute(Command("""{"type":"devices.addCustom","hasScreen":false}"""), out string error);
            Assert.False(ok);
            Assert.Empty(runtime.Devices);
        }
        finally
        {
            Cleanup(dataRoot);
        }
    }

    [Fact]
    public void DevicesAddCustom_ScreenWithoutDriver_ReturnsError()
    {
        RuntimeCoordinator coordinator = NewCoordinator(out DesktopRuntime runtime, out string dataRoot);
        try
        {
            bool ok = coordinator.Execute(
                Command("""{"type":"devices.addCustom","name":"My Wheel","hasScreen":true}"""),
                out string error);
            Assert.False(ok);
            Assert.Equal("Choose the screen type for this wheel.", error);
            Assert.Empty(runtime.Devices);
        }
        finally
        {
            Cleanup(dataRoot);
        }
    }

    [Fact]
    public void DevicesAddCustom_ButtonsOnly_AddsDeviceWithNoScreen()
    {
        RuntimeCoordinator coordinator = NewCoordinator(out DesktopRuntime runtime, out string dataRoot);
        try
        {
            bool ok = coordinator.Execute(
                Command("""{"type":"devices.addCustom","name":"My Button Box","hasScreen":false}"""),
                out string error);

            Assert.True(ok, error);
            SavedDevice device = Assert.Single(runtime.Devices);
            Assert.Equal("My Button Box", device.Name);
            Assert.Equal(0, device.Width);
            Assert.Equal(0, device.Height);
        }
        finally
        {
            Cleanup(dataRoot);
        }
    }

    [Fact]
    public void PlanCreate_UnknownMode_ReturnsError()
    {
        RuntimeCoordinator coordinator = NewCoordinator(out DesktopRuntime runtime, out string dataRoot);
        try
        {
            bool ok = coordinator.Execute(Command("""{"type":"plan.create","mode":"sideways"}"""), out string error);
            Assert.False(ok);
            Assert.Contains("unknown plan mode", error);
        }
        finally
        {
            Cleanup(dataRoot);
        }
    }

    [Fact]
    public void PlanCreateThenUpdate_PatchesNameAndPersistsAcrossReload()
    {
        RuntimeCoordinator coordinator = NewCoordinator(out DesktopRuntime runtime, out string dataRoot);
        try
        {
            Assert.True(
                coordinator.Execute(Command("""{"type":"plan.create","game":"LMU","car":"963","track":"Spa"}"""), out string createError),
                createError);

            SessionPlanningProbe probe = SessionPlanningProbe.For(runtime.DataRoot);
            SessionPlan created = Assert.Single(probe.Store.LoadAll());
            Assert.Equal("New Session Plan", created.Name);

            bool ok = coordinator.Execute(
                Command($$"""{"type":"plan.update","planId":"{{created.Id}}","name":"Race day"}"""),
                out string error);

            Assert.True(ok, error);
            SessionPlan updated = Assert.Single(probe.Store.LoadAll());
            Assert.Equal("Race day", updated.Name);
        }
        finally
        {
            Cleanup(dataRoot);
        }
    }

    [Fact]
    public void PlanUpdate_UnknownPlan_ReturnsError()
    {
        RuntimeCoordinator coordinator = NewCoordinator(out DesktopRuntime runtime, out string dataRoot);
        try
        {
            bool ok = coordinator.Execute(Command("""{"type":"plan.update","planId":"does-not-exist","name":"x"}"""), out string error);
            Assert.False(ok);
            Assert.Equal("plan not found", error);
        }
        finally
        {
            Cleanup(dataRoot);
        }
    }

    [Fact]
    public void PlanUpdate_NoRecognizedFields_ReturnsError()
    {
        RuntimeCoordinator coordinator = NewCoordinator(out DesktopRuntime runtime, out string dataRoot);
        try
        {
            Assert.True(coordinator.Execute(Command("""{"type":"plan.create","game":"LMU","car":"963","track":"Spa"}"""), out _));
            SessionPlanningProbe probe = SessionPlanningProbe.For(runtime.DataRoot);
            SessionPlan created = Assert.Single(probe.Store.LoadAll());

            bool ok = coordinator.Execute(Command($$"""{"type":"plan.update","planId":"{{created.Id}}"}"""), out string error);
            Assert.False(ok);
            Assert.Equal("no recognized plan fields were provided", error);
        }
        finally
        {
            Cleanup(dataRoot);
        }
    }

    [Fact]
    public void PlanDelete_RemovesPlan()
    {
        RuntimeCoordinator coordinator = NewCoordinator(out DesktopRuntime runtime, out string dataRoot);
        try
        {
            Assert.True(coordinator.Execute(Command("""{"type":"plan.create","game":"LMU","car":"963","track":"Spa"}"""), out _));
            SessionPlanningProbe probe = SessionPlanningProbe.For(runtime.DataRoot);
            SessionPlan created = Assert.Single(probe.Store.LoadAll());

            bool ok = coordinator.Execute(Command($$"""{"type":"plan.delete","planId":"{{created.Id}}"}"""), out string error);

            Assert.True(ok, error);
            Assert.Empty(probe.Store.LoadAll());
        }
        finally
        {
            Cleanup(dataRoot);
        }
    }

    [Fact]
    public void PlanArm_SecondPlan_ReturnsClearError()
    {
        RuntimeCoordinator coordinator = NewCoordinator(out DesktopRuntime runtime, out string dataRoot);
        try
        {
            Assert.True(coordinator.Execute(Command("""{"type":"plan.create","game":"LMU","car":"963","track":"Spa","name":"First"}"""), out _));
            Assert.True(coordinator.Execute(Command("""{"type":"plan.create","game":"LMU","car":"963","track":"Spa","name":"Second"}"""), out _));

            SessionPlanningProbe probe = SessionPlanningProbe.For(runtime.DataRoot);
            SessionPlan first = probe.Store.LoadAll().Single(plan => plan.Name == "First");
            SessionPlan second = probe.Store.LoadAll().Single(plan => plan.Name == "Second");

            Assert.True(coordinator.Execute(Command($$"""{"type":"plan.arm","planId":"{{first.Id}}"}"""), out string firstError), firstError);

            bool ok = coordinator.Execute(Command($$"""{"type":"plan.arm","planId":"{{second.Id}}"}"""), out string error);

            Assert.False(ok);
            Assert.Contains("already active", error);
        }
        finally
        {
            Cleanup(dataRoot);
        }
    }

    [Fact]
    public void PlanStart_UnknownKind_ReturnsError()
    {
        RuntimeCoordinator coordinator = NewCoordinator(out DesktopRuntime runtime, out string dataRoot);
        try
        {
            Assert.True(coordinator.Execute(Command("""{"type":"plan.create","game":"LMU","car":"963","track":"Spa"}"""), out _));
            SessionPlanningProbe probe = SessionPlanningProbe.For(runtime.DataRoot);
            SessionPlan created = Assert.Single(probe.Store.LoadAll());

            bool ok = coordinator.Execute(Command($$"""{"type":"plan.start","planId":"{{created.Id}}","kind":"endurance"}"""), out string error);
            Assert.False(ok);
            Assert.Contains("unknown segment kind", error);
        }
        finally
        {
            Cleanup(dataRoot);
        }
    }

    [Fact]
    public void AnalysisFilter_NoRecognizedFields_ReturnsError()
    {
        RuntimeCoordinator coordinator = NewCoordinator(out DesktopRuntime runtime, out string dataRoot);
        try
        {
            bool ok = coordinator.Execute(Command("""{"type":"analysis.filter"}"""), out string error);
            Assert.False(ok);
            Assert.Equal("no recognized filter fields were provided", error);
        }
        finally
        {
            Cleanup(dataRoot);
        }
    }

    [Fact]
    public void AnalysisSelectSession_UnknownId_ReturnsError()
    {
        RuntimeCoordinator coordinator = NewCoordinator(out DesktopRuntime runtime, out string dataRoot);
        try
        {
            bool ok = coordinator.Execute(Command("""{"type":"analysis.selectSession","sessionId":"does-not-exist"}"""), out string error);
            Assert.False(ok);
            Assert.Equal("session not found", error);
        }
        finally
        {
            Cleanup(dataRoot);
        }
    }

    [Fact]
    public void AnalysisSelectLap_InvalidRole_ReturnsError()
    {
        RuntimeCoordinator coordinator = NewCoordinator(out DesktopRuntime runtime, out string dataRoot);
        try
        {
            bool ok = coordinator.Execute(Command("""{"type":"analysis.selectLap","role":"tertiary","lapNumber":1}"""), out string error);
            Assert.False(ok);
            Assert.Equal("role must be 'primary' or 'comparison'", error);
        }
        finally
        {
            Cleanup(dataRoot);
        }
    }

    [Fact]
    public void AnalysisSelectPrimaryLap_ResolvesFromOpenSessionAndSurvivesSessionSwitch()
    {
        FakeLapHistoryStore history = new();
        history.Add(FakeLapHistoryStore.Session("session-a", "UnitTestGame", "UnitTestTrack", "UnitTestCar", lapNumber: 1, lapTimeSeconds: 120));
        history.Add(FakeLapHistoryStore.Session("session-b", "UnitTestGame", "UnitTestTrack", "UnitTestCar", lapNumber: 1, lapTimeSeconds: 118));

        AnalysisController analysis = new(new LapCorpusBrowser(history, new FakeLapTraceStore()));
        RuntimeCoordinator coordinator = NewCoordinator(out DesktopRuntime runtime, out string dataRoot, analysis: analysis);
        try
        {
            Assert.True(coordinator.Execute(Command("""{"type":"analysis.selectSession","sessionId":"session-a"}"""), out string selectAError), selectAError);
            Assert.True(coordinator.Execute(Command("""{"type":"analysis.selectLap","role":"primary","lapNumber":1}"""), out string primaryError), primaryError);

            // Cross-session comparison (spec: compare tonight's lap against a different session's
            // best): switching the open session must not clear the already-picked primary lap.
            Assert.True(coordinator.Execute(Command("""{"type":"analysis.selectSession","sessionId":"session-b"}"""), out string selectBError), selectBError);
            Assert.True(coordinator.Execute(Command("""{"type":"analysis.selectLap","role":"comparison","lapNumber":1}"""), out string comparisonError), comparisonError);

            AnalysisState state = analysis.State();
            Assert.NotNull(state.Primary);
            Assert.Equal("session-a", state.Primary!.SessionId);
            Assert.NotNull(state.Comparison);
            Assert.Equal("session-b", state.Comparison!.SessionId);
        }
        finally
        {
            Cleanup(dataRoot);
        }
    }

    [Fact]
    public void DiagnosticsSetLogLevel_UnknownLevel_ReturnsError()
    {
        RuntimeCoordinator coordinator = NewCoordinator(out DesktopRuntime runtime, out string dataRoot);
        try
        {
            bool ok = coordinator.Execute(Command("""{"type":"diagnostics.setLogLevel","level":"verbose"}"""), out string error);
            Assert.False(ok);
            Assert.Contains("unknown log level", error);
        }
        finally
        {
            Cleanup(dataRoot);
        }
    }

    [Fact]
    public void DiagnosticsSetLogLevel_Valid_UpdatesLiveLogStore()
    {
        LiveLogStore diagnosticsLog = new();
        RuntimeCoordinator coordinator = NewCoordinator(out DesktopRuntime runtime, out string dataRoot, diagnosticsLog: diagnosticsLog);
        try
        {
            bool ok = coordinator.Execute(Command("""{"type":"diagnostics.setLogLevel","level":"warn"}"""), out string error);

            Assert.True(ok, error);
            Assert.Equal(LogLevel.Warn, diagnosticsLog.MinimumLevel);
        }
        finally
        {
            Cleanup(dataRoot);
        }
    }

    private static JsonElement Command(string json) => JsonDocument.Parse(json).RootElement;

    private static RuntimeCoordinator NewCoordinator(
        out DesktopRuntime runtime,
        out string dataRoot,
        AnalysisController? analysis = null,
        LiveLogStore? diagnosticsLog = null)
    {
        dataRoot = NewTempDataRoot();
        runtime = new DesktopRuntime(dataRoot, PresetRoot);
        return new RuntimeCoordinator(runtime, planner: null, analysis: analysis, diagnosticsLog: diagnosticsLog);
    }

    private static void Cleanup(string dataRoot)
    {
        if (Directory.Exists(dataRoot))
        {
            Directory.Delete(dataRoot, recursive: true);
        }
    }

    private static string PresetRoot => Path.Combine(RepoRoot, "app", "Sprint.Desktop.Host", "presets");

    private static string NewTempDataRoot()
    {
        string dir = Path.Combine(Path.GetTempPath(), "Sprint.Desktop.Host.Tests", Guid.NewGuid().ToString("N"));
        Directory.CreateDirectory(dir);
        return dir;
    }

    private static string RepoRoot
    {
        get
        {
            for (DirectoryInfo? dir = new(AppContext.BaseDirectory); dir is not null; dir = dir.Parent)
            {
                if (Directory.Exists(Path.Combine(dir.FullName, "app", "Sprint.Desktop.Host", "presets")))
                {
                    return dir.FullName;
                }
            }

            throw new DirectoryNotFoundException("Could not find repository root containing app/Sprint.Desktop.Host/presets.");
        }
    }

    /// <summary>
    /// Reads back what a plan command actually persisted. The coordinator under test builds its
    /// own default <see cref="SessionPlannerService"/> rooted at <c>runtime.DataRoot/session-plans</c>
    /// (see <see cref="RuntimeCoordinator"/>'s constructor) when no planner is supplied — this
    /// points a second, independent store at that same directory, exactly like
    /// <c>Sprint.Desktop.Host</c>'s <c>Program.cs</c> reads <c>plans</c> for <c>/api/state</c>.
    /// </summary>
    private sealed class SessionPlanningProbe
    {
        public required LocalSessionPlanStore Store { get; init; }

        public static SessionPlanningProbe For(string dataRoot) =>
            new() { Store = new LocalSessionPlanStore(Path.Combine(dataRoot, "session-plans")) };
    }

    private sealed class FakeLapHistoryStore : ILapHistoryStore
    {
        private readonly List<LapHistorySession> _sessions = [];

        public void Add(LapHistorySession session) => _sessions.Add(session);

        public IReadOnlyList<LapHistorySession> LoadAll() => _sessions;

        public void Save(LapHistorySession session)
        {
            _sessions.RemoveAll(existing => existing.Id == session.Id);
            _sessions.Add(session);
        }

        public void Delete(string sessionId) => _sessions.RemoveAll(session => session.Id == sessionId);

        public static LapHistorySession Session(string id, string game, string track, string car, int lapNumber, double lapTimeSeconds) => new()
        {
            Id = id,
            Context = new LapHistoryContext { Game = game, TrackCourse = track, CarModel = car },
            Kind = HistorySessionKind.Practice,
            Origin = LapHistoryOrigin.Recorded,
            StartedAt = DateTimeOffset.UtcNow,
            Laps = [new LapHistoryRecord { LapNumber = lapNumber, IsValid = true, LapTimeSeconds = lapTimeSeconds }],
        };
    }

    private sealed class FakeLapTraceStore : ILapTraceStore
    {
        public void Save(string traceId, LapChannelTrace trace)
        {
        }

        public LapChannelTrace? Load(string traceId) => null;

        public void Delete(string traceId)
        {
        }

        public IReadOnlyList<LapTraceInfo> List() => [];
    }
}

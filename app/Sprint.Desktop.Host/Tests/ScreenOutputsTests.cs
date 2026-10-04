using Sprint.Desktop.Features.Dashes;
using Sprint.Desktop.Features.Devices;
using Xunit;

namespace Sprint.Desktop.Host.Tests;

/// <summary>
/// <see cref="ScreenOutputs.Describe"/> builds the <c>screens</c> array Electron uses to decide
/// which offscreen browsers to create. It has to be derived from configured devices, not received
/// frames (see the type's own doc comment for why) — these tests pin the device-selection,
/// layout-fallback, orientation, and idle-page rules that make that derivation correct.
/// </summary>
public sealed class ScreenOutputsTests
{
    [Fact]
    public void Describe_ExcludesDisabledAndNonDashDevices()
    {
        SavedDevice disabled = Device("disabled", dashId: "layout-1", disabled: true);
        SavedDevice notDash = Device("not-dash", dashId: "layout-1", purpose: DevicePurposes.RearViewMirror);
        SavedDevice buttonBox = Device("buttons", dashId: "layout-1", width: 0, height: 0);
        SavedDevice enabled = Device("enabled", dashId: "layout-1");

        IReadOnlyList<ScreenOutputDescription> outputs = ScreenOutputs.Describe(
            [disabled, notDash, buttonBox, enabled],
            [DefaultLayout("layout-1")],
            new FrameStore(),
            telemetryLive: true);

        ScreenOutputDescription only = Assert.Single(outputs);
        Assert.Equal("enabled", only.DeviceId);
    }

    [Fact]
    public void Describe_FallsBackToDefaultLayoutWhenDashIdIsUnknown()
    {
        SavedDevice device = Device("d1", dashId: "does-not-exist");
        DashLayout defaultLayout = DefaultLayout("default-layout");

        ScreenOutputDescription output = Assert.Single(ScreenOutputs.Describe(
            [device],
            [defaultLayout],
            new FrameStore(),
            telemetryLive: true));

        Assert.Same(defaultLayout, output.Layout);
    }

    [Fact]
    public void Describe_ResolvesTheAssignedLayoutWhenItExists()
    {
        SavedDevice device = Device("d1", dashId: "assigned");
        DashLayout assigned = DefaultLayout("assigned", isDefault: false);
        DashLayout fallback = DefaultLayout("default-layout");

        ScreenOutputDescription output = Assert.Single(ScreenOutputs.Describe(
            [device],
            [fallback, assigned],
            new FrameStore(),
            telemetryLive: true));

        Assert.Same(assigned, output.Layout);
    }

    [Fact]
    public void Describe_UsesIdlePageWhenTelemetryIsNotLive()
    {
        SavedDevice device = Device("d1", dashId: "layout-1");
        DashLayout layout = DefaultLayout("layout-1");
        layout.IdlePage = new DashPage { Id = "idle-page", Name = "Idle" };

        ScreenOutputDescription output = Assert.Single(ScreenOutputs.Describe(
            [device],
            [layout],
            new FrameStore(),
            telemetryLive: false));

        Assert.True(output.Idle);
        Assert.Equal("idle-page", output.PageId);
    }

    [Fact]
    public void Describe_UsesMainPageWhenTelemetryIsLive()
    {
        SavedDevice device = Device("d1", dashId: "layout-1");
        DashLayout layout = DefaultLayout("layout-1");
        layout.IdlePage = new DashPage { Id = "idle-page", Name = "Idle" };

        ScreenOutputDescription output = Assert.Single(ScreenOutputs.Describe(
            [device],
            [layout],
            new FrameStore(),
            telemetryLive: true));

        Assert.False(output.Idle);
        Assert.Equal("main-page", output.PageId);
    }

    [Fact]
    public void Describe_TransformsWidthAndHeightForOrientation()
    {
        SavedDevice device = Device("d1", dashId: "layout-1", width: 480, height: 800);
        device.Orientation = DeviceOrientation.Landscape;

        ScreenOutputDescription output = Assert.Single(ScreenOutputs.Describe(
            [device],
            [DefaultLayout("layout-1")],
            new FrameStore(),
            telemetryLive: true));

        Assert.Equal(800, output.Width);
        Assert.Equal(480, output.Height);
    }

    [Fact]
    public void Describe_PerformanceIsNullBeforeAFrameAndPresentAfterOne()
    {
        SavedDevice device = Device("d1", dashId: "layout-1");
        FrameStore frames = new();

        ScreenOutputDescription beforeFrame = Assert.Single(ScreenOutputs.Describe(
            [device],
            [DefaultLayout("layout-1")],
            frames,
            telemetryLive: true));
        Assert.Null(beforeFrame.Performance);

        frames.Publish("d1", 480, 800, sequence: 1, bytes: 10);

        ScreenOutputDescription afterFrame = Assert.Single(ScreenOutputs.Describe(
            [device],
            [DefaultLayout("layout-1")],
            frames,
            telemetryLive: true));
        Assert.NotNull(afterFrame.Performance);
        Assert.Equal(1, afterFrame.Performance!.Sequence);
        Assert.Equal(10, afterFrame.Performance!.Bytes);
    }

    [Fact]
    public void Describe_UsesConfiguredRefreshRate()
    {
        SavedDevice device = Device("d1", dashId: "layout-1");
        device.RefreshHz = 60;

        ScreenOutputDescription output = Assert.Single(ScreenOutputs.Describe(
            [device],
            [DefaultLayout("layout-1")],
            new FrameStore(),
            telemetryLive: true));

        Assert.Equal(60, output.RefreshHz);
    }

    private static SavedDevice Device(
        string id,
        string dashId,
        bool disabled = false,
        string purpose = "",
        int width = 480,
        int height = 800)
    {
        return new SavedDevice
        {
            Id = id,
            Name = id,
            Driver = "vocore",
            Type = "screen",
            Width = width,
            Height = height,
            DashId = dashId,
            Disabled = disabled,
            Purpose = string.IsNullOrEmpty(purpose) ? DevicePurposes.Dash : purpose,
        };
    }

    private static DashLayout DefaultLayout(string id, bool isDefault = true) => new()
    {
        Id = id,
        Name = id,
        IsDefault = isDefault,
        Pages = [new DashPage { Id = "main-page", Name = "Main" }],
    };
}

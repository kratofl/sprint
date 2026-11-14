using Sprint.Desktop.Features.Dashes;
using Sprint.Desktop.Features.Devices;
using Xunit;

namespace Sprint.Desktop.Host.Tests;

/// <summary>
/// <see cref="ScreenOutputs.Describe"/> builds the <c>screens</c> array of <c>/api/state</c>
/// from the configured devices — these tests pin the device-selection,
/// layout-fallback, orientation, and idle-page rules of that derivation.
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
            [Layout("layout-1")],
            telemetryLive: true);

        ScreenOutputDescription only = Assert.Single(outputs);
        Assert.Equal("enabled", only.DeviceId);
    }

    [Fact]
    public void Describe_FallsBackToTheFirstDashByNameWhenDashIdIsUnknown()
    {
        SavedDevice device = Device("d1", dashId: "does-not-exist");
        DashLayout zeta = Layout("zeta-layout", "Zeta");
        DashLayout alpha = Layout("alpha-layout", "Alpha");

        ScreenOutputDescription output = Assert.Single(ScreenOutputs.Describe(
            [device],
            [zeta, alpha],
            telemetryLive: true));

        Assert.Same(alpha, output.Layout);
    }

    [Fact]
    public void Describe_HasNoOutputForADashDeviceWhenThereAreNoDashes()
    {
        Assert.Empty(ScreenOutputs.Describe(
            [Device("d1", dashId: "deleted")],
            [],
            telemetryLive: true));
    }

    [Fact]
    public void Describe_ResolvesTheAssignedLayoutWhenItExists()
    {
        SavedDevice device = Device("d1", dashId: "assigned");
        DashLayout assigned = Layout("assigned");
        DashLayout fallback = Layout("another-layout", "A first by name");

        ScreenOutputDescription output = Assert.Single(ScreenOutputs.Describe(
            [device],
            [fallback, assigned],
            telemetryLive: true));

        Assert.Same(assigned, output.Layout);
    }

    [Fact]
    public void Describe_UsesIdlePageWhenTelemetryIsNotLive()
    {
        SavedDevice device = Device("d1", dashId: "layout-1");
        DashLayout layout = Layout("layout-1");
        layout.IdlePage = new DashPage { Id = "idle-page", Name = "Idle" };

        ScreenOutputDescription output = Assert.Single(ScreenOutputs.Describe(
            [device],
            [layout],
            telemetryLive: false));

        Assert.True(output.Idle);
        Assert.Equal("idle-page", output.PageId);
    }

    [Fact]
    public void Describe_UsesMainPageWhenTelemetryIsLive()
    {
        SavedDevice device = Device("d1", dashId: "layout-1");
        DashLayout layout = Layout("layout-1");
        layout.IdlePage = new DashPage { Id = "idle-page", Name = "Idle" };

        ScreenOutputDescription output = Assert.Single(ScreenOutputs.Describe(
            [device],
            [layout],
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
            [Layout("layout-1")],
            telemetryLive: true));

        Assert.Equal(800, output.Width);
        Assert.Equal(480, output.Height);
    }

    [Fact]
    public void Describe_UsesConfiguredRefreshRate()
    {
        SavedDevice device = Device("d1", dashId: "layout-1");
        device.RefreshHz = 60;

        ScreenOutputDescription output = Assert.Single(ScreenOutputs.Describe(
            [device],
            [Layout("layout-1")],
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

    private static DashLayout Layout(string id, string? name = null) => new()
    {
        Id = id,
        Name = name ?? id,
        Pages = [new DashPage { Id = "main-page", Name = "Main" }],
    };
}

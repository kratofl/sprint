using System.Net;
using System.Net.Sockets;
using System.Text.Json;
using Sprint.Desktop.Api.Telemetry;
using Sprint.Desktop.Core;
using Sprint.Desktop.Features.Dashes;
using Sprint.Desktop.Features.Devices;
using Sprint.Desktop.Features.Diagnostics;
using Sprint.Desktop.Features.Hardware;
using Xunit;

namespace Sprint.Desktop.Host.Tests;

/// <summary>
/// Browser / VR displays end to end through <see cref="ScreenOutputService"/> and a real
/// <see cref="BrowserDisplayServer"/> on a free loopback port: the port is open only while a display
/// exists, only its own pages and feeds answer and only to its own Host, a feed follows the scene
/// and the telemetry, and every failure reaches the device's status.
/// </summary>
public sealed class BrowserDisplayServerTests
{
    private static readonly TimeSpan Timeout = TimeSpan.FromSeconds(10);

    [Fact]
    public async Task ThePortIsOpenOnlyWhileABrowserDisplayIsAddedAndOn()
    {
        await using Fixture fixture = Fixture.Start();
        Assert.False(fixture.Server.Listening);
        Assert.False(await fixture.AcceptsConnectionsAsync());

        SavedDevice display = BrowserDisplay("b1");
        fixture.Reconcile(display);
        await WaitUntilAsync(() => fixture.Server.Listening);
        using HttpResponseMessage page = await fixture.Client.GetAsync("/dash/b1");
        Assert.Equal(HttpStatusCode.OK, page.StatusCode);
        Assert.Contains("/assets/display.js", await page.Content.ReadAsStringAsync(), StringComparison.Ordinal);

        display.Disabled = true;
        fixture.Reconcile(display);
        await WaitUntilAsync(() => !fixture.Server.Listening);
        Assert.False(await fixture.AcceptsConnectionsAsync());
    }

    [Fact]
    public async Task OnlyGetsForItsOwnHostReachTheDisplaysAndNothingElse()
    {
        await using Fixture fixture = Fixture.Start();
        SavedDevice usb = Usb("usb1");
        fixture.Reconcile(BrowserDisplay("b1"), usb);
        await WaitUntilAsync(() => fixture.Server.Listening);

        using HttpRequestMessage rebound = new(HttpMethod.Get, "/dash/b1");
        rebound.Headers.Host = $"attacker.example:{fixture.Port}";
        using HttpResponseMessage refused = await fixture.Client.SendAsync(rebound);
        Assert.Equal(HttpStatusCode.Forbidden, refused.StatusCode);

        using HttpRequestMessage localhost = new(HttpMethod.Get, "/dash/b1");
        localhost.Headers.Host = $"localhost:{fixture.Port}";
        using HttpResponseMessage allowed = await fixture.Client.SendAsync(localhost);
        Assert.Equal(HttpStatusCode.OK, allowed.StatusCode);

        using HttpResponseMessage post = await fixture.Client.PostAsync("/dash/b1", new StringContent(""));
        Assert.Equal(HttpStatusCode.MethodNotAllowed, post.StatusCode);

        using HttpResponseMessage state = await fixture.Client.GetAsync("/api/state");
        Assert.Equal(HttpStatusCode.NotFound, state.StatusCode);
        Assert.False(state.Headers.Contains("Access-Control-Allow-Origin"));

        // A USB screen is no browser display, and an unknown id gets a page that says so.
        using HttpResponseMessage usbPage = await fixture.Client.GetAsync("/dash/usb1");
        Assert.Equal(HttpStatusCode.NotFound, usbPage.StatusCode);
        Assert.Contains("turned off or was removed", await usbPage.Content.ReadAsStringAsync(), StringComparison.Ordinal);
        using HttpResponseMessage usbFeed = await fixture.Client.GetAsync("/dash/usb1/feed");
        Assert.Equal(HttpStatusCode.NotFound, usbFeed.StatusCode);

        using HttpResponseMessage renderer = await fixture.Client.GetAsync("/assets/sprint_dash.wasm");
        Assert.Equal(HttpStatusCode.OK, renderer.StatusCode);
        Assert.Equal("application/wasm", renderer.Content.Headers.ContentType?.MediaType);
        using HttpResponseMessage other = await fixture.Client.GetAsync("/assets/../Sprint.Desktop.Host.dll");
        Assert.Equal(HttpStatusCode.NotFound, other.StatusCode);
    }

    [Fact]
    public async Task AFeedSendsTheSceneThenFramesFollowsThePageAndEndsWhenTurnedOff()
    {
        await using Fixture fixture = Fixture.Start();
        SavedDevice device = BrowserDisplay("b1");
        device.Transparent = true;
        fixture.Reconcile(device);
        await WaitUntilAsync(() => fixture.Server.Listening);
        Assert.Equal(ScreenConnectionState.WaitingForViewer, fixture.Outputs.HardwareFor("b1")!.Status.State);

        await using Feed feed = await fixture.OpenFeedAsync("b1");
        using (JsonDocument scene = await feed.NextAsync())
        {
            JsonElement value = scene.RootElement.GetProperty("scene");
            Assert.Equal(1024, value.GetProperty("width").GetInt32());
            Assert.Equal(576, value.GetProperty("height").GetInt32());
            Assert.True(value.GetProperty("transparent").GetBoolean());
            Assert.Equal("dash", value.GetProperty("layout").GetProperty("id").GetString());
        }

        await WaitUntilAsync(() => fixture.Outputs.HardwareFor("b1") is { Status.State: ScreenConnectionState.Connected, Viewers: 1 });

        fixture.PublishFrame(speed: 123);
        using (JsonDocument frame = await feed.NextAsync())
        {
            Assert.True(frame.RootElement.TryGetProperty("frame", out _));
        }

        fixture.Pages.Move("b1", fixture.Layout, 1);
        fixture.PublishFrame(speed: 124);
        JsonElement paged = await feed.NextWithAsync("scene");
        Assert.Equal("second", paged.GetProperty("pageId").GetString());

        device.Disabled = true;
        fixture.Reconcile(device);
        Assert.True(await feed.EndsAsync(), "The feed should end when the display is turned off.");
        await WaitUntilAsync(() => fixture.Outputs.HardwareFor("b1") is null);
    }

    [Fact]
    public async Task EachDisplayHasItsOwnFeed()
    {
        await using Fixture fixture = Fixture.Start();
        SavedDevice wide = BrowserDisplay("wide");
        SavedDevice tall = BrowserDisplay("tall");
        tall.Width = 600;
        tall.Height = 900;
        tall.Orientation = BrowserDisplays.OrientationFor(600, 900);
        fixture.Reconcile(wide, tall);
        await WaitUntilAsync(() => fixture.Server.Listening);

        await using Feed wideFeed = await fixture.OpenFeedAsync("wide");
        await using Feed tallFeed = await fixture.OpenFeedAsync("tall");
        using JsonDocument wideScene = await wideFeed.NextAsync();
        using JsonDocument tallScene = await tallFeed.NextAsync();
        Assert.Equal(1024, wideScene.RootElement.GetProperty("scene").GetProperty("width").GetInt32());
        Assert.Equal(600, tallScene.RootElement.GetProperty("scene").GetProperty("width").GetInt32());
        Assert.Equal(900, tallScene.RootElement.GetProperty("scene").GetProperty("height").GetInt32());
        Assert.False(tallScene.RootElement.GetProperty("scene").TryGetProperty("transparent", out _));

        fixture.Pages.Move("tall", fixture.Layout, 1);
        fixture.PublishFrame(speed: 50);
        Assert.Equal("second", (await tallFeed.NextWithAsync("scene")).GetProperty("pageId").GetString());
        // The other display gets the frame, and no scene: its page did not change.
        while (true)
        {
            using JsonDocument line = await wideFeed.NextAsync();
            Assert.False(line.RootElement.TryGetProperty("scene", out _), "The other display's scene did not change.");
            if (line.RootElement.GetProperty("frame").GetProperty("car").GetProperty("speedMetersPerSecond").GetSingle() == 50)
            {
                break;
            }
        }
    }

    [Fact]
    public async Task APortAnotherProgramHoldsIsAFaultOnEveryDisplay()
    {
        await using Fixture fixture = Fixture.Start();
        TcpListener squatter = new(IPAddress.Loopback, fixture.Port);
        squatter.Start();
        try
        {
            fixture.Reconcile(BrowserDisplay("b1"), BrowserDisplay("b2"));
            await WaitUntilAsync(() => fixture.Outputs.HardwareFor("b2")?.Status.State == ScreenConnectionState.Faulted);
            ScreenStatus status = fixture.Outputs.HardwareFor("b1")!.Status;
            Assert.Equal(ScreenConnectionState.Faulted, status.State);
            Assert.Contains(fixture.Port.ToString(System.Globalization.CultureInfo.InvariantCulture), status.Detail, StringComparison.Ordinal);
            Assert.False(fixture.Server.Listening);
        }
        finally
        {
            squatter.Stop();
        }
    }

    [Fact]
    public void ABrowserDisplayGetsNoDriverAndNoPublisher()
    {
        int drivers = 0;
        DesktopState telemetry = new();
        BrowserDisplayServer server = new(telemetry, HostJson.Create(), NullLog.Instance, port: FreePort());
        using ScreenOutputService outputs = new(
            driverFactory: (_, _, _) =>
            {
                drivers++;
                return new FakeScreenDriver();
            },
            telemetry: telemetry,
            browserServer: server);

        outputs.Reconcile([BrowserDisplay("b1")], Scenes(TestDash.Layout("dash")));

        Assert.Equal(0, drivers);
        Assert.Empty(outputs.ActiveDeviceIds);
        Assert.NotNull(outputs.HardwareFor("b1"));
    }

    private static SavedDevice BrowserDisplay(string id) => new()
    {
        Id = id,
        Name = id,
        PresetId = "browser-display",
        Driver = BrowserDisplays.Driver,
        Type = "screen",
        Width = 1024,
        Height = 576,
        Orientation = DeviceOrientation.Landscape,
        DashId = "dash",
        Purpose = DevicePurposes.Dash,
    };

    private static SavedDevice Usb(string id) => new()
    {
        Id = id,
        Name = id,
        Driver = "fake",
        Type = "screen",
        Width = 80,
        Height = 48,
        DashId = "dash",
        Purpose = DevicePurposes.Dash,
    };

    private static DashSceneInputs Scenes(params DashLayout[] layouts) =>
        new(layouts, "Driver", "22", DashTargets.None);

    private static int FreePort()
    {
        TcpListener probe = new(IPAddress.Loopback, 0);
        probe.Start();
        int port = ((IPEndPoint)probe.LocalEndpoint).Port;
        probe.Stop();
        return port;
    }

    private static async Task WaitUntilAsync(Func<bool> condition)
    {
        DateTime deadline = DateTime.UtcNow + Timeout;
        while (DateTime.UtcNow < deadline)
        {
            if (condition())
            {
                return;
            }

            await Task.Delay(10);
        }

        Assert.True(condition(), "Condition was not met before the timeout.");
    }

    /// <summary>A server on a free port, the screen outputs feeding it, and a client for it.</summary>
    private sealed class Fixture : IAsyncDisposable
    {
        private readonly CancellationTokenSource _stop = new();
        private readonly Task _run;

        private Fixture()
        {
            this.Port = FreePort();
            this.Server = new BrowserDisplayServer(this.Telemetry, HostJson.Create(), NullLog.Instance, this.Port);
            this.Outputs = new ScreenOutputService(
                driverFactory: (_, _, _) => new FakeScreenDriver(),
                telemetry: this.Telemetry,
                pageCycle: this.Pages,
                browserServer: this.Server);
            this.Client = new HttpClient { BaseAddress = new Uri($"http://127.0.0.1:{this.Port}"), Timeout = Timeout };
            this._run = this.Server.RunAsync(this._stop.Token);
        }

        public int Port { get; }

        public DesktopState Telemetry { get; } = new();

        public DashPageCycle Pages { get; } = new();

        public DashLayout Layout { get; } = TestDash.Layout("dash");

        public BrowserDisplayServer Server { get; }

        public ScreenOutputService Outputs { get; }

        public HttpClient Client { get; }

        public static Fixture Start() => new();

        public void Reconcile(params SavedDevice[] devices) => this.Outputs.Reconcile(devices, Scenes(this.Layout));

        public void PublishFrame(float speed) =>
            this.Telemetry.Publish(new DesktopTelemetryState(new TelemetryFrame { Car = new CarState { SpeedMetersPerSecond = speed } }, TelemetryStatus.Disconnected("test"), 60));

        public async Task<bool> AcceptsConnectionsAsync()
        {
            using TcpClient probe = new();
            try
            {
                await probe.ConnectAsync(IPAddress.Loopback, this.Port);
                return true;
            }
            catch (SocketException)
            {
                return false;
            }
        }

        public async Task<Feed> OpenFeedAsync(string deviceId)
        {
            HttpResponseMessage response = await this.Client.GetAsync($"/dash/{deviceId}/feed", HttpCompletionOption.ResponseHeadersRead);
            Assert.Equal(HttpStatusCode.OK, response.StatusCode);
            Assert.Equal("application/x-ndjson", response.Content.Headers.ContentType?.MediaType);
            return new Feed(response, await response.Content.ReadAsStreamAsync());
        }

        public async ValueTask DisposeAsync()
        {
            this.Outputs.Dispose();
            await this._stop.CancelAsync();
            await this._run;
            this.Client.Dispose();
            this._stop.Dispose();
        }
    }

    /// <summary>One open feed, read a line at a time; the empty keep-alive lines are skipped.</summary>
    private sealed class Feed : IAsyncDisposable
    {
        private readonly HttpResponseMessage _response;
        private readonly StreamReader _reader;

        public Feed(HttpResponseMessage response, Stream body)
        {
            this._response = response;
            this._reader = new StreamReader(body);
        }

        public async Task<JsonDocument> NextAsync()
        {
            string? line = await this.ReadLineAsync();
            Assert.NotNull(line);
            return JsonDocument.Parse(line);
        }

        /// <summary>The next line carrying <paramref name="property"/>, skipping the others.</summary>
        public async Task<JsonElement> NextWithAsync(string property)
        {
            DateTime deadline = DateTime.UtcNow + Timeout;
            while (DateTime.UtcNow < deadline)
            {
                using JsonDocument line = await this.NextAsync();
                if (line.RootElement.TryGetProperty(property, out JsonElement value))
                {
                    return value.Clone();
                }
            }

            throw new TimeoutException($"No {property} line arrived.");
        }

        public async Task<bool> EndsAsync()
        {
            DateTime deadline = DateTime.UtcNow + Timeout;
            while (DateTime.UtcNow < deadline)
            {
                if (await this.ReadLineAsync() is null)
                {
                    return true;
                }
            }

            return false;
        }

        public ValueTask DisposeAsync()
        {
            this._reader.Dispose();
            this._response.Dispose();
            return ValueTask.CompletedTask;
        }

        private async Task<string?> ReadLineAsync()
        {
            using CancellationTokenSource timeout = new(Timeout);
            while (true)
            {
                string? line = await this._reader.ReadLineAsync(timeout.Token);
                if (line is null || line.Length > 0)
                {
                    return line;
                }
            }
        }
    }
}

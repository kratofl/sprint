using System.Buffers;
using System.Net;
using System.Text;
using System.Text.Json;
using Microsoft.AspNetCore.Http.Features;
using Sprint.Desktop.Api.Telemetry;
using Sprint.Desktop.Core;
using Sprint.Desktop.Features.Devices;
using Sprint.Desktop.Features.Diagnostics;
using Sprint.Desktop.Features.Hardware;

namespace Sprint.Desktop.Host;

/// <summary>How a browser display's picture is set up: its resolution and background.</summary>
public sealed record BrowserDisplayLook(int Width, int Height, bool Transparent);

/// <summary>
/// One browser display while it is added and turned on: the same <see cref="DashSceneFeed"/> a
/// wheel's renderer reads (built by <see cref="ScreenOutputService"/>), its look, and how many pages
/// are reading its feed. <see cref="Closed"/> ends every feed of it once it is removed or turned off.
/// </summary>
public sealed class BrowserDisplay
{
    // Never disposed: a feed that arrives after Close still links to its token, which must then
    // read as cancelled rather than throw. It holds no timer, so nothing leaks.
    private readonly CancellationTokenSource _closed = new();
    private BrowserDisplayLook _look;
    private int _viewers;

    public BrowserDisplay(string deviceId, DashSceneFeed scenes, BrowserDisplayLook look)
    {
        this.DeviceId = deviceId;
        this.Scenes = scenes;
        this._look = look;
    }

    public string DeviceId { get; }

    public DashSceneFeed Scenes { get; }

    public BrowserDisplayLook Look
    {
        get => Volatile.Read(ref this._look);
        set => Volatile.Write(ref this._look, value);
    }

    public int Viewers => Volatile.Read(ref this._viewers);

    public CancellationToken Closed => this._closed.Token;

    internal void Close() => this._closed.Cancel();

    internal void ViewerJoined() => Interlocked.Increment(ref this._viewers);

    internal void ViewerLeft() => Interlocked.Decrement(ref this._viewers);
}

/// <summary>
/// Serves browser displays (<see cref="BrowserDisplays"/>) to any browser on this PC: a VR overlay
/// tool's web source, or a plain browser tab. Its own small Kestrel app, apart from the host's main
/// one: no bearer token (a web source cannot send one), so it serves nothing but the displays.
/// <list type="bullet">
/// <item>Opt-in by existence: it listens only while at least one browser display is added and turned
/// on, and closes its port when the last one goes (<see cref="Reconcile"/>).</item>
/// <item>Loopback only: bound to 127.0.0.1 on the fixed <see cref="BrowserDisplays.Port"/>, and it
/// refuses a request whose Host is not 127.0.0.1 or localhost on that port, so a web page cannot
/// reach it through DNS rebinding. It sends no CORS headers, so other origins cannot read it.</item>
/// <item>Read-only: GET only. It answers <c>/dash/{id}</c> (the page), <c>/dash/{id}/feed</c> and
/// <c>/assets/{file}</c> (the page's script and the renderer) and nothing else: no state, no
/// commands, and only the devices that are browser displays themselves.</item>
/// </list>
/// A port it cannot bind (another program holds it) is a fault every display reports with the port
/// number; it tries again every few seconds rather than move to another port, because the address is
/// saved in the other program.
/// </summary>
public sealed class BrowserDisplayServer
{
    /// <summary>How often a port that could not be bound is tried again.</summary>
    public static readonly TimeSpan RetryInterval = TimeSpan.FromSeconds(5);

    /// <summary>An empty line goes out when nothing else did for this long, so a page can tell a
    /// still dash (no telemetry, nothing to send) from a dropped feed.</summary>
    public static readonly TimeSpan KeepAliveInterval = TimeSpan.FromSeconds(1);

    private static readonly byte[] KeepAlive = "\n"u8.ToArray();
    private static readonly byte[] NoScene = "{\"scene\":null}\n"u8.ToArray();

    // The page and what it loads, by the name it asks for; nothing else is served from disk.
    private static readonly Dictionary<string, string> Assets = new(StringComparer.Ordinal)
    {
        ["display.js"] = "text/javascript; charset=utf-8",
        ["dashWasm.js"] = "text/javascript; charset=utf-8",
        ["sprint_dash.wasm"] = "application/wasm",
    };

    private readonly DesktopState _telemetry;
    private readonly JsonSerializerOptions _json;
    private readonly ILog _log;
    private readonly int _port;
    private readonly string _webRoot;
    private readonly SemaphoreSlim _changed = new(0, 1);
    private IReadOnlyDictionary<string, BrowserDisplay> _displays = new Dictionary<string, BrowserDisplay>();
    private FrameLine? _frameLine;
    private WebApplication? _app;
    private CancellationTokenSource? _serving;
    private volatile bool _listening;
    private volatile string? _fault;

    /// <summary>
    /// <paramref name="port"/> and <paramref name="webRoot"/> (the folder holding the page, its script
    /// and the renderer) are for tests; the host uses <see cref="BrowserDisplays.Port"/> and the
    /// <c>browser-display</c> folder its build puts next to it.
    /// </summary>
    public BrowserDisplayServer(DesktopState telemetry, JsonSerializerOptions json, ILog log, int port = BrowserDisplays.Port, string? webRoot = null)
    {
        this._telemetry = telemetry ?? throw new ArgumentNullException(nameof(telemetry));
        this._json = json ?? throw new ArgumentNullException(nameof(json));
        this._log = log ?? throw new ArgumentNullException(nameof(log));
        this._port = port;
        this._webRoot = webRoot ?? Path.Combine(AppContext.BaseDirectory, "browser-display");
    }

    /// <summary>Whether the port is open right now.</summary>
    public bool Listening => this._listening;

    private IReadOnlyDictionary<string, BrowserDisplay> Displays => Volatile.Read(ref this._displays);

    /// <summary>
    /// The displays to serve now. Removed ones are closed, which ends their feeds; the listener starts
    /// or stops on <see cref="RunAsync"/>'s loop. Cheap and safe to call every reconcile tick.
    /// </summary>
    public void Reconcile(IReadOnlyCollection<BrowserDisplay> displays)
    {
        ArgumentNullException.ThrowIfNull(displays);
        IReadOnlyDictionary<string, BrowserDisplay> previous = this.Displays;
        Dictionary<string, BrowserDisplay> next = displays.ToDictionary(display => display.DeviceId, StringComparer.OrdinalIgnoreCase);
        Volatile.Write(ref this._displays, next);
        foreach ((string id, BrowserDisplay display) in previous)
        {
            if (!next.TryGetValue(id, out BrowserDisplay? kept) || !ReferenceEquals(kept, display))
            {
                display.Close();
            }
        }

        if ((previous.Count > 0) != (next.Count > 0))
        {
            this.Signal();
        }
    }

    /// <summary>
    /// A display's status in the screens' own terms: Connected while a page reads its feed (with
    /// how many in <see cref="ScreenOutputHardware.Viewers"/>), WaitingForViewer when none does,
    /// Faulted when the port cannot be served, Connecting until it is open. Null for any other device.
    /// </summary>
    public ScreenOutputHardware? HardwareFor(string deviceId)
    {
        if (!this.Displays.TryGetValue(deviceId, out BrowserDisplay? display))
        {
            return null;
        }

        int viewers = display.Viewers;
        ScreenStatus status = this._fault is { } fault
            ? new ScreenStatus { State = ScreenConnectionState.Faulted, Detail = fault }
            : !this._listening
                ? new ScreenStatus { State = ScreenConnectionState.Connecting }
                : new ScreenStatus { State = viewers > 0 ? ScreenConnectionState.Connected : ScreenConnectionState.WaitingForViewer };
        return new ScreenOutputHardware(status, ScreenPerformanceSnapshot.Empty, viewers);
    }

    /// <summary>
    /// Opens and closes the port as displays come and go, until <paramref name="cancellationToken"/>
    /// is cancelled; then closes it, ending every feed first.
    /// </summary>
    public async Task RunAsync(CancellationToken cancellationToken)
    {
        try
        {
            while (!cancellationToken.IsCancellationRequested)
            {
                bool wanted = this.Displays.Count > 0;
                if (wanted && this._app is null)
                {
                    await this.StartAsync(cancellationToken);
                }
                else if (!wanted && this._app is not null)
                {
                    await this.StopAsync();
                }

                // A port that could not be bound is tried again while a display still wants it.
                TimeSpan wait = this._app is null && this.Displays.Count > 0 ? RetryInterval : Timeout.InfiniteTimeSpan;
                await this._changed.WaitAsync(wait, cancellationToken);
            }
        }
        catch (OperationCanceledException)
        {
            // The host is stopping.
        }
        finally
        {
            await this.StopAsync();
        }
    }

    private void Signal()
    {
        try
        {
            this._changed.Release();
        }
        catch (SemaphoreFullException)
        {
            // Already signalled; the loop looks at the displays once more either way.
        }
    }

    private async Task StartAsync(CancellationToken cancellationToken)
    {
        WebApplicationBuilder builder = WebApplication.CreateEmptyBuilder(new WebApplicationOptions { ContentRootPath = AppContext.BaseDirectory });
        builder.WebHost.UseKestrelCore();
        builder.WebHost.ConfigureKestrel(options =>
        {
            options.AddServerHeader = false;
            options.Listen(IPAddress.Loopback, this._port);
        });
        WebApplication app = builder.Build();
        CancellationTokenSource serving = new();
        app.Run(context => this.HandleAsync(context, serving.Token));

        try
        {
            await app.StartAsync(cancellationToken);
        }
        catch (Exception ex) when (ex is not OperationCanceledException)
        {
            await app.DisposeAsync();
            serving.Dispose();
            string fault = ex is IOException
                ? $"Port {this._port} is in use by another program, so Sprint cannot serve browser displays. Close that program; Sprint tries again every few seconds."
                : $"Sprint could not serve browser displays on port {this._port}: {ex.Message}";
            if (!string.Equals(fault, this._fault, StringComparison.Ordinal))
            {
                this._log.Warn($"Browser displays not served: {fault}", ex);
            }

            this._fault = fault;
            return;
        }

        this._app = app;
        this._serving = serving;
        this._fault = null;
        this._listening = true;
        this._log.Info($"Browser displays served at http://127.0.0.1:{this._port}/dash/<device id>.");
    }

    private async Task StopAsync()
    {
        this._fault = null;
        if (this._app is not { } app)
        {
            return;
        }

        this._listening = false;
        this._app = null;
        // Feeds are held open: end them first, or Kestrel waits for them until its timeout.
        this._serving?.Cancel();
        try
        {
            await app.StopAsync(CancellationToken.None);
        }
        finally
        {
            await app.DisposeAsync();
            this._serving?.Dispose();
            this._serving = null;
            this._log.Info("Browser displays no longer served: none is added and turned on.");
        }
    }

    private async Task HandleAsync(HttpContext context, CancellationToken serving)
    {
        HttpRequest request = context.Request;
        HttpResponse response = context.Response;
        if (!this.IsOwnHost(request.Host))
        {
            await PlainAsync(response, StatusCodes.Status403Forbidden, $"Sprint serves browser displays only as 127.0.0.1:{this._port}.");
            return;
        }

        if (!HttpMethods.IsGet(request.Method))
        {
            response.Headers.Allow = "GET";
            await PlainAsync(response, StatusCodes.Status405MethodNotAllowed, "Browser displays are read-only.");
            return;
        }

        response.Headers.XContentTypeOptions = "nosniff";
        response.Headers["Referrer-Policy"] = "no-referrer";
        response.Headers.CacheControl = "no-store";

        string[] segments = (request.Path.Value ?? "").Split('/', StringSplitOptions.RemoveEmptyEntries);
        switch (segments)
        {
            case ["assets", string name] when Assets.TryGetValue(name, out string? contentType):
                await this.SendFileAsync(response, name, contentType, context.RequestAborted);
                return;
            case ["dash", string id]:
                if (this.Displays.ContainsKey(id))
                {
                    await this.SendFileAsync(response, "index.html", "text/html; charset=utf-8", context.RequestAborted);
                }
                else
                {
                    await NotFoundPageAsync(response);
                }

                return;
            case ["dash", string id, "feed"]:
                if (this.Displays.TryGetValue(id, out BrowserDisplay? display))
                {
                    await this.StreamAsync(context, display, serving);
                }
                else
                {
                    await PlainAsync(response, StatusCodes.Status404NotFound, "This display is turned off or was removed in Sprint.");
                }

                return;
            default:
                response.StatusCode = StatusCodes.Status404NotFound;
                return;
        }
    }

    private bool IsOwnHost(HostString host) =>
        host.HasValue
        && (string.Equals(host.Value, $"127.0.0.1:{this._port}", StringComparison.OrdinalIgnoreCase)
            || string.Equals(host.Value, $"localhost:{this._port}", StringComparison.OrdinalIgnoreCase));

    private async Task SendFileAsync(HttpResponse response, string name, string contentType, CancellationToken cancellationToken)
    {
        string path = Path.Combine(this._webRoot, name);
        if (!File.Exists(path))
        {
            this._log.Warn($"Browser display file missing: {path}. The host's build puts it there.");
            await PlainAsync(response, StatusCodes.Status404NotFound, $"{name} is missing from Sprint's install.");
            return;
        }

        response.ContentType = contentType;
        await response.SendFileAsync(path, cancellationToken);
    }

    /// <summary>
    /// One page's feed, newline-delimited JSON held open: <c>{"scene":…}</c> first and whenever the
    /// scene changes (dash, page, idle, size, background, targets, driver name and number), then
    /// <c>{"frame":…}</c> per new telemetry frame, as the renderer reads it (<see cref="DashFrameJson"/>:
    /// the contract frame without the other cars). A reader that falls behind skips to the newest frame: nothing queues up for it. It ends
    /// when the page goes, the display is removed or turned off, or the listener stops.
    /// </summary>
    private async Task StreamAsync(HttpContext context, BrowserDisplay display, CancellationToken serving)
    {
        using CancellationTokenSource stop = CancellationTokenSource.CreateLinkedTokenSource(context.RequestAborted, display.Closed, serving);
        CancellationToken token = stop.Token;
        HttpResponse response = context.Response;
        response.ContentType = "application/x-ndjson";
        context.Features.Get<IHttpResponseBodyFeature>()?.DisableBuffering();

        ArrayBufferWriter<byte> sceneLine = new(16 * 1024);
        using Utf8JsonWriter sceneWriter = new(sceneLine);
        SceneKey? sentScene = null;
        TelemetryFrame? sentFrame = null;
        DateTime lastWrite = DateTime.UtcNow;

        display.ViewerJoined();
        try
        {
            while (!token.IsCancellationRequested)
            {
                Task published = this._telemetry.NextPublish;
                BrowserDisplayLook look = display.Look;
                SceneKey scene = new(display.Scenes.Content, display.Scenes.Idle, display.Scenes.PageId, look);
                bool wrote = false;
                if (scene != sentScene)
                {
                    sentScene = scene;
                    await response.Body.WriteAsync(this.SceneLine(sceneLine, sceneWriter, scene), token);
                    wrote = true;
                }

                TelemetryFrame frame = this._telemetry.Telemetry.Frame;
                if (scene.Content is not null && !ReferenceEquals(frame, sentFrame))
                {
                    sentFrame = frame;
                    await response.Body.WriteAsync(this.FrameLineFor(frame), token);
                    wrote = true;
                }

                if (!wrote && DateTime.UtcNow - lastWrite >= KeepAliveInterval)
                {
                    await response.Body.WriteAsync(KeepAlive, token);
                    wrote = true;
                }

                if (wrote)
                {
                    lastWrite = DateTime.UtcNow;
                    await response.Body.FlushAsync(token);
                }

                try
                {
                    await published.WaitAsync(KeepAliveInterval, token);
                }
                catch (TimeoutException)
                {
                    // Nothing published: the next pass sends the keep-alive.
                }
            }
        }
        catch (OperationCanceledException)
        {
            // The page went away, the display was removed or turned off, or the listener stopped.
        }
        catch (IOException)
        {
            // The connection broke mid-write.
        }
        finally
        {
            display.ViewerLeft();
        }
    }

    private ReadOnlyMemory<byte> SceneLine(ArrayBufferWriter<byte> buffer, Utf8JsonWriter writer, SceneKey scene)
    {
        if (scene.Content is not { } content)
        {
            return NoScene;
        }

        buffer.ResetWrittenCount();
        writer.Reset(buffer);
        writer.WriteStartObject();
        writer.WritePropertyName("scene");
        content.WriteScene(writer, scene.Look.Width, scene.Look.Height, scene.PageId, scene.Idle, scene.Look.Transparent);
        writer.WriteEndObject();
        writer.Flush();
        buffer.Write("\n"u8);
        return buffer.WrittenMemory;
    }

    // Serialized once per frame however many pages read it.
    private byte[] FrameLineFor(TelemetryFrame frame)
    {
        if (Volatile.Read(ref this._frameLine) is { } cached && ReferenceEquals(cached.Frame, frame))
        {
            return cached.Line;
        }

        ArrayBufferWriter<byte> buffer = new(16 * 1024);
        buffer.Write("{\"frame\":"u8);
        using (Utf8JsonWriter writer = new(buffer))
        {
            DashFrameJson.Write(writer, frame, this._json);
        }

        buffer.Write("}\n"u8);
        byte[] line = buffer.WrittenSpan.ToArray();
        Volatile.Write(ref this._frameLine, new FrameLine(frame, line));
        return line;
    }

    private static async Task PlainAsync(HttpResponse response, int status, string text)
    {
        response.StatusCode = status;
        response.ContentType = "text/plain; charset=utf-8";
        await response.WriteAsync(text);
    }

    private static async Task NotFoundPageAsync(HttpResponse response)
    {
        response.StatusCode = StatusCodes.Status404NotFound;
        response.ContentType = "text/html; charset=utf-8";
        await response.WriteAsync(NotFoundHtml, Encoding.UTF8);
    }

    // Plain words on the page a VR tool shows, rather than a blank square.
    private const string NotFoundHtml = """
        <!doctype html>
        <html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width">
        <title>Sprint display</title>
        <style>html,body{height:100%;margin:0;background:#000;color:#fff;font:600 28px/1.4 system-ui,sans-serif}
        body{display:grid;place-content:center;text-align:center;padding:24px;box-sizing:border-box}
        p{margin:0}p+p{margin-top:8px;font-weight:400;font-size:20px;color:#aaa}</style></head>
        <body><p>This Sprint display is turned off or was removed.</p>
        <p>Turn it on, or add a Browser / VR display, on Sprint's Devices page.</p></body></html>
        """;

    private readonly record struct SceneKey(DashSceneContent? Content, bool Idle, string? PageId, BrowserDisplayLook Look);

    private sealed record FrameLine(TelemetryFrame Frame, byte[] Line);
}

using System.Buffers;
using System.Diagnostics;
using System.Text.Json;
using Sprint.Desktop.Api.Telemetry;
using Sprint.Desktop.Features.Dashes;
using Sprint.Desktop.Features.Devices;
using Sprint.Desktop.Features.Hardware;
using Sprint.Desktop.Features.Input;

namespace Sprint.Desktop.Host;

/// <summary>
/// The slow-changing part of what one wheel screen shows, already serialized with
/// <see cref="HostJson"/>: the dash layout, the settings the renderer reads (driver name and
/// number) and the plan's targets. Built by <see cref="ScreenOutputService"/> on the reconcile
/// loop (under the devices gate, see Program.cs), never on the render thread, and immutable once
/// built: the render thread only ever sees whole instances.
/// </summary>
public sealed record DashSceneContent(byte[] Layout, byte[] Settings, byte[] Targets)
{
    public static DashSceneContent Build(
        DashLayout layout,
        string driverName,
        string driverNumber,
        DashTargets targets,
        JsonSerializerOptions json) =>
        new(
            JsonSerializer.SerializeToUtf8Bytes(layout, json),
            JsonSerializer.SerializeToUtf8Bytes(new { driverName, driverNumber }, json),
            JsonSerializer.SerializeToUtf8Bytes(targets, json));

    /// <summary>Byte-for-byte the same scene, so publishing it again would change nothing.</summary>
    public bool HasSameBytes(DashSceneContent? other) =>
        other is not null
        && this.Layout.AsSpan().SequenceEqual(other.Layout)
        && this.Settings.AsSpan().SequenceEqual(other.Settings)
        && this.Targets.AsSpan().SequenceEqual(other.Targets);

    /// <summary>
    /// The renderer's scene object for this content, as every dash output hands it over: the wheel's
    /// native source and a browser display's feed. <paramref name="width"/> x <paramref name="height"/>
    /// is the logical size the picture is drawn at; <paramref name="transparent"/> is only written
    /// when set, so a wheel's scene stays what it always was.
    /// </summary>
    public void WriteScene(Utf8JsonWriter writer, int width, int height, string? pageId, bool idle, bool transparent)
    {
        writer.WriteStartObject();
        writer.WritePropertyName("layout");
        writer.WriteRawValue(this.Layout, skipInputValidation: true);
        writer.WriteNumber("width", width);
        writer.WriteNumber("height", height);
        if (pageId is not null)
        {
            writer.WriteString("pageId", pageId);
        }

        writer.WriteBoolean("idle", idle);
        writer.WritePropertyName("settings");
        writer.WriteRawValue(this.Settings, skipInputValidation: true);
        writer.WritePropertyName("targets");
        writer.WriteRawValue(this.Targets, skipInputValidation: true);
        if (transparent)
        {
            writer.WriteBoolean("transparent", true);
        }

        writer.WriteEndObject();
    }
}

/// <summary>
/// The slow-changing part of a wheel's multi-position dial as its dash popup reads it: the dial's
/// caption, each position's name and colour in force, and whether the popup is inverted. Built on
/// the reconcile loop like <see cref="DashSceneContent"/>; where the dial stands
/// (<see cref="MultiDialStatus"/>) is read per frame instead.
/// </summary>
public sealed record DashMultiDial(string Caption, IReadOnlyList<MultiDialLabel> Positions, bool InvertPopup)
{
    /// <summary>The device's dial, or null when its preset has none.</summary>
    public static DashMultiDial? Of(SavedDevice device, IEnumerable<CatalogDevice> catalog) =>
        MultiDials.LayoutOf(device, catalog) is { } layout
            ? new DashMultiDial(layout.Label, MultiDials.LabelsOf(layout, device.MultiDial), device.MultiDial?.InvertPopup ?? false)
            : null;

    /// <summary>The same caption, names, colours and inversion, so publishing it again would change nothing.</summary>
    public bool HasSameValues(DashMultiDial? other) =>
        other is not null
        && this.Caption == other.Caption
        && this.InvertPopup == other.InvertPopup
        && this.Positions.SequenceEqual(other.Positions);

    /// <summary>The renderer's dial reading (renderer/src/multi_dial.rs, <c>MultiDialReading</c>): this dial standing at <paramref name="status"/>.</summary>
    public void WriteReading(Utf8JsonWriter writer, MultiDialStatus status)
    {
        writer.WriteStartObject();
        writer.WriteString("caption", this.Caption);
        if (status.Position is int position)
        {
            writer.WriteNumber("position", position);
        }
        else
        {
            writer.WriteNull("position");
        }

        writer.WriteNumber("changes", status.Changes);
        writer.WriteStartArray("positions");
        foreach (MultiDialLabel label in this.Positions)
        {
            writer.WriteStartObject();
            writer.WriteString("label", label.Label);
            writer.WriteString("color", label.Color);
            writer.WriteEndObject();
        }

        writer.WriteEndArray();
        writer.WriteBoolean("invertPopup", this.InvertPopup);
        writer.WriteEndObject();
    }
}

/// <summary>
/// The telemetry frame as every dash output hands it to the renderer (the wheel's native source
/// and a browser display's feed): the contract <see cref="TelemetryFrame"/> serialized with
/// <see cref="HostJson"/>, which is what the renderer reads (packages/dashboard/renderer/src/model.rs).
/// Only <see cref="TelemetryFrame.Field"/> is left out: no dash widget reads the other cars, and
/// they are most of the frame. packages/dashboard/renderer/tests/fixtures/host-frame.json is this
/// method's output for a frame with every field set (HostFrameFixtureTests keeps it current).
/// </summary>
public static class DashFrameJson
{
    public static void Write(Utf8JsonWriter writer, TelemetryFrame frame, JsonSerializerOptions json)
    {
        ArgumentNullException.ThrowIfNull(frame);
        // A shallow copy: one small allocation per new frame, against serializing every car.
        TelemetryFrame drawn = frame.Field is null ? frame : frame with { Field = null };
        JsonSerializer.Serialize(writer, drawn, json);
    }
}

/// <summary>
/// One wheel screen's scene as its render thread reads it: the published
/// <see cref="DashSceneContent"/> (null while the device has no dash at all), plus the inputs
/// that change at driving speed and must reach the wheel within a frame — whether the dash shows
/// its idle page (telemetry not live), the page a wheel button selected and where the wheel's
/// multi-dial stands. Those are read per frame through delegates over thread-safe state (the
/// published telemetry snapshot, <see cref="DashPageCycle"/>, <see cref="MultiDialTracker"/>), so a
/// page change or a dial turn never waits for the reconcile loop. A browser display's feed has no
/// dial.
/// </summary>
public sealed class DashSceneFeed
{
    private readonly Func<bool> _idle;
    private readonly Func<string?> _pageId;
    private readonly Func<MultiDialStatus> _dialStatus;
    private DashSceneContent? _content;
    private DashMultiDial? _dial;

    public DashSceneFeed(Func<bool> idle, Func<string?> pageId, Func<MultiDialStatus>? dialStatus = null)
    {
        this._idle = idle ?? throw new ArgumentNullException(nameof(idle));
        this._pageId = pageId ?? throw new ArgumentNullException(nameof(pageId));
        this._dialStatus = dialStatus ?? (() => MultiDialStatus.Unknown);
    }

    public DashSceneContent? Content => Volatile.Read(ref this._content);

    public bool Idle => this._idle();

    public string? PageId => this._pageId();

    /// <summary>The wheel's multi-dial, or null when it has none.</summary>
    public DashMultiDial? Dial => Volatile.Read(ref this._dial);

    /// <summary>Where the wheel's multi-dial stands right now.</summary>
    public MultiDialStatus DialStatus => this._dialStatus();

    /// <summary>Replaces the dial unless its values are unchanged, so the renderer only takes a new
    /// reading when something the popup shows changed.</summary>
    public void PublishDial(DashMultiDial? dial)
    {
        DashMultiDial? current = this.Dial;
        if (dial is null ? current is null : dial.HasSameValues(current))
        {
            return;
        }

        Volatile.Write(ref this._dial, dial);
    }

    /// <summary>Replaces the content unless it is byte-for-byte unchanged, so the renderer only
    /// takes a new scene when something it draws changed.</summary>
    public void Publish(DashSceneContent? content)
    {
        DashSceneContent? current = this.Content;
        if (content is null ? current is null : content.HasSameBytes(current))
        {
            return;
        }

        Volatile.Write(ref this._content, content);
    }
}

/// <summary>
/// Draws a wheel screen in-process with the Rust dash renderer (<see cref="DashRenderer"/>) and
/// composes the result onto the panel's native RGB565 buffer through an
/// <see cref="Rgb565Composer"/> — the same rotation/margin/offset pipeline desktop capture
/// uses. Runs on its <see cref="ScreenPublisher"/>'s thread, which is the only thread that ever
/// calls the renderer.
/// <para>
/// Renders only when something changed: the telemetry frame (by reference — the engine hands out
/// the same object until a new frame arrives), the scene, the wheel's multi-dial (a turn pops up
/// within a frame, with or without a game), or the last render said the picture depends on time.
/// Otherwise it hands back the last picture, which the publisher then recognises as unchanged and
/// does not resend.
/// </para>
/// <para>
/// Every failure throws, with the renderer's own reason: a library that cannot be loaded (kept for
/// this source's lifetime: it does not appear while the host runs), a scene the renderer rejects
/// (not retried until the scene changes), a frame it cannot draw (retried on the next frame), a dial
/// reading it cannot read (thrown once; the dash then goes on without it until the dial changes).
/// The publisher turns a throw into a Faulted status and the failure pattern on the wheel.
/// </para>
/// </summary>
public sealed class NativeDashFrameSource : IDashFrameSource
{
    private readonly record struct SceneKey(DashSceneContent? Content, bool Idle, string? PageId);

    /// <summary>The dial as last handed to the renderer; the default is no dial, as a new renderer has.</summary>
    private readonly record struct DialKey(DashMultiDial? Dial, MultiDialStatus? Status);

    private readonly Rgb565Composer _composer;
    private readonly DashSceneFeed _scenes;
    private readonly JsonSerializerOptions _json;
    private readonly DeviceOrientationTransform _transform;
    private readonly byte[] _bgra;
    private readonly byte[] _picture;
    private readonly ArrayBufferWriter<byte> _frameJson = new(16 * 1024);
    private readonly ArrayBufferWriter<byte> _sceneJson = new(16 * 1024);
    private readonly ArrayBufferWriter<byte> _dialJson = new(1024);
    private readonly Utf8JsonWriter _frameWriter;
    private readonly Utf8JsonWriter _sceneWriter;
    private readonly Utf8JsonWriter _dialWriter;

    private DashRenderer? _renderer;
    private DashRendererException? _unavailable;
    private SceneKey? _scene;
    private SceneKey? _failedScene;
    private DashRendererException? _sceneFailure;
    private DialKey _dial;
    private TelemetryFrame? _serializedFrame;
    private bool _timeDependent;
    private bool _hasPicture;

    public NativeDashFrameSource(ScreenConfig config, DashSceneFeed scenes, JsonSerializerOptions json)
    {
        ArgumentNullException.ThrowIfNull(config);
        this._scenes = scenes ?? throw new ArgumentNullException(nameof(scenes));
        this._json = json ?? throw new ArgumentNullException(nameof(json));
        this.Width = config.Width;
        this.Height = config.Height;
        this._transform = DeviceOrientations.Transform(this.Width, this.Height, config.Orientation);
        this._composer = new Rgb565Composer(
            this.Width,
            this.Height,
            this._transform,
            config.Margin,
            config.OffsetX,
            config.OffsetY);
        this._bgra = new byte[checked(this._transform.LogicalWidth * this._transform.LogicalHeight * 4)];
        this._picture = new byte[checked(this.Width * this.Height * 2)];
        this._frameWriter = new Utf8JsonWriter(this._frameJson);
        this._sceneWriter = new Utf8JsonWriter(this._sceneJson);
        this._dialWriter = new Utf8JsonWriter(this._dialJson);
    }

    /// <summary>Native screen width in pixels (post-rotation).</summary>
    public int Width { get; }

    /// <summary>Native screen height in pixels (post-rotation).</summary>
    public int Height { get; }

    /// <summary>How many times the renderer drew a picture (tests check what was not redrawn).</summary>
    internal int RenderCount { get; private set; }

    public ScreenFrameTiming Render(TelemetryFrame frame, Span<byte> rgb565)
    {
        ArgumentNullException.ThrowIfNull(frame);
        if (rgb565.Length < this._picture.Length)
        {
            throw new ArgumentException("Destination buffer too small for the native screen.", nameof(rgb565));
        }

        long started = Stopwatch.GetTimestamp();
        SceneKey scene = new(this._scenes.Content, this._scenes.Idle, this._scenes.PageId);
        if (scene.Content is null)
        {
            // No dash to show at all (every dash deleted): a dark screen, not a failure.
            rgb565[..this._picture.Length].Clear();
            this._hasPicture = false;
            return new ScreenFrameTiming(Stopwatch.GetElapsedTime(started), TimeSpan.Zero);
        }

        DashRenderer renderer = this.EnsureRenderer();
        bool sceneChanged = scene != this._scene;
        if (sceneChanged)
        {
            this.ApplyScene(renderer, scene);
        }

        DashMultiDial? dial = this._scenes.Dial;
        DialKey dialKey = new(dial, dial is null ? null : this._scenes.DialStatus);
        bool dialChanged = dialKey != this._dial;
        if (dialChanged)
        {
            this.ApplyDial(renderer, dialKey);
        }

        bool frameChanged = !ReferenceEquals(frame, this._serializedFrame);
        if (!sceneChanged && !frameChanged && !dialChanged && !this._timeDependent && this._hasPicture)
        {
            this._picture.CopyTo(rgb565);
            return new ScreenFrameTiming(Stopwatch.GetElapsedTime(started), TimeSpan.Zero);
        }

        if (frameChanged)
        {
            this.SerializeFrame(frame);
        }

        this._hasPicture = false;
        this._timeDependent = renderer.RenderLive(this._frameJson.WrittenSpan, NowMilliseconds());
        renderer.CopyBgra(this._bgra);
        long rendered = Stopwatch.GetTimestamp();
        this._composer.Compose(this._bgra, this._picture);
        long composed = Stopwatch.GetTimestamp();
        this._hasPicture = true;
        this.RenderCount++;
        this._picture.CopyTo(rgb565);
        return new ScreenFrameTiming(
            Stopwatch.GetElapsedTime(started, rendered),
            Stopwatch.GetElapsedTime(rendered, composed));
    }

    public void Dispose()
    {
        this._renderer?.Dispose();
        this._frameWriter.Dispose();
        this._sceneWriter.Dispose();
        this._dialWriter.Dispose();
    }

    // The renderer's clock is only ever compared with itself (banner and lap-timer hold times).
    private static double NowMilliseconds() =>
        Stopwatch.GetTimestamp() * 1000.0 / Stopwatch.Frequency;

    private DashRenderer EnsureRenderer()
    {
        if (this._renderer is { } renderer)
        {
            return renderer;
        }

        if (this._unavailable is { } unavailable)
        {
            throw unavailable;
        }

        try
        {
            this._renderer = DashRenderer.Create();
            return this._renderer;
        }
        catch (DashRendererException ex)
        {
            this._unavailable = ex;
            throw;
        }
    }

    private void ApplyScene(DashRenderer renderer, SceneKey scene)
    {
        if (scene == this._failedScene && this._sceneFailure is { } known)
        {
            throw known;
        }

        DashSceneContent content = scene.Content ?? throw new InvalidOperationException("A scene needs content.");
        this._sceneJson.ResetWrittenCount();
        this._sceneWriter.Reset(this._sceneJson);
        // The scene's size is the logical size this source composes from, so the picture always
        // fits the pixel transform.
        content.WriteScene(this._sceneWriter, this._transform.LogicalWidth, this._transform.LogicalHeight, scene.PageId, scene.Idle, transparent: false);
        this._sceneWriter.Flush();

        try
        {
            renderer.SetScene(this._sceneJson.WrittenSpan);
        }
        catch (DashRendererException ex)
        {
            this._failedScene = scene;
            this._sceneFailure = ex;
            throw;
        }

        this._scene = scene;
        this._failedScene = null;
        this._sceneFailure = null;
    }

    // Hands the renderer the dial as it stands. A reading the renderer rejects is not retried: the
    // throw shows on the wheel once, then the dash goes on with the last reading it took.
    private void ApplyDial(DashRenderer renderer, DialKey dial)
    {
        this._dial = dial;
        this._dialJson.ResetWrittenCount();
        this._dialWriter.Reset(this._dialJson);
        if (dial is { Dial: { } look, Status: { } status })
        {
            look.WriteReading(this._dialWriter, status);
            this._dialWriter.Flush();
        }

        renderer.SetMultiDial(this._dialJson.WrittenSpan);
    }

    // The frame as the renderer reads it (DashFrameJson), into a buffer reused for every frame.
    private void SerializeFrame(TelemetryFrame frame)
    {
        this._serializedFrame = frame;
        this._frameJson.ResetWrittenCount();
        this._frameWriter.Reset(this._frameJson);
        DashFrameJson.Write(this._frameWriter, frame, this._json);
        this._frameWriter.Flush();
    }
}

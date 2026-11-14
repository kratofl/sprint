using System.Runtime.InteropServices;
using Microsoft.Win32.SafeHandles;

namespace Sprint.Desktop.Host;

/// <summary>
/// The Rust wheel-dash renderer (packages/dashboard/renderer, its C ABI in <c>src/ffi.rs</c>): a
/// scene (layout, size, page, ...) and a telemetry frame in as UTF-8 JSON, premultiplied BGRA out.
/// One instance is one dash output with its live state (alert banners, the lap timer, the
/// multi-dial popup); calls on it must never overlap, so it belongs to the one thread that renders
/// that output.
/// <para>
/// The library ships next to the host executable (the host's build makes it, see
/// Sprint.Desktop.Host.csproj). <see cref="Create"/> is the first call into it and turns a missing
/// or wrong-architecture library into a <see cref="DashRendererException"/> that says so.
/// </para>
/// </summary>
internal sealed class DashRenderer : IDisposable
{
    private readonly DashRendererHandle _handle;

    private DashRenderer(DashRendererHandle handle)
    {
        this._handle = handle;
    }

    /// <summary>The library's file name on this OS, for messages.</summary>
    public static string LibraryFileName =>
        OperatingSystem.IsWindows() ? "sprint_dash.dll"
        : OperatingSystem.IsMacOS() ? "libsprint_dash.dylib"
        : "libsprint_dash.so";

    /// <summary>The picture's size in device pixels; 0 before the first scene.</summary>
    public int Width => (int)DashRendererNative.Width(this._handle);

    public int Height => (int)DashRendererNative.Height(this._handle);

    public static DashRenderer Create()
    {
        DashRendererHandle handle;
        try
        {
            handle = DashRendererNative.New();
        }
        catch (Exception ex) when (ex is DllNotFoundException or BadImageFormatException or EntryPointNotFoundException)
        {
            throw new DashRendererException(
                $"the dash renderer library ({LibraryFileName}) could not be loaded into this " +
                $"{RuntimeInformation.ProcessArchitecture} process: {ex.Message.TrimEnd('.')}. It is built from " +
                "packages/dashboard/renderer by the host's own build (the Rust toolchain is required); " +
                "rebuild the host for this architecture.",
                ex);
        }

        if (handle.IsInvalid)
        {
            handle.Dispose();
            throw new DashRendererException("the dash renderer could not create a renderer (sd_new returned null).");
        }

        return new DashRenderer(handle);
    }

    /// <summary>Sets the scene JSON. Throws with the renderer's own message when it cannot be drawn.</summary>
    public void SetScene(ReadOnlySpan<byte> sceneJson)
    {
        int code = DashRendererNative.SetScene(
            this._handle,
            ref MemoryMarshal.GetReference(sceneJson),
            (nuint)sceneJson.Length);
        this.ThrowOnFailure(code, "scene");
    }

    /// <summary>
    /// Sets the wheel's multi-dial reading JSON (empty: no dial), which <see cref="RenderLive"/>
    /// pops up on a turn. Throws with the renderer's own message when it cannot be read.
    /// </summary>
    public void SetMultiDial(ReadOnlySpan<byte> readingJson)
    {
        int code = DashRendererNative.SetMultiDial(
            this._handle,
            ref MemoryMarshal.GetReference(readingJson),
            (nuint)readingJson.Length);
        this.ThrowOnFailure(code, "multi-dial");
    }

    /// <summary>
    /// Renders a live frame at <paramref name="nowMs"/> (any monotonic clock in milliseconds).
    /// Returns true when the picture depends on time (a banner or the dial popup is up, the lap
    /// timer holds a result): render again even if the frame did not change.
    /// </summary>
    public bool RenderLive(ReadOnlySpan<byte> frameJson, double nowMs)
    {
        int code = DashRendererNative.RenderLive(
            this._handle,
            ref MemoryMarshal.GetReference(frameJson),
            (nuint)frameJson.Length,
            nowMs);
        this.ThrowOnFailure(code, "frame");
        return (code & 1) != 0;
    }

    /// <summary>Copies the last picture as premultiplied BGRA into <paramref name="bgra"/> (Width*Height*4 bytes).</summary>
    public void CopyBgra(Span<byte> bgra)
    {
        int code = DashRendererNative.CopyBgra(
            this._handle,
            ref MemoryMarshal.GetReference(bgra),
            (nuint)bgra.Length);
        this.ThrowOnFailure(code, "picture copy");
    }

    public void Dispose() => this._handle.Dispose();

    private void ThrowOnFailure(int code, string stage)
    {
        if (code >= 0)
        {
            return;
        }

        string reason = code switch
        {
            -1 => "no renderer",
            -2 => "bad input",
            -3 => "renderer panic",
            -4 => "buffer too small",
            -5 => "null pointer",
            _ => $"code {code}",
        };
        throw new DashRendererException($"{stage} rejected ({reason}): {this.LastError()}");
    }

    private string LastError()
    {
        Span<byte> buffer = stackalloc byte[512];
        int length = (int)DashRendererNative.LastError(this._handle, ref MemoryMarshal.GetReference(buffer), (nuint)buffer.Length);
        if (length <= buffer.Length)
        {
            return System.Text.Encoding.UTF8.GetString(buffer[..length]);
        }

        byte[] whole = new byte[length];
        DashRendererNative.LastError(this._handle, ref MemoryMarshal.GetArrayDataReference(whole), (nuint)whole.Length);
        return System.Text.Encoding.UTF8.GetString(whole);
    }
}

/// <summary>The dash renderer could not draw, or could not be loaded at all. The message says which and why.</summary>
public sealed class DashRendererException : Exception
{
    public DashRendererException(string message, Exception? inner = null)
        : base(message, inner)
    {
    }
}

/// <summary>A renderer from <c>sd_new</c>, freed exactly once with <c>sd_free</c>.</summary>
internal sealed class DashRendererHandle : SafeHandleZeroOrMinusOneIsInvalid
{
    public DashRendererHandle()
        : base(ownsHandle: true)
    {
    }

    protected override bool ReleaseHandle()
    {
        DashRendererNative.Free(this.handle);
        return true;
    }
}

/// <summary>
/// The C ABI, as plain <see cref="DllImportAttribute"/> like the rest of the repo's interop
/// (WinUsbInterop). Byte input goes as <c>ref byte</c> to the first element (pinned for the call),
/// lengths as <c>nuint</c> (Rust <c>usize</c>, 32-bit in an x86 host). A null pointer with length 0
/// is how an empty span arrives, which the ABI accepts.
/// </summary>
internal static class DashRendererNative
{
    private const string Library = "sprint_dash";

    [DllImport(Library, EntryPoint = "sd_new", CallingConvention = CallingConvention.Cdecl)]
    public static extern DashRendererHandle New();

    [DllImport(Library, EntryPoint = "sd_free", CallingConvention = CallingConvention.Cdecl)]
    public static extern void Free(nint renderer);

    [DllImport(Library, EntryPoint = "sd_set_scene", CallingConvention = CallingConvention.Cdecl)]
    public static extern int SetScene(DashRendererHandle renderer, ref byte json, nuint length);

    [DllImport(Library, EntryPoint = "sd_set_multi_dial", CallingConvention = CallingConvention.Cdecl)]
    public static extern int SetMultiDial(DashRendererHandle renderer, ref byte json, nuint length);

    [DllImport(Library, EntryPoint = "sd_render_live", CallingConvention = CallingConvention.Cdecl)]
    public static extern int RenderLive(DashRendererHandle renderer, ref byte json, nuint length, double nowMs);

    [DllImport(Library, EntryPoint = "sd_width", CallingConvention = CallingConvention.Cdecl)]
    public static extern uint Width(DashRendererHandle renderer);

    [DllImport(Library, EntryPoint = "sd_height", CallingConvention = CallingConvention.Cdecl)]
    public static extern uint Height(DashRendererHandle renderer);

    [DllImport(Library, EntryPoint = "sd_copy_bgra", CallingConvention = CallingConvention.Cdecl)]
    public static extern int CopyBgra(DashRendererHandle renderer, ref byte output, nuint length);

    [DllImport(Library, EntryPoint = "sd_last_error", CallingConvention = CallingConvention.Cdecl)]
    public static extern nuint LastError(DashRendererHandle renderer, ref byte output, nuint length);
}

namespace Sprint.Desktop.Host;

/// <summary>Body of <c>POST /api/compare/hud/windows</c>: the displays Electron sees, primary first.</summary>
public sealed record HudWindowsRequest(IReadOnlyList<HudDisplay>? Screens);

/// <summary>One display's bounds in device-independent pixels, as Electron reports them.</summary>
public sealed record HudDisplay(int X, int Y, int Width, int Height);

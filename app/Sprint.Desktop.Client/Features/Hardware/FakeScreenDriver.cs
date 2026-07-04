namespace Sprint.Desktop.Features.Hardware;

/// <summary>
/// In-memory <see cref="IScreenDriver"/> for tests (matrix 4.6 "fake adapter for
/// scan/connect/status + frame-output"). Records connect attempts and the last
/// frame sent, and can be scripted to simulate connect failures / permission
/// denial / device-busy so the render loop's retry + failure-status behaviour is
/// verifiable without hardware.
/// </summary>
public sealed class FakeScreenDriver : IScreenDriver
{
    private ScreenStatus _status = ScreenStatus.Disconnected();

    public string Name => "Fake Screen";

    public ScreenStatus Status => _status;

    public ScreenConfig? LastConfig { get; private set; }

    public int ConnectAttempts { get; private set; }

    public int FramesSent { get; private set; }

    public byte[]? LastFrame { get; private set; }

    /// <summary>The state <see cref="Connect"/> transitions to (default Connected). Set to a failure state to script the loop.</summary>
    public ScreenConnectionState ConnectResult { get; set; } = ScreenConnectionState.Connected;

    public string? ConnectDetail { get; set; }

    public void Configure(ScreenConfig config) => LastConfig = config;

    public bool Connect()
    {
        ConnectAttempts++;
        _status = new ScreenStatus { State = ConnectResult, Detail = ConnectDetail };
        return _status.IsConnected;
    }

    public bool TrySendFrame(ReadOnlySpan<byte> rgb565)
    {
        if (!_status.IsConnected)
        {
            return false;
        }

        FramesSent++;
        LastFrame = rgb565.ToArray();
        return true;
    }

    public void Disconnect() => _status = ScreenStatus.Disconnected();

    public void Dispose() => Disconnect();
}

using System.IO;
using System.Security;
using System.Threading;
using Sprint.Desktop.Api.Telemetry;

namespace Sprint.Games.LeMansUltimate;

internal sealed class LeMansUltimateTelemetrySource : ITelemetrySource
{
    private const string SourceName = "Le Mans Ultimate";

    private readonly ILmuSnapshotProvider _provider;
    private readonly LmuTelemetryMapper _mapper;
    private readonly byte[] _buffer = new byte[LmuBinary.TotalBufferSize];

    private TelemetryFrame _current = new();
    private TelemetryStatus _status = TelemetryStatus.Disconnected(SourceName);
    private bool _disposed;

    public LeMansUltimateTelemetrySource()
        : this(new WindowsLmuSharedMemoryProvider())
    {
    }

    internal LeMansUltimateTelemetrySource(ILmuSnapshotProvider provider, LmuTelemetryMapper? mapper = null)
    {
        _provider = provider;
        _mapper = mapper ?? new LmuTelemetryMapper();
    }

    public string Name => SourceName;

    public TelemetryStatus Status => Volatile.Read(ref _status);

    public TelemetryFrame Current => Volatile.Read(ref _current);

    public void Connect()
    {
        ObjectDisposedException.ThrowIf(_disposed, this);

        if (_provider.IsOpen)
        {
            PublishStatus(Status with
            {
                State = TelemetryConnectionState.Connected,
                SourceName = Name
            });
            return;
        }

        PublishStatus(new TelemetryStatus
        {
            State = TelemetryConnectionState.Connecting,
            SourceName = Name,
            Detail = "opening LMU_Data"
        });

        try
        {
            _provider.Open();
            PublishStatus(new TelemetryStatus
            {
                State = TelemetryConnectionState.Connected,
                SourceName = Name
            });
        }
        catch (FileNotFoundException)
        {
            PublishStatus(new TelemetryStatus
            {
                State = TelemetryConnectionState.WaitingForGame,
                SourceName = Name,
                Detail = "LMU_Data shared memory not found"
            });
        }
        catch (UnauthorizedAccessException ex)
        {
            PublishStatus(new TelemetryStatus
            {
                State = TelemetryConnectionState.PermissionDenied,
                SourceName = Name,
                Detail = ex.Message
            });
        }
        catch (SecurityException ex)
        {
            PublishStatus(new TelemetryStatus
            {
                State = TelemetryConnectionState.PermissionDenied,
                SourceName = Name,
                Detail = ex.Message
            });
        }
        catch (PlatformNotSupportedException ex)
        {
            PublishStatus(new TelemetryStatus
            {
                State = TelemetryConnectionState.Unsupported,
                SourceName = Name,
                Detail = ex.Message
            });
        }
        catch (IOException ex)
        {
            PublishStatus(new TelemetryStatus
            {
                State = TelemetryConnectionState.Faulted,
                SourceName = Name,
                Detail = ex.Message
            });
        }
        catch (InvalidOperationException ex)
        {
            PublishStatus(new TelemetryStatus
            {
                State = TelemetryConnectionState.Faulted,
                SourceName = Name,
                Detail = ex.Message
            });
        }
    }

    public void Disconnect()
    {
        if (_disposed)
        {
            return;
        }

        _provider.Close();
        _mapper.Reset();
        PublishStatus(TelemetryStatus.Disconnected(Name));
    }

    public bool TryRead(out TelemetryFrame frame)
    {
        ObjectDisposedException.ThrowIf(_disposed, this);

        if (!_provider.IsOpen)
        {
            frame = Current;
            return false;
        }

        try
        {
            _provider.CopySnapshot(_buffer);
            var parsed = LmuParser.Parse(_buffer);
            var mapped = _mapper.Map(parsed);
            Volatile.Write(ref _current, mapped);
            PublishStatus(new TelemetryStatus
            {
                State = TelemetryConnectionState.Connected,
                SourceName = Name,
                LastFrameAt = mapped.Timestamp,
                LastFrameValid = true,
                InvalidReason = null
            });
            frame = mapped;
            return true;
        }
        catch (LmuDecodeException ex)
        {
            frame = Current;
            PublishStatus(new TelemetryStatus
            {
                State = TelemetryConnectionState.Faulted,
                SourceName = Name,
                Detail = ex.Message,
                LastFrameValid = false,
                InvalidReason = ex.Message
            });
            return false;
        }
        catch (IOException ex)
        {
            _provider.Close();
            frame = Current;
            PublishStatus(new TelemetryStatus
            {
                State = TelemetryConnectionState.Faulted,
                SourceName = Name,
                Detail = ex.Message
            });
            return false;
        }
        catch (InvalidOperationException ex)
        {
            _provider.Close();
            frame = Current;
            PublishStatus(new TelemetryStatus
            {
                State = TelemetryConnectionState.Faulted,
                SourceName = Name,
                Detail = ex.Message
            });
            return false;
        }
    }

    public void Dispose()
    {
        if (_disposed)
        {
            return;
        }

        _disposed = true;
        _provider.Dispose();
        _mapper.Reset();
        PublishStatus(TelemetryStatus.Disconnected(Name));
    }

    private void PublishStatus(TelemetryStatus status) => Volatile.Write(ref _status, status);
}

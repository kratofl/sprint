using System.IO;
using System.Security;
using System.Threading;
using Sprint.Desktop.Api.Telemetry;

namespace Sprint.Games.LeMansUltimate;

internal sealed class LeMansUltimateTelemetrySource : ITelemetrySource
{
    private const string SourceName = "Le Mans Ultimate";

    /// <summary>
    /// A closed game leaves LMU_Data behind for as long as anyone holds a handle on it — this
    /// source included — so a buffer that stops changing is the only sign the game is gone. An
    /// unchanged read is no new frame (<see cref="TelemetryFreshness"/> then reports the link
    /// Stale); unchanged for this long, the game has stopped writing — closed, or sat in its
    /// menus — and the source lets go and waits for it again.
    /// </summary>
    internal static readonly TimeSpan StoppedWritingAfter = TimeSpan.FromSeconds(10);

    private readonly ILmuSnapshotProvider _provider;
    private readonly LmuTelemetryMapper _mapper;
    private readonly Func<DateTimeOffset> _clock;
    private readonly byte[] _buffer = new byte[LmuBinary.TotalBufferSize];
    private readonly byte[] _lastRead = new byte[LmuBinary.TotalBufferSize];
    private bool _hasLastRead;
    private DateTimeOffset _lastChangeAt;

    private TelemetryFrame _current = new();
    private TelemetryStatus _status = TelemetryStatus.Disconnected(SourceName);
    private bool _disposed;

    public LeMansUltimateTelemetrySource()
        : this(new WindowsLmuSharedMemoryProvider())
    {
    }

    internal LeMansUltimateTelemetrySource(ILmuSnapshotProvider provider, LmuTelemetryMapper? mapper = null, Func<DateTimeOffset>? clock = null)
    {
        this._provider = provider;
        this._mapper = mapper ?? new LmuTelemetryMapper();
        this._clock = clock ?? (() => DateTimeOffset.UtcNow);
    }

    public string Name => SourceName;

    public TelemetryStatus Status => Volatile.Read(ref _status);

    public TelemetryFrame Current => Volatile.Read(ref _current);

    public void Connect()
    {
        ObjectDisposedException.ThrowIf(this._disposed, this);

        bool wasOpen = this._provider.IsOpen;
        if (!wasOpen)
        {
            this.PublishStatus(new TelemetryStatus
            {
                State = TelemetryConnectionState.Connecting,
                SourceName = this.Name,
                Detail = "opening LMU_Data"
            });

            if (!this.TryOpen())
            {
                return;
            }
        }

        // The mapping outlives the game while any handle holds it, so opening it proves nothing.
        if (this.HasStoppedWriting())
        {
            this.StopReading();
            return;
        }

        this.PublishStatus(wasOpen
            ? this.Status with { State = TelemetryConnectionState.Connected, SourceName = this.Name }
            : new TelemetryStatus { State = TelemetryConnectionState.Connected, SourceName = this.Name });
    }

    /// <summary>Opens LMU_Data, or publishes why it could not be opened.</summary>
    private bool TryOpen()
    {
        try
        {
            this._provider.Open();
            return true;
        }
        catch (FileNotFoundException)
        {
            this.PublishStatus(new TelemetryStatus
            {
                State = TelemetryConnectionState.WaitingForGame,
                SourceName = this.Name,
                Detail = "LMU_Data shared memory not found"
            });
        }
        catch (UnauthorizedAccessException ex)
        {
            this.PublishStatus(new TelemetryStatus
            {
                State = TelemetryConnectionState.PermissionDenied,
                SourceName = this.Name,
                Detail = ex.Message
            });
        }
        catch (SecurityException ex)
        {
            this.PublishStatus(new TelemetryStatus
            {
                State = TelemetryConnectionState.PermissionDenied,
                SourceName = this.Name,
                Detail = ex.Message
            });
        }
        catch (PlatformNotSupportedException ex)
        {
            this.PublishStatus(new TelemetryStatus
            {
                State = TelemetryConnectionState.Unsupported,
                SourceName = this.Name,
                Detail = ex.Message
            });
        }
        catch (IOException ex)
        {
            this.PublishStatus(new TelemetryStatus
            {
                State = TelemetryConnectionState.Faulted,
                SourceName = this.Name,
                Detail = ex.Message
            });
        }
        catch (InvalidOperationException ex)
        {
            this.PublishStatus(new TelemetryStatus
            {
                State = TelemetryConnectionState.Faulted,
                SourceName = this.Name,
                Detail = ex.Message
            });
        }

        return false;
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
        ObjectDisposedException.ThrowIf(this._disposed, this);

        if (!this._provider.IsOpen)
        {
            frame = this.Current;
            return false;
        }

        try
        {
            this._provider.CopySnapshot(this._buffer);
            DateTimeOffset now = this._clock();
            if (this.IsUnchanged())
            {
                // Nothing written since the last frame: no new frame, and LastFrameAt stays put.
                frame = this.Current;
                if (now - this._lastChangeAt >= StoppedWritingAfter)
                {
                    this.StopReading();
                }

                return false;
            }

            LmuParsedFrame parsed = LmuParser.Parse(this._buffer);
            TelemetryFrame mapped = this._mapper.Map(parsed);
            // Remembered only once it decodes, so a bad buffer keeps reporting its fault.
            this._buffer.CopyTo(this._lastRead);
            this._hasLastRead = true;
            this._lastChangeAt = now;
            Volatile.Write(ref this._current, mapped);
            this.PublishStatus(new TelemetryStatus
            {
                State = TelemetryConnectionState.Connected,
                SourceName = this.Name,
                LastFrameAt = mapped.Timestamp,
                LastFrameValid = true,
                InvalidReason = null
            });
            frame = mapped;
            return true;
        }
        catch (LmuDecodeException ex)
        {
            frame = this.Current;
            this.PublishStatus(new TelemetryStatus
            {
                State = TelemetryConnectionState.Faulted,
                SourceName = this.Name,
                Detail = ex.Message,
                LastFrameValid = false,
                InvalidReason = ex.Message
            });
            return false;
        }
        catch (IOException ex)
        {
            this._provider.Close();
            frame = this.Current;
            this.PublishStatus(new TelemetryStatus
            {
                State = TelemetryConnectionState.Faulted,
                SourceName = this.Name,
                Detail = ex.Message
            });
            return false;
        }
        catch (InvalidOperationException ex)
        {
            this._provider.Close();
            frame = this.Current;
            this.PublishStatus(new TelemetryStatus
            {
                State = TelemetryConnectionState.Faulted,
                SourceName = this.Name,
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

    private bool IsUnchanged() => this._hasLastRead && this._buffer.AsSpan().SequenceEqual(this._lastRead);

    /// <summary>
    /// Reads the buffer once: true when it is still the last frame and has been for
    /// <see cref="StoppedWritingAfter"/>. A read that fails says nothing; TryRead reports it.
    /// </summary>
    private bool HasStoppedWriting()
    {
        try
        {
            this._provider.CopySnapshot(this._buffer);
        }
        catch (Exception ex) when (ex is IOException or InvalidOperationException)
        {
            return false;
        }

        return this.IsUnchanged() && this._clock() - this._lastChangeAt >= StoppedWritingAfter;
    }

    /// <summary>The game stopped writing: let go of LMU_Data (so a closed game takes its mapping
    /// with it) and wait for the game, as when it was never found.</summary>
    private void StopReading()
    {
        this._provider.Close();
        this.PublishStatus(new TelemetryStatus
        {
            State = TelemetryConnectionState.WaitingForGame,
            SourceName = this.Name,
            Detail = $"LMU_Data has not changed for {StoppedWritingAfter.TotalSeconds:0} s: the game is closed or in its menus"
        });
    }

    private void PublishStatus(TelemetryStatus status) => Volatile.Write(ref this._status, status);
}

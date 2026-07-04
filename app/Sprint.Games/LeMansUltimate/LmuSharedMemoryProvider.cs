using System.Buffers;
using System.IO.MemoryMappedFiles;

namespace Sprint.Games.LeMansUltimate;

internal interface ILmuSnapshotProvider : IDisposable
{
    bool IsOpen { get; }
    void Open();
    void Close();
    void CopySnapshot(Span<byte> destination);
}

internal sealed class WindowsLmuSharedMemoryProvider : ILmuSnapshotProvider
{
    private MemoryMappedFile? _file;
    private MemoryMappedViewAccessor? _accessor;

    public bool IsOpen => _accessor is not null;

    public void Open()
    {
        if (IsOpen)
        {
            return;
        }

        if (!OperatingSystem.IsWindows())
        {
            throw new PlatformNotSupportedException("The LMU_Data shared-memory provider is only supported on Windows.");
        }

        try
        {
            _file = MemoryMappedFile.OpenExisting(
                LeMansUltimateGameData.SharedMemoryName,
                MemoryMappedFileRights.Read);
            _accessor = _file.CreateViewAccessor(
                0,
                LmuBinary.TotalBufferSize,
                MemoryMappedFileAccess.Read);
        }
        catch
        {
            Close();
            throw;
        }
    }

    public void Close()
    {
        _accessor?.Dispose();
        _accessor = null;
        _file?.Dispose();
        _file = null;
    }

    public void CopySnapshot(Span<byte> destination)
    {
        if (_accessor is null)
        {
            throw new InvalidOperationException("LMU shared memory provider is not open.");
        }

        if (destination.Length < LmuBinary.TotalBufferSize)
        {
            throw new ArgumentException("Destination must fit a complete LMU shared memory snapshot.", nameof(destination));
        }

        var rented = ArrayPool<byte>.Shared.Rent(LmuBinary.TotalBufferSize);
        try
        {
            _accessor.ReadArray(0, rented, 0, LmuBinary.TotalBufferSize);
            rented.AsSpan(0, LmuBinary.TotalBufferSize).CopyTo(destination);
        }
        finally
        {
            ArrayPool<byte>.Shared.Return(rented);
        }
    }

    public void Dispose() => Close();
}

internal sealed class InMemoryLmuSnapshotProvider : ILmuSnapshotProvider
{
    private readonly byte[] _snapshot;

    public InMemoryLmuSnapshotProvider(byte[] snapshot)
    {
        ArgumentNullException.ThrowIfNull(snapshot);

        if (snapshot.Length != LmuBinary.TotalBufferSize)
        {
            throw new ArgumentException("Snapshot must be exactly the LMU shared memory size.", nameof(snapshot));
        }

        _snapshot = snapshot;
    }

    public bool IsOpen { get; private set; }

    public void Open() => IsOpen = true;

    public void Close() => IsOpen = false;

    public void CopySnapshot(Span<byte> destination)
    {
        if (!IsOpen)
        {
            throw new InvalidOperationException("LMU snapshot provider is not open.");
        }

        _snapshot.CopyTo(destination);
    }

    public void Dispose() => Close();
}

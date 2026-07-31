using System.Diagnostics;

namespace Sprint.Desktop.Features.Hardware;

internal readonly record struct ScreenTransferResult(
    bool Succeeded,
    long StartedAt,
    long CompletedAt,
    Exception? Error = null)
{
    public TimeSpan Elapsed => Stopwatch.GetElapsedTime(StartedAt, CompletedAt);
}

/// <summary>
/// Owns one long-lived transfer thread so the publisher can prepare the next
/// frame while the driver performs its current blocking USB write.
/// </summary>
internal sealed class ScreenTransferWorker : IDisposable
{
    private readonly IScreenDriver _driver;
    private readonly AutoResetEvent _requested = new(initialState: false);
    private readonly AutoResetEvent _completed = new(initialState: false);
    private readonly Thread _thread;
    private byte[]? _frame;
    private ScreenTransferResult _result;
    private int _inFlight;
    private int _stopping;
    private bool _disposed;

    public ScreenTransferWorker(IScreenDriver driver)
    {
        _driver = driver ?? throw new ArgumentNullException(nameof(driver));
        _thread = new Thread(Run)
        {
            IsBackground = true,
            Name = "Sprint.ScreenTransfer",
        };
        _thread.Start();
    }

    public bool IsInFlight => Volatile.Read(ref _inFlight) == 1;

    public void Start(byte[] frame)
    {
        ObjectDisposedException.ThrowIf(_disposed, this);
        ArgumentNullException.ThrowIfNull(frame);
        if (Interlocked.CompareExchange(ref _inFlight, 1, 0) != 0)
        {
            throw new InvalidOperationException("A screen transfer is already in flight.");
        }

        _frame = frame;
        _requested.Set();
    }

    public ScreenTransferResult Complete()
    {
        ObjectDisposedException.ThrowIf(_disposed, this);
        if (!IsInFlight)
        {
            throw new InvalidOperationException("No screen transfer is in flight.");
        }

        _completed.WaitOne();
        _frame = null;
        Volatile.Write(ref _inFlight, 0);
        return _result;
    }

    public void Dispose()
    {
        if (_disposed)
        {
            return;
        }

        if (IsInFlight)
        {
            _ = Complete();
        }

        _disposed = true;
        Volatile.Write(ref _stopping, 1);
        _requested.Set();
        if (_thread.Join(TimeSpan.FromSeconds(2)))
        {
            _requested.Dispose();
            _completed.Dispose();
        }
    }

    private void Run()
    {
        while (true)
        {
            _requested.WaitOne();
            if (Volatile.Read(ref _stopping) == 1)
            {
                return;
            }

            var frame = _frame
                ?? throw new InvalidOperationException("Screen transfer request had no frame.");
            var startedAt = Stopwatch.GetTimestamp();
            bool succeeded;
            Exception? error = null;
            try
            {
                succeeded = _driver.TrySendFrame(frame);
            }
            catch (Exception ex)
            {
                succeeded = false;
                error = ex;
            }

            _result = new ScreenTransferResult(
                succeeded,
                startedAt,
                Stopwatch.GetTimestamp(),
                error);
            _completed.Set();
        }
    }
}

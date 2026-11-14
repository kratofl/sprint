using System.Diagnostics;

namespace Sprint.Desktop.Features.Hardware;

internal readonly record struct ScreenTransferResult(
    bool Succeeded,
    long StartedAt,
    long CompletedAt,
    Exception? Error = null)
{
    public TimeSpan Elapsed => Stopwatch.GetElapsedTime(this.StartedAt, this.CompletedAt);
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
        this._driver = driver ?? throw new ArgumentNullException(nameof(driver));
        this._thread = new Thread(this.Run)
        {
            IsBackground = true,
            Name = "Sprint.ScreenTransfer",
        };
        this._thread.Start();
    }

    public bool IsInFlight => Volatile.Read(ref this._inFlight) == 1;

    public void Start(byte[] frame)
    {
        ObjectDisposedException.ThrowIf(this._disposed, this);
        ArgumentNullException.ThrowIfNull(frame);
        if (Interlocked.CompareExchange(ref this._inFlight, 1, 0) != 0)
        {
            throw new InvalidOperationException("A screen transfer is already in flight.");
        }

        this._frame = frame;
        this._requested.Set();
    }

    public ScreenTransferResult Complete()
    {
        ObjectDisposedException.ThrowIf(this._disposed, this);
        if (!this.IsInFlight)
        {
            throw new InvalidOperationException("No screen transfer is in flight.");
        }

        this._completed.WaitOne();
        this._frame = null;
        Volatile.Write(ref this._inFlight, 0);
        return this._result;
    }

    public void Dispose()
    {
        if (this._disposed)
        {
            return;
        }

        if (this.IsInFlight)
        {
            _ = this.Complete();
        }

        this._disposed = true;
        Volatile.Write(ref this._stopping, 1);
        this._requested.Set();
        if (this._thread.Join(TimeSpan.FromSeconds(2)))
        {
            this._requested.Dispose();
            this._completed.Dispose();
        }
    }

    private void Run()
    {
        while (true)
        {
            this._requested.WaitOne();
            if (Volatile.Read(ref this._stopping) == 1)
            {
                return;
            }

            byte[] frame = this._frame
                ?? throw new InvalidOperationException("Screen transfer request had no frame.");
            long startedAt = Stopwatch.GetTimestamp();
            bool succeeded;
            Exception? error = null;
            try
            {
                succeeded = this._driver.TrySendFrame(frame);
            }
            catch (Exception ex)
            {
                succeeded = false;
                error = ex;
            }

            this._result = new ScreenTransferResult(
                succeeded,
                startedAt,
                Stopwatch.GetTimestamp(),
                error);
            this._completed.Set();
        }
    }
}

using System.Collections.Concurrent;

namespace Sprint.Desktop.Runtime;

/// <summary>
/// The one choke point every JSON/binary store in Core writes a file through. Two problems
/// <c>File.Create</c> + <c>Serialize</c> has on its own, both real once the host started saving
/// from background loops (plan context, detected screen resolutions) concurrently with HTTP
/// command handlers on Kestrel's own threads:
/// <list type="bullet">
/// <item>Two callers racing <c>File.Create</c> on the same path throws "the process cannot
/// access the file" on Windows instead of one of them simply winning.</item>
/// <item>A process that dies (or a write that throws) partway through leaves a truncated file at
/// <paramref name="path"/>-equivalent, which the next start then either fails to parse or silently
/// treats as "no data".</item>
/// </list>
/// <see cref="Write"/> closes both: writers to the same path are serialized against each other
/// (a per-path lock, not a single global one, so unrelated files never block each other), and the
/// real path is only replaced — via an atomic rename — once <paramref name="write"/> has fully
/// written and flushed a temp file beside it. The real file is therefore always either the
/// previous complete write or the new complete write, never something in between.
/// <para>
/// This alone does not stop a caller's in-memory object from being mutated by another thread
/// while <paramref name="write"/> is serializing it — that is a race on the object graph, not the
/// file, and callers whose object can be reached from more than one thread (e.g.
/// <c>DesktopRuntime.Settings</c>/<c>Devices</c>) hold their own gate around the whole
/// mutate-then-save sequence for that.
/// </para>
/// </summary>
public static class AtomicFile
{
    private static readonly ConcurrentDictionary<string, object> Gates = new(StringComparer.OrdinalIgnoreCase);

    public static void Write(string path, Action<Stream> write)
    {
        ArgumentNullException.ThrowIfNull(path);
        ArgumentNullException.ThrowIfNull(write);

        string fullPath = Path.GetFullPath(path);
        object gate = Gates.GetOrAdd(fullPath, static _ => new object());
        lock (gate)
        {
            string? directory = Path.GetDirectoryName(fullPath);
            if (!string.IsNullOrEmpty(directory))
            {
                Directory.CreateDirectory(directory);
            }

            string tempPath = fullPath + ".tmp";
            using (FileStream stream = File.Create(tempPath))
            {
                write(stream);
                stream.Flush(flushToDisk: true);
            }

            // File.Move with overwrite performs an in-place rename on the same volume (both
            // paths are always siblings here), which is what makes the real file never observe
            // a partially written state: readers see either the old file or the new one.
            File.Move(tempPath, fullPath, overwrite: true);
        }
    }

    /// <summary>
    /// Moves a file its store could not read out of the way, to
    /// <c>name.ext.yyyyMMdd-HHmmss.unreadable</c> beside it, and returns where it went (null when
    /// it could not be moved). The store falls back to defaults then, and its next save would
    /// otherwise overwrite the file for good, though it may well be fine: written by a newer
    /// Sprint before a rollback. The suffix keeps it out of every <c>*.json</c> directory scan.
    /// </summary>
    public static string? SetAside(string path)
    {
        ArgumentNullException.ThrowIfNull(path);

        string fullPath = Path.GetFullPath(path);
        string target = $"{fullPath}.{DateTime.Now:yyyyMMdd-HHmmss}.unreadable";
        object gate = Gates.GetOrAdd(fullPath, static _ => new object());
        lock (gate)
        {
            try
            {
                File.Move(fullPath, target, overwrite: false);
                return target;
            }
            catch (Exception ex) when (ex is IOException or UnauthorizedAccessException)
            {
                return null;
            }
        }
    }

    // ERROR_SHARING_VIOLATION as an HResult.
    private const int SharingViolation = unchecked((int)0x80070020);
    private const int ReadAttempts = 10;

    /// <summary>
    /// Reads a file <see cref="Write"/> may be replacing at that moment. On Windows the rename
    /// holds the real path for an instant, and a reader landing then fails with a sharing
    /// violation although the file is fine a moment later; that one error is retried briefly.
    /// Every other error (missing, denied) is the caller's, at once.
    /// </summary>
    public static byte[] ReadAllBytes(string path)
    {
        ArgumentNullException.ThrowIfNull(path);
        for (int attempt = 1; ; attempt++)
        {
            try
            {
                return File.ReadAllBytes(path);
            }
            catch (IOException ex) when (ex.HResult == SharingViolation && attempt < ReadAttempts)
            {
                Thread.Sleep(20 * attempt);
            }
        }
    }
}

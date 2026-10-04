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
}

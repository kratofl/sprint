namespace Sprint.Desktop.Features.Input;

/// <summary>Metadata describing an application command for the bindings UI (ported from Go <c>commands.CommandMeta</c>).</summary>
public sealed record CommandMeta(string Id, string Label, string Category, bool Capturable, bool DeviceOnly);

/// <summary>A runtime-generated command (e.g. per dash page) + its handler; replaces the previous dynamic set wholesale.</summary>
public sealed record DynamicCommand(CommandMeta Meta, Action<object?> Handler);

/// <summary>
/// The application command bus (matrix 4.7, WS8): a UI-independent model where
/// features register command metadata, the shell wires handlers, and input
/// devices dispatch by id. Static commands are registered once; dynamic commands
/// (dash pages) are rebuilt wholesale via <see cref="ReplaceDynamic"/>. Thread-safe;
/// mirrors the Go <c>commands</c> package but as an injectable instance rather than
/// a global registry.
/// </summary>
public sealed class CommandBus
{
    private readonly object _gate = new();
    private readonly List<string> _staticOrder = [];
    private readonly Dictionary<string, CommandMeta> _staticCatalog = new(StringComparer.OrdinalIgnoreCase);
    private readonly List<string> _dynamicOrder = [];
    private readonly Dictionary<string, CommandMeta> _dynamicCatalog = new(StringComparer.OrdinalIgnoreCase);
    private readonly Dictionary<string, Action<object?>> _handlers = new(StringComparer.OrdinalIgnoreCase);

    public void RegisterMeta(CommandMeta meta)
    {
        ArgumentNullException.ThrowIfNull(meta);
        lock (_gate)
        {
            if (!_staticCatalog.ContainsKey(meta.Id))
            {
                _staticOrder.Add(meta.Id);
            }

            _staticCatalog[meta.Id] = meta;
        }
    }

    /// <summary>Registers (or replaces) the handler for a command id.</summary>
    public void Handle(string id, Action<object?> handler)
    {
        ArgumentNullException.ThrowIfNull(handler);
        lock (_gate)
        {
            _handlers[id] = handler;
        }
    }

    /// <summary>Fires the command synchronously. No-op when nothing is bound. Returns true if a handler ran.</summary>
    public bool Dispatch(string id, object? payload = null)
    {
        Action<object?>? handler;
        lock (_gate)
        {
            _handlers.TryGetValue(id, out handler);
        }

        handler?.Invoke(payload);
        return handler is not null;
    }

    /// <summary>A snapshot of all command metadata (static first, then dynamic), for the bindings UI.</summary>
    public IReadOnlyList<CommandMeta> Catalog()
    {
        lock (_gate)
        {
            var result = new List<CommandMeta>(_staticOrder.Count + _dynamicOrder.Count);
            result.AddRange(_staticOrder.Where(_staticCatalog.ContainsKey).Select(id => _staticCatalog[id]));
            result.AddRange(_dynamicOrder.Where(_dynamicCatalog.ContainsKey).Select(id => _dynamicCatalog[id]));
            return result;
        }
    }

    /// <summary>Replaces the entire dynamic command set + handlers; static commands are untouched.</summary>
    public void ReplaceDynamic(IEnumerable<DynamicCommand> entries)
    {
        ArgumentNullException.ThrowIfNull(entries);
        lock (_gate)
        {
            foreach (var id in _dynamicOrder)
            {
                _dynamicCatalog.Remove(id);
                _handlers.Remove(id);
            }

            _dynamicOrder.Clear();
            foreach (var entry in entries)
            {
                _dynamicOrder.Add(entry.Meta.Id);
                _dynamicCatalog[entry.Meta.Id] = entry.Meta;
                _handlers[entry.Meta.Id] = entry.Handler;
            }
        }
    }
}

/// <summary>The built-in Sprint command ids + catalog registration (matrix 4.7 standard handlers).</summary>
public static class SprintCommands
{
    public const string DashPageNext = "dash.page.next";
    public const string DashPagePrev = "dash.page.prev";
    public const string DashTargetSet = "dash.target.set";

    public static void RegisterDefaults(CommandBus bus)
    {
        ArgumentNullException.ThrowIfNull(bus);
        bus.RegisterMeta(new CommandMeta(DashPageNext, "Next dash page", "Dashboard", Capturable: true, DeviceOnly: true));
        bus.RegisterMeta(new CommandMeta(DashPagePrev, "Previous dash page", "Dashboard", Capturable: true, DeviceOnly: true));
        bus.RegisterMeta(new CommandMeta(DashTargetSet, "Set delta reference", "Timing", Capturable: true, DeviceOnly: false));
    }
}

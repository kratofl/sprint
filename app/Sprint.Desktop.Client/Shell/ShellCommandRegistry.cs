namespace Sprint.Desktop.Shell;

internal sealed record ShellCommand(
    string Id,
    string Title,
    string Keywords,
    string? Shortcut,
    Action Execute);

internal sealed class ShellCommandRegistry
{
    private readonly IReadOnlyList<ShellCommand> _commands;

    public ShellCommandRegistry(IEnumerable<ShellCommand> commands)
    {
        _commands = commands.ToArray();
    }

    public IReadOnlyList<ShellCommand> Search(string? query)
    {
        var needle = query?.Trim();
        return _commands
            .Where(command => string.IsNullOrEmpty(needle)
                || command.Title.Contains(needle, StringComparison.OrdinalIgnoreCase)
                || command.Keywords.Contains(needle, StringComparison.OrdinalIgnoreCase))
            .ToArray();
    }

    public bool Execute(string id)
    {
        var command = _commands.FirstOrDefault(candidate =>
            string.Equals(candidate.Id, id, StringComparison.OrdinalIgnoreCase));
        if (command is null)
        {
            return false;
        }

        command.Execute();
        return true;
    }
}

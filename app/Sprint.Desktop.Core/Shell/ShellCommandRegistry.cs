namespace Sprint.Desktop.Shell;

public sealed record ShellCommand(
    string Id,
    string Title,
    string Keywords,
    string? Shortcut,
    Action Execute);

public sealed class ShellCommandRegistry
{
    private readonly IReadOnlyList<ShellCommand> _commands;

    public ShellCommandRegistry(IEnumerable<ShellCommand> commands)
    {
        this._commands = commands.ToArray();
    }

    public IReadOnlyList<ShellCommand> Search(string? query)
    {
        string? needle = query?.Trim();
        return this._commands
            .Where(command => string.IsNullOrEmpty(needle)
                || command.Title.Contains(needle, StringComparison.OrdinalIgnoreCase)
                || command.Keywords.Contains(needle, StringComparison.OrdinalIgnoreCase))
            .ToArray();
    }

    public bool Execute(string id)
    {
        ShellCommand? command = this._commands.FirstOrDefault(candidate =>
            string.Equals(candidate.Id, id, StringComparison.OrdinalIgnoreCase));
        if (command is null)
        {
            return false;
        }

        command.Execute();
        return true;
    }
}

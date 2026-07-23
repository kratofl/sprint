#if DEBUG
using Avalonia;
using Avalonia.Controls;

namespace Sprint.Desktop.Features.Development;

/// <summary>
/// Composes independent development modules into one simultaneous workspace.
/// Adding another tool does not require changing the window's column plumbing.
/// Module-specific controls and event lifecycles remain with their module builder.
/// </summary>
internal sealed record DevelopmentToolModule(string Id, Control View);

internal static class DevelopmentToolModuleHost
{
    public static Control Build(IReadOnlyList<DevelopmentToolModule> modules)
    {
        ArgumentNullException.ThrowIfNull(modules);
        if (modules.Count == 0)
        {
            return new Grid();
        }

        var columns = new ColumnDefinitions();
        for (var index = 0; index < modules.Count; index++)
        {
            if (index > 0)
            {
                columns.Add(new ColumnDefinition(new GridLength(8)));
            }

            columns.Add(new ColumnDefinition(new GridLength(1, GridUnitType.Star)));
        }

        var root = new Grid
        {
            ColumnDefinitions = columns,
            Margin = new Thickness(18),
        };

        for (var index = 0; index < modules.Count; index++)
        {
            var column = index * 2;
            var view = modules[index].View;
            view.Tag ??= $"development-module:{modules[index].Id}";
            Grid.SetColumn(view, column);
            root.Children.Add(view);

            if (index == modules.Count - 1)
            {
                continue;
            }

            var splitter = new GridSplitter
            {
                Width = 8,
                Background = Graphite.BgBrush,
                ResizeDirection = GridResizeDirection.Columns,
            };
            Grid.SetColumn(splitter, column + 1);
            root.Children.Add(splitter);
        }

        return root;
    }
}
#endif

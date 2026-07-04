using Avalonia;
using Avalonia.Controls;
using Avalonia.Controls.Primitives;

namespace Sprint.Desktop.Shell;

public static class WindowDragPolicy
{
    public static bool ShouldBeginDrag(object? source)
    {
        for (var current = source as StyledElement; current is not null; current = current.Parent as StyledElement)
        {
            if (IsInteractiveChromeChild(current))
            {
                return false;
            }
        }

        return true;
    }

    private static bool IsInteractiveChromeChild(StyledElement element)
    {
        return element is Button
            or TextBox
            or ComboBox
            or Slider
            or ScrollBar
            or Thumb
            or SelectingItemsControl;
    }
}

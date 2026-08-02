using Avalonia;
using Avalonia.Controls;
using Avalonia.Controls.Primitives;
using Avalonia.Input;
using Avalonia.Interactivity;
using Avalonia.Layout;
using Avalonia.Media;

namespace Sprint.Desktop.Features.SessionPlanning;

/// <summary>
/// A text field with a real dropdown: clicking it (or its chevron) opens the list of values
/// Sprint already knows, and typing stays possible for a value it does not.
/// <para>
/// Deliberately not an <see cref="AutoCompleteBox"/>. That control only reveals its list once
/// something has been typed, which reads as a plain text box — you cannot see what is on offer,
/// which is the entire point of showing recorded spellings. And it is not a
/// <see cref="ComboBox"/> either: a closed list would make planning for a car never driven
/// impossible.
/// </para>
/// <para>
/// The popup's list is built when it first opens rather than up front, so a sheet with three of
/// these does not pay for three lists nobody has looked at.
/// </para>
/// </summary>
internal sealed class SuggestingField
{
    private readonly IReadOnlyList<string> _suggestions;
    private readonly Action<string> _onChanged;
    private readonly TextBox _box;
    private readonly Popup _popup;

    private ListBox? _list;

    public SuggestingField(
        string value,
        Action<string> onChanged,
        string placeholder,
        IReadOnlyList<string> suggestions,
        string name)
    {
        _suggestions = suggestions;
        _onChanged = onChanged;

        _box = new TextBox
        {
            Name = name,
            Text = value,
            PlaceholderText = placeholder,
            MinWidth = 260,
            Background = Graphite.Panel2Brush,
            Foreground = Graphite.TextBrush,
            BorderBrush = Graphite.Line2Brush,
            FontFamily = Graphite.FontStack,
            FontSize = 12,
        };
        _box.TextChanged += (_, _) => onChanged(_box.Text ?? "");

        _popup = new Popup
        {
            PlacementTarget = _box,
            Placement = PlacementMode.BottomEdgeAlignedLeft,
            IsLightDismissEnabled = true,
            WindowManagerAddShadowHint = false,
        };

        Control = Compose();
    }

    /// <summary>The control to place in the form.</summary>
    public Control Control { get; }

    /// <summary>The name of a field's dropdown toggle, present only when it has values to offer.</summary>
    internal static string ToggleName(string fieldName) => $"{fieldName}-toggle";

    /// <summary>The text box itself, for callers that need its change events or placeholder.</summary>
    public TextBox Box => _box;

    private Control Compose()
    {
        var grid = new Grid();
        grid.Children.Add(_box);

        if (_suggestions.Count > 0)
        {
            // The affordance only exists when there is something to open. A chevron over an
            // empty list promises a menu that never appears.
            var toggle = new Button
            {
                Name = ToggleName(_box.Name ?? ""),
                Content = Icons.Create("chevron-down", 14, Graphite.Text3Brush),
                Background = Brushes.Transparent,
                BorderThickness = new Thickness(0),
                Padding = new Thickness(6, 0),
                HorizontalAlignment = HorizontalAlignment.Right,
                VerticalAlignment = VerticalAlignment.Stretch,
                Margin = new Thickness(0, 1, 2, 1),
            };
            toggle.Click += (_, _) => Toggle();
            grid.Children.Add(toggle);

            // Clicking the field itself opens the list too: that is what a dropdown does, and
            // hunting for the chevron to see the options would be its own small annoyance.
            _box.AddHandler(
                InputElement.PointerPressedEvent,
                (_, _) => Open(),
                RoutingStrategies.Tunnel);

            grid.Children.Add(_popup);
        }

        return grid;
    }

    private void Toggle()
    {
        if (_popup.IsOpen)
        {
            _popup.IsOpen = false;
            return;
        }

        Open();
    }

    private void Open()
    {
        if (_popup.IsOpen)
        {
            return;
        }

        _popup.Child ??= BuildList();
        _popup.IsOpen = true;
    }

    private Control BuildList()
    {
        _list = new ListBox
        {
            ItemsSource = _suggestions,
            Background = Brushes.Transparent,
            BorderThickness = new Thickness(0),
            MinWidth = _box.MinWidth,
            MaxHeight = 220,
        };
        _list.SelectionChanged += (_, _) =>
        {
            if (_list.SelectedItem is string picked)
            {
                _box.Text = picked;
                // TextChanged does not fire for a programmatic assignment, so the draft is
                // written directly rather than relying on the event.
                _onChanged(picked);
                _popup.IsOpen = false;
            }
        };

        return new Border
        {
            Background = Graphite.Panel2Brush,
            BorderBrush = Graphite.Line2Brush,
            BorderThickness = new Thickness(1),
            CornerRadius = new CornerRadius(Graphite.RadiusLg),
            Padding = new Thickness(4),
            Child = new ScrollViewer
            {
                VerticalScrollBarVisibility = ScrollBarVisibility.Auto,
                HorizontalScrollBarVisibility = ScrollBarVisibility.Disabled,
                Content = _list,
            },
        };
    }
}

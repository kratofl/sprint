using Avalonia;
using Avalonia.Controls;
using Avalonia.Layout;
using Avalonia.Media;

namespace Sprint.Desktop.Features.SessionPlanning;

/// <summary>
/// The import sheet: searching, the offer, progress, and the outcome — all in one place.
/// <para>
/// Every result stays inside the dialog rather than becoming a toast. A toast is a transient
/// aside that can be missed and cannot be re-read; "nothing new to import" and "12 sessions
/// added" are not asides, they are the answer to the thing the driver just pressed. The dialog
/// closes when they dismiss the answer, not before it appears.
/// </para>
/// </summary>
internal sealed class ImportResultsDialog
{
    internal const string ImportButtonName = "importResultsConfirm";
    internal const string BusyIndicatorName = "importResultsBusy";
    internal const string OutcomeAlertName = "importResultsOutcome";

    private readonly ImportResultsController _controller;
    private readonly Action _close;

    public ImportResultsDialog(ImportResultsController controller, Action close)
    {
        _controller = controller;
        _close = close;
    }

    public Control Build()
    {
        var content = new StackPanel { Spacing = 14, Width = 420 };
        content.Children.Add(Graphite.TextBlock(
            "Import archived sessions",
            19,
            FontWeight.Bold,
            Graphite.TextBrush));

        switch (_controller.Phase)
        {
            case ImportResultsPhase.Searching:
                content.Children.Add(Busy($"Looking through {_controller.SourceName}"));
                break;

            case ImportResultsPhase.NothingNew:
                content.Children.Add(Outcome(
                    GraphiteIntent.Info,
                    "Nothing new to import",
                    $"Sprint already has every session in {_controller.SourceName}."));
                break;

            case ImportResultsPhase.Ready:
            case ImportResultsPhase.Importing:
                content.Children.Add(Graphite.TextBlock(
                    $"Sprint found {_controller.Proposal.Summary} in {_controller.SourceName}. "
                        + "Importing them gives fuel and lap-time estimates something to work from "
                        + "straight away. Nothing is imported until you choose to.",
                    12,
                    FontWeight.Normal,
                    Graphite.Text2Brush,
                    TextWrapping.Wrap));
                break;

            case ImportResultsPhase.Imported:
                content.Children.Add(Outcome(
                    GraphiteIntent.Success,
                    "Sessions imported",
                    _controller.ImportedCount == 0
                        ? "Sprint already had every session in that archive, so nothing changed."
                        : $"{Sessions(_controller.ImportedCount)} added to your lap history."));
                break;

            case ImportResultsPhase.Failed:
                content.Children.Add(Outcome(
                    GraphiteIntent.Danger,
                    "Import failed",
                    $"{_controller.Error} Nothing was added to your lap history."));
                break;
        }

        content.Children.Add(Actions());
        return content;
    }

    private static string Sessions(int count) => count == 1 ? "1 session" : $"{count} sessions";

    private static Control Outcome(GraphiteIntent intent, string title, string message)
    {
        var alert = Graphite.Alert(intent, title, message, IconFor(intent));
        alert.Name = OutcomeAlertName;
        return alert;
    }

    private static string IconFor(GraphiteIntent intent) => intent switch
    {
        GraphiteIntent.Success => "circle-check",
        GraphiteIntent.Danger => "alert-triangle",
        _ => "info-circle",
    };

    /// <summary>
    /// An indeterminate bar plus a plain label. The work has no measurable total — the archive
    /// is however many files it is — so a percentage would be invented.
    /// </summary>
    private static Control Busy(string label)
    {
        var row = new StackPanel
        {
            Orientation = Orientation.Horizontal,
            Spacing = 10,
            VerticalAlignment = VerticalAlignment.Center,
        };
        row.Children.Add(Indicator(Graphite.AccentBrush, 36));
        row.Children.Add(Graphite.TextBlock(label, 12, FontWeight.Normal, Graphite.Text2Brush));
        return row;
    }

    /// <summary>
    /// A fixed-width indeterminate bar. Both alignment and width are pinned because a
    /// ProgressBar stretches by default, and a bar that grows to fill its parent stops reading
    /// as an indicator and starts reading as a full-width divider.
    /// </summary>
    private static Control Indicator(IBrush foreground, double width) => new ProgressBar
    {
        Name = BusyIndicatorName,
        IsIndeterminate = true,
        Width = width,
        MinWidth = width,
        MaxWidth = width,
        Height = 3,
        MinHeight = 3,
        Foreground = foreground,
        Background = Graphite.Panel3Brush,
        HorizontalAlignment = HorizontalAlignment.Left,
        VerticalAlignment = VerticalAlignment.Center,
    };

    private Control Actions()
    {
        var actions = new StackPanel
        {
            Orientation = Orientation.Horizontal,
            Spacing = 8,
            HorizontalAlignment = HorizontalAlignment.Right,
            Margin = new Thickness(0, 4, 0, 0),
        };

        switch (_controller.Phase)
        {
            case ImportResultsPhase.Searching:
                actions.Children.Add(Button("Cancel", ButtonTone.Ghost, Dismiss));
                break;

            case ImportResultsPhase.Ready:
                actions.Children.Add(Button("Not now", ButtonTone.Ghost, Dismiss));
                actions.Children.Add(Button("Import", ButtonTone.Primary, () => _ = _controller.ImportAsync()));
                break;

            case ImportResultsPhase.Importing:
                // The same button, still in place, now saying it is working and refusing a
                // second press — moving or removing it would lose the driver's anchor.
                var busy = Graphite.Button("Importing", ButtonTone.Primary);
                busy.Name = ImportButtonName;
                busy.IsEnabled = false;
                busy.Content = new StackPanel
                {
                    Orientation = Orientation.Horizontal,
                    Spacing = 8,
                    HorizontalAlignment = HorizontalAlignment.Center,
                    VerticalAlignment = VerticalAlignment.Center,
                    Children =
                    {
                        Indicator(Graphite.TextBrush, 20),
                        Graphite.TextBlock("Importing", 12, FontWeight.Medium, Graphite.TextBrush),
                    },
                };
                actions.Children.Add(busy);
                break;

            default:
                // Nothing left to decide: one way out, and it is the primary because it is the
                // only thing to do.
                actions.Children.Add(Button("Close", ButtonTone.Primary, Dismiss));
                break;
        }

        return actions;
    }

    private void Dismiss()
    {
        _controller.Decline();
        _close();
    }

    private Button Button(string label, ButtonTone tone, Action action)
    {
        var button = Graphite.Button(label, tone);
        if (label == "Import")
        {
            button.Name = ImportButtonName;
            button.IsEnabled = _controller.CanImport;
        }

        button.Click += (_, _) => action();
        return button;
    }
}

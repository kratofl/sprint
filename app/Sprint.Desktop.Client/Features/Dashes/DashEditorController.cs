namespace Sprint.Desktop.Features.Dashes;

/// <summary>A page entry shown as an editor tab. The Idle page is locked (present, not deletable/renamable via the regular-page ops).</summary>
public sealed record DashPageTab(string Id, string Name, bool IsIdle);

/// <summary>
/// The interaction/presenter seam for the dash editor (matrix 4.5 editor rows,
/// WS6). It owns the mutable editor state — active page + selected widget — and
/// orchestrates the pure <see cref="DashLayoutEditor"/> reducers, persisting via
/// an injected save callback after every successful mutation. Kept free of
/// Avalonia so the full add/move/resize/delete/page-management behaviour is
/// unit-testable without launching the app (US27/US43).
/// </summary>
public sealed class DashEditorController
{
    private readonly Action<DashLayout> _save;

    public DashEditorController(DashLayout layout, Action<DashLayout> save)
    {
        Layout = layout ?? throw new ArgumentNullException(nameof(layout));
        _save = save ?? throw new ArgumentNullException(nameof(save));
        ActivePageId = layout.Pages.FirstOrDefault()?.Id ?? layout.IdlePage?.Id ?? "";
    }

    public DashLayout Layout { get; }

    public string ActivePageId { get; private set; }

    public string? SelectedWidgetId { get; private set; }

    /// <summary>Raised after any mutation that changed the layout or selection, so the view can rebuild.</summary>
    public event EventHandler? Changed;

    public IReadOnlyList<DashPageTab> PageTabs
    {
        get
        {
            var tabs = new List<DashPageTab>();
            if (Layout.IdlePage is { } idle)
            {
                tabs.Add(new DashPageTab(idle.Id, string.IsNullOrWhiteSpace(idle.Name) ? "Idle" : idle.Name, IsIdle: true));
            }

            tabs.AddRange(Layout.Pages.Select(p => new DashPageTab(p.Id, p.Name, IsIdle: false)));
            return tabs;
        }
    }

    public DashPage? ActivePage => DashLayoutEditor.FindPage(Layout, ActivePageId);

    public DashWidget? SelectedWidget =>
        SelectedWidgetId is null ? null : ActivePage?.Widgets.FirstOrDefault(w => string.Equals(w.Id, SelectedWidgetId, StringComparison.OrdinalIgnoreCase));

    public bool SelectPage(string pageId)
    {
        if (PageTabs.All(t => !string.Equals(t.Id, pageId, StringComparison.OrdinalIgnoreCase)))
        {
            return false;
        }

        if (string.Equals(pageId, ActivePageId, StringComparison.OrdinalIgnoreCase))
        {
            return false;
        }

        ActivePageId = pageId;
        SelectedWidgetId = null;
        RaiseChanged();
        return true;
    }

    public void SelectWidget(string? widgetId)
    {
        if (string.Equals(widgetId, SelectedWidgetId, StringComparison.OrdinalIgnoreCase))
        {
            return;
        }

        SelectedWidgetId = widgetId;
        RaiseChanged();
    }

    public bool AddWidget(string type)
    {
        if (!DashLayoutEditor.TryAddWidget(Layout, ActivePageId, type, out var widget) || widget is null)
        {
            return false;
        }

        SelectedWidgetId = widget.Id;
        Persist();
        return true;
    }

    /// <summary>Default grid span a freshly-added widget occupies (for the palette drag ghost).</summary>
    public (int ColSpan, int RowSpan) DefaultSpan => (
        Math.Min(DashLayoutEditor.DefaultWidgetColSpan, Math.Max(1, Layout.GridCols)),
        Math.Min(DashLayoutEditor.DefaultWidgetRowSpan, Math.Max(1, Layout.GridRows)));

    /// <summary>Add a widget at an explicit grid cell (palette drag-drop).</summary>
    public bool AddWidgetAt(string type, int col, int row)
    {
        if (!DashLayoutEditor.TryAddWidgetAt(Layout, ActivePageId, type, col, row, out var widget) || widget is null)
        {
            return false;
        }

        SelectedWidgetId = widget.Id;
        Persist();
        return true;
    }

    /// <summary>Non-mutating placement preview for the live drag/resize ghost.</summary>
    public bool CanPlace(DashWidget widget, int col, int row, int colSpan, int rowSpan)
    {
        ArgumentNullException.ThrowIfNull(widget);
        return DashLayoutEditor.CanPlaceWidget(Layout, ActivePageId, widget.Id, col, row, colSpan, rowSpan);
    }

    /// <summary>Non-mutating placement preview for a not-yet-created widget (palette drag).</summary>
    public bool CanPlaceNew(int col, int row, int colSpan, int rowSpan) =>
        DashLayoutEditor.CanPlaceNewWidget(Layout, ActivePageId, col, row, colSpan, rowSpan);

    public bool MoveSelected(int col, int row) =>
        WithSelected(id => DashLayoutEditor.TryMoveWidget(Layout, ActivePageId, id, col, row));

    public bool ResizeSelected(int colSpan, int rowSpan) =>
        WithSelected(id => DashLayoutEditor.TryResizeWidget(Layout, ActivePageId, id, colSpan, rowSpan));

    /// <summary>Set the selected widget's full geometry (edge/corner resize that moves the origin).</summary>
    public bool ResizeSelectedTo(int col, int row, int colSpan, int rowSpan) =>
        WithSelected(id => DashLayoutEditor.TrySetWidgetGeometry(Layout, ActivePageId, id, col, row, colSpan, rowSpan));

    public bool DeleteSelected()
    {
        if (SelectedWidgetId is not { } id || !DashLayoutEditor.TryDeleteWidget(Layout, ActivePageId, id))
        {
            return false;
        }

        SelectedWidgetId = null;
        Persist();
        return true;
    }

    public bool ClearActivePage()
    {
        if (!DashLayoutEditor.TryClearPage(Layout, ActivePageId))
        {
            return false;
        }

        SelectedWidgetId = null;
        Persist();
        return true;
    }

    public DashPage AddPage()
    {
        var page = DashLayoutEditor.AddPage(Layout, "Page");
        ActivePageId = page.Id;
        SelectedWidgetId = null;
        Persist();
        return page;
    }

    public bool RenamePage(string pageId, string name)
    {
        if (!DashLayoutEditor.TryRenamePage(Layout, pageId, name))
        {
            return false;
        }

        Persist();
        return true;
    }

    /// <summary>Rename the whole dash layout (editor header title). No-op on blank/unchanged.</summary>
    public bool RenameLayout(string name)
    {
        var trimmed = (name ?? string.Empty).Trim();
        if (trimmed.Length == 0 || string.Equals(trimmed, Layout.Name, StringComparison.Ordinal))
        {
            return false;
        }

        Layout.Name = trimmed;
        Persist();
        return true;
    }

    /// <summary>Whether a change-alert of the given type is configured on the layout.</summary>
    public bool IsAlertEnabled(string type) =>
        Layout.Alerts.Any(a => string.Equals(a.Type, type, StringComparison.OrdinalIgnoreCase));

    /// <summary>Enable/disable a change-alert type (adds/removes the layout alert entry).</summary>
    public void SetAlert(string type, bool enabled)
    {
        var present = IsAlertEnabled(type);
        if (present == enabled)
        {
            return;
        }

        if (enabled)
        {
            Layout.Alerts.Add(new DashAlert { Id = type, Type = type });
        }
        else
        {
            Layout.Alerts.RemoveAll(a => string.Equals(a.Type, type, StringComparison.OrdinalIgnoreCase));
        }

        Persist();
    }

    public bool DeletePage(string pageId)
    {
        if (!DashLayoutEditor.TryDeletePage(Layout, pageId))
        {
            return false;
        }

        if (string.Equals(pageId, ActivePageId, StringComparison.OrdinalIgnoreCase))
        {
            ActivePageId = Layout.Pages.FirstOrDefault()?.Id ?? Layout.IdlePage?.Id ?? "";
            SelectedWidgetId = null;
        }

        Persist();
        return true;
    }

    private bool WithSelected(Func<string, bool> op)
    {
        if (SelectedWidgetId is not { } id || !op(id))
        {
            return false;
        }

        Persist();
        return true;
    }

    private void Persist()
    {
        _save(Layout);
        RaiseChanged();
    }

    private void RaiseChanged() => Changed?.Invoke(this, EventArgs.Empty);
}

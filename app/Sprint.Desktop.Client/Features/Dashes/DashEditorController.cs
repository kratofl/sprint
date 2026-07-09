using System.Text.Json;
using Sprint.Desktop.Api.Telemetry;

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

    /// <summary>The selected widget stack (region), mutually exclusive with <see cref="SelectedWidgetId"/>.</summary>
    public string? SelectedStackId { get; private set; }

    /// <summary>The layer being edited within the selected stack (falls back to its default/first layer).</summary>
    public string? ActiveLayerId { get; private set; }

    /// <summary>Raised after any mutation that changed the layout or selection, so the view can rebuild.</summary>
    public event EventHandler? Changed;

    /// <summary>Raised when the user explicitly asks to push the current design to its assigned screen (US27).</summary>
    public event EventHandler<DashLayout>? ApplyToScreenRequested;

    /// <summary>The preview state the canvas simulates; <see cref="DashPreviewState.Live"/> uses the live/demo frame (US26).</summary>
    public DashPreviewState PreviewState { get; private set; } = DashPreviewState.Live;

    /// <summary>The dash's current target screen size (US15/US16), resolved from the layout and normalized for legacy dashes.</summary>
    public ScreenProfile TargetProfile => ScreenProfileCatalog.Resolve(Layout.ScreenProfileId);

    /// <summary>All wheel-screen sizes a dash can target.</summary>
    public IReadOnlyList<ScreenProfile> AvailableProfiles => ScreenProfileCatalog.All;

    /// <summary>
    /// Retarget this dash to another screen size (US17): refits the grid to the new
    /// aspect and persists. Selecting the current size is a no-op. Returns whether the
    /// target changed.
    /// </summary>
    public bool SetTargetProfile(ScreenProfile profile)
    {
        ArgumentNullException.ThrowIfNull(profile);
        if (DashLayoutEditor.TargetsProfile(Layout, profile))
        {
            return false;
        }

        DashLayoutEditor.ApplyScreenProfile(Layout, profile);
        SelectedWidgetId = null;
        SelectedStackId = null;
        ActiveLayerId = null;
        Persist();
        return true;
    }

    /// <summary>Selects the preview state the canvas renders (US26). Returns whether it changed.</summary>
    public bool SelectPreviewState(DashPreviewState state)
    {
        if (PreviewState == state)
        {
            return false;
        }

        PreviewState = state;
        RaiseChanged();
        return true;
    }

    /// <summary>The frame the canvas should render given the live frame and the selected preview state.</summary>
    public TelemetryFrame ResolveRenderFrame(TelemetryFrame liveFrame)
    {
        ArgumentNullException.ThrowIfNull(liveFrame);
        return DashPreviewFrames.Resolve(PreviewState, liveFrame);
    }

    /// <summary>
    /// Signals intent to push the current design to the assigned physical screen (US27).
    /// The shell handles the actual hardware render/stream; edits never reach the wheel
    /// until this is invoked.
    /// </summary>
    public void RequestApplyToScreen() => ApplyToScreenRequested?.Invoke(this, Layout);

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
        SelectedStackId = null;
        ActiveLayerId = null;
        RaiseChanged();
        return true;
    }

    public void SelectWidget(string? widgetId)
    {
        if (string.Equals(widgetId, SelectedWidgetId, StringComparison.OrdinalIgnoreCase) && SelectedStackId is null)
        {
            return;
        }

        SelectedWidgetId = widgetId;
        SelectedStackId = null; // widget and stack selection are mutually exclusive
        ActiveLayerId = null;
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

    /// <summary>Reads a string config value on the selected widget (inspector fields).</summary>
    public string GetSelectedConfig(string key)
    {
        if (SelectedWidget?.Config is { } config &&
            config.TryGetValue(key, out var element) &&
            element.ValueKind == JsonValueKind.String)
        {
            return element.GetString() ?? string.Empty;
        }

        return string.Empty;
    }

    /// <summary>Sets (or clears, when empty) a string config value on the selected widget.</summary>
    public bool SetSelectedConfig(string key, string? value)
    {
        if (SelectedWidget is not { } widget || string.IsNullOrWhiteSpace(key))
        {
            return false;
        }

        widget.Config ??= new Dictionary<string, JsonElement>(StringComparer.Ordinal);
        if (string.IsNullOrEmpty(value))
        {
            widget.Config.Remove(key);
        }
        else
        {
            widget.Config[key] = JsonSerializer.SerializeToElement(value);
        }

        if (widget.Config.Count == 0)
        {
            widget.Config = null;
        }

        Persist();
        return true;
    }

    /// <summary>The selected widget's style (never null once accessed for display; empty = all defaults).</summary>
    public DashWidgetStyle SelectedStyle => SelectedWidget?.Style ?? new DashWidgetStyle();

    /// <summary>Override the selected widget's main value colour (Graphite token, or null to inherit).</summary>
    public bool SetSelectedTextColor(string? token) => PatchStyle(style => style.TextColor = Blank(token));

    /// <summary>Override the selected widget's label/caption colour (Graphite token, or null to inherit).</summary>
    public bool SetSelectedLabelColor(string? token) => PatchStyle(style => style.LabelColor = Blank(token));

    /// <summary>Tri-state override of the selected widget's outline (null = default, true = on, false = off).</summary>
    public bool SetSelectedBorder(bool? show) => PatchStyle(style => style.Border = show);

    private bool PatchStyle(Action<DashWidgetStyle> patch)
    {
        if (SelectedWidget is not { } widget)
        {
            return false;
        }

        var style = widget.Style ?? new DashWidgetStyle();
        patch(style);
        widget.Style = style.IsEmpty ? null : style;
        Persist();
        return true;
    }

    private static string? Blank(string? token) => string.IsNullOrWhiteSpace(token) ? null : token;

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
        SelectedStackId = null;
        ActiveLayerId = null;
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

    public DashAlertConfig AlertConfig => Layout.AlertConfig ?? new DashAlertConfig();

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

        SyncAlertEnabledTypes();
        Persist();
    }

    public void SetAlertDisplayMode(string mode) => PatchAlertConfig(config =>
    {
        config.DisplayMode = string.Equals(mode, "center", StringComparison.OrdinalIgnoreCase) ? "center" : "full";
    });

    public void SetAlertDuration(double seconds) => PatchAlertConfig(config =>
    {
        config.DurationSeconds = Math.Clamp(Math.Round(seconds, 1), 0.5, 5.0);
    });

    public void SetAlertInvertColors(bool invert) => PatchAlertConfig(config =>
    {
        config.InvertColors = invert;
    });

    public void SetAlertColorToken(string token) => PatchAlertConfig(config =>
    {
        var normalized = (token ?? string.Empty).Trim().ToLowerInvariant();
        config.ColorToken = normalized is "auto" or "blue" or "ember" or "green" or "yellow" or "red" or "white"
            ? normalized
            : "auto";
    });

    private void PatchAlertConfig(Action<DashAlertConfig> patch)
    {
        var config = Layout.AlertConfig?.Clone() ?? new DashAlertConfig();
        patch(config);
        config.EnabledTypes = Layout.Alerts.Select(alert => alert.Type).Distinct(StringComparer.OrdinalIgnoreCase).ToList();
        Layout.AlertConfig = config.IsDefault ? null : config;
        Persist();
    }

    private void SyncAlertEnabledTypes()
    {
        if (Layout.AlertConfig is null)
        {
            return;
        }

        Layout.AlertConfig.EnabledTypes = Layout.Alerts.Select(alert => alert.Type).Distinct(StringComparer.OrdinalIgnoreCase).ToList();
        if (Layout.AlertConfig.IsDefault)
        {
            Layout.AlertConfig = null;
        }
    }

    // ── Theme (layout-level palette) ──────────────────────────────────────────

    /// <summary>The layout theme (never null for display; empty = all Graphite defaults).</summary>
    public DashTheme SelectedTheme => Layout.Theme ?? new DashTheme();

    /// <summary>Applies a named preset's overrides to the layout (empty preset clears the theme).</summary>
    public void ApplyThemePreset(DashTheme preset)
    {
        ArgumentNullException.ThrowIfNull(preset);
        Layout.Theme = preset.IsEmpty ? null : preset.Clone();
        Persist();
    }

    /// <summary>Overrides the theme's primary colour with a hex value, or clears it when blank.</summary>
    public void SetThemePrimary(string? hex) => PatchTheme(theme => theme.Primary = Blank(hex));

    /// <summary>Overrides the theme's accent colour with a hex value, or clears it when blank.</summary>
    public void SetThemeAccent(string? hex) => PatchTheme(theme => theme.Accent = Blank(hex));

    /// <summary>Clears all layout theme overrides (back to the Graphite default).</summary>
    public void ResetTheme()
    {
        if (Layout.Theme is null)
        {
            return;
        }

        Layout.Theme = null;
        Persist();
    }

    private void PatchTheme(Action<DashTheme> patch)
    {
        var theme = Layout.Theme ?? new DashTheme();
        patch(theme);
        Layout.Theme = theme.IsEmpty ? null : theme;
        Persist();
    }

    // ── Widget stacks ─────────────────────────────────────────────────────────

    public DashWidgetStack? SelectedStack =>
        SelectedStackId is null ? null : ActivePage is { } page ? DashLayoutEditor.FindStack(page, SelectedStackId) : null;

    /// <summary>The layer currently targeted for editing in the selected stack.</summary>
    public DashWidgetStackLayer? ActiveLayer
    {
        get
        {
            if (SelectedStack is not { } stack)
            {
                return null;
            }

            var id = ActiveLayerId ?? stack.DefaultLayerId;
            return stack.Layers.FirstOrDefault(l => string.Equals(l.Id, id, StringComparison.OrdinalIgnoreCase))
                ?? stack.Layers.FirstOrDefault();
        }
    }

    public void SelectStack(string? stackId)
    {
        SelectedStackId = stackId;
        SelectedWidgetId = null;
        ActiveLayerId = stackId is null ? null : SelectedStack?.DefaultLayerId ?? SelectedStack?.Layers.FirstOrDefault()?.Id;
        RaiseChanged();
    }

    public bool AddWidgetStack()
    {
        if (!DashLayoutEditor.TryAddWidgetStack(Layout, ActivePageId, out var stack) || stack is null)
        {
            return false;
        }

        SelectedWidgetId = null;
        SelectedStackId = stack.Id;
        ActiveLayerId = stack.DefaultLayerId;
        Persist();
        return true;
    }

    public bool DeleteSelectedStack()
    {
        if (SelectedStackId is not { } id || ActivePage is not { } page || !DashLayoutEditor.TryDeleteStack(page, id))
        {
            return false;
        }

        SelectedStackId = null;
        ActiveLayerId = null;
        Persist();
        return true;
    }

    public bool RenameStack(string name) => WithStack(stack => DashLayoutEditor.TryRenameStack(ActivePage!, stack.Id, name));

    public bool MoveStack(int col, int row) => WithStack(stack => DashLayoutEditor.TryMoveStack(Layout, ActivePageId, stack.Id, col, row));

    public bool ResizeStack(int colSpan, int rowSpan) => WithStack(stack => DashLayoutEditor.TryResizeStack(Layout, ActivePageId, stack.Id, colSpan, rowSpan));

    public bool AddStackLayer()
    {
        return WithStack(stack =>
        {
            if (!DashLayoutEditor.TryAddStackLayer(stack, out var layer) || layer is null)
            {
                return false;
            }

            ActiveLayerId = layer.Id;
            return true;
        });
    }

    public void SelectStackLayer(string layerId)
    {
        if (SelectedStack?.Layers.Any(l => string.Equals(l.Id, layerId, StringComparison.OrdinalIgnoreCase)) == true)
        {
            ActiveLayerId = layerId;
            RaiseChanged();
        }
    }

    public bool SetDefaultStackLayer(string layerId) => WithStack(stack => DashLayoutEditor.TrySetDefaultStackLayer(stack, layerId));

    public bool RenameStackLayer(string layerId, string name) => WithStack(stack => DashLayoutEditor.TryRenameStackLayer(stack, layerId, name));

    public bool DeleteStackLayer(string layerId)
    {
        return WithStack(stack =>
        {
            if (!DashLayoutEditor.TryDeleteStackLayer(stack, layerId))
            {
                return false;
            }

            if (string.Equals(ActiveLayerId, layerId, StringComparison.OrdinalIgnoreCase))
            {
                ActiveLayerId = stack.DefaultLayerId ?? stack.Layers.FirstOrDefault()?.Id;
            }

            return true;
        });
    }

    public bool AddWidgetToActiveLayer(string type)
    {
        return WithStack(stack =>
        {
            var layerId = ActiveLayer?.Id;
            return layerId is not null && DashLayoutEditor.TryAddWidgetToStackLayer(stack, layerId, type, out _);
        });
    }

    public bool DeleteLayerWidget(string widgetId)
    {
        return WithStack(stack =>
        {
            var layerId = ActiveLayer?.Id;
            return layerId is not null && DashLayoutEditor.TryDeleteStackLayerWidget(stack, layerId, widgetId);
        });
    }

    private bool WithStack(Func<DashWidgetStack, bool> op)
    {
        if (SelectedStack is not { } stack || !op(stack))
        {
            return false;
        }

        Persist();
        return true;
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
            SelectedStackId = null;
            ActiveLayerId = null;
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

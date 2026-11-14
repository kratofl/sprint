using System.Text.Json;
using Sprint.Desktop.Api.Telemetry;

namespace Sprint.Desktop.Features.Dashes;

/// <summary>A page entry shown as an editor tab. The Idle page is locked (present, not deletable/renamable via the regular-page ops).</summary>
public sealed record DashPageTab(string Id, string Name, bool IsIdle);

/// <summary>
/// Whether the current dash can be pushed to a physical screen, and an honest
/// one-line reason for the editor's screen-sync button (US27/US34). The shell resolves
/// this from the saved-device assignments; the controller only surfaces it so the
/// view can enable/disable and label the action without knowing about devices.
/// </summary>
public sealed record DashApplyAvailability(bool CanApply, string Summary)
{
    /// <summary>Optimistic default when no device context is supplied (e.g. unit tests / previews).</summary>
    public static DashApplyAvailability Available { get; } =
        new(true, "Apply this design to its assigned screen");

    /// <summary>Honest blocked state when no enabled screen targets this dash (US34).</summary>
    public static DashApplyAvailability None { get; } =
        new(false, "No screen assigned — assign this dash to a device on the Devices page");
}

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
    private readonly Func<DashApplyAvailability> _applyAvailability;

    public DashEditorController(DashLayout layout, Action<DashLayout> save, Func<DashApplyAvailability>? applyAvailability = null)
    {
        this.Layout = layout ?? throw new ArgumentNullException(nameof(layout));
        this._save = save ?? throw new ArgumentNullException(nameof(save));
        // No resolver → optimistically available (backward-compatible with callers/tests
        // that build the controller without device context). The shell injects a resolver
        // that reflects the real dash↔screen assignment so Apply is honest (US34).
        this._applyAvailability = applyAvailability ?? (() => DashApplyAvailability.Available);
        this.ActivePageId = layout.Pages.FirstOrDefault()?.Id ?? layout.IdlePage?.Id ?? "";
    }

    public DashLayout Layout { get; }

    public bool HasPersistenceFailure { get; private set; }

    public string? PersistenceMessage { get; private set; }

    public bool IsAdvancedMode => string.Equals(this.Layout.Mode, "advanced", StringComparison.OrdinalIgnoreCase);

    public bool RetryPersistence()
    {
        bool saved = this.TrySave();
        this.RaiseChanged();
        return saved;
    }

    public void SetMode(string mode)
    {
        string normalized = string.Equals(mode, "advanced", StringComparison.OrdinalIgnoreCase) ? "advanced" : "basic";
        if (string.Equals(this.Layout.Mode, normalized, StringComparison.OrdinalIgnoreCase))
        {
            return;
        }

        this.Layout.Mode = normalized;
        this.Persist();
    }

    public string ActivePageId { get; private set; }

    public string? SelectedWidgetId { get; private set; }

    /// <summary>Raised after any mutation that changed the layout or selection, so the view can rebuild.</summary>
    public event EventHandler? Changed;

    /// <summary>Raised when the user explicitly asks to push the current design to its assigned screen (US27).</summary>
    public event EventHandler<DashLayout>? ApplyToScreenRequested;

    /// <summary>The preview state the canvas simulates; <see cref="DashPreviewState.Live"/> uses the live/demo frame (US26).</summary>
    public DashPreviewState PreviewState { get; private set; } = DashPreviewState.Live;

    /// <summary>The dash's current target screen size (US15/US16), resolved from the layout and normalized for legacy dashes.</summary>
    public ScreenProfile TargetProfile => ScreenProfileCatalog.Resolve(this.Layout.ScreenProfileId);

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
        if (DashLayoutEditor.TargetsProfile(this.Layout, profile))
        {
            return false;
        }

        DashLayoutEditor.ApplyScreenProfile(this.Layout, profile);
        this.SelectedWidgetId = null;
        this.Persist();
        return true;
    }

    /// <summary>Selects the preview state the canvas renders (US26). Returns whether it changed.</summary>
    public bool SelectPreviewState(DashPreviewState state)
    {
        if (this.PreviewState == state)
        {
            return false;
        }

        this.PreviewState = state;
        this.RaiseChanged();
        return true;
    }

    /// <summary>The frame the canvas should render given the live frame and the selected preview state.</summary>
    public TelemetryFrame ResolveRenderFrame(TelemetryFrame liveFrame)
    {
        ArgumentNullException.ThrowIfNull(liveFrame);
        return DashPreviewFrames.Resolve(this.PreviewState, liveFrame);
    }

    /// <summary>Whether screen sync is currently offered, plus the honest reason shown on the button (US34).</summary>
    public DashApplyAvailability ApplyAvailability => this._applyAvailability();

    /// <summary>
    /// Signals intent to push the current design to the assigned physical screen (US27).
    /// The shell handles the actual hardware render/stream; edits never reach the wheel
    /// until this is invoked. No-op when no screen is assigned, so the action can never
    /// pretend to reach hardware that isn't there (US34).
    /// </summary>
    public void RequestApplyToScreen()
    {
        if (!this.ApplyAvailability.CanApply)
        {
            return;
        }

        ApplyToScreenRequested?.Invoke(this, this.Layout);
    }

    public IReadOnlyList<DashPageTab> PageTabs
    {
        get
        {
            List<DashPageTab> tabs = new List<DashPageTab>();
            if (this.Layout.IdlePage is { } idle)
            {
                tabs.Add(new DashPageTab(idle.Id, string.IsNullOrWhiteSpace(idle.Name) ? "Idle" : idle.Name, IsIdle: true));
            }

            tabs.AddRange(this.Layout.Pages.Select(p => new DashPageTab(p.Id, p.Name, IsIdle: false)));
            return tabs;
        }
    }

    public DashPage? ActivePage => DashLayoutEditor.FindPage(this.Layout, this.ActivePageId);

    public DashWidget? SelectedWidget =>
        this.SelectedWidgetId is null ? null : this.ActivePage?.Widgets.FirstOrDefault(w => string.Equals(w.Id, this.SelectedWidgetId, StringComparison.OrdinalIgnoreCase));

    public bool SelectPage(string pageId)
    {
        if (this.PageTabs.All(t => !string.Equals(t.Id, pageId, StringComparison.OrdinalIgnoreCase)))
        {
            return false;
        }

        if (string.Equals(pageId, this.ActivePageId, StringComparison.OrdinalIgnoreCase))
        {
            return false;
        }

        this.ActivePageId = pageId;
        this.SelectedWidgetId = null;
        this.RaiseChanged();
        return true;
    }

    public void SelectWidget(string? widgetId)
    {
        if (string.Equals(widgetId, this.SelectedWidgetId, StringComparison.OrdinalIgnoreCase))
        {
            return;
        }

        this.SelectedWidgetId = widgetId;
        this.RaiseChanged();
    }

    public bool AddWidget(string type)
    {
        if (!DashLayoutEditor.TryAddWidget(this.Layout, this.ActivePageId, type, out DashWidget? widget) || widget is null)
        {
            return false;
        }

        this.SelectedWidgetId = widget.Id;
        this.Persist();
        return true;
    }

    /// <summary>Default grid span a freshly-added widget occupies (for the palette drag ghost).</summary>
    public (int ColSpan, int RowSpan) DefaultSpan => (
        Math.Min(DashLayoutEditor.DefaultWidgetColSpan, Math.Max(1, this.Layout.GridCols)),
        Math.Min(DashLayoutEditor.DefaultWidgetRowSpan, Math.Max(1, this.Layout.GridRows)));

    /// <summary>Add a widget at an explicit grid cell (palette drag-drop).</summary>
    public bool AddWidgetAt(string type, int col, int row)
    {
        if (!DashLayoutEditor.TryAddWidgetAt(this.Layout, this.ActivePageId, type, col, row, out DashWidget? widget) || widget is null)
        {
            return false;
        }

        this.SelectedWidgetId = widget.Id;
        this.Persist();
        return true;
    }

    /// <summary>Non-mutating placement preview for the live drag/resize ghost.</summary>
    public bool CanPlace(DashWidget widget, int col, int row, int colSpan, int rowSpan)
    {
        ArgumentNullException.ThrowIfNull(widget);
        return DashLayoutEditor.CanPlaceWidget(this.Layout, this.ActivePageId, widget.Id, col, row, colSpan, rowSpan);
    }

    /// <summary>Non-mutating placement preview for a not-yet-created widget (palette drag).</summary>
    public bool CanPlaceNew(int col, int row, int colSpan, int rowSpan) =>
        DashLayoutEditor.CanPlaceNewWidget(this.Layout, this.ActivePageId, col, row, colSpan, rowSpan);

    public bool MoveSelected(int col, int row) =>
        this.WithSelected(id => DashLayoutEditor.TryMoveWidget(this.Layout, this.ActivePageId, id, col, row));

    public bool ResizeSelected(int colSpan, int rowSpan) =>
        this.WithSelected(id => DashLayoutEditor.TryResizeWidget(this.Layout, this.ActivePageId, id, colSpan, rowSpan));

    /// <summary>Set the selected widget's full geometry (edge/corner resize that moves the origin).</summary>
    public bool ResizeSelectedTo(int col, int row, int colSpan, int rowSpan) =>
        this.WithSelected(id => DashLayoutEditor.TrySetWidgetGeometry(this.Layout, this.ActivePageId, id, col, row, colSpan, rowSpan));

    /// <summary>Reads a string config value on the selected widget (inspector fields).</summary>
    public string GetSelectedConfig(string key)
    {
        if (this.SelectedWidget?.Config is { } config &&
            config.TryGetValue(key, out JsonElement element) &&
            element.ValueKind == JsonValueKind.String)
        {
            return element.GetString() ?? string.Empty;
        }

        return string.Empty;
    }

    /// <summary>Sets (or clears, when empty) a string config value on the selected widget.</summary>
    public bool SetSelectedConfig(string key, string? value)
    {
        if (this.SelectedWidget is not { } widget || string.IsNullOrWhiteSpace(key))
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

        this.Persist();
        return true;
    }

    /// <summary>The selected widget's style (never null once accessed for display; empty = all defaults).</summary>
    public DashWidgetStyle SelectedStyle => this.SelectedWidget?.Style ?? new DashWidgetStyle();

    /// <summary>Override the selected widget's main value colour (style-color token, or null to inherit).</summary>
    public bool SetSelectedTextColor(string? token) => this.PatchStyle(style => style.TextColor = Blank(token));

    /// <summary>Override the selected widget's label/caption colour (style-color token, or null to inherit).</summary>
    public bool SetSelectedLabelColor(string? token) => this.PatchStyle(style => style.LabelColor = Blank(token));

    private bool PatchStyle(Action<DashWidgetStyle> patch)
    {
        if (this.SelectedWidget is not { } widget)
        {
            return false;
        }

        DashWidgetStyle style = widget.Style ?? new DashWidgetStyle();
        patch(style);
        widget.Style = style.IsEmpty ? null : style;
        this.Persist();
        return true;
    }

    private static string? Blank(string? token) => string.IsNullOrWhiteSpace(token) ? null : token;

    public bool DeleteSelected()
    {
        if (this.SelectedWidgetId is not { } id || !DashLayoutEditor.TryDeleteWidget(this.Layout, this.ActivePageId, id))
        {
            return false;
        }

        this.SelectedWidgetId = null;
        this.Persist();
        return true;
    }

    public bool ClearActivePage()
    {
        if (!DashLayoutEditor.TryClearPage(this.Layout, this.ActivePageId))
        {
            return false;
        }

        this.SelectedWidgetId = null;
        this.Persist();
        return true;
    }

    public DashPage AddPage()
    {
        DashPage page = DashLayoutEditor.AddPage(this.Layout, "Page");
        this.ActivePageId = page.Id;
        this.SelectedWidgetId = null;
        this.Persist();
        return page;
    }

    public bool RenamePage(string pageId, string name)
    {
        if (!DashLayoutEditor.TryRenamePage(this.Layout, pageId, name))
        {
            return false;
        }

        this.Persist();
        return true;
    }

    /// <summary>Rename the whole dash layout (editor header title). No-op on blank/unchanged.</summary>
    public bool RenameLayout(string name)
    {
        string trimmed = (name ?? string.Empty).Trim();
        if (trimmed.Length == 0 || string.Equals(trimmed, this.Layout.Name, StringComparison.Ordinal))
        {
            return false;
        }

        this.Layout.Name = trimmed;
        this.Persist();
        return true;
    }

    /// <summary>Whether a change-alert of the given type is configured on the layout.</summary>
    public bool IsAlertEnabled(string type) =>
        this.GetAlert(type)?.Enabled == true;

    public DashAlertConfig AlertConfig => this.Layout.AlertConfig ?? new DashAlertConfig();

    /// <summary>Enable/disable a change-alert while preserving its authored geometry and overrides.</summary>
    public void SetAlert(string type, bool enabled)
    {
        DashAlert? alert = this.GetAlert(type);
        if (alert?.Enabled == enabled || (alert is null && !enabled))
        {
            return;
        }

        if (alert is null)
        {
            this.Layout.Alerts.Add(new DashAlert { Id = type, Type = type, Enabled = true });
        }
        else
        {
            alert.Enabled = enabled;
        }

        this.SyncAlertEnabledTypes();
        this.Persist();
    }

    public void SetAlertDisplayMode(string mode) => this.PatchAlertConfig(config =>
    {
        config.DisplayMode = string.Equals(mode, "center", StringComparison.OrdinalIgnoreCase) ? "center" : "full";
    });

    public void SetAlertDuration(double seconds) => this.PatchAlertConfig(config =>
    {
        config.DurationSeconds = Math.Clamp(Math.Round(seconds, 1), 0.5, 5.0);
    });

    public void SetAlertInvertColors(bool invert) => this.PatchAlertConfig(config =>
    {
        config.InvertColors = invert;
    });

    public void SetAlertColorToken(string token) => this.PatchAlertConfig(config =>
    {
        config.ColorToken = NormalizeAlertColor(token);
    });

    public DashAlert? GetAlert(string type) =>
        this.Layout.Alerts.FirstOrDefault(alert => string.Equals(alert.Type, type, StringComparison.OrdinalIgnoreCase));

    public DashAlertConfig EffectiveAlertConfig(string type)
    {
        DashAlertConfig result = this.AlertConfig.Clone();
        if (this.GetAlert(type) is { } alert)
        {
            result.DisplayMode = alert.DisplayMode ?? result.DisplayMode;
            result.ColorToken = alert.ColorToken ?? result.ColorToken;
            result.DurationSeconds = alert.DurationSeconds ?? result.DurationSeconds;
            result.InvertColors = alert.InvertColors ?? result.InvertColors;
        }

        return result;
    }

    public bool SetAlertGeometry(string type, int col, int row, int colSpan, int rowSpan)
    {
        if (this.GetAlert(type) is not { } alert)
        {
            return false;
        }

        colSpan = Math.Clamp(colSpan, 2, this.Layout.GridCols);
        rowSpan = Math.Clamp(rowSpan, 2, this.Layout.GridRows);
        col = Math.Clamp(col, 0, this.Layout.GridCols - colSpan);
        row = Math.Clamp(row, 0, this.Layout.GridRows - rowSpan);
        if (alert.Col == col && alert.Row == row && alert.ColSpan == colSpan && alert.RowSpan == rowSpan)
        {
            return false;
        }

        alert.Col = col;
        alert.Row = row;
        alert.ColSpan = colSpan;
        alert.RowSpan = rowSpan;
        this.Persist();
        return true;
    }

    public void SetAlertUseGlobal(string type, bool useGlobal)
    {
        if (this.GetAlert(type) is not { } alert)
        {
            return;
        }

        if (useGlobal)
        {
            alert.DisplayMode = null;
            alert.ColorToken = null;
            alert.DurationSeconds = null;
            alert.InvertColors = null;
        }
        else if (alert.UsesGlobalSettings)
        {
            DashAlertConfig global = this.AlertConfig;
            alert.DisplayMode = global.DisplayMode;
            alert.ColorToken = global.ColorToken;
            alert.DurationSeconds = global.DurationSeconds;
            alert.InvertColors = global.InvertColors;
        }

        this.Persist();
    }

    public void SetAlertColorToken(string type, string? token)
    {
        if (this.GetAlert(type) is not { } alert)
        {
            return;
        }

        alert.ColorToken = NormalizeAlertColor(token);
        this.Persist();
    }

    public void SetAlertDuration(string type, double seconds)
    {
        if (this.GetAlert(type) is not { } alert)
        {
            return;
        }

        alert.DurationSeconds = Math.Clamp(Math.Round(seconds, 1), 0.5, 5.0);
        this.Persist();
    }

    public void SetAlertInvertColors(string type, bool invert)
    {
        if (this.GetAlert(type) is not { } alert)
        {
            return;
        }

        alert.InvertColors = invert;
        this.Persist();
    }

    private static string NormalizeAlertColor(string? token)
    {
        string canonical = DashThemePresets.CanonicalAlertColorToken(token);
        return DashThemePresets.FindByAlertColorToken(canonical) is not null || canonical == "yellow"
            ? canonical
            : "auto";
    }

    private void PatchAlertConfig(Action<DashAlertConfig> patch)
    {
        DashAlertConfig config = this.Layout.AlertConfig?.Clone() ?? new DashAlertConfig();
        patch(config);
        config.EnabledTypes = this.Layout.Alerts.Where(alert => alert.Enabled).Select(alert => alert.Type).Distinct(StringComparer.OrdinalIgnoreCase).ToList();
        this.Layout.AlertConfig = config.IsDefault ? null : config;
        this.Persist();
    }

    private void SyncAlertEnabledTypes()
    {
        if (this.Layout.AlertConfig is null)
        {
            return;
        }

        this.Layout.AlertConfig.EnabledTypes = this.Layout.Alerts.Where(alert => alert.Enabled).Select(alert => alert.Type).Distinct(StringComparer.OrdinalIgnoreCase).ToList();
        if (this.Layout.AlertConfig.IsDefault)
        {
            this.Layout.AlertConfig = null;
        }
    }

    // ── Theme (layout-level palette) ──────────────────────────────────────────

    /// <summary>Applies a named preset's overrides to the layout (empty preset clears the theme).</summary>
    public void ApplyThemePreset(DashTheme preset)
    {
        ArgumentNullException.ThrowIfNull(preset);
        this.Layout.Theme = preset.IsEmpty ? null : preset.Clone();
        this.Layout.ColorSystem = preset.IsEmpty ? DashColorSystem.Functional : DashColorSystem.Styled;
        this.Persist();
    }

    // ── Dash style (layout-level widget chrome) ───────────────────────────────

    /// <summary>Sets how every widget is framed; the layout itself does not change. False when the style is already in effect.</summary>
    public bool SetDashStyle(DashStyle style)
    {
        if (this.Layout.DashStyle == style)
        {
            return false;
        }

        this.Layout.DashStyle = style;
        this.Persist();
        return true;
    }

    public bool DeletePage(string pageId)
    {
        if (!DashLayoutEditor.TryDeletePage(this.Layout, pageId))
        {
            return false;
        }

        if (string.Equals(pageId, this.ActivePageId, StringComparison.OrdinalIgnoreCase))
        {
            this.ActivePageId = this.Layout.Pages.FirstOrDefault()?.Id ?? this.Layout.IdlePage?.Id ?? "";
            this.SelectedWidgetId = null;
        }

        this.Persist();
        return true;
    }

    private bool WithSelected(Func<string, bool> op)
    {
        if (this.SelectedWidgetId is not { } id || !op(id))
        {
            return false;
        }

        this.Persist();
        return true;
    }

    private void Persist()
    {
        this.TrySave();
        this.RaiseChanged();
    }

    private bool TrySave()
    {
        try
        {
            this._save(this.Layout);
            this.HasPersistenceFailure = false;
            this.PersistenceMessage = null;
            return true;
        }
        catch (Exception)
        {
            // The layout is already mutated in memory. Keep the edit available
            // and expose an explicit recovery action instead of rolling it back or
            // falsely reporting success.
            this.HasPersistenceFailure = true;
            this.PersistenceMessage = "Changes are retained in the editor. Retry saving.";
            return false;
        }
    }

    private void RaiseChanged() => Changed?.Invoke(this, EventArgs.Empty);
}

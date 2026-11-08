using Sprint.Desktop.Api.Telemetry;
using Sprint.Desktop.Features.Dashes;
using Xunit;

namespace Sprint.Desktop.Tests;

public sealed class DashEditorControllerTests
{
    private static DashLayout NewLayout() => new()
    {
        Id = "edit-me",
        Name = "Edit Me",
        GridCols = 20,
        GridRows = 12,
        IdlePage = new DashPage { Id = "idle", Name = "Idle" },
        Pages = [new DashPage { Id = "main", Name = "Main" }],
    };

    [Fact]
    public void AddWidgetPlacesSelectsAndSaves()
    {
        int saves = 0;
        DashEditorController controller = new DashEditorController(NewLayout(), _ => saves++);

        Assert.True(controller.AddWidget("gear_speed"));

        DashWidget widget = Assert.Single(controller.ActivePage!.Widgets);
        Assert.Equal("gear_speed", widget.Type);
        Assert.Equal(widget.Id, controller.SelectedWidgetId);
        Assert.Equal(1, saves);
    }

    [Fact]
    public void AddWidgetRejectsUnknownTypeWithoutSaving()
    {
        int saves = 0;
        DashEditorController controller = new DashEditorController(NewLayout(), _ => saves++);

        Assert.False(controller.AddWidget("does_not_exist"));
        Assert.Empty(controller.ActivePage!.Widgets);
        Assert.Equal(0, saves);
    }

    [Fact]
    public void MoveSelectedClampsToGridAndSaves()
    {
        int saves = 0;
        DashEditorController controller = new DashEditorController(NewLayout(), _ => saves++);
        controller.AddWidget("fuel");
        saves = 0;

        Assert.True(controller.MoveSelected(100, 100)); // clamped into bounds
        DashWidget widget = controller.SelectedWidget!;
        Assert.True(widget.Col + widget.ColSpan <= 20);
        Assert.True(widget.Row + widget.RowSpan <= 12);
        Assert.Equal(1, saves);
    }

    [Fact]
    public void SetSelectedConfigStoresAndClearsStringValues()
    {
        int saves = 0;
        DashEditorController controller = new DashEditorController(NewLayout(), _ => saves++);
        controller.AddWidget("text");
        saves = 0;

        Assert.True(controller.SetSelectedConfig("content", "P1"));
        Assert.Equal("P1", controller.GetSelectedConfig("content"));
        Assert.Equal(1, saves);

        // Empty value clears the key; clearing the last key drops the config dictionary.
        Assert.True(controller.SetSelectedConfig("content", ""));
        Assert.Equal(string.Empty, controller.GetSelectedConfig("content"));
        Assert.Null(controller.SelectedWidget!.Config);
        Assert.Equal(2, saves);
    }

    [Fact]
    public void SetTargetProfileRefitsGridPersistsAndClearsSelection()
    {
        int saves = 0;
        DashEditorController controller = new DashEditorController(NewLayout(), _ => saves++);
        controller.AddWidget("gear_speed");
        Assert.NotNull(controller.SelectedWidgetId);
        saves = 0;

        ScreenProfile portrait = ScreenProfileCatalog.Resolve("portrait-480x854");
        Assert.True(controller.SetTargetProfile(portrait));

        Assert.Equal("portrait-480x854", controller.Layout.ScreenProfileId);
        Assert.Equal(portrait.GridCols, controller.Layout.GridCols);
        Assert.Equal(portrait.GridRows, controller.Layout.GridRows);
        Assert.Equal(portrait, controller.TargetProfile);
        Assert.Null(controller.SelectedWidgetId);
        Assert.True(DashLayoutValidator.IsValid(controller.Layout));
        Assert.Equal(1, saves);

        // Re-selecting the same size is a no-op (no extra save).
        Assert.False(controller.SetTargetProfile(portrait));
        Assert.Equal(1, saves);
    }

    [Fact]
    public void SelectPreviewStateChangesTheFrameUsedForRender()
    {
        DashEditorController controller = new DashEditorController(NewLayout(), _ => { });
        TelemetryFrame live = new Sprint.Desktop.Api.Telemetry.TelemetryFrame();

        // Live passes the live frame straight through.
        Assert.Same(live, controller.ResolveRenderFrame(live));

        int changed = 0;
        controller.Changed += (_, _) => changed++;

        Assert.True(controller.SelectPreviewState(DashPreviewState.Redline));
        Assert.Equal(DashPreviewState.Redline, controller.PreviewState);
        Assert.Equal(1, changed);

        TelemetryFrame previewed = controller.ResolveRenderFrame(live);
        Assert.NotSame(live, previewed);
        Assert.True(previewed.Car.Rpm > previewed.Car.MaxRpm * 0.95f, "Redline preview should sit near the rev limit.");

        // Re-selecting the same state is a no-op.
        Assert.False(controller.SelectPreviewState(DashPreviewState.Redline));
        Assert.Equal(1, changed);
    }

    [Fact]
    public void RequestApplyToScreenRaisesIntentWithTheLayout()
    {
        DashLayout layout = NewLayout();
        DashEditorController controller = new DashEditorController(layout, _ => { });

        DashLayout? applied = null;
        controller.ApplyToScreenRequested += (_, l) => applied = l;

        controller.RequestApplyToScreen();

        Assert.Same(layout, applied);
    }

    [Fact]
    public void ApplyToScreenIsBlockedWhenNoScreenIsAssigned()
    {
        DashLayout layout = NewLayout();
        // A resolver that reports the honest "no screen assigned" state (US34).
        DashEditorController controller = new DashEditorController(layout, _ => { }, () => DashApplyAvailability.None);

        int raised = 0;
        controller.ApplyToScreenRequested += (_, _) => raised++;

        controller.RequestApplyToScreen();

        Assert.False(controller.ApplyAvailability.CanApply);
        Assert.Equal(0, raised);
    }

    [Fact]
    public void ApplyToScreenSurfacesTheResolvedTargetSummary()
    {
        DashLayout layout = NewLayout();
        DashApplyAvailability target = new DashApplyAvailability(true, "Apply to Omega Wheel");
        DashEditorController controller = new DashEditorController(layout, _ => { }, () => target);

        DashLayout? applied = null;
        controller.ApplyToScreenRequested += (_, l) => applied = l;

        controller.RequestApplyToScreen();

        Assert.True(controller.ApplyAvailability.CanApply);
        Assert.Equal("Apply to Omega Wheel", controller.ApplyAvailability.Summary);
        Assert.Same(layout, applied);
    }

    [Fact]
    public void SetSelectedConfigWithoutSelectionIsNoOp()
    {
        int saves = 0;
        DashEditorController controller = new DashEditorController(NewLayout(), _ => saves++);

        Assert.False(controller.SetSelectedConfig("content", "x"));
        Assert.Equal(0, saves);
    }

    [Fact]
    public void StyleOverridesSetAndCollapseToNullWhenEmptied()
    {
        int saves = 0;
        DashEditorController controller = new DashEditorController(NewLayout(), _ => saves++);
        controller.AddWidget("gear_speed");
        DashWidget widget = controller.SelectedWidget!;
        saves = 0;

        Assert.True(controller.SetSelectedTextColor("red"));
        Assert.True(controller.SetSelectedLabelColor("muted"));
        Assert.Equal("red", widget.Style!.TextColor);
        Assert.Equal("muted", widget.Style!.LabelColor);
        Assert.Equal(2, saves);

        // Clearing every override collapses the style back to null (no empty object persisted).
        Assert.True(controller.SetSelectedTextColor(null));
        Assert.True(controller.SetSelectedLabelColor(null));
        Assert.Null(widget.Style);
    }

    [Fact]
    public void DashStyleChangesOnlyTheChromeAndSkipsANoOp()
    {
        int saves = 0;
        DashEditorController controller = new DashEditorController(NewLayout(), _ => saves++);
        controller.AddWidget("gear_speed");
        DashWidget widget = controller.SelectedWidget!;
        (int Col, int Row, int ColSpan, int RowSpan) placement = (widget.Col, widget.Row, widget.ColSpan, widget.RowSpan);
        saves = 0;

        Assert.False(controller.SetDashStyle(DashStyle.Panels));
        Assert.True(controller.SetDashStyle(DashStyle.Bars));
        Assert.Equal(DashStyle.Bars, controller.Layout.DashStyle);
        Assert.Equal(placement, (widget.Col, widget.Row, widget.ColSpan, widget.RowSpan));
        Assert.Equal(1, saves);
    }

    [Fact]
    public void ThemePresetAppliesAndResetClears()
    {
        int saves = 0;
        DashEditorController controller = new DashEditorController(NewLayout(), _ => saves++);

        DashTheme ice = DashThemePresets.All.First(preset => preset.Name == "Ice").Theme;
        controller.ApplyThemePreset(ice);
        Assert.Equal("#1F7FE6", controller.Layout.Theme!.Primary);
        Assert.Equal("Ice", DashThemePresets.MatchName(controller.Layout));

        // The empty "Graphite" preset clears the theme rather than persisting an empty object.
        controller.ApplyThemePreset(DashThemePresets.All.First(preset => preset.Name == "Graphite").Theme);
        Assert.Null(controller.Layout.Theme);
    }

    [Fact]
    public void ThemePresetMatchingUsesTheRenderedColorSystemAndEveryPersistedCondition()
    {
        DashLayout customStyled = NewLayout();
        customStyled.ColorSystem = DashColorSystem.Styled;
        customStyled.Theme = new DashTheme { ColdLow = "#123456" };
        Assert.Null(DashThemePresets.MatchName(customStyled));

        DashLayout functionalWithIgnoredOpticalTheme = NewLayout();
        functionalWithIgnoredOpticalTheme.ColorSystem = DashColorSystem.Functional;
        functionalWithIgnoredOpticalTheme.Theme = DashThemePresets.All.First(preset => preset.Name == "Ice").Theme.Clone();
        Assert.Equal("Graphite", DashThemePresets.MatchName(functionalWithIgnoredOpticalTheme));
    }

    [Fact]
    public void SuzukiThemePresetUsesPurplePrimary()
    {
        DashThemePresets.Preset? suzuki = DashThemePresets.All.FirstOrDefault(preset => preset.Name == "Suzuki");

        Assert.NotNull(suzuki);
        Assert.Equal("#7C3AED", suzuki!.Theme.Primary);
        Assert.Equal("#B15CFF", suzuki.Theme.Accent);
    }

    [Fact]
    public void MoveOntoAnotherWidgetIsRejected()
    {
        DashEditorController controller = new DashEditorController(NewLayout(), _ => { });
        controller.AddWidget("fuel");     // slot 0,0
        DashWidget first = controller.SelectedWidget!;
        controller.AddWidget("lap_time"); // next free slot
        DashWidget second = controller.SelectedWidget!;

        // Move the second widget on top of the first: rejected, so it stays put.
        Assert.False(controller.MoveSelected(first.Col, first.Row));
        Assert.False(first.Col == second.Col && first.Row == second.Row);
    }

    [Fact]
    public void ResizeSelectedSaves()
    {
        int saves = 0;
        DashEditorController controller = new DashEditorController(NewLayout(), _ => saves++);
        controller.AddWidget("tyre_temp");
        saves = 0;

        Assert.True(controller.ResizeSelected(6, 4));
        Assert.Equal(6, controller.SelectedWidget!.ColSpan);
        Assert.Equal(4, controller.SelectedWidget!.RowSpan);
        Assert.Equal(1, saves);
    }

    [Fact]
    public void DeleteSelectedRemovesAndClearsSelection()
    {
        DashEditorController controller = new DashEditorController(NewLayout(), _ => { });
        controller.AddWidget("delta");

        Assert.True(controller.DeleteSelected());
        Assert.Null(controller.SelectedWidgetId);
        Assert.Empty(controller.ActivePage!.Widgets);
    }

    [Fact]
    public void AddPageBecomesActiveAndClearsSelection()
    {
        DashEditorController controller = new DashEditorController(NewLayout(), _ => { });
        controller.AddWidget("fuel");

        DashPage page = controller.AddPage();
        Assert.Equal(page.Id, controller.ActivePageId);
        Assert.Null(controller.SelectedWidgetId);
        Assert.Contains(controller.PageTabs, t => t.Id == page.Id && !t.IsIdle);
    }

    [Fact]
    public void IdlePageIsAToggleableLockedTab()
    {
        DashEditorController controller = new DashEditorController(NewLayout(), _ => { });
        DashPageTab idle = Assert.Single(controller.PageTabs, t => t.IsIdle);

        Assert.True(controller.SelectPage(idle.Id));
        Assert.Equal(idle.Id, controller.ActivePageId);
        Assert.True(controller.AddWidget("text")); // widgets can be edited on the idle page
        Assert.Single(controller.Layout.IdlePage!.Widgets);

        // The idle page is not a deletable regular page.
        Assert.False(controller.DeletePage(idle.Id));
    }

    [Fact]
    public void DeleteActivePageReselectsAndSaves()
    {
        int saves = 0;
        DashLayout layout = NewLayout();
        DashEditorController controller = new DashEditorController(layout, _ => saves++);
        DashPage extra = controller.AddPage(); // "main" + new page
        controller.SelectPage(extra.Id);
        saves = 0;

        Assert.True(controller.DeletePage(extra.Id));
        Assert.NotEqual(extra.Id, controller.ActivePageId);
        Assert.Equal(1, saves);
    }

    [Fact]
    public void RenamePagePersists()
    {
        DashEditorController controller = new DashEditorController(NewLayout(), _ => { });
        Assert.True(controller.RenamePage("main", "Race Trim"));
        Assert.Contains(controller.PageTabs, t => t.Name == "Race Trim");
    }

    [Fact]
    public void ActivePageUsesStrictLayoutEditorLookup()
    {
        DashLayout layout = NewLayout();
        DashEditorController controller = new DashEditorController(layout, _ => { });

        Assert.Same(layout.Pages[0], DashLayoutEditor.FindPage(layout, controller.ActivePageId));
        Assert.Null(DashLayoutEditor.FindPage(layout, "missing-page"));
    }

    [Fact]
    public void DashboardModePersistsAndNormalizes()
    {
        int saves = 0;
        DashEditorController controller = new DashEditorController(NewLayout(), _ => saves++);

        controller.SetMode("advanced");
        Assert.True(controller.IsAdvancedMode);
        Assert.Equal("advanced", controller.Layout.Mode);

        controller.SetMode("anything-else");
        Assert.False(controller.IsAdvancedMode);
        Assert.Equal("basic", controller.Layout.Mode);
        Assert.Equal(2, saves);
    }

    [Fact]
    public void FailedOptimisticPersistenceRetainsTheEditAndSupportsRetryWithoutSuccessNoise()
    {
        bool fail = true;
        int saves = 0;
        DashEditorController controller = new DashEditorController(NewLayout(), _ =>
        {
            saves++;
            if (fail)
            {
                throw new IOException("disk unavailable");
            }
        });

        controller.SetMode("advanced");

        Assert.True(controller.IsAdvancedMode);
        Assert.True(controller.HasPersistenceFailure);
        Assert.Equal("Changes are retained in the editor. Retry saving.", controller.PersistenceMessage);
        Assert.Equal(1, saves);

        fail = false;
        Assert.True(controller.RetryPersistence());
        Assert.False(controller.HasPersistenceFailure);
        Assert.Null(controller.PersistenceMessage);
        Assert.Equal(2, saves);
    }

    [Fact]
    public void AlertGeometryAndIndividualOverridesPersistIndependently()
    {
        int saves = 0;
        DashLayout layout = NewLayout();
        layout.AlertConfig = new DashAlertConfig { ColorToken = "ember", DurationSeconds = 1.8, InvertColors = false };
        DashEditorController controller = new DashEditorController(layout, _ => saves++);
        controller.SetAlert("tc_change", true);

        Assert.True(controller.SetAlertGeometry("tc_change", 17, 10, 8, 6));
        DashAlert alert = Assert.IsType<DashAlert>(controller.GetAlert("tc_change"));
        Assert.Equal((12, 6, 8, 6), (alert.Col, alert.Row, alert.ColSpan, alert.RowSpan));

        controller.SetAlertUseGlobal("tc_change", false);
        controller.SetAlertColorToken("tc_change", "blue");
        controller.SetAlertDuration("tc_change", 2.4);
        controller.SetAlertInvertColors("tc_change", true);
        DashAlertConfig effective = controller.EffectiveAlertConfig("tc_change");
        Assert.Equal("ice", effective.ColorToken);
        Assert.Equal(2.4, effective.DurationSeconds);
        Assert.True(effective.InvertColors);

        controller.SetAlertUseGlobal("tc_change", true);
        effective = controller.EffectiveAlertConfig("tc_change");
        Assert.Equal("ember", effective.ColorToken);
        Assert.Equal(1.8, effective.DurationSeconds);
        Assert.False(effective.InvertColors);
        Assert.True(alert.UsesGlobalSettings);
        Assert.True(saves >= 7);
    }

    [Fact]
    public void DisablingAlertPreservesGeometryAndIndividualSettings()
    {
        DashEditorController controller = new DashEditorController(NewLayout(), _ => { });
        controller.SetAlert("abs_change", true);
        controller.SetAlertGeometry("abs_change", 2, 4, 12, 5);
        controller.SetAlertUseGlobal("abs_change", false);
        controller.SetAlertColorToken("abs_change", "red");
        DashAlert alert = Assert.IsType<DashAlert>(controller.GetAlert("abs_change"));

        controller.SetAlert("abs_change", false);
        Assert.False(controller.IsAlertEnabled("abs_change"));
        Assert.Same(alert, controller.GetAlert("abs_change"));
        Assert.Equal((2, 4, 12, 5), (alert.Col, alert.Row, alert.ColSpan, alert.RowSpan));
        Assert.Equal("crimson", alert.ColorToken);

        controller.SetAlert("abs_change", true);
        Assert.True(controller.IsAlertEnabled("abs_change"));
        Assert.Same(alert, controller.GetAlert("abs_change"));
    }
}

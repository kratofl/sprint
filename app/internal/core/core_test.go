package core

import (
	"context"
	"io"
	"log/slog"
	"reflect"
	"strings"
	"testing"

	"github.com/kratofl/sprint/app/internal/commands"
	"github.com/kratofl/sprint/app/internal/core/dashboard"
	"github.com/kratofl/sprint/app/internal/core/dashboard/widgets"
	"github.com/kratofl/sprint/app/internal/hardware"
	"github.com/kratofl/sprint/pkg/dto"
)

func TestReloadDashCommandsBuildsDeviceOnlyWrapperCycleCommandsFromSavedLayouts(t *testing.T) {
	commands.ReplaceDynamic(nil)
	t.Cleanup(func() {
		commands.ReplaceDynamic(nil)
	})

	manager := dashboard.NewManager(nil)
	layout := testLayoutWithWrapperGroup()
	if err := manager.Save(layout); err != nil {
		t.Fatalf("Save layout: %v", err)
	}

	coord := New(slog.New(slog.NewTextHandler(io.Discard, nil)), manager, nil)
	coord.ReloadDashCommands()

	var ids []string
	metaByID := map[string]commands.CommandMeta{}
	for _, meta := range commands.Catalog() {
		id := string(meta.ID)
		if strings.HasPrefix(id, "dash.wrapper.") {
			ids = append(ids, id)
			metaByID[id] = meta
		}
	}

	if got, want := len(ids), 2; got != want {
		t.Fatalf("expected %d wrapper commands, got %d (%#v)", want, got, ids)
	}

	assertHasCommand(t, ids, "dash.wrapper.layout-a.page-main.stack.next")
	assertHasCommand(t, ids, "dash.wrapper.layout-a.page-main.stack.prev")

	for _, id := range ids {
		if strings.Contains(id, ".show.") {
			t.Fatalf("expected direct-select wrapper commands to be removed, found %q", id)
		}
		if !metaByID[id].DeviceOnly {
			t.Fatalf("expected wrapper command %q to be device-only", id)
		}
	}
}

func TestCycleWrapperWrapsAroundBothDirections(t *testing.T) {
	layout := testLayoutWithWrapperGroup()
	driver := &stubScreenDriver{}
	coord := &Coordinator{
		entries: map[string]*deviceEntry{
			"screen-a": {
				driver:            driver,
				layoutID:          layout.ID,
				currentLayout:     layout,
				widgetStackStates: defaultWidgetStackStates(layout),
			},
		},
	}

	pageID := layout.Pages[0].ID
	groupID := layout.Pages[0].WidgetStacks[0].ID

	coord.cycleWidgetStack("", layout.ID, pageID, groupID, -1)
	if got, want := coord.entries["screen-a"].widgetStackStates[widgetStackStateKey(pageID, groupID)], "variant-b"; got != want {
		t.Fatalf("expected prev from first layer to wrap to %q, got %q", want, got)
	}
	if got, want := driver.lastVariantID, "variant-b"; got != want {
		t.Fatalf("expected driver to receive wrapped prev variant %q, got %q", want, got)
	}

	coord.cycleWidgetStack("", layout.ID, pageID, groupID, 1)
	if got, want := coord.entries["screen-a"].widgetStackStates[widgetStackStateKey(pageID, groupID)], "variant-a"; got != want {
		t.Fatalf("expected next from last layer to wrap to %q, got %q", want, got)
	}
	if got, want := driver.lastVariantID, "variant-a"; got != want {
		t.Fatalf("expected driver to receive wrapped next variant %q, got %q", want, got)
	}
}

func TestApplyRenderPreferencesBroadcastsBundleToAllDrivers(t *testing.T) {
	d1 := &stubScreenDriver{}
	d2 := &stubScreenDriver{}
	coord := &Coordinator{
		entries: map[string]*deviceEntry{
			"a": {driver: d1},
			"b": {driver: d2},
		},
	}

	prefs := dashboard.RenderPreferences{Profile: dashboard.RenderProfile{DriverName: "Alice"}}
	coord.ApplyRenderPreferences(prefs)

	if !d1.applied || !reflect.DeepEqual(d1.lastPrefs, prefs) {
		t.Fatalf("driver a did not receive the bundle: applied=%v prefs=%#v", d1.applied, d1.lastPrefs)
	}
	if !d2.applied || !reflect.DeepEqual(d2.lastPrefs, prefs) {
		t.Fatalf("driver b did not receive the bundle: applied=%v prefs=%#v", d2.applied, d2.lastPrefs)
	}
}

func TestCoordinatorSetProfileMergesAndPreservesDefaults(t *testing.T) {
	coord := New(slog.New(slog.NewTextHandler(io.Discard, nil)), nil, nil)
	stub := &stubScreenDriver{}
	coord.entries = map[string]*deviceEntry{"a": {driver: stub}}

	coord.SetProfile(dashboard.RenderProfile{DriverName: "Bob"})

	if !stub.applied {
		t.Fatal("SetProfile did not broadcast a render-preferences bundle to the driver")
	}
	if stub.lastPrefs.Profile.DriverName != "Bob" {
		t.Fatalf("profile not applied: %#v", stub.lastPrefs.Profile)
	}
	// A single-field update must not clobber the other fields with zero values:
	// they should remain the coordinator's current (default) preferences.
	def := dashboard.DefaultRenderPreferences()
	if stub.lastPrefs.Theme != def.Theme {
		t.Fatalf("SetProfile clobbered theme: got %#v, want default %#v", stub.lastPrefs.Theme, def.Theme)
	}
	if stub.lastPrefs.FormatPrefs != def.FormatPrefs {
		t.Fatalf("SetProfile clobbered format prefs: got %#v, want default %#v", stub.lastPrefs.FormatPrefs, def.FormatPrefs)
	}
}

func assertHasCommand(t *testing.T, ids []string, want string) {
	t.Helper()
	for _, id := range ids {
		if id == want {
			return
		}
	}
	t.Fatalf("expected command %q in %#v", want, ids)
}

func testLayoutWithWrapperGroup() *dashboard.DashLayout {
	return &dashboard.DashLayout{
		ID:       "layout-a",
		Name:     "Race",
		GridCols: dashboard.DefaultGridCols,
		GridRows: dashboard.DefaultGridRows,
		IdlePage: dashboard.NewPage("Idle"),
		Pages: []dashboard.DashPage{
			{
				ID:   "page-main",
				Name: "Main",
				WidgetStacks: []dashboard.DashWidgetStack{
					{
						ID:             "stack",
						Name:           "Stack",
						Col:            0,
						Row:            0,
						ColSpan:        4,
						RowSpan:        2,
						DefaultLayerID: "variant-a",
						Layers: []dashboard.DashWidgetStackLayer{
							{
								ID:   "variant-a",
								Name: "A",
								Widgets: []dashboard.DashWidget{
									{ID: "w-a", Type: widgets.WidgetText, Col: 0, Row: 0, ColSpan: 4, RowSpan: 2},
								},
							},
							{
								ID:   "variant-b",
								Name: "B",
								Widgets: []dashboard.DashWidget{
									{ID: "w-b", Type: widgets.WidgetText, Col: 0, Row: 0, ColSpan: 4, RowSpan: 2},
								},
							},
						},
					},
				},
			},
		},
	}
}

type stubScreenDriver struct {
	lastVariantID string
	applied       bool
	lastPrefs     dashboard.RenderPreferences
}

func (d *stubScreenDriver) ApplyRenderPreferences(prefs dashboard.RenderPreferences) {
	d.applied = true
	d.lastPrefs = prefs
}

func (d *stubScreenDriver) Configure(hardware.ScreenConfig)                {}
func (d *stubScreenDriver) SetLayout(*dashboard.DashLayout)                {}
func (d *stubScreenDriver) SetActivePage(int)                              {}
func (d *stubScreenDriver) SetIdle(bool)                                   {}
func (d *stubScreenDriver) OnFrame(*dto.TelemetryFrame)                    {}
func (d *stubScreenDriver) Run(context.Context)                            {}
func (d *stubScreenDriver) SetDisabled(bool)                               {}
func (d *stubScreenDriver) GetDisabled() bool                              { return false }
func (d *stubScreenDriver) IsConnected() bool                              { return false }
func (d *stubScreenDriver) SetEmit(func(string, ...any))                   {}
func (d *stubScreenDriver) SetFrameSource(hardware.FrameSource)            {}
func (d *stubScreenDriver) ClearExternalSource()                           {}
func (d *stubScreenDriver) SetWidgetStackLayer(_, _, variantID string)     { d.lastVariantID = variantID }

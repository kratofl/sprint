package core

import (
	"io"
	"log/slog"
	"strings"
	"testing"

	"github.com/kratofl/sprint/app/internal/commands"
	"github.com/kratofl/sprint/app/internal/dashboard"
	"github.com/kratofl/sprint/app/internal/dashboard/widgets"
)

func TestReloadDashCommandsBuildsWrapperCommandsFromSavedLayouts(t *testing.T) {
	commands.ReplaceDynamic(nil)
	t.Cleanup(func() {
		commands.ReplaceDynamic(nil)
	})

	manager := dashboard.NewManager(nil)
	layout := &dashboard.DashLayout{
		ID:       "layout-a",
		Name:     "Race",
		GridCols: dashboard.DefaultGridCols,
		GridRows: dashboard.DefaultGridRows,
		IdlePage: dashboard.NewPage("Idle"),
		Pages: []dashboard.DashPage{
			{
				ID:   "page-main",
				Name: "Main",
				WrapperGroups: []dashboard.DashWrapperGroup{
					{
						ID:               "stack",
						Name:             "Stack",
						Col:              0,
						Row:              0,
						ColSpan:          4,
						RowSpan:          2,
						DefaultVariantID: "variant-a",
						Variants: []dashboard.DashWrapperVariant{
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
	if err := manager.Save(layout); err != nil {
		t.Fatalf("Save layout: %v", err)
	}

	coord := New(slog.New(slog.NewTextHandler(io.Discard, nil)), manager, nil)
	coord.ReloadDashCommands()

	var ids []string
	for _, meta := range commands.Catalog() {
		id := string(meta.ID)
		if strings.HasPrefix(id, "dash.wrapper.") {
			ids = append(ids, id)
		}
	}

	assertHasCommand(t, ids, "dash.wrapper.layout-a.page-main.stack.next")
	assertHasCommand(t, ids, "dash.wrapper.layout-a.page-main.stack.prev")
	assertHasCommand(t, ids, "dash.wrapper.layout-a.page-main.stack.show.variant-a")
	assertHasCommand(t, ids, "dash.wrapper.layout-a.page-main.stack.show.variant-b")
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

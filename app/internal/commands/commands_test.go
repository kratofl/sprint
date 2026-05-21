package commands

import "testing"

func TestReplaceDynamicReplacesCatalogAndHandlers(t *testing.T) {
	origStaticOrder := append([]Command(nil), staticOrder...)
	origStaticCatalog := cloneCommandMetaMap(staticCatalog)
	origDynamicOrder := append([]Command(nil), dynamicOrder...)
	origDynamicCatalog := cloneCommandMetaMap(dynamicCatalog)
	origHandlers := cloneHandlersMap(handlers)
	defer func() {
		staticOrder = origStaticOrder
		staticCatalog = origStaticCatalog
		dynamicOrder = origDynamicOrder
		dynamicCatalog = origDynamicCatalog
		handlers = origHandlers
	}()

	staticOrder = nil
	staticCatalog = map[Command]CommandMeta{}
	dynamicOrder = nil
	dynamicCatalog = map[Command]CommandMeta{}
	handlers = map[Command]HandlerFn{}

	RegisterMeta("static.cmd", "Static", "Dashboard", true, false)

	var hits []string
	ReplaceDynamic([]DynamicCommand{
		{
			Meta: CommandMeta{ID: "dynamic.first", Label: "First", Category: "Dashboard", Capturable: true},
			Handler: func(payload any) {
				hits = append(hits, "first")
			},
		},
		{
			Meta: CommandMeta{ID: "dynamic.second", Label: "Second", Category: "Dashboard", Capturable: true},
			Handler: func(payload any) {
				hits = append(hits, "second")
			},
		},
	})

	Dispatch("dynamic.first", nil)
	if len(hits) != 1 || hits[0] != "first" {
		t.Fatalf("expected first dynamic command to dispatch, got %#v", hits)
	}

	catalog := Catalog()
	if got, want := len(catalog), 3; got != want {
		t.Fatalf("expected %d commands in catalog, got %d", want, got)
	}

	hits = nil
	ReplaceDynamic([]DynamicCommand{
		{
			Meta: CommandMeta{ID: "dynamic.second", Label: "Second", Category: "Dashboard", Capturable: true},
			Handler: func(payload any) {
				hits = append(hits, "second-new")
			},
		},
	})

	Dispatch("dynamic.first", nil)
	Dispatch("dynamic.second", nil)
	if len(hits) != 1 || hits[0] != "second-new" {
		t.Fatalf("expected only replacement dynamic command to remain active, got %#v", hits)
	}

	catalog = Catalog()
	if got, want := len(catalog), 2; got != want {
		t.Fatalf("expected %d commands after replacement, got %d", want, got)
	}
	for _, meta := range catalog {
		if meta.ID == "dynamic.first" {
			t.Fatal("expected replaced dynamic command to be removed from catalog")
		}
	}
}

func cloneCommandMetaMap(in map[Command]CommandMeta) map[Command]CommandMeta {
	if in == nil {
		return nil
	}
	out := make(map[Command]CommandMeta, len(in))
	for key, value := range in {
		out[key] = value
	}
	return out
}

func cloneHandlersMap(in map[Command]HandlerFn) map[Command]HandlerFn {
	if in == nil {
		return nil
	}
	out := make(map[Command]HandlerFn, len(in))
	for key, value := range in {
		out[key] = value
	}
	return out
}

// Package commands is the application-level command bus.
//
// Features register command metadata from their init() functions using
// RegisterMeta. The core package wires actual handlers after all subsystems
// are constructed using Handle. Input devices fire commands via Dispatch.
//
// Import graph: commands has no internal imports — every other package may
// safely import it without introducing cycles.
package commands

import "sync"

// Command is a named application action identifier.
type Command string

// CommandMeta describes a command for the controls binding UI.
type CommandMeta struct {
	ID       Command `json:"id"`
	Label    string  `json:"label"`
	Category string  `json:"category"`
}

// HandlerFn is the function invoked when a command is dispatched.
type HandlerFn func(payload any)

var (
	mu       sync.RWMutex
	catalog  []CommandMeta
	handlers = map[Command][]HandlerFn{}
)

// RegisterMeta adds a command to the catalog. Call from init() functions in
// feature packages — this is safe to call before the Wails runtime starts.
func RegisterMeta(id Command, label, category string) {
	mu.Lock()
	defer mu.Unlock()
	catalog = append(catalog, CommandMeta{ID: id, Label: label, Category: category})
}

// Handle registers a handler for id. Multiple handlers per command are allowed.
// Call from core/ after all subsystems are constructed.
func Handle(id Command, fn HandlerFn) {
	mu.Lock()
	defer mu.Unlock()
	handlers[id] = append(handlers[id], fn)
}

// Dispatch fires id to all registered handlers synchronously.
// payload may be nil if the command carries no data.
func Dispatch(id Command, payload any) {
	mu.RLock()
	fns := handlers[id]
	mu.RUnlock()
	for _, fn := range fns {
		fn(payload)
	}
}

// Catalog returns a snapshot of all registered command metadata.
// Use this to populate the controls binding UI.
func Catalog() []CommandMeta {
	mu.RLock()
	defer mu.RUnlock()
	out := make([]CommandMeta, len(catalog))
	copy(out, catalog)
	return out
}

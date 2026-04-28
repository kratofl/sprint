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
	ID         Command `json:"id"`
	Label      string  `json:"label"`
	Category   string  `json:"category"`
	Capturable bool    `json:"capturable"` // can be bound to a wheel button via capture
	DeviceOnly bool    `json:"deviceOnly"` // must be triggered from a hardware button; no software alternative
}

// HandlerFn is the function invoked when a command is dispatched.
type HandlerFn func(payload any)

// DynamicCommand describes a runtime-generated command and its handler.
// Dynamic commands are rebuilt from saved dashboard layouts and replace the
// previous dynamic set wholesale.
type DynamicCommand struct {
	Meta    CommandMeta
	Handler HandlerFn
}

var (
	mu            sync.RWMutex
	staticOrder   []Command
	staticCatalog = map[Command]CommandMeta{}
	dynamicOrder  []Command
	dynamicCatalog = map[Command]CommandMeta{}
	handlers      = map[Command]HandlerFn{}
)

// RegisterMeta adds a command to the catalog. Call from init() functions in
// feature packages — this is safe to call before the Wails runtime starts.
// capturable indicates the command can be bound to a hardware button via capture.
// deviceOnly indicates the command must be triggered from a hardware button.
func RegisterMeta(id Command, label, category string, capturable, deviceOnly bool) {
	mu.Lock()
	defer mu.Unlock()
	staticOrder = append(staticOrder, id)
	staticCatalog[id] = CommandMeta{
		ID:         id,
		Label:      label,
		Category:   category,
		Capturable: capturable,
		DeviceOnly: deviceOnly,
	}
}

// Handle registers a handler for id. Only one handler per command is supported;
// registering a second handler overwrites the first.
// Call from core/ after all subsystems are constructed.
func Handle(id Command, fn HandlerFn) {
	mu.Lock()
	defer mu.Unlock()
	handlers[id] = fn
}

// Dispatch fires id to the registered handler synchronously.
// payload may be nil if the command carries no data.
// No-op if no handler is registered.
func Dispatch(id Command, payload any) {
	mu.RLock()
	fn := handlers[id]
	mu.RUnlock()
	if fn != nil {
		fn(payload)
	}
}

// Catalog returns a snapshot of all registered command metadata.
// Use this to populate the controls binding UI.
func Catalog() []CommandMeta {
	mu.RLock()
	defer mu.RUnlock()
	out := make([]CommandMeta, 0, len(staticOrder)+len(dynamicOrder))
	for _, id := range staticOrder {
		if meta, ok := staticCatalog[id]; ok {
			out = append(out, meta)
		}
	}
	for _, id := range dynamicOrder {
		if meta, ok := dynamicCatalog[id]; ok {
			out = append(out, meta)
		}
	}
	return out
}

// ReplaceDynamic replaces the entire dynamic command set and their handlers.
// Static commands remain registered and untouched.
func ReplaceDynamic(entries []DynamicCommand) {
	mu.Lock()
	defer mu.Unlock()

	for _, id := range dynamicOrder {
		delete(dynamicCatalog, id)
		delete(handlers, id)
	}

	dynamicOrder = make([]Command, 0, len(entries))
	for _, entry := range entries {
		id := entry.Meta.ID
		dynamicOrder = append(dynamicOrder, id)
		dynamicCatalog[id] = entry.Meta
		if entry.Handler != nil {
			handlers[id] = entry.Handler
		}
	}
}

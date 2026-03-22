// Package engineer manages the WebSocket server that broadcasts live telemetry to
// connected race engineers and applies commands they send back to the driver's app.
// LAN engineers connect directly; remote engineers connect via the web app relay.
package engineer

import (
	"context"
	"log"
	"sync"

	"github.com/kratofl/sprint/pkg/dto"
)

// Client represents a connected engineer session.
type Client struct {
	ID   string
	Name string
	send chan *dto.EngineerEvent
}

// Hub manages all connected engineer clients and routes messages between them
// and the driver's local app.
type Hub struct {
	mu      sync.RWMutex
	clients map[string]*Client

	// Commands received from engineers, forwarded to the wheel detector / coordinator.
	Commands chan *dto.EngineerCommand
}

// NewHub creates an empty Hub.
func NewHub() *Hub {
	return &Hub{
		clients:  make(map[string]*Client),
		Commands: make(chan *dto.EngineerCommand, 64),
	}
}

// Run starts the hub's event loop. Blocks until ctx is cancelled.
func (h *Hub) Run(ctx context.Context) {
	log.Println("engineer: hub running")
	// TODO: start WebSocket listener on configurable port
	<-ctx.Done()
	log.Println("engineer: hub stopped")
}

// Broadcast pushes an event to all connected engineer clients.
func (h *Hub) Broadcast(evt *dto.EngineerEvent) {
	h.mu.RLock()
	defer h.mu.RUnlock()
	for _, c := range h.clients {
		select {
		case c.send <- evt:
		default:
			log.Printf("engineer: client %s send buffer full, dropping event", c.ID)
		}
	}
}

// register adds a client to the hub.
func (h *Hub) register(c *Client) {
	h.mu.Lock()
	defer h.mu.Unlock()
	h.clients[c.ID] = c
	log.Printf("engineer: client connected: %s (%s)", c.Name, c.ID)
}

// unregister removes a client from the hub and closes its send channel.
func (h *Hub) unregister(c *Client) {
	h.mu.Lock()
	defer h.mu.Unlock()
	if _, ok := h.clients[c.ID]; ok {
		delete(h.clients, c.ID)
		close(c.send)
		log.Printf("engineer: client disconnected: %s (%s)", c.Name, c.ID)
	}
}

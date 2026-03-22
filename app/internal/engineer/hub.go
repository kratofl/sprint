// Package engineer manages the WebSocket server that broadcasts live telemetry to
// connected race engineers and applies commands they send back to the driver's app.
// LAN engineers connect directly; remote engineers connect via the web app relay.
package engineer

import (
	"context"
	"log/slog"
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
	logger  *slog.Logger

	// Commands received from engineers, forwarded to the wheel detector / coordinator.
	Commands chan *dto.EngineerCommand
}

// NewHub creates an empty Hub.
func NewHub(logger *slog.Logger) *Hub {
	return &Hub{
		clients:  make(map[string]*Client),
		Commands: make(chan *dto.EngineerCommand, 64),
		logger:   logger,
	}
}

// Run starts the hub's event loop. Blocks until ctx is cancelled.
func (h *Hub) Run(ctx context.Context) {
	h.logger.Info("hub running")
	// TODO: start WebSocket listener on configurable port
	<-ctx.Done()
	h.logger.Info("hub stopped")
}

// Broadcast pushes an event to all connected engineer clients.
func (h *Hub) Broadcast(evt *dto.EngineerEvent) {
	h.mu.RLock()
	defer h.mu.RUnlock()
	for _, c := range h.clients {
		select {
		case c.send <- evt:
		default:
			h.logger.Warn("send buffer full, dropping event", "client_id", c.ID)
		}
	}
}

// register adds a client to the hub.
func (h *Hub) register(c *Client) {
	h.mu.Lock()
	defer h.mu.Unlock()
	h.clients[c.ID] = c
	h.logger.Info("client connected", "name", c.Name, "client_id", c.ID)
}

// unregister removes a client from the hub and closes its send channel.
func (h *Hub) unregister(c *Client) {
	h.mu.Lock()
	defer h.mu.Unlock()
	if _, ok := h.clients[c.ID]; ok {
		delete(h.clients, c.ID)
		close(c.send)
		h.logger.Info("client disconnected", "name", c.Name, "client_id", c.ID)
	}
}

// Package relay manages the WebSocket relay hub that forwards live telemetry
// from the desktop app to remote race engineers connected via the web.
package relay

import (
	"log"
	"net/http"
	"sync"
)

// Client represents a connected WebSocket client (engineer or desktop app).
type Client struct {
	ID   string
	Role string // "driver" or "engineer"
	send chan []byte
}

// Hub manages all WebSocket connections and routes messages between
// the driver's desktop app and remote engineer clients.
type Hub struct {
	mu      sync.RWMutex
	clients map[string]*Client
}

// NewHub creates an empty relay Hub.
func NewHub() *Hub {
	return &Hub{
		clients: make(map[string]*Client),
	}
}

// Run starts the hub event loop.
func (h *Hub) Run() {
	log.Println("relay: hub running")
	// Hub stays alive for the process lifetime.
	// Client management happens in HandleWebSocket goroutines.
	select {}
}

// HandleWebSocket upgrades an HTTP connection to WebSocket and registers
// the client with the hub.
func (h *Hub) HandleWebSocket(w http.ResponseWriter, r *http.Request) {
	// TODO: upgrade connection using gorilla/websocket or nhooyr.io/websocket
	// TODO: read role from query param (?role=driver|engineer)
	// TODO: register client, start read/write pumps
	http.Error(w, "WebSocket relay not yet implemented", http.StatusNotImplemented)
}

// Broadcast sends a message to all connected engineers.
func (h *Hub) Broadcast(msg []byte) {
	h.mu.RLock()
	defer h.mu.RUnlock()
	for _, c := range h.clients {
		if c.Role == "engineer" {
			select {
			case c.send <- msg:
			default:
				log.Printf("relay: client %s buffer full, dropping", c.ID)
			}
		}
	}
}

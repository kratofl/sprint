// Package relay manages the WebSocket relay hub that forwards live telemetry
// from the desktop app to remote race engineers connected via the web.
package relay

import (
	"log"
	"net/http"
	"sync"

	"github.com/kratofl/sprint/api/internal/auth"
	"github.com/kratofl/sprint/api/internal/invite"
)

// Client represents a connected WebSocket client (driver desktop or engineer).
type Client struct {
	ID        string
	UserID    string
	Role      string // "driver" or "engineer"
	SessionID string
	send      chan []byte
}

// Hub manages all WebSocket connections and routes messages between
// the driver's desktop app and remote engineer clients.
type Hub struct {
	mu      sync.RWMutex
	clients map[string]*Client
	invites *invite.Store
}

// NewHub creates an empty relay Hub with the provided invite store.
func NewHub(invites *invite.Store) *Hub {
	return &Hub{
		clients: make(map[string]*Client),
		invites: invites,
	}
}

// Run starts the hub event loop.
func (h *Hub) Run() {
	log.Println("relay: hub running")
	select {}
}

// HandleWebSocket upgrades an HTTP connection to WebSocket and registers
// the client with the hub.
//
// Required query parameters:
//   - token: a valid JWT issued by /api/auth/login
//   - code:  a valid engineer session invite code
//   - role:  "driver" or "engineer"
func (h *Hub) HandleWebSocket(w http.ResponseWriter, r *http.Request) {
	// — Authenticate: validate the JWT token
	rawToken := r.URL.Query().Get("token")
	if rawToken == "" {
		http.Error(w, "missing token", http.StatusUnauthorized)
		return
	}
	claims, err := auth.ParseToken(rawToken)
	if err != nil {
		http.Error(w, "invalid token", http.StatusUnauthorized)
		return
	}

	// — Authorise: validate the invite code
	code := r.URL.Query().Get("code")
	if code == "" {
		http.Error(w, "missing invite code", http.StatusBadRequest)
		return
	}
	inviteCode, err := h.invites.Validate(code)
	if err != nil {
		http.Error(w, "invalid or expired invite code", http.StatusForbidden)
		return
	}

	// — Role validation
	role := r.URL.Query().Get("role")
	switch role {
	case "driver":
		// Only the driver who created the invite may connect as driver
		if claims.UserID != inviteCode.DriverID {
			http.Error(w, "forbidden: not the driver for this invite", http.StatusForbidden)
			return
		}
		if err := h.invites.MarkDriverJoined(code); err != nil {
			http.Error(w, err.Error(), http.StatusConflict)
			return
		}
	case "engineer":
		// Any authenticated user with a valid code may connect as engineer
	default:
		http.Error(w, "role must be 'driver' or 'engineer'", http.StatusBadRequest)
		return
	}

	log.Printf("relay: %s connected as %s (session %s)", claims.Email, role, inviteCode.SessionID)

	// TODO: upgrade to WebSocket using nhooyr.io/websocket or gorilla/websocket
	// TODO: register client, start read/write pumps
	// For now, acknowledge the validated connection
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusSwitchingProtocols)
}

// Broadcast sends a message to all connected engineers in the given session.
func (h *Hub) Broadcast(sessionID string, msg []byte) {
	h.mu.RLock()
	defer h.mu.RUnlock()
	for _, c := range h.clients {
		if c.Role == "engineer" && c.SessionID == sessionID {
			select {
			case c.send <- msg:
			default:
				log.Printf("relay: client %s buffer full, dropping", c.ID)
			}
		}
	}
}

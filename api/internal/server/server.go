// Package server sets up the HTTP server and wires all routes.
package server

import (
	"encoding/json"
	"net/http"

	"github.com/kratofl/sprint/api/internal/auth"
	"github.com/kratofl/sprint/api/internal/authhandler"
	"github.com/kratofl/sprint/api/internal/handler"
	"github.com/kratofl/sprint/api/internal/invite"
	"github.com/kratofl/sprint/api/internal/relay"
)

// New creates an http.Server with all API routes configured.
func New(port, version string) *http.Server {
	mux := http.NewServeMux()

	invites := invite.NewStore()
	wsRelay := relay.NewHub(invites)
	go wsRelay.Run()

	// ── Public routes (no auth required) ─────────────────────────────────────
	mux.HandleFunc("GET /api/health", handler.HealthHandler(version))
	mux.HandleFunc("POST /api/auth/register", authhandler.Register)
	mux.HandleFunc("POST /api/auth/login", authhandler.Login)

	// ── Protected routes (JWT required) ──────────────────────────────────────
	protected := http.NewServeMux()

	// Invite codes — driver creates a code from their desktop app
	protected.HandleFunc("POST /api/sessions/invite", func(w http.ResponseWriter, r *http.Request) {
		userID := auth.UserIDFromContext(r.Context())
		sessionID := r.URL.Query().Get("session_id") // optional
		code := invites.Create(userID, sessionID)
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]string{
			"code":       code.Value,
			"expires_at": code.ExpiresAt.Format("2006-01-02T15:04:05Z"),
		})
	})

	// Telemetry sessions
	protected.HandleFunc("POST /api/telemetry/sessions", handler.CreateSession)
	protected.HandleFunc("GET /api/telemetry/sessions", handler.ListSessions)
	protected.HandleFunc("GET /api/telemetry/sessions/{id}", handler.GetSession)

	// Setups
	protected.HandleFunc("GET /api/setups", handler.ListSetups)
	protected.HandleFunc("POST /api/setups", handler.SaveSetup)
	protected.HandleFunc("GET /api/setups/{id}", handler.GetSetup)

	// Dash layouts
	protected.HandleFunc("GET /api/layouts", handler.ListLayouts)
	protected.HandleFunc("POST /api/layouts", handler.SaveLayout)
	protected.HandleFunc("GET /api/layouts/{id}", handler.GetLayout)

	// Engineer relay (WebSocket) — auth validated inside the handler
	protected.HandleFunc("/api/engineer/ws", wsRelay.HandleWebSocket)

	// Wrap protected routes with auth middleware
	mux.Handle("/api/", auth.Middleware(protected))

	return &http.Server{
		Addr:    ":" + port,
		Handler: mux,
	}
}

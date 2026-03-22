// Package server sets up the HTTP server and wires all routes.
package server

import (
	"net/http"

	"github.com/kratofl/sprint/api/internal/handler"
	"github.com/kratofl/sprint/api/internal/relay"
)

// New creates an http.Server with all API routes configured.
func New(port string) *http.Server {
	mux := http.NewServeMux()

	wsRelay := relay.NewHub()
	go wsRelay.Run()

	// Health
	mux.HandleFunc("GET /api/health", handler.Health)

	// Telemetry
	mux.HandleFunc("POST /api/telemetry/sessions", handler.CreateSession)
	mux.HandleFunc("GET /api/telemetry/sessions", handler.ListSessions)
	mux.HandleFunc("GET /api/telemetry/sessions/{id}", handler.GetSession)

	// Setups
	mux.HandleFunc("GET /api/setups", handler.ListSetups)
	mux.HandleFunc("POST /api/setups", handler.SaveSetup)
	mux.HandleFunc("GET /api/setups/{id}", handler.GetSetup)

	// Dash layouts
	mux.HandleFunc("GET /api/layouts", handler.ListLayouts)
	mux.HandleFunc("POST /api/layouts", handler.SaveLayout)
	mux.HandleFunc("GET /api/layouts/{id}", handler.GetLayout)

	// Engineer relay (WebSocket)
	mux.HandleFunc("/api/engineer/ws", wsRelay.HandleWebSocket)

	return &http.Server{
		Addr:    ":" + port,
		Handler: mux,
	}
}

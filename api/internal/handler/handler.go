// Package handler contains HTTP route handlers for the Sprint API.
package handler

import (
	"encoding/json"
	"net/http"

	"github.com/kratofl/sprint/api/internal/auth"
)

func writeJSON(w http.ResponseWriter, status int, v any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	json.NewEncoder(w).Encode(v)
}

// Health returns a simple ok response.
func Health(w http.ResponseWriter, _ *http.Request) {
	writeJSON(w, http.StatusOK, map[string]string{"status": "ok"})
}

// ── Telemetry Sessions ──────────────────────────────────────────────────────

func CreateSession(w http.ResponseWriter, r *http.Request) {
	userID := auth.UserIDFromContext(r.Context())
	// TODO: parse body, store session in DB scoped to userID
	_ = userID
	writeJSON(w, http.StatusCreated, map[string]string{"id": "stub"})
}

func ListSessions(w http.ResponseWriter, r *http.Request) {
	userID := auth.UserIDFromContext(r.Context())
	// TODO: query DB for sessions WHERE owner_id = userID
	_ = userID
	writeJSON(w, http.StatusOK, []any{})
}

func GetSession(w http.ResponseWriter, r *http.Request) {
	userID := auth.UserIDFromContext(r.Context())
	id := r.PathValue("id")
	// TODO: query DB for session by id, verify owner_id == userID
	_ = userID
	writeJSON(w, http.StatusOK, map[string]string{"id": id, "status": "stub"})
}

// ── Setups ──────────────────────────────────────────────────────────────────

func ListSetups(w http.ResponseWriter, r *http.Request) {
	userID := auth.UserIDFromContext(r.Context())
	// TODO: query DB for setups WHERE owner_id = userID
	_ = userID
	writeJSON(w, http.StatusOK, []any{})
}

func SaveSetup(w http.ResponseWriter, r *http.Request) {
	userID := auth.UserIDFromContext(r.Context())
	// TODO: parse body, store setup in DB with owner_id = userID
	_ = userID
	writeJSON(w, http.StatusCreated, map[string]string{"id": "stub"})
}

func GetSetup(w http.ResponseWriter, r *http.Request) {
	userID := auth.UserIDFromContext(r.Context())
	id := r.PathValue("id")
	// TODO: query DB for setup by id, verify owner_id == userID
	_ = userID
	writeJSON(w, http.StatusOK, map[string]string{"id": id, "status": "stub"})
}

// ── Layouts ─────────────────────────────────────────────────────────────────

func ListLayouts(w http.ResponseWriter, r *http.Request) {
	userID := auth.UserIDFromContext(r.Context())
	// TODO: query DB for layouts WHERE owner_id = userID
	_ = userID
	writeJSON(w, http.StatusOK, []any{})
}

func SaveLayout(w http.ResponseWriter, r *http.Request) {
	userID := auth.UserIDFromContext(r.Context())
	// TODO: parse body, store layout in DB with owner_id = userID
	_ = userID
	writeJSON(w, http.StatusCreated, map[string]string{"id": "stub"})
}

func GetLayout(w http.ResponseWriter, r *http.Request) {
	userID := auth.UserIDFromContext(r.Context())
	id := r.PathValue("id")
	// TODO: query DB for layout by id, verify owner_id == userID
	_ = userID
	writeJSON(w, http.StatusOK, map[string]string{"id": id, "status": "stub"})
}

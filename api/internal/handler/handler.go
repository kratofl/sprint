// Package handler contains HTTP route handlers for the Sprint API.
package handler

import (
	"encoding/json"
	"net/http"
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

func CreateSession(w http.ResponseWriter, _ *http.Request) {
	// TODO: parse body, store session in DB
	writeJSON(w, http.StatusCreated, map[string]string{"id": "stub"})
}

func ListSessions(w http.ResponseWriter, _ *http.Request) {
	writeJSON(w, http.StatusOK, []any{})
}

func GetSession(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	writeJSON(w, http.StatusOK, map[string]string{"id": id, "status": "stub"})
}

// ── Setups ──────────────────────────────────────────────────────────────────

func ListSetups(w http.ResponseWriter, _ *http.Request) {
	writeJSON(w, http.StatusOK, []any{})
}

func SaveSetup(w http.ResponseWriter, _ *http.Request) {
	writeJSON(w, http.StatusCreated, map[string]string{"id": "stub"})
}

func GetSetup(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	writeJSON(w, http.StatusOK, map[string]string{"id": id, "status": "stub"})
}

// ── Layouts ─────────────────────────────────────────────────────────────────

func ListLayouts(w http.ResponseWriter, _ *http.Request) {
	writeJSON(w, http.StatusOK, []any{})
}

func SaveLayout(w http.ResponseWriter, _ *http.Request) {
	writeJSON(w, http.StatusCreated, map[string]string{"id": "stub"})
}

func GetLayout(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	writeJSON(w, http.StatusOK, map[string]string{"id": id, "status": "stub"})
}

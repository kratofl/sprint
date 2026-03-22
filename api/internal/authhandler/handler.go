// Package authhandler provides HTTP handlers for user registration and login.
package authhandler

import (
	"encoding/json"
	"net/http"
	"sync"
	"time"

	"github.com/kratofl/sprint/api/internal/auth"
	"golang.org/x/crypto/bcrypt"
)

// user is an in-memory user record. Replace with a real DB row when store is wired.
type user struct {
	ID           string
	Email        string
	PasswordHash []byte
	CreatedAt    time.Time
}

// userStore is a simple in-memory registry of users.
// TODO: replace with database-backed store.
var userStore = struct {
	mu      sync.RWMutex
	byEmail map[string]*user
	byID    map[string]*user
}{
	byEmail: make(map[string]*user),
	byID:    make(map[string]*user),
}

type registerRequest struct {
	Email    string `json:"email"`
	Password string `json:"password"`
}

type loginRequest struct {
	Email    string `json:"email"`
	Password string `json:"password"`
}

type tokenResponse struct {
	Token string `json:"token"`
}

// Register handles POST /api/auth/register.
func Register(w http.ResponseWriter, r *http.Request) {
	var req registerRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil || req.Email == "" || req.Password == "" {
		http.Error(w, "invalid request body", http.StatusBadRequest)
		return
	}

	userStore.mu.Lock()
	defer userStore.mu.Unlock()

	if _, exists := userStore.byEmail[req.Email]; exists {
		http.Error(w, "email already registered", http.StatusConflict)
		return
	}

	hash, err := bcrypt.GenerateFromPassword([]byte(req.Password), bcrypt.DefaultCost)
	if err != nil {
		http.Error(w, "internal error", http.StatusInternalServerError)
		return
	}

	u := &user{
		ID:           newID(),
		Email:        req.Email,
		PasswordHash: hash,
		CreatedAt:    time.Now(),
	}
	userStore.byEmail[u.Email] = u
	userStore.byID[u.ID] = u

	token, err := auth.IssueToken(u.ID, u.Email)
	if err != nil {
		http.Error(w, "internal error", http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusCreated)
	json.NewEncoder(w).Encode(tokenResponse{Token: token})
}

// Login handles POST /api/auth/login.
func Login(w http.ResponseWriter, r *http.Request) {
	var req loginRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil || req.Email == "" || req.Password == "" {
		http.Error(w, "invalid request body", http.StatusBadRequest)
		return
	}

	userStore.mu.RLock()
	u, exists := userStore.byEmail[req.Email]
	userStore.mu.RUnlock()

	if !exists || bcrypt.CompareHashAndPassword(u.PasswordHash, []byte(req.Password)) != nil {
		http.Error(w, "invalid credentials", http.StatusUnauthorized)
		return
	}

	token, err := auth.IssueToken(u.ID, u.Email)
	if err != nil {
		http.Error(w, "internal error", http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(tokenResponse{Token: token})
}

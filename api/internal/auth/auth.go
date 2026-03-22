// Package auth provides authentication middleware for the Sprint API.
package auth

import "net/http"

// Middleware returns an HTTP middleware that verifies authentication.
// For now it's a pass-through — authentication is not yet implemented.
func Middleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		// TODO: verify JWT or session token from Authorization header
		// TODO: set user context
		next.ServeHTTP(w, r)
	})
}

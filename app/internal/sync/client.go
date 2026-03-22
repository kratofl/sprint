// Package sync manages bidirectional synchronisation between the local Wails app
// and the Sprint web app. Layouts and setups sync automatically on save;
// live telemetry is streamed via WebSocket when the driver opts in.
package sync

import (
	"context"
	"log"
)

// Config holds the web app connection details.
type Config struct {
	WebAppURL string // e.g. "https://sprint.example.com"
	AuthToken string // bearer token for the web app API
}

// Client handles syncing state between the local app and the web app.
type Client struct {
	cfg Config
}

// NewClient creates a Client with an empty configuration.
// Call SetConfig before Run to provide the web app URL and token.
func NewClient() *Client {
	return &Client{}
}

// SetConfig updates the web app connection details.
func (c *Client) SetConfig(cfg Config) {
	c.cfg = cfg
}

// Run starts the sync loop. Blocks until ctx is cancelled.
func (c *Client) Run(ctx context.Context) {
	if c.cfg.WebAppURL == "" {
		log.Println("sync: no web app URL configured — sync disabled")
		<-ctx.Done()
		return
	}
	log.Printf("sync: starting — target %s", c.cfg.WebAppURL)
	// TODO: establish WebSocket connection to web app
	// TODO: push layout/setup changes on save
	// TODO: stream live telemetry when opted in
	<-ctx.Done()
	log.Println("sync: stopped")
}

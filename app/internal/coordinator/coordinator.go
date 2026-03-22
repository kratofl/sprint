// Package coordinator wires all backend services together.
// It owns no business logic — it starts, stops, and connects the other packages.
package coordinator

import (
	"context"
	"log"

	"github.com/kratofl/sprint/app/internal/engineer"
	"github.com/kratofl/sprint/app/internal/setup"
	"github.com/kratofl/sprint/app/internal/sync"
	"github.com/kratofl/sprint/app/internal/vocore"
	"github.com/kratofl/sprint/app/internal/wheel"
)

// Coordinator is the top-level wiring of all backend subsystems.
type Coordinator struct {
	engineer *engineer.Hub
	vocore   *vocore.Renderer
	wheel    *wheel.Detector
	sync     *sync.Client
	setup    *setup.Manager
}

// New creates a Coordinator with default configuration.
func New() *Coordinator {
	return &Coordinator{
		engineer: engineer.NewHub(),
		vocore:   vocore.NewRenderer(),
		wheel:    wheel.NewDetector(),
		sync:     sync.NewClient(),
		setup:    setup.NewManager(),
	}
}

// Start launches all subsystems. ctx governs their lifetime.
func (c *Coordinator) Start(ctx context.Context) {
	log.Println("coordinator: starting subsystems")
	go c.engineer.Run(ctx)
	go c.vocore.Run(ctx)
	go c.wheel.Run(ctx, c.engineer)
	go c.sync.Run(ctx)
}

// Stop shuts down all subsystems gracefully.
func (c *Coordinator) Stop() {
	log.Println("coordinator: stopping")
}

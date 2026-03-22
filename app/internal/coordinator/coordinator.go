// Package coordinator wires all backend services together.
// It owns no business logic — it starts, stops, and connects the other packages.
package coordinator

import (
	"context"
	"log/slog"

	"github.com/kratofl/sprint/app/internal/engineer"
	"github.com/kratofl/sprint/app/internal/setup"
	"github.com/kratofl/sprint/app/internal/sync"
	"github.com/kratofl/sprint/app/internal/vocore"
	"github.com/kratofl/sprint/app/internal/wheel"
)

// Coordinator is the top-level wiring of all backend subsystems.
type Coordinator struct {
	logger   *slog.Logger
	engineer *engineer.Hub
	vocore   *vocore.Renderer
	wheel    *wheel.Detector
	sync     *sync.Client
	setup    *setup.Manager
}

// New creates a Coordinator. logger is the root application logger;
// each subsystem receives a child logger tagged with its component name.
func New(logger *slog.Logger) *Coordinator {
	return &Coordinator{
		logger:   logger,
		engineer: engineer.NewHub(logger.With("component", "engineer")),
		vocore:   vocore.NewRenderer(logger.With("component", "vocore")),
		wheel:    wheel.NewDetector(logger.With("component", "wheel")),
		sync:     sync.NewClient(logger.With("component", "sync")),
		setup:    setup.NewManager(),
	}
}

// Start launches all subsystems. ctx governs their lifetime.
func (c *Coordinator) Start(ctx context.Context) {
	c.logger.Info("starting subsystems")
	go c.engineer.Run(ctx)
	go c.vocore.Run(ctx)
	go c.wheel.Run(ctx, c.engineer)
	go c.sync.Run(ctx)
}

// Stop shuts down all subsystems gracefully.
func (c *Coordinator) Stop() {
	c.logger.Info("stopping")
}

// Package games defines the GameAdapter interface that every sim racing game integration
// must implement. Adding support for a new game requires only a new package under
// games/<gamename>/ that satisfies this interface — no other code needs to change.
package games

import (
	"errors"

	"github.com/kratofl/sprint/pkg/dto"
)

// ErrNotRunning is returned by Connect when the game is simply not running.
// The coordinator uses this to suppress noisy retries from the log at Warn
// level — it is a normal, expected condition, not an error.
var ErrNotRunning = errors.New("game not running")

// GameAdapter is the contract between a game-specific integration and the rest of the
// telemetry pipeline. Implementations read raw game data and map it to the unified DTO.
type GameAdapter interface {
	// Name returns a stable, human-readable identifier, e.g. "LeMansUltimate".
	Name() string

	// Connect establishes the data source connection (UDP socket, shared memory, etc.).
	// Must be called before Read. Safe to call multiple times; re-connects if already open.
	Connect() error

	// Disconnect tears down the connection and frees all resources.
	// Safe to call if not connected.
	Disconnect() error

	// Read blocks until the next telemetry frame is available and returns it.
	// Returns a non-nil error if the adapter is not connected or the data is unreadable.
	Read() (*dto.TelemetryFrame, error)
}

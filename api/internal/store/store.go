// Package store provides the database layer for the Sprint API.
// It handles persistence for telemetry sessions, setups, layouts, and users.
package store

// Store is the top-level database handle. It wraps whatever database driver
// is chosen (SQLite for local dev, Postgres for production).
type Store struct {
	// TODO: add *sql.DB or ORM handle
}

// New creates a Store with the given DSN.
func New(_ string) (*Store, error) {
	// TODO: open database connection
	return &Store{}, nil
}

// Close shuts down the database connection pool.
func (s *Store) Close() error {
	// TODO: close connection
	return nil
}

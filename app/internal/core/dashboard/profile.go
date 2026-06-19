package dashboard

// RenderProfile holds non-telemetry display values resolved from application
// settings and used by idle/dashboard text bindings.
type RenderProfile struct {
	DriverName   string `json:"driverName,omitempty"`
	DriverNumber string `json:"driverNumber,omitempty"`
}

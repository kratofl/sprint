package hardware

type ScreenDriverMissingEvent struct {
	Driver string `json:"driver"`
	Error  string `json:"error"`
}

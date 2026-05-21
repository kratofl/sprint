package core

type DashPageChangedEvent struct {
	DeviceID  string `json:"deviceID"`
	PageIndex int    `json:"pageIndex"`
	PageName  string `json:"pageName"`
}

type DashPreviewEvent struct {
	PNG       string `json:"png"`
	PageIndex int    `json:"pageIndex"`
	Idle      bool   `json:"idle"`
}

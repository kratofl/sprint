package main

import (
	"embed"
	"log"
	"path/filepath"

	"github.com/kratofl/sprint/app/internal/appdata"
	"github.com/wailsapp/wails/v2"
	"github.com/wailsapp/wails/v2/pkg/options"
	"github.com/wailsapp/wails/v2/pkg/options/assetserver"
	"github.com/wailsapp/wails/v2/pkg/options/mac"
	"github.com/wailsapp/wails/v2/pkg/options/windows"
)

//go:embed all:frontend/dist
var assets embed.FS

// Version is injected at build time via -ldflags "-X main.Version=x.y.z".
// Falls back to "dev" for local builds.
var Version = "dev"

func main() {
	app := NewApp(Version)

	err := wails.Run(&options.App{
		Title:     "Sprint",
		Width:     1440,
		Height:    900,
		Frameless: true,
		AssetServer: &assetserver.Options{
			Assets: assets,
		},
		// Match design.md background #080809
		BackgroundColour: &options.RGBA{R: 8, G: 8, B: 9, A: 255},
		OnStartup:        app.Startup,
		OnDomReady:       app.DomReady,
		OnShutdown:       app.Shutdown,
		Bind: []interface{}{
			app,
		},
		AlwaysOnTop: true,
		Windows: &windows.Options{
			WebviewUserDataPath:  filepath.Join(appdata.Dir(), "WebView2"),
			WebviewIsTransparent: false,
			WindowIsTranslucent:  false,
			DisableWindowIcon:    false,
		},
		Mac: &mac.Options{
			TitleBar:             mac.TitleBarHiddenInset(),
			WebviewIsTransparent: false,
			WindowIsTranslucent:  false,
			About: &mac.AboutInfo{
				Title:   "Sprint",
				Message: "Sim racing telemetry platform",
			},
		},
	})
	if err != nil {
		log.Fatal(err)
	}
}

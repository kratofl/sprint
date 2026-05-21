package dashboard

import (
	"github.com/kratofl/sprint/app/internal/dashboard/widgets"
	"github.com/kratofl/sprint/app/internal/devices"
)

type DeviceStore interface {
	Load() (*devices.DeviceRegistry, error)
}

type Runtime interface {
	UpdateLayout(layout *DashLayout)
	SetDashLayout(deviceID string, layout *DashLayout)
	SetGlobalTheme(theme widgets.DashTheme)
	SetGlobalDomainPalette(domain widgets.DomainPalette)
	SetGlobalFormatPrefs(prefs widgets.FormatPreferences)
	SetGlobalTypography(typography widgets.TypographySettings)
	ReloadDashCommands()
}

type Service struct {
	manager     *Manager
	deviceStore DeviceStore
	runtime     Runtime
}

func NewService(manager *Manager, deviceStore DeviceStore, runtime Runtime) *Service {
	return &Service{
		manager:     manager,
		deviceStore: deviceStore,
		runtime:     runtime,
	}
}

func (s *Service) SaveLayout(layout *DashLayout) error {
	if err := s.manager.Save(layout); err != nil {
		return err
	}
	if s.runtime != nil {
		s.runtime.UpdateLayout(layout)
		s.runtime.ReloadDashCommands()
	}
	return nil
}

func (s *Service) CreateLayout(name string) (*DashLayout, error) {
	layout, err := s.manager.Create(name)
	if err != nil {
		return nil, err
	}
	gs, err := LoadGlobalSettings()
	if err == nil {
		layout.FormatPreferences = gs.FormatPreferences
		_ = s.manager.Save(layout)
	}
	if s.runtime != nil {
		s.runtime.ReloadDashCommands()
	}
	return layout, nil
}

func (s *Service) SaveGlobalSettings(settings *GlobalDashSettings) error {
	previous, err := LoadGlobalSettings()
	if err != nil {
		previous = defaultGlobalSettings()
	}
	fillGlobalDefaults(settings)
	if err := SaveGlobalSettings(settings); err != nil {
		return err
	}
	if err := s.rewriteInheritedColorOverrides(previous, settings); err != nil {
		return err
	}
	if s.runtime != nil {
		s.runtime.SetGlobalTheme(settings.Theme)
		s.runtime.SetGlobalDomainPalette(settings.DomainPalette)
		s.runtime.SetGlobalFormatPrefs(settings.FormatPreferences)
		s.runtime.SetGlobalTypography(settings.Typography)
	}
	return nil
}

func (s *Service) rewriteInheritedColorOverrides(previous, _ *GlobalDashSettings) error {
	if s.manager == nil {
		return nil
	}

	metas, err := s.manager.List()
	if err != nil {
		return err
	}

	for _, meta := range metas {
		layout, err := s.manager.Load(meta.ID)
		if err != nil || layout == nil {
			continue
		}

		theme := clearInheritedThemeOverrides(layout.Theme, previous.Theme)
		domain := clearInheritedDomainOverrides(layout.DomainPalette, previous.DomainPalette)
		if theme == layout.Theme && domain == layout.DomainPalette {
			continue
		}

		layout.Theme = theme
		layout.DomainPalette = domain
		if err := s.manager.Save(layout); err != nil {
			return err
		}
		if s.runtime != nil {
			s.runtime.UpdateLayout(layout)
		}
	}

	return nil
}

func (s *Service) DeleteLayout(id string) error {
	if err := s.manager.Delete(id); err != nil {
		return err
	}
	if s.runtime != nil {
		s.runtime.ReloadDashCommands()
	}

	if s.runtime == nil || s.deviceStore == nil {
		return nil
	}

	defaultLayout, err := s.manager.Load("")
	if err != nil || defaultLayout == nil {
		return nil
	}

	reg, err := s.deviceStore.Load()
	if err != nil || reg == nil {
		return nil
	}

	for i := range reg.Devices {
		device := &reg.Devices[i]
		if !device.HasScreen() {
			continue
		}
		if device.DashID == id || device.DashID == "" {
			s.runtime.SetDashLayout(devices.DeviceID(device.VID, device.PID, device.Serial), defaultLayout)
		}
	}

	return nil
}

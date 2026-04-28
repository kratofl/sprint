package devices

import (
	"encoding/json"
	"fmt"
)

type Runtime interface {
	SetScreenConfig(deviceID string, device SavedDevice)
	RemoveDevice(deviceID string)
	ReloadInputBindings()
	SetDeviceDisabled(deviceID string, disabled bool)
	GetDeviceDisabled(deviceID string) bool
}

type EmitFn func(event string, data ...any)
type LayoutAssigner func(deviceID, dashID string) error

type Service struct {
	manager      *Manager
	runtime      Runtime
	emit         EmitFn
	assignLayout LayoutAssigner
}

func NewService(manager *Manager, runtime Runtime, emit EmitFn, assigners ...LayoutAssigner) *Service {
	service := &Service{
		manager: manager,
		runtime: runtime,
		emit:    emit,
	}
	if len(assigners) > 0 {
		service.assignLayout = assigners[0]
	}
	return service
}

func (s *Service) SavedDevices() ([]SavedDevice, error) {
	reg, err := s.manager.Load()
	if err != nil {
		return nil, err
	}
	return reg.Devices, nil
}

func (s *Service) Rename(deviceID, name string) error {
	return s.update(deviceID, false, func(reg *DeviceRegistry) error {
		return Rename(reg, deviceID, name)
	})
}

func (s *Service) SetRotation(deviceID string, rotation int) error {
	return s.update(deviceID, true, func(reg *DeviceRegistry) error {
		return SetRotation(reg, deviceID, rotation)
	})
}

func (s *Service) SetScreenOffset(deviceID string, offsetX, offsetY, margin int) error {
	return s.update(deviceID, true, func(reg *DeviceRegistry) error {
		return SetScreenOffset(reg, deviceID, offsetX, offsetY, margin)
	})
}

func (s *Service) SetDashLayout(deviceID, dashID string) error {
	if err := s.update(deviceID, false, func(reg *DeviceRegistry) error {
		return SetDashLayout(reg, deviceID, dashID)
	}); err != nil {
		return err
	}
	if s.assignLayout != nil {
		return s.assignLayout(deviceID, dashID)
	}
	return nil
}

func (s *Service) SetPurpose(deviceID string, purpose DevicePurpose) error {
	return s.update(deviceID, true, func(reg *DeviceRegistry) error {
		return SetPurpose(reg, deviceID, purpose)
	})
}

func (s *Service) SetPurposeConfig(deviceID string, config json.RawMessage) error {
	return s.update(deviceID, true, func(reg *DeviceRegistry) error {
		return SetPurposeConfig(reg, deviceID, config)
	})
}

func (s *Service) DeviceBindings(deviceID string) ([]DeviceBinding, error) {
	reg, err := s.manager.Load()
	if err != nil {
		return nil, err
	}
	device := FindByID(reg, deviceID)
	if device == nil {
		return nil, fmt.Errorf("devices: device %q not found", deviceID)
	}
	if device.Bindings == nil {
		return []DeviceBinding{}, nil
	}
	return device.Bindings, nil
}

func (s *Service) SaveDeviceBindings(deviceID string, bindings []DeviceBinding) error {
	if err := s.update(deviceID, false, func(reg *DeviceRegistry) error {
		return SetDeviceBindings(reg, deviceID, bindings)
	}); err != nil {
		return err
	}
	if s.runtime != nil {
		s.runtime.ReloadInputBindings()
	}
	return nil
}

func (s *Service) Remove(deviceID string) error {
	reg, err := s.manager.Load()
	if err != nil {
		return err
	}
	Remove(reg, deviceID)
	if err := s.manager.Save(reg); err != nil {
		return err
	}
	if s.runtime != nil {
		s.runtime.RemoveDevice(deviceID)
	}
	s.emitUpdated()
	return nil
}

func (s *Service) SetDisabled(deviceID string, disabled bool) error {
	if err := s.update(deviceID, false, func(reg *DeviceRegistry) error {
		return SetDisabled(reg, deviceID, disabled)
	}); err != nil {
		return err
	}
	if s.runtime != nil {
		s.runtime.SetDeviceDisabled(deviceID, disabled)
	}
	return nil
}

func (s *Service) GetDisabled(deviceID string) bool {
	if s.runtime == nil {
		return false
	}
	return s.runtime.GetDeviceDisabled(deviceID)
}

func (s *Service) update(deviceID string, refreshScreen bool, mutate func(reg *DeviceRegistry) error) error {
	reg, err := s.manager.Load()
	if err != nil {
		return err
	}
	if err := mutate(reg); err != nil {
		return err
	}
	if err := s.manager.Save(reg); err != nil {
		return err
	}
	if refreshScreen && s.runtime != nil {
		if device := FindByID(reg, deviceID); device != nil && device.HasScreen() {
			s.runtime.SetScreenConfig(deviceID, *device)
		}
	}
	s.emitUpdated()
	return nil
}

func (s *Service) emitUpdated() {
	if s.emit != nil {
		s.emit(EventUpdated)
	}
}

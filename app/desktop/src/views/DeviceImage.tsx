import { Cpu } from 'lucide-react'
import omegaPro from '../assets/devices/bavarian-omega-v2-pro.webp'
import genericUsbd480 from '../assets/devices/generic-usbd480.svg'
import genericVocore from '../assets/devices/generic-vocore.svg'
import genericWheel from '../assets/devices/generic-wheel.svg'
import type { DeviceImageKey } from './DevicesDomain'

// The sources live in the repo's `assets/devices/`; a new preset picture goes there, here, and
// into `DeviceImageKey`.
const DEVICE_IMAGES: Record<DeviceImageKey, string> = {
  'bavarian-omega-v2-pro': omegaPro,
  'generic-vocore': genericVocore,
  'generic-usbd480': genericUsbd480,
  'generic-wheel': genericWheel,
}

/**
 * A device's picture on its stage (tile, list thumbnail, device header, Add device cards). `dim`
 * greys it out for a device that is off or not answering; no picture falls back to a chip glyph.
 */
export function DeviceImage({ image, dim = false, className }: { image: DeviceImageKey | null; dim?: boolean; className: string }) {
  return (
    <span className={dim ? `device-image dim ${className}` : `device-image ${className}`} aria-hidden="true">
      {image ? <img src={DEVICE_IMAGES[image]} alt="" draggable={false} /> : <Cpu strokeWidth={1.5} />}
    </span>
  )
}

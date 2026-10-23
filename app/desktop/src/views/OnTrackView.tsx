import { useState } from 'react'
import { Compass, Crosshair, Flag, Glasses, Monitor, Route, Ruler, ScanEye, Signpost } from 'lucide-react'
import type { SprintCommand } from '../bridge'
import type { GuideSettings, GuideState } from '../guide/guideModel'
import { PageHeader } from '../shell/PageHeader'
import type { RuntimeState } from '../shell/runtime'
import { Status } from '../shell/Status'
import { formatLapSeconds } from './AnalysisDomain'
import { blurOnEnter, SettingRow, SettingsGroup, Switch } from './SettingsLayout'

type Send = (command: SprintCommand) => Promise<void>

/**
 * On track: what Sprint draws over the game while you drive. Today that is the driving guide
 * (docs/internals/driving-guide.md), its reference lap and the seat calibration that puts it on the road.
 */
export function OnTrackView({ runtime, send }: { runtime: RuntimeState; send: Send }) {
  if (runtime.kind === 'loading') {
    return (
      <div className="settings">
        <PageHeader title="On track" />
        <div className="settings-group">
          <div className="card skeleton settings-row-skeleton" />
          <div className="card skeleton settings-row-skeleton" />
        </div>
      </div>
    )
  }

  return (
    <div className="settings">
      <PageHeader title="On track" />
      <GuideGroup guide={runtime.sprint.guide} send={send} />
    </div>
  )
}

/** What the guide is drawing from, in a sentence. */
const guideLapText = (guide: GuideState): string => {
  switch (guide.status) {
    case 'Idle':
      return 'Picked when you drive: your fastest valid lap on that track and car.'
    case 'Searching':
      return 'Looking for your fastest lap on this track…'
    case 'NoLap':
      return 'No lap here has positions yet. Drive one full valid lap and it becomes the guide.'
    case 'Ready': {
      if (!guide.lap) return 'Ready.'
      const date = guide.lap.recordedAt ? new Date(guide.lap.recordedAt).toLocaleDateString(undefined, { day: 'numeric', month: 'short' }) : ''
      const car = guide.lap.sameCar ? guide.lap.car : `${guide.lap.car}, no lap in this car yet`
      const boards = guide.boards === 1 ? '1 brake board' : `${guide.boards} brake boards`
      return [formatLapSeconds(guide.lap.lapTimeSeconds), car, date, boards].filter(Boolean).join(' · ')
    }
  }
}

type GuideNumber = 'eyeRightMeters' | 'eyeUpMeters' | 'eyeForwardMeters' | 'yawOffsetDegrees' | 'pitchOffsetDegrees' | 'monitorFovDegrees' | 'metersAhead'

/**
 * The AR driving line and brake boards (docs/internals/driving-guide.md): what to draw, where,
 * and the seat calibration that puts it on the road. Toggles apply at once, numbers on commit.
 */
function GuideGroup({ guide, send }: { guide: GuideState; send: Send }) {
  const { settings, vr } = guide
  const update = (patch: Partial<GuideSettings>) => void send({ type: 'guide.update', ...patch })
  const number = (field: GuideNumber, label: string, step: number) => (
    <GuideNumberField
      key={`${field}:${settings[field]}`}
      label={label}
      value={settings[field]}
      step={step}
      onCommit={(value) => update({ [field]: value })}
    />
  )

  return (
    <SettingsGroup title="Driving guide">
      <SettingRow id="settings-guide-line" icon={Route} title="Racing line" description="A ribbon on the road from your best lap: green on throttle, amber lifting, red braking.">
        {(labels) => <Switch {...labels} checked={settings.showLine} onChange={(showLine) => update({ showLine })} />}
      </SettingRow>
      <SettingRow id="settings-guide-boards" icon={Signpost} title="Brake boards" description="A board beside the track where that lap started braking.">
        {(labels) => <Switch {...labels} checked={settings.showBoards} onChange={(showBoards) => update({ showBoards })} />}
      </SettingRow>
      <SettingRow
        id="settings-guide-monitor"
        icon={Monitor}
        title="On this monitor"
        description="Draws over the game on your main display. Run the game borderless, with look to apex and head movement off."
      >
        {(labels) => <Switch {...labels} checked={settings.monitorOverlay} onChange={(monitorOverlay) => update({ monitorOverlay })} />}
      </SettingRow>
      <SettingRow
        id="settings-guide-vr"
        icon={Glasses}
        title="In VR"
        description={vr.detail ?? (settings.vrHeadset && !vr.registered
          ? 'Sprint could not register its OpenXR layer. Check the log in Help.'
          : 'Adds the guide to your headset through OpenXR. Takes effect the next time the game starts.')}
      >
        {(labels) => (vr.available
          ? <Switch {...labels} checked={settings.vrHeadset} onChange={(vrHeadset) => update({ vrHeadset })} />
          : <Status tone="neutral" quiet>Unavailable</Status>)}
      </SettingRow>
      <SettingRow id="settings-guide-lap" icon={Flag} title="Reference lap" description={guideLapText(guide)}>
        {() => null}
      </SettingRow>
      <SettingRow
        id="settings-guide-eye"
        icon={Crosshair}
        title="Eye position"
        description="Where your eyes sit in the car, in metres. Adjust until the line lies on the road."
      >
        {() => (
          <>
            {number('eyeRightMeters', 'Right', 0.05)}
            {number('eyeUpMeters', 'Up', 0.05)}
            {number('eyeForwardMeters', 'Forward', 0.05)}
          </>
        )}
      </SettingRow>
      <SettingRow id="settings-guide-align" icon={Compass} title="Alignment" description="Turns the guide right and raises it, in degrees.">
        {() => (
          <>
            {number('yawOffsetDegrees', 'Turn', 0.5)}
            {number('pitchOffsetDegrees', 'Raise', 0.5)}
          </>
        )}
      </SettingRow>
      <SettingRow id="settings-guide-fov" icon={ScanEye} title="Field of view" description="Your in-game vertical field of view, in degrees. Only the monitor overlay uses it.">
        {() => number('monitorFovDegrees', 'Degrees', 1)}
      </SettingRow>
      <SettingRow id="settings-guide-ahead" icon={Ruler} title="Distance ahead" description="How much of the line is drawn in front of the car, in metres.">
        {() => number('metersAhead', 'Metres', 10)}
      </SettingRow>
    </SettingsGroup>
  )
}

/** A labelled number that saves on blur or Enter. A blank or unchanged field saves nothing. */
function GuideNumberField({ label, value, step, onCommit }: { label: string; value: number; step: number; onCommit: (value: number) => void }) {
  const [draft, setDraft] = useState(String(value))
  const commit = () => {
    const parsed = Number(draft)
    if (draft.trim() === '' || !Number.isFinite(parsed)) {
      setDraft(String(value))
      return
    }
    if (parsed !== value) onCommit(parsed)
  }
  return (
    <label className="settings-guide-number">
      <span>{label}</span>
      <input
        type="number"
        className="settings-input-narrow tabular"
        value={draft}
        step={step}
        onChange={(event) => setDraft(event.target.value)}
        onBlur={commit}
        onKeyDown={blurOnEnter}
      />
    </label>
  )
}

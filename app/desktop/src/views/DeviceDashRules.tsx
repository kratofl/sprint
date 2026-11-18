import { useState } from 'react'
import { Car, Gamepad2, Plus, Tags, X, type LucideIcon } from 'lucide-react'
import { bridge } from '../bridge'
import type { SprintCommand } from '../bridge'
import { MenuLayer, type MenuAnchor } from '../shell/Menu'
import { SettingRow } from './SettingsLayout'
import { DASH_RULE_KINDS, buildDashRules, dashRuleChoices, dashRuleName } from './DevicesDomain'
import type { DashOption, DashRuleChoice, DashRuleKind, Device, DeviceDashRule } from './DevicesDomain'

const KIND_ICONS: Record<DashRuleKind, LucideIcon> = { game: Gamepad2, class: Tags, car: Car }

const MENU_WIDTH = 260

/** The menu's state: closed, loading what Sprint has recorded, or open on its choices. */
type AddMenu = { kind: 'closed' } | { kind: 'open'; anchor: MenuAnchor; choices: DashRuleChoice[] | null }

/**
 * A device's other dashes, under the one it shows for every car (Output tab): one row per game,
 * class or car with its dash and Remove, then "Add a game, class or car". The menu offers the
 * games and cars Sprint has recorded (the planner's `planContext`, loaded when it opens) and every
 * class. A new rule starts on the device's own dash (the first dash if that one is gone); picking another in its row makes it count.
 */
export function DeviceDashRules({ device, dashOptions, send }: { device: Device; dashOptions: DashOption[]; send: (command: SprintCommand) => Promise<void> }) {
  const [menu, setMenu] = useState<AddMenu>({ kind: 'closed' })
  const rules = device.dashRules
  const save = (next: readonly DeviceDashRule[]): void => void send(buildDashRules(device, next))

  const open = (anchor: MenuAnchor): void => {
    setMenu({ kind: 'open', anchor, choices: null })
    bridge
      .planContext()
      .then((context) => setMenu((current) => (current.kind === 'open' ? { ...current, choices: dashRuleChoices(context, rules) } : current)))
      .catch((error: unknown) => {
        console.error('Loading recorded games and cars failed', error)
        setMenu((current) => (current.kind === 'open' ? { ...current, choices: dashRuleChoices({ prefill: { game: '', car: '', track: '' }, games: [], cars: [] }, rules) } : current))
      })
  }

  const choices = menu.kind === 'open' ? menu.choices : null
  const section = (kind: DashRuleKind, title: string) => {
    const items = (choices ?? []).filter((choice) => choice.kind === kind)
    if (items.length === 0) return null
    return (
      <>
        <div className="device-rule-head">{title}</div>
        {items.map((choice) => (
          <button
            key={`${choice.kind}:${choice.value}`}
            type="button"
            role="menuitem"
            className="menu-item"
            onClick={() => {
              setMenu({ kind: 'closed' })
              save([...rules, { kind: choice.kind, value: choice.value, dashId: dashOptions.some((option) => option.id === device.dashId) ? device.dashId : (dashOptions[0]?.id ?? device.dashId) }])
            }}
          >
            <span className="menu-item-label">{dashRuleName(choice)}</span>
          </button>
        ))}
      </>
    )
  }

  return (
    <>
      {rules.map((rule, index) => (
        <SettingRow key={`${rule.kind}:${rule.value}`} id={`device-rule-${index}`} icon={KIND_ICONS[rule.kind]} title={dashRuleName(rule)} description={DASH_RULE_KINDS[rule.kind]}>
          {(labels) => (
            <>
              <select {...labels} className="settings-input-wide" value={rule.dashId} onChange={(event) => save(rules.map((candidate, at) => (at === index ? { ...candidate, dashId: event.target.value } : candidate)))}>
                {dashOptions.map((option) => (
                  <option key={option.id} value={option.id}>
                    {option.name}
                  </option>
                ))}
              </select>
              <button type="button" className="icon-button" aria-label={`Remove ${dashRuleName(rule)}`} title="Remove" onClick={() => save(rules.filter((_, at) => at !== index))}>
                <X size={14} />
              </button>
            </>
          )}
        </SettingRow>
      ))}
      <button
        type="button"
        className="button subtle device-rule-add"
        aria-haspopup="menu"
        aria-expanded={menu.kind === 'open'}
        onClick={(event) => {
          const box = event.currentTarget.getBoundingClientRect()
          open({ x: box.left, y: box.bottom + 4 })
        }}
      >
        <Plus /> Add a game, class or car
      </button>
      {menu.kind === 'open' && (
        <MenuLayer anchor={menu.anchor} label="Add a game, class or car" width={MENU_WIDTH} onClose={() => setMenu({ kind: 'closed' })}>
          {choices === null ? (
            <div className="device-rule-head">Loading…</div>
          ) : (
            <>
              {section('game', 'Games')}
              {section('class', 'Classes')}
              {section('car', 'Cars you have driven')}
            </>
          )}
        </MenuLayer>
      )}
    </>
  )
}

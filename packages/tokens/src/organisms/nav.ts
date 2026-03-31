/**
 * NavRail organism tokens.
 * Icon-rail navigation: always shows icons, labels revealed on expand.
 * Collapsed for focus, expanded for discovery.
 */
export const navRail = {
  widthCollapsed: '3.25rem',  // 52px — icon only
  widthExpanded:  '12.5rem',  // 200px — icon + label
  itemHeight:     '2rem',     // 32px — compact nav items
  iconSize:       '1rem',     // 16px — standard nav icon
  transitionDuration: '150ms',
  transitionEasing:   'cubic-bezier(0.4, 0, 0.2, 1)',
} as const

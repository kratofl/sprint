/**
 * A session's kind as a tag, coloured so practice, qualifying and race tell apart at a glance:
 * Practice blue, Quali yellow, Race the brand's orange. Other kinds (warm-up, test day, shared)
 * stay neutral. The word is always there, so the colour is never the only cue.
 */
export function SessionChip({ kind }: { kind: string }) {
  return <span className={`chip${toneOf(kind)}`}>{kind}</span>
}

const toneOf = (kind: string): string => {
  switch (kind) {
    case 'Practice':
      return ' chip-info'
    case 'Quali':
      return ' chip-warning'
    case 'Race':
      return ' chip-default'
    default:
      return ''
  }
}

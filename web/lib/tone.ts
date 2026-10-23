// The design system's tints: a -100 background with -700 content, and in dark
// mode the -500 at 20 % with -300 content. Tags, icon tiles and inline banners
// share them. Written out in full so Tailwind sees every class.

export type Tone = 'brand' | 'green' | 'blue' | 'yellow' | 'red' | 'purple' | 'neutral'

export const toneTint: Record<Tone, string> = {
  brand: 'bg-brand-100 text-brand-700 dark:bg-brand-500/20 dark:text-brand-300',
  green: 'bg-green-100 text-green-700 dark:bg-green-500/20 dark:text-green-300',
  blue: 'bg-blue-100 text-blue-700 dark:bg-blue-500/20 dark:text-blue-300',
  yellow: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-500/20 dark:text-yellow-300',
  red: 'bg-red-100 text-red-700 dark:bg-red-500/20 dark:text-red-300',
  purple: 'bg-purple-100 text-purple-700 dark:bg-purple-500/20 dark:text-purple-300',
  neutral: 'bg-fill text-label-secondary',
}

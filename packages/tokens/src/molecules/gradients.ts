/**
 * Gradient tokens.
 * Gradients give CTA elements a built, crafted feeling vs flat fills.
 * Simulates the shimmer of heat-treated metal.
 * Use on: primary buttons, progress bars, delta indicators, active states.
 * Do NOT use on text or borders — reserved for fills only.
 */

/** Warm coral orange — primary CTA, driver-owned actions */
export const gradientAccent =
  'linear-gradient(135deg, #ff906c 0%, #ff784d 100%)'

/** Subtle orange tint — hover states, active backgrounds */
export const gradientAccentSubtle =
  'linear-gradient(135deg, rgba(255,144,108,0.14) 0%, rgba(255,120,77,0.07) 100%)'

/** Deep teal — secondary CTA, engineer-originated actions */
export const gradientTeal =
  'linear-gradient(135deg, #25C4A8 0%, #15847A 100%)'

/** Subtle teal tint — secondary hover states */
export const gradientTealSubtle =
  'linear-gradient(135deg, rgba(30,165,140,0.14) 0%, rgba(21,132,122,0.07) 100%)'

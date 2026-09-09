export const spacing = {
  xxs: 4,
  xs: 8,
  sm: 12,
  md: 16,
  lg: 20,
  xl: 24,
  xxl: 32,
  xxxl: 40,
} as const;

export const radii = {
  xs: 6,
  sm: 10,
  md: 14,
  lg: 18,
  xl: 24,
  xxl: 32,
  pill: 999,
} as const;

export const buttonHeights = {
  sm: 40,
  md: 48,
  lg: 56,
} as const;

// Height of the floating pill-shaped bottom tab bar (see MainTabNavigator).
// It renders with position: 'absolute', so it does NOT reserve space in the
// screen below it — every scrollable tab screen must add clearance equal to
// roughly this much (plus safe-area inset) to its bottom padding, or the
// last item(s) in that list render underneath the tab bar and appear to be
// "missing" (this was the cause of the Logout button seemingly disappearing).
export const TAB_BAR_HEIGHT = 64;

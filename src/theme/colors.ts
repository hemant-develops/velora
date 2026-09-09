export const colors = {
  primary: '#F4C728',
  primaryDark: '#E0B31A',
  onPrimary: '#1A1A24',

  background: '#FFFFFF',
  surface: '#F5F6F9',
  surfaceAlt: '#EFF1F6',
  card: '#FFFFFF',

  textPrimary: '#14141F',
  textSecondary: '#7C7E8C',
  textTertiary: '#A6A8B3',
  textInverse: '#FFFFFF',

  border: '#E7E8EE',
  borderLight: '#F0F1F5',

  success: '#2ECC71',
  successBg: '#E7F9EE',
  danger: '#EB5757',
  dangerBg: '#FDEAEA',
  warning: '#F2994A',
  warningBg: '#FDF1E6',
  info: '#2F80ED',
  infoBg: '#E9F1FE',

  overlay: 'rgba(10,10,20,0.45)',
  overlaySoft: 'rgba(10,10,20,0.2)',
  scrim: 'rgba(0,0,0,0.55)',

  star: '#F4C728',

  black: '#0B0B12',
  white: '#FFFFFF',
} as const;

export type AppColors = typeof colors;

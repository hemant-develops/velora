import { TextStyle } from 'react-native';

type TypeScale =
  | 'displayLg'
  | 'displayMd'
  | 'headingLg'
  | 'headingMd'
  | 'headingSm'
  | 'titleLg'
  | 'titleMd'
  | 'bodyLg'
  | 'bodyMd'
  | 'bodySm'
  | 'caption'
  | 'overline'
  | 'button';

export const typography: Record<TypeScale, TextStyle> = {
  displayLg: { fontSize: 30, fontWeight: '700', lineHeight: 38, letterSpacing: -0.3 },
  displayMd: { fontSize: 26, fontWeight: '700', lineHeight: 34, letterSpacing: -0.2 },
  headingLg: { fontSize: 22, fontWeight: '700', lineHeight: 28 },
  headingMd: { fontSize: 19, fontWeight: '700', lineHeight: 25 },
  headingSm: { fontSize: 17, fontWeight: '700', lineHeight: 22 },
  titleLg: { fontSize: 16, fontWeight: '600', lineHeight: 22 },
  titleMd: { fontSize: 15, fontWeight: '600', lineHeight: 20 },
  bodyLg: { fontSize: 16, fontWeight: '400', lineHeight: 23 },
  bodyMd: { fontSize: 14, fontWeight: '400', lineHeight: 20 },
  bodySm: { fontSize: 12.5, fontWeight: '400', lineHeight: 18 },
  caption: { fontSize: 11.5, fontWeight: '500', lineHeight: 15 },
  overline: { fontSize: 11, fontWeight: '700', lineHeight: 14, letterSpacing: 0.6 },
  button: { fontSize: 15.5, fontWeight: '700', lineHeight: 20 },
};

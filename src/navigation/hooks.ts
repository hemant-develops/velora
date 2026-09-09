import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { RootStackParamList } from './types';
import { spacing, TAB_BAR_HEIGHT } from '../theme';

export type AppNavigationProp = NativeStackNavigationProp<RootStackParamList>;

export const useAppNavigation = () => useNavigation<AppNavigationProp>();

// Extra bottom padding every tab-bar screen (Home, My Rents / Listings,
// Messages, Profile) should add to its scroll content so nothing renders
// underneath the floating bottom tab bar.
export const useTabBarClearance = (): number => {
  const insets = useSafeAreaInsets();
  return insets.bottom + spacing.sm + TAB_BAR_HEIGHT + spacing.lg;
};

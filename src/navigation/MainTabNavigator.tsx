import React, { useEffect } from 'react';
import { Platform, View } from 'react-native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { MainTabParamList } from './types';
import { colors, radii, shadows, spacing } from '../theme';
import { HomeScreen } from '../screens/home/HomeScreen';
import { MessagesScreen } from '../screens/messages/MessagesScreen';
import { MyRentsScreen } from '../screens/rents/MyRentsScreen';
import { ProfileScreen } from '../screens/profile/ProfileScreen';
import { useAuth } from '../context/AuthContext';
import { useMessages } from '../context/MessagesContext';
import { useLocationSystem } from '../context/LocationContext';

const Tab = createBottomTabNavigator<MainTabParamList>();

const ICONS: Record<keyof MainTabParamList, keyof typeof Ionicons.glyphMap> = {
  HomeTab: 'home',
  MessagesTab: 'chatbubble-ellipses',
  RentsTab: 'key',
  ProfileTab: 'person',
};

const OUTLINE_ICONS: Record<keyof MainTabParamList, keyof typeof Ionicons.glyphMap> = {
  HomeTab: 'home-outline',
  MessagesTab: 'chatbubble-ellipses-outline',
  RentsTab: 'key-outline',
  ProfileTab: 'person-outline',
};

// Renters and Rental Owners are genuinely different apps, not the same four
// tabs with different content underneath: a renter gets the full browse /
// search / rent experience, while an owner account is kept close to what an
// owner needs -- their own listings, their conversations with renters, and
// their own profile. Messages IS included for owners (unlike Home/browse) --
// an owner has no way to run their side of the Owner<->Customer relationship
// (answering a renter's question before pickup, coordinating handover,
// resolving an issue) without a persistent way to see every conversation,
// and MessagesScreen/MessagesContext/ConversationDetailScreen already fully
// support the owner role end-to-end -- this was simply never mounted for
// them.
export const MainTabNavigator: React.FC = () => {
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const { getUnreadCountForUser } = useMessages();
  const { ensureLocationOnLaunch } = useLocationSystem();
  const isOwner = user?.role === 'owner';
  const totalUnread = user ? getUnreadCountForUser(user.id, user.role) : 0;

  // Runs once per account, right after they land in the main app (either
  // role) -- see LocationContext for why this never nags or assumes a
  // default location.
  useEffect(() => {
    ensureLocationOnLaunch();
  }, [user?.id]);

  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: 'rgba(255,255,255,0.55)',
        tabBarShowLabel: true,
        tabBarLabelStyle: { fontSize: 11, fontWeight: '600', marginBottom: Platform.OS === 'ios' ? 0 : 4 },
        tabBarStyle: [
          shadows.lg,
          {
            position: 'absolute',
            left: spacing.lg,
            right: spacing.lg,
            bottom: insets.bottom + spacing.sm,
            height: 64,
            borderRadius: radii.xxl,
            backgroundColor: colors.textPrimary,
            borderTopWidth: 0,
            paddingTop: 8,
          },
        ],
        tabBarIcon: ({ focused, color, size }) => (
          <View>
            <Ionicons
              name={focused ? ICONS[route.name] : OUTLINE_ICONS[route.name]}
              size={size ? size - 2 : 20}
              color={color}
            />
          </View>
        ),
        tabBarBadge:
          route.name === 'MessagesTab' && totalUnread > 0 ? totalUnread : undefined,
        tabBarBadgeStyle: { backgroundColor: colors.danger, fontSize: 10 },
      })}
    >
      {isOwner ? (
        <>
          <Tab.Screen name="RentsTab" component={MyRentsScreen} options={{ title: 'Listings' }} />
          <Tab.Screen name="MessagesTab" component={MessagesScreen} options={{ title: 'Messages' }} />
          <Tab.Screen name="ProfileTab" component={ProfileScreen} options={{ title: 'Profile' }} />
        </>
      ) : (
        <>
          <Tab.Screen name="HomeTab" component={HomeScreen} options={{ title: 'Home' }} />
          <Tab.Screen name="MessagesTab" component={MessagesScreen} options={{ title: 'Message' }} />
          <Tab.Screen name="RentsTab" component={MyRentsScreen} options={{ title: 'My Rents' }} />
          <Tab.Screen name="ProfileTab" component={ProfileScreen} options={{ title: 'Profile' }} />
        </>
      )}
    </Tab.Navigator>
  );
};

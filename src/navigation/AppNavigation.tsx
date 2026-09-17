import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { useAuth } from '../context/AuthContext';
import { SplashScreen } from '../screens/common/SplashScreen';
import { SetNewPasswordScreen } from '../screens/auth/SetNewPasswordScreen';
import { AuthNavigator } from './AuthNavigator';
import { RootNavigator } from './RootNavigator';
import { navigationRef } from './navigationRef';

export const AppNavigation: React.FC = () => {
  const { isAuthenticated, isLoading, passwordRecoveryPending } = useAuth();

  if (isLoading) return <SplashScreen />;

  // `ref` lets code outside the component tree (a tapped push notification,
  // the in-app notification popup) navigate too -- see navigationRef.ts.
  return (
    <NavigationContainer ref={navigationRef}>
      {passwordRecoveryPending ? (
        // SECURITY FIX -- a password-recovery link establishes a real,
        // authenticated session (that's how Supabase's recovery flow works),
        // so `isAuthenticated` alone would otherwise drop the person
        // straight into the app with their OLD password still active. This
        // must be checked before isAuthenticated below, not after.
        <SetNewPasswordScreen />
      ) : isAuthenticated ? (
        <RootNavigator />
      ) : (
        <AuthNavigator />
      )}
    </NavigationContainer>
  );
};

import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { useAuth } from '../context/AuthContext';
import { SplashScreen } from '../screens/common/SplashScreen';
import { AuthNavigator } from './AuthNavigator';
import { RootNavigator } from './RootNavigator';
import { navigationRef } from './navigationRef';

export const AppNavigation: React.FC = () => {
  const { isAuthenticated, isLoading } = useAuth();

  if (isLoading) return <SplashScreen />;

  // `ref` lets code outside the component tree (a tapped push notification,
  // the in-app notification popup) navigate too -- see navigationRef.ts.
  return (
    <NavigationContainer ref={navigationRef}>
      {isAuthenticated ? <RootNavigator /> : <AuthNavigator />}
    </NavigationContainer>
  );
};

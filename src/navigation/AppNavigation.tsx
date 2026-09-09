import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { useAuth } from '../context/AuthContext';
import { SplashScreen } from '../screens/common/SplashScreen';
import { AuthNavigator } from './AuthNavigator';
import { RootNavigator } from './RootNavigator';

export const AppNavigation: React.FC = () => {
  const { isAuthenticated, isLoading } = useAuth();

  if (isLoading) return <SplashScreen />;

  return <NavigationContainer>{isAuthenticated ? <RootNavigator /> : <AuthNavigator />}</NavigationContainer>;
};

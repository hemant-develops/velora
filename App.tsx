import { StatusBar } from 'expo-status-bar';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AuthProvider } from './src/context/AuthContext';
import { LocationProvider } from './src/context/LocationContext';
import { NotificationsProvider } from './src/context/NotificationsContext';
import { FavoritesProvider } from './src/context/FavoritesContext';
import { BookingsProvider } from './src/context/BookingsContext';
import { CarsProvider } from './src/context/CarsContext';
import { MessagesProvider } from './src/context/MessagesContext';
import { ReviewsProvider } from './src/context/ReviewsContext';
import { AppNavigation } from './src/navigation/AppNavigation';
import { ErrorBoundary } from './src/components/ErrorBoundary';

export default function App() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <AuthProvider>
          <LocationProvider>
            <NotificationsProvider>
              <CarsProvider>
                <FavoritesProvider>
                  <BookingsProvider>
                    <MessagesProvider>
                      <ReviewsProvider>
                        <StatusBar style="dark" />
                        <ErrorBoundary>
                          <AppNavigation />
                        </ErrorBoundary>
                      </ReviewsProvider>
                    </MessagesProvider>
                  </BookingsProvider>
                </FavoritesProvider>
              </CarsProvider>
            </NotificationsProvider>
          </LocationProvider>
        </AuthProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

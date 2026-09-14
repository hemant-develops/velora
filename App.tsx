import { StatusBar } from 'expo-status-bar';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AuthProvider } from './src/context/AuthContext';
import { LocationProvider } from './src/context/LocationContext';
import { NotificationsProvider } from './src/context/NotificationsContext';
import { FavoritesProvider } from './src/context/FavoritesContext';
import { BookingsProvider } from './src/context/BookingsContext';
import { CarsProvider } from './src/context/CarsContext';
import { CatalogProvider } from './src/context/CatalogContext';
import { MessagesProvider } from './src/context/MessagesContext';
import { ReviewsProvider } from './src/context/ReviewsContext';
import { ReportsProvider } from './src/context/ReportsContext';
import { RewardsProvider } from './src/context/RewardsContext';
import { AppNavigation } from './src/navigation/AppNavigation';
import { ErrorBoundary } from './src/components/ErrorBoundary';
import { UpdateBanner } from './src/components/UpdateBanner';
import { useAppUpdatePrompt } from './src/hooks/useAppUpdatePrompt';
import { useNotificationRouting } from './src/hooks/useNotificationRouting';

export default function App() {
  // Shows the "Update available -- Restart now?" prompt other apps have,
  // instead of expo-updates' default silent apply-on-next-cold-start. Only
  // does anything in a real EAS build (see the hook's own comment).
  useAppUpdatePrompt();
  // Makes a push notification show as a real banner even while the app is
  // open, and makes tapping one open the exact booking/conversation it's
  // about -- see the hook's own comment for what was missing before.
  useNotificationRouting();

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <AuthProvider>
          <LocationProvider>
            <NotificationsProvider>
              <CatalogProvider>
                <CarsProvider>
                  <FavoritesProvider>
                    <BookingsProvider>
                      <RewardsProvider>
                        <MessagesProvider>
                          <ReviewsProvider>
                            <ReportsProvider>
                              <StatusBar style="dark" />
                              <ErrorBoundary>
                                <AppNavigation />
                              </ErrorBoundary>
                              {/* Additive overlay, not a gate -- floats over AppNavigation and
                                  renders nothing on its own whenever there's no update to show,
                                  so it can never be the reason the app fails to render. */}
                              <UpdateBanner />
                            </ReportsProvider>
                          </ReviewsProvider>
                        </MessagesProvider>
                      </RewardsProvider>
                    </BookingsProvider>
                  </FavoritesProvider>
                </CarsProvider>
              </CatalogProvider>
            </NotificationsProvider>
          </LocationProvider>
        </AuthProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { RootStackParamList } from './types';
import { MainTabNavigator } from './MainTabNavigator';
import { CarDetailsScreen } from '../screens/car/CarDetailsScreen';
import { BrandCarsScreen } from '../screens/car/BrandCarsScreen';
import { BookingScreen } from '../screens/booking/BookingScreen';
import { RentalAgreementScreen } from '../screens/booking/RentalAgreementScreen';
import { PaymentScreen } from '../screens/payment/PaymentScreen';
import { BookingConfirmationScreen } from '../screens/booking/BookingConfirmationScreen';
import { FilterScreen } from '../screens/filter/FilterScreen';
import { EditProfileScreen } from '../screens/profile/EditProfileScreen';
import { ConversationDetailScreen } from '../screens/messages/ConversationDetailScreen';
import { OwnerAddCarScreen } from '../screens/owner/OwnerAddCarScreen';
import { FavoritesScreen } from '../screens/favorites/FavoritesScreen';
import { NotificationsScreen } from '../screens/misc/NotificationsScreen';
import { PaymentMethodsScreen } from '../screens/misc/PaymentMethodsScreen';
import { HelpSupportScreen } from '../screens/misc/HelpSupportScreen';
import { LegalScreen } from '../screens/misc/LegalScreen';
import { ReviewScreen } from '../screens/rents/ReviewScreen';
import { OwnerVerificationScreen } from '../screens/profile/OwnerVerificationScreen';
import { LocationPickerScreen } from '../screens/misc/LocationPickerScreen';
import { OwnerPublicProfileScreen } from '../screens/owner/OwnerPublicProfileScreen';
import { CustomerProfileScreen } from '../screens/profile/CustomerProfileScreen';
import { BookingDetailsScreen } from '../screens/booking/BookingDetailsScreen';

const Stack = createNativeStackNavigator<RootStackParamList>();

export const RootNavigator: React.FC = () => (
  <Stack.Navigator screenOptions={{ headerShown: false }}>
    <Stack.Screen name="Main" component={MainTabNavigator} />
    <Stack.Screen name="CarDetails" component={CarDetailsScreen} />
    <Stack.Screen name="BrandCars" component={BrandCarsScreen} />
    <Stack.Screen name="Booking" component={BookingScreen} />
    <Stack.Screen name="Agreement" component={RentalAgreementScreen} />
    <Stack.Screen name="Payment" component={PaymentScreen} />
    <Stack.Screen name="BookingConfirmation" component={BookingConfirmationScreen} options={{ gestureEnabled: false }} />
    <Stack.Screen name="Filter" component={FilterScreen} options={{ presentation: 'modal' }} />
    <Stack.Screen name="EditProfile" component={EditProfileScreen} />
    <Stack.Screen name="Favorites" component={FavoritesScreen} />
    <Stack.Screen name="ConversationDetail" component={ConversationDetailScreen} />
    <Stack.Screen name="OwnerAddCar" component={OwnerAddCarScreen} options={{ presentation: 'modal' }} />
    <Stack.Screen name="OwnerVerification" component={OwnerVerificationScreen} options={{ presentation: 'modal' }} />
    <Stack.Screen name="OwnerProfile" component={OwnerPublicProfileScreen} />
    <Stack.Screen name="CustomerProfile" component={CustomerProfileScreen} />
    <Stack.Screen name="BookingDetails" component={BookingDetailsScreen} />
    <Stack.Screen name="LocationPicker" component={LocationPickerScreen} options={{ presentation: 'modal' }} />
    <Stack.Screen name="Notifications" component={NotificationsScreen} />
    <Stack.Screen name="PaymentMethods" component={PaymentMethodsScreen} />
    <Stack.Screen name="HelpSupport" component={HelpSupportScreen} />
    <Stack.Screen name="Legal" component={LegalScreen} />
    <Stack.Screen name="Review" component={ReviewScreen} options={{ presentation: 'modal' }} />
  </Stack.Navigator>
);

import React, { useMemo, useState } from 'react';
import { Image, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import { RootStackParamList } from '../../navigation/types';
import { colors, radii, shadows, spacing, typography } from '../../theme';
import { ScreenHeader } from '../../components/ScreenHeader';
import { InputField } from '../../components/InputField';
import { PrimaryButton } from '../../components/PrimaryButton';
import { Chip } from '../../components/Chip';
import { RentalModeSelector } from '../../components/RentalModeSelector';
import { FallbackImage } from '../../components/FallbackImage';
import { EmptyState } from '../../components/EmptyState';
import { useCars } from '../../context/CarsContext';
import { avatars } from '../../data/images';
import { formatCurrency, formatDate } from '../../utils/format';
import { RentalMode } from '../../types';

type Props = NativeStackScreenProps<RootStackParamList, 'Booking'>;

const TIME_SLOTS = ['09:00 AM', '12:00 PM', '03:00 PM', '06:00 PM'];
const SERVICE_FEE = 250;
const TAX_RATE = 0.1;

const addDays = (base: Date, days: number) => {
  const d = new Date(base);
  d.setDate(d.getDate() + days);
  return d;
};

export const BookingScreen: React.FC<Props> = ({ route, navigation }) => {
  const insets = useSafeAreaInsets();
  const { getCarById } = useCars();
  const car = getCarById(route.params.carId);

  const [rentalMode, setRentalMode] = useState<RentalMode>(car?.rentalModes[0] ?? 'self_drive');
  const [pickupOffset, setPickupOffset] = useState(1);
  const [dropoffOffset, setDropoffOffset] = useState(4);
  const [pickupTime, setPickupTime] = useState(TIME_SLOTS[0]);
  const [dropoffTime, setDropoffTime] = useState(TIME_SLOTS[2]);
  const [pickupLocation, setPickupLocation] = useState(car?.location ?? '');
  const [dropoffLocation, setDropoffLocation] = useState(car?.location ?? '');

  const today = useMemo(() => new Date(), []);
  const pickupDate = useMemo(() => addDays(today, pickupOffset), [today, pickupOffset]);
  const dropoffDate = useMemo(() => addDays(today, dropoffOffset), [today, dropoffOffset]);
  const days = Math.max(dropoffOffset - pickupOffset, 1);

  if (!car) {
    return (
      <View style={{ flex: 1, paddingTop: insets.top }}>
        <EmptyState icon="alert-circle-outline" title="Unable to load booking" />
      </View>
    );
  }

  const activePrice = rentalMode === 'self_drive' ? car.pricePerDay : car.driverPricePerDay;
  const subtotal = activePrice * days;
  const taxes = Math.round(subtotal * TAX_RATE);
  const total = subtotal + taxes + SERVICE_FEE;

  const onContinue = () => {
    navigation.navigate('Agreement', {
      carId: car.id,
      rentalMode,
      pickupLocation,
      dropoffLocation,
      pickupDate: pickupDate.toISOString(),
      dropoffDate: dropoffDate.toISOString(),
      pickupTime,
      dropoffTime,
      days,
      subtotal,
      taxes,
      serviceFee: SERVICE_FEE,
      total,
    });
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <ScreenHeader title="Booking Details" onBack={() => navigation.goBack()} />

      <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: 160 }} showsVerticalScrollIndicator={false}>
        <View style={[styles.carRow, shadows.sm]}>
          <FallbackImage uri={car.images[0]} style={styles.carImage} />
          <View style={{ flex: 1, marginLeft: spacing.md }}>
            <Text style={typography.titleLg} numberOfLines={1}>{car.name}</Text>
            <Text style={styles.carMeta}>{car.category}</Text>
          </View>
        </View>

        <Text style={styles.sectionTitle}>How would you like to rent?</Text>
        <RentalModeSelector
          value={rentalMode}
          onChange={setRentalMode}
          selfDrivePrice={car.pricePerDay}
          withDriverPrice={car.driverPricePerDay}
          availableModes={car.rentalModes}
        />

        {rentalMode === 'with_driver' ? (
          <View style={styles.driverCard}>
            <Image source={{ uri: avatars.driver }} style={styles.driverAvatar} />
            <View style={{ flex: 1, marginLeft: spacing.sm }}>
              <Text style={typography.titleMd}>Professional Verified Driver</Text>
              <Text style={styles.driverCaption}>Included · up to 8 hours/day · fluent in English</Text>
            </View>
            <Ionicons name="shield-checkmark" size={20} color={colors.success} />
          </View>
        ) : null}

        <Text style={styles.sectionTitle}>Pickup &amp; Drop-off</Text>
        <InputField label="Pickup Location" leftIcon="location-outline" value={pickupLocation} onChangeText={setPickupLocation} />
        <InputField label="Drop-off Location" leftIcon="location-outline" value={dropoffLocation} onChangeText={setDropoffLocation} />

        <View style={styles.dateRow}>
          <View style={styles.dateCol}>
            <Text style={styles.dateLabel}>Pickup Date</Text>
            <View style={styles.stepper}>
              <Pressable onPress={() => setPickupOffset((v) => Math.max(0, v - 1))} style={styles.stepperBtn} hitSlop={8}>
                <Ionicons name="remove" size={16} color={colors.textPrimary} />
              </Pressable>
              <Text style={styles.dateValue}>{formatDate(pickupDate.toISOString())}</Text>
              <Pressable
                onPress={() => setPickupOffset((v) => Math.min(v + 1, dropoffOffset - 1))}
                style={styles.stepperBtn}
                hitSlop={8}
              >
                <Ionicons name="add" size={16} color={colors.textPrimary} />
              </Pressable>
            </View>
          </View>
          <View style={styles.dateCol}>
            <Text style={styles.dateLabel}>Drop-off Date</Text>
            <View style={styles.stepper}>
              <Pressable
                onPress={() => setDropoffOffset((v) => Math.max(v - 1, pickupOffset + 1))}
                style={styles.stepperBtn}
                hitSlop={8}
              >
                <Ionicons name="remove" size={16} color={colors.textPrimary} />
              </Pressable>
              <Text style={styles.dateValue}>{formatDate(dropoffDate.toISOString())}</Text>
              <Pressable onPress={() => setDropoffOffset((v) => v + 1)} style={styles.stepperBtn} hitSlop={8}>
                <Ionicons name="add" size={16} color={colors.textPrimary} />
              </Pressable>
            </View>
          </View>
        </View>

        <Text style={styles.dateLabel}>Pickup Time</Text>
        <View style={styles.chipRow}>
          {TIME_SLOTS.map((slot) => (
            <Chip key={`pu-${slot}`} label={slot} selected={pickupTime === slot} onPress={() => setPickupTime(slot)} />
          ))}
        </View>

        <Text style={[styles.dateLabel, { marginTop: spacing.sm }]}>Drop-off Time</Text>
        <View style={styles.chipRow}>
          {TIME_SLOTS.map((slot) => (
            <Chip key={`do-${slot}`} label={slot} selected={dropoffTime === slot} onPress={() => setDropoffTime(slot)} />
          ))}
        </View>

        <Text style={styles.sectionTitle}>Price Details</Text>
        <View style={styles.summaryCard}>
          <View style={styles.summaryRow}>
            <Text style={styles.summaryLabel}>
              {formatCurrency(activePrice)} x {days} day{days === 1 ? '' : 's'}
            </Text>
            <Text style={styles.summaryValue}>{formatCurrency(subtotal)}</Text>
          </View>
          <View style={styles.summaryRow}>
            <Text style={styles.summaryLabel}>Taxes</Text>
            <Text style={styles.summaryValue}>{formatCurrency(taxes)}</Text>
          </View>
          <View style={styles.summaryRow}>
            <Text style={styles.summaryLabel}>Service fee</Text>
            <Text style={styles.summaryValue}>{formatCurrency(SERVICE_FEE)}</Text>
          </View>
          <View style={styles.divider} />
          <View style={styles.summaryRow}>
            <Text style={styles.totalLabel}>Total Amount</Text>
            <Text style={styles.totalValue}>{formatCurrency(total)}</Text>
          </View>
        </View>
      </ScrollView>

      <View style={[styles.footer, shadows.lg, { paddingBottom: insets.bottom + spacing.md }]}>
        <View>
          <Text style={styles.footerLabel}>Total</Text>
          <Text style={styles.footerTotal}>{formatCurrency(total)}</Text>
        </View>
        <PrimaryButton label="Review Agreement" onPress={onContinue} fullWidth={false} style={{ paddingHorizontal: spacing.xl }} />
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  carRow: { flexDirection: 'row', backgroundColor: colors.card, borderRadius: radii.lg, padding: spacing.sm, alignItems: 'center' },
  carImage: { width: 72, height: 72, borderRadius: radii.md, backgroundColor: colors.surface },
  carMeta: { ...typography.bodySm, color: colors.textSecondary, marginTop: 2 },
  sectionTitle: { ...typography.headingSm, marginTop: spacing.xl, marginBottom: spacing.sm },
  driverCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: radii.md,
    padding: spacing.sm,
    marginTop: spacing.sm,
  },
  driverAvatar: { width: 44, height: 44, borderRadius: 22, backgroundColor: colors.card },
  driverCaption: { ...typography.bodySm, color: colors.textSecondary, marginTop: 2 },
  dateRow: { flexDirection: 'row', marginTop: spacing.xs },
  dateCol: { flex: 1, marginRight: spacing.sm },
  dateLabel: { ...typography.titleMd, color: colors.textPrimary, marginBottom: 8 },
  stepper: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.surface,
    borderRadius: radii.md,
    paddingHorizontal: spacing.sm,
    height: 50,
  },
  stepperBtn: { width: 28, height: 28, borderRadius: 14, backgroundColor: colors.white, alignItems: 'center', justifyContent: 'center' },
  dateValue: { ...typography.bodySm, color: colors.textPrimary, fontWeight: '700' },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap' },
  summaryCard: { backgroundColor: colors.surface, borderRadius: radii.lg, padding: spacing.md },
  summaryRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: spacing.sm },
  summaryLabel: { ...typography.bodyMd, color: colors.textSecondary },
  summaryValue: { ...typography.titleMd, color: colors.textPrimary },
  divider: { height: 1, backgroundColor: colors.border, marginVertical: spacing.xs },
  totalLabel: { ...typography.titleLg, color: colors.textPrimary },
  totalValue: { ...typography.headingSm, color: colors.textPrimary },
  footer: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: colors.white,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    borderTopLeftRadius: radii.xl,
    borderTopRightRadius: radii.xl,
  },
  footerLabel: { ...typography.bodySm, color: colors.textSecondary },
  footerTotal: { ...typography.headingMd, color: colors.textPrimary },
});

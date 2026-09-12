import React, { useState } from 'react';
import { Alert, Image, Pressable, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import * as ImagePicker from 'expo-image-picker';
import { Ionicons } from '@expo/vector-icons';
import { RootStackParamList } from '../../navigation/types';
import { colors, radii, spacing, typography } from '../../theme';
import { ScreenHeader } from '../../components/ScreenHeader';
import { InputField } from '../../components/InputField';
import { Chip } from '../../components/Chip';
import { PrimaryButton } from '../../components/PrimaryButton';
import { brands } from '../../data/brands';
import { getModelsForBrand } from '../../data/carModels';
import { useAuth } from '../../context/AuthContext';
import { useCars } from '../../context/CarsContext';
import { generateId } from '../../utils/format';
import { detectCurrentLocationLabel, requestForegroundPermission } from '../../hooks/useDeviceLocation';
import { getCarQuantity } from '../../utils/inventory';
import { showToast } from '../../utils/toast';
import { Car, CarCategory, FuelType, RentalMode, Transmission } from '../../types';

type Props = NativeStackScreenProps<RootStackParamList, 'OwnerAddCar'>;

const CATEGORIES: CarCategory[] = [
  'Economy',
  'Hatchback',
  'Sedan',
  'SUV',
  'MUV',
  'Premium',
  'Luxury Sedan',
  'Sports Car',
  'Convertible',
  'Electric',
];
const TRANSMISSIONS: Transmission[] = ['Automatic', 'Manual'];
const FUEL_TYPES: FuelType[] = ['Petrol', 'Diesel', 'Electric', 'Hybrid', 'CNG'];
const RENTAL_MODES: { key: RentalMode; label: string }[] = [
  { key: 'self_drive', label: 'Self Drive' },
  { key: 'with_driver', label: 'With Driver' },
];
const DEFAULT_FEATURES = ['Bluetooth', 'USB Charging', 'Air Conditioning'];
const MAX_PHOTOS = 6;

export const OwnerAddCarScreen: React.FC<Props> = ({ navigation, route }) => {
  const { user } = useAuth();
  const { addOwnerCar, updateOwnerCar, getCarById } = useCars();

  // Edit mode: when opened with a carId (from "Edit Listing" on the owner
  // dashboard), prefill every field from the real, already-persisted car
  // instead of the blank defaults, and save via updateOwnerCar on submit
  // instead of creating a brand-new listing. Read once on mount — this
  // screen is always a fresh modal instance per open, never reused across
  // a different carId.
  const editingCarId = route.params?.carId;
  const [existingCar] = useState<Car | undefined>(() => (editingCarId ? getCarById(editingCarId) : undefined));
  const isEditMode = !!existingCar;

  const [images, setImages] = useState<string[]>(existingCar?.images ?? []);
  const [name, setName] = useState(existingCar?.name ?? '');
  const [brandId, setBrandId] = useState(existingCar?.brandId ?? brands[0].id);
  // Model isn't a separate persisted field on Car (name stays one composed
  // string, e.g. "Maruti Suzuki Swift") — this only drives the cascading
  // picker below and auto-fills Car Name when a model chip is tapped.
  const [model, setModel] = useState<string | undefined>(undefined);
  const [year, setYear] = useState(existingCar?.year ? String(existingCar.year) : '');
  const [isActive, setIsActive] = useState<boolean>(existingCar?.isActive ?? true);
  const [category, setCategory] = useState<CarCategory>(existingCar?.category ?? 'Sedan');
  const [pricePerDay, setPricePerDay] = useState(existingCar ? String(existingCar.pricePerDay) : '');
  const [driverPricePerDay, setDriverPricePerDay] = useState(existingCar ? String(existingCar.driverPricePerDay) : '');
  const [topSpeed, setTopSpeed] = useState(existingCar ? String(existingCar.topSpeed) : '');
  const [transmission, setTransmission] = useState<Transmission>(existingCar?.transmission ?? 'Automatic');
  const [fuelType, setFuelType] = useState<FuelType>(existingCar?.fuelType ?? 'Petrol');
  const [fuelEconomy, setFuelEconomy] = useState(existingCar?.fuelEconomy ?? '');
  const [seats, setSeats] = useState(existingCar ? String(existingCar.seats) : '4');
  // How many identical physical units this listing represents (e.g. 3
  // identical Swifts as one listing instead of 3 separate ones). Always a
  // real, already-set number on an existing car (getCarQuantity's ?? 1
  // fallback is only for listings that predate this field).
  const [quantity, setQuantity] = useState(existingCar ? String(getCarQuantity(existingCar)) : '1');
  // Pre-fill from the owner's own profile location where available -- never
  // a hardcoded city. They can still change it per-listing (e.g. a car kept
  // at a different pickup point) or detect the device's current location.
  const [location, setLocation] = useState(existingCar?.location ?? user?.location ?? '');
  const [detectingLocation, setDetectingLocation] = useState(false);
  const [description, setDescription] = useState(existingCar?.description ?? '');
  const [rentalModes, setRentalModes] = useState<RentalMode[]>(existingCar?.rentalModes ?? ['self_drive', 'with_driver']);
  const [error, setError] = useState<string | undefined>();
  const [saving, setSaving] = useState(false);

  const onUseCurrentLocationForCar = async () => {
    setDetectingLocation(true);
    try {
      const permission = await requestForegroundPermission();
      if (!permission.granted) {
        Alert.alert('Permission needed', 'Allow location access to auto-fill the pickup location.');
        return;
      }
      const result = await detectCurrentLocationLabel();
      if (result.ok) {
        setLocation(result.label);
      } else {
        Alert.alert('Could not detect location', 'Please enter the pickup location manually.');
      }
    } finally {
      setDetectingLocation(false);
    }
  };

  const toggleMode = (mode: RentalMode) => {
    setRentalModes((prev) => {
      if (prev.includes(mode)) {
        const next = prev.filter((m) => m !== mode);
        return next.length > 0 ? next : prev; // at least one mode required
      }
      return [...prev, mode];
    });
  };

  const addImages = (uris: string[]) => {
    setImages((prev) => [...prev, ...uris].slice(0, MAX_PHOTOS));
  };

  const onPickFromGallery = async () => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      Alert.alert('Permission needed', 'Allow photo library access to add pictures of your car.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsMultipleSelection: true,
      selectionLimit: MAX_PHOTOS - images.length,
      quality: 0.7,
    });
    if (!result.canceled) {
      addImages(result.assets.map((a) => a.uri));
    }
  };

  const onTakePhoto = async () => {
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) {
      Alert.alert('Permission needed', 'Allow camera access to take a picture of your car.');
      return;
    }
    const result = await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], quality: 0.7 });
    if (!result.canceled) {
      addImages(result.assets.map((a) => a.uri));
    }
  };

  const removeImage = (uri: string) => {
    setImages((prev) => prev.filter((i) => i !== uri));
  };

  const onSubmit = async () => {
    // M10 hardening: explicit re-entrancy guard (matches
    // RentalAgreementScreen.onSign) so a fast double-tap on Save can never
    // fire two concurrent add/update-car calls for one submission.
    if (!user || saving) return;
    if (images.length === 0) return setError('Add at least one photo of the car.');
    if (!name.trim()) return setError('Please enter a car name.');
    if (!location.trim()) return setError('Enter a pickup location for this car.');
    const price = Number(pricePerDay);
    if (!price || price <= 0) return setError('Enter a valid self-drive price per day.');

    setError(undefined);
    setSaving(true);

    const speed = Number(topSpeed) || 180;
    const seatCount = Number(seats) || 4;
    // Always a positive whole number of units -- an empty/invalid/zero
    // entry falls back to 1 rather than silently listing zero cars.
    const quantityCount = Math.max(1, Math.floor(Number(quantity)) || 1);
    const driverPrice = Number(driverPricePerDay) || Math.round(price * 1.4);
    const trimmedDescription =
      description.trim() || `A well-maintained ${category.toLowerCase()} ready for your next trip.`;
    const yearNum = year.trim() && !Number.isNaN(Number(year)) ? Number(year) : undefined;

    // MULTI-DEVICE MIGRATION -- addOwnerCar/updateOwnerCar now write to
    // Supabase (previously a synchronous local AsyncStorage write that could
    // never realistically fail), so a real network/RLS error can now throw
    // here. Without this try/catch, that throw was an unhandled promise
    // rejection: `saving` never got reset to false (Save stayed stuck
    // disabled), no error reached the owner, and Save/Publish silently never
    // happened -- now it surfaces through the same inline `error` banner
    // already used for validation above, and `saving` always resets via
    // `finally` regardless of outcome.
    try {
      if (isEditMode && existingCar) {
        // Preserve fields that aren't editable here (id, ownerId) and the
        // car's real, earned rating/reviewCount — editing a listing never
        // resets or fabricates those.
        await updateOwnerCar(existingCar.id, {
          name: name.trim(),
          brandId,
          year: yearNum,
          category,
          images,
          pricePerDay: price,
          driverPricePerDay: driverPrice,
          topSpeed: speed,
          transmission,
          fuelType,
          fuelEconomy: fuelEconomy.trim() || '15 km/l',
          seats: seatCount,
          location: location.trim(),
          rentalModes,
          description: trimmedDescription,
          isActive,
          quantity: quantityCount,
        });
      } else {
        const newCar: Car = {
          id: generateId('car'),
          name: name.trim(),
          brandId,
          year: yearNum,
          category,
          images,
          pricePerDay: price,
          driverPricePerDay: driverPrice,
          rating: 0,
          reviewCount: 0,
          topSpeed: speed,
          transmission,
          fuelType,
          fuelEconomy: fuelEconomy.trim() || '15 km/l',
          seats: seatCount,
          features: DEFAULT_FEATURES,
          location: location.trim(),
          ownerId: user.id,
          rentalModes,
          description: trimmedDescription,
          isActive,
          quantity: quantityCount,
          // Set once, here, at real creation time only -- never touched by
          // the edit branch above, so "Newest" sort reflects when a listing
          // was first published, not when it was last edited.
          createdAt: new Date().toISOString(),
        };
        await addOwnerCar(newCar);
      }

      // B3 -- Save/Publish previously navigated back in total silence; the
      // owner had no way to tell the save actually went through versus the
      // screen just closing. Reuses the same non-blocking showToast already
      // proven on the dashboard's Active/Inactive toggle instead of adding a
      // new feedback pattern.
      showToast(isEditMode ? 'Changes saved' : 'Listing published');
      navigation.goBack();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      console.log(`VELORA_OWNER_CAR_SAVE_FAILED: ${message}`);
      setError(isEditMode ? "We couldn't save your changes right now. Please try again." : "We couldn't publish this listing right now. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <ScreenHeader title={isEditMode ? 'Edit Car' : 'List a Car'} onBack={() => navigation.goBack()} />

      <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: spacing.xxl }} keyboardShouldPersistTaps="handled">
        <Text style={styles.label}>Car Photos</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: spacing.sm }}>
          {images.map((uri) => (
            <View key={uri} style={styles.photoThumbWrap}>
              <Image source={{ uri }} style={styles.photoThumb} />
              <Pressable style={styles.removePhotoBtn} onPress={() => removeImage(uri)} hitSlop={6} accessibilityLabel="Remove photo">
                <Ionicons name="close" size={14} color={colors.white} />
              </Pressable>
            </View>
          ))}
        </ScrollView>
        {images.length < MAX_PHOTOS ? (
          <View style={styles.photoButtonsRow}>
            <Pressable style={styles.photoButton} onPress={onPickFromGallery}>
              <Ionicons name="images-outline" size={20} color={colors.textPrimary} />
              <Text style={styles.photoButtonText}>Gallery</Text>
            </Pressable>
            <Pressable style={styles.photoButton} onPress={onTakePhoto}>
              <Ionicons name="camera-outline" size={20} color={colors.textPrimary} />
              <Text style={styles.photoButtonText}>Camera</Text>
            </Pressable>
          </View>
        ) : null}
        <Text style={styles.photoHint}>Add up to {MAX_PHOTOS} real photos of your car — renters see exactly what you upload.</Text>

        <InputField label="Car Name" placeholder="e.g. Hyundai Verna" value={name} onChangeText={setName} />

        <Text style={styles.label}>Brand</Text>
        <View style={styles.chipRow}>
          {brands.map((b) => (
            <Chip
              key={b.id}
              label={b.name}
              selected={brandId === b.id}
              onPress={() => {
                setBrandId(b.id);
                setModel(undefined);
              }}
            />
          ))}
        </View>

        {getModelsForBrand(brandId).length > 0 ? (
          <>
            <Text style={styles.label}>Model</Text>
            <View style={styles.chipRow}>
              {getModelsForBrand(brandId).map((m) => (
                <Chip
                  key={m}
                  label={m}
                  selected={model === m}
                  onPress={() => {
                    setModel(m);
                    const brandName = brands.find((b) => b.id === brandId)?.name ?? '';
                    setName(`${brandName} ${m}`.trim());
                  }}
                />
              ))}
            </View>
          </>
        ) : null}

        <InputField label="Year (optional)" placeholder="e.g. 2023" keyboardType="numeric" value={year} onChangeText={setYear} />

        <Text style={styles.label}>Category</Text>
        <View style={styles.chipRow}>
          {CATEGORIES.map((c) => (
            <Chip key={c} label={c} selected={category === c} onPress={() => setCategory(c)} />
          ))}
        </View>

        <Text style={styles.label}>Available Rental Modes</Text>
        <View style={styles.chipRow}>
          {RENTAL_MODES.map((m) => (
            <Chip key={m.key} label={m.label} selected={rentalModes.includes(m.key)} onPress={() => toggleMode(m.key)} />
          ))}
        </View>

        <InputField
          label="Self Drive Price per Day (₹)"
          placeholder="e.g. 2500"
          keyboardType="numeric"
          value={pricePerDay}
          onChangeText={setPricePerDay}
        />
        {rentalModes.includes('with_driver') ? (
          <InputField
            label="With Driver Price per Day (₹, optional)"
            placeholder="Leave blank to auto-calculate"
            keyboardType="numeric"
            value={driverPricePerDay}
            onChangeText={setDriverPricePerDay}
          />
        ) : null}

        <InputField label="Top Speed (km/h)" placeholder="e.g. 180" keyboardType="numeric" value={topSpeed} onChangeText={setTopSpeed} />

        <Text style={styles.label}>Transmission</Text>
        <View style={styles.chipRow}>
          {TRANSMISSIONS.map((t) => (
            <Chip key={t} label={t} selected={transmission === t} onPress={() => setTransmission(t)} />
          ))}
        </View>

        <Text style={styles.label}>Fuel Type</Text>
        <View style={styles.chipRow}>
          {FUEL_TYPES.map((f) => (
            <Chip key={f} label={f} selected={fuelType === f} onPress={() => setFuelType(f)} />
          ))}
        </View>

        <InputField label="Mileage (e.g. 18 km/l)" placeholder="18 km/l" value={fuelEconomy} onChangeText={setFuelEconomy} />
        <InputField label="Seats" placeholder="e.g. 5" keyboardType="numeric" value={seats} onChangeText={setSeats} />
        <InputField
          label="Number of Identical Cars"
          placeholder="e.g. 3"
          keyboardType="numeric"
          value={quantity}
          onChangeText={setQuantity}
        />
        <Text style={styles.quantityHint}>
          List multiple identical units (e.g. 3 Swifts) as one listing instead of creating separate listings for each.
        </Text>

        <View style={styles.locationLabelRow}>
          <Text style={styles.label}>Pickup Location</Text>
          <Pressable onPress={onUseCurrentLocationForCar} disabled={detectingLocation} hitSlop={6}>
            <Text style={styles.useCurrentLocationText}>
              {detectingLocation ? 'Detecting...' : 'Use current location'}
            </Text>
          </Pressable>
        </View>
        <InputField placeholder="e.g. Jaipur, Rajasthan" leftIcon="location-outline" value={location} onChangeText={setLocation} />
        <InputField
          label="Description (optional)"
          placeholder="Tell renters about this car..."
          value={description}
          onChangeText={setDescription}
          multiline
          style={{ height: 90, textAlignVertical: 'top' }}
        />

        <View style={styles.activeToggleRow}>
          <View style={{ flex: 1 }}>
            <Text style={styles.label}>Listing Status</Text>
            <Text style={styles.activeToggleCaption}>
              {isActive
                ? 'Visible to renters and bookable'
                : 'Hidden from renters — any existing bookings are unaffected'}
            </Text>
          </View>
          <Switch
            value={isActive}
            onValueChange={setIsActive}
            trackColor={{ true: colors.primary, false: colors.border }}
            thumbColor={colors.white}
          />
        </View>

        {error ? <Text style={styles.error}>{error}</Text> : null}

        <PrimaryButton
          label={isEditMode ? 'Save Changes' : 'Publish Listing'}
          onPress={onSubmit}
          loading={saving}
          style={{ marginTop: spacing.md }}
        />
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  label: { ...typography.titleMd, color: colors.textPrimary, marginBottom: 8 },
  locationLabelRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 },
  useCurrentLocationText: { ...typography.bodySm, color: colors.primaryDark, fontWeight: '600' },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', marginBottom: spacing.md },
  error: { ...typography.bodySm, color: colors.danger, marginBottom: spacing.sm },
  photoThumbWrap: { marginRight: spacing.sm },
  photoThumb: { width: 84, height: 84, borderRadius: radii.md, backgroundColor: colors.surface },
  removePhotoBtn: {
    position: 'absolute',
    top: -6,
    right: -6,
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: colors.danger,
    alignItems: 'center',
    justifyContent: 'center',
  },
  photoButtonsRow: { flexDirection: 'row', marginBottom: 8 },
  photoButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    flex: 1,
    height: 48,
    borderRadius: radii.md,
    borderWidth: 1.5,
    borderColor: colors.border,
    marginRight: spacing.sm,
  },
  photoButtonText: { ...typography.titleMd, color: colors.textPrimary, marginLeft: 8 },
  photoHint: { ...typography.caption, color: colors.textTertiary, marginBottom: spacing.md },
  quantityHint: { ...typography.caption, color: colors.textTertiary, marginTop: -4, marginBottom: spacing.md },
  activeToggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.surface,
    borderRadius: radii.md,
    padding: spacing.md,
    marginTop: spacing.xs,
    marginBottom: spacing.md,
  },
  activeToggleCaption: { ...typography.bodySm, color: colors.textSecondary, marginTop: 2, lineHeight: 18 },
});

import React, { useEffect, useState } from 'react';
import { Alert, Image, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import * as ImagePicker from 'expo-image-picker';
import { Ionicons } from '@expo/vector-icons';
import { RootStackParamList } from '../../navigation/types';
import { colors, radii, spacing, typography } from '../../theme';
import { ScreenHeader } from '../../components/ScreenHeader';
import { InputField } from '../../components/InputField';
import { Chip } from '../../components/Chip';
import { PrimaryButton } from '../../components/PrimaryButton';
import { useAuth } from '../../context/AuthContext';
import { useCars } from '../../context/CarsContext';
import { useCatalog } from '../../context/CatalogContext';
import { generateId } from '../../utils/format';
import { detectCurrentCoordinates, detectCurrentLocationLabel, requestForegroundPermission } from '../../hooks/useDeviceLocation';
import { getCarQuantity } from '../../utils/inventory';
import { showToast } from '../../utils/toast';
import { isRetryableMessage, isStaleLocalFileMessage, PickedImage, readUriAsBlobWithRetry, uploadCarImages } from '../../utils/uploadImage';
import { DURATION_PRESETS_HOURS, formatDurationHours } from '../../utils/duration';
import { Car, CarCategory, FuelType, MileagePolicy, RentalMode, Transmission } from '../../types';

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
  const { brands, getModelsForBrand, addManualModel, addManualBrand } = useCatalog();

  // Edit mode: when opened with a carId (from "Edit Listing" on the owner
  // dashboard), prefill every field from the real, already-persisted car
  // instead of the blank defaults, and save via updateOwnerCar on submit
  // instead of creating a brand-new listing. Read once on mount — this
  // screen is always a fresh modal instance per open, never reused across
  // a different carId.
  const editingCarId = route.params?.carId;
  const [existingCar] = useState<Car | undefined>(() => (editingCarId ? getCarById(editingCarId) : undefined));
  const isEditMode = !!existingCar;

  const [images, setImages] = useState<PickedImage[]>(existingCar?.images.map((uri) => ({ uri })) ?? []);
  const [name, setName] = useState(existingCar?.name ?? '');
  // PHASE A (Catalog) -- brands now load asynchronously from Supabase (see
  // CatalogContext), so they may not have arrived on this very first render
  // yet. Starts blank rather than crashing on brands[0] when the list is
  // still empty; the effect below picks a sensible default the moment
  // brands actually load, but only for a brand-new listing -- an
  // in-progress edit's brandId is never overwritten out from under it.
  const [brandId, setBrandId] = useState(existingCar?.brandId ?? '');
  useEffect(() => {
    if (!isEditMode && !brandId && brands.length > 0) {
      setBrandId(brands[0].id);
    }
  }, [brands, isEditMode, brandId]);
  // PHASE A (Catalog) -- modelId is the new persisted link to a canonical
  // (or the owner's own pending custom) public.car_models row -- see
  // Car.modelId in types/index.ts. `model` stays a plain display string
  // only (used to compose Car Name and to highlight the selected chip);
  // it is never itself persisted.
  const [modelId, setModelId] = useState<string | undefined>(existingCar?.modelId);
  // "Can't find your model? Add manually" -- collects only the model name
  // here. Year/fuel/transmission/seats aren't duplicated in a second
  // mini-form: the manual model is created from whatever the owner has
  // already entered for THIS listing further down the form, at Save time
  // (see onSubmit) -- exactly the fields the product spec requires for a
  // manual catalog submission, with nothing asked twice.
  const [showManualModelInput, setShowManualModelInput] = useState(false);
  const [manualModelName, setManualModelName] = useState('');
  // "Can't find your brand? Add manually" -- same escape hatch one level up
  // (see CatalogContext.addManualBrand / 0024_manual_brand_entry.sql), for
  // when the curated brand catalog is missing this car's actual brand
  // entirely (or is empty on an environment where 0001's seed hasn't run
  // yet) -- without this there was previously NO way to list a car outside
  // the fixed brand list at all.
  const [showManualBrandInput, setShowManualBrandInput] = useState(false);
  const [manualBrandName, setManualBrandName] = useState('');
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
  // NEAR ME -- captured only via "Use current location" below, never
  // derivable from the free-text `location` string. Cleared whenever the
  // owner types the location manually (see onChangeText on the location
  // InputField) so a listing's coordinates can never silently drift out of
  // sync with a location the owner has since edited by hand.
  const [coordinates, setCoordinates] = useState<{ latitude: number; longitude: number } | undefined>(
    existingCar?.latitude != null && existingCar?.longitude != null
      ? { latitude: existingCar.latitude, longitude: existingCar.longitude }
      : undefined,
  );
  const [description, setDescription] = useState(existingCar?.description ?? '');
  const [rentalModes, setRentalModes] = useState<RentalMode[]>(existingCar?.rentalModes ?? ['self_drive', 'with_driver']);
  // PHASE 2 -- which duration presets this listing offers. Defaults to all
  // four for a brand-new listing and for any existing car that predates
  // this field, matching what every car already offered in Phase 1.
  const [enabledPresets, setEnabledPresets] = useState<number[]>(
    existingCar?.enabledDurationPresets && existingCar.enabledDurationPresets.length > 0
      ? existingCar.enabledDurationPresets
      : [...DURATION_PRESETS_HOURS],
  );
  // PHASE 2 -- owner duration-based pricing, off by default (every car keeps
  // pricing via the flat Self Drive Price per Day formula unless the owner
  // explicitly turns this on).
  const [useDurationPricing, setUseDurationPricing] = useState<boolean>(!!existingCar?.durationPricing);
  const [hourlyRate, setHourlyRate] = useState(
    existingCar?.durationPricing?.hourlyRate ? String(existingCar.durationPricing.hourlyRate) : '',
  );
  const [price6h, setPrice6h] = useState(existingCar?.durationPricing?.price6h ? String(existingCar.durationPricing.price6h) : '');
  const [price12h, setPrice12h] = useState(existingCar?.durationPricing?.price12h ? String(existingCar.durationPricing.price12h) : '');
  const [price24h, setPrice24h] = useState(existingCar?.durationPricing?.price24h ? String(existingCar.durationPricing.price24h) : '');
  const [price48h, setPrice48h] = useState(existingCar?.durationPricing?.price48h ? String(existingCar.durationPricing.price48h) : '');
  // PHASE 2 -- mileage / KM policy. Defaults to 'limited' at the existing
  // 300 km/day the app already quoted in the Rental Agreement before this
  // field existed, so a brand-new listing's agreement text matches a
  // pre-Phase-2 listing's unless the owner actually changes it.
  const [mileagePolicy, setMileagePolicy] = useState<MileagePolicy>(existingCar?.mileagePolicy ?? 'limited');
  const [kmLimitPerDay, setKmLimitPerDay] = useState(existingCar?.kmLimitPerDay ? String(existingCar.kmLimitPerDay) : '300');
  const [extraKmCharge, setExtraKmCharge] = useState(existingCar?.extraKmCharge ? String(existingCar.extraKmCharge) : '');
  // PHASE 3 -- informational-only turnaround time between bookings (see
  // Car.bufferHours in types/index.ts for why this isn't enforced).
  const [bufferHours, setBufferHours] = useState(existingCar?.bufferHours ? String(existingCar.bufferHours) : '');
  // PHASE 6 -- Instant Book vs Request to Book. Defaults to false (Request
  // to Book) for a brand-new listing, matching every listing that existed
  // before this feature -- see Car.instantBook in types/index.ts.
  const [instantBook, setInstantBook] = useState(existingCar?.instantBook === true);
  const [error, setError] = useState<string | undefined>();
  const [saving, setSaving] = useState(false);

  // Only canonical (reviewed) models plus this owner's OWN pending custom
  // submissions -- car_models RLS already scopes the fetch this way (see
  // CatalogContext), so no extra filtering is needed here.
  const catalogModels = getModelsForBrand(brandId);

  const onUseCurrentLocationForCar = async () => {
    setDetectingLocation(true);
    try {
      const permission = await requestForegroundPermission();
      if (!permission.granted) {
        Alert.alert('Permission needed', 'Allow location access to auto-fill the pickup location.');
        return;
      }
      const [labelResult, coordsResult] = await Promise.all([detectCurrentLocationLabel(), detectCurrentCoordinates()]);
      if (labelResult.ok) {
        setLocation(labelResult.label);
        // Coordinates are best-effort on top of the label -- a reverse-geocode
        // succeeding while the raw GPS fix separately fails is unlikely but
        // not impossible, and the pickup-location text is still useful on its
        // own even without a "Near Me" fix for this listing.
        setCoordinates(coordsResult.ok ? { latitude: coordsResult.latitude, longitude: coordsResult.longitude } : undefined);
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

  const toggleDurationPreset = (hours: number) => {
    setEnabledPresets((prev) => {
      if (prev.includes(hours)) {
        const next = prev.filter((h) => h !== hours);
        return next.length > 0 ? next : prev; // at least one duration required
      }
      return [...prev, hours].sort((a, b) => a - b);
    });
  };

  const addImages = (items: PickedImage[]) => {
    setImages((prev) => [...prev, ...items].slice(0, MAX_PHOTOS));
  };

  // PHASE 1 IMAGE PIPELINE FIX -- reads each newly-picked photo's actual
  // bytes right now, at pick time, instead of waiting until Save to read it
  // (see the matching comment on uploadImage.ts's `preFetchedBlob`). This is
  // the real fix for the confirmed root cause (device-log verified):
  // Android's system Photo Picker only guarantees its content:// URI stays
  // readable for a short window around the pick, and this form can easily
  // stay open for minutes while an owner fills in the rest of a new
  // listing -- by the time they tap Save, that grant may already be gone,
  // which surfaced as an HTTP 404 with no real network problem at all.
  // Reading the bytes into memory immediately, while the grant is certainly
  // still fresh, means Save never has to re-read the original URI. Reuses
  // readUriAsBlobWithRetry (already timeout/retry/session/empty-blob
  // hardened) instead of a second, duplicate read path. Each photo in a
  // multi-select pick is read independently via Promise.allSettled, so one
  // bad photo can never block the others from being added.
  const prefetchPickedPhotos = async (uris: string[]): Promise<PickedImage[]> => {
    const results = await Promise.allSettled(uris.map((uri) => readUriAsBlobWithRetry(uri, 'photo')));
    const picked: PickedImage[] = [];
    let failedCount = 0;
    results.forEach((result, index) => {
      if (result.status === 'fulfilled') {
        picked.push({ uri: uris[index], blob: result.value });
      } else {
        failedCount += 1;
        const message = result.reason instanceof Error ? result.reason.message : String(result.reason);
        console.log(`VELORA_PHOTO_PREFETCH_FAILED: ${message}`);
      }
    });
    if (failedCount > 0) {
      Alert.alert(
        failedCount === uris.length ? "Couldn't load photo" : 'Some photos skipped',
        failedCount === uris.length
          ? 'Selected photo is no longer available. Please select the photo again.'
          : `${failedCount} of ${uris.length} photos couldn't be loaded and were skipped. Please try selecting them again.`,
      );
    }
    return picked;
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
      const picked = await prefetchPickedPhotos(result.assets.map((a) => a.uri));
      if (picked.length > 0) addImages(picked);
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
      const picked = await prefetchPickedPhotos(result.assets.map((a) => a.uri));
      if (picked.length > 0) addImages(picked);
    }
  };

  const removeImage = (uri: string) => {
    setImages((prev) => prev.filter((img) => img.uri !== uri));
  };

  const onSubmit = async () => {
    // M10 hardening: explicit re-entrancy guard (matches
    // RentalAgreementScreen.onSign) so a fast double-tap on Save can never
    // fire two concurrent add/update-car calls for one submission.
    if (!user || saving) return;
    if (images.length === 0) return setError('Add at least one photo of the car.');
    if (!name.trim()) return setError('Please enter a car name.');
    if (!brandId && !(showManualBrandInput && manualBrandName.trim())) return setError('Please select or enter a brand.');
    if (!location.trim()) return setError('Enter a pickup location for this car.');
    const price = Number(pricePerDay);
    if (!price || price <= 0) return setError('Enter a valid self-drive price per day.');

    // PHASE A (Catalog) -- manufacturing year is now mandatory with a
    // sensible server-checked range (see the car_listings_year_range
    // constraint in supabase/migrations/0001_catalog_foundation.sql), not a
    // free-form optional string. This validates the same range client-side
    // purely for a fast, specific error message -- the database constraint
    // is the actual authority, exactly like every other "never trust the
    // client" rule elsewhere in this app.
    const currentYear = new Date().getFullYear();
    const yearNum = Number(year);
    if (!year.trim() || !Number.isInteger(yearNum) || yearNum < 1990 || yearNum > currentYear + 1) {
      return setError(`Enter a valid manufacturing year between 1990 and ${currentYear + 1}.`);
    }

    // PHASE 2 -- Duration-Based Pricing. hourlyRate is required the moment
    // this toggle is on since it's the fallback for Custom AND for any
    // preset the owner leaves blank below -- everything else stays optional.
    let durationPricingFinal: Car['durationPricing'];
    if (useDurationPricing) {
      const hourly = Number(hourlyRate);
      if (!hourly || hourly <= 0) return setError('Enter a valid hourly rate for duration pricing.');
      durationPricingFinal = {
        hourlyRate: hourly,
        price6h: Number(price6h) > 0 ? Number(price6h) : undefined,
        price12h: Number(price12h) > 0 ? Number(price12h) : undefined,
        price24h: Number(price24h) > 0 ? Number(price24h) : undefined,
        price48h: Number(price48h) > 0 ? Number(price48h) : undefined,
      };
    }

    // PHASE 2 -- Mileage / KM Policy. A limit is required for 'limited';
    // extraKmCharge stays optional (blank means no extra charge is levied
    // for now -- see the migration's own note on why usage isn't metered).
    let kmLimitFinal: number | undefined;
    let extraKmFinal: number | undefined;
    if (mileagePolicy === 'limited') {
      const limit = Number(kmLimitPerDay);
      if (!limit || limit <= 0) return setError('Enter a valid daily KM limit.');
      kmLimitFinal = limit;
      extraKmFinal = Number(extraKmCharge) > 0 ? Number(extraKmCharge) : undefined;
    }

    // PHASE 3 -- Buffer Time. Optional; invalid/blank just means "not set".
    const bufferHoursFinal = Number(bufferHours) > 0 ? Number(bufferHours) : undefined;

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
      // "Can't find your brand? Add manually" resolves FIRST -- a manual
      // model (right below) needs a real brand_id to reference, and this is
      // the only way to get one when the owner never picked a chip at all
      // (see 0024_manual_brand_entry.sql). Creates exactly one new brands
      // row (is_custom: true, is_active: false -- pending admin review);
      // brands RLS is what stops this from ever creating/editing a
      // canonical, publicly-visible entry.
      let finalBrandId = brandId;
      if (showManualBrandInput && manualBrandName.trim()) {
        const manualBrandResult = await addManualBrand(manualBrandName.trim());
        if (!manualBrandResult.ok) {
          setError(manualBrandResult.error);
          setSaving(false);
          return;
        }
        finalBrandId = manualBrandResult.brandId;
      }

      // PHASE A (Catalog) -- "Can't find your model? Add manually" resolves
      // here, at Save time, using the year/fuel/transmission/seats the
      // owner has already filled in above rather than asking for them a
      // second time. This creates exactly one new car_models row (is_custom:
      // true, is_active: false -- pending admin review) and the listing
      // below links to it immediately; car_models RLS is what stops this
      // from ever creating/editing a canonical, publicly-visible entry.
      let finalModelId = modelId;
      if (showManualModelInput && manualModelName.trim()) {
        const manualResult = await addManualModel({
          brandId: finalBrandId,
          name: manualModelName.trim(),
          year: yearNum,
          fuelType,
          transmission,
          seats: seatCount,
        });
        if (!manualResult.ok) {
          setError(manualResult.error);
          setSaving(false);
          return;
        }
        finalModelId = manualResult.modelId;
      }

      // Upload any newly-picked local photos (file://.../content://...) to
      // real Supabase Storage first -- an already-uploaded https URL (kept
      // from editing an existing listing without touching its photos) is
      // passed through untouched by uploadCarImages. Without this, the
      // listing would save the on-device-only URI directly and every other
      // device (or this one, after a cache clear) would show no photo at
      // all -- see uploadImage.ts's top comment.
      const uploadedImages = await uploadCarImages(images, user.id);

      if (isEditMode && existingCar) {
        // Preserve fields that aren't editable here (id, ownerId) and the
        // car's real, earned rating/reviewCount — editing a listing never
        // resets or fabricates those.
        await updateOwnerCar(existingCar.id, {
          name: name.trim(),
          brandId: finalBrandId,
          modelId: finalModelId,
          year: yearNum,
          category,
          images: uploadedImages,
          pricePerDay: price,
          driverPricePerDay: driverPrice,
          topSpeed: speed,
          transmission,
          fuelType,
          fuelEconomy: fuelEconomy.trim() || '15 km/l',
          seats: seatCount,
          location: location.trim(),
          latitude: coordinates?.latitude,
          longitude: coordinates?.longitude,
          rentalModes,
          description: trimmedDescription,
          isActive,
          quantity: quantityCount,
          enabledDurationPresets: enabledPresets,
          durationPricing: durationPricingFinal,
          mileagePolicy,
          kmLimitPerDay: kmLimitFinal,
          extraKmCharge: extraKmFinal,
          bufferHours: bufferHoursFinal,
          instantBook,
        });
      } else {
        const newCar: Car = {
          id: generateId('car'),
          name: name.trim(),
          brandId: finalBrandId,
          modelId: finalModelId,
          year: yearNum,
          category,
          images: uploadedImages,
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
          latitude: coordinates?.latitude,
          longitude: coordinates?.longitude,
          ownerId: user.id,
          rentalModes,
          description: trimmedDescription,
          isActive,
          quantity: quantityCount,
          enabledDurationPresets: enabledPresets,
          durationPricing: durationPricingFinal,
          mileagePolicy,
          kmLimitPerDay: kmLimitFinal,
          extraKmCharge: extraKmFinal,
          bufferHours: bufferHoursFinal,
          instantBook,
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
      // PRODUCTION-AUDIT FIX -- was always the same generic sentence
      // regardless of cause, which is fine as a default but actively
      // unhelpful for the two cases that are both common AND something the
      // owner can actually act on: no internet (retry once connected) and a
      // photo upload that failed mid-save (the exact failure a background/
      // foreground trip to Camera or Gallery can trigger). Falls back to the
      // original generic copy for everything else, matching prior behavior.
      // PRODUCTION-AUDIT FIX (image-upload root cause pass) -- uploadImage.ts
      // now retries transient failures internally, so a message that still
      // reaches here survived 3 attempts and is worth distinguishing further:
      // an expired session needs a re-login (retrying the same save will
      // just fail again), which is a different, more useful instruction than
      // the generic connection message.
      // CONFIRMED ROOT CAUSE (device-log verified) -- a picked Android photo
      // URI can 404 when the OS has invalidated the picker's read grant
      // (most commonly the Android 13+ system Photo Picker's short-lived
      // grant). This is NOT a network/connection problem, so it gets its own
      // precise, actionable message instead of falling into the generic
      // "check your connection" bucket, which was actively misleading for
      // this exact case -- see isStaleLocalFileMessage in uploadImage.ts.
      const isStalePhoto = isStaleLocalFileMessage(message);
      const isSessionError = /session has expired/i.test(message);
      const isNetworkError = isRetryableMessage(message) || /network request failed|network error/i.test(message);
      const isImageUploadError = /couldn't upload image|photo \d+ of \d+ failed/i.test(message);
      setError(
        isStalePhoto
          ? 'Selected photo is no longer available. Please remove it and select it again.'
          : isSessionError
            ? 'Your session expired while uploading. Please log in again and retry.'
            : isNetworkError
              ? "You're offline. Check your connection and try again."
              : isImageUploadError
                // BUG FIX -- this used to always say "check your connection"
                // for ANY upload failure, but uploadImage.ts wraps every
                // failure type in this same "Couldn't upload image: ..."
                // prefix -- including an RLS/permission rejection or a
                // missing storage bucket, neither of which is a connection
                // problem. `message` already IS the real underlying reason
                // (isNetworkError above already caught the genuinely
                // network-ish ones), so show it instead of guessing wrong.
                ? message
                : isEditMode
                  ? "We couldn't save your changes right now. Please try again."
                  : "We couldn't publish this listing right now. Please try again.",
      );
    } finally {
      setSaving(false);
    }
  };

  // SUBSCRIPTION GATE -- "Subscription Active -> Car Listing Active" from
  // the product spec. Only gates creating a BRAND NEW listing -- an owner
  // whose subscription has since lapsed can still open an EXISTING car here
  // to edit it (e.g. to mark it inactive, or right after renewing), so this
  // is deliberately `!isEditMode` only, never blocking the edit path.
  if (!isEditMode && !user?.subscriptionActive) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.background }}>
        <ScreenHeader title="List a Car" onBack={() => navigation.goBack()} />
        <View style={styles.subscribeGate}>
          <Ionicons name="lock-closed" size={32} color={colors.primaryDark} />
          <Text style={styles.subscribeGateTitle}>Subscribe to list your car</Text>
          <Text style={styles.subscribeGateBody}>
            An active VELORA owner subscription is required to list a car — it also gets you a public store page on the
            VELORA website.
          </Text>
          <PrimaryButton label="View Subscription" onPress={() => navigation.navigate('Subscription')} style={{ marginTop: spacing.lg }} />
        </View>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: colors.background }}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <ScreenHeader title={isEditMode ? 'Edit Car' : 'List a Car'} onBack={() => navigation.goBack()} />

      <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: spacing.xxl }} keyboardShouldPersistTaps="handled">
        <Text style={styles.label}>Car Photos</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: spacing.sm }}>
          {images.map((img) => (
            <View key={img.uri} style={styles.photoThumbWrap}>
              <Image source={{ uri: img.uri }} style={styles.photoThumb} />
              <Pressable style={styles.removePhotoBtn} onPress={() => removeImage(img.uri)} hitSlop={6} accessibilityLabel="Remove photo">
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
        {!showManualBrandInput ? (
          <>
            <View style={styles.chipRow}>
              {brands.map((b) => (
                <Chip
                  key={b.id}
                  label={b.isCustom ? `${b.name} (pending review)` : b.name}
                  selected={brandId === b.id}
                  onPress={() => {
                    setBrandId(b.id);
                    setModelId(undefined);
                    setShowManualModelInput(false);
                    setManualModelName('');
                  }}
                />
              ))}
            </View>
            <Pressable
              onPress={() => {
                setShowManualBrandInput(true);
                setBrandId('');
                setModelId(undefined);
              }}
              hitSlop={6}
              style={{ marginBottom: spacing.md }}
            >
              <Text style={styles.addModelLink}>Can&apos;t find your brand? Add manually</Text>
            </Pressable>
          </>
        ) : (
          <View style={{ marginBottom: spacing.xs }}>
            <InputField placeholder="e.g. Force Motors" value={manualBrandName} onChangeText={setManualBrandName} />
            <Text style={styles.hint}>
              This brand isn&apos;t in VELORA&apos;s catalog yet — it&apos;ll be reviewed by our team, and you can use it for
              this listing right away.
            </Text>
            {brands.length > 0 ? (
              <Pressable
                onPress={() => {
                  setShowManualBrandInput(false);
                  setManualBrandName('');
                }}
                hitSlop={6}
                style={{ marginTop: 4, marginBottom: spacing.md }}
              >
                <Text style={styles.addModelLink}>Choose from the list instead</Text>
              </Pressable>
            ) : null}
          </View>
        )}

        <Text style={styles.label}>Model</Text>
        {catalogModels.length > 0 && !showManualModelInput ? (
          <View style={styles.chipRow}>
            {catalogModels.map((m) => (
              <Chip
                key={m.id}
                label={m.isCustom ? `${m.name} (pending review)` : m.name}
                selected={modelId === m.id}
                onPress={() => {
                  setModelId(m.id);
                  const brandName = brands.find((b) => b.id === brandId)?.name ?? '';
                  setName(`${brandName} ${m.name}`.trim());
                  // Catalog defaults, all still freely editable further down
                  // this form -- see CatalogModel's own comment in types.
                  if (m.bodyType) setCategory(m.bodyType);
                  if (m.fuelType) setFuelType(m.fuelType);
                  if (m.transmission) setTransmission(m.transmission);
                  if (m.seats) setSeats(String(m.seats));
                }}
              />
            ))}
          </View>
        ) : null}

        {!showManualModelInput ? (
          <Pressable
            onPress={() => {
              setShowManualModelInput(true);
              setModelId(undefined);
            }}
            hitSlop={6}
            style={{ marginBottom: spacing.md }}
          >
            <Text style={styles.addModelLink}>Can&apos;t find your model? Add manually</Text>
          </Pressable>
        ) : (
          <View style={{ marginBottom: spacing.xs }}>
            <InputField
              placeholder="e.g. Swift ZXI"
              value={manualModelName}
              onChangeText={(text) => {
                setManualModelName(text);
                const brandName = brands.find((b) => b.id === brandId)?.name ?? '';
                setName(`${brandName} ${text}`.trim());
              }}
            />
            <Text style={styles.hint}>
              This model isn&apos;t in VELORA&apos;s catalog yet — it&apos;ll be added using the year, fuel, transmission and
              seats you enter below, and reviewed by our team. You can use it for this listing right away.
            </Text>
            <Pressable
              onPress={() => {
                setShowManualModelInput(false);
                setManualModelName('');
              }}
              hitSlop={6}
              style={{ marginTop: 4, marginBottom: spacing.md }}
            >
              <Text style={styles.addModelLink}>Choose from the list instead</Text>
            </Pressable>
          </View>
        )}

        <InputField
          label="Manufacturing Year"
          placeholder={`e.g. ${new Date().getFullYear()}`}
          keyboardType="numeric"
          value={year}
          onChangeText={setYear}
        />

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

        <Text style={styles.label}>Duration Options Offered</Text>
        <View style={styles.chipRow}>
          {DURATION_PRESETS_HOURS.map((h) => (
            <Chip key={h} label={formatDurationHours(h)} selected={enabledPresets.includes(h)} onPress={() => toggleDurationPreset(h)} />
          ))}
        </View>
        <Text style={styles.hint}>
          Renters can only choose from the durations selected here (plus Custom, which is always available).
        </Text>

        <View style={styles.activeToggleRow}>
          <View style={{ flex: 1 }}>
            <Text style={styles.label}>Duration-Based Pricing</Text>
            <Text style={styles.activeToggleCaption}>
              {useDurationPricing
                ? 'Set a specific price for each duration below'
                : 'Off — price is calculated from Self Drive Price per Day'}
            </Text>
          </View>
          <Switch
            value={useDurationPricing}
            onValueChange={setUseDurationPricing}
            trackColor={{ true: colors.primary, false: colors.border }}
            thumbColor={colors.white}
          />
        </View>
        {useDurationPricing ? (
          <>
            <InputField
              label="Hourly Rate (₹, for Custom duration)"
              placeholder="e.g. 120"
              keyboardType="numeric"
              value={hourlyRate}
              onChangeText={setHourlyRate}
            />
            <InputField label="Price for 6 Hours (₹, optional)" placeholder="e.g. 800" keyboardType="numeric" value={price6h} onChangeText={setPrice6h} />
            <InputField label="Price for 12 Hours (₹, optional)" placeholder="e.g. 1500" keyboardType="numeric" value={price12h} onChangeText={setPrice12h} />
            <InputField label="Price for 24 Hours (₹, optional)" placeholder="e.g. 2500" keyboardType="numeric" value={price24h} onChangeText={setPrice24h} />
            <InputField label="Price for 48 Hours (₹, optional)" placeholder="e.g. 4500" keyboardType="numeric" value={price48h} onChangeText={setPrice48h} />
            <Text style={styles.hint}>Leave a duration blank to price it automatically from the Hourly Rate instead.</Text>
          </>
        ) : null}

        <Text style={styles.label}>Mileage Policy</Text>
        <View style={styles.chipRow}>
          <Chip label="Limited" selected={mileagePolicy === 'limited'} onPress={() => setMileagePolicy('limited')} />
          <Chip label="Unlimited" selected={mileagePolicy === 'unlimited'} onPress={() => setMileagePolicy('unlimited')} />
        </View>
        {mileagePolicy === 'limited' ? (
          <>
            <InputField label="KM Limit per Day" placeholder="e.g. 300" keyboardType="numeric" value={kmLimitPerDay} onChangeText={setKmLimitPerDay} />
            <InputField
              label="Extra KM Charge (₹/km, optional)"
              placeholder="e.g. 10"
              keyboardType="numeric"
              value={extraKmCharge}
              onChangeText={setExtraKmCharge}
            />
          </>
        ) : (
          <Text style={styles.hint}>Renters can drive unlimited kilometers with no extra mileage charges.</Text>
        )}

        <InputField
          label="Buffer Time Between Bookings (hours, optional)"
          placeholder="e.g. 2"
          keyboardType="numeric"
          value={bufferHours}
          onChangeText={setBufferHours}
        />
        <Text style={styles.hint}>
          For your own reference (cleaning/prep time) — shown on your dashboard and car calendar, not enforced
          automatically.
        </Text>

        <View style={styles.activeToggleRow}>
          <View style={{ flex: 1 }}>
            <Text style={styles.label}>Instant Book</Text>
            <Text style={styles.activeToggleCaption}>
              {instantBook
                ? 'On — a new booking is confirmed immediately, no approval needed'
                : 'Off — Request to Book: you confirm or decline each booking'}
            </Text>
          </View>
          <Switch
            value={instantBook}
            onValueChange={setInstantBook}
            trackColor={{ true: colors.primary, false: colors.border }}
            thumbColor={colors.white}
          />
        </View>

        <View style={styles.locationLabelRow}>
          <Text style={styles.label}>Pickup Location</Text>
          <Pressable onPress={onUseCurrentLocationForCar} disabled={detectingLocation} hitSlop={6}>
            <Text style={styles.useCurrentLocationText}>
              {detectingLocation ? 'Detecting...' : 'Use current location'}
            </Text>
          </Pressable>
        </View>
        <InputField
          placeholder="e.g. Jaipur, Rajasthan"
          leftIcon="location-outline"
          value={location}
          onChangeText={(text) => {
            setLocation(text);
            setCoordinates(undefined);
          }}
        />
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
    </KeyboardAvoidingView>
  );
};

const styles = StyleSheet.create({
  subscribeGate: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.xl },
  subscribeGateTitle: { ...typography.headingSm, color: colors.textPrimary, marginTop: spacing.md, textAlign: 'center' },
  subscribeGateBody: { ...typography.bodySm, color: colors.textSecondary, marginTop: spacing.sm, textAlign: 'center', lineHeight: 19 },
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
  addModelLink: { ...typography.bodySm, color: colors.primaryDark, fontWeight: '600', marginBottom: spacing.md },
  hint: { ...typography.caption, color: colors.textTertiary, marginTop: 4, lineHeight: 16 },
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

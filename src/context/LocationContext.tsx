import React, { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { storage } from '../utils/storage';
import { useAuth } from './AuthContext';
import { detectCurrentLocationLabel, requestForegroundPermission } from '../hooks/useDeviceLocation';

// Tracks which accounts have already been shown the real OS location
// permission dialog once, so a person who denies it is never nagged with it
// again on every app open -- manual location stays available instead.
const PROMPTED_KEY = 'velora.locationPrompted.v1';

export type LocationStatus =
  | 'idle' // nothing happening yet
  | 'checking' // deciding whether to show the permission dialog
  | 'detecting' // GPS + reverse-geocode in progress
  | 'set' // user.location is populated (either source)
  | 'denied' // permission was denied -- manual entry is the way forward
  | 'unavailable'; // permission granted but GPS/geocoding failed

interface LocationContextValue {
  status: LocationStatus;
  errorReason?: 'permission-denied' | 'unavailable';
  /**
   * Runs once per account, the moment a fresh (location-less) account first
   * reaches the main app. Shows the real, native permission dialog -- never
   * silent, never assumes a default city/country. If denied, the app is not
   * blocked: manual location entry is surfaced instead, and this account is
   * never auto-prompted again.
   */
  ensureLocationOnLaunch: () => Promise<void>;
  /** Explicit user action (a button tap) -- always safe to (re)request here. */
  detectCurrentLocation: () => Promise<void>;
  setManualLocation: (label: string) => Promise<void>;
}

const LocationContext = createContext<LocationContextValue | undefined>(undefined);

const readPrompted = async (): Promise<Record<string, boolean>> => {
  const raw = await storage.getItem(PROMPTED_KEY);
  return raw ? (JSON.parse(raw) as Record<string, boolean>) : {};
};

const markPrompted = async (userId: string) => {
  const prompted = await readPrompted();
  prompted[userId] = true;
  await storage.setItem(PROMPTED_KEY, JSON.stringify(prompted));
};

export const LocationProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user, updateProfile } = useAuth();
  const [status, setStatus] = useState<LocationStatus>('idle');
  const [errorReason, setErrorReason] = useState<'permission-denied' | 'unavailable' | undefined>();
  // Guards against re-running the first-launch check more than once for the
  // same account within a single app session (e.g. re-renders, tab switches).
  const launchCheckedFor = useRef<string | null>(null);

  useEffect(() => {
    if (!user) {
      launchCheckedFor.current = null;
      setStatus('idle');
      setErrorReason(undefined);
    } else if (user.location && user.location.trim()) {
      setStatus('set');
      setErrorReason(undefined);
    }
  }, [user?.id, user?.location]);

  const applyDetected = async (label: string) => {
    await updateProfile({ location: label, locationSource: 'gps' });
    setStatus('set');
    setErrorReason(undefined);
  };

  const detectCurrentLocation = async () => {
    setStatus('detecting');
    setErrorReason(undefined);
    const permission = await requestForegroundPermission();
    if (!permission.granted) {
      setStatus('denied');
      setErrorReason('permission-denied');
      return;
    }
    const result = await detectCurrentLocationLabel();
    if (result.ok) {
      await applyDetected(result.label);
    } else {
      setStatus(result.reason === 'permission-denied' ? 'denied' : 'unavailable');
      setErrorReason(result.reason);
    }
  };

  const setManualLocation = async (label: string) => {
    const trimmed = label.trim();
    if (!trimmed) return;
    await updateProfile({ location: trimmed, locationSource: 'manual' });
    setStatus('set');
    setErrorReason(undefined);
  };

  const ensureLocationOnLaunch = async () => {
    if (!user || launchCheckedFor.current === user.id) return;
    launchCheckedFor.current = user.id;

    if (user.location && user.location.trim()) {
      setStatus('set');
      return;
    }

    const prompted = await readPrompted();
    if (prompted[user.id]) {
      // Already asked this account before (granted-but-since-cleared, or
      // denied) and it still has no location -- don't re-trigger the OS
      // dialog on every launch. The header / Location Picker keep manual
      // entry visible regardless of this status.
      setStatus('denied');
      setErrorReason('permission-denied');
      return;
    }

    setStatus('checking');
    const permission = await requestForegroundPermission();
    await markPrompted(user.id);

    if (!permission.granted) {
      setStatus('denied');
      setErrorReason('permission-denied');
      return;
    }

    setStatus('detecting');
    const result = await detectCurrentLocationLabel();
    if (result.ok) {
      await applyDetected(result.label);
    } else {
      setStatus(result.reason === 'permission-denied' ? 'denied' : 'unavailable');
      setErrorReason(result.reason);
    }
  };

  const value = useMemo<LocationContextValue>(
    () => ({ status, errorReason, ensureLocationOnLaunch, detectCurrentLocation, setManualLocation }),
    [status, errorReason, user?.id],
  );

  return <LocationContext.Provider value={value}>{children}</LocationContext.Provider>;
};

export const useLocationSystem = (): LocationContextValue => {
  const ctx = useContext(LocationContext);
  if (!ctx) throw new Error('useLocationSystem must be used within a LocationProvider');
  return ctx;
};

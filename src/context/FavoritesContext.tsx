import React, { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { storage } from '../utils/storage';
import { useAuth } from './AuthContext';

// Pre-fix builds stored every account's favorites under this single global
// key, so User A's favorites would show up for User B on the same device.
// It's kept around only so the one-time migration below can adopt it into
// whichever account happens to log in first after this fix ships, instead of
// silently discarding data people already had.
const LEGACY_GLOBAL_KEY = 'velora.favorites.v1';

const favoritesKeyFor = (userId: string) => `velora.favorites.v1.${userId}`;

interface FavoritesContextValue {
  favoriteIds: string[];
  isFavorite: (carId: string) => boolean;
  toggleFavorite: (carId: string) => void;
}

const FavoritesContext = createContext<FavoritesContextValue | undefined>(undefined);

export const FavoritesProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user } = useAuth();
  const userId = user?.id;
  const [favoriteIds, setFavoriteIds] = useState<string[]>([]);

  // Guards against a slow load for the previous account resolving *after*
  // the user has already logged out/switched accounts, which would
  // otherwise briefly stamp the new account's screen with the old
  // account's favorites (a race between login/logout and the async
  // storage read below).
  const activeUserIdRef = useRef<string | undefined>(userId);

  useEffect(() => {
    activeUserIdRef.current = userId;

    if (!userId) {
      // Logged out (or auth still resolving) — nothing to show, and
      // nothing that belongs to a specific account to keep in memory.
      setFavoriteIds([]);
      return;
    }

    (async () => {
      const key = favoritesKeyFor(userId);
      let raw = await storage.getItem(key);

      // One-time migration: if this account has never had its own
      // favorites saved yet, but the old shared list still has data in
      // it, adopt that data into this account and retire the legacy key
      // so it can't also get handed to a second account later.
      if (raw === null) {
        const legacyRaw = await storage.getItem(LEGACY_GLOBAL_KEY);
        if (legacyRaw !== null) {
          await storage.setItem(key, legacyRaw);
          await storage.removeItem(LEGACY_GLOBAL_KEY);
          raw = legacyRaw;
        }
      }

      // The account switched again while this read was in flight — don't
      // apply a now-stale result.
      if (activeUserIdRef.current !== userId) return;

      setFavoriteIds(raw ? JSON.parse(raw) : []);
    })();
  }, [userId]);

  const persist = async (ids: string[]) => {
    if (!userId) return;
    setFavoriteIds(ids);
    await storage.setItem(favoritesKeyFor(userId), JSON.stringify(ids));
  };

  const toggleFavorite = (carId: string) => {
    if (!userId) return;
    const next = favoriteIds.includes(carId)
      ? favoriteIds.filter((id) => id !== carId)
      : [...favoriteIds, carId];
    persist(next);
  };

  const value = useMemo<FavoritesContextValue>(
    () => ({
      favoriteIds,
      isFavorite: (carId: string) => favoriteIds.includes(carId),
      toggleFavorite,
    }),
    [favoriteIds],
  );

  return <FavoritesContext.Provider value={value}>{children}</FavoritesContext.Provider>;
};

export const useFavorites = (): FavoritesContextValue => {
  const ctx = useContext(FavoritesContext);
  if (!ctx) throw new Error('useFavorites must be used within a FavoritesProvider');
  return ctx;
};

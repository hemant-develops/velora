import React, { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { useAuth } from './AuthContext';
import { supabase } from '../lib/supabase';

// MULTI-DEVICE MIGRATION -- favorites used to live only in this device's
// AsyncStorage (per-user key `velora.favorites.v1.<userId>`), so favoriting
// a car on your phone never showed up if you opened VELORA on a second
// device signed into the same account. They now live in the real, shared
// `public.favorites` table (see supabase_migration_multidevice.sql),
// RLS-scoped strictly to `user_id = auth.uid()` -- nobody but the owning
// account can ever read or write their own favorites list.

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

  // Guards against a slow fetch for the previous account resolving *after*
  // the user has already logged out/switched accounts, which would
  // otherwise briefly stamp the new account's screen with the old
  // account's favorites.
  const activeUserIdRef = useRef<string | undefined>(userId);

  useEffect(() => {
    activeUserIdRef.current = userId;

    if (!userId) {
      // Logged out (or auth still resolving) — nothing to show.
      setFavoriteIds([]);
      return;
    }

    (async () => {
      const { data, error } = await supabase.from('favorites').select('car_id').eq('user_id', userId);
      if (activeUserIdRef.current !== userId) return; // stale result, account switched again mid-flight
      if (error) {
        console.log(`VELORA_FAVORITES_FETCH_ERROR: ${error.message}`);
        return;
      }
      setFavoriteIds((data ?? []).map((row: { car_id: string }) => row.car_id));
    })();
  }, [userId]);

  const toggleFavorite = (carId: string) => {
    if (!userId) return;
    const isCurrentlyFavorite = favoriteIds.includes(carId);
    // Optimistic update -- same instant-feedback feel as the previous
    // local-only version, with the real write happening alongside it.
    setFavoriteIds((prev) => (isCurrentlyFavorite ? prev.filter((id) => id !== carId) : [...prev, carId]));
    if (isCurrentlyFavorite) {
      supabase
        .from('favorites')
        .delete()
        .eq('user_id', userId)
        .eq('car_id', carId)
        .then(({ error }) => {
          if (error) console.log(`VELORA_FAVORITES_DELETE_ERROR: ${error.message}`);
        });
    } else {
      supabase
        .from('favorites')
        .insert({ user_id: userId, car_id: carId })
        .then(({ error }) => {
          if (error) console.log(`VELORA_FAVORITES_INSERT_ERROR: ${error.message}`);
        });
    }
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

import { useEffect, useRef, useState } from 'react';
import { AppUser } from '../types';
import { useAuth } from '../context/AuthContext';

// Final non-payment hardening -- TARGET 1. Resolves another user's
// PUBLIC-safe profile (name/avatar only -- see AuthContext.fetchPublicProfile
// and the get_public_profile RPC) for screens that need to display someone
// other than the signed-in user: OwnerPublicProfileScreen,
// CustomerProfileScreen, and CarDetailsScreen's "Listed by" row.
//
// Tries the synchronous, free path first (getUserById -- resolves instantly
// for the signed-in user's own id, or an id already fetched once this
// session) and only kicks off the async RPC call when that misses, so
// viewing your own data never waits on a network round trip.
//
// The `fetchedForRef`/`requestIdRef` guards do two things: they stop the
// effect from re-fetching the same id again on every re-render (it only
// ever fetches once per new id), and they stop a slow, stale request for a
// PREVIOUS id from applying its result after `userId` has already moved on
// to a different one.
export const usePublicProfile = (userId: string | undefined): { profile: AppUser | undefined; isLoading: boolean } => {
  const { getUserById, fetchPublicProfile } = useAuth();
  const [fetched, setFetched] = useState<AppUser | undefined>(undefined);
  const [isLoading, setIsLoading] = useState(false);
  const fetchedForRef = useRef<string | undefined>(undefined);

  const cached = userId ? getUserById(userId) : undefined;

  useEffect(() => {
    if (!userId || cached) return;
    if (fetchedForRef.current === userId) return;
    fetchedForRef.current = userId;
    setIsLoading(true);
    fetchPublicProfile(userId)
      .then((profile) => {
        if (fetchedForRef.current === userId) setFetched(profile);
      })
      .finally(() => {
        if (fetchedForRef.current === userId) setIsLoading(false);
      });
    // `cached` is intentionally in the dependency list even though it's a
    // new object reference on some renders -- the guard clauses above make
    // every extra firing an instant no-op the moment `cached` is truthy or
    // this id was already (or is already being) fetched, so this can never
    // loop or repeat a network call.
  }, [userId, cached, fetchPublicProfile]);

  return { profile: cached ?? fetched, isLoading: !cached && isLoading };
};

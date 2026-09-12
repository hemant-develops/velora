import React, { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from '../lib/supabase';

// VELORA Credits + Refer & Earn -- a REAL, working rewards system (not a
// decorative screen with invented numbers). Every balance shown here is the
// actual sum of real transactions; every referral status is derived from
// real, shared data.
//
// MULTI-DEVICE MIGRATION -- this used to be local-only (AsyncStorage keys
// `velora.wallet.transactions.v1` / `velora.referrals.codes.v1` /
// `velora.referrals.uses.v1`), including a client-side effect that watched
// this device's own BookingsContext state to detect a referred friend's
// first completed trip -- which would never fire if the referrer wasn't on
// this exact device at that exact moment. It now lives in three real,
// shared tables (`wallet_transactions`, `referral_codes`, `referral_uses`,
// see supabase_migration_multidevice.sql), and every balance-changing write
// goes through a SECURITY DEFINER RPC (get_or_create_referral_code /
// redeem_referral_code / spend_wallet_credits) -- there is deliberately no
// direct-insert policy on wallet_transactions, which is what stops a user
// from just inserting themselves a positive balance. The referred-friend
// completion bonus is now awarded by a server-side trigger
// (velora_award_referral_completion_bonus, fires on bookings.status ->
// 'completed') instead of client-side polling, so it fires reliably
// regardless of which device is open at the time.
//
// Reward amounts are VELORA's own configured values, not copied from any
// other app -- kept here as the single source of truth for the UI, and
// mirrored server-side in the RPCs/trigger above (change both together).
export const REFERRAL_SIGNUP_BONUS = 50; // credited to the NEW user immediately on a valid code
export const REFERRAL_COMPLETED_BONUS = 150; // credited to the REFERRER once their friend's first trip completes

export interface WalletTransaction {
  id: string;
  userId: string;
  amount: number; // positive = credit, negative = redeemed/spent
  reason: string;
  createdAt: string;
}

export interface ReferralUse {
  id: string;
  code: string;
  referrerId: string;
  referredUserId: string;
  referredName: string;
  status: 'pending' | 'completed';
  createdAt: string;
  completedAt?: string;
}

interface RedeemResult {
  success: boolean;
  error?: string;
}

interface RewardsContextValue {
  isLoaded: boolean;
  getBalance: (userId: string) => number;
  getTransactions: (userId: string) => WalletTransaction[];
  getOrCreateMyCode: (userId: string) => string;
  redeemReferralCode: (code: string, newUserId: string, newUserName: string) => Promise<RedeemResult>;
  getReferralsForUser: (userId: string) => ReferralUse[];
  hasRedeemedAnyCode: (userId: string) => boolean;
  // Spends `amount` of the user's own wallet balance (never more than their
  // balance) as a real, immediate debit -- used by Payment/Booking to apply
  // credits toward a real total, not a cosmetic discount line.
  spendCredits: (userId: string, amount: number, reason: string) => Promise<{ success: boolean; error?: string }>;
  refreshWallet: () => Promise<void>;
}

const RewardsContext = createContext<RewardsContextValue | undefined>(undefined);

interface WalletTransactionRow {
  id: string;
  user_id: string;
  amount: number;
  reason: string;
  created_at: string;
}

interface ReferralUseRow {
  id: string;
  code: string;
  referrer_id: string;
  referred_user_id: string;
  referred_name: string;
  status: string;
  created_at: string;
  completed_at: string | null;
}

const rowToTransaction = (row: WalletTransactionRow): WalletTransaction => ({
  id: row.id,
  userId: row.user_id,
  amount: row.amount,
  reason: row.reason,
  createdAt: row.created_at,
});

const rowToReferralUse = (row: ReferralUseRow): ReferralUse => ({
  id: row.id,
  code: row.code,
  referrerId: row.referrer_id,
  referredUserId: row.referred_user_id,
  referredName: row.referred_name,
  status: row.status as ReferralUse['status'],
  createdAt: row.created_at,
  completedAt: row.completed_at ?? undefined,
});

// Candidate code generator -- the server (get_or_create_referral_code) is
// the actual source of truth for uniqueness (`code` is a primary key), this
// just picks a plausible-looking candidate to offer it.
const randomCode = (): string => {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no 0/O/1/I to avoid look-alike confusion
  return 'VLR' + Array.from({ length: 5 }, () => alphabet[Math.floor(Math.random() * alphabet.length)]).join('');
};

export const RewardsProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [transactions, setTransactions] = useState<WalletTransaction[]>([]);
  const [uses, setUses] = useState<ReferralUse[]>([]);
  const [isLoaded, setIsLoaded] = useState(false);
  const [codesCache, setCodesCache] = useState<Record<string, string>>({});
  const fetchingCodesRef = useRef<Set<string>>(new Set());

  const fetchWalletAndReferrals = async () => {
    // RLS scopes both to the signed-in user (wallet_transactions: own rows
    // only; referral_uses: rows where they're the referrer OR the referred
    // friend), so no explicit userId filter is needed here.
    const [txRes, usesRes] = await Promise.all([
      supabase.from('wallet_transactions').select('*').order('created_at', { ascending: false }),
      supabase.from('referral_uses').select('*').order('created_at', { ascending: false }),
    ]);
    if (txRes.error) {
      console.log(`VELORA_WALLET_FETCH_ERROR: ${txRes.error.message}`);
    } else {
      setTransactions(((txRes.data ?? []) as WalletTransactionRow[]).map(rowToTransaction));
    }
    if (usesRes.error) {
      console.log(`VELORA_REFERRAL_USES_FETCH_ERROR: ${usesRes.error.message}`);
    } else {
      setUses(((usesRes.data ?? []) as ReferralUseRow[]).map(rowToReferralUse));
    }
  };

  useEffect(() => {
    (async () => {
      await fetchWalletAndReferrals();
      setIsLoaded(true);
    })();
    const { data: sub } = supabase.auth.onAuthStateChange(() => {
      fetchWalletAndReferrals();
    });
    return () => {
      sub.subscription.unsubscribe();
    };
  }, []);

  const getBalance = (userId: string) => transactions.filter((t) => t.userId === userId).reduce((sum, t) => sum + t.amount, 0);
  const getTransactions = (userId: string) =>
    transactions.filter((t) => t.userId === userId).sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));

  // The public interface stays synchronous (screens call this straight from
  // render), so a not-yet-fetched code returns '' once and kicks off the
  // real RPC round-trip in the background; the screen re-renders with the
  // real code once codesCache updates.
  const ensureCodeFetched = (userId: string) => {
    if (codesCache[userId] || fetchingCodesRef.current.has(userId)) return;
    fetchingCodesRef.current.add(userId);
    (async () => {
      let result: string | null = null;
      // A handful of attempts in case the randomly generated candidate
      // collides with someone else's existing code (the primary key
      // constraint would reject the insert with 23505).
      for (let attempt = 0; attempt < 5 && !result; attempt += 1) {
        const candidate = randomCode();
        const { data, error } = await supabase.rpc('get_or_create_referral_code', { p_code: candidate });
        if (!error && data) {
          result = data as string;
          break;
        }
        if (error && error.code !== '23505') {
          console.log(`VELORA_REFERRAL_CODE_ERROR: ${error.message}`);
          break;
        }
      }
      fetchingCodesRef.current.delete(userId);
      if (result) setCodesCache((prev) => ({ ...prev, [userId]: result as string }));
    })();
  };

  const getOrCreateMyCode = (userId: string): string => {
    ensureCodeFetched(userId);
    return codesCache[userId] ?? '';
  };

  const redeemReferralCode = async (rawCode: string, _newUserId: string, newUserName: string): Promise<RedeemResult> => {
    const code = rawCode.trim().toUpperCase();
    if (!code) return { success: false, error: 'Enter a referral code.' };
    const { data, error } = await supabase.rpc('redeem_referral_code', { p_code: code, p_referred_name: newUserName });
    if (error) {
      console.log(`VELORA_REFERRAL_REDEEM_ERROR: ${error.message}`);
      return { success: false, error: "We couldn't redeem that code right now. Please try again." };
    }
    const result = data as RedeemResult | null;
    if (result?.success) {
      await fetchWalletAndReferrals();
      return { success: true };
    }
    return { success: false, error: result?.error ?? "We couldn't redeem that code right now. Please try again." };
  };

  const spendCredits = async (_userId: string, amount: number, reason: string) => {
    const { data, error } = await supabase.rpc('spend_wallet_credits', { p_amount: amount, p_reason: reason });
    if (error) {
      console.log(`VELORA_WALLET_SPEND_ERROR: ${error.message}`);
      return { success: false, error: "We couldn't apply your credits right now. Please try again." };
    }
    const result = data as { success: boolean; error?: string } | null;
    if (result?.success) {
      await fetchWalletAndReferrals();
      return { success: true };
    }
    return { success: false, error: result?.error ?? 'Not enough credits.' };
  };

  const value = useMemo<RewardsContextValue>(
    () => ({
      isLoaded,
      getBalance,
      getTransactions,
      getOrCreateMyCode,
      redeemReferralCode,
      getReferralsForUser: (userId) => uses.filter((u) => u.referrerId === userId).sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1)),
      hasRedeemedAnyCode: (userId) => uses.some((u) => u.referredUserId === userId),
      spendCredits,
      refreshWallet: fetchWalletAndReferrals,
    }),
    [transactions, uses, isLoaded, codesCache],
  );

  return <RewardsContext.Provider value={value}>{children}</RewardsContext.Provider>;
};

export const useRewards = (): RewardsContextValue => {
  const ctx = useContext(RewardsContext);
  if (!ctx) throw new Error('useRewards must be used within a RewardsProvider');
  return ctx;
};

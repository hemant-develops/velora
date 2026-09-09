import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { storage } from '../utils/storage';
import { AppUser, OwnerVerification, UserRole } from '../types';
import { avatars } from '../data/images';
import { generateId, isValidEmail } from '../utils/format';

const USERS_KEY = 'velora.users.v1';
const SESSION_KEY = 'velora.session.v1';

export interface AuthResult {
  success: boolean;
  error?: string;
  // A non-blocking heads-up shown alongside a successful result — e.g. when
  // someone picked "List My Car" at Login but their account isn't a
  // verified owner yet, so they were logged in as their existing role
  // instead of being silently switched to Owner Mode.
  info?: string;
}

export interface OwnerVerificationInput {
  fullName: string;
  phone: string;
  idType: string;
  idNumber: string;
}

interface AuthContextValue {
  user: AppUser | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  login: (email: string, password: string, role?: UserRole) => Promise<AuthResult>;
  signup: (params: {
    name: string;
    email: string;
    password: string;
    confirmPassword: string;
    role: UserRole;
  }) => Promise<AuthResult>;
  logout: () => Promise<void>;
  updateProfile: (patch: Partial<AppUser>) => Promise<void>;
  switchRole: (role: UserRole) => Promise<AuthResult>;
  submitOwnerVerification: (input: OwnerVerificationInput) => Promise<void>;
  getUserById: (id: string) => AppUser | undefined;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

const readUsers = async (): Promise<AppUser[]> => {
  const raw = await storage.getItem(USERS_KEY);
  return raw ? (JSON.parse(raw) as AppUser[]) : [];
};

const isVerifiedOwner = (u: AppUser | undefined) => u?.ownerVerification?.status === 'verified';

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<AppUser | null>(null);
  const [allUsers, setAllUsers] = useState<AppUser[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const [sessionRaw, users] = await Promise.all([storage.getItem(SESSION_KEY), readUsers()]);
        setAllUsers(users);
        if (sessionRaw) {
          setUser(JSON.parse(sessionRaw) as AppUser);
        }
      } finally {
        setIsLoading(false);
      }
    })();
  }, []);

  const writeUsers = async (users: AppUser[]) => {
    setAllUsers(users);
    await storage.setItem(USERS_KEY, JSON.stringify(users));
  };

  const persistSession = async (nextUser: AppUser | null) => {
    if (nextUser) {
      await storage.setItem(SESSION_KEY, JSON.stringify(nextUser));
    } else {
      await storage.removeItem(SESSION_KEY);
    }
  };

  // Local demo auth: this is a mock backend. Any valid-looking credentials
  // succeed so the flow is easy to demo — swap this function out for a real
  // API call when a backend is available.
  //
  // `role` is the mode picked on the Login screen. A brand-new email
  // creates a fresh account in that mode (choosing "List My Car" while
  // signing up for the first time is, itself, the verification). An
  // existing account can freely log back in as a Renter, but can only log
  // in as an Owner if it has already completed Owner Verification —
  // otherwise it logs in as whatever role it already has, with `info`
  // explaining why, rather than silently granting owner access.
  const login = async (email: string, password: string, role?: UserRole): Promise<AuthResult> => {
    const trimmed = email.trim();
    if (!isValidEmail(trimmed)) {
      return { success: false, error: 'Enter a valid email address.' };
    }
    if (!password) {
      return { success: false, error: 'Password cannot be empty.' };
    }

    const users = await readUsers();
    let matched = users.find((u) => u.email.toLowerCase() === trimmed.toLowerCase());
    let info: string | undefined;

    if (!matched) {
      const inferredName = trimmed.split('@')[0].replace(/[._-]/g, ' ');
      const chosenRole = role ?? 'renter';
      matched = {
        id: generateId('user'),
        name: inferredName.replace(/\b\w/g, (c) => c.toUpperCase()) || 'New Renter',
        email: trimmed,
        // No assumed location -- LocationProvider prompts for the real
        // device location (or a manual one) the moment this account first
        // reaches the main app. See src/context/LocationContext.tsx.
        location: '',
        createdAt: new Date().toISOString(),
        avatar: avatars.abhishek,
        role: chosenRole,
        ownerVerification:
          chosenRole === 'owner' ? { status: 'verified', verifiedAt: new Date().toISOString() } : { status: 'none' },
      };
      await writeUsers([...users, matched]);
    } else if (role && role !== matched.role) {
      if (role === 'owner') {
        if (isVerifiedOwner(matched)) {
          // Reassigning into a fresh `const` (rather than asserting
          // `matched!` inside the closure below) lets TypeScript narrow it
          // to a definite AppUser for real, instead of forcing the type
          // checker to trust an assertion.
          const updated: AppUser = { ...matched, role: 'owner' };
          matched = updated;
          await writeUsers(users.map((u) => (u.id === updated.id ? updated : u)));
        } else {
          info = "This account isn't a verified rental owner yet — logged in as Renter. Apply from Profile > Become a Rental Owner.";
        }
      } else {
        const updated: AppUser = { ...matched, role: 'renter' };
        matched = updated;
        await writeUsers(users.map((u) => (u.id === updated.id ? updated : u)));
      }
    }

    setUser(matched);
    await persistSession(matched);
    return { success: true, info };
  };

  const signup: AuthContextValue['signup'] = async ({ name, email, password, confirmPassword, role }) => {
    if (!name.trim()) return { success: false, error: 'Please enter your name.' };
    if (!isValidEmail(email)) return { success: false, error: 'Enter a valid email address.' };
    if (password.length < 4) return { success: false, error: 'Password must be at least 4 characters.' };
    if (password !== confirmPassword) return { success: false, error: 'Passwords do not match.' };

    const users = await readUsers();
    if (users.some((u) => u.email.toLowerCase() === email.trim().toLowerCase())) {
      return { success: false, error: 'An account with this email already exists.' };
    }

    const newUser: AppUser = {
      id: generateId('user'),
      name: name.trim(),
      email: email.trim(),
      // No assumed location -- see the matching comment in login() above.
      location: '',
      createdAt: new Date().toISOString(),
      avatar: avatars.abhishek,
      role,
      ownerVerification: role === 'owner' ? { status: 'verified', verifiedAt: new Date().toISOString() } : { status: 'none' },
    };
    await writeUsers([...users, newUser]);
    setUser(newUser);
    await persistSession(newUser);
    return { success: true };
  };

  const logout = async () => {
    setUser(null);
    await persistSession(null);
  };

  const updateProfile = async (patch: Partial<AppUser>) => {
    if (!user) return;
    const nextUser = { ...user, ...patch };
    setUser(nextUser);
    await persistSession(nextUser);
    const users = await readUsers();
    await writeUsers(users.map((u) => (u.id === nextUser.id ? nextUser : u)));
  };

  // Renter -> Owner requires prior verification; Owner -> Renter is always allowed.
  const switchRole = async (role: UserRole): Promise<AuthResult> => {
    if (role === 'owner' && !isVerifiedOwner(user ?? undefined)) {
      return { success: false, error: 'Complete Owner Verification from Profile before switching to Owner Mode.' };
    }
    await updateProfile({ role });
    return { success: true };
  };

  // Demo verification: instantly "approved" (a real build would call an
  // actual KYC/ID-verification provider here). Verifying also switches the
  // account into Owner Mode right away, since that's the whole point.
  const submitOwnerVerification = async (input: OwnerVerificationInput) => {
    const ownerVerification: OwnerVerification = { status: 'verified', ...input, verifiedAt: new Date().toISOString() };
    await updateProfile({ ownerVerification, role: 'owner' });
  };

  const getUserById = (id: string) => allUsers.find((u) => u.id === id);

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      isLoading,
      isAuthenticated: !!user,
      login,
      signup,
      logout,
      updateProfile,
      switchRole,
      submitOwnerVerification,
      getUserById,
    }),
    [user, isLoading, allUsers],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuth = (): AuthContextValue => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within an AuthProvider');
  return ctx;
};

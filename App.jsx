import React, { useState, useEffect, useRef } from 'react';
import {
  Shield,
  Wallet,
  RefreshCw,
  AlertTriangle,
  Users,
  Clock,
  Award,
  CheckCircle,
  LogOut,
  UserPlus,
  Info,
  Lock,
  KeyRound,
  ArrowLeft,
  Crown,
  Zap,
  Gift
} from 'lucide-react';

// FIREBASE
import { initializeApp, getApps } from 'firebase/app';
import {
  getAuth,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
  sendPasswordResetEmail
} from 'firebase/auth';
import {
  getFirestore,
  doc,
  getDoc,
  setDoc
} from 'firebase/firestore';

const firebaseConfig = {
  apiKey: "AIzaSyAF5l0YvOk4Wk2NrqoL1BXj6szJtS65q-k",
  authDomain: "dogedrip-3ebda.firebaseapp.com",
  projectId: "dogedrip-3ebda",
  storageBucket: "dogedrip-3ebda.firebasestorage.app",
  messagingSenderId: "839487252990",
  appId: "1:839487252990:web:760ad35b5b66d611bab8af"
};

// ADMIN ACCOUNTS (only controls dashboard visibility; the Worker enforces access)
const ADMIN_EMAILS = {
  lilac: "giselapeposhi29@icloud.com",
  blue: "celamielidon26@gmail.com"
};

const firebaseApp = !getApps().length
  ? initializeApp(firebaseConfig)
  : getApps()[0];

const auth = getAuth(firebaseApp);
const dbStore = getFirestore(firebaseApp);

const API_URL = "https://dogedrip-api.f5pfpv5sbg.workers.dev";

const REF_CODE_REGEX = /^DOGE[A-HJ-NP-Z2-9]{6}$/;
const KOINU = 100000000;

// SHARED STYLE CLASSES
// These were missing from the file. LABEL_CLS and INPUT_CLS are used by the
// Wallet withdrawal form (and PRIMARY_BTN / LABEL_CLS / INPUT_CLS by the auth
// forms). Referencing an undefined constant throws a ReferenceError during
// render, React unmounts the whole tree and the page turns completely black.
const LABEL_CLS =
  'block text-xs font-bold uppercase tracking-wider text-slate-400 mb-1';

const INPUT_CLS =
  'w-full bg-black border border-slate-800 focus:border-[#F4A6C1] focus:outline-none text-white placeholder-slate-600 rounded-xl px-4 py-3 text-sm transition-colors';

const PRIMARY_BTN =
  "w-full bg-[#F4A6C1] hover:bg-[#e091ad] disabled:opacity-50 disabled:cursor-not-allowed text-black font-black py-3 rounded-xl transition-all shadow-lg shadow-[#F4A6C1]/20 flex items-center justify-center space-x-2 text-sm font-['Space_Grotesk',sans-serif] tracking-wide";


// PLAN CATALOG (DISPLAY ONLY)
const PLAN_CATALOG = [
  {
    key: 'FREE',
    label: 'Free',
    price: 'Free',
    priceNote: 'No payment required',
    amountKoinu: 50000,
    cooldownSeconds: 50,
    dailyLimit: 50,
    features: [
      '0.0005 DOGE per claim',
      '50-second claim cooldown',
      'Free Lucky Wheel',
      'Daily Check-in',
      'Return Bonuses',
      'Missions & Challenges',
      'Advertisements'
    ],
    icon: Gift,
    cardCls: 'border-slate-800',
    activeCardCls: 'border-slate-300 shadow-lg shadow-white/5',
    accentText: 'text-slate-300',
    badgeCls: 'bg-slate-500/10 text-slate-300 border border-slate-500/30',
    iconWrapCls: 'bg-slate-500/10 border border-slate-500/20 text-slate-300'
  },
  {
    key: 'PREMIUM',
    label: 'Premium',
    price: '€2.99',
    priceNote: 'per month',
    amountKoinu: 100000,
    cooldownSeconds: 45,
    dailyLimit: 50,
    features: [
      '0.001 DOGE per claim',
      '45-second claim cooldown',
      'Ad-free experience',
      'Premium Daily Bonus',
      'Weekly Bonus',
      'Premium Badge',
      'Extended Earnings History',
      '50 claims per day'
    ],
    icon: Zap,
    cardCls: 'border-[#F4A6C1]/30',
    activeCardCls: 'border-[#F4A6C1] shadow-lg shadow-[#F4A6C1]/20',
    accentText: 'text-[#F4A6C1]',
    badgeCls: 'bg-[#F4A6C1]/10 text-[#F4A6C1] border border-[#F4A6C1]/30',
    iconWrapCls: 'bg-[#F4A6C1]/10 border border-[#F4A6C1]/20 text-[#F4A6C1]'
  },
  {
    key: 'VIP',
    label: 'VIP',
    price: '€4.99',
    priceNote: 'per month',
    amountKoinu: 150000,
    cooldownSeconds: 0,
    dailyLimit: 100,
    features: [
      '0.0015 DOGE per claim',
      'No claim cooldown',
      'Ad-free experience',
      'VIP Daily Chest',
      'VIP Daily & Weekly Bonuses',
      'VIP Badge',
      'Advanced Statistics',
      '100 claims per day',
      'Priority Support',
      'Exclusive Lucky Wheel Rewards'
    ],
    icon: Crown,
    cardCls: 'border-yellow-500/30',
    activeCardCls: 'border-yellow-400 shadow-lg shadow-yellow-400/20',
    accentText: 'text-yellow-400',
    badgeCls: 'bg-yellow-500/10 text-yellow-400 border border-yellow-500/30',
    iconWrapCls: 'bg-yellow-500/10 border border-yellow-500/20 text-yellow-400'
  }
];

// True for real numbers (including 0). Never use plain truthiness for Worker values:
// VIP has cooldown_seconds: 0 and daily_claims_remaining can be 0.
const isNum = (v) =>
  v !== null && v !== undefined && v !== '' && Number.isFinite(Number(v));

const formatCooldown = (seconds) => {
  if (!isNum(seconds)) return '...';
  return Number(seconds) === 0 ? 'No cooldown' : `${Number(seconds)} seconds`;
};

// Seconds until the next 00:00 UTC (daily claims reset on the UTC date)
const secondsUntilUtcReset = () => {
  const now = new Date();
  const nextReset = Date.UTC(
    now.getUTCFullYear(),
    now.getUTCMonth(),
    now.getUTCDate() + 1
  );
  return Math.max(0, Math.ceil((nextReset - now.getTime()) / 1000));
};

const utcDayKey = () => new Date().toISOString().slice(0, 10);

const formatDuration = (totalSeconds) => {
  const s = Math.max(0, Math.floor(totalSeconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return `${h}h ${String(m).padStart(2, '0')}m ${String(sec).padStart(2, '0')}s`;
};

// Parses numbers, "YYYY-MM-DD HH:MM:SS" (UTC from D1) and ISO strings safely.
const parseServerDate = (value) => {
  if (value === null || value === undefined || value === '') return null;

  if (typeof value === 'number') {
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? null : d;
  }

  const s = String(value).trim();
  const iso = s.includes('T') ? s : s.replace(' ', 'T');
  const hasTimezone = /([zZ]|[+-]\d{2}:?\d{2})$/.test(iso);
  const date = new Date(hasTimezone ? iso : iso + 'Z');

  return Number.isNaN(date.getTime()) ? null : date;
};

const formatDate = (value) => {
  const date = parseServerDate(value);
  return date ? date.toLocaleString() : 'N/A';
};

const mapWithdrawal = (w) => ({
  id: w.id,
  userId: w.uid || w.userId || '',
  email: w.email || '',
  amount: Number(w.amount_koinu) / KOINU,
  address: w.wallet_address || w.address || '',
  status: w.status || 'pending',
  timestamp: parseServerDate(w.created_at)?.getTime() ?? null
});

// Small presentational tile used on the Faucet page
const StatTile = ({ label, value, sub, valueCls = 'text-white' }) => (
  <div className="bg-black border border-slate-800 rounded-xl p-4 text-left">
    <span className="block text-[10px] uppercase tracking-wider text-slate-500 font-mono font-bold">
      {label}
    </span>
    <div className={`text-base md:text-lg font-black font-mono mt-1 break-words ${valueCls}`}>
      {value}
    </div>
    {sub && (
      <span className="block text-[10px] text-slate-500 mt-0.5">{sub}</span>
    )}
  </div>
);

export default function App() {
  // NAVIGATION
  const [activeTab, setActiveTab] = useState('faucet');

  // AUTH STATE
  const [firebaseUser, setFirebaseUser] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [userProfile, setUserProfile] = useState(null);
  const [authMode, setAuthMode] = useState('login');
  const [apiReady, setApiReady] = useState(false);
  const [apiError, setApiError] = useState('');

  // Referral code of the pending registration (read by the auth sync)
  const pendingReferralRef = useRef(null);
  const authEventRef = useRef(0);
  const [authSyncRetry, setAuthSyncRetry] = useState(0);

  // Guards against simultaneous claims (state updates are asynchronous)
  const claimInFlightRef = useRef(false);
  const claimStatusTimerRef = useRef(null);
  const lastUtcDayRef = useRef(utcDayKey());

  // AUTH FORM
  const [usernameInput, setUsernameInput] = useState('');
  const [emailInput, setEmailInput] = useState('');
  const [passwordInput, setPasswordInput] = useState('');
  const [regRefCode, setRegRefCode] = useState('');
  const [authError, setAuthError] = useState('');
  const [authSuccess, setAuthSuccess] = useState('');
  const [isLoadingAuth, setIsLoadingAuth] = useState(false);

  // SETTINGS FROM WORKER
  const [minWithdrawal, setMinWithdrawal] = useState(1);

  // CLAIM RULES + PLAN (always taken from the Worker; null until loaded)
  // { name?, cooldownSeconds, claimAmount (DOGE), dailyUsed?, dailyLimit?, dailyRemaining? }
  // name / daily* only exist when the deployed Worker reports them.
  const [planInfo, setPlanInfo] = useState(null);
  const [accountError, setAccountError] = useState('');
  const [resetSeconds, setResetSeconds] = useState(secondsUntilUtcReset());
  const [accountSyncTick, setAccountSyncTick] = useState(0);

  // FAUCET
  const [demoBalance, setDemoBalance] = useState(0);
  const [claimsLoading, setClaimsLoading] = useState(false);
  const [claimsError, setClaimsError] = useState('');
  const [cooldownLeft, setCooldownLeft] = useState(0);
  const [claimStatus, setClaimStatus] = useState('');
  const [claimIsError, setClaimIsError] = useState(false);
  const [showClaimEffect, setShowClaimEffect] = useState(false);
  const [isClaiming, setIsClaiming] = useState(false);
  const [demoClaims, setDemoClaims] = useState([]);

  // WITHDRAWALS
  const [demoWithdrawals, setDemoWithdrawals] = useState([]);
  const [withdrawAmount, setWithdrawAmount] = useState('1.0');
  const [withdrawAddress, setWithdrawAddress] = useState('');
  const [withdrawMsg, setWithdrawMsg] = useState('');
  const [isWithdrawing, setIsWithdrawing] = useState(false);

  // REFERRALS
  const [refCode, setRefCode] = useState('');
  const [referralStats, setReferralStats] = useState(null);
  const [referralLoading, setReferralLoading] = useState(false);
  const [referralError, setReferralError] = useState('');

  // ADMIN
  const [adminWithdrawals, setAdminWithdrawals] = useState([]);
  const [adminLoading, setAdminLoading] = useState(false);
  const [adminError, setAdminError] = useState('');
  const [adminActionLoading, setAdminActionLoading] = useState(null);

  // ADMIN IDENTIFICATION (visibility only)
  const adminEmail = firebaseUser?.email?.trim().toLowerCase() || '';

  const adminTheme =
    adminEmail === ADMIN_EMAILS.lilac
      ? 'lilac'
      : adminEmail === ADMIN_EMAILS.blue
        ? 'blue'
        : null;

  const isDemoAdmin = Boolean(adminTheme);
  const isBlueAdmin = adminTheme === 'blue';

  // DERIVED VALUES (read-only views of the Worker responses)
  const planName =
    typeof planInfo?.name === 'string' && planInfo.name ? planInfo.name : null;
  const claimAmount = isNum(planInfo?.claimAmount) ? planInfo.claimAmount : null;
  const cooldownSeconds = isNum(planInfo?.cooldownSeconds)
    ? planInfo.cooldownSeconds
    : null;
  const dailyUsed = isNum(planInfo?.dailyUsed) ? planInfo.dailyUsed : null;
  const dailyLimit = isNum(planInfo?.dailyLimit) ? planInfo.dailyLimit : null;
  const dailyRemaining = isNum(planInfo?.dailyRemaining)
    ? planInfo.dailyRemaining
    : null;
  const dailyLimitReached = dailyRemaining !== null && dailyRemaining <= 0;
  const rulesReady = claimAmount !== null && cooldownSeconds !== null;
  const accountLoaded = planInfo !== null;

  // API HELPER
  const apiRequest = async (path, options = {}) => {
    if (!firebaseUser) {
      throw new Error('Please log in first.');
    }

    const token = await firebaseUser.getIdToken();

    let response;

    try {
      response = await fetch(`${API_URL}${path}`, {
        ...options,
        headers: {
          ...(options.body ? { 'Content-Type': 'application/json' } : {}),
          ...options.headers,
          Authorization: `Bearer ${token}`
        }
      });
    } catch {
      throw new Error('Network error. Check your connection and try again.');
    }

    const data = await response.json().catch(() => ({}));

    if (!response.ok || data.success === false) {
      const err = new Error(
        data.error || data.message || `Request failed (${response.status})`
      );
      err.status = response.status;
      err.data = data;
      throw err;
    }

    return data;
  };

  // Applies any Worker account/claim response (balance, claim, 429 bodies).
  // Zero is a valid value everywhere (VIP cooldown_seconds: 0, remaining: 0).
  // Fields the Worker does not send are simply left untouched.
  const applyAccountData = (data) => {
    if (!data || typeof data !== 'object') return;

    if (isNum(data.balance_koinu)) {
      setDemoBalance(Number(data.balance_koinu) / KOINU);
    }

    if (isNum(data.min_withdrawal_koinu) && Number(data.min_withdrawal_koinu) > 0) {
      setMinWithdrawal(Number(data.min_withdrawal_koinu) / KOINU);
    }

    if (isNum(data.cooldown_remaining)) {
      setCooldownLeft(Math.max(0, Number(data.cooldown_remaining)));
    } else if (data.last_claim_at && isNum(data.cooldown_seconds)) {
      // Fallback for a Worker response without cooldown_remaining
      const lastClaim = parseServerDate(data.last_claim_at);

      if (lastClaim) {
        const elapsed = Math.floor((Date.now() - lastClaim.getTime()) / 1000);
        setCooldownLeft(Math.max(0, Number(data.cooldown_seconds) - elapsed));
      }
    }

    const patch = {};

    if (typeof data.plan === 'string' && data.plan) {
      patch.name = data.plan.toUpperCase();
    }

    if (isNum(data.cooldown_seconds)) {
      patch.cooldownSeconds = Number(data.cooldown_seconds);
    }

    const rewardKoinu = isNum(data.claim_amount_koinu)
      ? data.claim_amount_koinu
      : data.amount_koinu;

    if (isNum(rewardKoinu)) {
      patch.claimAmount = Number(rewardKoinu) / KOINU;
    }

    if (isNum(data.daily_claims_used)) {
      patch.dailyUsed = Number(data.daily_claims_used);
    }

    if (isNum(data.daily_limit)) {
      patch.dailyLimit = Number(data.daily_limit);
    }

    if (isNum(data.daily_claims_remaining)) {
      patch.dailyRemaining = Number(data.daily_claims_remaining);
    }

    if (Object.keys(patch).length > 0) {
      setPlanInfo(prev => ({ ...(prev || {}), ...patch }));
    }
  };

  // ADMIN REDIRECT
  useEffect(() => {
    if (activeTab === 'admin' && !isDemoAdmin) {
      setActiveTab('faucet');
    }
  }, [activeTab, isDemoAdmin]);

  // FIREBASE AUTH + D1 SYNC
  useEffect(() => {
    let isMounted = true;

    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      const eventId = ++authEventRef.current;

      if (!isMounted) return;

      // Clear previous account data immediately when identity changes.
      setFirebaseUser(user);
      setUserProfile(null);
      setApiReady(false);
      setApiError('');
      setDemoBalance(0);
      setDemoClaims([]);
      setDemoWithdrawals([]);
      setAdminWithdrawals([]);
      setCooldownLeft(0);
      setPlanInfo(null);
      setAccountError('');
      setRefCode('');
      setReferralStats(null);
      setReferralError('');
      setClaimsError('');
      setAdminError('');
      setReferralLoading(false);
      setClaimsLoading(false);
      setAdminLoading(false);

      if (!user) {
        setAuthLoading(false);
        return;
      }

      setAuthLoading(true);

      const referredBy = pendingReferralRef.current;

      const fallbackProfile = {
        uid: user.uid,
        email: user.email,
        username: user.email ? user.email.split('@')[0] : 'User',
        createdAt: Date.now()
      };

      try {
        const token = await user.getIdToken();

        const syncResponse = await fetch(`${API_URL}/api/auth/sync`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`
          },
          body: JSON.stringify({
            referred_by: referredBy || null
          })
        });

        const syncData = await syncResponse.json().catch(() => ({}));

        if (!syncResponse.ok || syncData.success === false) {
          throw new Error(
            syncData.error || `D1 sync failed (${syncResponse.status})`
          );
        }

        if (!isMounted || eventId !== authEventRef.current) return;

        pendingReferralRef.current = null;
        setRefCode(syncData.ref_code || '');
        setApiReady(true);
        setApiError('');
      } catch (error) {
        console.error('D1 sync error:', error);

        if (!isMounted || eventId !== authEventRef.current) return;

        setApiError(`Database connection failed: ${error.message}`);
      }

      try {
        const docRef = doc(dbStore, 'users', user.uid);
        const docSnap = await getDoc(docRef);

        if (!isMounted || eventId !== authEventRef.current) return;

        if (docSnap.exists()) {
          const data = docSnap.data();

          setUserProfile({
            ...fallbackProfile,
            ...data,
            username: data.username || fallbackProfile.username
          });
        } else {
          setUserProfile(fallbackProfile);
        }
      } catch (error) {
        console.warn('Firestore unavailable:', error.message);

        if (!isMounted || eventId !== authEventRef.current) return;

        setUserProfile(fallbackProfile);
      }

      if (isMounted && eventId === authEventRef.current) {
        setAuthLoading(false);
      }
    });

    return () => {
      isMounted = false;
      authEventRef.current++;
      unsubscribe();
    };
  }, [authSyncRetry]);

  // LOAD BALANCE + CLAIM RULES (+ PLAN / DAILY INFO WHEN REPORTED) FROM THE WORKER
  // Runs on login, when switching tabs (so a backend plan change shows up)
  // and when the UTC day rolls over (daily counter reset).
  useEffect(() => {
    if (!firebaseUser || !apiReady) return;

    let cancelled = false;

    const loadAccount = async () => {
      try {
        const data = await apiRequest('/api/balance');

        // Do not overwrite fresher claim data while a claim is in flight
        if (cancelled || claimInFlightRef.current) return;

        applyAccountData(data);
        setAccountError('');
      } catch (error) {
        console.error('Balance loading error:', error);

        if (!cancelled) {
          setAccountError(
            error.message || 'Could not load your claim information.'
          );
        }
      }
    };

    loadAccount();

    return () => {
      cancelled = true;
    };
  }, [firebaseUser, apiReady, activeTab, accountSyncTick]);

  // LOAD CLAIM HISTORY FROM D1
  useEffect(() => {
    if (!firebaseUser || !apiReady) {
      setDemoClaims([]);
      return;
    }

    let cancelled = false;

    const loadClaims = async () => {
      setClaimsLoading(true);
      setClaimsError('');

      try {
        const data = await apiRequest('/api/claims');

        if (!cancelled) {
          setDemoClaims(data.claims || []);
        }
      } catch (error) {
        if (!cancelled) {
          setClaimsError(error.message);
        }
      } finally {
        if (!cancelled) {
          setClaimsLoading(false);
        }
      }
    };

    loadClaims();

    return () => {
      cancelled = true;
    };
  }, [firebaseUser, apiReady]);

  // LOAD USER WITHDRAWALS FROM D1
  useEffect(() => {
    if (!firebaseUser || !apiReady) {
      setDemoWithdrawals([]);
      return;
    }

    let cancelled = false;

    const loadWithdrawals = async () => {
      try {
        const data = await apiRequest('/api/withdrawals');

        if (!cancelled) {
          setDemoWithdrawals(
            (data.withdrawals || []).map(mapWithdrawal)
          );
        }
      } catch (error) {
        console.error('Withdrawal history error:', error);
      }
    };

    loadWithdrawals();

    return () => {
      cancelled = true;
    };
  }, [firebaseUser, apiReady]);

  // LOAD REFERRAL STATS FROM D1 (when the Referral tab is opened)
  useEffect(() => {
    if (!firebaseUser || !apiReady) {
      setReferralStats(null);
      return;
    }

    if (activeTab !== 'referrals') return;

    let cancelled = false;

    const loadReferrals = async () => {
      setReferralLoading(true);
      setReferralError('');

      try {
        const data = await apiRequest('/api/referrals');

        if (cancelled) return;

        setReferralStats({ invited: Number(data.invited_count || 0) });

        if (data.ref_code) {
          setRefCode(data.ref_code);
        }
      } catch (error) {
        if (!cancelled) {
          setReferralError(error.message);
        }
      } finally {
        if (!cancelled) {
          setReferralLoading(false);
        }
      }
    };

    loadReferrals();

    return () => {
      cancelled = true;
    };
  }, [firebaseUser, apiReady, activeTab]);

  // LOAD ADMIN WITHDRAWALS FROM D1
  useEffect(() => {
    if (!firebaseUser || !apiReady || !isDemoAdmin) {
      setAdminWithdrawals([]);
      setAdminError('');
      return;
    }

    let cancelled = false;

    const loadAdminWithdrawals = async () => {
      setAdminLoading(true);
      setAdminError('');

      try {
        const data = await apiRequest('/api/admin/withdrawals');

        if (!cancelled) {
          setAdminWithdrawals(
            (data.withdrawals || []).map(mapWithdrawal)
          );
        }
      } catch (error) {
        if (!cancelled) {
          setAdminError(error.message);
        }
      } finally {
        if (!cancelled) {
          setAdminLoading(false);
        }
      }
    };

    loadAdminWithdrawals();

    return () => {
      cancelled = true;
    };
  }, [firebaseUser, apiReady, isDemoAdmin]);

  // ONE-SECOND TIMER: claim cooldown, UTC reset countdown, UTC day rollover
  useEffect(() => {
    const timer = setInterval(() => {
      setCooldownLeft(prev => (prev > 0 ? prev - 1 : 0));
      setResetSeconds(secondsUntilUtcReset());

      const today = utcDayKey();

      if (today !== lastUtcDayRef.current) {
        lastUtcDayRef.current = today;
        // New UTC day: re-sync so the daily counter shown matches the backend
        setAccountSyncTick(t => t + 1);
      }
    }, 1000);

    return () => clearInterval(timer);
  }, []);

  // CLEAR STATUS TIMER ON UNMOUNT
  useEffect(() => {
    return () => {
      if (claimStatusTimerRef.current) {
        clearTimeout(claimStatusTimerRef.current);
      }
    };
  }, []);

  // LOGIN
  const handleLogin = async (e) => {
    e.preventDefault();
    setAuthError('');
    setAuthSuccess('');
    setIsLoadingAuth(true);

    try {
      await signInWithEmailAndPassword(
        auth,
        emailInput.trim().toLowerCase(),
        passwordInput
      );

      setEmailInput('');
      setPasswordInput('');
    } catch (error) {
      setAuthError(error.message.replace('Firebase: ', ''));
    } finally {
      setIsLoadingAuth(false);
    }
  };

  // REGISTER
  const handleRegister = async (e) => {
    e.preventDefault();
    setAuthError('');
    setAuthSuccess('');

    const trimmedUsername = usernameInput.trim();
    const trimmedEmail = emailInput.trim().toLowerCase();
    const referralCode = regRefCode.trim().toUpperCase();

    if (!trimmedUsername || !trimmedEmail || !passwordInput) {
      setAuthError('Please fill in all required fields.');
      return;
    }

    if (passwordInput.length < 6) {
      setAuthError('Password must contain at least 6 characters.');
      return;
    }

    setIsLoadingAuth(true);

    // Validate the referral code with the Worker before creating the account
    if (referralCode) {
      if (!REF_CODE_REGEX.test(referralCode)) {
        setAuthError('Invalid referral code format.');
        setIsLoadingAuth(false);
        return;
      }

      try {
        const res = await fetch(
          `${API_URL}/api/referral/validate?code=${encodeURIComponent(referralCode)}`
        );
        const data = await res.json().catch(() => ({}));

        if (!res.ok || data.success === false) {
          throw new Error('Validation request failed');
        }

        if (!data.valid) {
          setAuthError('Referral code not found.');
          setIsLoadingAuth(false);
          return;
        }
      } catch {
        setAuthError(
          'Could not verify the referral code. Try again or leave it empty.'
        );
        setIsLoadingAuth(false);
        return;
      }
    }

    try {
      // Must be set before the account exists: the auth listener syncs immediately.
      pendingReferralRef.current = referralCode || null;

      const credential = await createUserWithEmailAndPassword(
        auth,
        trimmedEmail,
        passwordInput
      );

      const uid = credential.user.uid;

      const localProfile = {
        uid,
        username: trimmedUsername,
        email: trimmedEmail,
        referredBy: referralCode || null,
        createdAt: Date.now()
      };

      try {
        await setDoc(doc(dbStore, 'users', uid), localProfile);
      } catch (error) {
        console.warn('Firestore profile write unavailable:', error.message);
      }

      setUserProfile(localProfile);
      setAuthSuccess('Account created successfully!');
      setActiveTab('faucet');
      setUsernameInput('');
      setEmailInput('');
      setPasswordInput('');
      setRegRefCode('');
    } catch (error) {
      pendingReferralRef.current = null;
      setAuthError(error.message.replace('Firebase: ', ''));
    } finally {
      setIsLoadingAuth(false);
    }
  };

  // FORGOT PASSWORD
  const handleForgotPassword = async (e) => {
    e.preventDefault();
    setAuthError('');
    setAuthSuccess('');

    const trimmedEmail = emailInput.trim().toLowerCase();

    if (!trimmedEmail) {
      setAuthError('Please enter your email address.');
      return;
    }

    setIsLoadingAuth(true);

    try {
      await sendPasswordResetEmail(auth, trimmedEmail);
      setAuthSuccess('Password reset email sent. Check your inbox.');
    } catch (error) {
      setAuthError(error.message.replace('Firebase: ', ''));
    } finally {
      setIsLoadingAuth(false);
    }
  };

  // SIGN OUT
  const handleSignOut = async () => {
    try {
      await signOut(auth);
      setActiveTab('faucet');
    } catch (error) {
      console.error('Sign out error:', error);
    }
  };

  // Shows a claim message and clears it after 5 seconds (latest message wins)
  const showClaimMessage = (message, isError) => {
    if (claimStatusTimerRef.current) {
      clearTimeout(claimStatusTimerRef.current);
    }

    setClaimIsError(isError);
    setClaimStatus(message);

    claimStatusTimerRef.current = window.setTimeout(() => {
      setClaimStatus('');
    }, 5000);
  };

  // CLAIM (the Worker decides the reward, cooldown and daily limit)
  const handleClaim = async () => {
    if (claimInFlightRef.current || isClaiming) return;

    if (!firebaseUser || !apiReady) {
      showClaimMessage('Database is not ready. Please try again.', true);
      return;
    }

    if (!rulesReady) {
      showClaimMessage(
        'Claim information has not loaded yet. Please try again in a moment.',
        true
      );
      return;
    }

    if (cooldownLeft > 0 || dailyLimitReached) return;

    claimInFlightRef.current = true;
    setIsClaiming(true);
    setClaimIsError(false);

    if (claimStatusTimerRef.current) {
      clearTimeout(claimStatusTimerRef.current);
    }

    setClaimStatus('Processing claim...');

    try {
      const data = await apiRequest('/api/claim', {
        method: 'POST'
      });

      // Balance, cooldown (and plan / daily counters when reported) come from the Worker
      applyAccountData(data);

      setShowClaimEffect(true);

      window.setTimeout(() => {
        setShowClaimEffect(false);
      }, 2200);

      const reward = Number(data.amount_koinu) / KOINU;
      showClaimMessage(
        `Claim successful! +${reward.toFixed(6)} DOGE`,
        false
      );

      // Re-sync balance/limits and history. A refresh failure must not turn
      // a successful claim into an error.
      const [historyResult, accountResult] = await Promise.allSettled([
        apiRequest('/api/claims'),
        apiRequest('/api/balance')
      ]);

      if (historyResult.status === 'fulfilled') {
        setDemoClaims(historyResult.value.claims || []);
        setClaimsError('');
      } else {
        setClaimsError(
          historyResult.reason?.message || 'Could not refresh claim history.'
        );
      }

      if (accountResult.status === 'fulfilled') {
        applyAccountData(accountResult.value);
      }
    } catch (error) {
      const reason = error.data?.reason;

      if (error.status === 429 && reason === 'daily_limit') {
        // Updates plan, daily_claims_used, daily_limit and remaining (0)
        applyAccountData(error.data);
        showClaimMessage(
          'Daily claim limit reached. Your limit resets at 00:00 UTC.',
          true
        );
      } else if (error.status === 429) {
        // Cooldown (or any other 429): show the remaining time from the Worker
        applyAccountData(error.data);
        showClaimMessage(
          isNum(error.data?.cooldown_remaining)
            ? `Cooldown active. Please wait ${Math.max(0, Number(error.data.cooldown_remaining))}s before claiming again.`
            : error.message || 'Please wait before claiming again.',
          true
        );
      } else if (error.status === 503) {
        showClaimMessage(
          'The faucet reserve is currently unavailable. No reward was credited. Please try again later.',
          true
        );
      } else {
        showClaimMessage(error.message || 'Could not complete claim.', true);
      }
    } finally {
      claimInFlightRef.current = false;
      setIsClaiming(false);
    }
  };

  // USER WITHDRAWAL
  const handleWithdraw = async (e) => {
    e.preventDefault();
    setWithdrawMsg('');

    if (!firebaseUser || !apiReady) {
      setWithdrawMsg('Database is not ready. Please try again.');
      return;
    }

    const amount = Number(withdrawAmount);

    if (!Number.isFinite(amount) || amount < minWithdrawal) {
      setWithdrawMsg(
        `Minimum withdrawal is ${minWithdrawal.toFixed(1)} DEMO DOGE.`
      );
      return;
    }

    if (!withdrawAddress.trim()) {
      setWithdrawMsg('Please enter a wallet address.');
      return;
    }

    const amountKoinu = Math.round(amount * KOINU);

    if (!Number.isSafeInteger(amountKoinu)) {
      setWithdrawMsg('Invalid withdrawal amount.');
      return;
    }

    setIsWithdrawing(true);

    try {
      await apiRequest('/api/withdrawals', {
        method: 'POST',
        body: JSON.stringify({
          amount_koinu: amountKoinu,
          wallet_address: withdrawAddress.trim()
        })
      });

      const [balanceData, historyData] = await Promise.all([
        apiRequest('/api/balance'),
        apiRequest('/api/withdrawals')
      ]);

      // applyAccountData ignores a missing/invalid balance instead of
      // writing NaN into the balance state.
      applyAccountData(balanceData);
      setDemoWithdrawals(
        (historyData.withdrawals || []).map(mapWithdrawal)
      );

      setWithdrawAddress('');
      setWithdrawMsg(
        'Withdrawal request submitted successfully. DEMO ledger only.'
      );
    } catch (error) {
      setWithdrawMsg(error.message || 'Withdrawal request failed.');
    } finally {
      setIsWithdrawing(false);
    }
  };

  // REFRESH ADMIN WITHDRAWALS
  const refreshAdminWithdrawals = async () => {
    try {
      const data = await apiRequest('/api/admin/withdrawals');

      setAdminWithdrawals(
        (data.withdrawals || []).map(mapWithdrawal)
      );
    } catch (error) {
      setAdminError(error.message || 'Could not refresh withdrawals.');
    }
  };

  // ADMIN APPROVE
  const handleAdminApprove = async (wId) => {
    if (!isDemoAdmin || adminActionLoading !== null) return;

    setAdminActionLoading(wId);
    setAdminError('');

    try {
      await apiRequest(
        `/api/admin/withdrawals/${encodeURIComponent(wId)}/approve`,
        {
          method: 'POST'
        }
      );

      await refreshAdminWithdrawals();
    } catch (error) {
      setAdminError(error.message || 'Could not approve withdrawal.');
      await refreshAdminWithdrawals();
    } finally {
      setAdminActionLoading(null);
    }
  };

  // ADMIN REJECT
  const handleAdminReject = async (wId) => {
    if (!isDemoAdmin || adminActionLoading !== null) return;

    setAdminActionLoading(wId);
    setAdminError('');

    try {
      await apiRequest(
        `/api/admin/withdrawals/${encodeURIComponent(wId)}/reject`,
        {
          method: 'POST'
        }
      );

      await refreshAdminWithdrawals();

      // Refresh balance and withdrawal history if admin rejected own request.
      const [balanceData, historyData] = await Promise.all([
        apiRequest('/api/balance'),
        apiRequest('/api/withdrawals')
      ]);

      applyAccountData(balanceData);
      setDemoWithdrawals(
        (historyData.withdrawals || []).map(mapWithdrawal)
      );
    } catch (error) {
      setAdminError(error.message || 'Could not reject withdrawal.');
      await refreshAdminWithdrawals();
    } finally {
      setAdminActionLoading(null);
    }
  };

  // AUTH LOADING
  if (authLoading) {
    return (
      <div className="min-h-screen bg-black text-white flex items-center justify-center">
        Loading account...
      </div>
    );
  }

  // UNAUTHENTICATED VIEW
  if (!firebaseUser || !userProfile) {
    return (
      <div className="min-h-screen bg-black text-white flex flex-col items-center justify-center p-4 font-sans">
        <div className="w-full max-w-md bg-black border border-slate-800 rounded-2xl shadow-2xl p-8">

          <div className="flex items-center justify-center space-x-3 mb-6">
            <div className="bg-[#F4A6C1]/10 p-3 rounded-xl border border-[#F4A6C1]/20 text-[#F4A6C1]">
              <Shield className="w-8 h-8" />
            </div>

            <div>
              <div className="font-black leading-none tracking-tight text-white font-['Space_Grotesk',sans-serif] text-xl flex flex-col">
                <span>CLAIM</span>
                <span>
                  <span>DO</span>
                  <span className="text-[#F4A6C1]">GE</span>
                </span>
              </div>
              <p className="text-xs text-[#F4A6C1] font-mono mt-1">
                FIREBASE AUTH + SECURE DEMO
              </p>
            </div>
          </div>

          <div className="mb-4 p-3 bg-[#F4A6C1]/10 border border-[#F4A6C1]/20 text-[#F4A6C1] text-xs rounded-xl flex items-start space-x-2">
            <Info className="w-4 h-4 shrink-0 mt-0.5" />
            <span>
              Authentication is powered by Firebase. Faucet claims,
              balances and withdrawals use a simulated DEMO ledger.
              No real DOGE payments are sent.
            </span>
          </div>

          {authMode !== 'forgot' && (
            <div className="flex bg-black p-1 rounded-xl mb-6 border border-slate-800">
              <button
                type="button"
                onClick={() => {
                  setAuthMode('login');
                  setAuthError('');
                  setAuthSuccess('');
                }}
                className={`flex-1 py-2 text-sm font-bold rounded-lg transition-all font-['Space_Grotesk',sans-serif] ${
                  authMode === 'login'
                    ? 'bg-[#F4A6C1] text-black shadow-lg shadow-[#F4A6C1]/20'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                Sign In
              </button>

              <button
                type="button"
                onClick={() => {
                  setAuthMode('register');
                  setAuthError('');
                  setAuthSuccess('');
                }}
                className={`flex-1 py-2 text-sm font-bold rounded-lg transition-all font-['Space_Grotesk',sans-serif] ${
                  authMode === 'register'
                    ? 'bg-[#F4A6C1] text-black shadow-lg shadow-[#F4A6C1]/20'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                Create Account
              </button>
            </div>
          )}

          {authError && (
            <div className="mb-4 p-3 bg-red-500/10 border border-red-500/20 text-red-400 text-sm rounded-xl flex items-center space-x-2">
              <AlertTriangle className="w-4 h-4 shrink-0" />
              <span>{authError}</span>
            </div>
          )}

          {authSuccess && (
            <div className="mb-4 p-3 bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-sm rounded-xl flex items-center space-x-2">
              <CheckCircle className="w-4 h-4 shrink-0" />
              <span>{authSuccess}</span>
            </div>
          )}

          {authMode === 'login' && (
            <form onSubmit={handleLogin} className="space-y-4">
              <div>
                <label className={LABEL_CLS}>Email Address</label>
                <input
                  type="email"
                  required
                  value={emailInput}
                  onChange={(e) => setEmailInput(e.target.value)}
                  placeholder="name@example.com"
                  className={INPUT_CLS}
                />
              </div>

              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-400">
                    Password
                  </label>

                  <button
                    type="button"
                    onClick={() => {
                      setAuthMode('forgot');
                      setAuthError('');
                      setAuthSuccess('');
                    }}
                    className="text-xs text-[#F4A6C1] hover:text-[#e091ad] font-bold transition-colors"
                  >
                    Forgot Password?
                  </button>
                </div>

                <input
                  type="password"
                  required
                  value={passwordInput}
                  onChange={(e) => setPasswordInput(e.target.value)}
                  placeholder="••••••••"
                  className={INPUT_CLS}
                />
              </div>

              <button
                type="submit"
                disabled={isLoadingAuth}
                className={PRIMARY_BTN}
              >
                <span>
                  {isLoadingAuth
                    ? 'Signing In...'
                    : 'Sign In with Firebase'}
                </span>
              </button>
            </form>
          )}

          {authMode === 'register' && (
            <form onSubmit={handleRegister} className="space-y-4">
              <div>
                <label className={LABEL_CLS}>Username</label>
                <input
                  type="text"
                  required
                  value={usernameInput}
                  onChange={(e) => setUsernameInput(e.target.value)}
                  placeholder="YourUsername"
                  className={INPUT_CLS}
                />
              </div>

              <div>
                <label className={LABEL_CLS}>Email Address</label>
                <input
                  type="email"
                  required
                  value={emailInput}
                  onChange={(e) => setEmailInput(e.target.value)}
                  placeholder="name@example.com"
                  className={INPUT_CLS}
                />
              </div>

              <div>
                <label className={LABEL_CLS}>Password</label>
                <input
                  type="password"
                  required
                  value={passwordInput}
                  onChange={(e) => setPasswordInput(e.target.value)}
                  placeholder="At least 6 characters"
                  className={INPUT_CLS}
                />
              </div>

              <div>
                <label className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-1 flex items-center justify-between">
                  <span>Referral Code (Optional)</span>
                  <span className="text-[10px] text-[#F4A6C1] font-normal">
                    Demo Sponsor
                  </span>
                </label>

                <input
                  type="text"
                  value={regRefCode}
                  onChange={(e) => setRegRefCode(e.target.value)}
                  placeholder="e.g. DOGEA7K9QX"
                  className={`${INPUT_CLS} font-mono uppercase`}
                />
              </div>

              <button
                type="submit"
                disabled={isLoadingAuth}
                className={PRIMARY_BTN}
              >
                <UserPlus className="w-4 h-4" />
                <span>
                  {isLoadingAuth
                    ? 'Creating Account...'
                    : 'Create Firebase Account'}
                </span>
              </button>
            </form>
          )}

          {authMode === 'forgot' && (
            <div className="space-y-4">
              <div className="flex items-center space-x-2 mb-2 text-[#F4A6C1]">
                <KeyRound className="w-5 h-5" />
                <h2 className="text-base font-bold text-white font-['Space_Grotesk',sans-serif]">
                  Reset Password
                </h2>
              </div>

              <p className="text-xs text-slate-400">
                Enter your account email address and we will send you
                a secure password reset link via Firebase.
              </p>

              <form onSubmit={handleForgotPassword} className="space-y-4">
                <div>
                  <label className={LABEL_CLS}>Email Address</label>
                  <input
                    type="email"
                    required
                    value={emailInput}
                    onChange={(e) => setEmailInput(e.target.value)}
                    placeholder="name@example.com"
                    className={INPUT_CLS}
                  />
                </div>

                <button
                  type="submit"
                  disabled={isLoadingAuth}
                  className={PRIMARY_BTN}
                >
                  <span>
                    {isLoadingAuth ? 'Sending Link...' : 'Send Reset Link'}
                  </span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setAuthMode('login');
                    setAuthError('');
                    setAuthSuccess('');
                  }}
                  className="w-full bg-black hover:bg-slate-900 border border-slate-800 text-slate-300 font-bold py-3 rounded-xl transition-all flex items-center justify-center space-x-2 text-sm font-['Space_Grotesk',sans-serif]"
                >
                  <ArrowLeft className="w-4 h-4" />
                  <span>Return to Sign In</span>
                </button>
              </form>
            </div>
          )}
        </div>
      </div>
    );
  }

  // helper for sidebar buttons
  const tabBtnCls = (tab) =>
    `w-full flex items-center space-x-3 px-4 py-3 rounded-xl text-sm font-bold transition-all font-['Space_Grotesk',sans-serif] ${
      activeTab === tab
        ? 'bg-[#F4A6C1] text-black font-black shadow-lg shadow-[#F4A6C1]/20'
        : 'text-slate-400 hover:bg-slate-900 hover:text-white'
    }`;

  const adminAccentText = isBlueAdmin ? 'text-blue-400' : 'text-[#A78BFA]';
  const adminActionBtn = isBlueAdmin
    ? 'bg-blue-500/10 hover:bg-blue-500/20 border border-blue-500/30 text-blue-400'
    : 'bg-[#A78BFA]/10 hover:bg-[#A78BFA]/20 border border-[#A78BFA]/30 text-[#A78BFA]';

  // Plan helpers for the UI
  const activeCatalogEntry = planName
    ? PLAN_CATALOG.find(p => p.key === planName)
    : null;

  const canClaim =
    apiReady &&
    rulesReady &&
    !isClaiming &&
    cooldownLeft <= 0 &&
    !dailyLimitReached;

  const claimButtonLabel = isClaiming
    ? 'Processing Claim...'
    : !apiReady
      ? 'Connecting...'
      : !rulesReady
        ? 'Loading claim rules...'
        : dailyLimitReached
          ? 'Daily Limit Reached'
          : cooldownLeft > 0
            ? `Available in ${cooldownLeft}s`
            : `Claim ${claimAmount.toFixed(6)} DOGE (Demo)`;

  // LOGGED-IN DASHBOARD
  return (
    <div className="min-h-screen bg-black text-white flex flex-col font-sans">

      <style>{`
        .claim-celebration {
          position: absolute;
          inset: 0;
          z-index: 20;
          pointer-events: none;
          overflow: hidden;
          display: flex;
          align-items: center;
          justify-content: center;
          animation: celebrationFade 2.2s ease forwards;
        }

        .claim-glow {
          position: absolute;
          width: 220px;
          height: 220px;
          border-radius: 50%;
          background: #F4A6C1;
          filter: blur(75px);
          opacity: 0.45;
          animation: glowPulse 1s ease-in-out infinite alternate;
        }

        .claim-coin {
          position: absolute;
          color: #F4A6C1;
          font-size: 30px;
          font-weight: 900;
          text-shadow: 0 0 18px #F4A6C1;
          animation: coinFly 1.8s ease-out forwards;
        }

        .coin-1 { left: 15%; --x: -35px; }
        .coin-2 { left: 32%; --x: 20px; animation-delay: .1s; }
        .coin-3 { right: 25%; --x: -15px; animation-delay: .2s; }
        .coin-4 { right: 12%; --x: 35px; animation-delay: .05s; }
        .coin-5 { left: 50%; --x: 0px; animation-delay: .15s; }

        .claim-message {
          position: relative;
          color: white;
          font-size: 20px;
          font-weight: 900;
          letter-spacing: 2px;
          text-shadow: 0 0 15px #F4A6C1;
          animation: messagePop 1.5s ease forwards;
        }

        @keyframes coinFly {
          0% {
            transform: translate(var(--x), 100px) rotate(0deg) scale(.4);
            opacity: 0;
          }
          30% { opacity: 1; }
          100% {
            transform: translate(var(--x), -130px) rotate(360deg) scale(1.2);
            opacity: 0;
          }
        }

        @keyframes messagePop {
          0% { transform: scale(.5); opacity: 0; }
          25% { transform: scale(1.15); opacity: 1; }
          75% { transform: scale(1); opacity: 1; }
          100% { opacity: 0; }
        }

        @keyframes glowPulse {
          from { transform: scale(.7); opacity: .2; }
          to { transform: scale(1.3); opacity: .55; }
        }

        @keyframes celebrationFade {
          0%, 75% { opacity: 1; }
          100% { opacity: 0; }
        }
      `}</style>

      {/* HEADER */}
      <header className="bg-black border-b border-slate-800 sticky top-0 z-30">
        <div className="max-w-7xl mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="bg-[#F4A6C1]/10 p-2 rounded-xl border border-[#F4A6C1]/20 text-[#F4A6C1]">
              <Shield className="w-6 h-6" />
            </div>

            <div className="flex items-center space-x-3">
              <div className="font-black leading-none tracking-tight text-white font-['Space_Grotesk',sans-serif] text-base flex flex-col">
                <span>CLAIM</span>
                <span>
                  <span>DO</span>
                  <span className="text-[#F4A6C1]">GE</span>
                </span>
              </div>

              <span className="hidden sm:inline-block px-2 py-0.5 bg-[#F4A6C1]/10 border border-[#F4A6C1]/20 text-[#F4A6C1] text-[10px] font-mono rounded-md uppercase">
                SECURE DEMO TESTNET
              </span>
            </div>
          </div>

          <div className="flex items-center space-x-2 sm:space-x-4">
            <div className="bg-black border border-slate-800 px-3 sm:px-4 py-2 rounded-xl flex items-center space-x-2">
              <Wallet className="w-4 h-4 text-[#F4A6C1]" />
              <span className="text-sm font-black font-mono text-white">
                {demoBalance.toFixed(6)} DOGE
              </span>
              <span className="text-[10px] font-mono bg-[#F4A6C1]/10 text-[#F4A6C1] px-1.5 py-0.5 rounded border border-[#F4A6C1]/20">
                DEMO
              </span>
            </div>

            <button
              type="button"
              onClick={handleSignOut}
              className="p-2 bg-black hover:bg-slate-900 border border-slate-800 text-slate-400 hover:text-white rounded-xl transition-colors"
              title="Sign Out"
            >
              <LogOut className="w-5 h-5" />
            </button>
          </div>
        </div>
      </header>

      <div className="max-w-7xl mx-auto px-4 py-8 flex-1 w-full flex flex-col md:flex-row gap-8">

        {/* SIDEBAR */}
        <aside className="w-full md:w-64 space-y-2 shrink-0">
          <div className="bg-black border border-slate-800 rounded-2xl p-3 space-y-1">

            <button
              type="button"
              onClick={() => setActiveTab('faucet')}
              className={tabBtnCls('faucet')}
            >
              <RefreshCw className="w-4 h-4" />
              <span>Doge Faucet</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('plans')}
              className={tabBtnCls('plans')}
            >
              <Crown className="w-4 h-4" />
              <span>Plans</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('wallet')}
              className={tabBtnCls('wallet')}
            >
              <Wallet className="w-4 h-4" />
              <span>Wallet & Withdraw</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('referrals')}
              className={tabBtnCls('referrals')}
            >
              <Users className="w-4 h-4" />
              <span>Referral Program</span>
            </button>

            {isDemoAdmin && (
              <button
                type="button"
                onClick={() => setActiveTab('admin')}
                className={tabBtnCls('admin')}
              >
                <Shield className="w-4 h-4" />
                <span>Admin Dashboard</span>
              </button>
            )}
          </div>

          <div className="bg-black border border-slate-800 rounded-2xl p-4 text-xs space-y-2">
            <div className="flex justify-between text-slate-400">
              <span>Email:</span>
              <span className="text-white font-mono truncate max-w-[130px]">
                {firebaseUser.email}
              </span>
            </div>

            <div className="flex justify-between text-slate-400">
              <span>Auth Status:</span>
              <span className="text-emerald-400 font-mono font-bold">
                Authenticated
              </span>
            </div>

            <div className="flex justify-between text-slate-400">
              <span>Plan:</span>
              <span className={`font-mono font-bold ${activeCatalogEntry ? activeCatalogEntry.accentText : 'text-slate-500'}`}>
                {planName || (accountLoaded ? 'N/A' : '...')}
              </span>
            </div>

            <div className="flex justify-between text-slate-400">
              <span>Ref Code:</span>
              <span className="text-[#F4A6C1] font-mono font-bold">
                {refCode || '...'}
              </span>
            </div>
          </div>
        </aside>

        {/* MAIN CONTENT */}
        <main className="flex-1 min-w-0">

          {apiError && (
            <div className="mb-6 p-4 bg-red-500/10 border border-red-500/30 rounded-xl text-red-400 text-sm flex items-start gap-2">
              <AlertTriangle className="w-5 h-5 shrink-0" />
              <div>
                <span>{apiError}</span>
                <button
                  type="button"
                  onClick={() => setAuthSyncRetry(value => value + 1)}
                  className="mt-3 px-4 py-2 rounded-lg bg-red-500/10 border border-red-500/30 text-red-400 font-bold text-xs block"
                >
                  Retry Database Connection
                </button>
              </div>
            </div>
          )}

          {/* TOP ADVERTISEMENT */}
          <div className="mb-6 w-full">
            <div className="relative w-full min-h-[100px] md:min-h-[120px] bg-black border border-slate-800 rounded-2xl flex flex-col items-center justify-center text-center p-4 overflow-hidden">
              <span className="absolute top-2 right-3 text-[9px] uppercase tracking-widest text-slate-600 font-mono">
                Advertisement
              </span>

              <p className="text-sm md:text-base font-bold text-white">
                Advertise Your Brand on DogeDrip
              </p>

              <p className="text-xs text-slate-500 mt-1">
                Reach crypto users and promote your project here.
              </p>
            </div>
          </div>

          {/* FAUCET */}
          {activeTab === 'faucet' && (
            <div className="bg-black border border-slate-800 rounded-2xl p-6 md:p-8 space-y-6">

              <div>
                <h2 className="text-xl font-black text-white mb-1 font-['Space_Grotesk',sans-serif]">
                  Crypto Faucet Claim (DEMO)
                </h2>
                <p className="text-sm text-slate-400">
                  {rulesReady
                    ? `${planName ? `Your ${planName} plan earns` : 'You earn'} a simulated testnet reward of ${claimAmount.toFixed(6)} DOGE per claim${
                        cooldownSeconds === 0
                          ? ' with no cooldown.'
                          : ` every ${cooldownSeconds} seconds.`
                      }`
                    : 'Loading claim rules...'}
                </p>
              </div>

              {accountError && !rulesReady && (
                <div className="p-3 bg-red-500/10 border border-red-500/20 text-red-400 rounded-xl text-sm flex items-start gap-2">
                  <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                  <span>
                    Could not load your claim information: {accountError}.
                    Claiming is disabled until it loads. Switch tabs or reload to retry.
                  </span>
                </div>
              )}

              {/* PLAN + LIMIT OVERVIEW (all values come from the Worker) */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <StatTile
                  label="Active Plan"
                  value={planName || (accountLoaded ? 'Not reported' : '...')}
                  sub={accountLoaded && !planName ? 'Server did not send a plan' : undefined}
                  valueCls={activeCatalogEntry ? activeCatalogEntry.accentText : 'text-white'}
                />
                <StatTile
                  label="Reward / Claim"
                  value={claimAmount !== null ? `${claimAmount.toFixed(6)}` : '...'}
                  sub="DOGE (demo)"
                />
                <StatTile
                  label="Cooldown"
                  value={formatCooldown(cooldownSeconds)}
                />
                <StatTile
                  label="Balance"
                  value={`${demoBalance.toFixed(6)}`}
                  sub="DOGE (demo)"
                />
                <StatTile
                  label="Claims Used Today"
                  value={dailyUsed !== null ? dailyUsed : (accountLoaded ? 'N/A' : '...')}
                  sub={accountLoaded && dailyUsed === null ? 'Not reported by server' : undefined}
                />
                <StatTile
                  label="Daily Limit"
                  value={dailyLimit !== null ? dailyLimit : (accountLoaded ? 'N/A' : '...')}
                  sub={accountLoaded && dailyLimit === null ? 'Not reported by server' : undefined}
                />
               
                <StatTile
                  label="Daily Reset (UTC)"
                  value={formatDuration(resetSeconds)}
                  sub="Resets at 00:00 UTC"
                />
              </div>

              <div className="relative overflow-hidden bg-black border border-slate-800 rounded-2xl p-8 flex flex-col items-center justify-center text-center space-y-6">

                {showClaimEffect && (
                  <div className="claim-celebration" aria-hidden="true">
                    <div className="claim-glow" />
                    <span className="claim-coin coin-1">+$</span>
                    <span className="claim-coin coin-2">Ð</span>
                    <span className="claim-coin coin-3">+$</span>
                    <span className="claim-coin coin-4">Ð</span>
                    <span className="claim-coin coin-5">+$</span>
                    <div className="claim-message">REWARD CLAIMED!</div>
                  </div>
                )}

                <div className="bg-[#F4A6C1]/10 p-4 rounded-2xl border border-[#F4A6C1]/20 text-[#F4A6C1]">
                  <Award className="w-10 h-10" />
                </div>

                <div>
                  <span className="text-xs uppercase tracking-widest text-slate-500 font-mono font-bold">
                    Simulated Testnet Reward
                  </span>
                  <div className="text-3xl font-black font-mono text-white mt-1">
                    {claimAmount !== null ? `${claimAmount.toFixed(6)} DOGE` : '...'}
                  </div>
                  <span className="inline-block mt-2 px-2 py-0.5 bg-[#F4A6C1]/10 text-[#F4A6C1] text-[10px] font-mono rounded border border-[#F4A6C1]/20 uppercase font-bold">
                    DEMO BALANCES ONLY
                  </span>
                </div>

                {/* DAILY LIMIT REACHED */}
                {dailyLimitReached && (
                  <div className="w-full max-w-sm bg-red-500/10 border border-red-500/20 p-4 rounded-xl space-y-1">
                    <div className="flex items-center justify-center space-x-2 text-red-400 text-sm font-bold">
                      <AlertTriangle className="w-4 h-4" />
                      <span>Daily claim limit reached</span>
                    </div>
                    <p className="text-xs text-slate-400">
                      {dailyUsed !== null && dailyLimit !== null
                        ? `You used ${dailyUsed} of ${dailyLimit} claims today. `
                        : ''}
                      Claiming is available again in {formatDuration(resetSeconds)} (00:00 UTC).
                    </p>
                  </div>
                )}

                {/* COOLDOWN (only shown when the Worker reports remaining time) */}
                {!dailyLimitReached && cooldownLeft > 0 && (
                  <div className="w-full max-w-sm bg-black border border-slate-800 p-4 rounded-xl space-y-2">
                    <div className="flex items-center justify-center space-x-2 text-[#F4A6C1] text-sm font-bold">
                      <Clock className="w-4 h-4 animate-spin" />
                      <span>
                        Cooldown Active: {cooldownLeft}s remaining
                      </span>
                    </div>

                    <div className="w-full bg-black h-2 rounded-full overflow-hidden border border-slate-800">
                      <div
                        className="bg-[#F4A6C1] h-full transition-all duration-1000"
                        style={{
                          width: `${
                            cooldownSeconds && cooldownSeconds > 0
                              ? Math.min(100, (cooldownLeft / cooldownSeconds) * 100)
                              : 0
                          }%`
                        }}
                      />
                    </div>
                  </div>
                )}

                <button
                  type="button"
                  onClick={handleClaim}
                  disabled={!canClaim}
                  className="w-full max-w-sm bg-[#F4A6C1] hover:bg-[#e091ad] disabled:opacity-50 disabled:cursor-not-allowed text-black font-black py-4 rounded-xl transition-all shadow-lg shadow-[#F4A6C1]/20 flex items-center justify-center space-x-2 text-base font-['Space_Grotesk',sans-serif] tracking-wide"
                >
                  {isClaiming
                    ? <RefreshCw className="w-5 h-5 animate-spin" />
                    : <CheckCircle className="w-5 h-5" />
                  }

                  <span>{claimButtonLabel}</span>
                </button>

                {claimStatus && (
                  <p className={`text-sm font-bold font-['Space_Grotesk',sans-serif] ${
                    claimIsError ? 'text-red-400' : 'text-emerald-400'
                  }`}>
                    {claimStatus}
                  </p>
                )}
              </div>

              {/* CLAIM HISTORY */}
              <div className="bg-black border border-slate-800 rounded-2xl p-6 space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-black uppercase tracking-wider text-slate-300">
                    Claim History
                  </h3>
                  <span className="text-xs text-[#F4A6C1] font-mono">
                    Last 50 claims
                  </span>
                </div>

                {claimsLoading ? (
                  <p className="text-sm text-slate-400 text-center py-6">
                    Loading claim history...
                  </p>
                ) : claimsError ? (
                  <p className="text-sm text-red-400 text-center py-6">
                    {claimsError}
                  </p>
                ) : demoClaims.length === 0 ? (
                  <p className="text-sm text-slate-500 text-center py-6">
                    No claims found yet.
                  </p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs">
                      <thead className="text-slate-400 uppercase border-b border-slate-800">
                        <tr>
                          <th className="py-3 pr-4">ID</th>
                          <th className="py-3 pr-4">Reward</th>
                          <th className="py-3">Date</th>
                        </tr>
                      </thead>

                      <tbody className="divide-y divide-slate-800/60">
                        {demoClaims.map(claim => (
                          <tr key={claim.id}>
                            <td className="py-3 pr-4 text-slate-500">
                              #{claim.id}
                            </td>
                            <td className="py-3 pr-4 text-emerald-400 font-bold">
                              +{(
                                Number(claim.amount_koinu) / KOINU
                              ).toFixed(6)} DOGE
                            </td>
                            <td className="py-3 text-slate-400">
                              {formatDate(claim.claimed_at)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
          )}

        
          {/* PLANS */}
          {activeTab === 'plans' && (
            <div className="bg-black border border-slate-800 rounded-2xl p-6 md:p-8 space-y-6">

              <div>
                <h2 className="text-xl font-black text-white mb-1 font-['Space_Grotesk',sans-serif]">
                  Plans
                </h2>
                <p className="text-sm text-slate-400">
                  Compare the three DogeDrip plans. Your active plan is determined by the server.
                </p>
              </div>

              {accountError && !accountLoaded && (
                <div className="p-3 bg-red-500/10 border border-red-500/20 text-red-400 rounded-xl text-sm flex items-start gap-2">
                  <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                  <span>
                    Could not load your current plan: {accountError}
                  </span>
                </div>
              )}

              {accountLoaded && !planName && (
                <div className="p-3 bg-yellow-500/10 border border-yellow-500/20 text-yellow-400 rounded-xl text-sm flex items-start gap-2">
                  <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                  <span>
                    The server did not report an active plan, so no plan is marked as current.
                    Your claims still use the reward and cooldown returned by the server.
                  </span>
                </div>
              )}

              <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                {PLAN_CATALOG.map(p => {
                  const isActive = planName !== null && planName === p.key;
                  const Icon = p.icon;

                  // Active plan: show what the Worker reported. Other plans: catalog (display only).
                  const reward =
                    isActive && claimAmount !== null
                      ? claimAmount
                      : p.amountKoinu / KOINU;
                  const cooldown =
                    isActive && cooldownSeconds !== null
                      ? cooldownSeconds
                      : p.cooldownSeconds;
                  const limit =
                    isActive && dailyLimit !== null
                      ? dailyLimit
                      : p.dailyLimit;

                  let claimsTodayText = '—';

                  if (isActive) {
                    claimsTodayText =
                      dailyUsed !== null && dailyRemaining !== null
                        ? `${dailyUsed} used · ${dailyRemaining} left`
                        : 'Not reported';
                  }

                  let statusText = 'Not active';

                  if (isActive) {
                    statusText = 'Active';
                  } else if (accountLoaded && !planName) {
                    statusText = 'Unknown';
                  } else if (p.key === 'FREE') {
                    statusText = 'Included';
                  }

                  return (
                    <div
                      key={p.key}
                      className={`relative flex flex-col bg-black rounded-2xl p-6 border-2 transition-all ${
                        isActive ? p.activeCardCls : p.cardCls
                      }`}
                    >
                      <div className="flex items-start justify-between mb-4">
                        <div className={`p-3 rounded-xl ${p.iconWrapCls}`}>
                          <Icon className="w-6 h-6" />
                        </div>

                        <div className="flex flex-col items-end gap-2">
                          {p.key === 'PREMIUM' && (
                            <span className="px-2 py-1 rounded-md text-[10px] font-black uppercase tracking-wider bg-[#F4A6C1]/10 text-[#F4A6C1] border border-[#F4A6C1]/30">
                              Most Popular
                            </span>
                          )}

                          {p.key === 'VIP' && (
                            <span className="px-2 py-1 rounded-md text-[10px] font-black uppercase tracking-wider bg-yellow-500/10 text-yellow-400 border border-yellow-500/30">
                              Maximum Rewards
                            </span>
                          )}

                          {isActive ? (
                            <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-md text-[10px] font-black uppercase font-mono ${p.badgeCls}`}>
                              <CheckCircle className="w-3 h-3" />
                              Current Plan
                            </span>
                          ) : !accountLoaded ? (
                            <span className="px-2 py-1 rounded-md text-[10px] font-mono uppercase text-slate-500 border border-slate-800">
                              Checking...
                            </span>
                          ) : null}
                        </div>
                      </div>

                      <h3 className={`text-lg font-black uppercase tracking-wider font-['Space_Grotesk',sans-serif] ${p.accentText}`}>
                        {p.label}
                      </h3>

                      <div className="mt-2 mb-5">
                        <span className="text-3xl font-black font-mono text-white">
                          {p.price}
                        </span>
                        <span className="text-xs text-slate-500 ml-2">
                          {p.priceNote}
                        </span>
                      </div>

                      <ul className="space-y-3 text-sm flex-1">
                        <li className="flex items-center justify-between border-b border-slate-800/60 pb-2">
                          <span className="text-slate-400">Reward per claim</span>
                          <span className="font-mono font-black text-white">
                            {reward.toFixed(6)} DOGE
                          </span>
                        </li>
                        <li className="flex items-center justify-between border-b border-slate-800/60 pb-2">
                          <span className="text-slate-400">Cooldown</span>
                          <span className="font-mono font-black text-white">
                            {cooldown === 0 ? 'None' : `${cooldown}s`}
                          </span>
                        </li>
                        <li className="flex items-center justify-between border-b border-slate-800/60 pb-2">
                          <span className="text-slate-400">Daily claim limit</span>
                          <span className="font-mono font-black text-white">
                            {limit}
                          </span>
                        </li>
                        <li className="flex items-center justify-between border-b border-slate-800/60 pb-2">
                          <span className="text-slate-400">Claims today</span>
                          <span className="font-mono font-black text-white">
                            {claimsTodayText}
                          </span>
                        </li>
                        <li className="flex items-center justify-between pb-1">
                          <span className="text-slate-400">Status</span>
                          <span className={`font-mono font-black ${isActive ? p.accentText : 'text-slate-500'}`}>
                            {statusText}
                          </span>
                        </li>
                      </ul>

                      {/* PLAN BENEFITS */}
                      {Array.isArray(p.features) && p.features.length > 0 && (
                        <div className="mt-6 pt-5 border-t border-slate-800/70">
                          <h4 className="text-xs font-black uppercase tracking-wider text-slate-400 mb-4">
                            What's Included
                          </h4>

                          <ul className="space-y-3">
                            {p.features.map((feature, index) => (
                              <li
                                key={`${p.key}-${index}`}
                                className="flex items-start gap-2 text-sm text-slate-300"
                              >
                                <CheckCircle className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                                <span>{feature}</span>
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}

                      <div className="mt-6">
                        {p.key === 'FREE' ? (
                          <div className="w-full text-center py-3 rounded-xl border border-slate-800 text-xs font-bold text-slate-400 font-['Space_Grotesk',sans-serif]">
                            {isActive ? 'Your current plan' : 'Free for everyone'}
                          </div>
                        ) : isActive ? (
                          <div className={`w-full text-center py-3 rounded-xl text-xs font-black font-['Space_Grotesk',sans-serif] ${p.badgeCls}`}>
                            Your current plan
                          </div>
                        ) : (
                          <button
                            type="button"
                            disabled
                            aria-disabled="true"
                            className="w-full bg-slate-900 border border-slate-800 text-slate-500 font-black py-3 rounded-xl cursor-not-allowed flex items-center justify-center space-x-2 text-sm font-['Space_Grotesk',sans-serif] tracking-wide"
                          >
                            <Lock className="w-4 h-4" />
                            <span>Coming Soon</span>
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>

              <div className="p-4 bg-[#F4A6C1]/10 border border-[#F4A6C1]/20 text-[#F4A6C1] text-xs rounded-xl flex items-start space-x-2">
                <Info className="w-4 h-4 shrink-0 mt-0.5" />
                <span>
                  Payment processing is not available yet, so Premium and VIP cannot be
                  purchased right now. Your plan is set and verified by the server; it
                  cannot be changed from this page. Daily claim limits reset at 00:00 UTC.
                </span>
              </div>
            </div>
          )}

          {/* WALLET */}
          {activeTab === 'wallet' && (
            <div className="bg-black border border-slate-800 rounded-2xl p-6 md:p-8 space-y-6">

              <div>
                <h2 className="text-xl font-black text-white mb-1 font-['Space_Grotesk',sans-serif]">
                  Wallet & Withdrawals (DEMO)
                </h2>
                <p className="text-sm text-slate-400">
                  Minimum withdrawal is {minWithdrawal.toFixed(1)} DEMO DOGE. Withdrawals are
                  recorded as requests in the internal DEMO ledger. No real payments or blockchain
                  transactions are sent.
                </p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">

                <div className="bg-black border border-slate-800 rounded-2xl p-6 flex flex-col justify-between">
                  <div>
                    <span className="text-xs uppercase tracking-wider text-slate-500 font-mono font-bold">
                      Available Demo Balance
                    </span>
                    <div className="text-3xl font-black font-mono text-white mt-2">
                      {demoBalance.toFixed(6)} DOGE
                    </div>
                  </div>

                  <div className="mt-6 pt-6 border-t border-slate-800 text-xs text-slate-400 flex justify-between font-bold">
                    <span>Minimum Testnet Payout:</span>
                    <span className="text-white font-mono font-black">
                      {minWithdrawal.toFixed(1)} DOGE
                    </span>
                  </div>
                </div>

                <form
                  onSubmit={handleWithdraw}
                  className="bg-black border border-slate-800 rounded-2xl p-6 space-y-4"
                >
                  <h3 className="text-sm font-black uppercase tracking-wider text-slate-300 font-['Space_Grotesk',sans-serif]">
                    Request Simulated Payout
                  </h3>

                  <div>
                    <label className={LABEL_CLS}>Amount (DOGE)</label>
                    <input
                      type="number"
                      step="0.001"
                      min={minWithdrawal}
                      required
                      value={withdrawAmount}
                      onChange={(e) => setWithdrawAmount(e.target.value)}
                      className={`${INPUT_CLS} font-mono font-bold`}
                    />
                  </div>

                  <div>
                    <label className={LABEL_CLS}>Dogecoin Wallet Address</label>
                    <input
                      type="text"
                      required
                      value={withdrawAddress}
                      onChange={(e) => setWithdrawAddress(e.target.value)}
                      placeholder="D..."
                      className={`${INPUT_CLS} font-mono font-bold`}
                    />
                  </div>

                  <button
                    type="submit"
                    disabled={isWithdrawing || !apiReady}
                    className="w-full bg-[#F4A6C1] hover:bg-[#e091ad] disabled:opacity-50 text-black font-black py-3 rounded-xl transition-all shadow-lg shadow-[#F4A6C1]/20 text-sm font-['Space_Grotesk',sans-serif] tracking-wide"
                  >
                    {isWithdrawing
                      ? 'Submitting...'
                      : 'Submit Simulated Withdrawal'}
                  </button>

                  {withdrawMsg && (
                    <p className="text-xs font-bold text-[#F4A6C1]">
                      {withdrawMsg}
                    </p>
                  )}
                </form>
              </div>

              {/* USER WITHDRAWAL HISTORY */}
              <div className="mt-8">
                <h3 className="text-sm font-black uppercase tracking-wider text-slate-300 mb-4 font-['Space_Grotesk',sans-serif]">
                  Withdrawal History
                </h3>

                <div className="bg-black border border-slate-800 rounded-2xl overflow-hidden">
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-sm">
                      <thead className="bg-black text-slate-400 text-xs uppercase font-mono border-b border-slate-800 font-bold">
                        <tr>
                          <th className="p-4">Amount</th>
                          <th className="p-4">Address</th>
                          <th className="p-4">Status</th>
                          <th className="p-4">Date</th>
                        </tr>
                      </thead>

                      <tbody className="divide-y divide-slate-800/60 font-mono text-xs font-bold">
                        {demoWithdrawals.length === 0 ? (
                          <tr>
                            <td colSpan="4" className="p-6 text-center text-slate-500">
                              No withdrawals found.
                            </td>
                          </tr>
                        ) : (
                          demoWithdrawals.map(w => (
                            <tr key={w.id}>
                              <td className="p-4 text-white font-black">
                                {w.amount.toFixed(6)} DOGE
                              </td>
                              <td className="p-4 text-slate-400 truncate max-w-[150px]">
                                {w.address}
                              </td>
                              <td className="p-4">
                                <span className={`px-2 py-1 rounded-md text-[10px] uppercase font-black ${
                                  w.status === 'approved'
                                    ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                                    : w.status === 'rejected'
                                      ? 'bg-red-500/10 text-red-400 border border-red-500/20'
                                      : 'bg-[#F4A6C1]/10 text-[#F4A6C1] border border-[#F4A6C1]/20'
                                }`}>
                                  {w.status}
                                </span>
                              </td>
                              <td className="p-4 text-slate-500">
                                {formatDate(w.timestamp)}
                              </td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* REFERRALS */}
          {activeTab === 'referrals' && (
            <div className="bg-black border border-slate-800 rounded-2xl p-6 md:p-8 space-y-6">

              <div>
                <h2 className="text-xl font-black text-white mb-1 font-['Space_Grotesk',sans-serif]">
                  Referral Program (DEMO)
                </h2>
                <p className="text-sm text-slate-400">
                  Share your referral code. Invited users are counted from real registrations.
                </p>
              </div>

              {referralError && (
                <div className="p-3 bg-red-500/10 border border-red-500/20 text-red-400 rounded-xl text-sm flex items-start gap-2">
                  <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                  <span>{referralError}</span>
                </div>
              )}

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">

                <div className="bg-black border border-slate-800 rounded-2xl p-5">
                  <span className="text-xs uppercase tracking-wider text-slate-500 font-mono font-bold">
                    Your Referral Code
                  </span>
                  <div className="text-2xl font-black font-mono text-[#F4A6C1] mt-1">
                    {refCode || '...'}
                  </div>
                </div>

                <div className="bg-black border border-slate-800 rounded-2xl p-5">
                  <span className="text-xs uppercase tracking-wider text-slate-500 font-mono font-bold">
                    Invited Users
                  </span>
                  <div className="text-2xl font-black font-mono text-white mt-1">
                    {referralLoading
                      ? '...'
                      : referralStats
                        ? referralStats.invited
                        : '-'}
                  </div>
                </div>

                <div className="bg-black border border-slate-800 rounded-2xl p-5">
                  <span className="text-xs uppercase tracking-wider text-slate-500 font-mono font-bold">
                    Commission
                  </span>
                  <div className="text-2xl font-black font-mono text-slate-500 mt-1">
                    Not enabled
                  </div>
                </div>
              </div>

              <div className="bg-black border border-slate-800 rounded-2xl p-6 space-y-4">
                <h3 className="text-sm font-black uppercase tracking-wider text-slate-300 font-['Space_Grotesk',sans-serif]">
                  How Referrals Work
                </h3>

                <ul className="text-sm text-slate-400 space-y-2 list-disc list-inside font-medium">
                  <li>
                    Share your code{' '}
                    <strong className="text-[#F4A6C1] font-mono font-black">
                      {refCode || '...'}
                    </strong>{' '}
                    with others.
                  </li>
                  <li>
                    Each new account that registers with your code counts as one invited user.
                  </li>
                  <li>
                    Referral commissions are not enabled yet.
                  </li>
                </ul>
              </div>
            </div>
          )}

          {/* ADMIN DASHBOARD */}
          {activeTab === 'admin' && isDemoAdmin && (
            <div className="bg-black border border-slate-800 rounded-2xl p-6 md:p-8 space-y-6">

              <div>
                <h2 className="text-xl font-black text-white mb-1 font-['Space_Grotesk',sans-serif]">
                  Admin Dashboard
                </h2>

                {isBlueAdmin && (
                  <p className="text-blue-400 text-sm font-bold mt-2">
                    I love you
                  </p>
                )}

                <p className="text-sm text-slate-400 mt-2">
                  Manage and review withdrawal requests stored in the D1 database.
                </p>
              </div>

              <div className={`p-3 rounded-xl flex items-start space-x-2 text-xs border ${
                isBlueAdmin
                  ? 'bg-blue-500/10 border-blue-500/20 text-blue-400'
                  : 'bg-[#A78BFA]/10 border-[#A78BFA]/20 text-[#A78BFA]'
              }`}>
                <Lock className="w-4 h-4 shrink-0 mt-0.5" />
                <span>
                  Admin actions are verified by the Worker using the
                  authenticated Firebase account and the admin role stored
                  in D1. Frontend email checks only control dashboard visibility.
                </span>
              </div>

              {!apiReady && (
                <div className="p-3 bg-red-500/10 border border-red-500/20 text-red-400 rounded-xl text-sm">
                  Database connection is not ready.
                </div>
              )}

              {adminError && (
                <div className="p-3 bg-red-500/10 border border-red-500/20 text-red-400 rounded-xl text-sm flex items-start gap-2">
                  <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                  <span>{adminError}</span>
                </div>
              )}

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">

                <div className="bg-black border border-slate-800 rounded-2xl p-5">
                  <span className="text-xs uppercase tracking-wider text-slate-500 font-mono font-bold">
                    Total Pending
                  </span>
                  <div className={`text-2xl font-black font-mono mt-1 ${adminAccentText}`}>
                    {adminWithdrawals.filter(w => w.status === 'pending').length}
                  </div>
                </div>

                <div className="bg-black border border-slate-800 rounded-2xl p-5">
                  <span className="text-xs uppercase tracking-wider text-slate-500 font-mono font-bold">
                    Total Requests
                  </span>
                  <div className="text-2xl font-black font-mono text-white mt-1">
                    {adminWithdrawals.length}
                  </div>
                </div>

                <div className="bg-black border border-slate-800 rounded-2xl p-5">
                  <span className="text-xs uppercase tracking-wider text-slate-500 font-mono font-bold">
                    Environment
                  </span>
                  <div className="text-2xl font-black font-mono text-emerald-400 mt-1">
                    D1 DEMO
                  </div>
                </div>
              </div>

              <div className="flex items-center justify-between">
                <h3 className="text-sm font-black uppercase tracking-wider text-slate-300 font-['Space_Grotesk',sans-serif]">
                  Withdrawal Requests
                </h3>

                <button
                  type="button"
                  disabled={adminLoading || !apiReady}
                  onClick={refreshAdminWithdrawals}
                  className={`px-3 py-2 rounded-lg border text-xs font-bold flex items-center gap-2 disabled:opacity-50 ${
                    isBlueAdmin
                      ? 'border-blue-500/30 text-blue-400 hover:bg-blue-500/10'
                      : 'border-[#A78BFA]/30 text-[#A78BFA] hover:bg-[#A78BFA]/10'
                  }`}
                >
                  <RefreshCw className={`w-3 h-3 ${adminLoading ? 'animate-spin' : ''}`} />
                  Refresh
                </button>
              </div>

              <div className="bg-black border border-slate-800 rounded-2xl overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-sm">
                    <thead className="bg-black text-slate-400 text-xs uppercase font-mono border-b border-slate-800 font-bold">
                      <tr>
                        <th className="p-4">User</th>
                        <th className="p-4">Amount</th>
                        <th className="p-4">Address</th>
                        <th className="p-4">Status</th>
                        <th className="p-4">Actions</th>
                      </tr>
                    </thead>

                    <tbody className="divide-y divide-slate-800/60 font-mono text-xs font-bold">

                      {adminLoading ? (
                        <tr>
                          <td colSpan="5" className="p-6 text-center text-slate-400">
                            Loading withdrawals...
                          </td>
                        </tr>
                      ) : adminWithdrawals.length === 0 ? (
                        <tr>
                          <td colSpan="5" className="p-6 text-center text-slate-500">
                            No withdrawal requests found.
                          </td>
                        </tr>
                      ) : (
                        adminWithdrawals.map(w => (
                          <tr key={w.id}>
                            <td className="p-4 text-white">
                              {w.email || w.userId || 'Unknown User'}
                            </td>

                            <td className={`p-4 font-black ${adminAccentText}`}>
                              {w.amount.toFixed(6)} DOGE
                            </td>

                            <td className="p-4 text-slate-400 truncate max-w-[140px]">
                              {w.address}
                            </td>

                            <td className="p-4">
                              <span className={`px-2 py-1 rounded-md text-[10px] uppercase font-black ${
                                w.status === 'approved'
                                  ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                                  : w.status === 'rejected'
                                    ? 'bg-red-500/10 text-red-400 border border-red-500/20'
                                    : 'bg-yellow-500/10 text-yellow-400 border border-yellow-500/20'
                              }`}>
                                {w.status}
                              </span>
                            </td>

                            <td className="p-4">
                              {w.status === 'pending' ? (
                                <div className="flex flex-wrap gap-2">

                                  <button
                                    type="button"
                                    disabled={adminActionLoading !== null}
                                    onClick={() => handleAdminApprove(w.id)}
                                    className={`px-3 py-1 rounded-lg font-black transition-colors disabled:opacity-40 ${adminActionBtn}`}
                                  >
                                    {adminActionLoading === w.id ? '...' : 'Approve'}
                                  </button>

                                  <button
                                    type="button"
                                    disabled={adminActionLoading !== null}
                                    onClick={() => handleAdminReject(w.id)}
                                    className={`px-3 py-1 rounded-lg font-black transition-colors disabled:opacity-40 ${adminActionBtn}`}
                                  >
                                    {adminActionLoading === w.id ? '...' : 'Reject'}
                                  </button>

                                </div>
                              ) : (
                                <span className="text-slate-500">
                                  Completed
                                </span>
                              )}
                            </td>
                          </tr>
                        ))
                      )}

                    </tbody>
                  </table>
                </div>
              </div>

              <p className="text-xs text-slate-500">
                Approving or rejecting updates the D1 demo ledger.
                Rejected requests are refunded by the Worker.
                No cryptocurrency transaction is broadcast.
              </p>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}

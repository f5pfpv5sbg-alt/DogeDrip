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
  ArrowLeft
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

const INPUT_CLS =
  "w-full bg-black border border-slate-800 rounded-xl px-4 py-3 text-sm text-white placeholder-slate-600 focus:outline-none focus:border-[#F4A6C1] focus:ring-1 focus:ring-[#F4A6C1] transition-colors";

const PRIMARY_BTN =
  "w-full bg-[#F4A6C1] hover:bg-[#e091ad] disabled:opacity-50 text-black font-black py-3 rounded-xl transition-all shadow-lg shadow-[#F4A6C1]/20 flex items-center justify-center space-x-2 font-['Space_Grotesk',sans-serif] tracking-wide";

const LABEL_CLS =
  "block text-xs font-bold uppercase tracking-wider text-slate-400 mb-1";

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

  // AUTH FORM
  const [usernameInput, setUsernameInput] = useState('');
  const [emailInput, setEmailInput] = useState('');
  const [passwordInput, setPasswordInput] = useState('');
  const [regRefCode, setRegRefCode] = useState('');
  const [authError, setAuthError] = useState('');
  const [authSuccess, setAuthSuccess] = useState('');
  const [isLoadingAuth, setIsLoadingAuth] = useState(false);

  // SETTINGS FROM WORKER (with safe defaults)
  const [cooldownSeconds, setCooldownSeconds] = useState(45);
  const [claimAmount, setClaimAmount] = useState(0.001);
  const [minWithdrawal, setMinWithdrawal] = useState(1);

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
      if (!isMounted) return;

      setFirebaseUser(user);
      setApiReady(false);
      setApiError('');

      if (!user) {
        setUserProfile(null);
        setAuthLoading(false);
        setDemoBalance(0);
        setDemoClaims([]);
        setDemoWithdrawals([]);
        setAdminWithdrawals([]);
        setCooldownLeft(0);
        setRefCode('');
        setReferralStats(null);
        return;
      }

      setAuthLoading(true);

      // Read synchronously: handleRegister sets this before creating the account.
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
          body: JSON.stringify({ referred_by: referredBy || null })
        });

        const syncData = await syncResponse.json().catch(() => ({}));

        if (!syncResponse.ok || syncData.success === false) {
          throw new Error(
            syncData.error || `D1 sync failed (${syncResponse.status})`
          );
        }

        if (!isMounted) return;

        pendingReferralRef.current = null;
        setRefCode(syncData.ref_code || '');
        setApiReady(true);
      } catch (error) {
        console.error('D1 sync error:', error);

        if (isMounted) {
          setApiError(
            `Database connection failed: ${error.message}`
          );
        }
      }

      try {
        const docRef = doc(dbStore, 'users', user.uid);
        const docSnap = await getDoc(docRef);

        if (!isMounted) return;

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

        if (isMounted) {
          setUserProfile(fallbackProfile);
        }
      }

      if (isMounted) {
        setAuthLoading(false);
      }
    });

    return () => {
      isMounted = false;
      unsubscribe();
    };
  }, []);

  // LOAD BALANCE + SETTINGS FROM D1
  useEffect(() => {
    if (!firebaseUser || !apiReady) return;

    let cancelled = false;

    const loadBalance = async () => {
      try {
        const data = await apiRequest('/api/balance');

        if (cancelled) return;

        setDemoBalance(Number(data.balance_koinu || 0) / KOINU);

        if (Number(data.cooldown_seconds) > 0) {
          setCooldownSeconds(Number(data.cooldown_seconds));
        }

        if (Number(data.claim_amount_koinu) > 0) {
          setClaimAmount(Number(data.claim_amount_koinu) / KOINU);
        }

        if (Number(data.min_withdrawal_koinu) > 0) {
          setMinWithdrawal(Number(data.min_withdrawal_koinu) / KOINU);
        }

        if (typeof data.cooldown_remaining === 'number') {
          setCooldownLeft(Math.max(0, data.cooldown_remaining));
        } else if (data.last_claim_at) {
          // Fallback for an older Worker without cooldown_remaining
          const lastClaim = parseServerDate(data.last_claim_at);

          if (lastClaim) {
            const elapsed = Math.floor((Date.now() - lastClaim.getTime()) / 1000);
            setCooldownLeft(Math.max(0, 45 - elapsed));
          }
        } else {
          setCooldownLeft(0);
        }
      } catch (error) {
        console.error('Balance loading error:', error);
      }
    };

    loadBalance();

    return () => {
      cancelled = true;
    };
  }, [firebaseUser, apiReady]);

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

  // COOLDOWN TIMER
  useEffect(() => {
    const timer = setInterval(() => {
      setCooldownLeft(prev => (prev > 0 ? prev - 1 : 0));
    }, 1000);

    return () => clearInterval(timer);
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

  // CLAIM
  const handleClaim = async () => {
    if (cooldownLeft > 0 || isClaiming) return;

    if (!firebaseUser || !apiReady) {
      setClaimIsError(true);
      setClaimStatus('Database is not ready. Please try again.');
      return;
    }

    setIsClaiming(true);
    setClaimIsError(false);
    setClaimStatus('Processing claim...');

    try {
      const data = await apiRequest('/api/claim', {
        method: 'POST'
      });

      if (Number(data.cooldown_seconds) > 0) {
        setCooldownSeconds(Number(data.cooldown_seconds));
      }

      setDemoBalance(Number(data.balance_koinu) / KOINU);
      setCooldownLeft(
        typeof data.cooldown_remaining === 'number'
          ? data.cooldown_remaining
          : cooldownSeconds
      );
      setShowClaimEffect(true);

      window.setTimeout(() => {
        setShowClaimEffect(false);
      }, 2200);

      const reward = Number(data.amount_koinu) / KOINU;
      setClaimIsError(false);
      setClaimStatus(`Claim successful! +${reward.toFixed(6)} DOGE`);

      // A history refresh failure must not turn a successful claim into an error
      try {
        const historyData = await apiRequest('/api/claims');
        setDemoClaims(historyData.claims || []);
        setClaimsError('');
      } catch (historyError) {
        setClaimsError(
          historyError.message || 'Could not refresh claim history.'
        );
      }
    } catch (error) {
      if (
        error.status === 429 &&
        typeof error.data?.cooldown_remaining === 'number'
      ) {
        setCooldownLeft(error.data.cooldown_remaining);
      }

      setClaimIsError(true);
      setClaimStatus(error.message || 'Could not complete claim.');
    } finally {
      setIsClaiming(false);

      window.setTimeout(() => {
        setClaimStatus('');
      }, 5000);
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

      setDemoBalance(Number(balanceData.balance_koinu) / KOINU);
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

      setDemoBalance(Number(balanceData.balance_koinu) / KOINU);
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

              <span className="px-2 py-0.5 bg-[#F4A6C1]/10 border border-[#F4A6C1]/20 text-[#F4A6C1] text-[10px] font-mono rounded-md uppercase">
                SECURE DEMO TESTNET
              </span>
            </div>
          </div>

          <div className="flex items-center space-x-4">
            <div className="bg-black border border-slate-800 px-4 py-2 rounded-xl flex items-center space-x-2">
              <Wallet className="w-4 h-4 text-[#F4A6C1]" />
              <span className="text-sm font-black font-mono text-white">
                {demoBalance.toFixed(4)} DOGE
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
              <span>Ref Code:</span>
              <span className="text-[#F4A6C1] font-mono font-bold">
                {refCode || '...'}
              </span>
            </div>
          </div>
        </aside>

        {/* MAIN CONTENT */}
        <main className="flex-1">

          {apiError && (
            <div className="mb-6 p-4 bg-red-500/10 border border-red-500/30 rounded-xl text-red-400 text-sm flex items-start gap-2">
              <AlertTriangle className="w-5 h-5 shrink-0" />
              <span>{apiError}</span>
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
                  Claim your simulated testnet reward of {claimAmount.toFixed(3)} DOGE every {cooldownSeconds} seconds.
                </p>
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
                    {claimAmount.toFixed(6)} DOGE
                  </div>
                  <span className="inline-block mt-2 px-2 py-0.5 bg-[#F4A6C1]/10 text-[#F4A6C1] text-[10px] font-mono rounded border border-[#F4A6C1]/20 uppercase font-bold">
                    DEMO BALANCES ONLY
                  </span>
                </div>

                {cooldownLeft > 0 ? (
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
                          width: `${Math.min(100, (cooldownLeft / cooldownSeconds) * 100)}%`
                        }}
                      />
                    </div>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={handleClaim}
                    disabled={isClaiming || !apiReady}
                    className="w-full max-w-sm bg-[#F4A6C1] hover:bg-[#e091ad] disabled:opacity-50 text-black font-black py-4 rounded-xl transition-all shadow-lg shadow-[#F4A6C1]/20 flex items-center justify-center space-x-2 text-base font-['Space_Grotesk',sans-serif] tracking-wide"
                  >
                    {isClaiming
                      ? <RefreshCw className="w-5 h-5 animate-spin" />
                      : <CheckCircle className="w-5 h-5" />
                    }

                    <span>
                      {isClaiming
                        ? 'Processing Claim...'
                        : `Claim ${claimAmount.toFixed(3)} DOGE (Demo)`}
                    </span>
                  </button>
                )}

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

          {/* WALLET */}
          {activeTab === 'wallet' && (
            <div className="bg-black border border-slate-800 rounded-2xl p-6 md:p-8 space-y-6">

              <div>
                <h2 className="text-xl font-black text-white mb-1 font-['Space_Grotesk',sans-serif]">
                  Wallet & Withdrawals (DEMO)
                </h2>
                <p className="text-sm text-slate-400">
                  Minimum withdrawal is {minWithdrawal.toFixed(1)} DEMO DOGE. No real payments are sent.
                </p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">

                <div className="bg-black border border-slate-800 rounded-2xl p-6 flex flex-col justify-between">
                  <div>
                    <span className="text-xs uppercase tracking-wider text-slate-500 font-mono font-bold">
                      Available Demo Balance
                    </span>
                    <div className="text-3xl font-black font-mono text-white mt-2">
                      {demoBalance.toFixed(4)} DOGE
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

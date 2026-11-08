import React, { useState, useEffect } from 'react';
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

// ADMIN ACCOUNTS
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

const formatDate = (value) => {
  if (!value) return 'N/A';

  const date = typeof value === 'number'
    ? new Date(value)
    : new Date(
        String(value).includes('T')
          ? value
          : String(value).replace(' ', 'T') + 'Z'
      );

  return Number.isNaN(date.getTime())
    ? 'N/A'
    : date.toLocaleString();
};

const mapWithdrawal = (w) => ({
  id: w.id,
  userId: w.uid || w.userId || '',
  email: w.email || '',
  amount: Number(w.amount_koinu) / 100000000,
  address: w.wallet_address || w.address || '',
  status: w.status || 'pending',
  timestamp: w.created_at
    ? new Date(String(w.created_at).replace(' ', 'T') + 'Z').getTime()
    : Date.now()
});

export default function App() {
  // AUTH STATE
  const [firebaseUser, setFirebaseUser] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [userProfile, setUserProfile] = useState(null);
  const [authMode, setAuthMode] = useState('login');
  const [apiReady, setApiReady] = useState(false);
  const [apiError, setApiError] = useState('');

  // AUTH FORM
  const [usernameInput, setUsernameInput] = useState('');
  const [emailInput, setEmailInput] = useState('');
  const [passwordInput, setPasswordInput] = useState('');
  const [regRefCode, setRegRefCode] = useState('');
  const [authError, setAuthError] = useState('');
  const [authSuccess, setAuthSuccess] = useState('');
  const [isLoadingAuth, setIsLoadingAuth] = useState(false);

  // DASHBOARD
  const [activeTab, setActiveTab] = useState('faucet');

  // FAUCET
  const [demoBalance, setDemoBalance] = useState(0);
  const [claimsLoading, setClaimsLoading] = useState(false);
  const [claimsError, setClaimsError] = useState('');
  const [cooldownLeft, setCooldownLeft] = useState(0);
  const [claimStatus, setClaimStatus] = useState('');
  const [showClaimEffect, setShowClaimEffect] = useState(false);
  const [isClaiming, setIsClaiming] = useState(false);
  const [demoClaims, setDemoClaims] = useState([]);

  // WITHDRAWALS
  const [demoWithdrawals, setDemoWithdrawals] = useState([]);
  const [withdrawAmount, setWithdrawAmount] = useState('1.0');
  const [withdrawAddress, setWithdrawAddress] = useState('');
  const [withdrawMsg, setWithdrawMsg] = useState('');
  const [isWithdrawing, setIsWithdrawing] = useState(false);

  // ADMIN
  const [adminWithdrawals, setAdminWithdrawals] = useState([]);
  const [adminLoading, setAdminLoading] = useState(false);
  const [adminError, setAdminError] = useState('');
  const [adminActionLoading, setAdminActionLoading] = useState(null);

  // ADMIN IDENTIFICATION
  const adminEmail = firebaseUser?.email?.trim().toLowerCase() || '';

  const adminTheme =
    adminEmail === ADMIN_EMAILS.lilac
      ? 'lilac'
      : adminEmail === ADMIN_EMAILS.blue
        ? 'blue'
        : null;

  const isDemoAdmin = Boolean(adminTheme);

  // API HELPER
  const apiRequest = async (path, options = {}) => {
    if (!firebaseUser) {
      throw new Error('Please log in first.');
    }

    const token = await firebaseUser.getIdToken();

    const response = await fetch(`${API_URL}${path}`, {
      ...options,
      headers: {
        ...(options.body ? { 'Content-Type': 'application/json' } : {}),
        ...options.headers,
        Authorization: `Bearer ${token}`
      }
    });

    const data = await response.json().catch(() => ({}));

    if (!response.ok || data.success === false) {
      throw new Error(data.error || `Request failed (${response.status})`);
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
        return;
      }

      setAuthLoading(true);

      const fallbackProfile = {
        uid: user.uid,
        email: user.email,
        username: user.email ? user.email.split('@')[0] : 'User',
        refCode: 'DOGE' + (
          Math.abs(
            user.uid.split('').reduce(
              (acc, char) => acc + char.charCodeAt(0), 0
            ) % 9000
          ) + 1000
        ),
        createdAt: Date.now()
      };

      try {
        const token = await user.getIdToken();

        const syncResponse = await fetch(`${API_URL}/api/auth/sync`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`
          }
        });

        const syncData = await syncResponse.json().catch(() => ({}));

        if (!syncResponse.ok || syncData.success === false) {
          throw new Error(
            syncData.error || `D1 sync failed (${syncResponse.status})`
          );
        }

        if (!isMounted) return;

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
            username: data.username || fallbackProfile.username,
            refCode: data.refCode || fallbackProfile.refCode
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

  // LOAD BALANCE FROM D1
  useEffect(() => {
    if (!firebaseUser || !apiReady) return;

    let cancelled = false;

    const loadBalance = async () => {
      try {
        const data = await apiRequest('/api/balance');

        if (cancelled) return;

        setDemoBalance(Number(data.balance_koinu || 0) / 100000000);

        if (data.last_claim_at) {
          const lastClaim = new Date(
            String(data.last_claim_at).replace(' ', 'T') + 'Z'
          ).getTime();

          const elapsed = Math.floor((Date.now() - lastClaim) / 1000);
          setCooldownLeft(Math.max(0, 45 - elapsed));
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

    if (!trimmedUsername || !trimmedEmail || !passwordInput) {
      setAuthError('Please fill in all required fields.');
      return;
    }

    if (passwordInput.length < 6) {
      setAuthError('Password must contain at least 6 characters.');
      return;
    }

    setIsLoadingAuth(true);

    try {
      const credential = await createUserWithEmailAndPassword(
        auth,
        trimmedEmail,
        passwordInput
      );

      const uid = credential.user.uid;
      const newRefCode = 'DOGE' + Math.floor(1000 + Math.random() * 9000);

      const localProfile = {
        uid,
        username: trimmedUsername,
        email: trimmedEmail,
        refCode: newRefCode,
        referredBy: regRefCode.trim().toUpperCase() || null,
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
      setClaimStatus('Database is not ready. Please try again.');
      return;
    }

    setIsClaiming(true);
    setClaimStatus('Processing claim...');

    try {
      const data = await apiRequest('/api/claim', {
        method: 'POST'
      });

      setDemoBalance(Number(data.balance_koinu) / 100000000);
      setCooldownLeft(45);
      setShowClaimEffect(true);

      window.setTimeout(() => {
        setShowClaimEffect(false);
      }, 2200);

      const historyData = await apiRequest('/api/claims');
      setDemoClaims(historyData.claims || []);
      setClaimsError('');

      const reward = Number(data.amount_koinu) / 100000000;
      setClaimStatus(`Claim successful! +${reward.toFixed(6)} DOGE`);
    } catch (error) {
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

    if (!Number.isFinite(amount) || amount < 1) {
      setWithdrawMsg('Minimum withdrawal is 1.0 DEMO DOGE.');
      return;
    }

    if (!withdrawAddress.trim()) {
      setWithdrawMsg('Please enter a wallet address.');
      return;
    }

    const amountKoinu = Math.round(amount * 100000000);

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

      setDemoBalance(Number(balanceData.balance_koinu) / 100000000);
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
    const data = await apiRequest('/api/admin/withdrawals');

    setAdminWithdrawals(
      (data.withdrawals || []).map(mapWithdrawal)
    );
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

      setDemoBalance(Number(balanceData.balance_koinu) / 100000000);
      setDemoWithdrawals(
        (historyData.withdrawals || []).map(mapWithdrawal)
      );
    } catch (error) {
      setAdminError(error.message || 'Could not reject withdrawal.');
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
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-400 mb-1">
                  Email Address
                </label>
                <input
                  type="email"
                  required
                  value={emailInput}
                  onChange={(e) => setEmailInput(e.target.value)}
                  placeholder="name@example.com"
                  className="w-full bg-black border border-slate-800 rounded-xl px-4 py-3 text-sm text-white placeholder-slate-600 focus:outline-none focus:border-[#F4A6C1] focus:ring-1 focus:ring-[#F4A6C1] transition-colors"
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
                  className="w-full bg-black border border-slate-800 rounded-xl px-4 py-3 text-sm text-white placeholder-slate-600 focus:outline-none focus:border-[#F4A6C1] focus:ring-1 focus:ring-[#F4A6C1] transition-colors"
                />
              </div>

              <button
                type="submit"
                disabled={isLoadingAuth}
                className="w-full bg-[#F4A6C1] hover:bg-[#e091ad] disabled:opacity-50 text-black font-black py-3 rounded-xl transition-all shadow-lg shadow-[#F4A6C1]/20 flex items-center justify-center space-x-2 font-['Space_Grotesk',sans-serif] tracking-wide"
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
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-400 mb-1">
                  Username
                </label>
                <input
                  type="text"
                  required
                  value={usernameInput}
                  onChange={(e) => setUsernameInput(e.target.value)}
                  placeholder="YourUsername"
                  className="w-full bg-black border border-slate-800 rounded-xl px-4 py-3 text-sm text-white placeholder-slate-600 focus:outline-none focus:border-[#F4A6C1] focus:ring-1 focus:ring-[#F4A6C1] transition-colors"
                />
              </div>

              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-400 mb-1">
                  Email Address
                </label>
                <input
                  type="email"
                  required
                  value={emailInput}
                  onChange={(e) => setEmailInput(e.target.value)}
                  placeholder="name@example.com"
                  className="w-full bg-black border border-slate-800 rounded-xl px-4 py-3 text-sm text-white placeholder-slate-600 focus:outline-none focus:border-[#F4A6C1] focus:ring-1 focus:ring-[#F4A6C1] transition-colors"
                />
              </div>

              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-400 mb-1">
                  Password
                </label>
                <input
                  type="password"
                  required
                  value={passwordInput}
                  onChange={(e) => setPasswordInput(e.target.value)}
                  placeholder="At least 6 characters"
                  className="w-full bg-black border border-slate-800 rounded-xl px-4 py-3 text-sm text-white placeholder-slate-600 focus:outline-none focus:border-[#F4A6C1] focus:ring-1 focus:ring-[#F4A6C1] transition-colors"
                />
              </div>

              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-400 mb-1 flex items-center justify-between">
                  <span>Referral Code (Optional)</span>
                  <span className="text-[10px] text-[#F4A6C1] font-normal">
                    Demo Sponsor
                  </span>
                </label>

                <input
                  type="text"
                  value={regRefCode}
                  onChange={(e) => setRegRefCode(e.target.value)}
                  placeholder="e.g. DOGE1234"
                  className="w-full bg-black border border-slate-800 rounded-xl px-4 py-3 text-sm text-white placeholder-slate-600 focus:outline-none focus:border-[#F4A6C1] focus:ring-1 focus:ring-[#F4A6C1] transition-colors font-mono uppercase"
                />
              </div>

              <button
                type="submit"
                disabled={isLoadingAuth}
                className="w-full bg-[#F4A6C1] hover:bg-[#e091ad] disabled:opacity-50 text-black font-black py-3 rounded-xl transition-all shadow-lg shadow-[#F4A6C1]/20 flex items-center justify-center space-x-2 font-['Space_Grotesk',sans-serif] tracking-wide"
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
                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-400 mb-1">
                    Email Address
                  </label>
                  <input
                    type="email"
                    required
                    value={emailInput}
                    onChange={(e) => setEmailInput(e.target.value)}
                    placeholder="name@example.com"
                    className="w-full bg-black border border-slate-800 rounded-xl px-4 py-3 text-sm text-white placeholder-slate-600 focus:outline-none focus:border-[#F4A6C1] focus:ring-1 focus:ring-[#F4A6C1] transition-colors"
                  />
                </div>

                <button
                  type="submit"
                  disabled={isLoadingAuth}
                  className="w-full bg-[#F4A6C1] hover:bg-[#e091ad] disabled:opacity-50 text-black font-black py-3 rounded-xl transition-all shadow-lg shadow-[#F4A6C1]/20 flex items-center justify-center space-x-2 font-['Space_Grotesk',sans-serif] tracking-wide"
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
              className={`w-full flex items-center space-x-3 px-4 py-3 rounded-xl text-sm font-bold transition-all font-['Space_Grotesk',sans-serif] ${
                activeTab === 'faucet'
                  ? 'bg-[#F4A6C1] text-black font-black shadow-lg shadow-[#F4A6C1]/20'
                  : 'text-slate-400 hover:bg-slate-900 hover:text-white'
              }`}
            >
              <RefreshCw className="w-4 h-4" />
              <span>Doge Faucet</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('wallet')}
              className={`w-full flex items-center space-x-3 px-4 py-3 rounded-xl text-sm font-bold transition-all font-['Space_Grotesk',sans-serif] ${
                activeTab === 'wallet'
                  ? 'bg-[#F4A6C1] text-black font-black shadow-lg shadow-[#F4A6C1]/20'
                  : 'text-slate-400 hover:bg-slate-900 hover:text-white'
              }`}
            >
              <Wallet className="w-4 h-4" />
              <span>Wallet & Withdraw</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('referrals')}
              className={`w-full flex items-center space-x-3 px-4 py-3 rounded-xl text-sm font-bold transition-all font-['Space_Grotesk',sans-serif] ${
                activeTab === 'referrals'
                  ? 'bg-[#F4A6C1] text-black font-black shadow-lg shadow-[#F4A6C1]/20'
                  : 'text-slate-400 hover:bg-slate-900 hover:text-white'
              }`}
            >
              <Users className="w-4 h-4" />
              <span>Referral Program</span>
            </button>

            {isDemoAdmin && (
              <button
                type="button"
                onClick={() => setActiveTab('admin')}
                className={`w-full flex items-center space-x-3 px-4 py-3 rounded-xl text-sm font-bold transition-all font-['Space_Grotesk',sans-serif] ${
                  activeTab === 'admin'
                    ? 'bg-[#F4A6C1] text-black font-black shadow-lg shadow-[#F4A6C1]/20'
                    : 'text-slate-400 hover:bg-slate-900 hover:text-white'
                }`}
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
                {userProfile.refCode}
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

          {/* FAUCET */}
          {activeTab === 'faucet' && (
            <div className="bg-black border border-slate-800 rounded-2xl p-6 md:p-8 space-y-6">

              <div>
                <h2 className="text-xl font-black text-white mb-1 font-['Space_Grotesk',sans-serif]">
                  Crypto Faucet Claim (DEMO)
                </h2>
                <p className="text-sm text-slate-400">
                  Claim your simulated testnet reward of 0.001 DOGE every 45 seconds.
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
                    0.001000 DOGE
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
                          width: `${(cooldownLeft / 45) * 100}%`
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
                        : 'Claim 0.001 DOGE (Demo)'}
                    </span>
                  </button>
                )}

                {claimStatus && (
                  <p className="text-sm font-bold text-emerald-400 font-['Space_Grotesk',sans-serif]">
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
                                Number(claim.amount_koinu) / 100000000
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
                  Minimum withdrawal is 1.0 DEMO DOGE. No real payments are sent.
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
                      1.0 DOGE
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
                    <label className="block text-xs font-bold uppercase tracking-wider text-slate-400 mb-1">
                      Amount (DOGE)
                    </label>
                    <input
                      type="number"
                      step="0.001"
                      min="1"
                      required
                      value={withdrawAmount}
                      onChange={(e) => setWithdrawAmount(e.target.value)}
                      className="w-full bg-black border border-slate-800 rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:border-[#F4A6C1] focus:ring-1 focus:ring-[#F4A6C1] font-mono font-bold"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold uppercase tracking-wider text-slate-400 mb-1">
                      Dogecoin Wallet Address
                    </label>
                    <input
                      type="text"
                      required
                      value={withdrawAddress}
                      onChange={(e) => setWithdrawAddress(e.target.value)}
                      placeholder="D..."
                      className="w-full bg-black border border-slate-800 rounded-xl px-4 py-3 text-sm text-white placeholder-slate-600 focus:outline-none focus:border-[#F4A6C1] focus:ring-1 focus:ring-[#F4A6C1] font-mono font-bold"
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
                  Share your testnet referral code for simulated bonuses.
                </p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">

                <div className="bg-black border border-slate-800 rounded-2xl p-5">
                  <span className="text-xs uppercase tracking-wider text-slate-500 font-mono font-bold">
                    Your Referral Code
                  </span>
                  <div className="text-2xl font-black font-mono text-[#F4A6C1] mt-1">
                    {userProfile.refCode}
                  </div>
                </div>

                <div className="bg-black border border-slate-800 rounded-2xl p-5">
                  <span className="text-xs uppercase tracking-wider text-slate-500 font-mono font-bold">
                    Invited Users
                  </span>
                  <div className="text-2xl font-black font-mono text-white mt-1">
                    0
                  </div>
                </div>

                <div className="bg-black border border-slate-800 rounded-2xl p-5">
                  <span className="text-xs uppercase tracking-wider text-slate-500 font-mono font-bold">
                    Demo Commission
                  </span>
                  <div className="text-2xl font-black font-mono text-emerald-400 mt-1">
                    0.0000 DOGE
                  </div>
                </div>
              </div>

              <div className="bg-black border border-slate-800 rounded-2xl p-6 space-y-4">
                <h3 className="text-sm font-black uppercase tracking-wider text-slate-300 font-['Space_Grotesk',sans-serif]">
                  How Referrals Work (Simulated)
                </h3>

                <ul className="text-sm text-slate-400 space-y-2 list-disc list-inside font-medium">
                  <li>
                    Share your code{' '}
                    <strong className="text-[#F4A6C1] font-mono font-black">
                      {userProfile.refCode}
                    </strong>{' '}
                    with others.
                  </li>
                  <li>
                    Referral tracking is currently a demo feature.
                  </li>
                </ul>
              </div>
            </
              

{/* ADMIN DASHBOARD */}
{activeTab === 'admin' && isDemoAdmin && (
  <div className="bg-black border border-slate-800 rounded-2xl p-6 md:p-8 space-y-6">

    <div>
      <h2 className="text-xl font-black text-white mb-1 font-['Space_Grotesk',sans-serif]">
        Admin Dashboard
      </h2>

      {firebaseUser?.email?.toLowerCase() === 'celamielidon26@gmail.com' && (
        <p className="text-blue-400 text-sm font-bold mt-2">
          I love you ❤️
        </p>
      )}

      <p className="text-sm text-slate-400 mt-2">
        Manage and review withdrawal requests stored in the D1 database.
      </p>
    </div>

    <div className={`p-3 rounded-xl flex items-start space-x-2 text-xs border ${
      firebaseUser?.email?.toLowerCase() === 'celamielidon26@gmail.com'
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
        <div className={`text-2xl font-black font-mono mt-1 ${
          firebaseUser?.email?.toLowerCase() === 'celamielidon26@gmail.com'
            ? 'text-blue-400'
            : 'text-[#A78BFA]'
        }`}>
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
          firebaseUser?.email?.toLowerCase() === 'celamielidon26@gmail.com'
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

                  <td className={`p-4 font-black ${
                    firebaseUser?.email?.toLowerCase() === 'celamielidon26@gmail.com'
                      ? 'text-blue-400'
                      : 'text-[#A78BFA]'
                  }`}>
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
                          className={`px-3 py-1 rounded-lg font-black transition-colors disabled:opacity-40 ${
                            firebaseUser?.email?.toLowerCase() === 'celamielidon26@gmail.com'
                              ? 'bg-blue-500/10 hover:bg-blue-500/20 border border-blue-500/30 text-blue-400'
                              : 'bg-[#A78BFA]/10 hover:bg-[#A78BFA]/20 border border-[#A78BFA]/30 text-[#A78BFA]'
                          }`}
                        >
                          {adminActionLoading === w.id ? '...' : 'Approve'}
                        </button>

                        <button
                          type="button"
                          disabled={adminActionLoading !== null}
                          onClick={() => handleAdminReject(w.id)}
                          className={`px-3 py-1 rounded-lg font-black transition-colors disabled:opacity-40 ${
                            firebaseUser?.email?.toLowerCase() === 'celamielidon26@gmail.com'
                              ? 'bg-blue-500/10 hover:bg-blue-500/20 border border-blue-500/30 text-blue-400'
                              : 'bg-[#A78BFA]/10 hover:bg-[#A78BFA]/20 border border-[#A78BFA]/30 text-[#A78BFA]'
                          }`}
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

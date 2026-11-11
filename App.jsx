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
  ArrowLeft,
  MailCheck,
  User
} from 'lucide-react';

// --- FIREBASE SDK INITIALIZATION (dogedrip-3ebda) ---
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

// --- DOGEDRIP DASHBOARD PANELS ---
import ProfilePanel from './ProfilePanel';
import EmailVerificationPanel from './EmailVerificationPanel';

const firebaseConfig = {
  apiKey: "AIzaSyAF5l0YvOk4Wk2NrqoL1BXj6szJtS65q-k",
  authDomain: "dogedrip-3ebda.firebaseapp.com",
  projectId: "dogedrip-3ebda",
  storageBucket: "dogedrip-3ebda.firebasestorage.app",
  messagingSenderId: "839487252990",
  appId: "1:839487252990:web:760ad35b5b66d611bab8af"
};

// --- EXPLICIT DEMO ADMIN CONFIGURATION (UI-Only Demo Protection) ---
const DEMO_ADMIN_EMAIL = "admin@faucet.com";

// Initialize Firebase safely with fallback check
const firebaseApp = !getApps().length ? initializeApp(firebaseConfig) : getApps()[0];
const auth = getAuth(firebaseApp);
const dbStore = getFirestore(firebaseApp);

export default function App() {
  // Auth state
  const [firebaseUser, setFirebaseUser] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [userProfile, setUserProfile] = useState(null);
  const [authMode, setAuthMode] = useState('login'); // 'login' | 'register' | 'forgot'

  // Auth form state
  const [usernameInput, setUsernameInput] = useState('');
  const [emailInput, setEmailInput] = useState('');
  const [passwordInput, setPasswordInput] = useState('');
  const [regRefCode, setRegRefCode] = useState('');
  const [authError, setAuthError] = useState('');
  const [authSuccess, setAuthSuccess] = useState('');
  const [isLoadingAuth, setIsLoadingAuth] = useState(false);

  // Dashboard active tab
  const [activeTab, setActiveTab] = useState('faucet'); // 'profile' | 'faucet' | 'wallet' | 'referrals' | 'email' | 'admin'
  const [emailVerified, setEmailVerified] = useState(null); // null = not loaded yet; backend is the source of truth

  // DEMO Local State (Simulated Testnet Ledger)
  // DEMO Local State (Simulated Testnet Ledger)
const [demoBalance, setDemoBalance] = useState(0.0000);
const [claimsLoading, setClaimsLoading] = useState(false);
const [claimsError, setClaimsError] = useState('');
const [cooldownLeft, setCooldownLeft] = useState(0);
const [claimStatus, setClaimStatus] = useState('');
const [isClaiming, setIsClaiming] = useState(false);
const [demoClaims, setDemoClaims] = useState([]);
const [demoWithdrawals, setDemoWithdrawals] = useState([]);

  // Withdrawal form state
  const [withdrawAmount, setWithdrawAmount] = useState('5.0');
  const [withdrawAddress, setWithdrawAddress] = useState('');
  const [withdrawMsg, setWithdrawMsg] = useState('');

  // Admin state for withdrawal review (DEMO)
  const [adminWithdrawals, setAdminWithdrawals] = useState([
    { id: 'w_demo_1', userId: 'user_sample_1', email: 'user@example.com', amount: 6.0, address: 'D7xyzABC123...', status: 'pending', timestamp: Date.now() - 3600000, isDemo: true }
  ]);

  // Helper check for explicit demo admin email (case-insensitive)
  const isDemoAdmin = firebaseUser && firebaseUser.email &&
    firebaseUser.email.trim().toLowerCase() === DEMO_ADMIN_EMAIL.toLowerCase();

  // Enforce redirection if non-admin attempts to access admin tab
  useEffect(() => {
    if (activeTab === 'admin' && !isDemoAdmin) {
      setActiveTab('faucet');
    }
  }, [activeTab, isDemoAdmin]);

  // Firebase Auth + Cloudflare D1 synchronization
  useEffect(() => {
    let isMounted = true;

    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (!isMounted) return;

      setFirebaseUser(user);

      if (!user) {
  setUserProfile(null);
  setAuthLoading(false);
  return;
}

      const fallbackProfile = {
        uid: user.uid,
        email: user.email,
        username: user.email ? user.email.split('@')[0] : 'User',
        refCode: 'DOGE' + Math.abs(
          user.uid.split('').reduce(
            (acc, char) => acc + char.charCodeAt(0), 0
          ) % 9000 + 1000
        ),
        createdAt: Date.now()
      };

      try {
        const idToken = await user.getIdToken();

        const response = await fetch(
          'https://dogedrip-api.f5pfpv5sbg.workers.dev/api/auth/sync',
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${idToken}`
            }
          }
        );

        if (!response.ok) {
          throw new Error(`D1 sync failed: HTTP ${response.status}`);
        }

        console.log('User synced successfully with D1.');
      } catch (error) {
        console.error('D1 sync error:', error);
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
          setAuthLoading(false);
        } else {
          setUserProfile(fallbackProfile);
          setAuthLoading(false);
        }
      } catch (error) {
        console.warn('Firestore unavailable:', error.message);

        if (isMounted) {
          setUserProfile(fallbackProfile);

setAuthLoading(false);

        }
      }
    });

    return () => {
      isMounted = false;
      unsubscribe();
    };
  }, []);
    // Load real balance and last claim from Cloudflare D1
  useEffect(() => {
    if (!firebaseUser) return;

    let cancelled = false;

    const loadAccount = async () => {
      try {
        const token = await firebaseUser.getIdToken();

        const result = await fetch(
          "https://dogedrip-api.f5pfpv5sbg.workers.dev/api/balance",
          {
            headers: {
              Authorization: `Bearer ${token}`
            }
          }
        );

        const data = await result.json();

        if (!result.ok || !data.success) {
          throw new Error(data.error || "Could not load account");
        }

        if (cancelled) return;

        setDemoBalance(Number(data.balance_koinu) / 100000000);
        setEmailVerified(Boolean(data.email_verified));

        if (data.last_claim_at) {
          const lastClaim = new Date(
            data.last_claim_at.replace(" ", "T") + "Z"
          ).getTime();

          const elapsed = Math.floor((Date.now() - lastClaim) / 1000);
          setCooldownLeft(Math.max(0, 45 - elapsed));
        } else {
          setCooldownLeft(0);
        }
      } catch (error) {
        console.error("Account loading error:", error);
      }
    };

    loadAccount();

    return () => {
      cancelled = true;
    };
  }, [firebaseUser]);
    // Load persistent claim history from Cloudflare D1
  useEffect(() => {
    if (!firebaseUser) {
      setDemoClaims([]);
      return;
    }

    let cancelled = false;

    const loadClaims = async () => {
      setClaimsLoading(true);
      setClaimsError('');

      try {
        const token = await firebaseUser.getIdToken();

        const result = await fetch(
          "https://dogedrip-api.f5pfpv5sbg.workers.dev/api/claims",
          {
            headers: {
              Authorization: `Bearer ${token}`
            }
          }
        );

        const data = await result.json();

        if (!result.ok || !data.success) {
          throw new Error(data.error || "Could not load claim history");
        }

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
  }, [firebaseUser]);
  // Cooldown timer ticker
  useEffect(() => {
    const timer = setInterval(() => {
      if (cooldownLeft > 0) {
        setCooldownLeft(prev => (prev > 0 ? prev - 1 : 0));
      }
    }, 1000);
    return () => clearInterval(timer);
  }, [cooldownLeft]);

  // Auth Handlers with graceful fallback
  const handleLogin = async (e) => {
    e.preventDefault();
    setAuthError('');
    setIsLoadingAuth(true);
    try {
      await signInWithEmailAndPassword(auth, emailInput, passwordInput);
      setEmailInput('');
      setPasswordInput('');
    } catch (err) {
      setAuthError(err.message.replace('Firebase: ', ''));
    } finally {
      setIsLoadingAuth(false);
    }
  };

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

    setIsLoadingAuth(true);
    try {
      const userCredential = await createUserWithEmailAndPassword(auth, trimmedEmail, passwordInput);
      const uid = userCredential.user.uid;
      const newRefCode = 'DOGE' + Math.floor(1000 + Math.random() * 9000);

      const localProfile = {
        uid: uid,
        username: trimmedUsername,
        email: trimmedEmail,
        refCode: newRefCode,
        referredBy: regRefCode.trim().toUpperCase() || null,
        createdAt: Date.now()
      };

      try {
        await setDoc(doc(dbStore, 'users', uid), localProfile);
      } catch (firestoreErr) {
        console.warn("Firestore profile write restricted or unavailable, proceeding with local auth session:", firestoreErr.message);
      }

      setUserProfile(localProfile);
      setAuthSuccess('Account created successfully via Firebase Auth!');
      setActiveTab('faucet');
      setUsernameInput('');
      setEmailInput('');
      setPasswordInput('');
      setRegRefCode('');
    } catch (err) {
      setAuthError(err.message.replace('Firebase: ', ''));
    } finally {
      setIsLoadingAuth(false);
    }
  };

  const handleForgotPassword = async (e) => {
    e.preventDefault();
    setAuthError('');
    setAuthSuccess('');

    const trimmedEmail = emailInput.trim().toLowerCase();
    if (!trimmedEmail) {
      setAuthError('Please enter your email address to reset your password.');
      return;
    }

    setIsLoadingAuth(true);
    try {
      await sendPasswordResetEmail(auth, trimmedEmail);
      setAuthSuccess('Password reset email sent! Check your inbox for further instructions.');
    } catch (err) {
      setAuthError(err.message.replace('Firebase: ', ''));
    } finally {
      setIsLoadingAuth(false);
    }
  };

  const handleSignOut = async () => {
    try {
      await signOut(auth);
      setFirebaseUser(null);
      setUserProfile(null);
      setActiveTab('faucet');
    } catch (e) {
      console.error("Sign out error:", e);
    }
  };

  // Demo Faucet Claim Handler (Local State Only)

const handleClaim = async () => {
  if (cooldownLeft > 0 || isClaiming) return;

  if (!firebaseUser) {
    setClaimStatus("Please log in first.");
    return;
  }

  setIsClaiming(true);
  setClaimStatus("Processing claim...");

  try {
    const token = await firebaseUser.getIdToken();

    const result = await fetch(
      "https://dogedrip-api.f5pfpv5sbg.workers.dev/api/claim",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`
        }
      }
    );

    const data = await result.json();

    if (result.status === 403 && data.code === "email_verified_required") {
      setEmailVerified(false);
      setClaimStatus("Verify your email to claim.");
      setActiveTab("email");
      return;
    }

    if (!result.ok || !data.success) {
      throw new Error(data.error || "Claim failed");
    }

    const balance = Number(data.balance_koinu) / 100000000;
    const reward = Number(data.amount_koinu) / 100000000;

    setDemoBalance(balance);
    setCooldownLeft(45);

        try {
      const historyResult = await fetch(
        "https://dogedrip-api.f5pfpv5sbg.workers.dev/api/claims",
        {
          headers: {
            Authorization: `Bearer ${token}`
          }
        }
      );

      const historyData = await historyResult.json();

      if (historyResult.ok && historyData.success) {
        setDemoClaims(historyData.claims || []);
      }
    } catch (historyError) {
      console.error("Claim history refresh error:", historyError);
    }


    setClaimStatus(`Claim successful! +${reward} DOGE`);
  } catch (error) {
    setClaimStatus(error.message || "Could not complete claim.");
  } finally {
    setIsClaiming(false);
    setTimeout(() => setClaimStatus(""), 4000);
  }
};


  // Simulated Withdrawal Handler (Local State Only - No Real Payments)
  const handleWithdraw = (e) => {
    e.preventDefault();
    setWithdrawMsg('');

    const amt = parseFloat(withdrawAmount);
    if (isNaN(amt) || amt < 5.0) {
      setWithdrawMsg('Minimum testnet withdrawal amount is 5.0 DOGE.');
      return;
    }

    if (demoBalance < amt) {
      setWithdrawMsg('Insufficient DEMO balance for this withdrawal.');
      return;
    }

    if (!withdrawAddress.trim()) {
      setWithdrawMsg('Please enter a valid Dogecoin testnet wallet address.');
      return;
    }

    setDemoBalance(prev => Number((prev - amt).toFixed(6)));

    const newWithdrawal = {
      id: 'w_demo_' + Math.random().toString(36).substring(2, 9),
      userId: firebaseUser.uid,
      email: firebaseUser.email,
      amount: amt,
      address: withdrawAddress.trim(),
      status: 'pending',
      timestamp: Date.now(),
      isDemo: true
    };

    setDemoWithdrawals(prev => [newWithdrawal, ...prev]);
    setAdminWithdrawals(prev => [newWithdrawal, ...prev]);
    setWithdrawMsg('SIMULATED Withdrawal request submitted successfully! (Testnet demo only)');
    setWithdrawAddress('');
  };

  // Admin Actions for Simulated Withdrawals (UI-Only Demo)
  const handleAdminApprove = (wId) => {
    if (!isDemoAdmin) return;
    setAdminWithdrawals(prev => prev.map(w => w.id === wId ? { ...w, status: 'approved' } : w));
    setDemoWithdrawals(prev => prev.map(w => w.id === wId ? { ...w, status: 'approved' } : w));
  };

  const handleAdminReject = (wId) => {
    if (!isDemoAdmin) return;
    const target = adminWithdrawals.find(w => w.id === wId);
    if (target && target.status === 'pending') {
      if (target.userId === firebaseUser?.uid) {
        setDemoBalance(prev => Number((prev + target.amount).toFixed(6)));
      }
    }
    setAdminWithdrawals(prev => prev.map(w => w.id === wId ? { ...w, status: 'rejected' } : w));
    setDemoWithdrawals(prev => prev.map(w => w.id === wId ? { ...w, status: 'rejected' } : w));
  };

  // --- RENDER UNAUTHENTICATED VIEW ---
// --- AUTH LOADING ---
if (authLoading) {
  return (
    <div className="min-h-screen bg-black text-white flex items-center justify-center">
      Loading account...
    </div>
  );
}

// --- RENDER UNAUTHENTICATED VIEW ---
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
                <span className="text-white">CLAIM</span>
                <span><span className="text-white">DO</span><span className="text-[#F4A6C1]">GE</span></span>
              </div>
              <p className="text-xs text-[#F4A6C1] font-mono mt-1">FIREBASE AUTH + SECURE DEMO</p>
            </div>
          </div>

          <div className="mb-4 p-3 bg-[#F4A6C1]/10 border border-[#F4A6C1]/20 text-[#F4A6C1] text-xs rounded-xl flex items-start space-x-2">
            <Info className="w-4 h-4 shrink-0 mt-0.5" />
            <span>Notice: Authentication is powered by Firebase, while faucet claims and balances operate as a simulated DEMO testnet ledger. No real DOGE payments.</span>
          </div>

          {authMode !== 'forgot' && (
            <div className="flex bg-black p-1 rounded-xl mb-6 border border-slate-800">
              <button
                onClick={() => { setAuthMode('login'); setAuthError(''); setAuthSuccess(''); }}
                className={`flex-1 py-2 text-sm font-bold rounded-lg transition-all font-['Space_Grotesk',sans-serif] ${authMode === 'login' ? 'bg-[#F4A6C1] text-black shadow-lg shadow-[#F4A6C1]/20' : 'text-slate-400 hover:text-white'}`}
              >
                Sign In
              </button>
              <button
                onClick={() => { setAuthMode('register'); setAuthError(''); setAuthSuccess(''); }}
                className={`flex-1 py-2 text-sm font-bold rounded-lg transition-all font-['Space_Grotesk',sans-serif] ${authMode === 'register' ? 'bg-[#F4A6C1] text-black shadow-lg shadow-[#F4A6C1]/20' : 'text-slate-400 hover:text-white'}`}
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
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-400 mb-1">Email Address</label>
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
                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-400">Password</label>
                  <button
                    type="button"
                    onClick={() => { setAuthMode('forgot'); setAuthError(''); setAuthSuccess(''); }}
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
                className="w-full bg-[#F4A6C1] hover:bg-[#e091ad] text-black font-black py-3 rounded-xl transition-all shadow-lg shadow-[#F4A6C1]/20 flex items-center justify-center space-x-2 font-['Space_Grotesk',sans-serif] tracking-wide"
              >
                <span>{isLoadingAuth ? 'Signing In...' : 'Sign In with Firebase'}</span>
              </button>
            </form>
          )}

          {authMode === 'register' && (
            <form onSubmit={handleRegister} className="space-y-4">
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-400 mb-1">Username</label>
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
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-400 mb-1">Email Address</label>
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
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-400 mb-1">Password</label>
                <input
                  type="password"
                  required
                  value={passwordInput}
                  onChange={(e) => setPasswordInput(e.target.value)}
                  placeholder="••••••••"
                  className="w-full bg-black border border-slate-800 rounded-xl px-4 py-3 text-sm text-white placeholder-slate-600 focus:outline-none focus:border-[#F4A6C1] focus:ring-1 focus:ring-[#F4A6C1] transition-colors"
                />
              </div>

              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-400 mb-1 flex items-center justify-between">
                  <span>Referral Code (Optional)</span>
                  <span className="text-[10px] text-[#F4A6C1] font-normal">Demo Sponsor</span>
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
                className="w-full bg-[#F4A6C1] hover:bg-[#e091ad] text-black font-black py-3 rounded-xl transition-all shadow-lg shadow-[#F4A6C1]/20 flex items-center justify-center space-x-2 font-['Space_Grotesk',sans-serif] tracking-wide"
              >
                <UserPlus className="w-4 h-4" />
                <span>{isLoadingAuth ? 'Creating Account...' : 'Create Firebase Account'}</span>
              </button>
            </form>
          )}

          {authMode === 'forgot' && (
            <div className="space-y-4">
              <div className="flex items-center space-x-2 mb-2 text-[#F4A6C1]">
                <KeyRound className="w-5 h-5" />
                <h2 className="text-base font-bold text-white font-['Space_Grotesk',sans-serif]">Reset Password</h2>
              </div>
              <p className="text-xs text-slate-400">
                Enter your account email address and we will send you a secure link to reset your password via Firebase Authentication.
              </p>

              <form onSubmit={handleForgotPassword} className="space-y-4">
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-400 mb-1">Email Address</label>
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
                  className="w-full bg-[#F4A6C1] hover:bg-[#e091ad] text-black font-black py-3 rounded-xl transition-all shadow-lg shadow-[#F4A6C1]/20 flex items-center justify-center space-x-2 font-['Space_Grotesk',sans-serif] tracking-wide"
                >
                  <span>{isLoadingAuth ? 'Sending Link...' : 'Send Reset Link'}</span>
                </button>

                <button
                  type="button"
                  onClick={() => { setAuthMode('login'); setAuthError(''); setAuthSuccess(''); }}
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

  // --- RENDER LOGGED-IN DASHBOARD ---
  return (
    <div className="min-h-screen bg-black text-white flex flex-col font-sans">
      <header className="bg-black border-b border-slate-800 sticky top-0 z-30">
        <div className="max-w-7xl mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="bg-[#F4A6C1]/10 p-2 rounded-xl border border-[#F4A6C1]/20 text-[#F4A6C1]">
              <Shield className="w-6 h-6" />
            </div>
            <div className="flex items-center space-x-3">
              <div className="font-black leading-none tracking-tight text-white font-['Space_Grotesk',sans-serif] text-base flex flex-col">
                <span className="text-white">CLAIM</span>
                <span><span className="text-white">DO</span><span className="text-[#F4A6C1]">GE</span></span>
              </div>
              <span className="px-2 py-0.5 bg-[#F4A6C1]/10 border border-[#F4A6C1]/20 text-[#F4A6C1] text-[10px] font-mono rounded-md uppercase">SECURE DEMO TESTNET</span>
            </div>
          </div>

          <div className="flex items-center space-x-4">
            <div className="bg-black border border-slate-800 px-4 py-2 rounded-xl flex items-center space-x-2">
              <Wallet className="w-4 h-4 text-[#F4A6C1]" />
              <span className="text-sm font-black font-mono text-white">{demoBalance.toFixed(4)} DOGE</span>
              <span className="text-[10px] font-mono bg-[#F4A6C1]/10 text-[#F4A6C1] px-1.5 py-0.5 rounded border border-[#F4A6C1]/20">DEMO</span>
            </div>
            <button
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
        <aside className="w-full md:w-64 space-y-2 shrink-0">
          <div className="bg-black border border-slate-800 rounded-2xl p-3 space-y-1">
            <button
              onClick={() => setActiveTab('profile')}
              className={`w-full flex items-center space-x-3 px-4 py-3 rounded-xl text-sm font-bold transition-all font-['Space_Grotesk',sans-serif] ${activeTab === 'profile' ? 'bg-[#F4A6C1] text-black font-black shadow-lg shadow-[#F4A6C1]/20' : 'text-slate-400 hover:bg-slate-900 hover:text-white'}`}
            >
              <User className="w-4 h-4" />
              <span>Profile</span>
            </button>

            <button
              onClick={() => setActiveTab('faucet')}
              className={`w-full flex items-center space-x-3 px-4 py-3 rounded-xl text-sm font-bold transition-all font-['Space_Grotesk',sans-serif] ${activeTab === 'faucet' ? 'bg-[#F4A6C1] text-black font-black shadow-lg shadow-[#F4A6C1]/20' : 'text-slate-400 hover:bg-slate-900 hover:text-white'}`}
            >
              <RefreshCw className="w-4 h-4" />
              <span>Doge Faucet</span>
            </button>

            <button
              onClick={() => setActiveTab('wallet')}
              className={`w-full flex items-center space-x-3 px-4 py-3 rounded-xl text-sm font-bold transition-all font-['Space_Grotesk',sans-serif] ${activeTab === 'wallet' ? 'bg-[#F4A6C1] text-black font-black shadow-lg shadow-[#F4A6C1]/20' : 'text-slate-400 hover:bg-slate-900 hover:text-white'}`}
            >
              <Wallet className="w-4 h-4" />
              <span>Wallet & Withdraw</span>
            </button>

            <button
              onClick={() => setActiveTab('referrals')}
              className={`w-full flex items-center space-x-3 px-4 py-3 rounded-xl text-sm font-bold transition-all font-['Space_Grotesk',sans-serif] ${activeTab === 'referrals' ? 'bg-[#F4A6C1] text-black font-black shadow-lg shadow-[#F4A6C1]/20' : 'text-slate-400 hover:bg-slate-900 hover:text-white'}`}
            >
              <Users className="w-4 h-4" />
              <span>Referral Program</span>
            </button>

            <button
              onClick={() => setActiveTab('email')}
              className={`w-full flex items-center space-x-3 px-4 py-3 rounded-xl text-sm font-bold transition-all font-['Space_Grotesk',sans-serif] ${activeTab === 'email' ? 'bg-[#F4A6C1] text-black font-black shadow-lg shadow-[#F4A6C1]/20' : 'text-slate-400 hover:bg-slate-900 hover:text-white'}`}
            >
              <MailCheck className="w-4 h-4" />
              <span>Email Verification</span>
            </button>

            {isDemoAdmin && (
              <button
                onClick={() => setActiveTab('admin')}
                className={`w-full flex items-center space-x-3 px-4 py-3 rounded-xl text-sm font-bold transition-all font-['Space_Grotesk',sans-serif] ${activeTab === 'admin' ? 'bg-[#F4A6C1] text-black font-black shadow-lg shadow-[#F4A6C1]/20' : 'text-slate-400 hover:bg-slate-900 hover:text-white'}`}
              >
                <Shield className="w-4 h-4" />
                <span>Admin Dashboard</span>
              </button>
            )}
          </div>

          <div className="bg-black border border-slate-800 rounded-2xl p-4 text-xs space-y-2">
            <div className="flex justify-between text-slate-400">
              <span>Email:</span>
              <span className="text-white font-mono truncate max-w-[130px]">{firebaseUser.email}</span>
            </div>
            <div className="flex justify-between text-slate-400">
              <span>Auth Status:</span>
              <span className="text-emerald-400 font-mono font-bold">Authenticated</span>
            </div>
            <div className="flex justify-between text-slate-400">
              <span>Ref Code:</span>
              <span className="text-[#F4A6C1] font-mono font-bold">{userProfile.refCode}</span>
            </div>
          </div>
        </aside>

        <main className="flex-1">
          {activeTab === 'profile' && (
            <ProfilePanel user={firebaseUser} />
          )}

          {activeTab === 'email' && (
            <EmailVerificationPanel
              user={firebaseUser}
              onVerified={() => setEmailVerified(true)}
            />
          )}

          {activeTab === 'faucet' && (
            <div className="bg-black border border-slate-800 rounded-2xl p-6 md:p-8 space-y-6">
              <div>
                <h2 className="text-xl font-black text-white mb-1 font-['Space_Grotesk',sans-serif]">Crypto Faucet Claim (DEMO)</h2>
                <p className="text-sm text-slate-400">Claim your simulated testnet reward of 0.001 DOGE every 45 seconds.</p>

                {emailVerified === false && (
                  <div className="mt-4 p-3 bg-[#F4A6C1]/10 border border-[#F4A6C1]/20 text-[#F4A6C1] text-xs rounded-xl flex items-start space-x-2">
                    <MailCheck className="w-4 h-4 shrink-0 mt-0.5" />
                    <span>
                      Your email is not verified yet. The server blocks faucet claims until you verify it.
                      <button
                        type="button"
                        onClick={() => setActiveTab('email')}
                        className="ml-1 underline font-bold"
                      >
                        Verify now
                      </button>
                    </span>
                  </div>
                )}
              </div>

              <div className="bg-black border border-slate-800 rounded-2xl p-8 flex flex-col items-center justify-center text-center space-y-6">
                <div className="bg-[#F4A6C1]/10 p-4 rounded-2xl border border-[#F4A6C1]/20 text-[#F4A6C1]">
                  <Award className="w-10 h-10" />
                </div>

                <div>
                  <span className="text-xs uppercase tracking-widest text-slate-500 font-mono font-bold">Simulated Testnet Reward</span>
                  <div className="text-3xl font-black font-mono text-white mt-1">0.001000 DOGE</div>
                  <span className="inline-block mt-2 px-2 py-0.5 bg-[#F4A6C1]/10 text-[#F4A6C1] text-[10px] font-mono rounded border border-[#F4A6C1]/20 uppercase font-bold">DEMO BALANCES ONLY</span>
                </div>

                {cooldownLeft > 0 ? (
                  <div className="w-full max-w-sm bg-black border border-slate-800 p-4 rounded-xl space-y-2">
                    <div className="flex items-center justify-center space-x-2 text-[#F4A6C1] text-sm font-bold">
                      <Clock className="w-4 h-4 animate-spin" />
                      <span>Cooldown Active: {cooldownLeft}s remaining</span>
                    </div>
                    <div className="w-full bg-black h-2 rounded-full overflow-hidden border border-slate-800">
                      <div
                        className="bg-[#F4A6C1] h-full transition-all duration-1000"
                        style={{ width: `${(cooldownLeft / 45) * 100}%` }}
                      />
                    </div>
                  </div>
                ) : (
                  <button
                    onClick={handleClaim}
                    disabled={isClaiming}
                    className="w-full max-w-sm bg-[#F4A6C1] hover:bg-[#e091ad] text-black font-black py-4 rounded-xl transition-all shadow-lg shadow-[#F4A6C1]/20 flex items-center justify-center space-x-2 text-base font-['Space_Grotesk',sans-serif] tracking-wide"
                  >
                    {isClaiming ? <RefreshCw className="w-5 h-5 animate-spin" /> : <CheckCircle className="w-5 h-5" />}
                    <span>{isClaiming ? 'Processing Claim...' : 'Claim 0.001 DOGE (Demo)'}</span>
                  </button>
                )}

                {claimStatus && (
                  <p className="text-sm font-bold text-emerald-400 font-['Space_Grotesk',sans-serif]">
                    {claimStatus}
                  </p>
                )}
              </div>
            </div>
          )}

          {activeTab === 'wallet' && (
            <div className="bg-black border border-slate-800 rounded-2xl p-6 md:p-8 space-y-6">
              <div>
                <h2 className="text-xl font-black text-white mb-1 font-['Space_Grotesk',sans-serif]">Wallet & Withdrawals (DEMO)</h2>
                <p className="text-sm text-slate-400">Simulate cryptocurrency withdrawals. Minimum withdrawal is 5.0 DEMO DOGE. No real payments.</p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="bg-black border border-slate-800 rounded-2xl p-6 flex flex-col justify-between">
                  <div>
                    <span className="text-xs uppercase tracking-wider text-slate-500 font-mono font-bold">Available Demo Balance</span>
                    <div className="text-3xl font-black font-mono text-white mt-2">{demoBalance.toFixed(4)} DOGE</div>
                  </div>
                  <div className="mt-6 pt-6 border-t border-slate-800 text-xs text-slate-400 flex justify-between font-bold">
                    <span>Minimum Testnet Payout:</span>
                    <span className="text-white font-mono font-black">5.0 DOGE</span>
                  </div>
                </div>

                <form onSubmit={handleWithdraw} className="bg-black border border-slate-800 rounded-2xl p-6 space-y-4">
                  <h3 className="text-sm font-black uppercase tracking-wider text-slate-300 font-['Space_Grotesk',sans-serif]">Request Simulated Payout</h3>
                  <div>
                    <label className="block text-xs font-bold uppercase tracking-wider text-slate-400 mb-1">Amount (DOGE)</label>
                    <input
                      type="number"
                      step="0.001"
                      min="5.0"
                      value={withdrawAmount}
                      onChange={(e) => setWithdrawAmount(e.target.value)}
                      className="w-full bg-black border border-slate-800 rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:border-[#F4A6C1] focus:ring-1 focus:ring-[#F4A6C1] font-mono font-bold"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold uppercase tracking-wider text-slate-400 mb-1">Dogecoin Wallet Address</label>
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
                    className="w-full bg-[#F4A6C1] hover:bg-[#e091ad] text-black font-black py-3 rounded-xl transition-all shadow-lg shadow-[#F4A6C1]/20 text-sm font-['Space_Grotesk',sans-serif] tracking-wide"
                  >
                    Submit Simulated Withdrawal
                  </button>
                  {withdrawMsg && (
                    <p className="text-xs font-bold text-[#F4A6C1]">
                      {withdrawMsg}
                    </p>
                  )}
                </form>
              </div>

              <div className="mt-8">
                <h3 className="text-sm font-black uppercase tracking-wider text-slate-300 mb-4 font-['Space_Grotesk',sans-serif]">Simulated Withdrawal History</h3>
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
                            <td colSpan="4" className="p-6 text-center text-slate-500">No simulated withdrawals found.</td>
                          </tr>
                        ) : (
                          demoWithdrawals.map(w => (
                            <tr key={w.id}>
                              <td className="p-4 text-white font-black">{w.amount} DOGE</td>
                              <td className="p-4 text-slate-400 truncate max-w-[150px]">{w.address}</td>
                              <td className="p-4">
                                <span className={`px-2 py-1 rounded-md text-[10px] uppercase font-black ${
                                  w.status === 'approved' ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' :
                                  w.status === 'rejected' ? 'bg-red-500/10 text-red-400 border border-red-500/20' :
                                  'bg-[#F4A6C1]/10 text-[#F4A6C1] border border-[#F4A6C1]/20'
                                }`}>
                                  {w.status}
                                </span>
                              </td>
                              <td className="p-4 text-slate-500">{new Date(w.timestamp).toLocaleDateString()}</td>
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

          {activeTab === 'referrals' && (
            <div className="bg-black border border-slate-800 rounded-2xl p-6 md:p-8 space-y-6">
              <div>
                <h2 className="text-xl font-black text-white mb-1 font-['Space_Grotesk',sans-serif]">Referral Program (DEMO)</h2>
                <p className="text-sm text-slate-400">Share your testnet referral code for simulated bonuses.</p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="bg-black border border-slate-800 rounded-2xl p-5">
                  <span className="text-xs uppercase tracking-wider text-slate-500 font-mono font-bold">Your Referral Code</span>
                  <div className="text-2xl font-black font-mono text-[#F4A6C1] mt-1">{userProfile.refCode}</div>
                </div>
                <div className="bg-black border border-slate-800 rounded-2xl p-5">
                  <span className="text-xs uppercase tracking-wider text-slate-500 font-mono font-bold">Invited Users</span>
                  <div className="text-2xl font-black font-mono text-white mt-1">0</div>
                </div>
                <div className="bg-black border border-slate-800 rounded-2xl p-5">
                  <span className="text-xs uppercase tracking-wider text-slate-500 font-mono font-bold">Demo Commission</span>
                  <div className="text-2xl font-black font-mono text-emerald-400 mt-1">0.0000 DOGE</div>
                </div>
              </div>

              <div className="bg-black border border-slate-800 rounded-2xl p-6 space-y-4">
                <h3 className="text-sm font-black uppercase tracking-wider text-slate-300 font-['Space_Grotesk',sans-serif]">How Referrals Work (Simulated)</h3>
                <ul className="text-sm text-slate-400 space-y-2 list-disc list-inside font-medium">
                  <li>Share your code <strong className="text-[#F4A6C1] font-mono font-black">{userProfile.refCode}</strong> with others.</li>
                  <li>In this secure demo environment, referral tracking operates locally as a testnet simulation.</li>
                </ul>
              </div>
            </div>
          )}

          {activeTab === 'admin' && isDemoAdmin && (
            <div className="bg-black border border-slate-800 rounded-2xl p-6 md:p-8 space-y-6">
              <div>
                <h2 className="text-xl font-black text-white mb-1 font-['Space_Grotesk',sans-serif]">Admin Dashboard (UI DEMO REVIEW)</h2>
                <p className="text-sm text-slate-400">Review simulated withdrawal requests on the testnet demo ledger.</p>
              </div>

              <div className="mb-4 p-3 bg-[#F4A6C1]/10 border border-[#F4A6C1]/20 text-[#F4A6C1] text-xs rounded-xl flex items-center space-x-2 font-bold">
                <Lock className="w-4 h-4 shrink-0" />
                <span>UI-Only Protection Notice: This admin view is restricted in the UI for demonstration purposes only using email comparison. It does not enforce real cryptographic server-side authorization.</span>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="bg-black border border-slate-800 rounded-2xl p-5">
                  <span className="text-xs uppercase tracking-wider text-slate-500 font-mono font-bold">Total Pending</span>
                  <div className="text-2xl font-black font-mono text-[#F4A6C1] mt-1">{adminWithdrawals.filter(w => w.status === 'pending').length}</div>
                </div>
                <div className="bg-black border border-slate-800 rounded-2xl p-5">
                  <span className="text-xs uppercase tracking-wider text-slate-500 font-mono font-bold">Total Requests</span>
                  <div className="text-2xl font-black font-mono text-white mt-1">{adminWithdrawals.length}</div>
                </div>
                <div className="bg-black border border-slate-800 rounded-2xl p-5">
                  <span className="text-xs uppercase tracking-wider text-slate-500 font-mono font-bold">Environment</span>
                  <div className="text-2xl font-black font-mono text-emerald-400 mt-1">Spark Demo</div>
                </div>
              </div>

              <div>
                <h3 className="text-sm font-black uppercase tracking-wider text-slate-300 mb-4 font-['Space_Grotesk',sans-serif]">Pending Withdrawals Review</h3>
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
                        {adminWithdrawals.filter(w => w.status === 'pending').length === 0 ? (
                          <tr>
                            <td colSpan="5" className="p-6 text-center text-slate-500">No pending simulated withdrawals.</td>
                          </tr>
                        ) : (
                          adminWithdrawals.filter(w => w.status === 'pending').map(w => (
                            <tr key={w.id}>
                              <td className="p-4 text-white">{w.email || 'Test User'}</td>
                              <td className="p-4 text-[#F4A6C1] font-black">{w.amount} DOGE</td>
                              <td className="p-4 text-slate-400 truncate max-w-[120px]">{w.address}</td>
                              <td className="p-4">
                                <span className="px-2 py-1 rounded-md text-[10px] uppercase font-black bg-[#F4A6C1]/10 text-[#F4A6C1] border border-[#F4A6C1]/20">
                                  {w.status}
                                </span>
                              </td>
                              <td className="p-4 flex space-x-2">
                                <button
                                  onClick={() => handleAdminApprove(w.id)}
                                  className="px-3 py-1 bg-emerald-500/10 hover:bg-emerald-500/20 border border-emerald-500/20 text-emerald-400 rounded-lg font-black transition-colors"
                                >
                                  Approve
                                </button>
                                <button
                                  onClick={() => handleAdminReject(w.id)}
                                  className="px-3 py-1 bg-red-500/10 hover:bg-red-500/20 border border-red-500/20 text-red-400 rounded-lg font-black transition-colors"
                                >
                                  Reject
                                </button>
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
        </main>
      </div>
    </div>
  );
}

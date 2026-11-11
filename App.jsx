import React, { useState, useEffect, useRef, useCallback } from 'react';
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
  Gift,
  Sparkles,
  Ticket,
  CalendarCheck
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

// >>> VETËM KËTË RRESHT DUHET TA NDRYSHOSH: vendos Site Key real nga Cloudflare → Turnstile
const TURNSTILE_SITE_KEY = "SITE_KEY_I_VERTETE_KETU";

const REF_CODE_REGEX = /^DOGE[A-HJ-NP-Z2-9]{6}$/;
const KOINU = 100000000;

// SHARED STYLE CLASSES
const LABEL_CLS =
  'block text-xs font-bold uppercase tracking-wider text-slate-400 mb-1';

const INPUT_CLS =
  'w-full bg-black border border-slate-800 focus:border-[#F4A6C1] focus:outline-none text-white placeholder-slate-600 rounded-xl px-4 py-3 text-sm transition-colors';

const PRIMARY_BTN =
  "w-full bg-[#F4A6C1] hover:bg-[#e091ad] disabled:opacity-50 disabled:cursor-not-allowed text-black font-black py-3 rounded-xl transition-all shadow-lg shadow-[#F4A6C1]/20 flex items-center justify-center space-x-2 text-sm font-['Space_Grotesk',sans-serif] tracking-wide";

// LUCKY WHEEL (presentation constants only)
const WHEEL_SPIN_MS = 5200;
const WHEEL_EXTRA_TURNS = 6;
const WHEEL_SLICE_FILLS = ['#050505', '#1c0f15'];

// DAILY STREAK (DISPLAY ONLY: the Worker decides and pays the real reward)
const STREAK_CYCLE_DAYS = [1, 2, 3, 4, 5, 6, 7];
const STREAK_REWARD_KOINU = {
  1: 1000,
  2: 2000,
  3: 3000,
  4: 4000,
  5: 5000,
  6: 6000,
  7: 7000
};

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

const isNum = (v) =>
  v !== null && v !== undefined && v !== '' && Number.isFinite(Number(v));

const formatCooldown = (seconds) => {
  if (!isNum(seconds)) return '...';
  return Number(seconds) === 0 ? 'No cooldown' : `${Number(seconds)} seconds`;
};

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

const newRequestId = () => {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `req_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 12)}`;
};

const formatDuration = (totalSeconds) => {
  const s = Math.max(0, Math.floor(totalSeconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return `${h}h ${String(m).padStart(2, '0')}m ${String(sec).padStart(2, '0')}s`;
};

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

const formatDoge = (koinu) =>
  isNum(koinu) ? String(Number((Number(koinu) / KOINU).toFixed(8))) : '...';

const mapWithdrawal = (w) => ({
  id: w.id,
  userId: w.uid || w.userId || '',
  email: w.email || '',
  amount: Number(w.amount_koinu) / KOINU,
  address: w.wallet_address || w.address || '',
  status: w.status || 'pending',
  timestamp: parseServerDate(w.created_at)?.getTime() ?? null
});

const prizeLabel = (p) => {
  if (!p) return '';
  if (typeof p.label === 'string' && p.label) return p.label;
  return `${formatDoge(p.amount_koinu)} DOGE`;
};

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

const PinkDivider = () => (
  <div
    aria-hidden="true"
    className="h-px w-full bg-gradient-to-r from-transparent via-[#F4A6C1] to-transparent opacity-70"
  />
);

const WheelGraphic = ({ prizes }) => {
  const size = 400;
  const c = size / 2;
  const r = 190;
  const n = prizes.length;
  const sliceAngle = n > 0 ? 360 / n : 360;

  const point = (angleDeg, radius) => {
    const a = (angleDeg * Math.PI) / 180;
    return [c + radius * Math.sin(a), c - radius * Math.cos(a)];
  };

  return (
    <svg
      viewBox={`0 0 ${size} ${size}`}
      className="w-full h-full block"
      role="img"
      aria-label="Lucky Wheel"
    >
      <circle cx={c} cy={c} r={r + 6} fill="#000" stroke="#F4A6C1" strokeWidth="3" />

      {n === 1 && (
        <circle cx={c} cy={c} r={r} fill={WHEEL_SLICE_FILLS[0]} stroke="#F4A6C1" strokeWidth="2" />
      )}

      {n > 1 && prizes.map((p, i) => {
        const start = i * sliceAngle;
        const end = (i + 1) * sliceAngle;
        const [x1, y1] = point(start, r);
        const [x2, y2] = point(end, r);
        const largeArc = sliceAngle > 180 ? 1 : 0;
        const mid = start + sliceAngle / 2;
        const labelY = c - r * 0.58;

        return (
          <g key={`${p.id}-${i}`}>
            <path
              d={`M ${c} ${c} L ${x1} ${y1} A ${r} ${r} 0 ${largeArc} 1 ${x2} ${y2} Z`}
              fill={WHEEL_SLICE_FILLS[i % WHEEL_SLICE_FILLS.length]}
              stroke="#F4A6C1"
              strokeWidth="2"
            />
            <g transform={`rotate(${mid} ${c} ${c})`}>
              <text
                x={c}
                y={labelY}
                transform={`rotate(-90 ${c} ${labelY})`}
                textAnchor="middle"
                dominantBaseline="middle"
                fill="#ffffff"
                fontSize="19"
                fontWeight="800"
                fontFamily="'Space Grotesk', ui-monospace, monospace"
              >
                {prizeLabel(p)}
              </text>
            </g>
          </g>
        );
      })}

      {Array.from({ length: 24 }).map((_, i) => {
        const [sx, sy] = point(i * 15, r + 6);
        return <circle key={i} cx={sx} cy={sy} r="2.5" fill="#F4A6C1" />;
      })}
    </svg>
  );
};

export default function App() {
  const [activeTab, setActiveTab] = useState('faucet');

  const [firebaseUser, setFirebaseUser] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [userProfile, setUserProfile] = useState(null);
  const [authMode, setAuthMode] = useState('login');
  const [apiReady, setApiReady] = useState(false);
  const [apiError, setApiError] = useState('');

  // Turnstile state dhe refs
  const [turnstileToken, setTurnstileToken] = useState('');
  const turnstileWidgetIdRef = useRef(null);

  const renderTurnstileWidget = useCallback((containerId) => {
    const el = document.getElementById(containerId);
    if (!window.turnstile || !el) return false;

    try {
      if (turnstileWidgetIdRef.current !== null) {
        try { window.turnstile.remove(turnstileWidgetIdRef.current); } catch {}
        turnstileWidgetIdRef.current = null;
      }

      el.innerHTML = '';
      setTurnstileToken('');

      turnstileWidgetIdRef.current = window.turnstile.render(el, {
        sitekey: TURNSTILE_SITE_KEY,
        theme: 'dark',
        callback: (token) => setTurnstileToken(token),
        'expired-callback': () => setTurnstileToken(''),
        'error-callback': () => setTurnstileToken('')
      });

      return true;
    } catch (e) {
      console.error('Turnstile render error:', e);
      return false;
    }
  }, []);

  const resetTurnstile = () => {
    setTurnstileToken('');
    if (window.turnstile && turnstileWidgetIdRef.current !== null) {
      try {
        window.turnstile.reset(turnstileWidgetIdRef.current);
      } catch (e) {
        console.error("Turnstile reset error:", e);
      }
    }
  };

  // Ngarko skriptën e Turnstile një herë
  useEffect(() => {
    if (window.turnstile) return;
    if (document.querySelector('script[data-turnstile]')) return;

    const s = document.createElement('script');
    s.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
    s.async = true;
    s.defer = true;
    s.setAttribute('data-turnstile', '1');
    document.head.appendChild(s);
  }, []);

  // Vizato widget-in vetëm kur div-i ekziston (pas login-it) dhe skripta është gati
  useEffect(() => {
    if (authLoading || !firebaseUser || !userProfile) return;
    if (!['faucet', 'wheel', 'streak'].includes(activeTab)) return;

    const containerId = `turnstile-${activeTab}`;
    let tries = 0;

    const timer = setInterval(() => {
      tries++;
      if (renderTurnstileWidget(containerId) || tries >= 40) {
        clearInterval(timer);
      }
    }, 250);

    return () => {
      clearInterval(timer);
      if (window.turnstile && turnstileWidgetIdRef.current !== null) {
        try { window.turnstile.remove(turnstileWidgetIdRef.current); } catch {}
        turnstileWidgetIdRef.current = null;
      }
    };
  }, [activeTab, authLoading, firebaseUser, userProfile, renderTurnstileWidget]);

  const pendingReferralRef = useRef(null);
  const authEventRef = useRef(0);
  const [authSyncRetry, setAuthSyncRetry] = useState(0);

  const claimInFlightRef = useRef(false);
  const claimStatusTimerRef = useRef(null);
  const claimRequestIdRef = useRef(null);
  const pendingUsernameRef = useRef('');
  const lastUtcDayRef = useRef(utcDayKey());

  const [usernameInput, setUsernameInput] = useState('');
  const [emailInput, setEmailInput] = useState('');
  const [passwordInput, setPasswordInput] = useState('');
  const [regRefCode, setRegRefCode] = useState('');
  const [authError, setAuthError] = useState('');
  const [authSuccess, setAuthSuccess] = useState('');
  const [isLoadingAuth, setIsLoadingAuth] = useState(false);

  const [minWithdrawal, setMinWithdrawal] = useState(1);

  const [planInfo, setPlanInfo] = useState(null);
  const [accountError, setAccountError] = useState('');
  const [resetSeconds, setResetSeconds] = useState(secondsUntilUtcReset());
  const [accountSyncTick, setAccountSyncTick] = useState(0);

  const [demoBalance, setDemoBalance] = useState(0);
  const [claimsLoading, setClaimsLoading] = useState(false);
  const [claimsError, setClaimsError] = useState('');
  const [cooldownLeft, setCooldownLeft] = useState(0);
  const [claimStatus, setClaimStatus] = useState('');
  const [claimIsError, setClaimIsError] = useState(false);
  const [showClaimEffect, setShowClaimEffect] = useState(false);
  const [isClaiming, setIsClaiming] = useState(false);
  const [demoClaims, setDemoClaims] = useState([]);

  const [demoWithdrawals, setDemoWithdrawals] = useState([]);
  const [withdrawAmount, setWithdrawAmount] = useState('1.0');
  const [withdrawAddress, setWithdrawAddress] = useState('');
  const [withdrawMsg, setWithdrawMsg] = useState('');
  const [isWithdrawing, setIsWithdrawing] = useState(false);

  const [refCode, setRefCode] = useState('');
  const [referralStats, setReferralStats] = useState(null);
  const [referralLoading, setReferralLoading] = useState(false);
  const [referralError, setReferralError] = useState('');

  const [wheelPrizes, setWheelPrizes] = useState([]);
  const [wheelPacks, setWheelPacks] = useState([]);
  const [wheelSpins, setWheelSpins] = useState(null);
  const [wheelHistory, setWheelHistory] = useState([]);
  const [wheelPurchases, setWheelPurchases] = useState([]);
  const [wheelLoading, setWheelLoading] = useState(false);
  const [wheelError, setWheelError] = useState('');
  const [wheelBackendMissing, setWheelBackendMissing] = useState(false);
  const [wheelRotation, setWheelRotation] = useState(0);
  const [wheelAnimating, setWheelAnimating] = useState(false);
  const [isSpinning, setIsSpinning] = useState(false);
  const [wheelResult, setWheelResult] = useState(null);
  const [wheelMsg, setWheelMsg] = useState('');
  const [wheelMsgIsError, setWheelMsgIsError] = useState(false);
  const [buyingPackId, setBuyingPackId] = useState(null);
  const spinInFlightRef = useRef(false);
  const spinTimerRef = useRef(null);
  const wheelRotationRef = useRef(0);
  const wheelSpinRequestIdRef = useRef(null);
  const wheelBuyRequestRef = useRef(null);
  const [wheelCaps, setWheelCaps] = useState(null);

  const [streakInfo, setStreakInfo] = useState(null);
  const [streakLoading, setStreakLoading] = useState(false);
  const [streakError, setStreakError] = useState('');
  const [streakMsg, setStreakMsg] = useState('');
  const [streakMsgIsError, setStreakMsgIsError] = useState(false);
  const [isCheckingIn, setIsCheckingIn] = useState(false);
  const streakInFlightRef = useRef(false);

  const [adminWithdrawals, setAdminWithdrawals] = useState([]);
  const [adminLoading, setAdminLoading] = useState(false);
  const [adminError, setAdminError] = useState('');
  const [adminActionLoading, setAdminActionLoading] = useState(null);
  const [adminStats, setAdminStats] = useState(null);
  const [adminStatsLoading, setAdminStatsLoading] = useState(false);
  const [adminStatsError, setAdminStatsError] = useState('');

  const adminEmail = firebaseUser?.email?.trim().toLowerCase() || '';

  const adminTheme =
    adminEmail === ADMIN_EMAILS.lilac
      ? 'lilac'
      : adminEmail === ADMIN_EMAILS.blue
        ? 'blue'
        : null;

  const isDemoAdmin = Boolean(adminTheme);
  const isBlueAdmin = adminTheme === 'blue';

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

  const apiRequest = useCallback(async (path, options = {}) => {
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
  }, [firebaseUser]);

  const applyAccountData = useCallback((data) => {
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
  }, []);

  const applyWheelSpins = useCallback((spins) => {
    if (!spins || typeof spins !== 'object') return;

    const patch = {};
    if (isNum(spins.free_remaining)) patch.freeRemaining = Number(spins.free_remaining);
    if (isNum(spins.free_total)) patch.freeTotal = Number(spins.free_total);
    if (isNum(spins.paid_remaining)) patch.paidRemaining = Number(spins.paid_remaining);

    if (isNum(spins.total_remaining)) {
      patch.totalRemaining = Number(spins.total_remaining);
    } else if (isNum(spins.free_remaining) && isNum(spins.paid_remaining)) {
      patch.totalRemaining =
        Number(spins.free_remaining) + Number(spins.paid_remaining);
    }

    if (Object.keys(patch).length > 0) {
      setWheelSpins(prev => ({ ...(prev || {}), ...patch }));
    }
  }, []);

  const applyWheelState = useCallback((data) => {
    if (!data || typeof data !== 'object') return;

    if (Array.isArray(data.prizes)) {
      setWheelPrizes(data.prizes);
    }

    if (Array.isArray(data.packs)) {
      setWheelPacks(data.packs);
    }

    if (
      typeof data.wheel_enabled === 'boolean' &&
      typeof data.can_buy === 'boolean'
    ) {
      setWheelCaps({ enabled: data.wheel_enabled, canBuy: data.can_buy });
    }

    applyWheelSpins(data.spins);
    applyAccountData(data);
  }, [applyWheelSpins, applyAccountData]);

  const applyStreakData = useCallback((data) => {
    if (!data || typeof data !== 'object') return;
    if (!isNum(data.current_day)) return;

    setStreakInfo({
      currentDay: Number(data.current_day),
      nextDay: isNum(data.next_day) ? Number(data.next_day) : 0,
      lastCheckinDate: data.last_checkin_date || null,
      checkedInToday: data.checked_in_today === true,
      canCheckin: data.can_checkin === true,
      nextRewardKoinu: isNum(data.next_reward_koinu)
        ? Number(data.next_reward_koinu)
        : 0,
      totalRewardsKoinu: isNum(data.total_rewards_koinu)
        ? Number(data.total_rewards_koinu)
        : 0
    });
  }, []);

  useEffect(() => {
    if (activeTab === 'admin' && !isDemoAdmin) {
      setActiveTab('faucet');
    }
  }, [activeTab, isDemoAdmin]);

  useEffect(() => {
    let isMounted = true;

    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      const eventId = ++authEventRef.current;

      if (!isMounted) return;

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
      setAdminStats(null);
      setAdminStatsError('');
      setAdminStatsLoading(false);
      setReferralLoading(false);
      setClaimsLoading(false);
      setAdminLoading(false);
      setWheelPrizes([]);
      setWheelPacks([]);
      setWheelSpins(null);
      setWheelHistory([]);
      setWheelPurchases([]);
      setWheelError('');
      setWheelBackendMissing(false);
      setWheelCaps(null);
      setWheelResult(null);
      setWheelMsg('');
      setWheelLoading(false);
      setClaimStatus('');
      setWheelAnimating(false);
      setIsSpinning(false);
      setBuyingPackId(null);
      setStreakInfo(null);
      setStreakLoading(false);
      setStreakError('');
      setStreakMsg('');
      setStreakMsgIsError(false);
      setIsCheckingIn(false);
      streakInFlightRef.current = false;
      spinInFlightRef.current = false;
      wheelSpinRequestIdRef.current = null;
      wheelBuyRequestRef.current = null;
      claimRequestIdRef.current = null;

      if (spinTimerRef.current) {
        clearTimeout(spinTimerRef.current);
        spinTimerRef.current = null;
      }

      if (!user) {
        setAuthLoading(false);
        return;
      }

      setAuthLoading(true);

      const referredBy = pendingReferralRef.current;

      const fallbackProfile = {
        uid: user.uid,
        email: user.email,
        username:
          pendingUsernameRef.current ||
          (user.email ? user.email.split('@')[0] : 'User'),
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

        if (syncData.plan) {
          setPlanInfo(prev => ({
            ...(prev || {}),
            name: syncData.plan.toUpperCase()
          }));
        }

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

  useEffect(() => {
    if (!firebaseUser || !apiReady) return;

    let cancelled = false;

    const loadAccount = async () => {
      try {
        const data = await apiRequest('/api/balance');

        if (cancelled || claimInFlightRef.current) return;
        if (spinInFlightRef.current) return;

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
  }, [firebaseUser, apiReady, activeTab, accountSyncTick, apiRequest, applyAccountData]);

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
  }, [firebaseUser, apiReady, apiRequest]);

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
  }, [firebaseUser, apiReady, apiRequest]);

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
  }, [firebaseUser, apiReady, activeTab, apiRequest]);

  useEffect(() => {
    if (!firebaseUser || !apiReady) return;
    if (activeTab !== 'wheel') return;

    let cancelled = false;

    const loadWheel = async () => {
      setWheelLoading(true);
      setWheelError('');

      try {
        const state = await apiRequest('/api/wheel/state');

        if (cancelled) return;

        setWheelBackendMissing(false);

        if (!spinInFlightRef.current) {
          applyWheelState(state);
        }
      } catch (error) {
        if (cancelled) return;

        if (error.status === 404) {
          setWheelBackendMissing(true);
        } else {
          setWheelError(error.message || 'Could not load the Lucky Wheel.');
        }

        setWheelLoading(false);
        return;
      }

      try {
        const history = await apiRequest('/api/wheel/history');

        if (!cancelled) {
          setWheelHistory(Array.isArray(history.spins) ? history.spins : []);
          setWheelPurchases(
            Array.isArray(history.purchases) ? history.purchases : []
          );
        }
      } catch (error) {
        if (!cancelled && error.status !== 404) {
          setWheelError(error.message || 'Could not load the wheel history.');
        }
      } finally {
        if (!cancelled) {
          setWheelLoading(false);
        }
      }
    };

    loadWheel();

    return () => {
      cancelled = true;
    };
  }, [firebaseUser, apiReady, activeTab, accountSyncTick, apiRequest, applyWheelState]);

  useEffect(() => {
    if (!firebaseUser || !apiReady) {
      setStreakInfo(null);
      return;
    }

    let cancelled = false;

    const loadStreak = async () => {
      setStreakLoading(true);
      setStreakError('');

      try {
        const data = await apiRequest('/api/streak');

        if (!cancelled) {
          applyStreakData(data);
        }
      } catch (error) {
        if (!cancelled) {
          setStreakError(error.message || 'Could not load your daily streak.');
        }
      } finally {
        if (!cancelled) {
          setStreakLoading(false);
        }
      }
    };

    loadStreak();

    return () => {
      cancelled = true;
    };
  }, [firebaseUser, apiReady, accountSyncTick, apiRequest, applyStreakData]);

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
  }, [firebaseUser, apiReady, isDemoAdmin, apiRequest]);

  useEffect(() => {
    if (!firebaseUser || !apiReady || !isDemoAdmin) {
      setAdminStats(null);
      setAdminStatsError('');
      return;
    }

    let cancelled = false;

    const loadAdminStats = async () => {
      setAdminStatsLoading(true);
      setAdminStatsError('');

      try {
        const data = await apiRequest('/api/admin/stats');

        if (!cancelled) {
          setAdminStats(data);
        }
      } catch (error) {
        if (!cancelled) {
          setAdminStatsError(error.message || 'Could not load daily statistics.');
        }
      } finally {
        if (!cancelled) {
          setAdminStatsLoading(false);
        }
      }
    };

    loadAdminStats();

    return () => {
      cancelled = true;
    };
  }, [firebaseUser, apiReady, isDemoAdmin, accountSyncTick, apiRequest]);

  useEffect(() => {
    const timer = setInterval(() => {
      setCooldownLeft(prev => (prev > 0 ? prev - 1 : 0));
      setResetSeconds(secondsUntilUtcReset());

      const today = utcDayKey();

      if (today !== lastUtcDayRef.current) {
        lastUtcDayRef.current = today;
        setAccountSyncTick(t => t + 1);
      }
    }, 1000);

    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    return () => {
      if (claimStatusTimerRef.current) {
        clearTimeout(claimStatusTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    return () => {
      if (spinTimerRef.current) {
        clearTimeout(spinTimerRef.current);
      }
    };
  }, []);

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
      pendingReferralRef.current = referralCode || null;
      pendingUsernameRef.current = trimmedUsername;

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

      pendingUsernameRef.current = '';
      setUserProfile(localProfile);
      setAuthSuccess('Account created successfully!');
      setActiveTab('faucet');
      setUsernameInput('');
      setEmailInput('');
      setPasswordInput('');
      setRegRefCode('');
    } catch (error) {
      pendingReferralRef.current = null;
      pendingUsernameRef.current = '';
      setAuthError(error.message.replace('Firebase: ', ''));
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

  const handleSignOut = async () => {
    try {
      await signOut(auth);
      setActiveTab('faucet');
    } catch (error) {
      console.error('Sign out error:', error);
    }
  };

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

    const claimSession = authEventRef.current;

    if (!claimRequestIdRef.current) {
      claimRequestIdRef.current = newRequestId();
    }

    const requestId = claimRequestIdRef.current;

    if (claimStatusTimerRef.current) {
      clearTimeout(claimStatusTimerRef.current);
    }

    setClaimStatus('Processing claim...');

    try {
      const data = await apiRequest('/api/claim', {
        method: 'POST',
        body: JSON.stringify({ 
          request_id: requestId,
          turnstile_token: turnstileToken 
        })
      });

      claimRequestIdRef.current = null;
      resetTurnstile();

      if (claimSession !== authEventRef.current) return;

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
      if (typeof error.status === 'number') {
        claimRequestIdRef.current = null;
      }
      resetTurnstile();

      if (claimSession !== authEventRef.current) return;

      const reason = error.data?.reason;

      if (error.status === 429 && reason === 'daily_limit') {
        applyAccountData(error.data);
        showClaimMessage(
          'Daily claim limit reached. Your limit resets at 00:00 UTC.',
          true
        );
      } else if (error.status === 429) {
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

  const refreshWheelData = async () => {
    const [stateResult, historyResult] = await Promise.allSettled([
      apiRequest('/api/wheel/state'),
      apiRequest('/api/wheel/history')
    ]);

    if (stateResult.status === 'fulfilled') {
      applyWheelState(stateResult.value);
    }

    if (historyResult.status === 'fulfilled') {
      setWheelHistory(
        Array.isArray(historyResult.value.spins) ? historyResult.value.spins : []
      );
      setWheelPurchases(
        Array.isArray(historyResult.value.purchases)
          ? historyResult.value.purchases
          : []
      );
    }
  };

  const handleWheelSpin = async () => {
    if (spinInFlightRef.current || isSpinning) return;

    if (!firebaseUser || !apiReady) {
      setWheelMsgIsError(true);
      setWheelMsg('Database is not ready. Please try again.');
      return;
    }

    if (wheelPrizes.length < 2) {
      setWheelMsgIsError(true);
      setWheelMsg('The wheel is not available yet.');
      return;
    }

    spinInFlightRef.current = true;
    setIsSpinning(true);
    setWheelResult(null);
    setWheelMsg('');
    setWheelMsgIsError(false);

    if (!wheelSpinRequestIdRef.current) {
      wheelSpinRequestIdRef.current = newRequestId();
    }

    let data;

    try {
      data = await apiRequest('/api/wheel/spin', {
        method: 'POST',
        body: JSON.stringify({ 
          request_id: wheelSpinRequestIdRef.current,
          turnstile_token: turnstileToken 
        })
      });
      wheelSpinRequestIdRef.current = null;
      resetTurnstile();
    } catch (error) {
      if (typeof error.status === 'number') {
        wheelSpinRequestIdRef.current = null;
      }
      resetTurnstile();

      if (error.status === 404) {
        setWheelBackendMissing(true);
      } else {
        applyWheelSpins(error.data?.spins);
        setWheelMsgIsError(true);
        setWheelMsg(error.message || 'Could not spin the wheel.');
      }

      spinInFlightRef.current = false;
      setIsSpinning(false);
      return;
    }

    const spinData = data?.spin;
    const prize = spinData
      ? { id: spinData.prize_key, amount_koinu: spinData.amount_koinu }
      : null;
    const spinSource =
      spinData && typeof spinData.spin_type === 'string'
        ? spinData.spin_type
        : '';
    const prizeIndex = prize
      ? wheelPrizes.findIndex(p => String(p.id) === String(prize.id))
      : -1;

    const spinSession = authEventRef.current;

    const finish = async () => {
      if (spinSession !== authEventRef.current) return;

      setWheelAnimating(false);
      setWheelResult({
        prize,
        source: spinSource
      });

      applyAccountData(data);
      applyWheelSpins(data.spins);

      spinInFlightRef.current = false;
      setIsSpinning(false);

      await refreshWheelData();
    };

    if (!prize || prizeIndex < 0) {
      await finish();
      if (!prize) {
        setWheelResult(null);
        setWheelMsgIsError(true);
        setWheelMsg('The server did not return a prize. Check your balance and history.');
      }
      return;
    }

    const sliceAngle = 360 / wheelPrizes.length;
    const targetMod = (((-(prizeIndex + 0.5) * sliceAngle) % 360) + 360) % 360;
    const currentMod = ((wheelRotationRef.current % 360) + 360) % 360;
    const delta = (targetMod - currentMod + 360) % 360;
    const nextRotation =
      wheelRotationRef.current + 360 * WHEEL_EXTRA_TURNS + delta;

    wheelRotationRef.current = nextRotation;
    setWheelAnimating(true);
    setWheelRotation(nextRotation);

    if (spinTimerRef.current) {
      clearTimeout(spinTimerRef.current);
    }

    spinTimerRef.current = window.setTimeout(finish, WHEEL_SPIN_MS + 150);
  };

  const handleBuyPack = async (pack) => {
    if (!pack || spinInFlightRef.current || isSpinning || buyingPackId !== null) return;

    if (!firebaseUser || !apiReady) {
      setWheelMsgIsError(true);
      setWheelMsg('Database is not ready. Please try again.');
      return;
    }

    const confirmed = window.confirm(
      `Buy ${pack.spins} spin${Number(pack.spins) === 1 ? '' : 's'} for ${formatDoge(pack.price_koinu)} DEMO DOGE?`
    );

    if (!confirmed) return;

    setBuyingPackId(pack.id);
    setWheelMsg('');
    setWheelMsgIsError(false);

    if (
      !wheelBuyRequestRef.current ||
      wheelBuyRequestRef.current.packId !== pack.id
    ) {
      wheelBuyRequestRef.current = {
        packId: pack.id,
        requestId: newRequestId()
      };
    }

    try {
      const data = await apiRequest('/api/wheel/buy', {
        method: 'POST',
        body: JSON.stringify({
          pack_id: pack.id,
          request_id: wheelBuyRequestRef.current.requestId
        })
      });

      wheelBuyRequestRef.current = null;

      applyAccountData(data);
      applyWheelSpins(data.spins);

      setWheelMsgIsError(false);
      setWheelMsg(
        `Purchased ${pack.spins} spin${Number(pack.spins) === 1 ? '' : 's'}.`
      );

      await refreshWheelData();
    } catch (error) {
      if (typeof error.status === 'number') {
        wheelBuyRequestRef.current = null;
      }

      if (error.status === 404) {
        setWheelBackendMissing(true);
      } else {
        setWheelMsgIsError(true);
        setWheelMsg(error.message || 'Could not buy spins.');
      }
    } finally {
      setBuyingPackId(null);
    }
  };

  const showStreakMessage = (message, isError) => {
    setStreakMsgIsError(isError);
    setStreakMsg(message);
  };

  const refreshStreak = async (session) => {
    try {
      const data = await apiRequest('/api/streak');

      if (session !== authEventRef.current) return;

      applyStreakData(data);
      setStreakError('');
    } catch (error) {
      if (session !== authEventRef.current) return;

      setStreakError(error.message || 'Could not refresh your daily streak.');
    }
  };

  const handleStreakCheckin = async () => {
    if (streakInFlightRef.current || isCheckingIn) return;

    if (!firebaseUser || !apiReady) {
      showStreakMessage('Database is not ready. Please try again.', true);
      return;
    }

    if (!streakInfo || !streakInfo.canCheckin) return;

    streakInFlightRef.current = true;
    setIsCheckingIn(true);
    setStreakMsg('');
    setStreakMsgIsError(false);

    const streakSession = authEventRef.current;

    try {
      const data = await apiRequest('/api/streak/checkin', { 
        method: 'POST',
        body: JSON.stringify({
          turnstile_token: turnstileToken
        })
      });

      resetTurnstile();

      if (streakSession !== authEventRef.current) return;

      applyStreakData(data);
      applyAccountData(data);

      if (data.already_checked_in) {
        showStreakMessage(
          'You have already checked in today. Come back after 00:00 UTC.',
          false
        );
      } else {
        showStreakMessage(
          `Check-in successful! ${isNum(data.streak_day) ? `Day ${Number(data.streak_day)} reward: ` : ''}+${formatDoge(data.reward_koinu)} DOGE`,
          false
        );
      }

      await refreshStreak(streakSession);
    } catch (error) {
      resetTurnstile();
      if (streakSession !== authEventRef.current) return;

      showStreakMessage(error.message || 'Could not complete check-in.', true);
      await refreshStreak(streakSession);
    } finally {
      streakInFlightRef.current = false;
      setIsCheckingIn(false);
    }
  };

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

  const refreshAdminStats = async () => {
    setAdminStatsLoading(true);
    setAdminStatsError('');

    try {
      const data = await apiRequest('/api/admin/stats');
      setAdminStats(data);
    } catch (error) {
      setAdminStatsError(error.message || 'Could not refresh daily statistics.');
    } finally {
      setAdminStatsLoading(false);
    }
  };

  const handleAdminApprove = async (wId) => {
    if (!isDemoAdmin || adminActionLoading !== null) return;

    setAdminActionLoading(wId);
    setAdminError('');

    try {
      await apiRequest(
        `/api/admin/withdrawals/${encodeURIComponent(wId)}/approve`,
        { method: 'POST' }
      );
      await refreshAdminWithdrawals();
    } catch (error) {
      setAdminError(error.message || 'Could not approve withdrawal.');
      await refreshAdminWithdrawals();
    } finally {
      setAdminActionLoading(null);
    }
  };

  const handleAdminReject = async (wId) => {
    if (!isDemoAdmin || adminActionLoading !== null) return;

    setAdminActionLoading(wId);
    setAdminError('');

    try {
      await apiRequest(
        `/api/admin/withdrawals/${encodeURIComponent(wId)}/reject`,
        { method: 'POST' }
      );
      await refreshAdminWithdrawals();

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

  if (authLoading) {
    return (
      <div className="min-h-screen bg-black text-white flex items-center justify-center">
        Loading account...
      </div>
    );
  }

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

  const wheelReady =
    !wheelBackendMissing && wheelPrizes.length >= 2 && wheelSpins !== null;
  const wheelTotalSpins =
    wheelSpins && isNum(wheelSpins.totalRemaining)
      ? wheelSpins.totalRemaining
      : null;
  const wheelNoSpins = wheelTotalSpins !== null && wheelTotalSpins <= 0;
  const wheelSpinPaused =
    wheelCaps !== null && !wheelCaps.enabled && !wheelNoSpins;
  const cheapestPackKoinu =
    wheelPacks.length > 0
      ? Math.min(...wheelPacks.map(p => Number(p.price_koinu)))
      : null;
  const wheelBuyPaused =
    wheelCaps !== null &&
    !wheelCaps.canBuy &&
    cheapestPackKoinu !== null &&
    Number.isFinite(cheapestPackKoinu) &&
    Math.round(demoBalance * KOINU) >= cheapestPackKoinu;
  const canSpin =
    apiReady &&
    wheelReady &&
    !isSpinning &&
    buyingPackId === null &&
    !wheelNoSpins &&
    !wheelSpinPaused;

  const spinButtonLabel = isSpinning
    ? 'Spinning...'
    : !apiReady
      ? 'Connecting...'
      : wheelBackendMissing
        ? 'Wheel Unavailable'
        : !wheelReady
          ? 'Loading wheel...'
          : wheelNoSpins
            ? 'No Spins Left'
            : wheelSpinPaused
              ? 'Wheel Paused'
              : 'Spin Now';

  const streakCheckedToday = streakInfo ? streakInfo.checkedInToday : false;
  const streakCompletedDays = streakInfo
    ? (!streakInfo.checkedInToday && streakInfo.currentDay >= 7
        ? 0
        : streakInfo.currentDay)
    : 0;
  const streakNextDay =
    streakInfo && streakInfo.canCheckin ? streakInfo.nextDay : 0;

  const canStreakCheckin =
    apiReady &&
    streakInfo !== null &&
    streakInfo.canCheckin &&
    !isCheckingIn;

  const streakButtonLabel = isCheckingIn
    ? 'Processing Check-in...'
    : !apiReady
      ? 'Connecting...'
      : streakInfo === null
        ? (streakLoading ? 'Loading streak...' : 'Streak Unavailable')
        : streakCheckedToday
          ? 'Already Checked In Today'
          : `Check In (+${formatDoge(streakInfo.nextRewardKoinu)} DOGE)`;

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

        @keyframes wheelResultPop {
          0% { transform: scale(.92); opacity: 0; }
          100% { transform: scale(1); opacity: 1; }
        }

        .wheel-result-pop {
          animation: wheelResultPop .35s ease-out both;
        }

        @media (prefers-reduced-motion: reduce) {
          .wheel-result-pop { animation: none; }
        }
      `}</style>

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
              onClick={() => setActiveTab('streak')}
              className={tabBtnCls('streak')}
            >
              <CalendarCheck className="w-4 h-4" />
              <span>Daily Check-in</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('wheel')}
              className={tabBtnCls('wheel')}
            >
              <Sparkles className="w-4 h-4" />
              <span>Lucky Wheel</span>
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

                {/* Turnstile Widget për Faucet */}
                <div className="my-2 flex justify-center">
                  <div id="turnstile-faucet"></div>
                </div>

                <button
                  type="button"
                  onClick={handleClaim}
                  disabled={!canClaim || !turnstileToken}
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

          {activeTab === 'streak' && (
            <div className="bg-black border border-slate-800 rounded-2xl p-6 md:p-8 space-y-6">
              <div>
                <h2 className="text-xl font-black text-white mb-1 font-['Space_Grotesk',sans-serif]">
                  Daily Check-in <span className="text-[#F4A6C1]">(DEMO)</span>
                </h2>
                <p className="text-sm text-slate-400">
                  Check in once per day (UTC) to build a 7-day streak. Rewards grow each day and are added to your DEMO balance by the server.
                </p>
              </div>

              {streakError && (
                <div className="p-3 bg-red-500/10 border border-red-500/20 text-red-400 rounded-xl text-sm flex items-start gap-2">
                  <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                  <span>{streakError}</span>
                </div>
              )}

              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <StatTile
                  label="Current Streak"
                  value={
                    streakInfo
                      ? `Day ${streakCompletedDays} / 7`
                      : (streakLoading ? '...' : 'N/A')
                  }
                  valueCls="text-[#F4A6C1]"
                />
                <StatTile
                  label={streakCheckedToday ? "Today's Reward" : 'Next Reward'}
                  value={
                    streakInfo
                      ? (streakCheckedToday
                          ? 'Claimed'
                          : `${formatDoge(streakInfo.nextRewardKoinu)} DOGE`)
                      : (streakLoading ? '...' : 'N/A')
                  }
                  sub={streakInfo && !streakCheckedToday && streakNextDay > 0 ? `Day ${streakNextDay}` : undefined}
                />
                <StatTile
                  label="Total Earned"
                  value={
                    streakInfo
                      ? formatDoge(streakInfo.totalRewardsKoinu)
                      : (streakLoading ? '...' : 'N/A')
                  }
                  sub="DOGE (demo)"
                />
                <StatTile
                  label="Balance"
                  value={demoBalance.toFixed(6)}
                  sub="DOGE (demo)"
                />
              </div>

              <PinkDivider />

              <div className="grid grid-cols-4 md:grid-cols-7 gap-3">
                {STREAK_CYCLE_DAYS.map(day => {
                  const isDone = day <= streakCompletedDays;
                  const isNext = streakNextDay === day;

                  return (
                    <div
                      key={day}
                      className={`bg-black rounded-xl p-3 text-center border-2 transition-all ${
                        isNext
                          ? 'border-[#F4A6C1] shadow-lg shadow-[#F4A6C1]/20'
                          : isDone
                            ? 'border-emerald-500/40'
                            : 'border-slate-800'
                      }`}
                    >
                      <span className="block text-[10px] uppercase tracking-wider text-slate-500 font-mono font-bold">
                        Day {day}
                      </span>

                      <div className="flex justify-center my-2">
                        {isDone ? (
                          <CheckCircle className="w-5 h-5 text-emerald-400" />
                        ) : isNext ? (
                          <Gift className="w-5 h-5 text-[#F4A6C1]" />
                        ) : (
                          <Lock className="w-5 h-5 text-slate-600" />
                        )}
                      </div>

                      <span className={`block text-[11px] font-black font-mono break-words ${
                        isDone
                          ? 'text-emerald-400'
                          : isNext
                            ? 'text-[#F4A6C1]'
                            : 'text-slate-400'
                      }`}>
                        +{formatDoge(STREAK_REWARD_KOINU[day])}
                      </span>
                    </div>
                  );
                })}
              </div>

              <div className="flex flex-col items-center space-y-4">
                {streakCheckedToday && (
                  <div className="w-full max-w-sm bg-black border border-slate-800 p-4 rounded-xl text-center space-y-1">
                    <div className="flex items-center justify-center space-x-2 text-emerald-400 text-sm font-bold">
                      <CheckCircle className="w-4 h-4" />
                      <span>You have checked in today</span>
                    </div>
                    <p className="text-xs text-slate-400">
                      Next check-in available in {formatDuration(resetSeconds)} (00:00 UTC).
                    </p>
                  </div>
                )}

                {/* Turnstile Widget për Daily Check-in */}
                <div className="my-2 flex justify-center">
                  <div id="turnstile-streak"></div>
                </div>

                <button
                  type="button"
                  onClick={handleStreakCheckin}
                  disabled={!canStreakCheckin || !turnstileToken}
                  className="w-full max-w-sm bg-[#F4A6C1] hover:bg-[#e091ad] disabled:opacity-50 disabled:cursor-not-allowed text-black font-black py-4 rounded-xl transition-all shadow-lg shadow-[#F4A6C1]/20 flex items-center justify-center space-x-2 text-base font-['Space_Grotesk',sans-serif] tracking-wide"
                >
                  {isCheckingIn || (streakLoading && streakInfo === null)
                    ? <RefreshCw className="w-5 h-5 animate-spin" />
                    : <CalendarCheck className="w-5 h-5" />
                  }
                  <span>{streakButtonLabel}</span>
                </button>

                {streakMsg && (
                  <p className={`text-sm font-bold font-['Space_Grotesk',sans-serif] text-center ${
                    streakMsgIsError ? 'text-red-400' : 'text-emerald-400'
                  }`}>
                    {streakMsg}
                  </p>
                )}
              </div>

              <p className="text-[11px] text-slate-500 text-center">
                DEMO ledger only. No real DOGE is paid out. Streak progress and rewards are controlled by the server. The streak resets if you miss a day.
              </p>
            </div>
          )}

          {activeTab === 'wheel' && (
            <div className="bg-black border border-slate-800 rounded-2xl p-6 md:p-8 space-y-8">
              <div className="text-center">
                <h2 className="text-2xl font-black text-white mb-1 font-['Space_Grotesk',sans-serif] tracking-tight">
                  Lucky Wheel <span className="text-[#F4A6C1]">(DEMO)</span>
                </h2>
                <p className="text-sm text-slate-400">
                  Spin for simulated DEMO DOGE. The prize is decided by the server.
                </p>
              </div>

              {wheelBackendMissing && (
                <div className="p-4 bg-yellow-500/10 border border-yellow-500/20 text-yellow-400 rounded-xl text-sm flex items-start gap-2">
                  <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                  <span>
                    The Lucky Wheel is not available yet: the Worker does not have the
                    Wheel endpoints (/api/wheel/state, /api/wheel/spin, /api/wheel/buy,
                    /api/wheel/history). Nothing is simulated here, so spinning and
                    buying are disabled until they are deployed.
                  </span>
                </div>
              )}

              {wheelError && (
                <div className="p-3 bg-red-500/10 border border-red-500/20 text-red-400 rounded-xl text-sm flex items-start gap-2">
                  <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                  <span>{wheelError}</span>
                </div>
              )}

              {(wheelSpinPaused || wheelBuyPaused) && (
                <div className="p-4 bg-yellow-500/10 border border-yellow-500/20 text-yellow-400 rounded-xl text-sm flex items-start gap-2">
                  <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                  <span>
                    {wheelSpinPaused && wheelBuyPaused
                      ? 'Spins and spin purchases are paused: the wheel payout reserve is empty or payouts are disabled on the server.'
                      : wheelSpinPaused
                        ? 'Spins are paused: the wheel payout reserve is empty or payouts are disabled on the server.'
                        : 'Spin purchases are paused: the wheel payout reserve is empty or payouts are disabled on the server.'}
                    {' '}Nothing was deducted from your balance.
                  </span>
                </div>
              )}

              <PinkDivider />

              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <StatTile
                  label="Free Spins Left"
                  value={
                    wheelSpins && isNum(wheelSpins.freeRemaining)
                      ? `${wheelSpins.freeRemaining}${isNum(wheelSpins.freeTotal) ? ` / ${wheelSpins.freeTotal}` : ''}`
                      : (wheelLoading ? '...' : 'N/A')
                  }
                  sub="Today (UTC)"
                />
                <StatTile
                  label="Purchased Spins"
                  value={
                    wheelSpins && isNum(wheelSpins.paidRemaining)
                      ? wheelSpins.paidRemaining
                      : (wheelLoading ? '...' : 'N/A')
                  }
                />
                <StatTile
                  label="Total Spins"
                  value={wheelTotalSpins !== null ? wheelTotalSpins : (wheelLoading ? '...' : 'N/A')}
                  valueCls="text-[#F4A6C1]"
                />
                <StatTile
                  label="Balance"
                  value={demoBalance.toFixed(6)}
                  sub="DOGE (demo)"
                />
              </div>

              <p className="text-xs text-slate-500 text-center -mt-4">
                Free spins reset at 00:00 UTC, in {formatDuration(resetSeconds)}.
              </p>

              <PinkDivider />

              <div className="flex flex-col items-center space-y-6">
                <div className="relative w-full max-w-[22rem] aspect-square">
                  <div className="absolute left-1/2 -top-3 -translate-x-1/2 z-20 drop-shadow-[0_0_8px_rgba(244,166,193,0.7)]" aria-hidden="true">
                    <svg width="34" height="40" viewBox="0 0 34 40">
                      <polygon points="17,40 1,4 33,4" fill="#F4A6C1" stroke="#000" strokeWidth="2" />
                    </svg>
                  </div>

                  <div
                    className="absolute inset-0 rounded-full shadow-[0_0_40px_rgba(244,166,193,0.25)]"
                    style={{
                      transform: `rotate(${wheelRotation}deg)`,
                      transition: wheelAnimating
                        ? `transform ${WHEEL_SPIN_MS}ms cubic-bezier(0.12, 0.6, 0.08, 1)`
                        : 'none',
                      willChange: 'transform'
                    }}
                  >
                    {wheelPrizes.length >= 2 ? (
                      <WheelGraphic prizes={wheelPrizes} />
                    ) : (
                      <div className="w-full h-full rounded-full border-4 border-[#F4A6C1]/40 flex items-center justify-center text-xs text-slate-500 text-center p-10">
                        {wheelLoading ? 'Loading wheel...' : 'Wheel prizes are not available.'}
                      </div>
                    )}
                  </div>

                  <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-10">
                    <div className="w-24 h-24 sm:w-28 sm:h-28 rounded-full bg-black border-[3px] border-[#F4A6C1] shadow-[0_0_20px_rgba(244,166,193,0.45)] flex flex-col items-center justify-center">
                      <Shield className="w-5 h-5 text-[#F4A6C1] mb-0.5" />
                      <span className="font-black leading-none tracking-tight text-white font-['Space_Grotesk',sans-serif] text-base sm:text-lg">
                        DOGE
                      </span>
                      <span className="font-black leading-none tracking-tight text-[#F4A6C1] font-['Space_Grotesk',sans-serif] text-base sm:text-lg">
                        DRIP
                      </span>
                    </div>
                  </div>
                </div>

                {/* Turnstile Widget për Lucky Wheel */}
                <div className="my-2 flex justify-center">
                  <div id="turnstile-wheel"></div>
                </div>

                <button
                  type="button"
                  onClick={handleWheelSpin}
                  disabled={!canSpin || !turnstileToken}
                  className="w-full max-w-sm bg-[#F4A6C1] hover:bg-[#e091ad] disabled:opacity-50 disabled:cursor-not-allowed text-black font-black py-4 rounded-xl transition-all shadow-lg shadow-[#F4A6C1]/20 flex items-center justify-center space-x-2 text-base font-['Space_Grotesk',sans-serif] tracking-wide"
                >
                  {isSpinning
                    ? <RefreshCw className="w-5 h-5 animate-spin" />
                    : <Sparkles className="w-5 h-5" />
                  }
                  <span>{spinButtonLabel}</span>
                </button>

                {wheelResult && wheelResult.prize && (
                  <div
                    key={`${wheelResult.prize.id}-${wheelHistory.length}-${wheelResult.source}`}
                    className="wheel-result-pop w-full max-w-sm bg-black border-2 border-[#F4A6C1] rounded-2xl p-5 text-center shadow-lg shadow-[#F4A6C1]/20"
                  >
                    <span className="text-[10px] uppercase tracking-widest text-slate-500 font-mono font-bold">
                      Spin Result
                    </span>

                    {isNum(wheelResult.prize.amount_koinu) && Number(wheelResult.prize.amount_koinu) > 0 ? (
                      <>
                        <div className="text-3xl font-black font-mono text-[#F4A6C1] mt-1">
                          +{formatDoge(wheelResult.prize.amount_koinu)} DOGE
                        </div>
                        <p className="text-xs text-slate-400 mt-1">
                          Added to your DEMO balance.
                        </p>
                      </>
                    ) : (
                      <>
                        <div className="text-2xl font-black text-white mt-1 font-['Space_Grotesk',sans-serif]">
                          No prize this time
                        </div>
                        <p className="text-xs text-slate-400 mt-1">
                          Better luck on the next spin.
                        </p>
                      </>
                    )}

                    {wheelResult.source && (
                      <p className="text-[10px] uppercase tracking-wider text-slate-500 font-mono mt-2">
                        {wheelResult.source === 'free' ? 'Free spin' : wheelResult.source === 'paid' ? 'Purchased spin' : wheelResult.source}
                      </p>
                    )}
                  </div>
                )}

                {wheelMsg && (
                  <p className={`text-sm font-bold font-['Space_Grotesk',sans-serif] text-center ${
                    wheelMsgIsError ? 'text-red-400' : 'text-emerald-400'
                  }`}>
                    {wheelMsg}
                  </p>
                )}
              </div>

              <PinkDivider />

              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-black uppercase tracking-wider text-slate-300 font-['Space_Grotesk',sans-serif]">
                    Buy Spins
                  </h3>
                  <span className="text-xs text-[#F4A6C1] font-mono">
                    Paid from DEMO balance
                  </span>
                </div>

                {wheelPacks.length === 0 ? (
                  <p className="text-sm text-slate-500 text-center py-4">
                    {wheelBackendMissing
                      ? 'Spin packs are not available yet.'
                      : wheelLoading
                        ? 'Loading spin packs...'
                        : 'No spin packs available.'}
                  </p>
                ) : (
                  <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                    {wheelPacks.map(pack => {
                      const priceDoge = Number(pack.price_koinu) / KOINU;
                      const cannotAfford = Number.isFinite(priceDoge) && demoBalance < priceDoge;

                      return (
                        <div
                          key={pack.id}
                          className="bg-black border border-[#F4A6C1]/30 rounded-xl p-4 flex flex-col items-center text-center space-y-3"
                        >
                          <Ticket className="w-6 h-6 text-[#F4A6C1]" />

                          <div>
                            <div className="text-xl font-black font-mono text-white">
                              {pack.spins} {Number(pack.spins) === 1 ? 'Spin' : 'Spins'}
                            </div>
                            <div className="text-xs font-mono text-[#F4A6C1] mt-0.5">
                              {formatDoge(pack.price_koinu)} DOGE
                            </div>
                          </div>

                          <button
                            type="button"
                            onClick={() => handleBuyPack(pack)}
                            disabled={!apiReady || isSpinning || buyingPackId !== null || cannotAfford || wheelBuyPaused}
                            className="w-full bg-[#F4A6C1]/10 hover:bg-[#F4A6C1]/20 border border-[#F4A6C1]/40 text-[#F4A6C1] disabled:opacity-40 disabled:cursor-not-allowed font-black py-2 rounded-lg text-xs transition-colors font-['Space_Grotesk',sans-serif]"
                          >
                            {buyingPackId === pack.id
                              ? 'Buying...'
                              : cannotAfford
                                ? 'Not enough balance'
                                : wheelBuyPaused
                                  ? 'Paused'
                                  : 'Buy'}
                          </button>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              <PinkDivider />

              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-black uppercase tracking-wider text-slate-300 font-['Space_Grotesk',sans-serif]">
                    Spin History
                  </h3>
                  <span className="text-xs text-[#F4A6C1] font-mono">
                    Recent spins
                  </span>
                </div>

                {wheelHistory.length === 0 ? (
                  <p className="text-sm text-slate-500 text-center py-4">
                    {wheelLoading ? 'Loading history...' : 'No spins yet.'}
                  </p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs">
                      <thead className="text-slate-400 uppercase border-b border-[#F4A6C1]/30">
                        <tr>
                          <th className="py-3 pr-4">Prize</th>
                          <th className="py-3 pr-4">Type</th>
                          <th className="py-3">Date</th>
                        </tr>
                      </thead>

                      <tbody className="divide-y divide-slate-800/60">
                        {wheelHistory.map((s, index) => (
                          <tr key={s.id ?? index}>
                            <td className={`py-3 pr-4 font-bold ${
                              isNum(s.amount_koinu) && Number(s.amount_koinu) > 0
                                ? 'text-emerald-400'
                                : 'text-slate-500'
                            }`}>
                              {isNum(s.amount_koinu) && Number(s.amount_koinu) > 0
                                ? `+${formatDoge(s.amount_koinu)} DOGE`
                                : 'No prize'}
                            </td>
                            <td className="py-3 pr-4 text-slate-400">
                              {s.source === 'free' ? 'Free' : s.source === 'paid' ? 'Purchased' : (s.source || '-')}
                            </td>
                            <td className="py-3 text-slate-400">
                              {formatDate(s.created_at)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>

              {wheelPurchases.length > 0 && (
                <div className="space-y-4">
                  <h3 className="text-sm font-black uppercase tracking-wider text-slate-300 font-['Space_Grotesk',sans-serif]">
                    Purchase History
                  </h3>

                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs">
                      <thead className="text-slate-400 uppercase border-b border-[#F4A6C1]/30">
                        <tr>
                          <th className="py-3 pr-4">Spins</th>
                          <th className="py-3 pr-4">Price</th>
                          <th className="py-3">Date</th>
                        </tr>
                      </thead>

                      <tbody className="divide-y divide-slate-800/60">
                        {wheelPurchases.map((p, index) => (
                          <tr key={p.id ?? index}>
                            <td className="py-3 pr-4 text-white font-bold">
                              {p.spins}
                            </td>
                            <td className="py-3 pr-4 text-[#F4A6C1] font-bold">
                              -{formatDoge(p.price_koinu)} DOGE
                            </td>
                            <td className="py-3 text-slate-400">
                              {formatDate(p.created_at)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              <PinkDivider />

              <p className="text-[11px] text-slate-500 text-center">
                DEMO ledger only. No real DOGE is paid out. Prizes, odds, spin
                counts and prices are controlled by the server.
              </p>
            </div>
          )}

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

              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-black uppercase tracking-wider text-slate-300 font-['Space_Grotesk',sans-serif]">
                    Today's Statistics
                  </h3>
                  <span className={`text-xs font-mono ${adminAccentText}`}>
                    {adminStats?.date ? `${adminStats.date} (UTC)` : 'UTC day'}
                  </span>
                </div>

                {adminStatsError && (
                  <div className="p-3 bg-red-500/10 border border-red-500/20 text-red-400 rounded-xl text-sm flex items-start gap-2">
                    <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                    <span>{adminStatsError}</span>
                  </div>
                )}

                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  <StatTile
                    label="Users Registered Today"
                    value={
                      adminStats
                        ? (adminStats.registered_today === null || adminStats.registered_today === undefined
                            ? 'N/A'
                            : adminStats.registered_today)
                        : (adminStatsLoading ? '...' : 'N/A')
                    }
                    sub={
                      adminStats && (adminStats.registered_today === null || adminStats.registered_today === undefined)
                        ? 'users.created_at missing'
                        : undefined
                    }
                    valueCls={adminAccentText}
                  />
                  <StatTile
                    label="Won Today (Income)"
                    value={
                      adminStats
                        ? `${formatDoge(adminStats.income_koinu)} DOGE`
                        : (adminStatsLoading ? '...' : 'N/A')
                    }
                    sub={
                      adminStats?.breakdown
                        ? `${adminStats.breakdown.wheel_purchases_count} spin purchases`
                        : undefined
                    }
                    valueCls="text-emerald-400"
                  />
                  <StatTile
                    label="Lost Today (Paid Out)"
                    value={
                      adminStats
                        ? `${formatDoge(adminStats.payouts_koinu)} DOGE`
                        : (adminStatsLoading ? '...' : 'N/A')
                    }
                    sub={
                      adminStats?.breakdown
                        ? `Claims ${formatDoge(adminStats.breakdown.claims_koinu)} · Wheel ${formatDoge(adminStats.breakdown.wheel_prizes_koinu)} · Check-in ${formatDoge(adminStats.breakdown.streak_koinu)}`
                        : undefined
                    }
                    valueCls="text-red-400"
                  />
                  <StatTile
                    label="Profit Today"
                    value={
                      adminStats
                        ? `${Number(adminStats.profit_koinu) > 0 ? '+' : ''}${formatDoge(adminStats.profit_koinu)} DOGE`
                        : (adminStatsLoading ? '...' : 'N/A')
                    }
                    sub="Income minus paid out"
                    valueCls={
                      adminStats && Number(adminStats.profit_koinu) < 0
                        ? 'text-red-400'
                        : 'text-emerald-400'
                    }
                  />
                </div>

                <h3 className="pt-2 text-sm font-black uppercase tracking-wider text-slate-300 font-['Space_Grotesk',sans-serif]">
                  Withdrawals & Reserves
                </h3>

                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  <StatTile
                    label="Pending Withdrawals"
                    value={
                      adminStats?.withdrawals
                        ? `${formatDoge(adminStats.withdrawals.pending.koinu)} DOGE`
                        : (adminStatsLoading ? '...' : 'N/A')
                    }
                    sub={
                      adminStats?.withdrawals
                        ? `${adminStats.withdrawals.pending.count} waiting (all time)`
                        : undefined
                    }
                    valueCls="text-yellow-400"
                  />
                  <StatTile
                    label="Requested Today"
                    value={
                      adminStats?.withdrawals
                        ? `${formatDoge(adminStats.withdrawals.requested_today.koinu)} DOGE`
                        : (adminStatsLoading ? '...' : 'N/A')
                    }
                    sub={
                      adminStats?.withdrawals
                        ? `${adminStats.withdrawals.requested_today.count} requests`
                        : undefined
                    }
                  />
                  <StatTile
                    label="Approved / Rejected Today"
                    value={
                      adminStats?.withdrawals
                        ? `${adminStats.withdrawals.approved_today.count} / ${adminStats.withdrawals.rejected_today.count}`
                        : (adminStatsLoading ? '...' : 'N/A')
                    }
                    sub={
                      adminStats?.withdrawals
                        ? `${formatDoge(adminStats.withdrawals.approved_today.koinu)} / ${formatDoge(adminStats.withdrawals.rejected_today.koinu)} DOGE`
                        : undefined
                    }
                  />
                  <StatTile
                    label="Total User Balances"
                    value={
                      adminStats?.liability
                        ? `${formatDoge(adminStats.liability.user_balances_koinu)} DOGE`
                        : (adminStatsLoading ? '...' : 'N/A')
                    }
                    sub={
                      adminStats?.liability
                        ? `${adminStats.liability.users_count} users total`
                        : undefined
                    }
                    valueCls={adminAccentText}
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <StatTile
                    label="Faucet Reserve"
                    value={
                      adminStats?.reserves
                        ? `${formatDoge(adminStats.reserves.faucet_available_koinu)} DOGE`
                        : (adminStatsLoading ? '...' : 'N/A')
                    }
                    sub={
                      adminStats?.reserves
                        ? (adminStats.reserves.faucet_payouts_enabled ? 'Payouts enabled' : 'Payouts paused')
                        : undefined
                    }
                    valueCls={
                      adminStats?.reserves && !adminStats.reserves.faucet_payouts_enabled
                        ? 'text-red-400'
                        : 'text-white'
                    }
                  />
                  <StatTile
                    label="Wheel Reserve"
                    value={
                      adminStats?.reserves
                        ? `${formatDoge(adminStats.reserves.wheel_available_koinu)} DOGE`
                        : (adminStatsLoading ? '...' : 'N/A')
                    }
                    sub={
                      adminStats?.reserves
                        ? `Locked ${formatDoge(adminStats.reserves.wheel_locked_koinu)} · ${adminStats.reserves.wheel_payouts_enabled ? 'Payouts enabled' : 'Payouts paused'}`
                        : undefined
                    }
                    valueCls={
                      adminStats?.reserves && !adminStats.reserves.wheel_payouts_enabled
                        ? 'text-red-400'
                        : 'text-white'
                    }
                  />
                </div>

                <p className="text-[11px] text-slate-500">
                  DEMO ledger, UTC day. Income = DOGE users spent on Lucky Wheel spins.
                  Paid out = faucet claims + Lucky Wheel prizes + Daily Check-in rewards.
                  Pending withdrawals and user balances are what the platform owes users.
                  Subscriptions are not included yet.
                </p>
              </div>

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
                  disabled={adminLoading || adminStatsLoading || !apiReady}
                  onClick={() => {
                    refreshAdminWithdrawals();
                    refreshAdminStats();
                  }}
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

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
  CalendarCheck,
  UserCircle,
  Sun,
  Moon,
  Eye,
  ExternalLink
} from 'lucide-react';

// FIREBASE
import { initializeApp, getApps } from 'firebase/app';
import {
  getAuth,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
  sendPasswordResetEmail,
  sendEmailVerification
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
const TURNSTILE_SITE_KEY = "0x4AAAAAAF-3dKe3-VPYCryx";

const REF_CODE_REGEX = /^DOGE[A-HJ-NP-Z2-9]{6}$/;
const KOINU = 100000000;
const PTC_VIEW_STORAGE_KEY = 'dogedrip_ptc_active_view';

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
      'Manual Daily Streak Bonus check-in',
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
    cardCls: 'border-[#F4A6C1]/30',
    activeCardCls: 'border-[#F4A6C1] shadow-lg shadow-[#F4A6C1]/20',
    accentText: 'text-[#F4A6C1]',
    badgeCls: 'bg-[#F4A6C1]/10 text-[#F4A6C1] border border-[#F4A6C1]/30',
    iconWrapCls: 'bg-[#F4A6C1]/10 border border-[#F4A6C1]/20 text-[#F4A6C1]'
  }
];

// ADVERTISING PACKAGES (DISPLAY PRICING; payment is still manually verified)
const ADVERTISING_PLAN_CATALOG = [
  { key: 'bottom-7', label: 'Bottom Banner', placement: 'bottom', days: 7, totalDays: 7, price: '€5' },
  { key: 'bottom-14', label: 'Bottom Banner', placement: 'bottom', days: 14, totalDays: 14, price: '€9' },
  { key: 'bottom-30', label: 'Bottom Banner', placement: 'bottom', days: 30, totalDays: 35, price: '€15' },
  { key: 'top-7', label: 'Top Banner', placement: 'top', days: 7, totalDays: 7, price: '€8' },
  { key: 'top-14', label: 'Top Banner', placement: 'top', days: 14, totalDays: 14, price: '€14' },
  { key: 'top-30', label: 'Top Banner', placement: 'top', days: 30, totalDays: 35, price: '€25' }
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

const formatClaimAmount = (amount) =>
  isNum(amount) ? String(Number(Number(amount).toFixed(8))) : '...';

const mapWithdrawal = (w) => ({
  id: w.id,
  userId: w.uid || w.userId || '',
  email: w.email || '',
  amount: Number(w.amount_koinu) / KOINU,
  address: w.wallet_address || w.address || '',
  status: w.status || 'pending',
  faucetpayPayoutId: w.faucetpay_payout_id || '',
  payoutError: w.payout_error || '',
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

const SiteFooter = () => (
  <footer className="w-full border-t border-slate-800 bg-black mt-auto">
    <div className="max-w-7xl mx-auto px-4 py-5 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-slate-500">
      <a href="mailto:support.dogedrip@gmail.com" className="hover:text-[#F4A6C1] transition-colors">
        Support: support.dogedrip@gmail.com
      </a>
      <div className="flex items-center gap-4">
        <a href="/terms.html" className="hover:text-[#F4A6C1] transition-colors">
          Terms of Service
        </a>
        <a href="/privacy.html" className="hover:text-[#F4A6C1] transition-colors">
          Privacy Policy
        </a>
      </div>
      <span>© {new Date().getFullYear()} DogeDrip. All rights reserved.</span>
    </div>
  </footer>
);

function TurnstileWidget({ action, onToken, resetKey = 0 }) {
  const containerRef = useRef(null);
  const widgetIdRef = useRef(null);
  const onTokenRef = useRef(onToken);

  useEffect(() => {
    onTokenRef.current = onToken;
  }, [onToken]);

  useEffect(() => {
    let cancelled = false;
    let script = document.querySelector('script[data-dogedrip-turnstile]');

    const renderWidget = () => {
      if (cancelled || !window.turnstile || !containerRef.current || widgetIdRef.current !== null) return;
      try {
        widgetIdRef.current = window.turnstile.render(containerRef.current, {
          sitekey: TURNSTILE_SITE_KEY,
          action,
          theme: 'dark',
          callback: token => onTokenRef.current(token),
          'expired-callback': () => onTokenRef.current(''),
          'error-callback': () => {
            onTokenRef.current('');
            return true;
          }
        });
      } catch {
        onTokenRef.current('');
      }
    };

    if (window.turnstile) {
      renderWidget();
    } else {
      if (!script) {
        script = document.createElement('script');
        script.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
        script.async = true;
        script.defer = true;
        script.dataset.dogedripTurnstile = 'true';
        document.head.appendChild(script);
      }
      script.addEventListener('load', renderWidget);
    }

    return () => {
      cancelled = true;
      if (script) script.removeEventListener('load', renderWidget);
      if (widgetIdRef.current !== null && window.turnstile) {
        window.turnstile.remove(widgetIdRef.current);
        widgetIdRef.current = null;
      }
      onTokenRef.current('');
    };
  }, [action]);

  useEffect(() => {
    onTokenRef.current('');
    if (widgetIdRef.current !== null && window.turnstile) {
      window.turnstile.reset(widgetIdRef.current);
    }
  }, [resetKey]);

  return (
    <div className="space-y-2">
      <label className={LABEL_CLS}>Security Verification</label>
      <div ref={containerRef} className="min-h-[65px] flex items-center justify-center" />
      <p className="text-[10px] text-slate-500">Cloudflare security check</p>
    </div>
  );
}

export default function App() {
  const [activeTab, setActiveTab] = useState('faucet');
  const [theme, setTheme] = useState(() => {
    try {
      return window.localStorage.getItem('dogedrip-theme') === 'light' ? 'light' : 'dark';
    } catch {
      return 'dark';
    }
  });

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    try {
      window.localStorage.setItem('dogedrip-theme', theme);
    } catch {
      // Theme still applies for the current session when storage is unavailable.
    }
  }, [theme]);


  const [firebaseUser, setFirebaseUser] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [userProfile, setUserProfile] = useState(null);
  const [profileLoading, setProfileLoading] = useState(false);
  const [profileError, setProfileError] = useState('');
  const [profileUsernameInput, setProfileUsernameInput] = useState('');
  const [profileSaving, setProfileSaving] = useState(false);
  const [authMode, setAuthMode] = useState('login');
  const [securityTokens, setSecurityTokens] = useState({
    signup: '', login: '', claim: '', withdraw: '', wheel_spin: '', wheel_buy: '', ptc_complete: ''
  });
  const [securityResets, setSecurityResets] = useState({
    signup: 0, login: 0, claim: 0, withdraw: 0, wheel_spin: 0, wheel_buy: 0, ptc_complete: 0
  });
  const setSecurityToken = useCallback((action, token) => {
    setSecurityTokens(current => ({ ...current, [action]: token }));
  }, []);
  const resetSecurityToken = useCallback((action) => {
    setSecurityTokens(current => ({ ...current, [action]: '' }));
    setSecurityResets(current => ({ ...current, [action]: current[action] + 1 }));
  }, []);
  const [apiReady, setApiReady] = useState(false);
  const [subscriptionCheckoutLoading, setSubscriptionCheckoutLoading] = useState('');
  const [subscriptionCheckoutMessage, setSubscriptionCheckoutMessage] = useState('');
  const [apiError, setApiError] = useState('');
  const [verifyMsg, setVerifyMsg] = useState('');
  const [verificationResendSeconds, setVerificationResendSeconds] = useState(0);
  const [verificationSending, setVerificationSending] = useState(false);
  const [verificationChecking, setVerificationChecking] = useState(false);

  useEffect(() => {
    if (verificationResendSeconds <= 0) return undefined;

    const timer = window.setInterval(() => {
      setVerificationResendSeconds(current => Math.max(0, current - 1));
    }, 1000);

    return () => window.clearInterval(timer);
  }, [verificationResendSeconds]);

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

  useEffect(() => {
    const storageKey = 'dogedrip_referral_attribution';
    const expiresAt = Date.now() + 30 * 24 * 60 * 60 * 1000;
    const params = new URLSearchParams(window.location.search);
    const incomingCode = (params.get('ref') || '').trim().toUpperCase();
    let storedCode = '';

    try {
      const saved = JSON.parse(window.localStorage.getItem(storageKey) || 'null');
      if (
        saved &&
        REF_CODE_REGEX.test(saved.code) &&
        Number.isFinite(saved.expiresAt) &&
        saved.expiresAt > Date.now()
      ) {
        storedCode = saved.code;
      } else if (saved) {
        window.localStorage.removeItem(storageKey);
      }
    } catch {
      // Storage may be unavailable; direct referral links still work.
    }

    const code = REF_CODE_REGEX.test(incomingCode) ? incomingCode : storedCode;

    if (code) {
      setRegRefCode(code);
      pendingReferralRef.current = code;

      if (REF_CODE_REGEX.test(incomingCode)) {
        setAuthMode('register');
        try {
          window.localStorage.setItem(
            storageKey,
            JSON.stringify({ code, expiresAt })
          );
        } catch {
          // The code remains available for this page session.
        }
      }
    }
  }, []);

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
  const [referralCopyMessage, setReferralCopyMessage] = useState('');

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
  const wheelAudioContextRef = useRef(null);
  const wheelTickTimerRef = useRef(null);
  const wheelSoundStartedAtRef = useRef(0);
  const wheelRotationRef = useRef(0);
  const wheelSpinRequestIdRef = useRef(null);
  const wheelBuyRequestRef = useRef(null);
  const [wheelCaps, setWheelCaps] = useState(null);
  const [ptcAds, setPtcAds] = useState([]);
  const [ptcHistory, setPtcHistory] = useState([]);
  const [ptcPendingReward, setPtcPendingReward] = useState(0);
  const [ptcSettledReward, setPtcSettledReward] = useState(0);
  const [ptcCompletedViews, setPtcCompletedViews] = useState(0);
  const [ptcSettledViews, setPtcSettledViews] = useState(0);
  const [ptcLoading, setPtcLoading] = useState(false);
  const [ptcPanelMode, setPtcPanelMode] = useState('user');
  const [ptcError, setPtcError] = useState('');
  const [ptcMessage, setPtcMessage] = useState('');
  const [ptcActiveView, setPtcActiveView] = useState(() => {
    try {
      const saved = window.sessionStorage.getItem(PTC_VIEW_STORAGE_KEY);
      const parsed = saved ? JSON.parse(saved) : null;
      return parsed && typeof parsed === 'object' && Number.isSafeInteger(parsed.viewId) && typeof parsed.viewToken === 'string' ? parsed : null;
    } catch {
      return null;
    }
  });
  const [ptcSecondsLeft, setPtcSecondsLeft] = useState(0);
  const [ptcStartingId, setPtcStartingId] = useState(null);
  const [ptcCompleting, setPtcCompleting] = useState(false);


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
  const [faucetPayStatus, setFaucetPayStatus] = useState(null);
  const [faucetPayBalance, setFaucetPayBalance] = useState(null);
  const [faucetPayCheckLoading, setFaucetPayCheckLoading] = useState(false);
  const [faucetPayCheckError, setFaucetPayCheckError] = useState('');
  const [reconcilePayoutIds, setReconcilePayoutIds] = useState({});
  const [adminStats, setAdminStats] = useState(null);
  const [adminStatsLoading, setAdminStatsLoading] = useState(false);
  const [adminStatsError, setAdminStatsError] = useState('');
  const [financeAudit, setFinanceAudit] = useState(null);
  const [financeAuditLoading, setFinanceAuditLoading] = useState(false);
  const [financeAuditError, setFinanceAuditError] = useState('');
  const [financeReport, setFinanceReport] = useState(null);
  const [financeReportLoading, setFinanceReportLoading] = useState(false);
  const [financeReportError, setFinanceReportError] = useState('');
  const [financeReportRange, setFinanceReportRange] = useState(() => ({
    start: new Date(Date.now() - 29 * 86400000).toISOString().slice(0, 10),
    end: new Date().toISOString().slice(0, 10)
  }));
  const [adminExpenses, setAdminExpenses] = useState([]);
  const [adminExpensesLoading, setAdminExpensesLoading] = useState(false);
  const [adminExpensesError, setAdminExpensesError] = useState('');
  const [adminExpenseSaving, setAdminExpenseSaving] = useState(false);
  const [adminExpenseVerifying, setAdminExpenseVerifying] = useState(null);
  const [adminExpenseEvidence, setAdminExpenseEvidence] = useState({});
  const [adminExpenseForm, setAdminExpenseForm] = useState({
    category: 'hosting',
    description: '',
    amount_eur: '',
    expense_date: new Date().toISOString().slice(0, 10)
  });
  const [myAdRequests, setMyAdRequests] = useState([]);
  const [adminAdRequests, setAdminAdRequests] = useState([]);
  const [adminPtcData, setAdminPtcData] = useState(null);
  const [ptcAdminLoading, setPtcAdminLoading] = useState(false);
  const [ptcSettlingUid, setPtcSettlingUid] = useState(null);
  const [ptcFundingForm, setPtcFundingForm] = useState({
    amount_doge: '', external_reference: '', notes: '', externally_verified: false
  });
  const [ptcCampaignForm, setPtcCampaignForm] = useState({
    title: '', description: '', advertiser_name: '', target_url: '',
    reward_doge: '0.0001', duration_seconds: '15', max_views: '100',
    total_budget_doge: '0.01', advertiser_payment_reference: '', payment_verified: false
  });
  const [adminPtcAdvertiserRequests, setAdminPtcAdvertiserRequests] = useState([]);
  const [adminPtcQuoteInputs, setAdminPtcQuoteInputs] = useState({});
  const [ptcAdvertiserRequests, setPtcAdvertiserRequests] = useState([]);
  const [ptcAdvertiserForm, setPtcAdvertiserForm] = useState({
    title: '', description: '', advertiser_name: '', target_url: '',
    reward_doge: '0.0001', duration_seconds: '15', max_views: '100',
    requested_budget_doge: '0.01'
  });
  const [ptcAdvertiserLoading, setPtcAdvertiserLoading] = useState(false);
  const [ptcAdvertiserSubmitting, setPtcAdvertiserSubmitting] = useState(false);
  const [ptcAdvertiserMessage, setPtcAdvertiserMessage] = useState('');
  const [ptcAdvertiserMessageError, setPtcAdvertiserMessageError] = useState(false);
  const [ptcAdvertiserPaymentRefs, setPtcAdvertiserPaymentRefs] = useState({});


  const [adPlacements, setAdPlacements] = useState({ top: null, bottom: null });
  const [adSubmitting, setAdSubmitting] = useState(false);
  const [adMessage, setAdMessage] = useState('');
  const [adMessageIsError, setAdMessageIsError] = useState(false);
  const [adPaymentRefs, setAdPaymentRefs] = useState({});
  const [adQuoteInputs, setAdQuoteInputs] = useState({});
  const [adActionLoading, setAdActionLoading] = useState(null);
  const [jumpToAdvertisingPlans, setJumpToAdvertisingPlans] = useState(false);
  const [adForm, setAdForm] = useState({
    business_name: '',
    contact_email: '',
    website_url: '',
    banner_image_url: '',
    placement: 'bottom',
    duration_days: '7',
    notes: ''
  });

  const openAdvertisingPlans = () => {
    setActiveTab('plans');
    setJumpToAdvertisingPlans(true);
  };

  useEffect(() => {
    if (activeTab !== 'plans' || !jumpToAdvertisingPlans) return;
    const section = document.getElementById('advertising-request');
    if (!section) return;
    section.scrollIntoView({ behavior: 'smooth', block: 'start' });
    setJumpToAdvertisingPlans(false);
  }, [activeTab, jumpToAdvertisingPlans]);

  const adminEmail = firebaseUser?.email?.trim().toLowerCase() || '';

  const adminTheme =
    adminEmail === ADMIN_EMAILS.lilac
      ? 'lilac'
      : adminEmail === ADMIN_EMAILS.blue
        ? 'blue'
        : null;

  const isDemoAdmin = Boolean(adminTheme);
  const isBlueAdmin = adminTheme === 'blue';

  const internalBackingRequiredKoinu = financeAudit
    ? [
        financeAudit.liabilities.user_balances_koinu,
        financeAudit.liabilities.outstanding_withdrawals_koinu,
        financeAudit.reserves.faucet_available_koinu,
        financeAudit.reserves.wheel_available_koinu,
        financeAudit.reserves.wheel_locked_koinu,
        financeAudit.reserves.referral_available_koinu,
        financeAudit.ptc_rewards.reserve_available_koinu,
        financeAudit.ptc_rewards.reserve_locked_koinu,
        financeAudit.ptc_rewards.reserve_pending_koinu
      ].reduce((total, value) => total + Number(value || 0), 0)
    : null;
  const faucetPayCoverageDifferenceDoge =
    faucetPayBalance !== null && Number.isFinite(faucetPayBalance) && internalBackingRequiredKoinu !== null
      ? faucetPayBalance - internalBackingRequiredKoinu / KOINU
      : null;

  const planName =
    typeof planInfo?.name === 'string' && planInfo.name ? planInfo.name : null;
  const claimAmount = isNum(planInfo?.claimAmount) ? planInfo.claimAmount : null;
  const cooldownSeconds = isNum(planInfo?.cooldownSeconds)
    ? planInfo.cooldownSeconds
    : null;
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

    const requestBody = options.body;

    const token = await firebaseUser.getIdToken();
    let response;

    try {
      response = await fetch(`${API_URL}${path}`, {
        ...options,
        headers: {
          ...(requestBody ? { 'Content-Type': 'application/json' } : {}),
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

  useEffect(() => {
    try {
      if (ptcActiveView) {
        window.sessionStorage.setItem(PTC_VIEW_STORAGE_KEY, JSON.stringify(ptcActiveView));
      } else {
        window.sessionStorage.removeItem(PTC_VIEW_STORAGE_KEY);
      }
    } catch {
      // PTC remains usable for the current page if session storage is unavailable.
    }
  }, [ptcActiveView]);

  useEffect(() => {
    if (authLoading) return;
    if (!firebaseUser || (ptcActiveView && ptcActiveView.uid !== firebaseUser.uid)) {
      if (ptcActiveView) setPtcActiveView(null);
    }
  }, [authLoading, firebaseUser, ptcActiveView]);

  useEffect(() => {
    if (!ptcActiveView) return undefined;
    const updateTimer = () => {
      const deadline = ptcActiveView.startedAtMs + ptcActiveView.durationSeconds * 1000;
      setPtcSecondsLeft(Math.max(0, Math.ceil((deadline - Date.now()) / 1000)));
    };
    updateTimer();
    const timer = window.setInterval(updateTimer, 1000);
    return () => window.clearInterval(timer);
  }, [ptcActiveView]);

  useEffect(() => {
    if (activeTab !== 'ptc' || !firebaseUser || !apiReady) return undefined;
    let cancelled = false;
    const loadPtc = async () => {
      setPtcLoading(true);
      setPtcError('');
      try {
        const [adsData, historyData] = await Promise.all([
          apiRequest('/api/ptc/ads'),
          apiRequest('/api/ptc/history')
        ]);
        if (cancelled) return;
        setPtcAds(Array.isArray(adsData.ads) ? adsData.ads : []);
        setPtcHistory(Array.isArray(historyData.history) ? historyData.history : []);
        setPtcPendingReward(Number(historyData.pending_reward_koinu || 0));
        setPtcSettledReward(Number(historyData.settled_reward_koinu || 0));
        setPtcCompletedViews(Number(historyData.completed_views || 0));
        setPtcSettledViews(Number(historyData.settled_views || 0));
      } catch (error) {
        if (!cancelled) setPtcError(error.message || 'Could not load PTC ads.');
      } finally {
        if (!cancelled) setPtcLoading(false);
      }
    };
    loadPtc();
    return () => { cancelled = true; };
  }, [activeTab, firebaseUser, apiReady, apiRequest]);

  useEffect(() => {
    if (!firebaseUser || firebaseUser.emailVerified !== true || !apiReady) {
      return undefined;
    }

    const sendHeartbeat = () => {
      if (document.visibilityState !== 'visible') return;
      apiRequest('/api/activity/heartbeat', { method: 'POST' }).catch(() => {});
    };

    sendHeartbeat();
    const intervalId = window.setInterval(sendHeartbeat, 120000);
    document.addEventListener('visibilitychange', sendHeartbeat);

    return () => {
      window.clearInterval(intervalId);
      document.removeEventListener('visibilitychange', sendHeartbeat);
    };
  }, [firebaseUser, apiReady, apiRequest]);

  const handleSubscriptionCheckout = async (plan) => {
    if (subscriptionCheckoutLoading) return;
    setSubscriptionCheckoutLoading(plan);
    setSubscriptionCheckoutMessage('');
    try {
      const data = await apiRequest('/api/subscriptions/checkout', {
        method: 'POST',
        body: JSON.stringify({ plan })
      });
      const checkout = data?.checkout;
      if (
        checkout?.action !== 'https://faucetpay.io/merchant/webscr' ||
        checkout?.method !== 'POST' ||
        !checkout.fields ||
        typeof checkout.fields !== 'object'
      ) {
        throw new Error('The payment provider returned an invalid checkout session.');
      }
      const form = document.createElement('form');
      form.method = 'POST';
      form.action = checkout.action;
      form.acceptCharset = 'UTF-8';
      for (const [key, value] of Object.entries(checkout.fields)) {
        if (typeof value !== 'string' || value.length > 2048) {
          throw new Error('Invalid payment checkout details.');
        }
        const input = document.createElement('input');
        input.type = 'hidden';
        input.name = key;
        input.value = value;
        form.appendChild(input);
      }
      document.body.appendChild(form);
      form.submit();
    } catch (error) {
      setSubscriptionCheckoutMessage(error.message || 'Could not start the subscription checkout.');
      setSubscriptionCheckoutLoading('');
    }
  };

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
            referred_by: referredBy || null,
            username: pendingUsernameRef.current || null
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
        try {
          window.localStorage.removeItem('dogedrip_referral_attribution');
        } catch {
          // Storage may be unavailable.
        }
        setRefCode(syncData.ref_code || '');
        if (syncData.username) setProfileUsernameInput(syncData.username);

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
          const mergedProfile = {
            ...fallbackProfile,
            ...data,
            username: data.username || fallbackProfile.username
          };
          setUserProfile(mergedProfile);
          setProfileUsernameInput(mergedProfile.username);
        } else {
          setUserProfile(fallbackProfile);
          setProfileUsernameInput(fallbackProfile.username);
        }
      } catch (error) {
        console.warn('Firestore unavailable:', error.message);

        if (!isMounted || eventId !== authEventRef.current) return;

        setUserProfile(fallbackProfile);
        setProfileUsernameInput(fallbackProfile.username);
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
    if (activeTab !== 'profile' || !firebaseUser || !apiReady) return undefined;
    let cancelled = false;
    setProfileLoading(true);
    setProfileError('');

    apiRequest('/api/profile')
      .then(data => {
        if (cancelled || !data.profile) return;
        setUserProfile(prev => ({ ...(prev || {}), ...data.profile }));
        setProfileUsernameInput(data.profile.username || '');
      })
      .catch(error => {
        if (!cancelled) setProfileError(error.message || 'Could not load profile.');
      })
      .finally(() => {
        if (!cancelled) setProfileLoading(false);
      });

    return () => { cancelled = true; };
  }, [activeTab, firebaseUser, apiReady, apiRequest]);

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
      setMyAdRequests([]);
      setAdPlacements({ top: null, bottom: null });
      return;
    }

    let cancelled = false;

    Promise.all([
      apiRequest('/api/ads'),
      apiRequest('/api/ads/placements')
    ]).then(([requestsData, placementsData]) => {
      if (cancelled) return;
      setMyAdRequests(requestsData.requests || []);
      setAdPlacements(placementsData.placements || { top: null, bottom: null });
    }).catch(error => {
      if (!cancelled) console.warn('Advertising data could not be loaded:', error.message);
    });

    return () => { cancelled = true; };
  }, [firebaseUser, apiReady, apiRequest]);

  useEffect(() => {
    if (!firebaseUser || !apiReady || !isDemoAdmin || activeTab !== 'ptc') return undefined;
    let cancelled = false;
    setPtcAdminLoading(true);
    apiRequest('/api/admin/ptc')
      .then(data => { if (!cancelled) setAdminPtcData(data); })
      .catch(error => { if (!cancelled) setAdminError(error.message || 'Could not load PTC administration.'); })
      .finally(() => { if (!cancelled) setPtcAdminLoading(false); });
    return () => { cancelled = true; };
  }, [firebaseUser, apiReady, isDemoAdmin, activeTab, apiRequest]);

  useEffect(() => {
    if (!firebaseUser || !apiReady || !isDemoAdmin) {
      setAdminAdRequests([]);
      return;
    }

    let cancelled = false;
    apiRequest('/api/admin/ads')
      .then(data => {
        if (!cancelled) setAdminAdRequests(data.requests || []);
      })
      .catch(error => {
        if (!cancelled) setAdminError(error.message || 'Could not load advertising requests.');
      });

    return () => { cancelled = true; };
  }, [firebaseUser, apiReady, isDemoAdmin, apiRequest]);

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

        setReferralStats({
          invited: Number(data.invited_count || 0),
          commissionEnabled: data.commission_enabled === true,
          commissionRateBps: Number(data.commission_rate_bps || 1500),
          commissionEarnedKoinu: Number(data.commission_earned_koinu || 0),
          recentCommissions: Array.isArray(data.recent_commissions) ? data.recent_commissions : []
        });

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
    if (!firebaseUser || !apiReady || !isDemoAdmin || activeTab !== 'admin') return undefined;
    let cancelled = false;
    const loadExpenses = async () => {
      setAdminExpensesLoading(true);
      setAdminExpensesError('');
      try {
        const data = await apiRequest('/api/admin/finance/expenses');
        if (!cancelled) setAdminExpenses(Array.isArray(data.expenses) ? data.expenses : []);
      } catch (error) {
        if (!cancelled) setAdminExpensesError(error.message || 'Could not load operating expenses.');
      } finally {
        if (!cancelled) setAdminExpensesLoading(false);
      }
    };
    loadExpenses();
    return () => { cancelled = true; };
  }, [firebaseUser, apiReady, isDemoAdmin, activeTab, apiRequest]);

  useEffect(() => {
    if (!firebaseUser || !apiReady || !isDemoAdmin || activeTab !== 'admin') {
      return undefined;
    }

    let cancelled = false;

    const loadAdminStats = async () => {
      if (document.visibilityState !== 'visible') return;

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
    const intervalId = window.setInterval(loadAdminStats, 60000);
    document.addEventListener('visibilitychange', loadAdminStats);

    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
      document.removeEventListener('visibilitychange', loadAdminStats);
    };
  }, [firebaseUser, apiReady, isDemoAdmin, activeTab, accountSyncTick, apiRequest]);

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

  const handleCopyReferralLink = async () => {
    if (!REF_CODE_REGEX.test(refCode)) return;

    const referralUrl = `${window.location.origin}/?ref=${encodeURIComponent(refCode)}`;

    try {
      await navigator.clipboard.writeText(referralUrl);
      setReferralCopyMessage('Referral link copied.');
    } catch {
      setReferralCopyMessage('Copy unavailable. Select and copy the link manually.');
    }
  };

  const handleLogin = async (e) => {
    e.preventDefault();
    setAuthError('');
    setAuthSuccess('');
    setIsLoadingAuth(true);

    try {
      // Firebase Authentication applies its own abuse protections and rate limits.
      // Login must not depend on the optional Turnstile Worker secret being configured.
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
      resetSecurityToken('login');
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

    if (!securityTokens.signup) {
      setAuthError('Please complete the Cloudflare security check.');
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

      const registrationResponse = await fetch(`${API_URL}/api/security/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ turnstileToken: securityTokens.signup })
      });
      const registrationData = await registrationResponse.json().catch(() => ({}));

      if (!registrationResponse.ok || registrationData.success !== true) {
        throw new Error(
          registrationData.error ||
          "Registration is temporarily unavailable. Please try again later."
        );
      }

      resetSecurityToken('signup');
      const credential = await createUserWithEmailAndPassword(
        auth,
        trimmedEmail,
        passwordInput
      );

      const uid = credential.user.uid;

      try {
        await sendEmailVerification(credential.user);
        setVerificationResendSeconds(60);
        setVerifyMsg('Verification email sent. Check your inbox and spam folder.');
      } catch (verifyError) {
        console.warn('Verification email could not be sent:', verifyError.message);
        setVerifyMsg('Your account was created, but Firebase could not send the verification email. Use Resend verification email below.');
      }

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
      resetSecurityToken('signup');
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

  const handleResendVerification = async () => {
    if (!firebaseUser || verificationSending || verificationResendSeconds > 0) return;

    setVerifyMsg('');
    setVerificationSending(true);

    try {
      await sendEmailVerification(firebaseUser);
      setVerificationResendSeconds(60);
      setVerifyMsg('Verification email sent. Check your inbox and spam folder.');
    } catch (error) {
      if (error.code === 'auth/too-many-requests') {
        setVerifyMsg('Too many attempts. Please wait a while before trying again.');
      } else {
        setVerifyMsg(error.message.replace('Firebase: ', ''));
      }
    } finally {
      setVerificationSending(false);
    }
  };

  const handleVerifiedContinue = async () => {
    if (!firebaseUser || verificationChecking) return;

    setVerifyMsg('');
    setVerificationChecking(true);

    try {
      await firebaseUser.reload();
      const refreshedUser = auth.currentUser;

      if (!refreshedUser || !refreshedUser.emailVerified) {
        setVerifyMsg('Your email is not verified yet. Open the link in your email, then try again.');
        return;
      }

      await refreshedUser.getIdToken(true);
      setFirebaseUser(refreshedUser);
      setVerificationResendSeconds(0);
      setAuthSyncRetry(value => value + 1);
    } catch (error) {
      setVerifyMsg(error.message.replace('Firebase: ', ''));
    } finally {
      setVerificationChecking(false);
    }
  };

  const handleSaveProfile = async (e) => {
    e.preventDefault();
    if (!firebaseUser || profileSaving) return;
    const username = profileUsernameInput.trim();
    if (!/^[A-Za-z0-9_]{3,20}$/.test(username)) {
      setProfileError('Username must be 3–20 characters: letters, numbers, or underscore.');
      return;
    }
    setProfileSaving(true);
    setProfileError('');
    try {
      const data = await apiRequest('/api/profile', {
        method: 'PUT',
        body: JSON.stringify({ username })
      });
      const savedUsername = data.profile?.username || username;
      setProfileUsernameInput(savedUsername);
      setUserProfile(prev => ({ ...(prev || {}), username: savedUsername }));
      try {
        await setDoc(doc(dbStore, 'users', firebaseUser.uid), { username: savedUsername }, { merge: true });
      } catch (firestoreError) {
        console.warn('Firestore profile mirror could not be updated:', firestoreError.message);
      }
    } catch (error) {
      setProfileError(error.message || 'Could not update your profile.');
    } finally {
      setProfileSaving(false);
    }
  };

  const handleSignOut = async () => {
    try {
      await signOut(auth);
      setVerificationResendSeconds(0);
      setVerifyMsg('');
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
    if (!securityTokens.claim) {
      showClaimMessage('Complete the Cloudflare security check before claiming.', true);
      return;
    }

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
    const claimRequestStorageKey = `dogedrip:claim-request:${firebaseUser.uid}`;

    if (!claimRequestIdRef.current) {
      let storedRequestId = null;

      try {
        const candidate = window.sessionStorage.getItem(claimRequestStorageKey);
        if (typeof candidate === 'string' && /^[A-Za-z0-9_-]{8,64}$/.test(candidate)) {
          storedRequestId = candidate;
        }
      } catch {
        // Session storage may be unavailable; the in-memory request ID still protects retries.
      }

      claimRequestIdRef.current = storedRequestId || newRequestId();

      if (!storedRequestId) {
        try {
          window.sessionStorage.setItem(claimRequestStorageKey, claimRequestIdRef.current);
        } catch {
          // Keep the request ID in memory if browser storage is unavailable.
        }
      }
    }

    const requestId = claimRequestIdRef.current;

    if (claimStatusTimerRef.current) {
      clearTimeout(claimStatusTimerRef.current);
    }

    setClaimStatus('Processing claim...');

    try {
      const data = await apiRequest('/api/claim', {
        method: 'POST',
        body: JSON.stringify({ request_id: requestId, turnstileToken: securityTokens.claim })
      });

      claimRequestIdRef.current = null;
      try {
        window.sessionStorage.removeItem(claimRequestStorageKey);
      } catch {
        // A completed claim is still confirmed by the server.
      }

      if (claimSession !== authEventRef.current) return;

      applyAccountData(data);

      const reward = Number(data.amount_koinu) / KOINU;

      // Refresh streak status only. The daily reward is credited exclusively
      // when the user presses the separate Daily Streak Bonus check-in button.
      try {
        const currentStreak = await apiRequest('/api/streak');
        applyStreakData(currentStreak);
        setStreakError('');
      } catch (streakError) {
        setStreakError(streakError.message || 'Could not refresh your daily streak.');
      }

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
      // Keep the same ID after network/5xx failures: the server may have
      // committed the claim before its response failed. Replaying that ID is safe.
      // A 4xx response is a confirmed rejection, so a fresh attempt may use a new ID.
      if (typeof error.status === 'number' && error.status < 500) {
        claimRequestIdRef.current = null;
        try {
          window.sessionStorage.removeItem(claimRequestStorageKey);
        } catch {
          // Storage cleanup is best-effort.
        }
      }

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
          error.message || 'The claim service is temporarily unavailable. No reward was credited.',
          true
        );
      } else {
        showClaimMessage(error.message || 'Could not complete claim.', true);
      }
    } finally {
      resetSecurityToken('claim');
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

  const stopWheelTickSound = () => {
    if (wheelTickTimerRef.current !== null) {
      window.clearTimeout(wheelTickTimerRef.current);
      wheelTickTimerRef.current = null;
    }
  };

  const prepareWheelAudio = () => {
    try {
      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      if (!AudioContextClass) return;
      if (!wheelAudioContextRef.current) {
        wheelAudioContextRef.current = new AudioContextClass();
      }

      const context = wheelAudioContextRef.current;
      // iOS Safari requires audio to be unlocked directly inside the tap handler.
      if (context.state === 'suspended') {
        context.resume().catch(() => {});
      }

      // Start a silent source during the user's tap to unlock the audio output.
      const unlockOscillator = context.createOscillator();
      const unlockGain = context.createGain();
      unlockGain.gain.setValueAtTime(0, context.currentTime);
      unlockOscillator.connect(unlockGain);
      unlockGain.connect(context.destination);
      unlockOscillator.start();
      unlockOscillator.stop(context.currentTime + 0.01);
      unlockOscillator.onended = () => {
        unlockOscillator.disconnect();
        unlockGain.disconnect();
      };
    } catch {
      // Audio is an enhancement; spinning must still work if audio is unavailable.
    }
  };

  const playWheelTick = () => {
    const context = wheelAudioContextRef.current;
    if (!context || context.state !== 'running') return;
    try {
      const now = context.currentTime;
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      oscillator.type = 'square';
      oscillator.frequency.setValueAtTime(1450, now);
      oscillator.frequency.exponentialRampToValueAtTime(620, now + 0.022);
      gain.gain.setValueAtTime(0.0001, now);
      gain.gain.exponentialRampToValueAtTime(0.16, now + 0.003);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.028);
      oscillator.connect(gain);
      gain.connect(context.destination);
      oscillator.start(now);
      oscillator.stop(now + 0.03);
      oscillator.onended = () => {
        oscillator.disconnect();
        gain.disconnect();
      };
    } catch {
      // Ignore audio-device errors without interrupting the wheel.
    }
  };

  const startWheelTickSound = async () => {
    stopWheelTickSound();
    const context = wheelAudioContextRef.current;
    if (!context) return;

    try {
      if (context.state === 'suspended') {
        await context.resume();
      }
      if (context.state !== 'running') return;
    } catch {
      return;
    }

    wheelSoundStartedAtRef.current = Date.now();

    const scheduleTick = () => {
      const elapsed = Date.now() - wheelSoundStartedAtRef.current;
      if (elapsed >= WHEEL_SPIN_MS) {
        stopWheelTickSound();
        return;
      }

      playWheelTick();
      const progress = Math.min(1, elapsed / WHEEL_SPIN_MS);
      const easedProgress = progress * progress;
      const nextDelay = 55 + easedProgress * 245;
      wheelTickTimerRef.current = window.setTimeout(scheduleTick, nextDelay);
    };

    scheduleTick();
  };

  const handleWheelSpin = async () => {
    if (spinInFlightRef.current || isSpinning) return;
    prepareWheelAudio();
    if (!securityTokens.wheel_spin) {
      setWheelMsgIsError(true);
      setWheelMsg('Complete the Cloudflare security check before spinning.');
      return;
    }

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
        body: JSON.stringify({ request_id: wheelSpinRequestIdRef.current, turnstileToken: securityTokens.wheel_spin })
      });
      wheelSpinRequestIdRef.current = null;
      resetSecurityToken('wheel_spin');
    } catch (error) {
      resetSecurityToken('wheel_spin');
      // Keep the same request ID after any failed response. The Worker may
      // have committed the spin before a response/network failure occurred.
      // Reusing the ID makes the retry idempotent and prevents double rewards.

      if (error.status === 404) {
        setWheelBackendMissing(true);
      } else {
        applyWheelSpins(error.data?.spins);
        setWheelMsgIsError(true);
        setWheelMsg(error.message || 'Could not spin the wheel.');
      }

      stopWheelTickSound();
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

      stopWheelTickSound();
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
    startWheelTickSound();

    if (spinTimerRef.current) {
      clearTimeout(spinTimerRef.current);
    }

    spinTimerRef.current = window.setTimeout(finish, WHEEL_SPIN_MS + 150);
  };

  const handleBuyPack = async (pack) => {
    if (!pack || spinInFlightRef.current || isSpinning || buyingPackId !== null) return;
    if (!securityTokens.wheel_buy) {
      setWheelMsgIsError(true);
      setWheelMsg('Complete the Cloudflare security check before buying spins.');
      return;
    }

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
          request_id: wheelBuyRequestRef.current.requestId,
          turnstileToken: securityTokens.wheel_buy
        })
      });

      wheelBuyRequestRef.current = null;
      resetSecurityToken('wheel_buy');

      applyAccountData(data);
      applyWheelSpins(data.spins);

      setWheelMsgIsError(false);
      setWheelMsg(
        `Purchased ${pack.spins} spin${Number(pack.spins) === 1 ? '' : 's'}.`
      );

      await refreshWheelData();
    } catch (error) {
      resetSecurityToken('wheel_buy');
      // Keep the same request ID after any failed response. A purchase may
      // already be committed, so retries must reuse its idempotency key.

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
      });

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

    if (!securityTokens.withdraw) {
      setWithdrawMsg('Complete the Cloudflare security check before requesting a withdrawal.');
      return;
    }

    setIsWithdrawing(true);

    try {
      await apiRequest('/api/withdrawals', {
        method: 'POST',
        body: JSON.stringify({
          amount_koinu: amountKoinu,
          wallet_address: withdrawAddress.trim(),
          turnstileToken: securityTokens.withdraw
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
        'Withdrawal request submitted. Payment will be processed after admin review.'
      );
    } catch (error) {
      setWithdrawMsg(error.message || 'Withdrawal request failed.');
    } finally {
      resetSecurityToken('withdraw');
      setIsWithdrawing(false);
    }
  };

  const loadPtcAdvertiserRequests = async () => {
    setPtcAdvertiserLoading(true);
    try {
      const data = await apiRequest('/api/ptc/advertiser/requests');
      setPtcAdvertiserRequests(Array.isArray(data.requests) ? data.requests : []);
    } catch (error) {
      setPtcAdvertiserMessage(error.message || 'Could not load PTC advertiser requests.');
      setPtcAdvertiserMessageError(true);
    } finally {
      setPtcAdvertiserLoading(false);
    }
  };

  useEffect(() => {
    if (activeTab !== 'advertiser' || !apiReady || !firebaseUser) return;
    loadPtcAdvertiserRequests();
  }, [activeTab, apiReady, firebaseUser]);

  const handlePtcAdvertiserSubmit = async (event) => {
    event.preventDefault();
    if (ptcAdvertiserSubmitting) return;
    setPtcAdvertiserSubmitting(true);
    setPtcAdvertiserMessage('');
    setPtcAdvertiserMessageError(false);
    try {
      const reward = Math.round(Number(ptcAdvertiserForm.reward_doge) * KOINU);
      const budget = Math.round(Number(ptcAdvertiserForm.requested_budget_doge) * KOINU);
      const maxViews = Number(ptcAdvertiserForm.max_views);
      const duration = Number(ptcAdvertiserForm.duration_seconds);
      if (!Number.isSafeInteger(reward) || !Number.isSafeInteger(budget) ||
          !Number.isSafeInteger(maxViews) || !Number.isSafeInteger(duration)) {
        throw new Error('Enter valid numeric campaign values.');
      }
      await apiRequest('/api/ptc/advertiser/requests', {
        method: 'POST',
        body: JSON.stringify({
          title: ptcAdvertiserForm.title,
          description: ptcAdvertiserForm.description,
          advertiser_name: ptcAdvertiserForm.advertiser_name,
          target_url: ptcAdvertiserForm.target_url,
          reward_koinu: reward,
          duration_seconds: duration,
          max_views: maxViews,
          requested_budget_koinu: budget
        })
      });
      setPtcAdvertiserForm({
        title: '', description: '', advertiser_name: '',
        target_url: '', reward_doge: '0.0001',
        duration_seconds: '15', max_views: '100',
        requested_budget_doge: '0.01'
      });
      await loadPtcAdvertiserRequests();
      setPtcAdvertiserMessage('PTC campaign request submitted. Our team will review it and send you a quote.');
    } catch (error) {
      setPtcAdvertiserMessage(error.message || 'Could not submit the PTC campaign.');
      setPtcAdvertiserMessageError(true);
    } finally {
      setPtcAdvertiserSubmitting(false);
    }
  };

  const handlePtcAdvertiserPayment = async (requestId) => {
    const reference = String(ptcAdvertiserPaymentRefs[requestId] || '').trim();
    if (reference.length < 5 || reference.length > 120) {
      setPtcAdvertiserMessage('Enter a valid payment reference (5-120 characters).');
      setPtcAdvertiserMessageError(true);
      return;
    }
    setPtcAdvertiserLoading(true);
    setPtcAdvertiserMessage('');
    try {
      await apiRequest(`/api/ptc/advertiser/requests/${encodeURIComponent(requestId)}/payment`, {
        method: 'POST',
        body: JSON.stringify({ payment_reference: reference })
      });
      setPtcAdvertiserPaymentRefs(prev => ({ ...prev, [requestId]: '' }));
      await loadPtcAdvertiserRequests();
      setPtcAdvertiserMessage('Payment reference submitted. Your campaign will be created after verification.');
      setPtcAdvertiserMessageError(false);
    } catch (error) {
      setPtcAdvertiserMessage(error.message || 'Could not submit payment reference.');
      setPtcAdvertiserMessageError(true);
    } finally {
      setPtcAdvertiserLoading(false);
    }
  };

  const handleAdSubmit = async (event) => {
    event.preventDefault();
    if (adSubmitting) return;

    setAdSubmitting(true);
    setAdMessage('');
    setAdMessageIsError(false);

    try {
      const payload = {
        ...adForm,
        duration_days: Number(adForm.duration_days)
      };
      await apiRequest('/api/ads', {
        method: 'POST',
        body: JSON.stringify(payload)
      });
      const data = await apiRequest('/api/ads');
      setMyAdRequests(data.requests || []);
      setAdForm({
        business_name: '',
        contact_email: firebaseUser?.email || '',
        website_url: '',
        banner_image_url: '',
        placement: 'bottom',
        duration_days: '7',
        notes: ''
      });
      setAdMessage('Your advertising request was submitted. Our team will review it and contact you with the price and payment instructions.');
    } catch (error) {
      setAdMessage(error.message || 'Could not submit advertising request.');
      setAdMessageIsError(true);
    } finally {
      setAdSubmitting(false);
    }
  };

  const handleAdPaymentReference = async (requestId) => {
    const reference = String(adPaymentRefs[requestId] || '').trim();
    if (reference.length < 5 || reference.length > 120) {
      setAdMessage('Enter a valid payment transaction reference (5-120 characters).');
      setAdMessageIsError(true);
      return;
    }

    setAdActionLoading(requestId);
    setAdMessage('');
    try {
      await apiRequest(`/api/ads/${encodeURIComponent(requestId)}/payment`, {
        method: 'POST',
        body: JSON.stringify({ payment_reference: reference })
      });
      const data = await apiRequest('/api/ads');
      setMyAdRequests(data.requests || []);
      setAdPaymentRefs(prev => ({ ...prev, [requestId]: '' }));
      setAdMessage('Payment reference submitted. Your ad will go live after admin verification.');
      setAdMessageIsError(false);
    } catch (error) {
      setAdMessage(error.message || 'Could not submit payment reference.');
      setAdMessageIsError(true);
    } finally {
      setAdActionLoading(null);
    }
  };

  const refreshAdminPtcAdvertiserRequests = async () => {
    const data = await apiRequest('/api/admin/ptc/advertiser-requests');
    setAdminPtcAdvertiserRequests(Array.isArray(data.requests) ? data.requests : []);
  };

  const handleAdminPtcAdvertiserRequest = async (request, action) => {
    if (!isDemoAdmin || ptcAdminLoading) return;
    const payload = { status: action };
    if (action === 'awaiting_payment') {
      const quote = Math.round(Number(adminPtcQuoteInputs[request.id]) * KOINU);
      if (!Number.isSafeInteger(quote) || quote < 1) {
        setAdminError('Enter a valid campaign quote in DOGE.');
        return;
      }
      payload.quoted_budget_koinu = quote;
      payload.admin_note = 'Quote issued by DogeDrip. Payment instructions will be provided separately.';
    }
    if (action === 'approve') {
      if (!request.payment_reference || !window.confirm('Confirm that you independently verified this advertiser payment. The campaign will be created as pending review and will not go live until its reserve is locked.')) return;
      payload.payment_reference = request.payment_reference;
      payload.payment_verified = true;
    }
    if (action === 'rejected') {
      payload.admin_note = 'Campaign request rejected by DogeDrip.';
    }
    setPtcAdminLoading(true);
    setAdminError('');
    try {
      await apiRequest(`/api/admin/ptc/advertiser-requests/${encodeURIComponent(request.id)}`, {
        method: 'PUT',
        body: JSON.stringify(payload)
      });
      await Promise.all([refreshAdminPtcAdvertiserRequests(), refreshAdminPtc()]);
    } catch (error) {
      setAdminError(error.message || 'Could not process advertiser campaign request.');
    } finally {
      setPtcAdminLoading(false);
    }
  };

  const refreshAdminPtc = async () => {
    setPtcAdminLoading(true);
    try {
      const [data, advertiserData] = await Promise.all([
        apiRequest('/api/admin/ptc'),
        apiRequest('/api/admin/ptc/advertiser-requests')
      ]);
      setAdminPtcData(data);
      setAdminPtcAdvertiserRequests(Array.isArray(advertiserData.requests) ? advertiserData.requests : []);
    } catch (error) {
      setAdminError(error.message || 'Could not refresh PTC administration.');
    } finally {
      setPtcAdminLoading(false);
    }
  };

  const handlePtcRewardSettlement = async (pendingUser) => {
    if (!isDemoAdmin || ptcSettlingUid || !pendingUser?.uid) return;
    const amount = Number(pendingUser.amount_koinu || 0);
    const reservePending = Number(adminPtcData?.reserve?.pending_koinu || 0);
    if (!Number.isSafeInteger(amount) || amount <= 0 || amount > reservePending) {
      setAdminError('Pending PTC reserve is insufficient for this settlement.');
      return;
    }
    const confirmed = typeof window !== 'undefined' && window.confirm(
      `Settle ${formatDoge(amount)} DOGE for ${pendingUser.email || pendingUser.username || pendingUser.uid}? This will add the reward to the user's withdrawable balance.`
    );
    if (!confirmed) return;
    setPtcSettlingUid(pendingUser.uid);
    setAdminError('');
    try {
      await apiRequest('/api/admin/ptc/settle', {
        method: 'POST',
        body: JSON.stringify({ uid: pendingUser.uid })
      });
      await refreshAdminPtc();
      await refreshAdminStats();
    } catch (error) {
      setAdminError(error.message || 'Could not settle PTC rewards.');
      await refreshAdminPtc();
    } finally {
      setPtcSettlingUid(null);
    }
  };

  const handlePtcReserveFunding = async (event) => {
    event.preventDefault();
    if (!isDemoAdmin || ptcAdminLoading) return;
    const amount = Math.round(Number(ptcFundingForm.amount_doge) * KOINU);
    if (!Number.isSafeInteger(amount) || amount < 1 || !ptcFundingForm.external_reference.trim() || !ptcFundingForm.externally_verified) {
      setAdminError('Enter a valid DOGE amount, transaction reference, and confirm external verification.');
      return;
    }
    setPtcAdminLoading(true);
    setAdminError('');
    try {
      await apiRequest('/api/admin/ptc/fund', {
        method: 'POST',
        body: JSON.stringify({
          amount_koinu: amount,
          external_reference: ptcFundingForm.external_reference.trim(),
          notes: ptcFundingForm.notes.trim(),
          externally_verified: true
        })
      });
      setPtcFundingForm({ amount_doge: '', external_reference: '', notes: '', externally_verified: false });
      await refreshAdminPtc();
    } catch (error) {
      setAdminError(error.message || 'PTC reserve funding failed.');
    } finally {
      setPtcAdminLoading(false);
    }
  };

  const handlePtcCampaignCreate = async (event) => {
    event.preventDefault();
    if (!isDemoAdmin || ptcAdminLoading) return;
    const reward = Math.round(Number(ptcCampaignForm.reward_doge) * KOINU);
    const budget = Math.round(Number(ptcCampaignForm.total_budget_doge) * KOINU);
    const duration = Number(ptcCampaignForm.duration_seconds);
    const maxViews = Number(ptcCampaignForm.max_views);
    if (!Number.isSafeInteger(reward) || !Number.isSafeInteger(budget) ||
        !Number.isSafeInteger(duration) || !Number.isSafeInteger(maxViews) ||
        !ptcCampaignForm.payment_verified) {
      setAdminError('Check campaign reward, budget, limits, and advertiser payment verification.');
      return;
    }
    setPtcAdminLoading(true);
    setAdminError('');
    try {
      await apiRequest('/api/admin/ptc/campaigns', {
        method: 'POST',
        body: JSON.stringify({
          title: ptcCampaignForm.title.trim(),
          description: ptcCampaignForm.description.trim(),
          advertiser_name: ptcCampaignForm.advertiser_name.trim(),
          target_url: ptcCampaignForm.target_url.trim(),
          reward_koinu: reward,
          duration_seconds: duration,
          max_views: maxViews,
          total_budget_koinu: budget,
          advertiser_payment_reference: ptcCampaignForm.advertiser_payment_reference.trim(),
          payment_verified: true
        })
      });
      setPtcCampaignForm({
        title: '', description: '', advertiser_name: '', target_url: '',
        reward_doge: '0.0001', duration_seconds: '15', max_views: '100',
        total_budget_doge: '0.01', advertiser_payment_reference: '', payment_verified: false
      });
      await refreshAdminPtc();
    } catch (error) {
      setAdminError(error.message || 'Could not create PTC campaign.');
    } finally {
      setPtcAdminLoading(false);
    }
  };

  const handleAdminPtcStatus = async (campaignId, status) => {
    if (!isDemoAdmin || ptcAdminLoading) return;
    setPtcAdminLoading(true);
    setAdminError('');
    try {
      await apiRequest('/api/admin/ptc/campaigns/' + encodeURIComponent(campaignId), {
        method: 'PUT',
        body: JSON.stringify({ status })
      });
      await refreshAdminPtc();
    } catch (error) {
      setAdminError(error.message || 'Could not update PTC campaign.');
    } finally {
      setPtcAdminLoading(false);
    }
  };

  const refreshAdminAds = async () => {
    try {
      const data = await apiRequest('/api/admin/ads');
      setAdminAdRequests(data.requests || []);
    } catch (error) {
      setAdminError(error.message || 'Could not refresh advertising requests.');
    }
  };

  const handleAdminAdStatus = async (request, status) => {
    if (!isDemoAdmin || adActionLoading !== null) return;

    const quote = Number(adQuoteInputs[request.id]);
    if (status === 'awaiting_payment' && (!Number.isFinite(quote) || quote <= 0 || quote > 100000)) {
      setAdminError('Enter a valid advertising price in EUR before sending the quote.');
      return;
    }

    if (status === 'active' && request.status !== 'payment_submitted') {
      setAdminError('An ad can only be activated after a payment reference has been submitted and verified.');
      return;
    }

    setAdActionLoading(request.id);
    setAdminError('');
    try {
      await apiRequest(`/api/admin/ads/${encodeURIComponent(request.id)}`, {
        method: 'PUT',
        body: JSON.stringify({
          status,
          ...(status === 'awaiting_payment' ? { quoted_price_eur: quote } : {})
        })
      });
      await refreshAdminAds();
    } catch (error) {
      setAdminError(error.message || 'Could not update advertising request.');
      await refreshAdminAds();
    } finally {
      setAdActionLoading(null);
    }
  };

  const refreshPtcData = async () => {
    const [adsData, historyData] = await Promise.all([
      apiRequest('/api/ptc/ads'),
      apiRequest('/api/ptc/history')
    ]);
    setPtcAds(Array.isArray(adsData.ads) ? adsData.ads : []);
    setPtcHistory(Array.isArray(historyData.history) ? historyData.history : []);
    setPtcPendingReward(Number(historyData.pending_reward_koinu || 0));
    setPtcSettledReward(Number(historyData.settled_reward_koinu || 0));
    setPtcCompletedViews(Number(historyData.completed_views || 0));
    setPtcSettledViews(Number(historyData.settled_views || 0));
  };

  const handlePtcStart = async (campaign) => {
    if (ptcStartingId !== null || ptcActiveView) return;
    setPtcStartingId(campaign.id);
    setPtcError('');
    setPtcMessage('');
    try {
      const data = await apiRequest('/api/ptc/start', {
        method: 'POST',
        body: JSON.stringify({ campaign_id: campaign.id })
      });
      setPtcActiveView({
        viewId: Number(data.view_id),
        viewToken: data.view_token,
        uid: firebaseUser.uid,
        title: campaign.title,
        targetUrl: campaign.target_url,
        durationSeconds: Number(campaign.duration_seconds),
        rewardKoinu: Number(campaign.reward_koinu),
        startedAtMs: Date.now()
      });
      setPtcSecondsLeft(Number(campaign.duration_seconds));
    } catch (error) {
      setPtcError(error.message || 'Could not start this ad.');
      await refreshPtcData().catch(() => {});
    } finally {
      setPtcStartingId(null);
    }
  };

  const handlePtcComplete = async () => {
    if (!ptcActiveView || ptcSecondsLeft > 0 || ptcCompleting) return;
    if (!securityTokens.ptc_complete) {
      setPtcError('Complete the Cloudflare security check first.');
      return;
    }
    setPtcCompleting(true);
    setPtcError('');
    setPtcMessage('');
    try {
      const data = await apiRequest('/api/ptc/complete', {
        method: 'POST',
        body: JSON.stringify({
          view_id: ptcActiveView.viewId,
          view_token: ptcActiveView.viewToken,
          turnstileToken: securityTokens.ptc_complete
        })
      });
      setPtcMessage('Ad completed. ' + (Number(data.reward_koinu || 0) / KOINU).toFixed(8) + ' DOGE is pending reserve settlement and is not withdrawable yet.');
      setPtcActiveView(null);
      resetSecurityToken('ptc_complete');
      await refreshPtcData();
    } catch (error) {
      setPtcError(error.message || 'Could not complete this ad. Keep this session open and retry.');
      resetSecurityToken('ptc_complete');
    } finally {
      setPtcCompleting(false);
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

  const refreshFinancialReport = async () => {
    if (!isDemoAdmin || financeReportLoading) return;
    const { start, end } = financeReportRange;
    if (!start || !end || start > end) {
      setFinanceReportError('Choose a valid date range.');
      return;
    }
    setFinanceReportLoading(true);
    setFinanceReportError('');
    try {
      const query = new URLSearchParams({ start, end });
      const data = await apiRequest(`/api/admin/finance/report?${query.toString()}`);
      setFinanceReport(data);
    } catch (error) {
      setFinanceReportError(error.message || 'Could not load the historical financial report.');
    } finally {
      setFinanceReportLoading(false);
    }
  };

  const refreshFinanceAudit = async () => {
    if (!isDemoAdmin || financeAuditLoading) return;

    setFinanceAuditLoading(true);
    setFinanceAuditError('');

    try {
      const data = await apiRequest('/api/admin/finance/audit');
      setFinanceAudit(data);
    } catch (error) {
      setFinanceAuditError(error.message || 'Could not complete the financial integrity audit.');
    } finally {
      setFinanceAuditLoading(false);
    }
  };

  const refreshAdminExpenses = async () => {
    if (!isDemoAdmin) return;
    setAdminExpensesLoading(true);
    setAdminExpensesError('');
    try {
      const data = await apiRequest('/api/admin/finance/expenses');
      setAdminExpenses(Array.isArray(data.expenses) ? data.expenses : []);
    } catch (error) {
      setAdminExpensesError(error.message || 'Could not load operating expenses. Apply migration 0008 first if this is a new database.');
    } finally {
      setAdminExpensesLoading(false);
    }
  };

  const handleAdminExpenseCreate = async (event) => {
    event.preventDefault();
    if (!isDemoAdmin || adminExpenseSaving) return;
    const amount = Number(adminExpenseForm.amount_eur);
    if (!Number.isFinite(amount) || amount <= 0 || !/^\\d+(?:\\.\\d{1,2})?$/.test(adminExpenseForm.amount_eur.trim())) {
      setAdminExpensesError('Enter a valid expense amount in EUR.');
      return;
    }
    setAdminExpenseSaving(true);
    setAdminExpensesError('');
    try {
      await apiRequest('/api/admin/finance/expenses', {
        method: 'POST',
        body: JSON.stringify({
          category: adminExpenseForm.category,
          description: adminExpenseForm.description.trim(),
          amount_cents: Math.round(amount * 100),
          expense_date: adminExpenseForm.expense_date
        })
      });
      setAdminExpenseForm(current => ({ ...current, description: '', amount_eur: '' }));
      await Promise.all([refreshAdminExpenses(), refreshAdminStats()]);
    } catch (error) {
      setAdminExpensesError(error.message || 'Could not save expense.');
    } finally {
      setAdminExpenseSaving(false);
    }
  };

  const handleAdminExpenseVerify = async (expenseId) => {
    if (!isDemoAdmin || adminExpenseVerifying) return;
    const evidence = String(adminExpenseEvidence[expenseId] || '').trim();
    if (evidence.length < 3) {
      setAdminExpensesError('Add a receipt or transaction reference before verifying.');
      return;
    }
    setAdminExpenseVerifying(expenseId);
    setAdminExpensesError('');
    try {
      await apiRequest(`/api/admin/finance/expenses/${encodeURIComponent(expenseId)}/verify`, {
        method: 'POST',
        body: JSON.stringify({ evidence_reference: evidence })
      });
      setAdminExpenseEvidence(current => ({ ...current, [expenseId]: '' }));
      await Promise.all([refreshAdminExpenses(), refreshAdminStats()]);
    } catch (error) {
      setAdminExpensesError(error.message || 'Could not verify expense.');
    } finally {
      setAdminExpenseVerifying(null);
    }
  };

  const handleFaucetPayCheck = async () => {
    if (!isDemoAdmin || faucetPayCheckLoading) return;

    setFaucetPayCheckLoading(true);
    setFaucetPayCheckError('');
    setFaucetPayBalance(null);

    try {
      const status = await apiRequest('/api/admin/faucetpay/status');
      setFaucetPayStatus(status);

      if (!status.configured) {
        throw new Error('FaucetPay API key is not configured on this Worker. Add it as a secret before testing payouts.');
      }

      const balance = await apiRequest('/api/admin/faucetpay/balance');
      setFaucetPayBalance(Number(balance.balance_doge));
    } catch (error) {
      setFaucetPayCheckError(error.message || 'Could not verify FaucetPay configuration.');
    } finally {
      setFaucetPayCheckLoading(false);
    }
  };

  const handleAdminReconcile = async (wId, resolution) => {
    if (!isDemoAdmin || adminActionLoading !== null) return;

    const payoutId = String(reconcilePayoutIds[wId] || '').trim();
    if (resolution === 'paid' && !/^\d{1,32}$/.test(payoutId)) {
      setAdminError('Enter the numeric payout ID shown in FaucetPay.');
      return;
    }

    const confirmation = resolution === 'paid'
      ? 'Confirm that you checked FaucetPay history and verified this exact payout ID was paid?'
      : 'Confirm that you checked FaucetPay history and verified this withdrawal was NOT paid?';

    if (typeof window === 'undefined' || !window.confirm(confirmation)) return;

    setAdminActionLoading(wId);
    setAdminError('');

    try {
      await apiRequest(
        `/api/admin/withdrawals/${encodeURIComponent(wId)}/reconcile`,
        {
          method: 'POST',
          body: JSON.stringify({
            resolution,
            ...(resolution === 'paid' ? { faucetpay_payout_id: payoutId } : {})
          })
        }
      );
      await refreshAdminWithdrawals();
      setReconcilePayoutIds(current => ({ ...current, [wId]: '' }));
    } catch (error) {
      setAdminError(error.message || 'Could not reconcile the FaucetPay payout.');
      await refreshAdminWithdrawals();
    } finally {
      setAdminActionLoading(null);
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

              <TurnstileWidget
                action="signup"
                onToken={token => setSecurityToken('signup', token)}
                resetKey={securityResets.signup}
              />

              <button
                type="submit"
                disabled={isLoadingAuth || !securityTokens.signup}
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
        <SiteFooter />
      </div>
    );
  }

  if (!firebaseUser.emailVerified) {
    return (
      <div className="min-h-screen bg-black text-white flex flex-col items-center justify-center p-4 font-sans">
        <div className="w-full max-w-md bg-black border border-slate-800 rounded-2xl shadow-2xl p-8 space-y-4 text-center">
          <div className="flex justify-center">
            <div className="bg-[#F4A6C1]/10 p-3 rounded-xl border border-[#F4A6C1]/20 text-[#F4A6C1]">
              <Shield className="w-8 h-8" />
            </div>
          </div>

          <h2 className="text-xl font-black text-white font-['Space_Grotesk',sans-serif]">
            Verify your email
          </h2>

          <p className="text-sm text-slate-400">
            Email verification is required before you can use DogeDrip or receive rewards.
            Open the verification link sent to{' '}
            <span className="text-white font-mono break-all">{firebaseUser.email}</span>,
            then return here and confirm below. Check your spam folder if you cannot find it.
          </p>

          <button
            type="button"
            disabled={verificationChecking}
            onClick={handleVerifiedContinue}
            className={PRIMARY_BTN}
          >
            <CheckCircle className="w-4 h-4" />
            <span>{verificationChecking ? 'Checking verification...' : 'I verified my email'}</span>
          </button>

          <button
            type="button"
            disabled={verificationSending || verificationResendSeconds > 0}
            onClick={handleResendVerification}
            className="w-full bg-black hover:bg-slate-900 border border-slate-800 text-slate-300 font-bold py-3 rounded-xl transition-all text-sm font-['Space_Grotesk',sans-serif] disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {verificationSending
              ? 'Sending verification email...'
              : verificationResendSeconds > 0
                ? `Resend available in ${verificationResendSeconds}s`
                : 'Resend verification email'}
          </button>

          <button
            type="button"
            onClick={handleSignOut}
            className="text-xs text-slate-500 hover:text-white transition-colors"
          >
            Sign out
          </button>

          {verifyMsg && (
            <p className="text-xs font-bold text-[#F4A6C1]">{verifyMsg}</p>
          )}
        </div>
        <SiteFooter />
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
            : `Claim ${formatClaimAmount(claimAmount)} DOGE`;

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
    <div className="min-h-screen bg-transparent text-white flex flex-col font-sans">
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
              onClick={() => setTheme(current => current === 'dark' ? 'light' : 'dark')}
              className="p-2 bg-black hover:bg-slate-900 border border-slate-800 text-slate-400 hover:text-white rounded-xl transition-colors"
              title={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
              aria-label={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
              aria-pressed={theme === 'light'}
            >
              {theme === 'dark' ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
            </button>

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
              onClick={() => setActiveTab('profile')}
              className={tabBtnCls('profile')}
            >
              <UserCircle className="w-4 h-4" />
              <span>My Profile</span>
            </button>

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
              onClick={() => setActiveTab('ptc')}
              className={tabBtnCls('ptc')}
            >
              <Eye className="w-4 h-4" />
              <span>PTC Ads</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('wheel')}
              className={tabBtnCls('wheel')}
            >
              <Sparkles className="w-4 h-4" />
              <span>Lucky Wheel</span>
            </button>

            <a
              href="/taskwall"
              className={tabBtnCls('taskwall')}
            >
              <Ticket className="w-4 h-4" />
              <span>Taskwall</span>
              <span className="ml-auto rounded-md border border-current/30 px-2 py-1 text-[9px] font-black tracking-wider">
                SOON
              </span>
            </a>

            <button
              type="button"
              onClick={() => setActiveTab('plans')}
              className={tabBtnCls('plans')}
            >
              <Crown className="w-4 h-4" />
              <span>Plans &amp; Advertisements</span>
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
            {adPlacements.top ? (
              <a
                href={adPlacements.top.website_url}
                target="_blank"
                rel="noopener noreferrer nofollow sponsored"
                className="relative block w-full min-h-[100px] md:min-h-[120px] bg-black border border-slate-800 rounded-2xl overflow-hidden hover:border-[#F4A6C1]/50 transition-colors"
              >
                <span className="absolute top-2 right-3 z-10 text-[9px] uppercase tracking-widest text-white bg-black/80 px-2 py-1 rounded font-mono">Sponsored</span>
                <img src={adPlacements.top.banner_image_url} alt={adPlacements.top.business_name} loading="lazy" className="w-full h-[100px] md:h-[120px] object-cover" />
              </a>
            ) : (
              <button type="button" onClick={openAdvertisingPlans} className="relative w-full min-h-[100px] md:min-h-[120px] bg-black border border-slate-800 rounded-2xl flex flex-col items-center justify-center text-center p-4 overflow-hidden hover:border-[#F4A6C1]/50 transition-colors">
                <span className="absolute top-2 right-3 text-[9px] uppercase tracking-widest text-slate-600 font-mono">Advertisement</span>
                <p className="text-sm md:text-base font-bold text-white">Advertise Your Brand on DogeDrip</p>
                <p className="text-xs text-slate-500 mt-1">Reach crypto users and promote your project here.</p>
                <span className="text-xs text-[#F4A6C1] font-bold mt-2">Submit an advertising request →</span>
              </button>
            )}
          </div>

          {activeTab === 'faucet' && (
            <div className="bg-black border border-slate-800 rounded-2xl p-6 md:p-8 space-y-6">
              <div>
                <h2 className="text-xl font-black text-white mb-1 font-['Space_Grotesk',sans-serif]">
                  Crypto Faucet Claim (DEMO)
                </h2>
                <p className="text-sm text-slate-400">
                  {rulesReady
                    ? `${planName ? `Your ${planName} plan earns` : 'You earn'} a simulated testnet reward of ${formatClaimAmount(claimAmount)} DOGE per claim${
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

              <div className="grid grid-cols-2 gap-3">
                <StatTile
                  label="Active Plan"
                  value={planName || (accountLoaded ? 'Not reported' : '...')}
                  sub={accountLoaded && !planName ? 'Server did not send a plan' : undefined}
                  valueCls={activeCatalogEntry ? activeCatalogEntry.accentText : 'text-white'}
                />
                <StatTile
                  label="Daily Reset (UTC)"
                  value={formatDuration(resetSeconds)}
                  sub="Resets at 00:00 UTC"
                />
              </div>

              <div className="bg-black border border-[#F4A6C1]/30 rounded-2xl p-4 md:p-5 space-y-3">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <h3 className="text-sm font-black text-white font-['Space_Grotesk',sans-serif]">Daily Streak Bonus</h3>
                    <p className="text-xs text-slate-400 mt-1">
                      Claim your daily streak reward manually once each UTC day. Regular Faucet Claims do not collect this bonus.
                    </p>
                  </div>
                  <CalendarCheck className="w-6 h-6 text-[#F4A6C1] shrink-0" />
                </div>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                  <StatTile
                    label="Current Streak"
                    value={streakInfo ? `Day ${streakCompletedDays} / 7` : (streakLoading ? '...' : 'N/A')}
                    valueCls="text-[#F4A6C1]"
                  />
                  <StatTile
                    label={streakCheckedToday ? "Today's Bonus" : 'Next Daily Bonus'}
                    value={streakInfo
                      ? (streakCheckedToday ? 'Claimed' : `${formatDoge(streakInfo.nextRewardKoinu)} DOGE`)
                      : (streakLoading ? '...' : 'N/A')}
                    sub={streakInfo && !streakCheckedToday && streakNextDay > 0 ? `Day ${streakNextDay}` : undefined}
                  />
                  <StatTile
                    label="Total Streak Rewards"
                    value={streakInfo ? formatDoge(streakInfo.totalRewardsKoinu) : (streakLoading ? '...' : 'N/A')}
                    sub="DOGE"
                  />
                </div>
                {streakError && (
                  <p className="text-xs text-red-400">{streakError}</p>
                )}
                {streakCheckedToday && (
                  <p className="text-xs text-emerald-400 font-bold">
                    Today's daily bonus has been credited to your balance.
                  </p>
                )}
                {streakMsg && (
                  <p className={`text-xs font-bold ${streakMsgIsError ? 'text-red-400' : 'text-emerald-400'}`} role="status">
                    {streakMsg}
                  </p>
                )}
                <button
                  type="button"
                  onClick={handleStreakCheckin}
                  disabled={!canStreakCheckin}
                  className="w-full rounded-xl px-4 py-3 font-black text-sm uppercase tracking-wide bg-[#F4A6C1] text-black hover:bg-[#f7bad0] disabled:opacity-40 disabled:cursor-not-allowed transition"
                >
                  {streakButtonLabel}
                </button>
              </div>

              <div className="relative overflow-hidden bg-black border border-slate-800 rounded-2xl p-8 flex flex-col items-center justify-center text-center space-y-6">
                <div className="bg-[#F4A6C1]/10 p-4 rounded-2xl border border-[#F4A6C1]/20 text-[#F4A6C1]">
                  <Award className="w-10 h-10" />
                </div>


                {dailyLimitReached && (
                  <div className="w-full max-w-sm bg-red-500/10 border border-red-500/20 p-4 rounded-xl space-y-1">
                    <div className="flex items-center justify-center space-x-2 text-red-400 text-sm font-bold">
                      <AlertTriangle className="w-4 h-4" />
                      <span>Daily claim limit reached</span>
                    </div>
                    <p className="text-xs text-slate-400">
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

                <TurnstileWidget
                  action="claim"
                  onToken={token => setSecurityToken('claim', token)}
                  resetKey={securityResets.claim}
                />
                <button
                  type="button"
                  onClick={handleClaim}
                  disabled={!canClaim || !securityTokens.claim}
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

          {activeTab === 'ptc' && (
            <div className="bg-black border border-slate-800 rounded-2xl p-6 md:p-8 space-y-6">
                            <div className="flex flex-wrap gap-2 mb-5">
                <button type="button" onClick={() => setPtcPanelMode('user')} className={`px-4 py-2 rounded-xl text-xs font-black border ${ptcPanelMode === 'user' ? 'bg-[#F4A6C1] text-black border-[#F4A6C1]' : 'border-slate-700 text-slate-300'}`}>Earn DOGE</button>
                <button type="button" onClick={() => setPtcPanelMode('advertiser')} className={`px-4 py-2 rounded-xl text-xs font-black border ${ptcPanelMode === 'advertiser' ? 'bg-[#F4A6C1] text-black border-[#F4A6C1]' : 'border-slate-700 text-slate-300'}`}>Advertise</button>
              </div>
              {isDemoAdmin && (
                <div className="space-y-5">
                  <section className="border border-[#F4A6C1]/30 rounded-2xl p-4 md:p-5 space-y-5">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <h3 className="text-sm font-black uppercase tracking-wider text-[#F4A6C1]">PTC Ads Management</h3>
                    <p className="text-xs text-slate-500 mt-1">Create paid campaigns and manage the separately funded PTC DOGE reserve.</p>
                  </div>
                  <button type="button" onClick={refreshAdminPtc} disabled={ptcAdminLoading} className="px-3 py-2 rounded-lg border border-[#F4A6C1]/30 text-[#F4A6C1] text-xs font-bold">Refresh</button>
                </div>

                <div className="grid grid-cols-3 gap-2">
                  <StatTile label="Available" value={formatDoge(adminPtcData?.reserve?.available_koinu || 0) + ' DOGE'} />
                  <StatTile label="Locked" value={formatDoge(adminPtcData?.reserve?.locked_koinu || 0) + ' DOGE'} />
                  <StatTile label="Pending Rewards" value={formatDoge(adminPtcData?.reserve?.pending_koinu || 0) + ' DOGE'} />
                </div>

                <div className="rounded-xl border border-slate-800 p-4 space-y-3">
                  <div>
                    <h4 className="text-xs font-black uppercase tracking-wider text-slate-300">Pending reward settlement</h4>
                    <p className="mt-1 text-[11px] text-slate-500">Completed PTC rewards become withdrawable only after an admin settles them from the funded pending reserve. Each view can be settled once.</p>
                  </div>
                  {!adminPtcData?.pending_settlements?.length ? (
                    <p className="text-xs text-slate-500">No completed PTC rewards waiting for settlement.</p>
                  ) : adminPtcData.pending_settlements.map(pendingUser => {
                    const canSettle = Number(pendingUser.amount_koinu) > 0 &&
                      Number(pendingUser.amount_koinu) <= Number(adminPtcData?.reserve?.pending_koinu || 0);
                    return (
                      <div key={pendingUser.uid} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-slate-800 p-3">
                        <div className="min-w-0">
                          <p className="truncate text-xs font-bold text-white">{pendingUser.username || pendingUser.email || pendingUser.uid}</p>
                          <p className="text-[10px] text-slate-500">{pendingUser.email || pendingUser.uid} · {Number(pendingUser.views_count || 0)} completed views</p>
                          <p className="mt-1 text-xs font-black text-[#F4A6C1]">{formatDoge(pendingUser.amount_koinu)} DOGE pending</p>
                        </div>
                        <button type="button" disabled={ptcSettlingUid !== null || !canSettle} onClick={() => handlePtcRewardSettlement(pendingUser)} className="rounded-lg border border-[#F4A6C1]/50 px-3 py-2 text-xs font-bold text-[#F4A6C1] disabled:opacity-40">{ptcSettlingUid === pendingUser.uid ? 'Settling…' : canSettle ? 'Settle rewards' : 'Reserve insufficient'}</button>
                      </div>
                    );
                  })}
                </div>

                <div className="rounded-xl border border-slate-800 p-4 space-y-3">
                  <div>
                    <h4 className="text-xs font-black uppercase tracking-wider text-slate-300">Advertiser PTC Requests</h4>
                    <p className="text-[11px] text-slate-500 mt-1">Review advertiser submissions, send a DOGE quote, and verify payment before creating a campaign.</p>
                  </div>
                  {!adminPtcAdvertiserRequests.length ? (
                    <p className="text-xs text-slate-500">No advertiser PTC requests waiting.</p>
                  ) : adminPtcAdvertiserRequests.map(request => (
                    <div key={request.id} className="rounded-lg border border-slate-800 p-3 space-y-2">
                      <div className="flex flex-wrap justify-between gap-2">
                        <strong className="text-sm text-white">{request.title}</strong>
                        <span className="text-[10px] uppercase font-black text-[#F4A6C1]">{String(request.status).replaceAll('_', ' ')}</span>
                      </div>
                      <p className="text-xs text-slate-400">{request.advertiser_name} · {request.account_email || request.advertiser_email}</p>
                      <a href={request.target_url} target="_blank" rel="noopener noreferrer nofollow" className="text-xs text-[#F4A6C1] break-all">{request.target_url}</a>
                      <p className="text-[11px] text-slate-500">{request.duration_seconds}s · {request.max_views} views · {formatDoge(request.reward_koinu)} DOGE/view · Requested {formatDoge(request.requested_budget_koinu)} DOGE</p>
                      {request.status === 'pending_review' && (
                        <div className="flex flex-col sm:flex-row gap-2">
                          <input type="number" min="0.00000001" step="0.00000001" value={adminPtcQuoteInputs[request.id] || formatDoge(request.requested_budget_koinu)} onChange={e => setAdminPtcQuoteInputs(v => ({ ...v, [request.id]: e.target.value }))} className={INPUT_CLS} placeholder="Quoted budget (DOGE)" />
                          <button type="button" disabled={ptcAdminLoading} onClick={() => handleAdminPtcAdvertiserRequest(request, 'awaiting_payment')} className="px-3 py-2 rounded-lg bg-[#F4A6C1] text-black text-xs font-black">Send quote</button>
                          <button type="button" disabled={ptcAdminLoading} onClick={() => handleAdminPtcAdvertiserRequest(request, 'rejected')} className="px-3 py-2 rounded-lg border border-red-500/30 text-red-300 text-xs font-bold">Reject</button>
                        </div>
                      )}
                      {request.status === 'awaiting_payment' && <p className="text-xs text-slate-400">Quote sent: {formatDoge(request.quoted_budget_koinu)} DOGE. Waiting for advertiser payment reference.</p>}
                      {request.status === 'payment_submitted' && (
                        <div className="space-y-2">
                          <p className="text-xs text-slate-300 break-all">Payment reference: {request.payment_reference}</p>
                          <button type="button" disabled={ptcAdminLoading} onClick={() => handleAdminPtcAdvertiserRequest(request, 'approve')} className="px-3 py-2 rounded-lg bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 text-xs font-bold">Verify payment & create campaign</button>
                          <button type="button" disabled={ptcAdminLoading} onClick={() => handleAdminPtcAdvertiserRequest(request, 'rejected')} className="px-3 py-2 rounded-lg border border-red-500/30 text-red-300 text-xs font-bold">Reject</button>
                        </div>
                      )}
                      {request.status === 'approved' && <p className="text-xs text-emerald-400">Created campaign #{request.campaign_id}. Activate it below after checking reserve.</p>}
                      {request.status === 'rejected' && <p className="text-xs text-red-300">{request.admin_note || 'Rejected'}</p>}
                    </div>
                  ))}
                </div>

                <form onSubmit={handlePtcReserveFunding} className="rounded-xl border border-slate-800 p-4 space-y-3">
                  <h4 className="text-xs font-black uppercase tracking-wider text-slate-300">Fund PTC reserve</h4>
                  <p className="text-[11px] text-slate-500">Only record DOGE already received and checked in the external wallet/provider. This does not send or withdraw coins.</p>
                  <div className="grid md:grid-cols-2 gap-3">
                    <input type="number" min="0.00000001" step="0.00000001" value={ptcFundingForm.amount_doge} onChange={e => setPtcFundingForm(v => ({ ...v, amount_doge: e.target.value }))} className={INPUT_CLS} placeholder="Received DOGE amount" required />
                    <input value={ptcFundingForm.external_reference} onChange={e => setPtcFundingForm(v => ({ ...v, external_reference: e.target.value }))} className={INPUT_CLS} placeholder="Verified transaction reference" required maxLength={120} />
                  </div>
                  <input value={ptcFundingForm.notes} onChange={e => setPtcFundingForm(v => ({ ...v, notes: e.target.value }))} className={INPUT_CLS} placeholder="Notes (optional)" maxLength={300} />
                  <label className="flex items-start gap-2 text-xs text-slate-400">
                    <input type="checkbox" checked={ptcFundingForm.externally_verified} onChange={e => setPtcFundingForm(v => ({ ...v, externally_verified: e.target.checked }))} required />
                    I personally verified that this DOGE transaction was received.
                  </label>
                  <button type="submit" disabled={ptcAdminLoading} className="px-4 py-3 rounded-xl bg-[#F4A6C1] text-black text-xs font-black disabled:opacity-50">Record Verified DOGE Funding</button>
                </form>

                <form onSubmit={handlePtcCampaignCreate} className="rounded-xl border border-slate-800 p-4 space-y-3">
                  <h4 className="text-xs font-black uppercase tracking-wider text-slate-300">Create advertiser campaign</h4>
                  <div className="grid md:grid-cols-2 gap-3">
                    <input value={ptcCampaignForm.title} onChange={e => setPtcCampaignForm(v => ({ ...v, title: e.target.value }))} className={INPUT_CLS} placeholder="Campaign title" required maxLength={80} />
                    <input value={ptcCampaignForm.advertiser_name} onChange={e => setPtcCampaignForm(v => ({ ...v, advertiser_name: e.target.value }))} className={INPUT_CLS} placeholder="Advertiser / project name" required maxLength={80} />
                  </div>
                  <textarea value={ptcCampaignForm.description} onChange={e => setPtcCampaignForm(v => ({ ...v, description: e.target.value }))} className={INPUT_CLS} placeholder="Campaign description (10-500 characters)" required minLength={10} maxLength={500} rows={3} />
                  <input type="url" value={ptcCampaignForm.target_url} onChange={e => setPtcCampaignForm(v => ({ ...v, target_url: e.target.value }))} className={INPUT_CLS} placeholder="https://advertiser-website.com" required />
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                    <label className="text-[10px] text-slate-500">Reward (DOGE)<input type="number" min="0.00000001" step="0.00000001" value={ptcCampaignForm.reward_doge} onChange={e => setPtcCampaignForm(v => ({ ...v, reward_doge: e.target.value }))} className={INPUT_CLS} required /></label>
                    <label className="text-[10px] text-slate-500">Seconds<input type="number" min="10" max="180" step="1" value={ptcCampaignForm.duration_seconds} onChange={e => setPtcCampaignForm(v => ({ ...v, duration_seconds: e.target.value }))} className={INPUT_CLS} required /></label>
                    <label className="text-[10px] text-slate-500">Max views<input type="number" min="1" max="10000000" step="1" value={ptcCampaignForm.max_views} onChange={e => setPtcCampaignForm(v => ({ ...v, max_views: e.target.value }))} className={INPUT_CLS} required /></label>
                    <label className="text-[10px] text-slate-500">Budget (DOGE)<input type="number" min="0.00000001" step="0.00000001" value={ptcCampaignForm.total_budget_doge} onChange={e => setPtcCampaignForm(v => ({ ...v, total_budget_doge: e.target.value }))} className={INPUT_CLS} required /></label>
                  </div>
                  <input value={ptcCampaignForm.advertiser_payment_reference} onChange={e => setPtcCampaignForm(v => ({ ...v, advertiser_payment_reference: e.target.value }))} className={INPUT_CLS} placeholder="Advertiser's verified payment reference" required maxLength={120} />
                  <label className="flex items-start gap-2 text-xs text-slate-400">
                    <input type="checkbox" checked={ptcCampaignForm.payment_verified} onChange={e => setPtcCampaignForm(v => ({ ...v, payment_verified: e.target.checked }))} required />
                    Advertiser payment has been independently verified before campaign creation.
                  </label>
                  <button type="submit" disabled={ptcAdminLoading} className="px-4 py-3 rounded-xl bg-[#F4A6C1] text-black text-xs font-black disabled:opacity-50">Create PTC Campaign</button>
                </form>

                <div className="space-y-3">
                  <h4 className="text-xs font-black uppercase tracking-wider text-slate-300">Campaigns</h4>
                  {!adminPtcData?.campaigns?.length ? (
                    <p className="text-xs text-slate-500">No PTC campaigns created yet.</p>
                  ) : adminPtcData.campaigns.map(campaign => (
                    <div key={campaign.id} className="rounded-xl border border-slate-800 p-3 space-y-2">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <strong className="text-sm text-white">{campaign.title}</strong>
                        <span className="text-[10px] uppercase font-black text-[#F4A6C1]">{campaign.status.replaceAll('_', ' ')}</span>
                      </div>
                      <p className="text-xs text-slate-400">{campaign.advertiser_name} · {campaign.duration_seconds}s · {formatDoge(campaign.reward_koinu)} DOGE/view</p>
                      <p className="text-[10px] text-slate-500">{campaign.views_completed}/{campaign.max_views} views · {formatDoge(campaign.remaining_budget_koinu)} DOGE remaining</p>
                      <div className="flex flex-wrap gap-2">
                        {campaign.status === 'pending_review' && <button type="button" disabled={ptcAdminLoading} onClick={() => handleAdminPtcStatus(campaign.id, 'active')} className="px-3 py-2 rounded-lg bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-xs font-bold">Activate (lock reserve)</button>}
                        {campaign.status === 'active' && <button type="button" disabled={ptcAdminLoading} onClick={() => handleAdminPtcStatus(campaign.id, 'paused')} className="px-3 py-2 rounded-lg border border-yellow-500/30 text-yellow-400 text-xs font-bold">Pause</button>}
                        {campaign.status === 'paused' && campaign.remaining_budget_koinu > 0 && <button type="button" disabled={ptcAdminLoading} onClick={() => handleAdminPtcStatus(campaign.id, 'active')} className="px-3 py-2 rounded-lg bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-xs font-bold">Resume</button>}
                        {['active', 'paused'].includes(campaign.status) && <button type="button" disabled={ptcAdminLoading} onClick={() => handleAdminPtcStatus(campaign.id, 'completed')} className="px-3 py-2 rounded-lg border border-slate-700 text-slate-300 text-xs font-bold">Close & release unused budget</button>}
                        {campaign.status === 'pending_review' && <button type="button" disabled={ptcAdminLoading} onClick={() => handleAdminPtcStatus(campaign.id, 'rejected')} className="px-3 py-2 rounded-lg border border-red-500/30 text-red-400 text-xs font-bold">Reject</button>}
                      </div>
                    </div>
                  ))}
                </div>
              </section>
                </div>
              )}
              {!isDemoAdmin && ptcPanelMode === 'advertiser' && (
                <div className="space-y-5">
                  <div className="bg-black border border-slate-800 rounded-2xl p-6 md:p-8 space-y-6">
              <div>
                <h2 className="text-xl font-black text-white font-['Space_Grotesk',sans-serif]">Advertiser Dashboard</h2>
                <p className="text-sm text-slate-400 mt-1">Create sponsored PTC campaigns and monitor requests, views and campaign budgets.</p>
              </div>
              <section id="ptc-advertiser-portal" className="border-t border-slate-800 pt-7 space-y-5 scroll-mt-6">
                <div>
                  <h2 className="text-xl font-black text-white font-['Space_Grotesk',sans-serif]">PTC Campaign Manager</h2>
                  <p className="text-sm text-slate-400 mt-1">Submit a sponsored website campaign. Our team reviews the details, confirms the price and verifies payment before the campaign can go live.</p>
                </div>
                {ptcAdvertiserMessage && (
                  <div className={`p-3 rounded-xl text-sm border ${ptcAdvertiserMessageError ? 'bg-red-500/10 border-red-500/30 text-red-300' : 'bg-[#F4A6C1]/10 border-[#F4A6C1]/30 text-[#F4A6C1]'}`}>
                    {ptcAdvertiserMessage}
                  </div>
                )}
                <form onSubmit={handlePtcAdvertiserSubmit} className="bg-black border border-slate-800 rounded-2xl p-5 space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <label className="block">
                      <span className={LABEL_CLS}>Business / Advertiser Name</span>
                      <input required minLength={2} maxLength={80} value={ptcAdvertiserForm.advertiser_name} onChange={e => setPtcAdvertiserForm(p => ({ ...p, advertiser_name: e.target.value }))} className={INPUT_CLS} placeholder="Your company" />
                    </label>
                    <label className="block">
                      <span className={LABEL_CLS}>Campaign Title</span>
                      <input required minLength={3} maxLength={80} value={ptcAdvertiserForm.title} onChange={e => setPtcAdvertiserForm(p => ({ ...p, title: e.target.value }))} className={INPUT_CLS} placeholder="Visit our website" />
                    </label>
                    <label className="block md:col-span-2">
                      <span className={LABEL_CLS}>Website URL</span>
                      <input required type="url" maxLength={2048} value={ptcAdvertiserForm.target_url} onChange={e => setPtcAdvertiserForm(p => ({ ...p, target_url: e.target.value }))} className={INPUT_CLS} placeholder="https://example.com" />
                    </label>
                    <label className="block md:col-span-2">
                      <span className={LABEL_CLS}>Campaign Description</span>
                      <textarea required minLength={10} maxLength={500} rows={3} value={ptcAdvertiserForm.description} onChange={e => setPtcAdvertiserForm(p => ({ ...p, description: e.target.value }))} className={INPUT_CLS} placeholder="Describe the website or product users will visit." />
                    </label>
                    <label className="block">
                      <span className={LABEL_CLS}>Reward per completed view (DOGE)</span>
                      <input required type="number" min="0.00000001" max="1" step="0.00000001" value={ptcAdvertiserForm.reward_doge} onChange={e => setPtcAdvertiserForm(p => ({ ...p, reward_doge: e.target.value }))} className={INPUT_CLS} />
                    </label>
                    <label className="block">
                      <span className={LABEL_CLS}>Visit duration</span>
                      <select value={ptcAdvertiserForm.duration_seconds} onChange={e => setPtcAdvertiserForm(p => ({ ...p, duration_seconds: e.target.value }))} className={INPUT_CLS}>
                        {[10, 15, 20, 30, 45, 60, 90, 120, 180].map(seconds => <option key={seconds} value={seconds}>{seconds} seconds</option>)}
                      </select>
                    </label>
                    <label className="block">
                      <span className={LABEL_CLS}>Maximum views</span>
                      <input required type="number" min="1" max="10000000" step="1" value={ptcAdvertiserForm.max_views} onChange={e => setPtcAdvertiserForm(p => ({ ...p, max_views: e.target.value }))} className={INPUT_CLS} />
                    </label>
                    <label className="block">
                      <span className={LABEL_CLS}>Proposed campaign budget (DOGE)</span>
                      <input required type="number" min="0.00000001" max="10000" step="0.00000001" value={ptcAdvertiserForm.requested_budget_doge} onChange={e => setPtcAdvertiserForm(p => ({ ...p, requested_budget_doge: e.target.value }))} className={INPUT_CLS} />
                    </label>
                  </div>
                  <p className="text-xs text-slate-500">Submitting a request does not charge you. Final price and payment instructions are provided after review. Campaigns are not activated until payment is independently verified and the PTC reserve is funded.</p>
                  <button type="submit" disabled={ptcAdvertiserSubmitting || !apiReady} className={PRIMARY_BTN}>{ptcAdvertiserSubmitting ? 'Submitting...' : 'Submit PTC Campaign'}</button>
                </form>
                <div className="bg-black border border-slate-800 rounded-2xl p-5 space-y-4">
                  <div className="flex items-center justify-between gap-3">
                    <h3 className="text-sm font-black uppercase tracking-wider text-slate-300">My PTC Campaign Requests</h3>
                    <button type="button" disabled={ptcAdvertiserLoading} onClick={loadPtcAdvertiserRequests} className="px-3 py-2 rounded-lg border border-slate-700 text-xs text-slate-300 font-bold">{ptcAdvertiserLoading ? 'Loading...' : 'Refresh'}</button>
                  </div>
                  {ptcAdvertiserRequests.length === 0 ? (
                    <p className="text-sm text-slate-500">No PTC campaign requests yet.</p>
                  ) : ptcAdvertiserRequests.map(request => (
                    <div key={request.id} className="border border-slate-800 rounded-xl p-4 space-y-3">
                      <div className="flex flex-wrap justify-between gap-2">
                        <strong className="text-white">{request.title}</strong>
                        <span className="text-[10px] uppercase font-black text-[#F4A6C1]">{String(request.status).replaceAll('_', ' ')}</span>
                      </div>
                      <a href={request.target_url} target="_blank" rel="noopener noreferrer nofollow" className="text-xs text-[#F4A6C1] break-all">{request.target_url}</a>
                      <p className="text-xs text-slate-400">{request.duration_seconds}s visit · {request.max_views} views · {formatDoge(request.reward_koinu)} DOGE/view</p>
                      <p className="text-xs text-slate-500">Requested budget: {formatDoge(request.requested_budget_koinu)} DOGE{request.quoted_budget_koinu ? ` · Quoted: ${formatDoge(request.quoted_budget_koinu)} DOGE` : ''}</p>
                      {request.status === 'awaiting_payment' && (
                        <div className="space-y-2">
                          <p className="text-xs text-slate-400">Pay using the instructions sent by DogeDrip, then enter the transaction reference.</p>
                          <input value={ptcAdvertiserPaymentRefs[request.id] || ''} onChange={e => setPtcAdvertiserPaymentRefs(p => ({ ...p, [request.id]: e.target.value }))} maxLength={120} className={INPUT_CLS} placeholder="Payment transaction reference" />
                          <button type="button" disabled={ptcAdvertiserLoading} onClick={() => handlePtcAdvertiserPayment(request.id)} className={PRIMARY_BTN}>Submit Payment Reference</button>
                        </div>
                      )}
                      {request.status === 'payment_submitted' && <p className="text-xs text-emerald-400">Payment reference submitted. Waiting for verification.</p>}
                      {request.status === 'approved' && (
                        <div className="rounded-xl border border-slate-800 bg-slate-950 p-3 space-y-2">
                          <p className="text-xs text-emerald-400">Payment verified · Campaign #{request.campaign_id}</p>
                          {request.campaign_status ? (
                            <>
                              <div className="flex justify-between gap-2 text-xs">
                                <span className="text-slate-400">Campaign status</span>
                                <strong className="text-white uppercase">{String(request.campaign_status).replaceAll('_', ' ')}</strong>
                              </div>
                              <div className="grid grid-cols-2 gap-3">
                                <div>
                                  <p className="text-[10px] uppercase text-slate-500">Completed views</p>
                                  <p className="text-sm font-black text-white">{Number(request.campaign_views_completed || 0).toLocaleString()} / {Number(request.max_views || 0).toLocaleString()}</p>
                                </div>
                                <div>
                                  <p className="text-[10px] uppercase text-slate-500">Views remaining</p>
                                  <p className="text-sm font-black text-white">{Math.max(0, Number(request.max_views || 0) - Number(request.campaign_views_completed || 0)).toLocaleString()}</p>
                                </div>
                                <div>
                                  <p className="text-[10px] uppercase text-slate-500">Budget spent</p>
                                  <p className="text-sm font-black text-white">{formatDoge(request.campaign_spent_koinu)} DOGE</p>
                                </div>
                                <div>
                                  <p className="text-[10px] uppercase text-slate-500">Budget remaining</p>
                                  <p className="text-sm font-black text-white">{formatDoge(request.campaign_remaining_budget_koinu)} DOGE</p>
                                </div>
                              </div>
                            </>
                          ) : (
                            <p className="text-xs text-slate-400">Campaign created and waiting for admin activation.</p>
                          )}
                        </div>
                      )}
                      {request.status === 'rejected' && <p className="text-xs text-red-300">{request.admin_note || 'This campaign request was rejected.'}</p>}
                    </div>
                  ))}
                </div>
              </section>
            </div>
                </div>
              )}
              {!isDemoAdmin && ptcPanelMode === 'user' && (
                <div className="space-y-5">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h2 className="text-2xl font-black text-white font-['Space_Grotesk',sans-serif]">Paid To Click</h2>
                  <p className="text-sm text-slate-400 mt-1">View sponsored websites for the required time and earn pending DOGE rewards.</p>
                </div>
                <button type="button" onClick={() => refreshPtcData().catch(error => setPtcError(error.message))} disabled={ptcLoading} className="px-3 py-2 rounded-lg border border-slate-700 text-xs font-bold text-slate-300 disabled:opacity-50">
                  <RefreshCw className={`w-3 h-3 inline mr-2 ${ptcLoading ? 'animate-spin' : ''}`} />Refresh
                </button>
              </div>

              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <StatTile label="Pending PTC Rewards" value={(ptcPendingReward / KOINU).toFixed(8) + ' DOGE'} />
                <StatTile label="Settled PTC Rewards" value={(ptcSettledReward / KOINU).toFixed(8) + ' DOGE'} sub={`${ptcSettledViews} views credited to balance`} />
                <StatTile label="Pending Views" value={String(ptcCompletedViews)} />
                <StatTile label="Completed Views" value={String(ptcCompletedViews + ptcSettledViews)} />
              </div>

              <div className="rounded-xl border border-yellow-500/20 bg-yellow-500/5 p-3 text-xs text-yellow-300">
                Pending rewards are not withdrawable. Once an admin settles them from the funded PTC reserve, they are credited to your DOGE balance.
              </div>

              {ptcError && <div role="alert" className="rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-400">{ptcError}</div>}
              {ptcMessage && <div role="status" className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3 text-sm text-emerald-400">{ptcMessage}</div>}

              {ptcActiveView && (
                <div className="rounded-2xl border border-[#F4A6C1]/40 p-4 space-y-4">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="text-[10px] uppercase tracking-widest text-[#F4A6C1] font-black">Ad in progress</p>
                      <h3 className="text-base font-bold text-white mt-1">{ptcActiveView.title}</h3>
                    </div>
                    <div className="text-right">
                      <p className="text-[10px] uppercase text-slate-500">Time left</p>
                      <p className="text-2xl font-black text-white tabular-nums">{ptcSecondsLeft}s</p>
                    </div>
                  </div>
                  <a href={ptcActiveView.targetUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2 rounded-lg border border-slate-700 px-4 py-3 text-sm font-bold text-[#F4A6C1]">
                    Open advertiser website <ExternalLink className="w-4 h-4" />
                  </a>
                  <div className="h-2 rounded-full bg-slate-800 overflow-hidden">
                    <div className="h-full bg-[#F4A6C1] transition-all" style={{ width: (ptcActiveView.durationSeconds ? Math.min(100, Math.max(0, ((ptcActiveView.durationSeconds - ptcSecondsLeft) / ptcActiveView.durationSeconds) * 100)) : 0) + '%' }} />
                  </div>
                  {ptcSecondsLeft === 0 ? (
                    <div className="space-y-3">
                      <TurnstileWidget
                        action="ptc_complete"
                        onToken={token => setSecurityToken('ptc_complete', token)}
                        resetKey={securityResets.ptc_complete}
                      />
                      <button type="button" onClick={handlePtcComplete} disabled={ptcCompleting || !securityTokens.ptc_complete} className={PRIMARY_BTN}>
                        {ptcCompleting ? 'Verifying view...' : 'Complete Ad & Collect Reward'}
                      </button>
                    </div>
                  ) : (
                    <p className="text-xs text-slate-500">Keep this session open until the timer finishes. The server verifies the actual viewing time.</p>
                  )}
                </div>
              )}

              {!ptcActiveView && (
                <div className="space-y-3">
                  <h3 className="text-sm font-black uppercase tracking-wider text-slate-300">Available Sponsored Ads</h3>
                  {ptcLoading ? (
                    <p className="text-sm text-slate-500">Loading available ads...</p>
                  ) : ptcAds.length === 0 ? (
                    <div className="rounded-xl border border-slate-800 p-6 text-center">
                      <Eye className="w-7 h-7 mx-auto text-slate-600 mb-2" />
                      <p className="text-sm font-bold text-white">No PTC ads available right now</p>
                      <p className="text-xs text-slate-500 mt-1">New sponsored campaigns will appear here when approved and funded.</p>
                    </div>
                  ) : ptcAds.map(ad => (
                    <div key={ad.id} className="rounded-xl border border-slate-800 p-4 flex flex-col md:flex-row md:items-center justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-sm font-bold text-white">{ad.title}</p>
                        <p className="text-xs text-slate-400 mt-1">{ad.description}</p>
                        <p className="text-[10px] text-slate-500 mt-2">{ad.advertiser_name} · {ad.duration_seconds}s · {Math.max(0, ad.max_views - ad.views_completed)} views left</p>
                      </div>
                      <div className="flex items-center justify-between md:justify-end gap-3">
                        <span className="text-sm font-black text-[#F4A6C1] whitespace-nowrap">+{(Number(ad.reward_koinu) / KOINU).toFixed(8)} DOGE</span>
                        <button type="button" onClick={() => handlePtcStart(ad)} disabled={ptcStartingId !== null || Boolean(ptcActiveView)} className="rounded-lg bg-[#F4A6C1] text-black px-4 py-2 text-xs font-black disabled:opacity-50">
                          {ptcStartingId === ad.id ? 'Starting...' : 'Start Ad'}
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              <div className="space-y-3">
                <h3 className="text-sm font-black uppercase tracking-wider text-slate-300">PTC History</h3>
                {ptcHistory.length === 0 ? (
                  <p className="text-xs text-slate-500">Your completed and started ad views will appear here.</p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs">
                      <thead className="text-slate-500 uppercase border-b border-slate-800">
                        <tr><th className="py-2 pr-3">Campaign</th><th className="py-2 pr-3">Reward</th><th className="py-2">Status</th></tr>
                      </thead>
                      <tbody className="divide-y divide-slate-800">
                        {ptcHistory.map(item => (
                          <tr key={item.id}>
                            <td className="py-3 pr-3 text-white">{item.title}</td>
                            <td className="py-3 pr-3 text-[#F4A6C1]">{(Number(item.reward_koinu) / KOINU).toFixed(8)} DOGE</td>
                            <td className="py-3 text-slate-400">{item.status === 'settled' ? 'Credited to balance' : item.status === 'completed' ? 'Pending settlement' : item.status}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
                </div>
              )}

            </div>
          )}

          {activeTab === 'wheel' && (
            <div className="bg-black border border-slate-800 rounded-2xl p-6 md:p-8 space-y-8">
              <div className="text-center">
                <h2 className="text-2xl font-black text-white mb-1 font-['Space_Grotesk',sans-serif] tracking-tight">
                  Lucky Wheel
                </h2>
                <p className="text-sm text-slate-400">
                  Spin for server-verified DOGE rewards.
                </p>
              </div>

              {wheelBackendMissing && (
                <div className="p-4 bg-yellow-500/10 border border-yellow-500/20 text-yellow-400 rounded-xl text-sm flex items-start gap-2">
                  <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                  <span>
                    The Lucky Wheel service is not available. Check that the Worker is deployed
                    with the latest code and that wheel prizes and the payout reserve are configured.
                    No balance changes are made while the wheel is unavailable.
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

                <TurnstileWidget
                  action="wheel_spin"
                  onToken={token => setSecurityToken('wheel_spin', token)}
                  resetKey={securityResets.wheel_spin}
                />
                <button
                  type="button"
                  onClick={handleWheelSpin}
                  disabled={!canSpin || !securityTokens.wheel_spin}
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

                <TurnstileWidget
                  action="wheel_buy"
                  onToken={token => setSecurityToken('wheel_buy', token)}
                  resetKey={securityResets.wheel_buy}
                />

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
                            disabled={!apiReady || !securityTokens.wheel_buy || isSpinning || buyingPackId !== null || cannotAfford || wheelBuyPaused}
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
                  Plans &amp; Advertisements
                </h2>
                <p className="text-sm text-slate-400">
                  Manage your DogeDrip membership and advertising campaigns in one place.
                </p>
                <h3 className="text-base font-black uppercase tracking-wider text-slate-300 mt-5">Membership Plans</h3>
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

              {subscriptionCheckoutMessage && (
                <div role="alert" className="p-3 rounded-xl border border-red-500/30 bg-red-500/10 text-red-400 text-sm">
                  {subscriptionCheckoutMessage}
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
                            onClick={() => handleSubscriptionCheckout(p.key)}
                            disabled={!apiReady || Boolean(subscriptionCheckoutLoading)}
                            className="w-full bg-[#F4A6C1] hover:bg-[#e091ad] disabled:opacity-50 disabled:cursor-not-allowed text-black font-black py-3 rounded-xl flex items-center justify-center space-x-2 text-sm font-['Space_Grotesk',sans-serif] tracking-wide transition-colors"
                          >
                            {subscriptionCheckoutLoading === p.key ? 'Preparing secure checkout...' : 'Subscribe with FaucetPay'}
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>

              

              <div id="advertising-plans" className="border-t border-slate-800 pt-7 space-y-5 scroll-mt-6">
                <div>
                  <h2 className="text-xl font-black text-white mb-1 font-['Space_Grotesk',sans-serif]">
                    Advertising Plans
                  </h2>
                  <p className="text-sm text-slate-400">
                    Promote your website with a sponsored banner on DogeDrip. Choose a placement and campaign duration.
                  </p>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
                  {[
                    { placement: 'bottom', title: 'Bottom Banner', description: 'Displayed at the bottom of the DogeDrip page.', icon: Wallet },
                    { placement: 'top', title: 'Top Banner', description: 'Premium visibility near the top of the DogeDrip page.', icon: Award }
                  ].map(group => {
                    const PlacementIcon = group.icon;
                    return (
                      <section key={group.placement} className="border border-slate-800 rounded-2xl p-4 md:p-5 space-y-4">
                        <div className="flex items-center gap-3">
                          <div className="p-3 rounded-xl bg-[#F4A6C1]/10 border border-[#F4A6C1]/20 text-[#F4A6C1]">
                            <PlacementIcon className="w-5 h-5" />
                          </div>
                          <div>
                            <h3 className="text-base font-black text-white">{group.title}</h3>
                            <p className="text-xs text-slate-500">{group.description}</p>
                          </div>
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                          {ADVERTISING_PLAN_CATALOG.filter(plan => plan.placement === group.placement).map(plan => (
                            <div key={plan.key} className="bg-black border border-slate-800 rounded-xl p-4 flex flex-col">
                              <span className="text-xs font-bold text-slate-400">{plan.days} days</span>
                              <span className="text-2xl font-black font-mono text-white mt-1">{plan.price}</span>
                              {plan.days === 30 ? (
                                <span className="text-[11px] font-black text-[#F4A6C1] mt-2">+ 5 DAYS FREE</span>
                              ) : (
                                <span className="text-[11px] text-slate-500 mt-2">Standard duration</span>
                              )}
                              <span className="text-[11px] text-slate-400 mt-1">{plan.totalDays} days of advertising</span>
                              <button
                                type="button"
                                onClick={() => {
                                  setAdForm(prev => ({
                                    ...prev,
                                    placement: plan.placement,
                                    duration_days: String(plan.days)
                                  }));
                                  setAdMessage('');
                                  setAdMessageIsError(false);
                                  setActiveTab('plans');
                                }}
                                className="mt-4 w-full bg-[#F4A6C1] hover:bg-[#e091ad] text-black font-black py-2.5 rounded-lg text-xs transition-colors"
                              >
                                Choose Plan
                              </button>
                            </div>
                          ))}
                        </div>
                      </section>
                    );
                  })}
                </div>
                <p className="text-[11px] text-slate-500">
                  Displayed prices are launch package rates. Your campaign is reviewed before payment instructions are sent. The 5 bonus days on 30-day packages are applied after payment verification.
                </p>
              </div>

              <div className="border-t border-slate-800 pt-7 space-y-5">
                <div>
                  <h2 className="text-xl font-black text-white mb-1 font-['Space_Grotesk',sans-serif]">Advertising Campaign</h2>
                  <p className="text-sm text-slate-400">Choose an advertising package above, then submit your campaign details below.</p>
                </div>
            <div className="bg-black border border-slate-800 rounded-2xl p-6 md:p-8 space-y-6">
              <div>
                <h2 className="text-xl font-black text-white font-['Space_Grotesk',sans-serif]">Submit an Advertising Request</h2>
                <p className="text-sm text-slate-400 mt-2">Promote your website to DogeDrip users. Submit your campaign for review. Your quote will appear here, and payment instructions will be sent separately by our team.</p>
              </div>

              {adMessage && (
                <div className={`p-3 rounded-xl text-sm border ${adMessageIsError ? 'bg-red-500/10 border-red-500/30 text-red-400' : 'bg-[#F4A6C1]/10 border-[#F4A6C1]/30 text-[#F4A6C1]'}`}>
                  {adMessage}
                </div>
              )}

              <form id="advertising-request" onSubmit={handleAdSubmit} className="space-y-4 scroll-mt-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <label className="block">
                    <span className={LABEL_CLS}>Business / Project Name</span>
                    <input required minLength={2} maxLength={80} value={adForm.business_name} onChange={e => setAdForm(prev => ({ ...prev, business_name: e.target.value }))} className={INPUT_CLS} placeholder="Your brand name" />
                  </label>
                  <label className="block">
                    <span className={LABEL_CLS}>Contact Email</span>
                    <input required type="email" maxLength={254} value={adForm.contact_email} onChange={e => setAdForm(prev => ({ ...prev, contact_email: e.target.value }))} className={INPUT_CLS} placeholder="you@example.com" />
                  </label>
                  <label className="block md:col-span-2">
                    <span className={LABEL_CLS}>Website URL</span>
                    <input required type="url" maxLength={2048} value={adForm.website_url} onChange={e => setAdForm(prev => ({ ...prev, website_url: e.target.value }))} className={INPUT_CLS} placeholder="https://example.com" />
                  </label>
                  <label className="block md:col-span-2">
                    <span className={LABEL_CLS}>Banner Image URL</span>
                    <input required type="url" maxLength={2048} value={adForm.banner_image_url} onChange={e => setAdForm(prev => ({ ...prev, banner_image_url: e.target.value }))} className={INPUT_CLS} placeholder="https://example.com/banner.jpg" />
                  </label>
                  <label className="block">
                    <span className={LABEL_CLS}>Ad Placement</span>
                    <select value={adForm.placement} onChange={e => setAdForm(prev => ({ ...prev, placement: e.target.value }))} className={INPUT_CLS}>
                      <option value="top">Top banner</option>
                      <option value="bottom">Bottom banner</option>
                    </select>
                  </label>
                  <label className="block">
                    <span className={LABEL_CLS}>Duration</span>
                    <select value={adForm.duration_days} onChange={e => setAdForm(prev => ({ ...prev, duration_days: e.target.value }))} className={INPUT_CLS}>
                      <option value="7">7 days</option>
                      <option value="14">14 days</option>
                      <option value="30">30 days</option>
                    </select>
                  </label>
                </div>

                <label className="block">
                  <span className={LABEL_CLS}>Campaign Details (Optional)</span>
                  <textarea maxLength={500} rows={3} value={adForm.notes} onChange={e => setAdForm(prev => ({ ...prev, notes: e.target.value }))} className={INPUT_CLS} placeholder="Tell us briefly what you want to promote." />
                </label>

                <p className="text-xs text-slate-500">No payment is collected by this form. After reviewing your request, DogeDrip will email you a quote and secure payment instructions. Ads are published only after payment is verified.</p>
                <button type="submit" disabled={adSubmitting || !apiReady} className={PRIMARY_BTN}>
                  {adSubmitting ? 'Submitting request...' : 'Submit Advertising Request'}
                </button>
              </form>

              <div className="border-t border-slate-800 pt-5 space-y-3">
                <div className="flex items-center justify-between gap-3">
                  <h3 className="text-sm font-black uppercase tracking-wider text-slate-300">Your Advertising Requests</h3>
                  <button type="button" onClick={async () => {
                    try {
                      const [requestsData, placementsData] = await Promise.all([
                        apiRequest('/api/ads'),
                        apiRequest('/api/ads/placements')
                      ]);
                      setMyAdRequests(requestsData.requests || []);
                      setAdPlacements(placementsData.placements || { top: null, bottom: null });
                    } catch (error) {
                      setAdMessage(error.message || 'Could not refresh advertising requests.');
                      setAdMessageIsError(true);
                    }
                  }} className="px-3 py-2 rounded-lg border border-slate-700 text-xs text-slate-300 font-bold">Refresh</button>
                </div>
                {myAdRequests.length === 0 ? (
                  <p className="text-sm text-slate-500">You have not submitted any advertising requests yet.</p>
                ) : myAdRequests.map(request => (
                  <div key={request.id} className="border border-slate-800 rounded-xl p-4 space-y-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <strong className="text-white">{request.business_name}</strong>
                      <span className="text-[10px] uppercase font-black tracking-wider text-[#F4A6C1]">{String(request.status).replaceAll('_', ' ')}</span>
                    </div>
                    <a href={request.website_url} target="_blank" rel="noopener noreferrer" className="text-xs text-[#F4A6C1] break-all">{request.website_url}</a>
                    <p className="text-xs text-slate-500">{request.placement} placement · {request.duration_days === 30 ? '30 days + 5 bonus (35 total)' : request.duration_days + ' days'} · {request.quoted_price_eur ? `€${Number(request.quoted_price_eur).toFixed(2)}` : 'Price pending review'}</p>
                    {request.status === 'awaiting_payment' && (
                      <div className="space-y-2">
                        <p className="text-xs text-slate-400">Check your contact email for payment instructions. After paying, enter the transaction reference below.</p>
                        <input value={adPaymentRefs[request.id] || ''} onChange={e => setAdPaymentRefs(prev => ({ ...prev, [request.id]: e.target.value }))} maxLength={120} className={INPUT_CLS} placeholder="Payment transaction reference" />
                        <button type="button" disabled={adActionLoading === request.id} onClick={() => handleAdPaymentReference(request.id)} className={PRIMARY_BTN}>{adActionLoading === request.id ? 'Submitting...' : 'Submit Payment Reference'}</button>
                      </div>
                    )}
                    {request.status === 'payment_submitted' && <p className="text-xs text-emerald-400">Payment reference submitted. Waiting for verification.</p>}
                    {request.status === 'active' && <p className="text-xs text-emerald-400">Your advertisement is live until {formatDate(request.active_until)}.</p>}
                    {request.status === 'rejected' && <p className="text-xs text-red-400">This request was not approved. Contact support for details.</p>}
                  </div>
                ))}
              </div>
            </div>
              </div>

              <div className="p-4 bg-[#F4A6C1]/10 border border-[#F4A6C1]/20 text-[#F4A6C1] text-xs rounded-xl flex items-start space-x-2">
                <Info className="w-4 h-4 shrink-0 mt-0.5" />
                <span>
                  Payments are confirmed by FaucetPay's server-side verification before a plan is activated. Orders expire after 30 minutes. Daily claim limits reset at 00:00 UTC.
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

                  <TurnstileWidget
                    action="withdraw"
                    onToken={token => setSecurityToken('withdraw', token)}
                    resetKey={securityResets.withdraw}
                  />
                  <button
                    type="submit"
                    disabled={isWithdrawing || !apiReady || !securityTokens.withdraw}
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

          {activeTab === 'profile' && (
            <div className="bg-black border border-slate-800 rounded-2xl p-6 md:p-8 space-y-6">
              <div>
                <h2 className="text-xl font-black text-white mb-1 font-['Space_Grotesk',sans-serif]">My Profile</h2>
                <p className="text-sm text-slate-400">View your account details and update your username.</p>
              </div>
              {profileError && <div className="p-3 bg-red-500/10 border border-red-500/20 text-red-400 rounded-xl text-sm">{profileError}</div>}
              {profileLoading ? (
                <p className="text-sm text-slate-400">Loading profile...</p>
              ) : (
                <>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <StatTile label="User ID" value={firebaseUser?.uid || '...'} />
                    <StatTile label="Email" value={firebaseUser?.email || '...'} />
                    <StatTile label="Email Verification" value={firebaseUser?.emailVerified ? 'Verified' : 'Not verified'} valueCls={firebaseUser?.emailVerified ? 'text-emerald-400' : 'text-red-400'} />
                    <StatTile label="Account Plan" value={planName || 'FREE'} />
                    <StatTile label="Referral Code" value={refCode || '...'} valueCls="text-[#F4A6C1]" />
                    <StatTile label="Member Since" value={formatDate(userProfile?.created_at || userProfile?.createdAt)} />
                  </div>
                  {!firebaseUser?.emailVerified && (
                    <div className="p-4 border border-red-500/30 bg-red-500/5 rounded-xl space-y-3">
                      <p className="text-sm text-red-300 font-bold">Email verification required</p>
                      <p className="text-xs text-slate-400">Verify your email to unlock account benefits and protected actions.</p>
                      <button type="button" onClick={handleResendVerification} disabled={verificationSending || verificationResendSeconds > 0} className="px-4 py-2 rounded-lg bg-[#F4A6C1] text-black text-xs font-black disabled:opacity-50">
                        {verificationSending ? 'Sending...' : verificationResendSeconds > 0 ? `Resend in ${verificationResendSeconds}s` : 'Resend verification email'}
                      </button>
                      {verifyMsg && <p className="text-xs text-slate-300">{verifyMsg}</p>}
                    </div>
                  )}
                  <form onSubmit={handleSaveProfile} className="bg-black border border-slate-800 rounded-xl p-5 space-y-3">
                    <label className={LABEL_CLS} htmlFor="profile-username">Username</label>
                    <input id="profile-username" className={INPUT_CLS} value={profileUsernameInput} onChange={e => setProfileUsernameInput(e.target.value)} minLength={3} maxLength={20} autoComplete="username" />
                    <p className="text-xs text-slate-500">3–20 characters. Letters, numbers, and underscore only.</p>
                    <button type="submit" disabled={profileSaving || !apiReady || !firebaseUser?.emailVerified} className={PRIMARY_BTN}>
                      {profileSaving ? 'Saving...' : 'Save Username'}
                    </button>
                  </form>
                </>
              )}
            </div>
          )}

          {activeTab === 'referrals' && (
            <div className="bg-black border border-slate-800 rounded-2xl p-6 md:p-8 space-y-6">
              <div>
                <h2 className="text-xl font-black text-white mb-1 font-['Space_Grotesk',sans-serif]">
                  Referral Program
                </h2>
                <p className="text-sm text-slate-400">
                  Earn a 15% DOGE commission when verified referrals complete Faucet claims. Commissions are paid only while the separately funded referral reserve is active.
                </p>
              </div>

              {referralError && (
                <div className="p-3 bg-red-500/10 border border-red-500/20 text-red-400 rounded-xl text-sm flex items-start gap-2">
                  <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                  <span>{referralError}</span>
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
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
                    Commission Rate
                  </span>
                  <div className="text-2xl font-black font-mono text-[#F4A6C1] mt-1">
                    {referralStats ? `${(referralStats.commissionRateBps / 100).toFixed(0)}%` : '...'}
                  </div>
                  <p className={`text-xs mt-1 ${referralStats?.commissionEnabled ? "text-emerald-400" : "text-slate-500"}`}>
                    {referralStats ? (referralStats.commissionEnabled ? "Active" : "Paused — reserve not funded") : "Loading status"}
                  </p>
                </div>

                <div className="bg-black border border-slate-800 rounded-2xl p-5">
                  <span className="text-xs uppercase tracking-wider text-slate-500 font-mono font-bold">
                    Total Earned
                  </span>
                  <div className="text-2xl font-black font-mono text-white mt-1">
                    {referralStats ? `${formatDoge(referralStats.commissionEarnedKoinu)} DOGE` : "..."}
                  </div>
                </div>
              </div>

              <div className="bg-black border border-slate-800 rounded-2xl p-5 space-y-3">
                <label className="text-xs uppercase tracking-wider text-slate-500 font-mono font-bold">
                  Your Referral Link
                </label>
                <div className="flex flex-col sm:flex-row gap-2">
                  <input
                    type="text"
                    readOnly
                    value={refCode ? `${window.location.origin}/?ref=${encodeURIComponent(refCode)}` : ''}
                    placeholder="Referral link will appear here"
                    className={`${INPUT_CLS} font-mono text-xs`}
                  />
                  <button
                    type="button"
                    onClick={handleCopyReferralLink}
                    disabled={!REF_CODE_REGEX.test(refCode)}
                    className="px-5 py-3 rounded-xl bg-[#F4A6C1] hover:bg-[#e091ad] disabled:opacity-50 disabled:cursor-not-allowed text-black text-xs font-black whitespace-nowrap"
                  >
                    Copy Link
                  </button>
                </div>
                {referralCopyMessage && (
                  <p role="status" className="text-xs text-slate-400">{referralCopyMessage}</p>
                )}
              </div>

              <div className="bg-black border border-slate-800 rounded-2xl p-5 space-y-3">
                <h3 className="text-sm font-black uppercase tracking-wider text-slate-300 font-['Space_Grotesk',sans-serif]">
                  Recent Commissions
                </h3>
                {!referralStats?.recentCommissions?.length ? (
                  <p className="text-sm text-slate-500">No referral commissions yet.</p>
                ) : (
                  <div className="space-y-2">
                    {referralStats.recentCommissions.map((commission) => (
                      <div key={commission.id} className="flex items-center justify-between gap-3 border-b border-slate-800 pb-2 last:border-0">
                        <div className="min-w-0">
                          <p className="text-sm text-white truncate">{commission.referred_username}</p>
                          <p className="text-xs text-slate-500">{formatDate(commission.created_at)}</p>
                        </div>
                        <span className="text-sm font-mono font-bold text-[#F4A6C1] whitespace-nowrap">+{formatDoge(commission.amount_koinu)} DOGE</span>
                      </div>
                    ))}
                  </div>
                )}
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
                    Only users who verify their email count as invited users.
                  </li>
                  <li>
                    You earn 15% of each verified referral’s successful Faucet claim.
                  </li>
                  <li>
                    Commissions are credited to your DOGE balance only when the separate referral reserve is funded and active. They never use funds reserved for other users.
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
                  Manage withdrawals, advertising requests, and daily platform statistics.
                </p>
              </div>

              

              <section className="border border-slate-800 rounded-2xl p-4 md:p-5 space-y-4">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <h3 className="text-sm font-black uppercase tracking-wider text-slate-300">Advertising Requests</h3>
                    <p className="text-xs text-slate-500 mt-1">Review campaigns, set a EUR quote, and activate only after payment verification.</p>
                  </div>
                  <button type="button" onClick={refreshAdminAds} disabled={adActionLoading !== null} className="px-3 py-2 rounded-lg border border-[#F4A6C1]/30 text-[#F4A6C1] text-xs font-bold">Refresh</button>
                </div>
                {adminAdRequests.length === 0 ? (
                  <p className="text-sm text-slate-500">No advertising requests yet.</p>
                ) : adminAdRequests.map(request => (
                  <div key={request.id} className="border border-slate-800 rounded-xl p-4 space-y-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <strong className="text-white">{request.business_name}</strong>
                      <span className="text-[10px] uppercase font-black text-[#F4A6C1]">{String(request.status).replaceAll('_', ' ')}</span>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-xs text-slate-400">
                      <span>Contact: {request.contact_email}</span>
                      <span>Account: {request.account_email}</span>
                      <span>Placement: {request.placement}</span>
                      <span>Duration: {request.duration_days === 30 ? '30 days + 5 bonus (35 total)' : request.duration_days + ' days'}</span>
                      <span>Submitted: {formatDate(request.created_at)}</span>
                      <span>Quote: {request.quoted_price_eur ? `€${Number(request.quoted_price_eur).toFixed(2)}` : 'Not set'}</span>
                    </div>
                    <a href={request.website_url} target="_blank" rel="noopener noreferrer" className="block text-xs text-[#F4A6C1] break-all">{request.website_url}</a>
                    <a href={request.banner_image_url} target="_blank" rel="noopener noreferrer" className="block text-xs text-slate-500 break-all">View banner image</a>
                    {request.notes && <p className="text-xs text-slate-400">{request.notes}</p>}
                    {request.payment_reference && <p className="text-xs text-emerald-400 break-all">Payment reference: {request.payment_reference}</p>}
                    {request.status === 'pending_review' && (
                      <div className="flex flex-col sm:flex-row gap-2">
                        <input type="number" min="0.01" max="100000" step="0.01" value={adQuoteInputs[request.id] || ''} onChange={e => setAdQuoteInputs(prev => ({ ...prev, [request.id]: e.target.value }))} className={INPUT_CLS} placeholder="Set quote in EUR" />
                        <button type="button" disabled={adActionLoading !== null} onClick={() => handleAdminAdStatus(request, 'awaiting_payment')} className="px-4 py-3 rounded-xl bg-[#F4A6C1] text-black text-xs font-black disabled:opacity-50">Send Quote</button>
                        <button type="button" disabled={adActionLoading !== null} onClick={() => handleAdminAdStatus(request, 'rejected')} className="px-4 py-3 rounded-xl border border-red-500/30 text-red-400 text-xs font-black disabled:opacity-50">Reject</button>
                      </div>
                    )}
                    {request.status === 'awaiting_payment' && (
                      <button type="button" disabled={adActionLoading !== null} onClick={() => handleAdminAdStatus(request, 'rejected')} className="px-4 py-2 rounded-lg border border-red-500/30 text-red-400 text-xs font-bold">Reject Request</button>
                    )}
                    {request.status === 'payment_submitted' && (
                      <button type="button" disabled={adActionLoading !== null} onClick={() => handleAdminAdStatus(request, 'active')} className="px-4 py-2 rounded-lg bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-xs font-black">Verify Payment & Activate</button>
                    )}
                  </div>
                ))}
              </section>

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

                <div className="bg-black border border-slate-800 rounded-2xl p-4 space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <h3 className="text-xs font-black uppercase tracking-wider text-slate-300">Financial integrity audit</h3>
                      <p className="text-[11px] text-slate-500 mt-1">Read-only checks of user liabilities, ledger consistency, withdrawals and internal reserves.</p>
                    </div>
                    <button
                      type="button"
                      disabled={financeAuditLoading || !apiReady}
                      onClick={refreshFinanceAudit}
                      className={`px-3 py-2 rounded-lg border text-xs font-bold disabled:opacity-50 ${adminActionBtn}`}
                    >
                      {financeAuditLoading ? 'Auditing...' : 'Run financial audit'}
                    </button>
                  </div>

                  {financeAuditError && <p className="text-xs text-red-300">{financeAuditError}</p>}

                  {financeAudit && (
                    <>
                      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                        <StatTile label="User Balances Owed" value={`${formatDoge(financeAudit.liabilities.user_balances_koinu)} DOGE`} sub={`${financeAudit.liabilities.users_count} accounts`} />
                        <StatTile label="Outstanding Withdrawals" value={`${formatDoge(financeAudit.liabilities.outstanding_withdrawals_koinu)} DOGE`} sub="Pending, processing or unknown" />
                        <StatTile label="Unledgered Accounts" value={financeAudit.ledger.users_with_balance_without_ledger} sub={`${formatDoge(financeAudit.ledger.unledgered_balance_koinu)} DOGE without ledger entries`} valueCls={financeAudit.ledger.users_with_balance_without_ledger > 0 ? 'text-red-400' : 'text-emerald-400'} />
                        <StatTile label="Current Claims Missing Ledger" value={financeAudit.ledger.claims_without_ledger_count} sub={`${formatDoge(financeAudit.ledger.claims_without_ledger_koinu)} DOGE not journaled`} valueCls={financeAudit.ledger.claims_without_ledger_count > 0 ? 'text-red-400' : 'text-emerald-400'} />
                        <StatTile label="Legacy Claims Without Ledger" value={financeAudit.ledger.legacy_claims_without_ledger_count} sub={`${formatDoge(financeAudit.ledger.legacy_claims_without_ledger_koinu)} DOGE · older records without request IDs`} valueCls={financeAudit.ledger.legacy_claims_without_ledger_count > 0 ? 'text-yellow-300' : 'text-emerald-400'} />
                        <StatTile label="Referral Commissions Missing Ledger" value={financeAudit.ledger.referral_commissions_without_ledger_count} sub={`${formatDoge(financeAudit.ledger.referral_commissions_without_ledger_koinu)} DOGE not journaled`} valueCls={financeAudit.ledger.referral_commissions_without_ledger_count > 0 ? 'text-red-400' : 'text-emerald-400'} />
                        <StatTile label="Referral Ledger Without Commission" value={financeAudit.ledger.referral_ledger_without_commission_count} sub={`${formatDoge(financeAudit.ledger.referral_ledger_without_commission_koinu)} DOGE unmatched`} valueCls={financeAudit.ledger.referral_ledger_without_commission_count > 0 ? 'text-red-400' : 'text-emerald-400'} />
                        <StatTile label="Wheel Prizes Missing Ledger" value={financeAudit.ledger.wheel_prizes_without_ledger_count} sub={`${formatDoge(financeAudit.ledger.wheel_prizes_without_ledger_koinu)} DOGE not journaled`} valueCls={financeAudit.ledger.wheel_prizes_without_ledger_count > 0 ? 'text-red-400' : 'text-emerald-400'} />
                        <StatTile label="Wheel Purchases Missing Ledger" value={financeAudit.ledger.wheel_purchases_without_ledger_count} sub={`${formatDoge(financeAudit.ledger.wheel_purchases_without_ledger_koinu)} DOGE not journaled`} valueCls={financeAudit.ledger.wheel_purchases_without_ledger_count > 0 ? 'text-red-400' : 'text-emerald-400'} />
                        <StatTile label="Wheel Ledger Without Source" value={financeAudit.ledger.wheel_ledger_without_source_count} sub={`${formatDoge(financeAudit.ledger.wheel_ledger_without_source_koinu)} DOGE unmatched`} valueCls={financeAudit.ledger.wheel_ledger_without_source_count > 0 ? 'text-red-400' : 'text-emerald-400'} />
                        <StatTile label="Daily Streaks Missing Ledger" value={financeAudit.ledger.daily_streaks_without_ledger_count} sub={`${formatDoge(financeAudit.ledger.daily_streaks_without_ledger_koinu)} DOGE not journaled`} valueCls={financeAudit.ledger.daily_streaks_without_ledger_count > 0 ? 'text-red-400' : 'text-emerald-400'} />
                        <StatTile label="Balance Mismatches" value={financeAudit.ledger.user_balance_mismatches} sub="Latest ledger balance vs account balance" valueCls={financeAudit.ledger.user_balance_mismatches > 0 ? 'text-red-400' : 'text-emerald-400'} />
                        <StatTile label="Ledger Arithmetic Errors" value={financeAudit.ledger.arithmetic_mismatches} sub={`${financeAudit.ledger.transactions_count} ledger rows checked`} valueCls={financeAudit.ledger.arithmetic_mismatches > 0 ? 'text-red-400' : 'text-emerald-400'} />
                        <StatTile label="Legacy Approved" value={financeAudit.withdrawals.legacy_approved_without_payout_id_count} sub={`${formatDoge(financeAudit.withdrawals.legacy_approved_without_payout_id_koinu)} DOGE without FaucetPay ID`} valueCls={financeAudit.withdrawals.legacy_approved_without_payout_id_count > 0 ? 'text-yellow-300' : 'text-emerald-400'} />
                        <StatTile label="Paid Without Payout ID" value={financeAudit.withdrawals.paid_without_payout_id_count} sub={`${formatDoge(financeAudit.withdrawals.paid_without_payout_id_koinu)} DOGE · must be reconciled`} valueCls={financeAudit.withdrawals.paid_without_payout_id_count > 0 ? 'text-red-400' : 'text-emerald-400'} />
                        <StatTile label="Stuck Processing" value={financeAudit.withdrawals.stale_processing_count} sub={`${formatDoge(financeAudit.withdrawals.stale_processing_koinu)} DOGE · over 15 minutes`} valueCls={financeAudit.withdrawals.stale_processing_count > 0 ? 'text-yellow-300' : 'text-emerald-400'} />
                        <StatTile label="Payment Unknown" value={financeAudit.withdrawals.payment_unknown_count} sub={`${formatDoge(financeAudit.withdrawals.payment_unknown_koinu)} DOGE · check FaucetPay`} valueCls={financeAudit.withdrawals.payment_unknown_count > 0 ? 'text-red-400' : 'text-emerald-400'} />
                        <StatTile label="Duplicate Payout IDs" value={financeAudit.withdrawals.duplicate_payout_id_groups} sub="Must always remain zero" valueCls={financeAudit.withdrawals.duplicate_payout_id_groups > 0 ? 'text-red-400' : 'text-emerald-400'} />
                      </div>
                      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                        <StatTile label="PTC Pending Rewards" value={`${formatDoge(financeAudit.ptc_rewards.pending_unsettled_koinu)} DOGE`} sub={`${financeAudit.ptc_rewards.pending_unsettled_views} views awaiting settlement`} />
                        <StatTile label="PTC Reserve Match" value={financeAudit.ptc_rewards.pending_reserve_matches_views ? 'MATCH' : 'MISMATCH'} sub={`${formatDoge(financeAudit.ptc_rewards.reserve_pending_koinu)} DOGE pending reserve`} valueCls={financeAudit.ptc_rewards.pending_reserve_matches_views ? 'text-emerald-400' : 'text-red-400'} />
                        <StatTile label="PTC Settled Views" value={financeAudit.ptc_rewards.settled_views} sub="Credited to user balances" />
                        <StatTile label="PTC Settlements Missing Ledger" value={financeAudit.ptc_rewards.settlements_without_ledger_count} sub={`${formatDoge(financeAudit.ptc_rewards.settlements_without_ledger_koinu)} DOGE unmatched`} valueCls={financeAudit.ptc_rewards.settlements_without_ledger_count > 0 ? 'text-red-400' : 'text-emerald-400'} />
                        <StatTile label="PTC Settlement Mismatches" value={financeAudit.ptc_rewards.settlement_item_mismatches} sub={`${formatDoge(financeAudit.ptc_rewards.settlement_item_mismatch_koinu)} DOGE inconsistent`} valueCls={financeAudit.ptc_rewards.settlement_item_mismatches > 0 ? 'text-red-400' : 'text-emerald-400'} />
                      </div>
                      <div className="rounded-xl border border-yellow-500/20 bg-yellow-500/5 p-3 space-y-1">
                        <p className="text-xs font-bold text-yellow-300">External reserve funding: NOT VERIFIED</p>
                        <p className="text-[11px] text-slate-400">D1 contains internal reserve figures only. It does not contain wallet-deposit proof or a reserve funding history, so these numbers cannot confirm real DOGE backing.</p>
                        <p className="text-[11px] text-slate-400">Faucet reserve: {formatDoge(financeAudit.reserves.faucet_available_koinu)} DOGE · Wheel reserve: {formatDoge(financeAudit.reserves.wheel_available_koinu)} DOGE · Wheel locked: {formatDoge(financeAudit.reserves.wheel_locked_koinu)} DOGE · Referral reserve: {formatDoge(financeAudit.reserves.referral_available_koinu)} DOGE</p>
                        <p className={`text-[11px] ${financeAudit.reserves.paid_spin_reserve_backed ? 'text-emerald-400' : 'text-red-400'}`}>Paid spins reserve: {financeAudit.reserves.paid_spins_outstanding} spins · {formatDoge(financeAudit.reserves.wheel_locked_koinu)} DOGE locked / {formatDoge(financeAudit.reserves.paid_spin_reserve_required_koinu)} DOGE required · {financeAudit.reserves.paid_spin_reserve_backed ? 'BACKED INTERNALLY' : 'UNDERFUNDED'}</p>
                      </div>
                      <div className="rounded-xl border border-white/10 bg-black/40 p-3 space-y-1">
                        <p className="text-xs font-bold text-white">FaucetPay balance coverage snapshot</p>
                        {faucetPayCoverageDifferenceDoge === null ? (
                          <p className="text-[11px] text-slate-400">Run the financial audit and check FaucetPay balance to compare actual provider balance with recorded liabilities and earmarked reserves.</p>
                        ) : (
                          <>
                            <p className="text-[11px] text-slate-400">FaucetPay balance: {faucetPayBalance.toFixed(8)} DOGE · Recorded liabilities and earmarked reserves: {formatDoge(internalBackingRequiredKoinu)} DOGE</p>
                            <p className={`text-[11px] font-bold ${faucetPayCoverageDifferenceDoge >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>{faucetPayCoverageDifferenceDoge >= 0 ? 'Above recorded reserves by' : 'Below recorded reserves by'} {Math.abs(faucetPayCoverageDifferenceDoge).toFixed(8)} DOGE</p>
                          </>
                        )}
                        <p className="text-[10px] text-slate-500">This is a snapshot comparison, not profit and not proof of funds held in any other wallet.</p>
                      </div>
                    </>
                  )}
                </div>

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
                    label="Active Users Today"
                    value={
                      adminStats
                        ? Number(adminStats.active_users_today || 0)
                        : (adminStatsLoading ? '...' : 'N/A')
                    }
                    sub="Verified users with an app session today"
                    valueCls={adminAccentText}
                  />
                  <StatTile
                    label="Currently Online"
                    value={
                      adminStats
                        ? Number(adminStats.currently_online || 0)
                        : (adminStatsLoading ? '...' : 'N/A')
                    }
                    sub="Verified users active in the last 5 minutes"
                    valueCls={adminAccentText}
                  />
                  <StatTile
                    label="App Sessions Today"
                    value={
                      adminStats
                        ? Number(adminStats.login_sessions_today || 0)
                        : (adminStatsLoading ? '...' : 'N/A')
                    }
                    sub="Verified account syncs today"
                    valueCls={adminAccentText}
                  />
                  <StatTile
                    label="Wheel Purchases (Internal)"
                    value={
                      adminStats
                        ? `${formatDoge(adminStats.wheel_purchase_volume_koinu)} DOGE`
                        : (adminStatsLoading ? '...' : 'N/A')
                    }
                    sub={
                      adminStats?.breakdown
                        ? `${adminStats.breakdown.wheel_purchases_count} purchases · internal DOGE transfer, not external revenue`
                        : undefined
                    }
                    valueCls="text-emerald-400"
                  />
                  <StatTile
                    label="Rewards Credited Today"
                    value={
                      adminStats
                        ? `${formatDoge(adminStats.rewards_credited_koinu)} DOGE`
                        : (adminStatsLoading ? '...' : 'N/A')
                    }
                    sub={
                      adminStats?.breakdown
                        ? `Claims ${formatDoge(adminStats.breakdown.claims_koinu)} · Wheel ${formatDoge(adminStats.breakdown.wheel_prizes_koinu)} · Check-in ${formatDoge(adminStats.breakdown.streak_koinu)} · Referrals ${formatDoge(adminStats.breakdown.referral_commissions_koinu || 0)}`
                        : undefined
                    }
                    valueCls="text-red-400"
                  />
                  <StatTile
                    label="Profit Today"
                    value={
                      adminStats && adminStats.profit_koinu != null
                        ? `${Number(adminStats.profit_koinu) > 0 ? '+' : ''}${formatDoge(adminStats.profit_koinu)} DOGE`
                        : (adminStatsLoading ? '...' : 'N/A')
                    }
                    sub="Unavailable until external DOGE revenue and expenses are verified"
                    valueCls={adminAccentText}
                  />
                  <StatTile
                    label="Ad Campaign Value Today (Unverified)"
                    value={
                      adminStats
                        ? `€${Number(adminStats.ad_campaign_value_eur || 0).toFixed(2)}`
                        : (adminStatsLoading ? '...' : 'N/A')
                    }
                    sub={
                      adminStats
                        ? `${Number(adminStats.ad_campaigns_activated_today || 0)} campaigns activated after manual review; receipts not independently verified`
                        : undefined
                    }
                    valueCls={adminAccentText}
                  />

                  <StatTile
                    label="Verified Premium + VIP Revenue Today"
                    value={
                      adminStats
                        ? `€${(Number(adminStats.verified_subscription_revenue_eur_cents || 0) / 100).toFixed(2)}`
                        : (adminStatsLoading ? '...' : 'N/A')
                    }
                    sub={
                      adminStats
                        ? `${Number(adminStats.verified_subscription_orders_today || 0)} FaucetPay-verified payments · Premium €${(Number(adminStats.subscription_revenue_breakdown_eur_cents?.premium || 0) / 100).toFixed(2)} · VIP €${(Number(adminStats.subscription_revenue_breakdown_eur_cents?.vip || 0) / 100).toFixed(2)}`
                        : 'Only provider-verified paid orders are counted'
                    }
                    valueCls="text-emerald-400"
                  />
                  <StatTile
                    label="PTC Advertiser Funding Today"
                    value={adminStats ? `${formatDoge(adminStats.ptc_advertiser_funding_today_koinu || 0)} DOGE` : (adminStatsLoading ? '...' : 'N/A')}
                    sub={adminStats ? `${Number(adminStats.ptc_advertiser_funding_today_count || 0)} admin-verified funding records; gross funding, not profit` : 'External transaction references checked manually'}
                    valueCls={adminAccentText}
                  />
                  <StatTile
                    label="PTC Reserve / Pending Rewards"
                    value={adminStats?.ptc_reserve ? `${formatDoge(adminStats.ptc_reserve.available_koinu)} DOGE` : (adminStatsLoading ? '...' : 'N/A')}
                    sub={adminStats?.ptc_reserve ? `Available · ${formatDoge(adminStats.ptc_reserve.locked_koinu)} locked · ${formatDoge(adminStats.ptc_reserve.pending_koinu)} pending rewards` : 'Dedicated advertiser-funded reserve'}
                    valueCls="text-yellow-300"
                  />
                </div>


                <section className="rounded-2xl border border-white/10 bg-black/40 p-4 space-y-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <h3 className="text-sm font-black uppercase tracking-wider text-white font-['Space_Grotesk',sans-serif]">Operating Expenses</h3>
                      <p className="mt-1 text-xs text-slate-400">Only expenses with a receipt/reference verified by an admin are included in the daily report.</p>
                    </div>
                    <button type="button" onClick={refreshAdminExpenses} disabled={adminExpensesLoading} className="rounded-lg border border-white/15 px-3 py-2 text-xs font-bold text-white disabled:opacity-50">Refresh</button>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <StatTile label="Verified Expenses Today" value={adminStats?.expense_tracking_available === false ? 'Migration required' : adminStats ? `€${(Number(adminStats.verified_operating_expenses_eur_cents || 0) / 100).toFixed(2)}` : (adminStatsLoading ? '...' : 'N/A')} sub={adminStats?.expense_tracking_available === false ? 'Apply migration 0008_operating_expenses.sql' : `${Number(adminStats?.verified_operating_expenses_count || 0)} verified records`} valueCls="text-red-300" />
                    <StatTile label="Premium/VIP After Expenses" value={adminStats?.verified_subscription_net_after_expenses_eur_cents == null ? 'N/A' : `€${(Number(adminStats.verified_subscription_net_after_expenses_eur_cents) / 100).toFixed(2)}`} sub="Partial net only; excludes unverified ad income and other costs" valueCls={adminAccentText} />
                  </div>
                  <form onSubmit={handleAdminExpenseCreate} className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <select value={adminExpenseForm.category} onChange={event => setAdminExpenseForm(current => ({ ...current, category: event.target.value }))} className="rounded-lg border border-white/15 bg-black px-3 py-3 text-sm text-white">
                      <option value="hosting">Hosting</option><option value="infrastructure">Infrastructure</option><option value="advertising">Advertising</option><option value="payment_fees">Payment fees</option><option value="software">Software</option><option value="other">Other</option>
                    </select>
                    <input type="date" value={adminExpenseForm.expense_date} onChange={event => setAdminExpenseForm(current => ({ ...current, expense_date: event.target.value }))} required className="rounded-lg border border-white/15 bg-black px-3 py-3 text-sm text-white" />
                    <input value={adminExpenseForm.description} onChange={event => setAdminExpenseForm(current => ({ ...current, description: event.target.value }))} minLength={3} maxLength={240} required placeholder="Expense description" className="rounded-lg border border-white/15 bg-black px-3 py-3 text-sm text-white sm:col-span-2" />
                    <input type="number" inputMode="decimal" min="0.01" step="0.01" value={adminExpenseForm.amount_eur} onChange={event => setAdminExpenseForm(current => ({ ...current, amount_eur: event.target.value }))} required placeholder="Amount in EUR" className="rounded-lg border border-white/15 bg-black px-3 py-3 text-sm text-white" />
                    <button type="submit" disabled={adminExpenseSaving} className="rounded-lg bg-[#F4A6C1] px-4 py-3 text-sm font-black text-black disabled:opacity-50">{adminExpenseSaving ? 'Saving…' : 'Add unverified expense'}</button>
                  </form>
                  {adminExpensesError && <p role="alert" className="text-xs text-red-300">{adminExpensesError}</p>}
                  <div className="space-y-3">
                    {adminExpensesLoading ? <p className="text-xs text-slate-400">Loading expenses…</p> : adminExpenses.length === 0 ? <p className="text-xs text-slate-500">No expense records yet.</p> : adminExpenses.map(expense => (
                      <div key={expense.id} className="rounded-xl border border-white/10 p-3 space-y-2">
                        <div className="flex flex-wrap items-start justify-between gap-2">
                          <div><p className="text-sm font-bold text-white">{expense.description}</p><p className="text-xs text-slate-400">{expense.category.replaceAll('_', ' ')} · {expense.expense_date}</p></div>
                          <div className="text-right"><p className="text-sm font-black text-white">€{(Number(expense.amount_cents) / 100).toFixed(2)}</p><p className={expense.verification_status === 'verified' ? 'text-xs text-emerald-300' : 'text-xs text-yellow-300'}>{expense.verification_status}</p></div>
                        </div>
                        {expense.verification_status !== 'verified' && <div className="flex flex-col sm:flex-row gap-2">
                          <input value={adminExpenseEvidence[expense.id] || ''} onChange={event => setAdminExpenseEvidence(current => ({ ...current, [expense.id]: event.target.value }))} maxLength={240} placeholder="Receipt / transaction reference" className="min-w-0 flex-1 rounded-lg border border-white/15 bg-black px-3 py-2 text-xs text-white" />
                          <button type="button" onClick={() => handleAdminExpenseVerify(expense.id)} disabled={adminExpenseVerifying === expense.id} className="rounded-lg border border-[#F4A6C1]/60 px-3 py-2 text-xs font-bold text-[#F4A6C1] disabled:opacity-50">{adminExpenseVerifying === expense.id ? 'Verifying…' : 'Verify expense'}</button>
                        </div>}
                      </div>
                    ))}
                  </div>
                </section>

                <section className="rounded-2xl border border-white/10 bg-black/40 p-4 space-y-4">
                  <div>
                    <h3 className="text-sm font-black uppercase tracking-wider text-white font-['Space_Grotesk',sans-serif]">Historical Financial Report</h3>
                    <p className="mt-1 text-xs text-slate-400">UTC date range · up to 366 days · only verified records are counted</p>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <label className="text-xs text-slate-400">From
                      <input type="date" value={financeReportRange.start} max={financeReportRange.end} onChange={event => setFinanceReportRange(current => ({ ...current, start: event.target.value }))} className="mt-1 w-full rounded-lg border border-white/15 bg-black px-3 py-3 text-sm text-white" />
                    </label>
                    <label className="text-xs text-slate-400">To
                      <input type="date" value={financeReportRange.end} min={financeReportRange.start} onChange={event => setFinanceReportRange(current => ({ ...current, end: event.target.value }))} className="mt-1 w-full rounded-lg border border-white/15 bg-black px-3 py-3 text-sm text-white" />
                    </label>
                    <button type="button" onClick={refreshFinancialReport} disabled={financeReportLoading} className="self-end rounded-lg bg-[#F4A6C1] px-4 py-3 text-sm font-black text-black disabled:opacity-50">{financeReportLoading ? 'Loading…' : 'Generate report'}</button>
                  </div>
                  {financeReportError && <p role="alert" className="text-xs text-red-300">{financeReportError}</p>}
                  {financeReport && <div className="space-y-3">
                    <p className="text-xs text-slate-400">Report: {financeReport.period.start} — {financeReport.period.end} ({financeReport.period.days} days)</p>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                      <StatTile label="Verified Premium + VIP" value={`€${(Number(financeReport.verified_subscription_revenue.total_eur_cents) / 100).toFixed(2)}`} sub={`${financeReport.verified_subscription_revenue.orders_count} provider-verified orders`} valueCls="text-emerald-400" />
                      <StatTile label="Verified Expenses" value={`€${(Number(financeReport.verified_operating_expenses.total_eur_cents) / 100).toFixed(2)}`} sub={`${financeReport.verified_operating_expenses.count} verified records`} valueCls="text-red-300" />
                      <StatTile label="Partial Net" value={`€${(Number(financeReport.partial_subscription_net_eur_cents) / 100).toFixed(2)}`} sub="Subscriptions minus verified expenses only" valueCls={adminAccentText} />
                      <StatTile label="PTC Gross Funding" value={`${formatDoge(financeReport.ptc_advertiser_funding.total_koinu)} DOGE`} sub="Advertiser funding, not profit" valueCls="text-yellow-300" />
                    </div>
                    <div className="rounded-xl border border-yellow-500/20 bg-yellow-500/5 p-3 space-y-1">
                      <p className="text-xs font-bold text-yellow-200">Profit is not calculated</p>
                      <p className="text-xs text-slate-400">{financeReport.partial_net_warning}</p>
                      <p className="text-xs text-slate-400">Current user balances: {formatDoge(financeReport.current_liabilities_snapshot.user_balances_koinu)} DOGE · Pending withdrawals: {formatDoge(financeReport.current_liabilities_snapshot.pending_withdrawals_koinu)} DOGE</p>
                      <p className="text-xs text-slate-400">PTC reserve: {formatDoge(financeReport.current_liabilities_snapshot.ptc_reserve_available_koinu)} available · {formatDoge(financeReport.current_liabilities_snapshot.ptc_reserve_locked_koinu)} locked · {formatDoge(financeReport.current_liabilities_snapshot.ptc_reserve_pending_koinu)} pending</p>
                    </div>
                  </div>}
                </section>

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

              <div className="bg-black border border-slate-800 rounded-2xl p-4 space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <h3 className="text-xs font-black uppercase tracking-wider text-slate-300">FaucetPay connection</h3>
                    <p className="text-[11px] text-slate-500 mt-1">Read-only configuration and DOGE balance check. This does not send a payout.</p>
                  </div>
                  <button
                    type="button"
                    disabled={faucetPayCheckLoading || !apiReady}
                    onClick={handleFaucetPayCheck}
                    className={`px-3 py-2 rounded-lg border text-xs font-bold disabled:opacity-50 ${adminActionBtn}`}
                  >
                    {faucetPayCheckLoading ? 'Checking...' : 'Check FaucetPay'}
                  </button>
                </div>
                {faucetPayStatus && (
                  <div className="flex flex-wrap gap-x-5 gap-y-2 text-xs">
                    <span className={faucetPayStatus.configured ? 'text-emerald-400' : 'text-red-400'}>
                      API key: {faucetPayStatus.configured ? 'Configured' : 'Missing'}
                    </span>
                    <span className={faucetPayStatus.payouts_enabled ? 'text-emerald-400' : 'text-yellow-400'}>
                      Automatic payouts: {faucetPayStatus.payouts_enabled ? 'Enabled' : 'Disabled'}
                    </span>
                    {faucetPayBalance !== null && Number.isFinite(faucetPayBalance) && (
                      <span className="text-white font-bold">FaucetPay DOGE: {faucetPayBalance.toFixed(8)}</span>
                    )}
                  </div>
                )}
                {faucetPayCheckError && <p className="text-xs text-red-300">{faucetPayCheckError}</p>}
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
                              <div className="flex flex-col items-start gap-1">
                                <span className={`px-2 py-1 rounded-md text-[10px] uppercase font-black ${
                                  w.status === 'paid'
                                    ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                                    : w.status === 'rejected'
                                      ? 'bg-red-500/10 text-red-400 border border-red-500/20'
                                      : w.status === 'payment_unknown'
                                        ? 'bg-red-500/10 text-red-300 border border-red-500/30'
                                        : 'bg-yellow-500/10 text-yellow-400 border border-yellow-500/20'
                                }`}>
                                  {w.status === 'approved' ? 'legacy-approved' : w.status}
                                </span>
                                {w.faucetpayPayoutId && (
                                  <span className="text-[10px] text-slate-500 break-all">
                                    FaucetPay ID: {w.faucetpayPayoutId}
                                  </span>
                                )}
                                {w.payoutError && (
                                  <span className="text-[10px] text-red-300 max-w-[220px]">
                                    {w.payoutError}
                                  </span>
                                )}
                              </div>
                            </td>

                            <td className="p-4">
                              {w.status === 'pending' ? (
                                <div className="flex flex-wrap gap-2">
                                  {faucetPayStatus?.configured && faucetPayStatus?.payouts_enabled ? (
                                    <button
                                      type="button"
                                      disabled={adminActionLoading !== null}
                                      onClick={() => handleAdminApprove(w.id)}
                                      className={`px-3 py-1 rounded-lg font-black transition-colors disabled:opacity-40 ${adminActionBtn}`}
                                    >
                                      {adminActionLoading === w.id ? '...' : 'Pay DOGE'}
                                    </button>
                                  ) : (
                                    <span className="px-2 py-1 text-[10px] font-bold text-yellow-300 border border-yellow-500/20 rounded-lg">
                                      Payouts disabled
                                    </span>
                                  )}

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
                                w.status === 'payment_unknown' ||
                                (w.status === 'approved' && !w.faucetpayPayoutId) ||
                                (w.status === 'paid' && !w.faucetpayPayoutId) ||
                                (w.status === 'processing' && w.timestamp !== null && Date.now() - w.timestamp > 15 * 60 * 1000)
                              ) ? (
                                <div className="min-w-[220px] space-y-2">
                                  <p className="text-[10px] text-red-300">
                                    {w.status === 'approved'
                                      ? 'Legacy approval has no payout ID. Verify FaucetPay history before resolving.'
                                      : w.status === 'paid'
                                        ? 'Legacy paid record has no payout ID. Verify FaucetPay history before resolving.'
                                        : w.status === 'processing'
                                          ? 'Processing for over 15 minutes. Check FaucetPay history before resolving.'
                                          : 'Check FaucetPay payout history before choosing. Never retry an uncertain payment.'}
                                  </p>
                                  <input
                                    type="text"
                                    inputMode="numeric"
                                    autoComplete="off"
                                    value={reconcilePayoutIds[w.id] || ''}
                                    onChange={event => setReconcilePayoutIds(current => ({ ...current, [w.id]: event.target.value.replace(/[^0-9]/g, '').slice(0, 32) }))}
                                    placeholder="FaucetPay payout ID"
                                    className="w-full bg-black border border-slate-700 rounded-lg px-2 py-2 text-xs text-white focus:border-[#F4A6C1] focus:outline-none"
                                  />
                                  <div className="flex flex-wrap gap-2">
                                    <button type="button" disabled={adminActionLoading !== null} onClick={() => handleAdminReconcile(w.id, 'paid')} className={`px-2 py-1 rounded-lg text-[10px] font-bold disabled:opacity-40 ${adminActionBtn}`}>Confirm paid</button>
                                    <button type="button" disabled={adminActionLoading !== null} onClick={() => handleAdminReconcile(w.id, 'not_paid')} className="px-2 py-1 rounded-lg border border-red-500/30 text-red-300 text-[10px] font-bold disabled:opacity-40">Confirm not paid</button>
                                  </div>
                                </div>
                              ) : w.status === 'processing' ? (
                                <span className="text-xs text-yellow-300">Processing — do not retry</span>
                              ) : w.status === 'paid' ? (
                                <span className="text-xs text-emerald-400">Payment confirmed</span>
                              ) : w.status === 'approved' ? (
                                <span className="text-xs text-yellow-300">Legacy status — verify manually</span>
                              ) : w.status === 'rejected' ? (
                                <span className="text-xs text-slate-500">Refunded</span>
                              ) : (
                                <span className="text-xs text-slate-500">{w.status}</span>
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
                FaucetPay payouts require a configured server-side API key and the explicit payout-enable flag.
                Uncertain provider responses must be checked in FaucetPay history and reconciled manually before any retry.
                Rejected requests are refunded by the Worker.
              </p>
            </div>
          )}

          <div className="mt-8 w-full">
            {adPlacements.bottom ? (
              <a href={adPlacements.bottom.website_url} target="_blank" rel="noopener noreferrer nofollow sponsored" className="relative block w-full min-h-[100px] md:min-h-[120px] bg-black border border-slate-800 rounded-2xl overflow-hidden hover:border-[#F4A6C1]/50 transition-colors">
                <span className="absolute top-2 right-3 z-10 text-[9px] uppercase tracking-widest text-white bg-black/80 px-2 py-1 rounded font-mono">Sponsored</span>
                <img src={adPlacements.bottom.banner_image_url} alt={adPlacements.bottom.business_name} loading="lazy" className="w-full h-[100px] md:h-[120px] object-cover" />
              </a>
            ) : (
              <button type="button" onClick={openAdvertisingPlans} className="relative w-full min-h-[100px] md:min-h-[120px] bg-black border border-slate-800 rounded-2xl flex flex-col items-center justify-center text-center p-4 overflow-hidden hover:border-[#F4A6C1]/50 transition-colors">
                <span className="absolute top-2 right-3 text-[9px] uppercase tracking-widest text-slate-600 font-mono">Advertisement</span>
                <p className="text-sm font-bold text-white">Advertise at the bottom of DogeDrip</p>
                <p className="text-xs text-slate-500 mt-1">Reserve this banner for your project.</p>
                <span className="text-xs text-[#F4A6C1] font-bold mt-2">Advertise with us →</span>
              </button>
            )}
          </div>
        </main>
      </div>

      <SiteFooter />
    </div>
  );
}

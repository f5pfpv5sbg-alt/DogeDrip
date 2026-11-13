import React, { useEffect, useState } from 'react';
import { getApp, getApps, initializeApp } from 'firebase/app';
import { getAuth, onAuthStateChanged, sendEmailVerification, signOut } from 'firebase/auth';
import {
  ArrowLeft,
  ArrowUpRight,
  CheckCircle2,
  Clock3,
  Gift,
  History,
  LayoutDashboard,
  ListChecks,
  LogOut,
  Mail,
  ShieldCheck,
  Sparkles,
  Ticket,
  Wallet,
  Zap
} from 'lucide-react';

const firebaseConfig = {
  apiKey: "AIzaSyAF5l0YvOk4Wk2NrqoL1BXj6szJtS65q-k",
  authDomain: "dogedrip-3ebda.firebaseapp.com",
  projectId: "dogedrip-3ebda",
  storageBucket: "dogedrip-3ebda.firebasestorage.app",
  messagingSenderId: "839487252990",
  appId: "1:839487252990:web:760ad35b5b66d611bab8af"
};

const firebaseApp = getApps().length ? getApp() : initializeApp(firebaseConfig);
const auth = getAuth(firebaseApp);

const NAV_ITEMS = [
  { id: 'overview', label: 'Overview', icon: LayoutDashboard },
  { id: 'tasks', label: 'Available Tasks', icon: ListChecks },
  { id: 'activity', label: 'My Activity', icon: History },
  { id: 'rewards', label: 'Rewards', icon: Wallet }
];

const SECTION_COPY = {
  tasks: {
    eyebrow: 'TASK MARKETPLACE',
    title: 'Available tasks',
    description: 'Task campaigns will appear here after the Taskwall launch.',
    icon: ListChecks
  },
  activity: {
    eyebrow: 'YOUR PROGRESS',
    title: 'My activity',
    description: 'Your completed tasks and activity history will be shown here once campaigns are enabled.',
    icon: History
  },
  rewards: {
    eyebrow: 'YOUR EARNINGS',
    title: 'Rewards',
    description: 'Verified Taskwall rewards and payout records will appear here after launch.',
    icon: Wallet
  }
};

function TaskwallDashboard() {
  const [user, setUser] = useState(null);
  const [authReady, setAuthReady] = useState(false);
  const [activeSection, setActiveSection] = useState('overview');
  const [sendingVerification, setSendingVerification] = useState(false);
  const [verificationMessage, setVerificationMessage] = useState('');

  useEffect(() => {
    document.title = 'Taskwall Dashboard | DogeDrip';
    const unsubscribe = onAuthStateChanged(auth, (nextUser) => {
      setUser(nextUser);
      setAuthReady(true);
    });
    return unsubscribe;
  }, []);

  const handleSignOut = async () => {
    await signOut(auth);
    window.location.assign('/');
  };

  const handleSendVerification = async () => {
    if (!user) return;
    setSendingVerification(true);
    setVerificationMessage('');
    try {
      await sendEmailVerification(user);
      setVerificationMessage('Verification email sent. Open the link in your inbox, then reload this page.');
    } catch (error) {
      setVerificationMessage(
        error?.code === 'auth/too-many-requests'
          ? 'Too many requests. Please wait before trying again.'
          : 'The verification email could not be sent. Please try again later.'
      );
    } finally {
      setSendingVerification(false);
    }
  };

  const openMainDashboard = () => window.location.assign('/');

  if (!authReady) {
    return (
      <div className="min-h-screen bg-[#050507] text-white flex items-center justify-center px-5">
        <div className="flex items-center gap-3 text-sm text-slate-400">
          <span className="h-2 w-2 rounded-full bg-[#F4A6C1] animate-pulse" />
          Loading Taskwall...
        </div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen bg-[#050507] text-white flex items-center justify-center px-5 py-10">
        <div className="w-full max-w-md rounded-3xl border border-slate-800 bg-[#09090d] p-8 text-center shadow-2xl">
          <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-2xl border border-[#F4A6C1]/30 bg-[#F4A6C1]/10">
            <Ticket className="h-8 w-8 text-[#F4A6C1]" />
          </div>
          <p className="mb-2 text-[10px] font-black uppercase tracking-[0.25em] text-[#F4A6C1]">DogeDrip / Taskwall</p>
          <h1 className="mb-3 text-3xl font-black tracking-tight">Sign in required</h1>
          <p className="mb-7 text-sm leading-6 text-slate-400">
            Sign in to your DogeDrip account to open your separate Taskwall dashboard.
          </p>
          <button
            type="button"
            onClick={openMainDashboard}
            className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-[#F4A6C1] px-5 py-3.5 text-sm font-black text-black transition hover:bg-[#ffd0df]"
          >
            Go to DogeDrip login <ArrowUpRight className="h-4 w-4" />
          </button>
        </div>
      </div>
    );
  }

  if (!user.emailVerified) {
    return (
      <div className="min-h-screen bg-[#050507] text-white flex items-center justify-center px-5 py-10">
        <div className="w-full max-w-lg rounded-3xl border border-slate-800 bg-[#09090d] p-8 text-center">
          <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-2xl border border-[#F4A6C1]/30 bg-[#F4A6C1]/10">
            <Mail className="h-8 w-8 text-[#F4A6C1]" />
          </div>
          <p className="mb-2 text-[10px] font-black uppercase tracking-[0.25em] text-[#F4A6C1]">Account verification</p>
          <h1 className="mb-3 text-2xl font-black">Verify your email first</h1>
          <p className="mb-2 text-sm leading-6 text-slate-400">
            Taskwall access is available only to verified DogeDrip accounts.
          </p>
          <p className="mb-6 break-all text-sm font-bold text-white">{user.email}</p>
          <button
            type="button"
            onClick={handleSendVerification}
            disabled={sendingVerification}
            className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-[#F4A6C1] px-5 py-3.5 text-sm font-black text-black transition hover:bg-[#ffd0df] disabled:cursor-not-allowed disabled:opacity-60"
          >
            <Mail className="h-4 w-4" />
            {sendingVerification ? 'Sending...' : 'Resend verification email'}
          </button>
          {verificationMessage && <p className="mt-4 text-xs leading-5 text-slate-400" role="status">{verificationMessage}</p>}
          <button type="button" onClick={openMainDashboard} className="mt-5 text-xs font-bold text-slate-400 underline underline-offset-4 hover:text-white">
            Back to DogeDrip
          </button>
        </div>
      </div>
    );
  }

  const selectedSection = SECTION_COPY[activeSection];
  const SectionIcon = selectedSection?.icon;

  return (
    <div className="min-h-screen bg-[#050507] text-white">
      <header className="sticky top-0 z-30 border-b border-slate-800/80 bg-[#07070a]/95 backdrop-blur-xl">
        <div className="mx-auto flex h-[72px] max-w-[1500px] items-center justify-between px-4 sm:px-6 lg:px-8">
          <a href="/taskwall" className="flex items-center gap-3" aria-label="Taskwall home">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl border border-[#F4A6C1]/30 bg-[#F4A6C1]/10">
              <Ticket className="h-5 w-5 text-[#F4A6C1]" />
            </span>
            <span>
              <span className="block text-lg font-black tracking-tight">TASK<span className="text-[#F4A6C1]">WALL</span></span>
              <span className="block text-[9px] font-bold uppercase tracking-[0.22em] text-slate-500">A DogeDrip earning hub</span>
            </span>
          </a>
          <div className="flex items-center gap-3">
            <span className="hidden max-w-[190px] truncate text-xs font-semibold text-slate-400 sm:block">{user.email}</span>
            <button
              type="button"
              onClick={handleSignOut}
              className="inline-flex items-center gap-2 rounded-xl border border-slate-700 px-3 py-2.5 text-xs font-bold text-slate-300 transition hover:border-[#F4A6C1]/50 hover:text-white"
            >
              <LogOut className="h-4 w-4" /><span className="hidden sm:inline">Sign out</span>
            </button>
          </div>
        </div>
      </header>

      <div className="mx-auto grid max-w-[1500px] grid-cols-1 gap-6 px-4 py-6 sm:px-6 lg:grid-cols-[250px_minmax(0,1fr)] lg:gap-8 lg:px-8 lg:py-8">
        <aside className="h-fit rounded-2xl border border-slate-800 bg-[#09090d] p-3 lg:sticky lg:top-24">
          <div className="px-3 pb-3 pt-2">
            <p className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-500">Workspace</p>
            <p className="mt-1 text-sm font-bold text-white">Taskwall Dashboard</p>
          </div>
          <nav className="flex gap-2 overflow-x-auto lg:flex-col" aria-label="Taskwall navigation">
            {NAV_ITEMS.map((item) => {
              const Icon = item.icon;
              const active = activeSection === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setActiveSection(item.id)}
                  aria-current={active ? 'page' : undefined}
                  className={active ? 'inline-flex shrink-0 items-center gap-3 rounded-xl border border-[#F4A6C1]/30 bg-[#F4A6C1]/10 px-3 py-3 text-left text-xs font-bold text-[#F4A6C1] transition lg:w-full' : 'inline-flex shrink-0 items-center gap-3 rounded-xl border border-transparent px-3 py-3 text-left text-xs font-bold text-slate-400 transition hover:bg-white/[0.04] hover:text-white lg:w-full'}
                >
                  <Icon className="h-4 w-4" />{item.label}
                </button>
              );
            })}
          </nav>
          <div className="mt-4 hidden rounded-xl border border-slate-800 bg-black/60 p-4 lg:block">
            <div className="mb-2 flex items-center gap-2 text-[#F4A6C1]">
              <ShieldCheck className="h-4 w-4" /><span className="text-[10px] font-black uppercase tracking-wider">Secure account</span>
            </div>
            <p className="text-[11px] leading-5 text-slate-500">Signed in with your verified DogeDrip account.</p>
          </div>
          <a href="/" className="mt-3 hidden items-center gap-2 rounded-xl px-3 py-3 text-xs font-bold text-slate-500 transition hover:text-white lg:flex">
            <ArrowLeft className="h-4 w-4" /> Back to DogeDrip
          </a>
        </aside>

        <main className="min-w-0 space-y-6">
          <section className="relative overflow-hidden rounded-3xl border border-slate-800 bg-[#09090d] p-6 sm:p-8 lg:p-10">
            <div className="pointer-events-none absolute -right-16 -top-24 h-72 w-72 rounded-full bg-[#F4A6C1]/10 blur-3xl" />
            <div className="relative">
              <div className="mb-5 flex flex-wrap items-center gap-2">
                <span className="rounded-full border border-[#F4A6C1]/35 bg-[#F4A6C1]/10 px-3 py-1 text-[9px] font-black uppercase tracking-[0.2em] text-[#F4A6C1]">Independent dashboard</span>
                <span className="rounded-full border border-slate-700 px-3 py-1 text-[9px] font-black uppercase tracking-[0.16em] text-slate-400">Coming soon</span>
              </div>
              {activeSection === 'overview' ? (
                <>
                  <p className="mb-2 text-xs font-bold uppercase tracking-[0.22em] text-slate-500">Your earning workspace</p>
                  <h1 className="max-w-3xl text-3xl font-black tracking-tight sm:text-4xl lg:text-5xl">More ways to earn.<br /><span className="text-[#F4A6C1]">All in one place.</span></h1>
                  <p className="mt-4 max-w-2xl text-sm leading-7 text-slate-400 sm:text-base">
                    Discover task campaigns, complete activities and collect rewards. The Taskwall workspace is ready; campaigns are being prepared for launch.
                  </p>
                  <div className="mt-7 flex flex-wrap gap-3">
                    <button type="button" onClick={() => setActiveSection('tasks')} className="inline-flex items-center gap-2 rounded-xl bg-[#F4A6C1] px-5 py-3 text-xs font-black text-black transition hover:bg-[#ffd0df]">
                      Explore tasks <ArrowUpRight className="h-4 w-4" />
                    </button>
                    <a href="/" className="inline-flex items-center gap-2 rounded-xl border border-slate-700 px-5 py-3 text-xs font-bold text-slate-300 transition hover:border-slate-500 hover:text-white">
                      <ArrowLeft className="h-4 w-4" /> Main DogeDrip
                    </a>
                  </div>
                </>
              ) : (
                <>
                  <p className="mb-2 text-xs font-bold uppercase tracking-[0.22em] text-slate-500">{selectedSection.eyebrow}</p>
                  <div className="flex items-center gap-3">
                    <SectionIcon className="h-8 w-8 text-[#F4A6C1]" />
                    <h1 className="text-3xl font-black tracking-tight sm:text-4xl">{selectedSection.title}</h1>
                  </div>
                  <p className="mt-4 max-w-2xl text-sm leading-7 text-slate-400">{selectedSection.description}</p>
                </>
              )}
            </div>
          </section>

          {activeSection === 'overview' ? (
            <>
              <section className="grid gap-4 sm:grid-cols-3">
                <div className="rounded-2xl border border-slate-800 bg-[#09090d] p-5">
                  <div className="mb-4 flex h-10 w-10 items-center justify-center rounded-xl bg-[#F4A6C1]/10 text-[#F4A6C1]"><ListChecks className="h-5 w-5" /></div>
                  <p className="text-xs font-semibold text-slate-500">Available tasks</p>
                  <p className="mt-1 text-xl font-black">Launching soon</p>
                </div>
                <div className="rounded-2xl border border-slate-800 bg-[#09090d] p-5">
                  <div className="mb-4 flex h-10 w-10 items-center justify-center rounded-xl bg-[#F4A6C1]/10 text-[#F4A6C1]"><Gift className="h-5 w-5" /></div>
                  <p className="text-xs font-semibold text-slate-500">Task rewards</p>
                  <p className="mt-1 text-xl font-black">Not active yet</p>
                </div>
                <div className="rounded-2xl border border-slate-800 bg-[#09090d] p-5">
                  <div className="mb-4 flex h-10 w-10 items-center justify-center rounded-xl bg-[#F4A6C1]/10 text-[#F4A6C1]"><Clock3 className="h-5 w-5" /></div>
                  <p className="text-xs font-semibold text-slate-500">Campaign status</p>
                  <p className="mt-1 text-xl font-black">In preparation</p>
                </div>
              </section>
              <section className="rounded-2xl border border-slate-800 bg-[#09090d] p-6 sm:p-8">
                <div className="flex flex-col gap-5 sm:flex-row sm:items-center">
                  <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl border border-[#F4A6C1]/30 bg-[#F4A6C1]/10 text-[#F4A6C1]"><Sparkles className="h-7 w-7" /></div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-black">The Taskwall launch is coming</p>
                    <p className="mt-1 text-xs leading-6 text-slate-500">No tasks or rewards are currently active. We will show real campaigns here once the server-side task and reward system is ready.</p>
                  </div>
                  <span className="inline-flex w-fit items-center gap-2 rounded-full border border-slate-700 px-3 py-2 text-[10px] font-black uppercase tracking-wider text-slate-400"><Zap className="h-3.5 w-3.5 text-[#F4A6C1]" /> In development</span>
                </div>
              </section>
            </>
          ) : (
            <section className="flex min-h-[280px] flex-col items-center justify-center rounded-2xl border border-dashed border-slate-700 bg-[#09090d]/80 px-6 py-12 text-center">
              <div className="mb-5 flex h-14 w-14 items-center justify-center rounded-2xl border border-[#F4A6C1]/30 bg-[#F4A6C1]/10 text-[#F4A6C1]">
                {SectionIcon ? <SectionIcon className="h-7 w-7" /> : <CheckCircle2 className="h-7 w-7" />}
              </div>
              <span className="mb-2 text-[9px] font-black uppercase tracking-[0.22em] text-[#F4A6C1]">Coming soon</span>
              <h2 className="text-xl font-black text-white">{selectedSection.title}</h2>
              <p className="mt-2 max-w-md text-xs leading-6 text-slate-500">{selectedSection.description}</p>
            </section>
          )}

          <footer className="flex flex-col gap-2 border-t border-slate-800/80 py-5 text-[10px] text-slate-600 sm:flex-row sm:items-center sm:justify-between">
            <span>© {new Date().getFullYear()} DogeDrip Taskwall</span>
            <span>Separate workspace · Same verified DogeDrip account</span>
          </footer>
        </main>
      </div>
    </div>
  );
}

export default TaskwallDashboard;

import { useEffect, useState } from "react";
import { NavLink, Outlet, Link, useLocation } from "react-router";
import {
  ClipboardCheck,
  LayoutDashboard,
  LogOut,
  Menu,
  Settings,
  Users,
  WifiOff,
  X,
} from "lucide-react";
import { useAuth } from "../../context/useAuth";
import { useLanguage } from "../../context/useLanguage";
import { getPendingScreenings } from "../../services/offlineSyncService";
import { syncQueuedScreenings } from "../../services/screeningService";
import { SCREENING_COPY } from "../../utils/screeningTranslations";

export default function AppShell() {
  const { user, profile, signOut } = useAuth();
  const { lang } = useLanguage();
  const copy = SCREENING_COPY[lang] || SCREENING_COPY.en;
  const location = useLocation();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [isOnline, setIsOnline] = useState(
    typeof navigator !== "undefined" ? navigator.onLine : true,
  );
  const [pendingCount, setPendingCount] = useState(0);
  const [syncing, setSyncing] = useState(false);

  const navItems = [
    { to: "/", label: copy.nav.dashboard, icon: LayoutDashboard, end: true },
    { to: "/patients", label: copy.nav.patients, icon: Users, end: false },
    {
      to: "/screening",
      label: copy.nav.screening,
      icon: ClipboardCheck,
      end: false,
    },
    { to: "/settings", label: copy.nav.settings, icon: Settings, end: false },
  ];

  const clinicianName =
    profile?.fullName || user?.displayName || user?.email || "Clinician";

  useEffect(() => {
    const refreshQueue = async () => {
      if (!user?.uid) return;
      try {
        const list = await getPendingScreenings(user.uid);
        setPendingCount(list.length);
      } catch {
        // IndexedDB unavailable
      }
    };

    const handleOnline = async () => {
      setIsOnline(true);
      if (user?.uid) {
        setSyncing(true);
        try {
          await syncQueuedScreenings(user.uid);
        } finally {
          setSyncing(false);
          refreshQueue();
        }
      }
    };

    const handleOffline = () => setIsOnline(false);

    refreshQueue();
    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, [user?.uid, location.pathname]);

  const handleManualSync = async () => {
    if (!user?.uid || !isOnline) return;
    setSyncing(true);
    try {
      await syncQueuedScreenings(user.uid);
      const list = await getPendingScreenings(user.uid);
      setPendingCount(list.length);
    } finally {
      setSyncing(false);
    }
  };

  const handleSignOut = async () => {
    await signOut();
  };

  const navContent = (
    <div className="flex flex-col h-full">
      <div className="h-14 px-4 border-b border-border flex items-center justify-between">
        <Link
          to="/"
          onClick={() => setMobileMenuOpen(false)}
          className="flex items-center gap-2.5 text-foreground font-semibold tracking-tight"
        >
          <span className="text-base">JointSense</span>
        </Link>
        <button
          type="button"
          onClick={() => setMobileMenuOpen(false)}
          aria-label="Close navigation menu"
          className="lg:hidden p-1 text-secondary hover:text-foreground rounded-[3px]"
        >
          <X size={18} strokeWidth={1.75} />
        </button>
      </div>

      <nav
        aria-label="Primary navigation"
        className="flex-1 px-3 py-4 space-y-1"
      >
        {navItems.map(({ to, label, icon: Icon, end }) => (
          <NavLink
            key={to}
            to={to}
            end={end}
            onClick={() => setMobileMenuOpen(false)}
            className={({ isActive }) =>
              `flex items-center gap-2.5 px-3 py-2 text-sm rounded-sm border-l-2 transition-colors ${
                isActive
                  ? "bg-surface-muted text-foreground font-semibold border-accent"
                  : "text-secondary hover:text-foreground hover:bg-surface-muted border-transparent"
              }`
            }
          >
            <Icon size={16} strokeWidth={1.75} aria-hidden="true" />
            <span>{label}</span>
          </NavLink>
        ))}
      </nav>

      <div className="px-4 py-3.5 border-t border-border bg-surface">
        <div className="text-sm font-semibold text-foreground truncate">
          {clinicianName}
        </div>
        <button
          type="button"
          onClick={handleSignOut}
          className="mt-2.5 w-full inline-flex items-center justify-center gap-2 px-3 py-1.5 text-xs font-medium text-secondary hover:text-foreground bg-surface-muted hover:bg-surface-hover border border-border rounded-sm"
        >
          <LogOut size={14} strokeWidth={1.75} aria-hidden="true" />
          <span>Sign out</span>
        </button>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen flex bg-background text-foreground">
      {/* Desktop Sidebar */}
      <aside className="hidden lg:block w-56 shrink-0 bg-surface border-r border-border no-print">
        <div className="sticky top-0 h-screen">{navContent}</div>
      </aside>

      {/* Mobile Sidebar Overlay */}
      <div
        className={`fixed inset-0 z-40 flex lg:hidden no-print ${
          mobileMenuOpen ? "pointer-events-auto" : "pointer-events-none"
        }`}
        aria-hidden={!mobileMenuOpen}
        inert={!mobileMenuOpen}
      >
        {/* Backdrop */}
        <div
          onClick={() => setMobileMenuOpen(false)}
          className={`absolute inset-0 bg-black/30 transition-opacity duration-380 ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none ${
            mobileMenuOpen ? "opacity-100" : "opacity-0"
          }`}
        />

        {/* Sidebar */}
        <aside
          className={`relative z-50 w-60 max-w-[80vw] h-full bg-surface border-r border-border transform-gpu transition-transform duration-420 ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none ${
            mobileMenuOpen ? "translate-x-0" : "-translate-x-full"
          }`}
        >
          {navContent}
        </aside>
      </div>

      {/* Main Column */}
      <div className="flex-1 min-w-0 flex flex-col">
        <header className="h-14 bg-surface border-b border-border px-4 sm:px-6 grid grid-cols-[2.75rem_1fr_minmax(2.75rem,auto)] items-center gap-2 no-print lg:hidden">
          <button
            type="button"
            onClick={() => setMobileMenuOpen(true)}
            aria-label="Open navigation menu"
            className="inline-flex items-center justify-center min-w-10 min-h-10 text-secondary hover:text-foreground hover:bg-surface-muted rounded-sm"
          >
            <Menu size={18} strokeWidth={1.75} aria-hidden="true" />
          </button>
          <span className="text-base font-semibold tracking-tight text-center truncate">
            JointSense
          </span>

          <div className="flex items-center justify-end gap-2 shrink-0">
            {!isOnline && (
              <span className="inline-flex items-center gap-1.5 px-2 py-1 text-xs font-medium bg-warning-bg text-warning-text border border-warning-border rounded-sm">
                <WifiOff size={13} strokeWidth={1.75} aria-hidden="true" />
                <span>Offline</span>
              </span>
            )}
            {pendingCount > 0 && (
              <button
                type="button"
                disabled={!isOnline || syncing}
                onClick={handleManualSync}
                className="px-2.5 py-1 text-xs font-medium bg-info-bg text-info-text border border-info-border rounded-sm"
              >
                {syncing ? "Syncing..." : `Sync ${pendingCount} queued`}
              </button>
            )}
          </div>
        </header>

        <main className="flex-1 p-4 sm:p-6">
          <div className="max-w-6xl mx-auto">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  );
}

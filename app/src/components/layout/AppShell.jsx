import { useEffect, useState } from "react";
import { NavLink, Outlet, Link, useLocation } from "react-router";
import {
  ClipboardCheck,
  LayoutDashboard,
  LogOut,
  Menu,
  Users,
  WifiOff,
  X,
} from "lucide-react";
import { useAuth } from "../../context/useAuth";
import { getPendingScreenings } from "../../services/offlineSyncService";
import { syncQueuedScreenings } from "../../services/screeningService";
import ThemeToggle from "../common/ThemeToggle";

const NAV_ITEMS = [
  { to: "/", label: "Dashboard", icon: LayoutDashboard, end: true },
  { to: "/patients", label: "Patients", icon: Users, end: false },
  { to: "/screening", label: "New Screening", icon: ClipboardCheck, end: false },
];

function getPageTitle(pathname) {
  if (pathname === "/") return "Doctor Dashboard";
  if (pathname === "/patients") return "Patient Management";
  if (pathname.startsWith("/patients/")) return "Patient Details";
  if (pathname === "/screening") return "Guided Screening";
  if (pathname.startsWith("/screenings/")) return "Screening Result";
  return "JointSense";
}

export default function AppShell() {
  const { user, profile, signOut } = useAuth();
  const location = useLocation();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [isOnline, setIsOnline] = useState(
    typeof navigator !== "undefined" ? navigator.onLine : true
  );
  const [pendingCount, setPendingCount] = useState(0);
  const [syncing, setSyncing] = useState(false);

  const clinicianName =
    profile?.fullName || user?.displayName || user?.email || "Clinician";
  const clinicianDept =
    profile?.department || "Outpatient Musculoskeletal Clinic";

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

      <nav aria-label="Primary navigation" className="flex-1 px-3 py-4 space-y-1">
        {NAV_ITEMS.map(({ to, label, icon: Icon, end }) => (
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
        <div className="text-xs text-muted truncate mt-0.5">{clinicianDept}</div>
        <button
          type="button"
          onClick={handleSignOut}
          className="mt-3 w-full inline-flex items-center justify-center gap-2 px-3 py-1.5 text-xs font-medium text-secondary hover:text-foreground bg-surface-muted hover:bg-surface-hover border border-border rounded-sm"
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
      {mobileMenuOpen && (
        <div className="fixed inset-0 z-40 lg:hidden flex no-print">
          <div
            className="fixed inset-0 bg-foreground/30"
            onClick={() => setMobileMenuOpen(false)}
            aria-hidden="true"
          />
          <aside className="relative z-50 w-60 max-w-[80vw] bg-surface border-r border-border h-full">
            {navContent}
          </aside>
        </div>
      )}

      {/* Main Column */}
      <div className="flex-1 min-w-0 flex flex-col">
        <header className="h-14 bg-surface border-b border-border px-4 sm:px-6 flex items-center justify-between gap-4 no-print">
          <div className="flex items-center gap-3 min-w-0">
            <button
              type="button"
              onClick={() => setMobileMenuOpen(true)}
              aria-label="Open navigation menu"
              className="lg:hidden p-1.5 text-secondary hover:text-foreground hover:bg-surface-muted rounded-sm"
            >
              <Menu size={18} strokeWidth={1.75} />
            </button>
            <div className="text-sm font-medium text-secondary truncate">
              {getPageTitle(location.pathname)}
            </div>
          </div>

          <div className="flex items-center gap-2.5 shrink-0">
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
                {syncing
                  ? "Syncing..."
                  : `Sync ${pendingCount} queued`}
              </button>
            )}
            <span className="hidden md:inline text-xs text-muted">
              {user?.email}
            </span>
            <ThemeToggle />
            <Link
              to="/screening"
              className="link-button inline-flex items-center px-3 py-1.5 text-sm font-medium bg-accent hover:bg-accent-hover text-accent-foreground rounded-sm"
            >
              Start screening
            </Link>
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

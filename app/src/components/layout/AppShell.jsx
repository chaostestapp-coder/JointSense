import { useState } from "react";
import { NavLink, Outlet, Link, useLocation } from "react-router";
import {
  ClipboardCheck,
  LayoutDashboard,
  LogOut,
  Menu,
  Users,
  X,
} from "lucide-react";
import { useAuth } from "../../context/useAuth";

const NAV_ITEMS = [
  { to: "/", label: "Dashboard", icon: LayoutDashboard, end: true },
  { to: "/patients", label: "Patients", icon: Users, end: false },
  { to: "/screening", label: "New Screening", icon: ClipboardCheck, end: false },
];

function getPageTitle(pathname) {
  if (pathname === "/") return "Doctor Dashboard";
  if (pathname === "/patients") return "Patient Management";
  if (pathname.startsWith("/patients/")) return "Patient Details";
  if (pathname === "/screening") return "Joint Screening";
  if (pathname.startsWith("/screenings/")) return "Screening Result";
  return "JointSense";
}

export default function AppShell() {
  const { user, profile, signOut } = useAuth();
  const location = useLocation();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const clinicianName =
    profile?.fullName || user?.displayName || user?.email || "Clinician";
  const clinicianDept =
    profile?.department || "Outpatient Musculoskeletal Clinic";

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
          <span
            className="inline-flex items-center justify-center w-6 h-6 bg-foreground text-surface rounded-[3px] text-xs font-bold"
            aria-hidden="true"
          >
            JS
          </span>
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

          <div className="flex items-center gap-3 shrink-0">
            <span className="hidden sm:inline text-xs text-muted">
              {user?.email}
            </span>
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

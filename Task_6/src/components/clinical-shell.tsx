"use client";

import React, { useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  Clock3,
  Users,
  Stethoscope,
  CalendarDays,
  HeartPulse,
  FileBarChart,
  UserCheck,
  ClipboardList,
  CalendarClock,
  Settings,
  Search,
  Bell,
  Home,
  ChevronDown,
  ChevronRight,
  ShieldCheck,
  Menu,
  X,
  LogOut,
  Trash2,
  Plus,
  LogIn,
  UserPlus,
  CreditCard,
} from "lucide-react";
import type { SessionPayload } from "@/lib/auth-crypto";
import { logoutAction, deleteAccountAction } from "@/actions/auth";
import { getMyNotificationsAction, type InboxItem } from "@/actions/notifications";

import { Button } from "@/components/ui/button";
interface ClinicalShellProps {
  user: SessionPayload | null;
  children: React.ReactNode;
}

/** Bell menu: the signed-in user's recent emails and updates (bookings, receipts, insurance, follow-ups). */
function NotificationBell({ signedIn }: { signedIn: boolean }) {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<InboxItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const toggle = async () => {
    const next = !open;
    setOpen(next);
    if (!next) return;
    if (!signedIn) {
      setItems([]);
      return;
    }
    const res = await getMyNotificationsAction();
    if (res.success) {
      setItems(res.items);
      setError(null);
    } else {
      setError(res.error);
    }
  };

  return (
    <div className="relative">
      <Button variant="bare" className="icon-btn notification" onClick={toggle} title="Notifications" aria-expanded={open}>
        <Bell size={18} />
        <i />
      </Button>
      {open && (
        <div className="absolute right-0 top-full z-50 mt-2 w-[min(22rem,90vw)] rounded-xl border border-slate-200 bg-white p-2 shadow-xl">
          <div className="flex items-center justify-between px-2 py-1.5 text-xs font-bold text-slate-700">
            <span>Recent messages</span>
            <button type="button" className="text-slate-400 hover:text-slate-700" onClick={() => setOpen(false)} aria-label="Close">
              <X size={14} />
            </button>
          </div>
          <div className="max-h-96 space-y-1 overflow-y-auto">
            {error ? (
              <p className="px-2 py-3 text-xs text-red-700">{error}</p>
            ) : items === null ? (
              <p className="px-2 py-3 text-xs text-slate-500">Loading…</p>
            ) : items.length === 0 ? (
              <p className="px-2 py-3 text-xs text-slate-500">{signedIn ? "No messages yet." : "Sign in to see your messages."}</p>
            ) : (
              items.map((n) => (
                <div key={n.id} className="rounded-lg px-2 py-2 hover:bg-slate-50">
                  <p className="text-xs font-bold text-slate-900">{n.subject}</p>
                  <p className="mt-0.5 text-[11px] leading-snug text-slate-600">{n.preview}</p>
                  <p className="mt-1 text-[10px] text-slate-400">
                    {new Date(n.createdAt).toLocaleString("en-IN", { timeZone: "Asia/Kolkata", dateStyle: "medium", timeStyle: "short" })} · {n.status.toLowerCase()}
                  </p>
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export function ClinicalShell({ user, children }: ClinicalShellProps) {
  const pathname = usePathname();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");

  const handleDeleteAccount = async () => {
    const roleLabel = user?.role === "DOCTOR" ? "Doctor" : "Patient";
    const password = window.prompt(
      `⚠️ PERMANENT ACCOUNT DELETION\n\nAre you sure you want to permanently delete your ${roleLabel} account?\n\nAll personal information, active bookings, and associated clinical records will be permanently removed from the database.\n\nPlease enter your account password to confirm deletion:`
    );
    if (password === null) return;
    if (!password.trim()) {
      alert("Password is required to delete your account.");
      return;
    }

    try {
      const res = await deleteAccountAction(password);
      if (res && res.success) {
        window.location.href = res.redirectPath || "/signup";
      } else {
        alert(res?.error || "Failed to delete account. Please try again.");
      }
    } catch (e: any) {
      alert(e?.message || "Failed to delete account.");
    }
  };

  // The public landing page and auth pages bring their own header/footer, so they skip the app sidebar.
  const isStandalonePage =
    pathname === "/" ||
    pathname.startsWith("/login") ||
    pathname.startsWith("/register") ||
    pathname.startsWith("/signup");

  if (isStandalonePage) {
    return <main className="w-full min-h-screen">{children}</main>;
  }

  const getBreadcrumb = () => {
    if (pathname.startsWith("/queue")) return "Live Token Queue";
    if (pathname === "/doctors") return "Specialists Directory";
    if (pathname.startsWith("/doctors/")) return "Book Consultation";
    if (pathname.startsWith("/admin/notifications")) return "Notification Delivery Engine";
    if (pathname.startsWith("/reports")) return "Visit Reports & Analytics";
    if (pathname.startsWith("/patient/payments")) return "Payments & Receipts";
    if (pathname.startsWith("/patient/insurance")) return "Insurance & Cashless";
    if (pathname.startsWith("/patient/dashboard")) return "Patient Portal";
    if (pathname.startsWith("/doctor/dashboard")) return "Doctor Agenda";
    if (pathname.startsWith("/doctor/availability")) return "Weekly Shifts";
    if (pathname.startsWith("/settings")) return "Hospital Settings";
    if (pathname.startsWith("/login")) return "Secure Authentication";
    if (pathname.startsWith("/register")) return "Account Registration";
    return "Hospital Workspace";
  };

  const getInitials = (name?: string) => {
    if (!name) return "GU";
    const parts = name.replace("Dr. ", "").trim().split(" ");
    if (parts.length >= 2) return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
    return name.slice(0, 2).toUpperCase();
  };

  return (
    <div className="app-shell">
      {/* Mobile Drawer Backdrop */}
      {sidebarOpen && (
        <div
          className="sidebar-backdrop"
          onClick={() => setSidebarOpen(false)}
          aria-label="Close navigation drawer"
        />
      )}

      {/* Left Clinical Sidebar */}
      <aside className={`sidebar ${sidebarOpen ? "open" : ""}`}>
        {/* Brand Header */}
        <Link href="/" className="brand" onClick={() => setSidebarOpen(false)}>
          <Image
            src="/images/medrella-logo.png"
            alt="Medrella"
            width={30}
            height={30}
            className="brand-logo-img"
            priority
          />
          <span>
            medrella<span className="brand-dot">.</span>
          </span>
        </Link>

        {/* Hospital Facility Switcher */}
        <div className="hospital-switch">
          <span className="hospital-icon">
            <Home size={16} />
          </span>
          <span>
            <b>Ruby Hall, Pune</b>
            <small>Pune · Active Facility</small>
          </span>
          <ChevronDown size={14} className="text-slate-400" />
        </div>

        {/* Workspace Navigation */}
        {user?.role === "PATIENT" ? (
          <>
            <div className="nav-label">PATIENT CARE</div>
            <nav>
              <Link
                href="/"
                onClick={() => setSidebarOpen(false)}
                className={`nav-item ${pathname === "/" ? "active" : ""}`}
              >
                <Home size={17} />
                <span>Home</span>
              </Link>

              <Link
                href="/doctors"
                onClick={() => setSidebarOpen(false)}
                className={`nav-item ${pathname === "/doctors" || pathname.startsWith("/doctors/") ? "active" : ""}`}
              >
                <Stethoscope size={17} />
                <span>Find Specialists</span>
              </Link>

              <Link
                href="/patient/dashboard"
                onClick={() => setSidebarOpen(false)}
                className={`nav-item ${pathname.startsWith("/patient/dashboard") ? "active" : ""}`}
              >
                <UserCheck size={17} />
                <span>My Appointments</span>
              </Link>

              <Link
                href="/patient/payments"
                onClick={() => setSidebarOpen(false)}
                className={`nav-item ${pathname.startsWith("/patient/payments") ? "active" : ""}`}
              >
                <CreditCard size={17} />
                <span>Payments & Receipts</span>
              </Link>

              <Link
                href="/patient/insurance"
                onClick={() => setSidebarOpen(false)}
                className={`nav-item ${pathname.startsWith("/patient/insurance") ? "active" : ""}`}
              >
                <ShieldCheck size={17} />
                <span>Insurance</span>
              </Link>

              <Link
                href="/settings"
                onClick={() => setSidebarOpen(false)}
                className={`nav-item ${pathname.startsWith("/settings") ? "active" : ""}`}
              >
                <Settings size={17} />
                <span>Notification Settings</span>
              </Link>
            </nav>
          </>
        ) : user?.role === "DOCTOR" ? (
          <>
            <div className="nav-label">PHYSICIAN CARE</div>
            <nav>
              <Link
                href="/"
                onClick={() => setSidebarOpen(false)}
                className={`nav-item ${pathname === "/" ? "active" : ""}`}
              >
                <Home size={17} />
                <span>Home</span>
              </Link>

              <Link
                href="/doctor/dashboard"
                onClick={() => setSidebarOpen(false)}
                className={`nav-item ${pathname.startsWith("/doctor/dashboard") ? "active" : ""}`}
              >
                <ClipboardList size={17} />
                <span>Doctor Agenda</span>
              </Link>

              <Link
                href="/doctor/availability"
                onClick={() => setSidebarOpen(false)}
                className={`nav-item ${pathname.startsWith("/doctor/availability") ? "active" : ""}`}
              >
                <CalendarClock size={17} />
                <span>Weekly Shifts</span>
              </Link>

              <Link
                href="/doctors"
                onClick={() => setSidebarOpen(false)}
                className={`nav-item ${pathname === "/doctors" || pathname.startsWith("/doctors/") ? "active" : ""}`}
              >
                <Stethoscope size={17} />
                <span>Specialists Directory</span>
              </Link>
            </nav>

            {/* Prototype & Staff Ops Previews */}
            <div className="nav-label mt-3">HOSPITAL OPS PREVIEWS</div>
            <nav>
              <Link
                href="/queue"
                onClick={() => setSidebarOpen(false)}
                className={`nav-item ${pathname.startsWith("/queue") ? "active" : ""}`}
              >
                <Clock3 size={17} />
                <span>Live Queue</span>
              </Link>

              <Link
                href="/reports"
                onClick={() => setSidebarOpen(false)}
                className={`nav-item ${pathname.startsWith("/reports") ? "active" : ""}`}
              >
                <FileBarChart size={17} />
                <span>Reports &amp; Analytics</span>
              </Link>

              <Link
                href="/settings"
                onClick={() => setSidebarOpen(false)}
                className={`nav-item ${pathname.startsWith("/settings") ? "active" : ""}`}
              >
                <Settings size={17} />
                <span>Facility Settings</span>
              </Link>

              <Link
                href="/admin/notifications"
                onClick={() => setSidebarOpen(false)}
                className={`nav-item ${pathname.startsWith("/admin/notifications") ? "active" : ""}`}
              >
                <Bell size={17} />
                <span>Notification Outbox</span>
              </Link>
            </nav>
          </>
        ) : (
          <>
            <div className="nav-label">OUTPATIENT SERVICES</div>
            <nav>
              <Link
                href="/"
                onClick={() => setSidebarOpen(false)}
                className={`nav-item ${pathname === "/" ? "active" : ""}`}
              >
                <LayoutDashboard size={17} />
                <span>Overview</span>
              </Link>

              <Link
                href="/doctors"
                onClick={() => setSidebarOpen(false)}
                className={`nav-item ${pathname === "/doctors" || pathname.startsWith("/doctors/") ? "active" : ""}`}
              >
                <Stethoscope size={17} />
                <span>Find Specialists</span>
              </Link>

              <Link
                href="/patient/dashboard"
                onClick={() => setSidebarOpen(false)}
                className={`nav-item ${pathname.startsWith("/patient/dashboard") ? "active" : ""}`}
              >
                <UserCheck size={17} />
                <span>Patient Portal</span>
              </Link>

              <Link
                href="/patient/payments"
                onClick={() => setSidebarOpen(false)}
                className={`nav-item ${pathname.startsWith("/patient/payments") ? "active" : ""}`}
              >
                <CreditCard size={17} />
                <span>Payments & Receipts</span>
              </Link>

              <Link
                href="/settings"
                onClick={() => setSidebarOpen(false)}
                className={`nav-item ${pathname.startsWith("/settings") ? "active" : ""}`}
              >
                <Settings size={17} />
                <span>Notification Settings</span>
              </Link>
            </nav>
          </>
        )}

        {/* Sidebar Footer */}
        <div className="sidebar-bottom">
          <div className="help-card">
            <div className="help-icon">
              <ShieldCheck size={18} />
            </div>
            <b>Need clinical support?</b>
            <small>Direct access to hospital operations and scheduling helpline.</small>
            <Link href="/doctors" className="text-btn">
              Browse Specialists →
            </Link>
          </div>

          {user ? (
            <div className="user-mini">
              <div className="avatar">{getInitials(user.name)}</div>
              <div>
                <b>{user.name}</b>
                <small>
                  {user.role === "DOCTOR" ? "Doctor · Admin access" : "Patient · Verified"}
                </small>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                <Button variant="bare"
                  type="button"
                  onClick={handleDeleteAccount}
                  title="Permanently delete account and all records from database"
                  className="icon-btn text-slate-400 hover:text-red-600 hover:bg-red-50 cursor-pointer p-1.5 rounded-md transition-colors"
                >
                  <Trash2 size={16} />
                </Button>
                <form action={logoutAction}>
                  <Button variant="bare"
                    type="submit"
                    title="Sign out of hospital account"
                    className="icon-btn text-slate-400 hover:text-slate-700 cursor-pointer p-1.5 rounded-md"
                  >
                    <LogOut size={16} />
                  </Button>
                </form>
              </div>
            </div>
          ) : (
            <div className="user-mini">
              <div className="avatar bg-slate-100 text-slate-600">
                <LogIn size={15} />
              </div>
              <div>
                <b>Clinical Portal</b>
                <small>Sign in required</small>
              </div>
              <Link
                href="/login"
                className="btn primary text-xs py-1 px-2.5"
                title="Sign In"
              >
                Sign In
              </Link>
            </div>
          )}
        </div>
      </aside>

      {/* Main Clinical Area */}
      <main className="main-area">
        {/* Sticky Topbar */}
        <header className="topbar">
          <div className="flex items-center gap-2 sm:gap-3 min-w-0">
            <Button variant="bare"
              type="button"
              className="icon-btn mobile-menu-btn"
              onClick={() => setSidebarOpen(!sidebarOpen)}
              aria-label="Toggle Navigation Drawer"
            >
              {sidebarOpen ? <X size={20} /> : <Menu size={20} />}
            </Button>

            <div className="breadcrumbs">
              <span className="breadcrumb-root">Workspace</span>
              <ChevronRight size={14} className="breadcrumb-sep text-slate-300" />
              <b className="breadcrumb-current">{getBreadcrumb()}</b>
            </div>
          </div>

          <div className="top-actions">
            {/* Facility Status Badge */}
            <div className="facility-badge hidden lg:flex items-center gap-2 px-2.5 py-1 rounded-full bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-semibold">
              <span className="live-dot" />
              <span>Ruby Hall · Pune</span>
            </div>

            {/* Quick Action Button */}
            <Link href="/doctors" className="btn primary topbar-book-btn hidden sm:inline-flex">
              <Plus size={14} />
              <span>Book Appointment</span>
            </Link>

            {/* Notifications Button */}
            <NotificationBell signedIn={!!user} />

            {/* User Profile Mini Trigger */}
            {user ? (
              <Link href={user.role === "DOCTOR" ? "/doctor/dashboard" : "/patient/dashboard"} className="profile-button">
                <span className="avatar small-avatar">{getInitials(user.name)}</span>
                <span className="hidden md:block">
                  <b>{user.name}</b>
                  <small>{user.role === "DOCTOR" ? "Doctor" : "Patient"}</small>
                </span>
              </Link>
            ) : (
              <div className="flex items-center gap-1.5">
                <Link href="/login" className="btn text-xs">
                  <LogIn size={13} />
                  <span>Sign In</span>
                </Link>
                <Link href="/register" className="btn primary text-xs hidden sm:inline-flex">
                  <UserPlus size={13} />
                  <span>Register</span>
                </Link>
              </div>
            )}
          </div>
        </header>

        {/* Dynamic Page Content */}
        <div className="page-content">{children}</div>

        {/* Clinical Hospital Footer */}
        <footer className="footer">
          <span>© 2026 Medrella Healthcare Systems · Ruby Hall, Pune</span>
          <span>
            <span className="live-dot" /> All clinical scheduling services operational
          </span>
          <span className="hidden md:inline">Outpatient Care Systems · v1.2.0</span>
        </footer>
      </main>
    </div>
  );
}

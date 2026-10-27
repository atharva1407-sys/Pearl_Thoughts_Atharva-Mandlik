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
  Plus,
  LogIn,
  UserPlus
} from "lucide-react";
import type { SessionPayload } from "@/lib/auth-crypto";
import { logoutAction } from "@/actions/auth";

interface ClinicalShellProps {
  user: SessionPayload | null;
  children: React.ReactNode;
}

export function ClinicalShell({ user, children }: ClinicalShellProps) {
  const pathname = usePathname();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");

  const isAuthPage =
    pathname.startsWith("/login") ||
    pathname.startsWith("/register") ||
    pathname.startsWith("/signup");

  if (isAuthPage) {
    return <main className="w-full min-h-screen">{children}</main>;
  }

  const getBreadcrumb = () => {
    if (pathname === "/") return "Dashboard";
    if (pathname.startsWith("/queue")) return "Live Token Queue";
    if (pathname.startsWith("/reception")) return "Reception Desk";
    if (pathname === "/doctors") return "Specialists Directory";
    if (pathname.startsWith("/doctors/")) return "Book Consultation";
    if (pathname.startsWith("/schedule")) return "Weekly Calendar Schedule";
    if (pathname.startsWith("/encounters")) return "Doctor Encounters & Vitals";
    if (pathname.startsWith("/reports")) return "Visit Reports & Analytics";
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
          className="fixed inset-0 bg-slate-900/40 z-30 md:hidden backdrop-blur-xs"
          onClick={() => setSidebarOpen(false)}
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
        <div className="nav-label">CLINICAL WORKSPACE</div>
        <nav>
          <Link
            href="/"
            onClick={() => setSidebarOpen(false)}
            className={`nav-item ${pathname === "/" ? "active" : ""}`}
          >
            <LayoutDashboard size={17} />
            <span>Dashboard</span>
          </Link>

          <Link
            href="/queue"
            onClick={() => setSidebarOpen(false)}
            className={`nav-item ${pathname.startsWith("/queue") ? "active" : ""}`}
          >
            <Clock3 size={17} />
            <span>Live Queue</span>
          </Link>

          <Link
            href="/reception"
            onClick={() => setSidebarOpen(false)}
            className={`nav-item ${pathname.startsWith("/reception") ? "active" : ""}`}
          >
            <Users size={17} />
            <span>Reception Desk</span>
          </Link>

          <Link
            href="/doctors"
            onClick={() => setSidebarOpen(false)}
            className={`nav-item ${pathname === "/doctors" || pathname.startsWith("/doctors/") ? "active" : ""}`}
          >
            <Stethoscope size={17} />
            <span>Specialists</span>
          </Link>

          <Link
            href="/schedule"
            onClick={() => setSidebarOpen(false)}
            className={`nav-item ${pathname.startsWith("/schedule") ? "active" : ""}`}
          >
            <CalendarDays size={17} />
            <span>Schedule</span>
          </Link>

          <Link
            href="/encounters"
            onClick={() => setSidebarOpen(false)}
            className={`nav-item ${pathname.startsWith("/encounters") ? "active" : ""}`}
          >
            <HeartPulse size={17} />
            <span>Encounters & Vitals</span>
          </Link>

          <Link
            href="/reports"
            onClick={() => setSidebarOpen(false)}
            className={`nav-item ${pathname.startsWith("/reports") ? "active" : ""}`}
          >
            <FileBarChart size={17} />
            <span>Reports & Analytics</span>
          </Link>
        </nav>

        {/* Portals & Management Navigation */}
        <div className="nav-label mt-3">PORTALS & ACCESS</div>
        <nav>
          <Link
            href="/patient/dashboard"
            onClick={() => setSidebarOpen(false)}
            className={`nav-item ${pathname.startsWith("/patient/dashboard") ? "active" : ""}`}
          >
            <UserCheck size={17} />
            <span>Patient Portal</span>
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
            href="/settings"
            onClick={() => setSidebarOpen(false)}
            className={`nav-item ${pathname.startsWith("/settings") ? "active" : ""}`}
          >
            <Settings size={17} />
            <span>Hospital Settings</span>
          </Link>
        </nav>

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
              <form action={logoutAction}>
                <button
                  type="submit"
                  title="Sign out of hospital account"
                  className="icon-btn text-slate-400 hover:text-red-600 cursor-pointer"
                >
                  <LogOut size={16} />
                </button>
              </form>
            </div>
          ) : (
            <div className="user-mini">
              <div className="avatar bg-slate-100 text-slate-600">GU</div>
              <div>
                <b>Guest User</b>
                <small>Public Hospital Portal</small>
              </div>
              <Link
                href="/login"
                className="icon-btn text-blue-600 hover:bg-blue-50"
                title="Sign In"
              >
                <LogIn size={16} />
              </Link>
            </div>
          )}
        </div>
      </aside>

      {/* Main Clinical Area */}
      <main className="main-area">
        {/* Sticky Topbar */}
        <header className="topbar">
          <div className="flex items-center gap-3">
            <button
              className="icon-btn md:hidden"
              onClick={() => setSidebarOpen(!sidebarOpen)}
              aria-label="Toggle Navigation Drawer"
            >
              {sidebarOpen ? <X size={20} /> : <Menu size={20} />}
            </button>

            <div className="breadcrumbs">
              <span>Workspace</span>
              <ChevronRight size={14} />
              <b>{getBreadcrumb()}</b>
            </div>
          </div>

          <div className="top-actions">
            {/* Facility Status Badge */}
            <div className="hidden lg:flex items-center gap-2 px-2.5 py-1 rounded-full bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-semibold">
              <span className="live-dot" />
              <span>Ruby Hall · Pune</span>
            </div>

            {/* Quick Action Button */}
            <Link href="/doctors" className="btn primary hidden sm:inline-flex">
              <Plus size={14} />
              <span>Book Appointment</span>
            </Link>

            {/* Notifications Button */}
            <button
              className="icon-btn notification"
              onClick={() => alert("All hospital appointment queues are operating smoothly.")}
              title="Clinical Alerts"
            >
              <Bell size={18} />
              <i />
            </button>

            {/* User Profile Mini Trigger */}
            {user ? (
              <Link href={user.role === "DOCTOR" ? "/doctor/dashboard" : "/patient/dashboard"} className="profile-button">
                <span className="avatar small-avatar">{getInitials(user.name)}</span>
                <span className="hidden sm:block">
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
                <Link href="/register" className="btn primary text-xs">
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
          <span className="hidden md:inline">HIPAA Compliant · Privacy · v1.2.0</span>
        </footer>
      </main>
    </div>
  );
}

"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { Menu, Phone, X } from "lucide-react";
import { Logo } from "./logo";
import { HOSPITAL_PHONE_DISPLAY, HOSPITAL_PHONE_TEL } from "./contact";

const navLinks = [
  { id: "home", label: "Home" },
  { id: "departments", label: "Departments" },
  { id: "doctors", label: "Our Doctors" },
  { id: "how-it-works", label: "How it works" },
  { id: "about", label: "About" },
];

interface SiteHeaderProps {
  /** Role dashboard for a signed-in user; null for guests. */
  dashboardHref: string | null;
  /** Booking entry point: the doctors directory, or sign-in first for guests. */
  bookHref: string;
}

export default function SiteHeader({ dashboardHref, bookHref }: SiteHeaderProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [active, setActive] = useState("home");
  // After a nav click, hold the clicked link while smooth scrolling passes other sections.
  const lockUntil = useRef(0);

  const selectLink = (id: string, clickedAt: number) => {
    setActive(id);
    lockUntil.current = clickedAt + 1000;
    setMenuOpen(false);
  };

  // Highlight the nav link for the section currently under the header.
  useEffect(() => {
    let frame = 0;
    const update = () => {
      frame = 0;
      if (performance.now() < lockUntil.current) return;
      const atBottom = window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 4;
      if (atBottom) {
        setActive(navLinks[navLinks.length - 1].id);
        return;
      }
      // Nav order differs from page order, so pick the passed section nearest the header.
      let current = "home";
      let nearest = -Infinity;
      for (const { id } of navLinks) {
        const top = document.getElementById(id)?.getBoundingClientRect().top;
        if (top !== undefined && top <= 120 && top > nearest) {
          nearest = top;
          current = id;
        }
      }
      setActive(current);
    };
    const onScroll = () => {
      if (!frame) frame = requestAnimationFrame(update);
    };
    update();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
      if (frame) cancelAnimationFrame(frame);
    };
  }, []);

  // Close the mobile menu when the viewport grows into the desktop layout.
  useEffect(() => {
    const mq = window.matchMedia("(min-width: 1024px)");
    const onChange = () => mq.matches && setMenuOpen(false);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  const accountLink = dashboardHref
    ? { href: dashboardHref, label: "My Dashboard" }
    : { href: "/login", label: "Sign in" };

  return (
    <header className="sticky top-0 z-40 border-b border-[#e8edf5] bg-white/95 backdrop-blur-md">
      <div className="mx-auto flex h-[72px] max-w-[1200px] items-center justify-between gap-6 px-5 sm:px-8">
        <a href="#home" aria-label="Medrella home" className="shrink-0">
          <Logo />
        </a>

        <nav aria-label="Primary" className="hidden h-full items-center gap-6 lg:flex xl:gap-9">
          {navLinks.map((link) => (
            <a
              key={link.id}
              href={`#${link.id}`}
              onClick={(e) => selectLink(link.id, e.timeStamp)}
              aria-current={active === link.id ? "true" : undefined}
              className={`relative flex h-full items-center whitespace-nowrap text-[13.5px] font-medium transition-colors ${
                active === link.id
                  ? "text-[#1769e8] after:absolute after:inset-x-0 after:bottom-0 after:h-[2px] after:rounded-full after:bg-[#1769e8]"
                  : "text-[#3b4a63] hover:text-[#1769e8]"
              }`}
            >
              {link.label}
            </a>
          ))}
        </nav>

        <div className="hidden shrink-0 items-center gap-3 lg:flex xl:gap-5">
          <a
            href={HOSPITAL_PHONE_TEL}
            className="hidden items-center gap-2 whitespace-nowrap text-[13px] font-semibold text-[#14243d] transition-colors hover:text-[#1769e8] xl:flex"
          >
            <Phone className="h-4 w-4 text-[#1769e8]" aria-hidden />
            {HOSPITAL_PHONE_DISPLAY}
          </a>
          <Link
            href={accountLink.href}
            className="whitespace-nowrap rounded-lg border border-[#1769e8]/40 px-4 py-2 text-[13px] font-semibold text-[#1769e8] transition hover:bg-[#f0f6ff]"
          >
            {accountLink.label}
          </Link>
          <Link
            href={bookHref}
            className="whitespace-nowrap rounded-lg border border-[#1769e8] bg-[#1769e8] px-4 py-2 text-[13px] font-semibold text-white shadow-sm transition hover:border-[#0d54c6] hover:bg-[#0d54c6]"
          >
            Book an appointment
          </Link>
        </div>

        <div className="flex items-center gap-2 lg:hidden">
          <Link href={bookHref} className="rounded-lg bg-[#1769e8] px-3.5 py-2 text-[13px] font-semibold text-white">
            Book
          </Link>
          <button
            type="button"
            onClick={() => setMenuOpen((open) => !open)}
            aria-expanded={menuOpen}
            aria-controls="mobile-nav"
            aria-label={menuOpen ? "Close menu" : "Open menu"}
            className="rounded-lg p-2 text-[#14243d] hover:bg-[#f2f6fd]"
          >
            {menuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </div>
      </div>

      {menuOpen && (
        <div id="mobile-nav" className="border-t border-[#e8edf5] bg-white px-5 pb-5 pt-3 shadow-lg sm:px-8 lg:hidden">
          <nav aria-label="Mobile" className="flex flex-col">
            {navLinks.map((link) => (
              <a
                key={link.id}
                href={`#${link.id}`}
                onClick={(e) => selectLink(link.id, e.timeStamp)}
                aria-current={active === link.id ? "true" : undefined}
                className={`py-2.5 text-sm font-medium ${active === link.id ? "text-[#1769e8]" : "text-[#3b4a63]"}`}
              >
                {link.label}
              </a>
            ))}
          </nav>
          <div className="mt-3 flex flex-col gap-2.5 border-t border-[#e8edf5] pt-4">
            <a href={HOSPITAL_PHONE_TEL} className="flex items-center gap-2 text-sm font-semibold text-[#14243d]">
              <Phone className="h-4 w-4 text-[#1769e8]" aria-hidden />
              {HOSPITAL_PHONE_DISPLAY}
            </a>
            <Link
              href={accountLink.href}
              className="w-full rounded-lg border border-[#1769e8]/40 py-2.5 text-center text-sm font-semibold text-[#1769e8]"
            >
              {accountLink.label}
            </Link>
          </div>
        </div>
      )}
    </header>
  );
}

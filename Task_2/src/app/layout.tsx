import type { Metadata, Viewport } from "next";
import "./globals.css";
import { getCurrentUser } from "@/actions/auth";
import { ClinicalShell } from "@/components/clinical-shell";

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
  viewportFit: "cover",
};

export const metadata: Metadata = {
  title: {
    default: "Medrella Healthcare — Clinical Appointment System",
    template: "%s | Medrella Healthcare",
  },
  description: "Next.js outpatient hospital appointment scheduling application for Pearl Thoughts Task 2",
  icons: {
    icon: "/favicon.ico",
    apple: "/images/medrella-logo.png",
  },
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const user = await getCurrentUser();

  return (
    // data-scroll-behavior lets Next.js turn off smooth scrolling during route changes (landing page uses it for section links).
    <html lang="en" className="h-full antialiased" data-scroll-behavior="smooth">
      <body className="min-h-screen bg-[#f6f8fb] text-[#14243d]">
        <ClinicalShell user={user}>{children}</ClinicalShell>
      </body>
    </html>
  );
}
